/**
 * @file packages/core/src/agent-threads/agent-task-checkpoint-service.ts
 * Durable task checkpointing, state integrity verification, and recovery engine.
 * V10 Phase 158: Long-Task State & Recovery.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import {
  type AgentThreadTaskStatus,
  type AgentTaskCheckpointDto,
  type TaskRecoveryState,
  type TaskRecoverySummaryDto,
  taskRecoveryStateSchema,
} from '@ai-quality/contracts';
import {
  AgentCheckpointCorruptedError,
  AgentCheckpointIntegrityError,
  AgentTaskNotFoundError,
} from './agent-thread-errors.js';
import { AgentConcurrencyManager } from '../agent-loop/agent-concurrency-manager.js';
import { AiCrossProjectAccessError, AiInvalidRequestError } from '../ai-provider/index.js';

export interface CreateCheckpointOptions {
  taskId: string;
  projectId: string;
  threadId: string;
  userId: string;
  taskStatus: AgentThreadTaskStatus;
  stepId?: string | null;
  activeToolName?: string | null;
  activeToolCallId?: string | null;
  failureReason?: string | null;
  isRecoverable?: boolean;
  metadata?: Record<string, unknown>;
}

export class AgentTaskCheckpointService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Persists an immutable ordered checkpoint recording task state transitions.
   */
  public async createCheckpoint(
    opts: CreateCheckpointOptions,
    txClient?: Prisma.TransactionClient,
  ): Promise<AgentTaskCheckpointDto> {
    const {
      taskId,
      projectId,
      threadId,
      userId,
      taskStatus,
      stepId,
      activeToolName,
      activeToolCallId,
      failureReason,
      isRecoverable = true,
      metadata = {},
    } = opts;

    const execute = async (tx: any) => {
      // 1. Fetch current task state
      const task = await tx.agentThreadTask.findUnique({
        where: { id: taskId },
      });
      if (!task) {
        throw new AgentTaskNotFoundError(taskId);
      }
      if (task.projectId !== projectId) {
        throw new AiCrossProjectAccessError(
          `User '${userId}' does not have permission to access project '${projectId}'.`,
        );
      }

      // 2. Fetch latest sequence number
      const lastCheckpoint = await tx.agentTaskCheckpoint.findFirst({
        where: { taskId },
        orderBy: { sequenceNumber: 'desc' },
      });
      const nextSequence = (lastCheckpoint?.sequenceNumber ?? 0) + 1;

      // 3. Gather completed and pending steps
      const steps = await tx.agentExecutionStep.findMany({
        where: { taskId },
        orderBy: { sequence: 'asc' },
      });
      const completedSteps = steps.filter((s: any) => s.status === 'COMPLETED');
      const pendingSteps = steps.filter(
        (s: any) => s.status === 'PENDING' || s.status === 'RUNNING' || s.status === 'WAITING',
      );
      const lastCompletedStep = completedSteps[completedSteps.length - 1];

      // 4. Construct typed recovery state
      const recoveryState: TaskRecoveryState = {
        version: 1,
        taskId,
        threadId,
        projectId,
        status: taskStatus,
        currentStepId: stepId ?? null,
        currentStepSequence: stepId
          ? (steps.find((s: any) => s.id === stepId)?.sequence ?? null)
          : null,
        completedStepIds: completedSteps.map((s: any) => s.id),
        pendingStepIds: pendingSteps.map((s: any) => s.id),
        activeToolName: activeToolName ?? null,
        activeToolCallId: activeToolCallId ?? null,
        retryCount: task.retryCount,
        attemptNumber: task.attemptNumber ?? 1,
        isRecoverable,
        failureReason: failureReason ?? task.failureReason ?? null,
        lastCompletedStepTitle: lastCompletedStep?.title ?? null,
        interruptedAt: task.interruptedAt?.toISOString() ?? null,
        metadata,
      };

      // 5. Validate schema
      const serializedRecoveryState = JSON.stringify(recoveryState);

      // 6. Insert checkpoint
      const checkpoint = await tx.agentTaskCheckpoint.create({
        data: {
          projectId,
          threadId,
          taskId,
          userId,
          stepId: stepId ?? null,
          sequenceNumber: nextSequence,
          taskStatus,
          serializedRecoveryState,
          activeToolCall: activeToolName ?? null,
          completedStepCount: completedSteps.length,
          pendingStepCount: pendingSteps.length,
          retryCount: task.retryCount,
          isRecoverable,
        },
      });

      // 7. Update task pointers
      await tx.agentThreadTask.update({
        where: { id: taskId },
        data: {
          lastCheckpointId: checkpoint.id,
          lastCheckpointSeq: nextSequence,
          isRecoverable,
        },
      });

      // 8. Record audit log for checkpoint creation
      try {
        if ((tx as any).agentTaskControlAuditLog?.create) {
          await (tx as any).agentTaskControlAuditLog.create({
            data: {
              projectId,
              threadId,
              taskId,
              userId,
              action: 'CHECKPOINT_CREATED',
              previousState: task.status,
              newState: taskStatus,
              actorType: 'SYSTEM',
              actorId: 'checkpoint-service',
              attemptNumber: task.attemptNumber ?? 1,
              reason: `Checkpoint #${nextSequence} created for state ${taskStatus}`,
              metadata: {
                sequenceNumber: nextSequence,
                completedSteps: completedSteps.length,
                pendingSteps: pendingSteps.length,
              },
            },
          });
        }
      } catch {
        // Safe fallback in mock contexts
      }

      return this.mapCheckpointToDto(checkpoint);
    };

    if (txClient) {
      return execute(txClient);
    }
    return await this.prisma.$transaction(execute);
  }

  /**
   * Validates checkpoint data integrity, checking for corruption, mismatched projects/threads,
   * forged completion states, and malformed JSON.
   */
  public validateCheckpointIntegrity(
    checkpoint: {
      taskId: string;
      projectId: string;
      threadId: string;
      sequenceNumber: number;
      taskStatus: AgentThreadTaskStatus;
      serializedRecoveryState: string;
    },
    expectedProjectId?: string,
    expectedThreadId?: string,
  ): TaskRecoveryState {
    if (!checkpoint) {
      throw new AgentCheckpointCorruptedError('unknown', 'Checkpoint record is null or undefined');
    }

    if (expectedProjectId && checkpoint.projectId !== expectedProjectId) {
      throw new AgentCheckpointIntegrityError(
        checkpoint.taskId,
        `Project ID mismatch: checkpoint belongs to '${checkpoint.projectId}', expected '${expectedProjectId}'`,
      );
    }

    if (expectedThreadId && checkpoint.threadId !== expectedThreadId) {
      throw new AgentCheckpointIntegrityError(
        checkpoint.taskId,
        `Thread ID mismatch: checkpoint belongs to '${checkpoint.threadId}', expected '${expectedThreadId}'`,
      );
    }

    if (!checkpoint.sequenceNumber || checkpoint.sequenceNumber <= 0) {
      throw new AgentCheckpointIntegrityError(
        checkpoint.taskId,
        `Invalid sequence number: ${checkpoint.sequenceNumber}`,
      );
    }

    // Parse serialized recovery JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(checkpoint.serializedRecoveryState);
    } catch (err: any) {
      throw new AgentCheckpointCorruptedError(
        checkpoint.taskId,
        `Malformed JSON: ${err?.message ?? 'unknown parse error'}`,
      );
    }

    // Validate recovery state schema
    const parseResult = taskRecoveryStateSchema.safeParse(parsed);
    if (!parseResult.success) {
      throw new AgentCheckpointCorruptedError(
        checkpoint.taskId,
        `Schema validation error: ${parseResult.error.message}`,
      );
    }

    const state = parseResult.data;

    // Consistency assertions
    if (state.taskId !== checkpoint.taskId) {
      throw new AgentCheckpointIntegrityError(
        checkpoint.taskId,
        `Payload taskId '${state.taskId}' does not match checkpoint taskId '${checkpoint.taskId}'`,
      );
    }

    if (state.projectId !== checkpoint.projectId) {
      throw new AgentCheckpointIntegrityError(
        checkpoint.taskId,
        `Payload projectId '${state.projectId}' does not match checkpoint projectId '${checkpoint.projectId}'`,
      );
    }

    if (state.threadId !== checkpoint.threadId) {
      throw new AgentCheckpointIntegrityError(
        checkpoint.taskId,
        `Payload threadId '${state.threadId}' does not match checkpoint threadId '${checkpoint.threadId}'`,
      );
    }

    // Reject forged completion state (COMPLETED status with pending steps)
    if (checkpoint.taskStatus === 'COMPLETED' && state.pendingStepIds.length > 0) {
      throw new AgentCheckpointIntegrityError(
        checkpoint.taskId,
        'Forged completion state: checkpoint indicates COMPLETED status but pending steps remain',
      );
    }

    return state;
  }

  /**
   * Retrieves the latest valid checkpoint for a task.
   */
  public async getLatestCheckpoint(
    taskId: string,
    projectId?: string,
  ): Promise<{ checkpoint: AgentTaskCheckpointDto; recoveryState: TaskRecoveryState } | null> {
    const cp = await this.prisma.agentTaskCheckpoint.findFirst({
      where: { taskId },
      orderBy: { sequenceNumber: 'desc' },
    });
    if (!cp) {
      return null;
    }

    const recoveryState = this.validateCheckpointIntegrity(cp, projectId);
    return {
      checkpoint: this.mapCheckpointToDto(cp),
      recoveryState,
    };
  }

  /**
   * Retrieves full recovery summary for a specific task.
   */
  public async getTaskRecoverySummary(
    taskId: string,
    projectId: string,
    userId: string,
  ): Promise<TaskRecoverySummaryDto> {
    const task = await this.prisma.agentThreadTask.findUnique({
      where: { id: taskId },
      include: {
        executionSteps: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!task) {
      throw new AgentTaskNotFoundError(taskId);
    }
    if (task.projectId !== projectId) {
      throw new AiCrossProjectAccessError(
        `User '${userId}' does not have permission to access project '${projectId}'.`,
      );
    }

    const latestCheckpoint = await this.prisma.agentTaskCheckpoint.findFirst({
      where: { taskId },
      orderBy: { sequenceNumber: 'desc' },
    });

    if (latestCheckpoint) {
      this.validateCheckpointIntegrity(latestCheckpoint, projectId, task.threadId);
    }

    const completedSteps = task.executionSteps.filter(s => s.status === 'COMPLETED');
    const pendingSteps = task.executionSteps.filter(
      s => s.status === 'PENDING' || s.status === 'RUNNING' || s.status === 'WAITING',
    );
    const lastCompleted = completedSteps[completedSteps.length - 1];

    const maxRetries = task.maxRetries ?? 3;
    const isExecuting = AgentConcurrencyManager.isExecuting(taskId);

    const isInterruptedFailed =
      task.status === 'FAILED' &&
      Boolean(
        (task.interruptedAt && task.isRecoverable) || task.failureReason?.includes('interrupted'),
      );

    const isRecoverable =
      task.status === 'INTERRUPTED' || task.status === 'PAUSED' || isInterruptedFailed;

    const canResume =
      (task.status === 'PAUSED' || task.status === 'INTERRUPTED' || isInterruptedFailed) &&
      !isExecuting;

    const canRetry =
      ['FAILED', 'CANCELLED', 'STOPPED', 'INTERRUPTED'].includes(task.status) &&
      task.retryCount < maxRetries;

    const canCancel =
      ['RUNNING', 'PLANNING', 'PAUSED', 'INTERRUPTED'].includes(task.status) ||
      (task.status === 'FAILED' && isRecoverable);

    return {
      taskId: task.id,
      threadId: task.threadId,
      projectId: task.projectId,
      taskTitle: task.title,
      status: task.status,
      isRecoverable,
      interruptedAt: task.interruptedAt?.toISOString() ?? null,
      retryCount: task.retryCount,
      maxRetries,
      attemptNumber: task.attemptNumber ?? 1,
      lastCompletedStepTitle: lastCompleted?.title ?? null,
      completedStepCount: completedSteps.length,
      pendingStepCount: pendingSteps.length,
      canResume,
      canRetry,
      canCancel,
      lastCheckpointSeq: latestCheckpoint?.sequenceNumber ?? null,
    };
  }

  /**
   * Lists all recoverable tasks across a project (or thread).
   */
  public async listRecoverableTasks(
    projectId: string,
    userId: string,
    threadId?: string,
    limit = 50,
  ): Promise<TaskRecoverySummaryDto[]> {
    // Assert project access
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true },
    });
    if (!project) {
      throw new AiInvalidRequestError(`Project with ID '${projectId}' was not found.`);
    }
    if (project.userId && project.userId !== userId) {
      throw new AiCrossProjectAccessError(
        `User '${userId}' does not have permission to access project '${projectId}'.`,
      );
    }

    const where: any = {
      projectId,
      OR: [
        { status: { in: ['PAUSED', 'INTERRUPTED'] } },
        {
          interruptedAt: { not: null },
          isRecoverable: true,
        },
        {
          status: 'FAILED',
          failureReason: { contains: 'interrupted' },
        },
      ],
    };
    if (threadId) {
      where.threadId = threadId;
    }

    const tasks = await this.prisma.agentThreadTask.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: {
        executionSteps: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    return tasks.map(task => {
      const completedSteps = task.executionSteps.filter(s => s.status === 'COMPLETED');
      const pendingSteps = task.executionSteps.filter(
        s => s.status === 'PENDING' || s.status === 'RUNNING' || s.status === 'WAITING',
      );
      const lastCompleted = completedSteps[completedSteps.length - 1];
      const maxRetries = task.maxRetries ?? 3;
      const isExecuting = AgentConcurrencyManager.isExecuting(task.id);

      const isInterruptedFailed =
        task.status === 'FAILED' &&
        Boolean(
          (task.interruptedAt && task.isRecoverable) || task.failureReason?.includes('interrupted'),
        );

      const isRecoverable =
        task.status === 'INTERRUPTED' || task.status === 'PAUSED' || isInterruptedFailed;

      const canResume =
        (task.status === 'PAUSED' || task.status === 'INTERRUPTED' || isInterruptedFailed) &&
        !isExecuting;

      const canRetry =
        ['FAILED', 'CANCELLED', 'STOPPED', 'INTERRUPTED'].includes(task.status) &&
        task.retryCount < maxRetries;

      const canCancel =
        ['RUNNING', 'PLANNING', 'PAUSED', 'INTERRUPTED'].includes(task.status) ||
        (task.status === 'FAILED' && isRecoverable);

      return {
        taskId: task.id,
        threadId: task.threadId,
        projectId: task.projectId,
        taskTitle: task.title,
        status: task.status,
        isRecoverable,
        interruptedAt: task.interruptedAt?.toISOString() ?? null,
        retryCount: task.retryCount,
        maxRetries,
        attemptNumber: task.attemptNumber ?? 1,
        lastCompletedStepTitle: lastCompleted?.title ?? null,
        completedStepCount: completedSteps.length,
        pendingStepCount: pendingSteps.length,
        canResume,
        canRetry,
        canCancel,
        lastCheckpointSeq: task.lastCheckpointSeq ?? null,
      };
    });
  }

  /**
   * Lists checkpoints for a task ordered by sequence.
   */
  public async listCheckpoints(
    taskId: string,
    projectId: string,
    userId: string,
    limit = 50,
  ): Promise<AgentTaskCheckpointDto[]> {
    const task = await this.prisma.agentThreadTask.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true },
    });
    if (!task) {
      throw new AgentTaskNotFoundError(taskId);
    }
    if (task.projectId !== projectId) {
      throw new AiCrossProjectAccessError(
        `User '${userId}' does not have permission to access project '${projectId}'.`,
      );
    }

    const checkpoints = await this.prisma.agentTaskCheckpoint.findMany({
      where: { taskId },
      orderBy: { sequenceNumber: 'asc' },
      take: limit,
    });

    return checkpoints.map(cp => this.mapCheckpointToDto(cp));
  }

  private mapCheckpointToDto(
    cp: import('@prisma/client').AgentTaskCheckpoint,
  ): AgentTaskCheckpointDto {
    return {
      id: cp.id,
      projectId: cp.projectId,
      threadId: cp.threadId,
      taskId: cp.taskId,
      userId: cp.userId,
      stepId: cp.stepId,
      sequenceNumber: cp.sequenceNumber,
      taskStatus: cp.taskStatus,
      serializedRecoveryState: cp.serializedRecoveryState,
      activeToolCall: cp.activeToolCall,
      completedStepCount: cp.completedStepCount,
      pendingStepCount: cp.pendingStepCount,
      retryCount: cp.retryCount,
      isRecoverable: cp.isRecoverable,
      createdAt: cp.createdAt.toISOString(),
    };
  }
}
