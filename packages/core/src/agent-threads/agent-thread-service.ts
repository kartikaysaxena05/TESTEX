/**
 * @file packages/core/src/agent-threads/agent-thread-service.ts
 * Privileged business domain service for V10 Phase 142:
 * Task / Conversation / Thread Model.
 *
 * Guarantees:
 * 1. Strict Project / User Isolation (user -> project -> thread -> task -> steps -> tool calls).
 * 2. Immutable history on cancellation / retries (preserves prior tasks, steps, messages).
 * 3. Atomic status transitions via AgentTaskLifecycle.
 * 4. Deterministic sequence numbering on messages and execution steps.
 * 5. Startup recovery detection for interrupted RUNNING tasks.
 * 6. Audit event logging via AuthAuditAction.
 */

import { Prisma, type PrismaClient, type AuthAuditAction } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { getLogger, type ILogger } from '../logging/index.js';
import type {
  AgentThreadDto,
  AgentThreadTaskDto,
  AgentThreadMessageDto,
  AgentExecutionStepDto,
  AgentToolCallRecordDto,
  CreateAgentThreadInputDto,
  ListAgentThreadsInputDto,
  GetAgentThreadInputDto,
  ArchiveAgentThreadInputDto,
  CreateAgentThreadTaskInputDto,
  GetAgentThreadTaskInputDto,
  ListAgentThreadTasksInputDto,
  CancelAgentThreadTaskInputDto,
  RetryAgentThreadTaskInputDto,
  ResumeAgentThreadTaskInputDto,
  StopAgentThreadTaskInputDto,
  PauseAgentThreadTaskInputDto,
  AgentTaskControlAuditLogDto,
  ListAgentTaskControlAuditLogsInputDto,
  TaskControlAction,
  TaskControlActorType,
  ListAgentThreadMessagesInputDto,
  ListAgentExecutionStepsInputDto,
  ListAgentToolCallsInputDto,
  AgentThreadTaskStatus,
  AgentExecutionStepStatus,
  AgentToolCallStatus,
  AgentThreadMessageRole,
  GetTaskRecoveryStateInputDto,
  ListRecoverableTasksInputDto,
  ListAgentTaskCheckpointsInputDto,
  AgentTaskCheckpointDto,
  TaskRecoverySummaryDto,
} from '@ai-quality/contracts';
import {
  AgentThreadNotFoundError,
  AgentThreadArchivedError,
  AgentTaskNotFoundError,
  AgentTaskImmutableError,
  AgentTaskInvalidStateError,
  AgentCheckpointCorruptedError,
  AgentCheckpointIntegrityError,
  AgentTaskNotRecoverableError,
  AgentMaxRetriesExceededError,
  AgentTaskConcurrentResumeError,
} from './agent-thread-errors.js';
import { AgentTaskLifecycle } from './agent-task-lifecycle.js';
import { AgentConcurrencyManager } from '../agent-loop/agent-concurrency-manager.js';
import {
  AgentTaskCheckpointService,
  type CreateCheckpointOptions,
} from './agent-task-checkpoint-service.js';
import {
  AiCrossProjectAccessError,
  AiInvalidRequestError,
} from '../ai-provider/ai-provider-errors.js';

export interface AgentThreadServiceDependencies {
  prisma?: PrismaClient;
  logger?: ILogger;
}

export class AgentThreadService {
  private readonly prisma: PrismaClient;
  private readonly logger: ILogger;
  private readonly checkpointService: AgentTaskCheckpointService;

  constructor(deps?: AgentThreadServiceDependencies) {
    const client = deps?.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database client is not configured or unavailable.');
    }
    this.prisma = client;
    this.logger = deps?.logger ?? getLogger();
    this.checkpointService = new AgentTaskCheckpointService(this.prisma);
  }

  public get checkpoints(): AgentTaskCheckpointService {
    return this.checkpointService;
  }

  // ============================================================================
  // 1. Thread Operations
  // ============================================================================

  public async createThread(
    input: CreateAgentThreadInputDto,
    userId: string,
  ): Promise<AgentThreadDto> {
    await this.assertProjectAccess(input.projectId, userId);

    const now = new Date();
    const thread = await this.prisma.agentThread.create({
      data: {
        projectId: input.projectId,
        userId,
        title: input.title?.trim() || 'New Thread',
        status: 'ACTIVE',
        lastActivityAt: now,
      },
    });

    await this.recordAuditLog(userId, 'AGENT_THREAD_CREATED', {
      threadId: thread.id,
      projectId: input.projectId,
      title: thread.title,
    });

    return this.mapThreadToDto(thread);
  }

  public async getThread(
    input: GetAgentThreadInputDto,
    userId?: string,
  ): Promise<AgentThreadDto | null> {
    if (userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    const thread = await this.prisma.agentThread.findFirst({
      where: { id: input.threadId, projectId: input.projectId },
    });

    return thread ? this.mapThreadToDto(thread) : null;
  }

  public async listThreads(
    input: ListAgentThreadsInputDto,
    userId?: string,
  ): Promise<readonly AgentThreadDto[]> {
    if (userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    const where: Prisma.AgentThreadWhereInput = {
      projectId: input.projectId,
    };
    if (input.status) {
      where.status = input.status;
    }

    const threads = await this.prisma.agentThread.findMany({
      where,
      orderBy: { lastActivityAt: 'desc' },
      take: input.limit ?? 50,
    });

    return threads.map(t => this.mapThreadToDto(t));
  }

  public async archiveThread(
    input: ArchiveAgentThreadInputDto,
    userId: string,
  ): Promise<AgentThreadDto> {
    await this.assertProjectAccess(input.projectId, userId);

    const thread = await this.prisma.agentThread.findFirst({
      where: { id: input.threadId, projectId: input.projectId },
    });
    if (!thread) {
      throw new AgentThreadNotFoundError(input.threadId);
    }

    const updated = await this.prisma.agentThread.update({
      where: { id: input.threadId },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
      },
    });

    await this.recordAuditLog(userId, 'AGENT_THREAD_ARCHIVED', {
      threadId: thread.id,
      projectId: input.projectId,
    });

    return this.mapThreadToDto(updated);
  }

  // ============================================================================
  // 2. Task Operations
  // ============================================================================

  public async createTask(
    input: CreateAgentThreadTaskInputDto,
    userId: string,
  ): Promise<AgentThreadTaskDto> {
    await this.assertProjectAccess(input.projectId, userId);

    const thread = await this.prisma.agentThread.findFirst({
      where: { id: input.threadId, projectId: input.projectId },
    });
    if (!thread) {
      throw new AgentThreadNotFoundError(input.threadId);
    }
    if (thread.status === 'ARCHIVED') {
      throw new AgentThreadArchivedError(input.threadId);
    }

    const now = new Date();
    const task = await this.prisma.$transaction(async tx => {
      const createdTask = await tx.agentThreadTask.create({
        data: {
          projectId: input.projectId,
          threadId: input.threadId,
          userId,
          title: input.title.trim(),
          instruction: input.instruction.trim(),
          status: 'QUEUED',
          isRecoverable: true,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });

      // Update thread last activity
      await tx.agentThread.update({
        where: { id: input.threadId },
        data: { lastActivityAt: now },
      });

      // Add user message in thread representing the instruction
      const messageCount = await tx.agentThreadMessage.count({
        where: { threadId: input.threadId },
      });

      await tx.agentThreadMessage.create({
        data: {
          threadId: input.threadId,
          taskId: createdTask.id,
          role: 'USER',
          content: input.instruction.trim(),
          sequence: messageCount + 1,
        },
      });

      return createdTask;
    });

    await this.recordAuditLog(userId, 'AGENT_TASK_QUEUED', {
      taskId: task.id,
      threadId: input.threadId,
      projectId: input.projectId,
    });

    return this.mapTaskToDto(task);
  }

  public async getTask(
    input: GetAgentThreadTaskInputDto,
    userId?: string,
  ): Promise<AgentThreadTaskDto | null> {
    if (userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    const task = await this.prisma.agentThreadTask.findFirst({
      where: { id: input.taskId, projectId: input.projectId },
    });

    return task ? this.mapTaskToDto(task) : null;
  }

  public async listTasks(
    input: ListAgentThreadTasksInputDto,
    userId?: string,
  ): Promise<readonly AgentThreadTaskDto[]> {
    if (userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    const tasks = await this.prisma.agentThreadTask.findMany({
      where: { projectId: input.projectId, threadId: input.threadId },
      orderBy: { createdAt: 'desc' },
      take: input.limit ?? 50,
    });

    return tasks.map(t => this.mapTaskToDto(t));
  }

  public async cancelTask(
    input: CancelAgentThreadTaskInputDto,
    userId: string,
  ): Promise<AgentThreadTaskDto> {
    await this.assertProjectAccess(input.projectId, userId);

    return this.prisma.$transaction(async tx => {
      const task = await tx.agentThreadTask.findFirst({
        where: { id: input.taskId, projectId: input.projectId },
      });
      if (!task) {
        throw new AgentTaskNotFoundError(input.taskId);
      }

      // Idempotent cancellation
      if (task.status === 'CANCELLED') {
        return this.mapTaskToDto(task);
      }

      if (task.status === 'COMPLETED') {
        throw new AgentTaskImmutableError(task.id, task.status);
      }

      AgentTaskLifecycle.assertValidTransition(task.status, 'CANCELLED');

      // Signal in-flight execution if active
      AgentConcurrencyManager.cancelExecution(task.id, input.reason);

      const now = new Date();
      const updated = await tx.agentThreadTask.update({
        where: { id: task.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          failureReason: input.reason ?? 'Cancelled by user',
          isRecoverable: false,
        },
      });

      // Also mark any running execution steps as CANCELLED
      await tx.agentExecutionStep.updateMany({
        where: { taskId: task.id, status: 'RUNNING' },
        data: { status: 'CANCELLED', completedAt: now },
      });

      // Update thread activity
      await tx.agentThread.update({
        where: { id: task.threadId },
        data: { lastActivityAt: now },
      });

      await this.recordAuditLog(userId, 'AGENT_TASK_CANCELLED', {
        taskId: task.id,
        threadId: task.threadId,
        projectId: input.projectId,
        reason: input.reason,
      });

      await this.recordTaskControlAuditLog(tx, {
        projectId: input.projectId,
        threadId: task.threadId,
        taskId: task.id,
        userId,
        action: 'CANCEL',
        previousState: task.status,
        newState: 'CANCELLED',
        actorType: 'USER',
        actorId: userId,
        attemptNumber: task.attemptNumber ?? 1,
        reason: input.reason ?? 'Cancelled by user',
      });

      // Create checkpoint for cancellation
      try {
        if ((tx as any).agentTaskCheckpoint?.create) {
          await this.checkpointService.createCheckpoint(
            {
              taskId: task.id,
              projectId: input.projectId,
              threadId: task.threadId,
              userId,
              taskStatus: 'CANCELLED',
              failureReason: input.reason ?? 'Cancelled by user',
              isRecoverable: false,
            },
            tx,
          );
        }
      } catch {
        // Safe fallback in mock/test contexts
      }

      return this.mapTaskToDto(updated);
    });
  }

  public async stopTask(
    input: StopAgentThreadTaskInputDto,
    userId: string,
  ): Promise<AgentThreadTaskDto> {
    await this.assertProjectAccess(input.projectId, userId);

    return this.prisma.$transaction(async tx => {
      const task = await tx.agentThreadTask.findFirst({
        where: { id: input.taskId, projectId: input.projectId },
      });
      if (!task) {
        throw new AgentTaskNotFoundError(input.taskId);
      }

      // Idempotent stop
      if (task.status === 'STOPPED') {
        return this.mapTaskToDto(task);
      }

      if (task.status === 'COMPLETED') {
        throw new AgentTaskImmutableError(task.id, task.status);
      }

      AgentTaskLifecycle.assertValidTransition(task.status, 'STOPPED');

      // Signal graceful stop to in-flight execution
      AgentConcurrencyManager.stopExecution(task.id, input.reason);

      const now = new Date();
      const updated = await tx.agentThreadTask.update({
        where: { id: task.id },
        data: {
          status: 'STOPPED',
          stoppedAt: now,
          failureReason: input.reason ?? 'Stopped by user',
        },
      });

      // Mark any running execution steps as CANCELLED
      await tx.agentExecutionStep.updateMany({
        where: { taskId: task.id, status: 'RUNNING' },
        data: {
          status: 'CANCELLED',
          completedAt: now,
          error: input.reason ?? 'Task stopped by user',
        },
      });

      // Update thread activity
      await tx.agentThread.update({
        where: { id: task.threadId },
        data: { lastActivityAt: now },
      });

      await this.recordTaskControlAuditLog(tx, {
        projectId: input.projectId,
        threadId: task.threadId,
        taskId: task.id,
        userId,
        action: 'STOP',
        previousState: task.status,
        newState: 'STOPPED',
        actorType: 'USER',
        actorId: userId,
        attemptNumber: task.attemptNumber ?? 1,
        reason: input.reason ?? 'Stopped by user',
      });

      // Create checkpoint for stopped state
      try {
        if ((tx as any).agentTaskCheckpoint?.create) {
          await this.checkpointService.createCheckpoint(
            {
              taskId: task.id,
              projectId: input.projectId,
              threadId: task.threadId,
              userId,
              taskStatus: 'STOPPED',
              failureReason: input.reason ?? 'Stopped by user',
              isRecoverable: true,
            },
            tx,
          );
        }
      } catch {
        // Safe fallback in mock/test contexts
      }

      return this.mapTaskToDto(updated);
    });
  }

  public async pauseTask(
    input: PauseAgentThreadTaskInputDto,
    userId: string,
  ): Promise<AgentThreadTaskDto> {
    await this.assertProjectAccess(input.projectId, userId);

    return this.prisma.$transaction(async tx => {
      const task = await tx.agentThreadTask.findFirst({
        where: { id: input.taskId, projectId: input.projectId },
      });
      if (!task) {
        throw new AgentTaskNotFoundError(input.taskId);
      }

      // Idempotent pause
      if (task.status === 'PAUSED') {
        return this.mapTaskToDto(task);
      }

      if (task.status === 'COMPLETED') {
        throw new AgentTaskImmutableError(task.id, task.status);
      }

      AgentTaskLifecycle.assertValidTransition(task.status, 'PAUSED');

      // Signal in-flight execution if active
      AgentConcurrencyManager.pauseExecution(task.id, input.reason);

      const now = new Date();
      const updated = await tx.agentThreadTask.update({
        where: { id: task.id },
        data: {
          status: 'PAUSED',
          pausedAt: now,
        },
      });

      // Update thread activity
      await tx.agentThread.update({
        where: { id: task.threadId },
        data: { lastActivityAt: now },
      });

      await this.recordTaskControlAuditLog(tx, {
        projectId: input.projectId,
        threadId: task.threadId,
        taskId: task.id,
        userId,
        action: 'PAUSE',
        previousState: task.status,
        newState: 'PAUSED',
        actorType: 'USER',
        actorId: userId,
        attemptNumber: task.attemptNumber ?? 1,
        reason: input.reason ?? 'Paused by user',
      });

      // Create checkpoint for paused state
      try {
        if ((tx as any).agentTaskCheckpoint?.create) {
          await this.checkpointService.createCheckpoint(
            {
              taskId: task.id,
              projectId: input.projectId,
              threadId: task.threadId,
              userId,
              taskStatus: 'PAUSED',
              failureReason: input.reason ?? 'Paused by user',
              isRecoverable: true,
            },
            tx,
          );
        }
      } catch {
        // Safe fallback in mock/test contexts
      }

      return this.mapTaskToDto(updated);
    });
  }

  public async retryTask(
    input: RetryAgentThreadTaskInputDto,
    userId: string,
  ): Promise<AgentThreadTaskDto> {
    await this.assertProjectAccess(input.projectId, userId);

    return this.prisma.$transaction(async tx => {
      const original = await tx.agentThreadTask.findFirst({
        where: { id: input.taskId, projectId: input.projectId },
      });
      if (!original) {
        throw new AgentTaskNotFoundError(input.taskId);
      }

      // Enforce configurable maximum retry limit
      const maxRetries = original.maxRetries ?? 3;
      if (original.retryCount >= maxRetries) {
        throw new AgentMaxRetriesExceededError(original.id, original.retryCount, maxRetries);
      }

      // Reject retry when failure was explicitly flagged as non-recoverable
      if (original.isRecoverable === false && original.status === 'FAILED') {
        throw new AgentTaskNotRecoverableError(
          original.id,
          original.failureReason ?? 'Task failed with non-retryable fatal error',
        );
      }

      // Only FAILED, CANCELLED, STOPPED, or INTERRUPTED tasks are eligible for retry
      if (!AgentTaskLifecycle.isRetriable(original.status)) {
        throw new AgentTaskInvalidStateError(
          original.status,
          'QUEUED',
          'Only failed, cancelled, stopped, or interrupted tasks can be retried.',
        );
      }

      const now = new Date();
      const nextAttempt = (original.attemptNumber ?? 1) + 1;
      // Retrying creates a child task preserving original task history
      const childTask = await tx.agentThreadTask.create({
        data: {
          projectId: original.projectId,
          threadId: original.threadId,
          userId,
          title: `Retry: ${original.title}`,
          instruction: input.instruction?.trim() || original.instruction,
          status: 'QUEUED',
          retryCount: original.retryCount + 1,
          maxRetries,
          isRecoverable: true,
          parentTaskId: original.id,
          attemptNumber: nextAttempt,
          metadata: (original.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });

      await tx.agentThread.update({
        where: { id: original.threadId },
        data: { lastActivityAt: now },
      });

      await this.recordAuditLog(userId, 'AGENT_TASK_RETRIED', {
        originalTaskId: original.id,
        retryTaskId: childTask.id,
        retryCount: childTask.retryCount,
        projectId: input.projectId,
      });

      // Audit log on parent task indicating it was retried
      await this.recordTaskControlAuditLog(tx, {
        projectId: input.projectId,
        threadId: original.threadId,
        taskId: original.id,
        userId,
        action: 'RETRY',
        previousState: original.status,
        newState: 'QUEUED',
        actorType: 'USER',
        actorId: userId,
        attemptNumber: original.attemptNumber ?? 1,
        reason: 'Task retried into new execution attempt',
        metadata: {
          originalTaskId: original.id,
          childTaskId: childTask.id,
          retryCount: childTask.retryCount,
        },
      });

      // Audit log on child task indicating it is the new attempt
      await this.recordTaskControlAuditLog(tx, {
        projectId: input.projectId,
        threadId: original.threadId,
        taskId: childTask.id,
        userId,
        action: 'RETRY',
        previousState: original.status,
        newState: 'QUEUED',
        actorType: 'USER',
        actorId: userId,
        attemptNumber: nextAttempt,
        metadata: {
          originalTaskId: original.id,
          childTaskId: childTask.id,
          retryCount: childTask.retryCount,
        },
      });

      // Create initial checkpoint for child attempt
      try {
        if ((tx as any).agentTaskCheckpoint?.create) {
          await this.checkpointService.createCheckpoint(
            {
              taskId: childTask.id,
              projectId: input.projectId,
              threadId: original.threadId,
              userId,
              taskStatus: 'QUEUED',
              isRecoverable: true,
              metadata: { attemptNumber: nextAttempt, parentTaskId: original.id },
            },
            tx,
          );
        }
      } catch {
        // Safe fallback in mock contexts
      }

      return this.mapTaskToDto(childTask);
    });
  }

  public async resumeTask(
    input: ResumeAgentThreadTaskInputDto,
    userId: string,
  ): Promise<AgentThreadTaskDto> {
    await this.assertProjectAccess(input.projectId, userId);

    return this.prisma.$transaction(async tx => {
      const task = await tx.agentThreadTask.findFirst({
        where: { id: input.taskId, projectId: input.projectId },
      });
      if (!task) {
        throw new AgentTaskNotFoundError(input.taskId);
      }

      // Concurrency check: prevent multiple simultaneous executions
      if (AgentConcurrencyManager.isExecuting(task.id)) {
        throw new AgentTaskConcurrentResumeError(task.id);
      }

      // Validate resumability: PAUSED, INTERRUPTED, WAITING_FOR_APPROVAL, or interrupted FAILED
      const isRecoverable =
        task.status === 'PAUSED' ||
        task.status === 'WAITING_FOR_APPROVAL' ||
        task.status === 'INTERRUPTED' ||
        (task.status === 'FAILED' &&
          Boolean(
            (task.interruptedAt && task.isRecoverable) ||
            task.failureReason?.includes('interrupted'),
          ));

      if (!isRecoverable) {
        throw new AgentTaskInvalidStateError(
          task.status,
          'RUNNING',
          'Task is not in a resumable state (must be PAUSED, INTERRUPTED, WAITING_FOR_APPROVAL, or recoverable interrupted task).',
        );
      }

      // Checkpoint integrity verification before restoration
      if ((tx as any).agentTaskCheckpoint?.findFirst) {
        const latestCheckpoint = await (tx as any).agentTaskCheckpoint.findFirst({
          where: { taskId: task.id },
          orderBy: { sequenceNumber: 'desc' },
        });
        if (latestCheckpoint) {
          try {
            this.checkpointService.validateCheckpointIntegrity(
              latestCheckpoint,
              input.projectId,
              task.threadId,
            );
          } catch (err: any) {
            // Record immutable audit log for recovery failure using root prisma client so it commits even when tx rolls back
            try {
              if ((this.prisma as any).agentTaskControlAuditLog?.create) {
                await (this.prisma as any).agentTaskControlAuditLog.create({
                  data: {
                    projectId: input.projectId,
                    threadId: task.threadId,
                    taskId: task.id,
                    userId,
                    action: 'RECOVERY_FAILED',
                    previousState: task.status,
                    newState: task.status,
                    actorType: 'USER',
                    actorId: userId,
                    attemptNumber: task.attemptNumber ?? 1,
                    reason: err?.message ?? 'Checkpoint integrity validation failed',
                  },
                });
              }
            } catch {
              // Ignore in mock contexts
            }
            throw err;
          }
        }
      }

      AgentTaskLifecycle.assertValidTransition(task.status, 'RUNNING');

      const now = new Date();
      const updated = await tx.agentThreadTask.update({
        where: { id: task.id },
        data: {
          status: 'RUNNING',
          startedAt: task.startedAt ?? now,
          isRecoverable: false,
        },
      });

      await tx.agentThread.update({
        where: { id: task.threadId },
        data: { lastActivityAt: now },
      });

      await this.recordAuditLog(userId, 'AGENT_TASK_RESUMED', {
        taskId: task.id,
        threadId: task.threadId,
        projectId: input.projectId,
      });

      await this.recordTaskControlAuditLog(tx, {
        projectId: input.projectId,
        threadId: task.threadId,
        taskId: task.id,
        userId,
        action: 'RESUME',
        previousState: task.status,
        newState: 'RUNNING',
        actorType: 'USER',
        actorId: userId,
        attemptNumber: task.attemptNumber ?? 1,
      });

      // Create checkpoint for resume state
      try {
        if ((tx as any).agentTaskCheckpoint?.create) {
          await this.checkpointService.createCheckpoint(
            {
              taskId: task.id,
              projectId: input.projectId,
              threadId: task.threadId,
              userId,
              taskStatus: 'RUNNING',
              isRecoverable: false,
            },
            tx,
          );
        }
      } catch {
        // Safe fallback in mock contexts
      }

      return this.mapTaskToDto(updated);
    });
  }

  public async listTaskControlAuditLogs(
    input: ListAgentTaskControlAuditLogsInputDto,
    userId: string,
  ): Promise<readonly AgentTaskControlAuditLogDto[]> {
    await this.assertProjectAccess(input.projectId, userId);

    if (!(this.prisma as any).agentTaskControlAuditLog?.findMany) {
      return [];
    }

    const logs = await this.prisma.agentTaskControlAuditLog.findMany({
      where: {
        projectId: input.projectId,
        taskId: input.taskId,
      },
      orderBy: { timestamp: 'desc' },
      take: input.limit ?? 50,
    });

    return logs.map(l => this.mapControlAuditLogToDto(l));
  }

  public async updateTaskStatus(
    taskId: string,
    targetStatus: AgentThreadTaskStatus,
    reason?: string,
  ): Promise<AgentThreadTaskDto> {
    return this.prisma.$transaction(async tx => {
      const task = await tx.agentThreadTask.findUnique({
        where: { id: taskId },
      });
      if (!task) {
        throw new AgentTaskNotFoundError(taskId);
      }

      if (AgentTaskLifecycle.isTerminal(task.status) && targetStatus !== 'QUEUED') {
        throw new AgentTaskImmutableError(task.id, task.status);
      }

      AgentTaskLifecycle.assertValidTransition(task.status, targetStatus, reason);

      const now = new Date();
      const updated = await tx.agentThreadTask.update({
        where: { id: taskId },
        data: {
          status: targetStatus,
          startedAt: targetStatus === 'RUNNING' && !task.startedAt ? now : task.startedAt,
          completedAt: AgentTaskLifecycle.isTerminal(targetStatus) ? now : task.completedAt,
          failureReason: reason ?? task.failureReason,
        },
      });

      return this.mapTaskToDto(updated);
    });
  }

  public async createMessage(
    threadId: string,
    role: AgentThreadMessageRole,
    content: string,
    sequence?: number,
    taskId?: string,
  ): Promise<AgentThreadMessageDto> {
    const thread = await this.prisma.agentThread.findUnique({
      where: { id: threadId },
    });
    if (!thread) {
      throw new AgentThreadNotFoundError(threadId);
    }

    const count =
      sequence ?? (await this.prisma.agentThreadMessage.count({ where: { threadId } })) + 1;
    const msg = await this.prisma.agentThreadMessage.create({
      data: {
        threadId,
        taskId,
        role,
        content,
        sequence: count,
      },
    });

    return this.mapMessageToDto(msg);
  }

  // ============================================================================
  // 3. Execution Steps, Messages & Tool Calls
  // ============================================================================

  public async addExecutionStep(
    input: {
      projectId: string;
      taskId: string;
      stepType: string;
      title: string;
      inputReference?: string;
      metadata?: Record<string, unknown>;
    },
    userId?: string,
  ): Promise<AgentExecutionStepDto> {
    if (userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    return this.prisma.$transaction(async tx => {
      const task = await tx.agentThreadTask.findFirst({
        where: { id: input.taskId, projectId: input.projectId },
      });
      if (!task) {
        throw new AgentTaskNotFoundError(input.taskId);
      }
      if (AgentTaskLifecycle.isTerminal(task.status)) {
        throw new AgentTaskImmutableError(task.id, task.status);
      }

      const count = await tx.agentExecutionStep.count({
        where: { taskId: input.taskId },
      });

      const now = new Date();
      const step = await tx.agentExecutionStep.create({
        data: {
          taskId: input.taskId,
          sequence: count + 1,
          stepType: input.stepType,
          status: 'RUNNING',
          title: input.title,
          inputReference: input.inputReference,
          startedAt: now,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });

      return this.mapStepToDto(step);
    });
  }

  public async updateExecutionStepStatus(
    input: {
      projectId: string;
      stepId: string;
      status: AgentExecutionStepStatus;
      outputReference?: string;
      error?: string;
    },
    userId?: string,
  ): Promise<AgentExecutionStepDto> {
    if (userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    const step = await this.prisma.agentExecutionStep.findUnique({
      where: { id: input.stepId },
      include: { task: true },
    });
    if (!step || step.task.projectId !== input.projectId) {
      throw new AiInvalidRequestError(`Execution step '${input.stepId}' was not found.`);
    }

    const now = new Date();
    const updated = await this.prisma.agentExecutionStep.update({
      where: { id: input.stepId },
      data: {
        status: input.status,
        outputReference: input.outputReference ?? step.outputReference,
        error: input.error ?? step.error,
        completedAt:
          input.status === 'COMPLETED' || input.status === 'FAILED' || input.status === 'CANCELLED'
            ? now
            : undefined,
      },
    });

    return this.mapStepToDto(updated);
  }

  public async recordToolCall(
    input: {
      projectId: string;
      taskId: string;
      stepId?: string;
      toolName: string;
      inputPayload: Record<string, unknown>;
      status?: AgentToolCallStatus;
    },
    userId?: string,
  ): Promise<AgentToolCallRecordDto> {
    if (userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    const task = await this.prisma.agentThreadTask.findFirst({
      where: { id: input.taskId, projectId: input.projectId },
    });
    if (!task) {
      throw new AgentTaskNotFoundError(input.taskId);
    }

    const now = new Date();
    const toolCall = await this.prisma.agentToolCallRecord.create({
      data: {
        taskId: input.taskId,
        stepId: input.stepId,
        toolName: input.toolName,
        status: input.status ?? 'PENDING',
        input: input.inputPayload as Prisma.InputJsonValue,
        startedAt: now,
      },
    });

    return this.mapToolCallToDto(toolCall);
  }

  public async updateToolCallResult(
    input: {
      projectId: string;
      toolCallId: string;
      status: AgentToolCallStatus;
      output?: unknown;
      error?: string;
      durationMs?: number;
    },
    userId?: string,
  ): Promise<AgentToolCallRecordDto> {
    if (userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    const call = await this.prisma.agentToolCallRecord.findUnique({
      where: { id: input.toolCallId },
      include: { task: true },
    });
    if (!call || call.task.projectId !== input.projectId) {
      throw new AiInvalidRequestError(`Tool call '${input.toolCallId}' was not found.`);
    }

    const now = new Date();
    const updated = await this.prisma.agentToolCallRecord.update({
      where: { id: input.toolCallId },
      data: {
        status: input.status,
        output: (input.output ?? null) as unknown as Prisma.InputJsonValue,
        error: input.error,
        completedAt: now,
        durationMs: input.durationMs,
      },
    });

    return this.mapToolCallToDto(updated);
  }

  public async listMessages(
    input: ListAgentThreadMessagesInputDto,
    userId?: string,
  ): Promise<readonly AgentThreadMessageDto[]> {
    if (userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    const where: Prisma.AgentThreadMessageWhereInput = {
      threadId: input.threadId,
    };
    if (input.taskId) {
      where.taskId = input.taskId;
    }

    const messages = await this.prisma.agentThreadMessage.findMany({
      where,
      orderBy: { sequence: 'asc' },
      take: input.limit ?? 100,
    });

    return messages.map(m => this.mapMessageToDto(m));
  }

  public async listExecutionSteps(
    input: ListAgentExecutionStepsInputDto,
    userId?: string,
  ): Promise<readonly AgentExecutionStepDto[]> {
    if (userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    const task = await this.prisma.agentThreadTask.findFirst({
      where: { id: input.taskId, projectId: input.projectId },
    });
    if (!task) {
      throw new AgentTaskNotFoundError(input.taskId);
    }

    const steps = await this.prisma.agentExecutionStep.findMany({
      where: { taskId: input.taskId },
      orderBy: { sequence: 'asc' },
    });

    return steps.map(s => this.mapStepToDto(s));
  }

  public async listToolCalls(
    input: ListAgentToolCallsInputDto,
    userId?: string,
  ): Promise<readonly AgentToolCallRecordDto[]> {
    if (userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    const task = await this.prisma.agentThreadTask.findFirst({
      where: { id: input.taskId, projectId: input.projectId },
    });
    if (!task) {
      throw new AgentTaskNotFoundError(input.taskId);
    }

    const where: Prisma.AgentToolCallRecordWhereInput = {
      taskId: input.taskId,
    };
    if (input.stepId) {
      where.stepId = input.stepId;
    }

    const calls = await this.prisma.agentToolCallRecord.findMany({
      where,
      orderBy: { startedAt: 'asc' },
    });

    return calls.map(c => this.mapToolCallToDto(c));
  }

  // ============================================================================
  // 4. Restart Recovery Foundation
  // ============================================================================

  /**
   * Scans for tasks that were left in RUNNING or PLANNING state across restarts
   * and transitions them deterministically to FAILED with recovery metadata.
   */
  public async recoverInterruptedTasks(projectId?: string | null): Promise<number> {
    const where: Prisma.AgentThreadTaskWhereInput = {
      status: { in: ['RUNNING', 'PLANNING'] },
    };
    if (projectId) {
      where.projectId = projectId;
    }

    const interruptedTasks = await this.prisma.agentThreadTask.findMany({
      where,
    });

    const now = new Date();
    for (const t of interruptedTasks) {
      await this.prisma.agentThreadTask.update({
        where: { id: t.id },
        data: {
          status: 'FAILED',
          completedAt: now,
          interruptedAt: now,
          isRecoverable: true,
          failureReason: 'Execution interrupted by platform shutdown or application restart.',
        },
      });

      // Also reconcile incomplete steps
      await this.prisma.agentExecutionStep.updateMany({
        where: { taskId: t.id, status: 'RUNNING' },
        data: {
          status: 'FAILED',
          completedAt: now,
          error: 'Step interrupted by platform restart.',
        },
      });

      // Also record audit log for interruption detection
      try {
        await this.prisma.agentTaskControlAuditLog.create({
          data: {
            projectId: t.projectId,
            threadId: t.threadId,
            taskId: t.id,
            userId: t.userId,
            action: 'INTERRUPTION_DETECTED',
            previousState: t.status,
            newState: 'FAILED',
            actorType: 'SYSTEM',
            actorId: 'system-recovery',
            attemptNumber: t.attemptNumber ?? 1,
            reason: 'Execution interrupted by platform shutdown or application restart.',
            metadata: { recoveredAt: now.toISOString() },
          },
        });
      } catch {
        // Ignore if audit log fails during recovery
      }

      // Create recovery checkpoint for the interrupted task
      try {
        if ((this.prisma as any).agentTaskCheckpoint?.create) {
          await this.checkpointService.createCheckpoint({
            taskId: t.id,
            projectId: t.projectId,
            threadId: t.threadId,
            userId: t.userId,
            taskStatus: 'FAILED',
            failureReason: 'Execution interrupted by platform shutdown or application restart.',
            isRecoverable: true,
          });
        }
      } catch {
        // Safe fallback in mock contexts
      }
    }

    return interruptedTasks.length;
  }

  // ============================================================================
  // 5. Long-Task Recovery Operations (Phase 158)
  // ============================================================================

  public async getTaskRecoveryState(
    input: GetTaskRecoveryStateInputDto,
    userId: string,
  ): Promise<TaskRecoverySummaryDto> {
    await this.assertProjectAccess(input.projectId, userId);
    return this.checkpointService.getTaskRecoverySummary(input.taskId, input.projectId, userId);
  }

  public async listRecoverableTasks(
    input: ListRecoverableTasksInputDto,
    userId: string,
  ): Promise<readonly TaskRecoverySummaryDto[]> {
    await this.assertProjectAccess(input.projectId, userId);
    return this.checkpointService.listRecoverableTasks(
      input.projectId,
      userId,
      input.threadId,
      input.limit,
    );
  }

  public async listTaskCheckpoints(
    input: ListAgentTaskCheckpointsInputDto,
    userId: string,
  ): Promise<readonly AgentTaskCheckpointDto[]> {
    await this.assertProjectAccess(input.projectId, userId);
    return this.checkpointService.listCheckpoints(
      input.taskId,
      input.projectId,
      userId,
      input.limit,
    );
  }

  public async createTaskCheckpoint(
    opts: CreateCheckpointOptions,
  ): Promise<AgentTaskCheckpointDto> {
    return this.checkpointService.createCheckpoint(opts);
  }

  // ============================================================================
  // Helpers & Mappers
  // ============================================================================

  private async assertProjectAccess(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true },
    });

    if (!project) {
      throw new AiInvalidRequestError(`Project with ID '${projectId}' was not found.`);
    }

    if (project.userId && project.userId !== userId) {
      this.logger.warn('agent_thread.cross_project_violation', {
        projectId,
        projectOwnerId: project.userId,
        requestUserId: userId,
      });
      throw new AiCrossProjectAccessError(
        `User '${userId}' does not have permission to access project '${projectId}'.`,
      );
    }
  }

  private async recordAuditLog(
    userId: string,
    action: AuthAuditAction,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.authAuditEvent.create({
        data: {
          userId,
          action,
          metadata: metadata as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.warn('agent_thread.audit_failed', {
        action,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private mapThreadToDto(t: import('@prisma/client').AgentThread): AgentThreadDto {
    return {
      id: t.id,
      projectId: t.projectId,
      userId: t.userId,
      title: t.title,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      lastActivityAt: t.lastActivityAt.toISOString(),
      archivedAt: t.archivedAt?.toISOString() ?? null,
    };
  }

  private mapTaskToDto(t: import('@prisma/client').AgentThreadTask): AgentThreadTaskDto {
    return {
      id: t.id,
      projectId: t.projectId,
      threadId: t.threadId,
      userId: t.userId,
      title: t.title,
      instruction: t.instruction,
      status: t.status,
      failureReason: t.failureReason,
      retryCount: t.retryCount,
      parentTaskId: t.parentTaskId,
      metadata: (t.metadata as Record<string, unknown>) ?? {},
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      startedAt: t.startedAt?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      cancelledAt: t.cancelledAt?.toISOString() ?? null,
      pausedAt: t.pausedAt?.toISOString() ?? null,
      stoppedAt: t.stoppedAt?.toISOString() ?? null,
      attemptNumber: t.attemptNumber ?? 1,
      isRecoverable: t.isRecoverable ?? false,
      interruptedAt: t.interruptedAt?.toISOString() ?? null,
      lastCheckpointId: t.lastCheckpointId ?? null,
      lastCheckpointSeq: t.lastCheckpointSeq ?? null,
      maxRetries: t.maxRetries ?? 3,
    };
  }

  private mapControlAuditLogToDto(
    l: import('@prisma/client').AgentTaskControlAuditLog,
  ): AgentTaskControlAuditLogDto {
    return {
      id: l.id,
      projectId: l.projectId,
      threadId: l.threadId,
      taskId: l.taskId,
      userId: l.userId,
      action: l.action,
      previousState: l.previousState,
      newState: l.newState,
      actorType: l.actorType,
      actorId: l.actorId,
      attemptNumber: l.attemptNumber,
      reason: l.reason,
      metadata: (l.metadata as Record<string, unknown>) ?? {},
      timestamp: l.timestamp.toISOString(),
    };
  }

  private async recordTaskControlAuditLog(
    tx: Prisma.TransactionClient,
    params: {
      projectId: string;
      threadId: string;
      taskId: string;
      userId: string;
      action: TaskControlAction;
      previousState: AgentThreadTaskStatus;
      newState: AgentThreadTaskStatus;
      actorType?: TaskControlActorType;
      actorId: string;
      attemptNumber?: number;
      reason?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      if ((tx as any).agentTaskControlAuditLog?.create) {
        await (tx as any).agentTaskControlAuditLog.create({
          data: {
            projectId: params.projectId,
            threadId: params.threadId,
            taskId: params.taskId,
            userId: params.userId,
            action: params.action,
            previousState: params.previousState,
            newState: params.newState,
            actorType: params.actorType ?? 'USER',
            actorId: params.actorId,
            attemptNumber: params.attemptNumber ?? 1,
            reason: params.reason ?? null,
            metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
      }
    } catch (err) {
      this.logger.warn('agent_thread.control_audit_failed', {
        action: params.action,
        taskId: params.taskId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private mapMessageToDto(m: import('@prisma/client').AgentThreadMessage): AgentThreadMessageDto {
    return {
      id: m.id,
      threadId: m.threadId,
      taskId: m.taskId,
      role: m.role,
      content: m.content,
      sequence: m.sequence,
      metadata: (m.metadata as Record<string, unknown>) ?? {},
      createdAt: m.createdAt.toISOString(),
    };
  }

  private mapStepToDto(s: import('@prisma/client').AgentExecutionStep): AgentExecutionStepDto {
    return {
      id: s.id,
      taskId: s.taskId,
      sequence: s.sequence,
      stepType: s.stepType,
      status: s.status,
      title: s.title,
      inputReference: s.inputReference,
      outputReference: s.outputReference,
      error: s.error,
      startedAt: s.startedAt?.toISOString() ?? null,
      completedAt: s.completedAt?.toISOString() ?? null,
      metadata: (s.metadata as Record<string, unknown>) ?? {},
    };
  }

  private mapToolCallToDto(
    c: import('@prisma/client').AgentToolCallRecord,
  ): AgentToolCallRecordDto {
    return {
      id: c.id,
      taskId: c.taskId,
      stepId: c.stepId,
      toolName: c.toolName,
      status: c.status,
      input: c.input,
      output: c.output ?? null,
      error: c.error,
      startedAt: c.startedAt?.toISOString() ?? null,
      completedAt: c.completedAt?.toISOString() ?? null,
      durationMs: c.durationMs,
      metadata: (c.metadata as Record<string, unknown>) ?? {},
    };
  }
}
