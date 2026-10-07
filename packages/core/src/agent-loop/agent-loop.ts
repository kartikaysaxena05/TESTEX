/**
 * @file packages/core/src/agent-loop/agent-loop.ts
 * Core Codex-style Agent Execution Loop for V10 Phase 153.
 *
 * Implements the autonomous cycle:
 *   Task -> Plan -> Tool Call -> Tool Result -> Observation -> Next Step
 *
 * Architectural Guarantees:
 * 1. Strict boundary separation: AgentPlanner, AgentExecutor, AgentState, AgentLoop.
 * 2. Uses Tool Registry (Phase 143) and Tool Permissions (Phase 144) — no bypasses.
 * 3. Enforces task lifecycle state machine:
 *    QUEUED -> PLANNING -> RUNNING -> WAITING_FOR_APPROVAL -> COMPLETED / FAILED / CANCELLED.
 * 4. Checks cancellation checkpoints before, during, and between steps.
 * 5. Enforces safety limits: maxSteps, maxConsecutiveFailures, maxDurationMs, maxToolCalls.
 * 6. Concurrency lock prevents concurrent loops on the same task.
 * 7. Persists execution steps, tool call records, and thread messages.
 * 8. Zero mock execution paths; clean provider/decision abstraction.
 */

import { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { getLogger, type ILogger } from '../logging/index.js';
import {
  type StartAgentLoopInputDto,
  type ResumeAgentLoopInputDto,
  type CancelAgentLoopInputDto,
  type GetAgentLoopStatusInputDto,
  type AgentLoopRunResultDto,
  type AgentLoopStateDto,
  type AgentPlanExecutionDto,
  type AgentActivityEventType,
} from '@ai-quality/contracts';
import { AgentThreadService } from '../agent-threads/agent-thread-service.js';
import { AgentTaskLifecycle } from '../agent-threads/agent-task-lifecycle.js';
import { AgentPlanService } from '../agent-planning/agent-plan-service.js';
import { ToolRegistryService } from '../agent-tools/agent-tool-registry.js';
import {
  AgentLoopNotFoundError,
  AgentLoopInvalidStateError,
  AgentLoopSafetyLimitExceededError,
  AgentLoopCancelledError,
  AgentLoopCrossProjectAccessError,
} from './agent-loop-errors.js';
import { AgentState } from './agent-state.js';
import { AgentConcurrencyManager } from './agent-concurrency-manager.js';
import { AgentPlanner, type IAgentPlanner } from './agent-planner-adapter.js';
import { AgentExecutor, type IAgentExecutor } from './agent-executor.js';
import { AgentActivityStreamService } from '../agent-activity/agent-activity-stream-service.js';
import { ApprovalService } from '../agent-approval/approval-service.js';

export interface AgentLoopDependencies {
  readonly prisma?: PrismaClient;
  readonly logger?: ILogger;
  readonly threadService?: AgentThreadService;
  readonly planService?: AgentPlanService;
  readonly toolRegistry?: ToolRegistryService;
  readonly planner?: IAgentPlanner;
  readonly executor?: IAgentExecutor;
  readonly activityStream?: AgentActivityStreamService;
  readonly approvalService?: ApprovalService;
}

export class AgentLoop {
  private readonly prisma: PrismaClient;
  private readonly logger: ILogger;
  private readonly threadService: AgentThreadService;
  private readonly planService: AgentPlanService;
  private readonly toolRegistry: ToolRegistryService;
  private readonly planner: IAgentPlanner;
  private readonly executor: IAgentExecutor;
  private readonly activityStream?: AgentActivityStreamService;
  private readonly approvalService?: ApprovalService;

  // Active in-memory state tracking per task
  private static readonly activeStates = new Map<string, AgentState>();

  constructor(deps?: AgentLoopDependencies) {
    const client = deps?.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database client is not configured or unavailable.');
    }
    this.prisma = client;
    this.logger = deps?.logger ?? getLogger();

    this.threadService =
      deps?.threadService ?? new AgentThreadService({ prisma: this.prisma, logger: this.logger });
    this.planService =
      deps?.planService ?? new AgentPlanService({ prisma: this.prisma, logger: this.logger });
    this.toolRegistry =
      deps?.toolRegistry ?? new ToolRegistryService({ prisma: this.prisma, logger: this.logger });

    this.approvalService =
      deps?.approvalService ??
      (this.prisma ? new ApprovalService({ prisma: this.prisma, logger: this.logger }) : undefined);
    this.planner = deps?.planner ?? new AgentPlanner(this.planService);
    this.executor =
      deps?.executor ??
      new AgentExecutor(
        this.threadService,
        this.planService,
        this.toolRegistry,
        this.approvalService,
        this.prisma,
      );
    this.activityStream = deps?.activityStream;
  }

  private async emitActivity(
    taskId: string,
    threadId: string,
    projectId: string,
    type: AgentActivityEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.activityStream) return;
    try {
      await this.activityStream.publish({
        taskId,
        threadId,
        projectId,
        type,
        payload,
      });
    } catch (err) {
      this.logger.warn('Failed to emit agent activity event', {
        error: err instanceof Error ? err.message : String(err),
        type,
        taskId,
      });
    }
  }

  // ============================================================================
  // 1. Start Agent Loop
  // ============================================================================

  public async run(input: StartAgentLoopInputDto, userId: string): Promise<AgentLoopRunResultDto> {
    const startTime = performance.now();

    // 1. Authorize project & user access
    await this.assertProjectAccess(input.projectId, userId);

    // 2. Fetch task and verify state
    const task = await this.prisma.agentThreadTask.findFirst({
      where: {
        id: input.taskId,
        projectId: input.projectId,
        threadId: input.threadId,
      },
    });

    if (!task) {
      throw new AgentLoopNotFoundError(
        `Task "${input.taskId}" was not found in project "${input.projectId}".`,
      );
    }

    if (AgentTaskLifecycle.isTerminal(task.status)) {
      throw new AgentLoopInvalidStateError(
        task.status,
        'RUNNING',
        `Task "${input.taskId}" is already in terminal state "${task.status}" and cannot be started.`,
      );
    }

    // 3. Acquire concurrency lock
    const abortController = AgentConcurrencyManager.acquireLock(input.taskId, input.projectId);
    const state = new AgentState({
      taskId: input.taskId,
      threadId: input.threadId,
      projectId: input.projectId,
      userId,
      safetyLimits: input.safetyLimits,
    });
    AgentLoop.activeStates.set(input.taskId, state);
    AgentConcurrencyManager.registerState(input.taskId, state);

    try {
      // 4. State transition: QUEUED -> PLANNING
      state.status = 'PLANNING';
      await this.threadService.updateTaskStatus(task.id, 'PLANNING');

      // Check if stopped or cancelled before/during planning
      if (state.isStopRequested()) {
        state.status = 'STOPPED';
        await this.threadService.stopTask(
          {
            projectId: input.projectId,
            taskId: input.taskId,
            reason: state.getStopReason() ?? 'Stopped during planning',
          },
          userId,
        );
        return {
          taskId: input.taskId,
          status: 'STOPPED',
          stepsCompleted: 0,
          toolCallsExecuted: 0,
          planStatus: 'READY',
          failureReason: state.getStopReason() ?? 'Stopped during planning',
          durationMs: state.getElapsedTimeMs(),
        };
      }
      if (abortController.signal.aborted || state.isCancellationRequested()) {
        throw new AgentLoopCancelledError(state.taskId, state.getCancellationReason() ?? 'Cancelled during planning');
      }

      // 5. Ensure Plan exists and is active
      const plan = await this.planner.ensurePlan({
        projectId: input.projectId,
        threadId: input.threadId,
        taskId: input.taskId,
        userId,
        planId: input.planId,
      });
      state.activePlanId = plan.id;

      // Check if stopped after plan creation
      if (state.isStopRequested()) {
        state.status = 'STOPPED';
        await this.threadService.stopTask(
          {
            projectId: input.projectId,
            taskId: input.taskId,
            reason: state.getStopReason() ?? 'Stopped during planning',
          },
          userId,
        );
        return {
          taskId: input.taskId,
          status: 'STOPPED',
          stepsCompleted: 0,
          toolCallsExecuted: 0,
          planStatus: plan.status,
          failureReason: state.getStopReason() ?? 'Stopped during planning',
          durationMs: state.getElapsedTimeMs(),
        };
      }

      // 6. State transition: PLANNING -> RUNNING
      state.status = 'RUNNING';
      await this.threadService.updateTaskStatus(task.id, 'RUNNING');
      await this.threadService.createMessage(
        input.threadId,
        'ASSISTANT',
        `Started executing task "${task.title}". Active plan has ${plan.steps.length} steps.`,
        undefined,
        task.id,
      );

      await this.emitActivity(input.taskId, input.threadId, input.projectId, 'TASK_STARTED', {
        taskTitle: task.title,
        status: 'RUNNING',
        totalPlanSteps: plan.steps.length,
      });

      await this.threadService
        .createTaskCheckpoint({
          taskId: input.taskId,
          projectId: input.projectId,
          threadId: input.threadId,
          userId,
          taskStatus: 'RUNNING',
          isRecoverable: true,
        })
        .catch(() => {});

      // 7. Core Execution Loop
      return await this.executeLoop(plan, state, abortController.signal, userId);
    } catch (err: unknown) {
      return await this.handleLoopError(
        input.taskId,
        input.projectId,
        input.threadId,
        err,
        state,
        userId,
        startTime,
      );
    } finally {
      state.completedTime = Date.now();
      AgentConcurrencyManager.releaseLock(input.taskId);
    }
  }

  // ============================================================================
  // 2. Resume Agent Loop (after Approval or Pause)
  // ============================================================================

  public async resume(
    input: ResumeAgentLoopInputDto,
    userId: string,
  ): Promise<AgentLoopRunResultDto> {
    const startTime = performance.now();
    await this.assertProjectAccess(input.projectId, userId);

    const task = await this.prisma.agentThreadTask.findFirst({
      where: {
        id: input.taskId,
        projectId: input.projectId,
        threadId: input.threadId,
      },
    });

    if (!task) {
      throw new AgentLoopNotFoundError(`Task "${input.taskId}" was not found.`);
    }

    if (
      task.status !== 'WAITING_FOR_APPROVAL' &&
      task.status !== 'RUNNING' &&
      task.status !== 'PAUSED'
    ) {
      throw new AgentLoopInvalidStateError(
        task.status,
        'RUNNING',
        `Task "${input.taskId}" cannot be resumed from state "${task.status}" (must be WAITING_FOR_APPROVAL, PAUSED, or RUNNING).`,
      );
    }

    // Assert no approval is pending before resume
    if (this.approvalService) {
      const pending = await this.approvalService
        .getPendingRequest({ projectId: input.projectId, taskId: input.taskId }, userId)
        .catch(() => null);
      if (pending && pending.status === 'PENDING') {
        throw new AgentLoopInvalidStateError(
          task.status,
          'RUNNING',
          `Cannot resume task "${input.taskId}": approval "${pending.id}" is still pending human authorization.`,
        );
      }
    }

    // Resume task in DB first (this validates resumability & concurrency)
    await this.threadService.resumeTask(
      { projectId: input.projectId, taskId: input.taskId },
      userId,
    );

    const abortController = AgentConcurrencyManager.acquireLock(input.taskId, input.projectId);
    let state = AgentLoop.activeStates.get(input.taskId);
    if (!state) {
      state = new AgentState({
        taskId: input.taskId,
        threadId: input.threadId,
        projectId: input.projectId,
        userId,
        safetyLimits: input.safetyLimits,
      });
      AgentLoop.activeStates.set(input.taskId, state);
    }
    AgentConcurrencyManager.registerState(input.taskId, state);

    try {
      state.status = 'RUNNING';
      state.pendingApprovalId = null;

      // Fetch active plan
      const plan = await this.planService.getActivePlan(
        { projectId: input.projectId, taskId: input.taskId },
        userId,
      );

      if (!plan) {
        throw new AgentLoopNotFoundError(`No active plan found to resume task "${input.taskId}".`);
      }
      state.activePlanId = plan.id;

      await this.threadService.createMessage(
        input.threadId,
        'ASSISTANT',
        `Resuming execution of task "${task.title}".`,
        undefined,
        task.id,
      );

      await this.emitActivity(input.taskId, input.threadId, input.projectId, 'TASK_STARTED', {
        taskTitle: task.title,
        status: 'RUNNING',
        totalPlanSteps: plan.steps.length,
      });

      return await this.executeLoop(plan, state, abortController.signal, userId);
    } catch (err: unknown) {
      return await this.handleLoopError(
        input.taskId,
        input.projectId,
        input.threadId,
        err,
        state,
        userId,
        startTime,
      );
    } finally {
      state.completedTime = Date.now();
      AgentConcurrencyManager.releaseLock(input.taskId);
    }
  }

  // ============================================================================
  // 3. Cancel Agent Loop
  // ============================================================================

  public async cancel(
    input: CancelAgentLoopInputDto,
    userId: string,
  ): Promise<AgentLoopRunResultDto> {
    await this.assertProjectAccess(input.projectId, userId);

    // 1. Signal cancellation if active
    AgentConcurrencyManager.cancelExecution(input.taskId, input.reason);

    const state = AgentLoop.activeStates.get(input.taskId);
    if (state) {
      state.requestCancellation(input.reason);
    }

    // 2. Persist cancellation in database
    await this.threadService.cancelTask(
      {
        projectId: input.projectId,
        taskId: input.taskId,
        reason: input.reason ?? 'Cancelled by user',
      },
      userId,
    );

    // Cancel any pending approval requests for this task
    if (this.approvalService) {
      const pending = await this.approvalService
        .getPendingRequest({ projectId: input.projectId, taskId: input.taskId }, userId)
        .catch(() => null);
      if (pending && pending.status === 'PENDING') {
        await this.approvalService
          .cancel(
            {
              projectId: input.projectId,
              approvalId: pending.id,
              reason: input.reason ?? 'Task cancelled',
            },
            userId,
          )
          .catch(() => null);
      }
    }

    // 3. Also mark active plan as CANCELLED if exists
    const activePlan = await this.planService.getActivePlan(
      { projectId: input.projectId, taskId: input.taskId },
      userId,
    );
    if (activePlan && activePlan.status !== 'CANCELLED' && activePlan.status !== 'COMPLETED') {
      await this.planService
        .setPlanStatus(
          {
            projectId: input.projectId,
            planId: activePlan.id,
            status: 'CANCELLED',
          },
          userId,
        )
        .catch(() => {});
    }

    await this.threadService
      .createMessage(
        input.threadId,
        'ASSISTANT',
        `Task execution cancelled: ${input.reason ?? 'Cancelled by user'}.`,
        undefined,
        input.taskId,
      )
      .catch(() => {});

    await this.emitActivity(input.taskId, input.threadId, input.projectId, 'TASK_CANCELLED', {
      status: 'CANCELLED',
      reason: input.reason ?? 'Cancelled by user',
      durationMs: state ? state.getElapsedTimeMs() : 0,
    });

    return {
      taskId: input.taskId,
      status: 'CANCELLED',
      stepsCompleted: state ? state.totalStepsExecuted : 0,
      toolCallsExecuted: state ? state.toolCallCount : 0,
      planStatus: 'CANCELLED',
      failureReason: input.reason ?? 'Cancelled by user',
      durationMs: state ? state.getElapsedTimeMs() : 0,
    };
  }

  // ============================================================================
  // Stop & Pause Loop (V10 Phase 157)
  // ============================================================================

  public async stop(
    input: { projectId: string; taskId: string; threadId: string; reason?: string },
    userId: string,
  ): Promise<AgentLoopRunResultDto> {
    await this.assertProjectAccess(input.projectId, userId);

    AgentConcurrencyManager.stopExecution(input.taskId, input.reason);
    const state = AgentLoop.activeStates.get(input.taskId);
    if (state) {
      state.requestStop(input.reason);
    }

    await this.threadService.stopTask(
      {
        projectId: input.projectId,
        taskId: input.taskId,
        reason: input.reason ?? 'Stopped by user',
      },
      userId,
    );

    return {
      taskId: input.taskId,
      status: 'STOPPED',
      stepsCompleted: state ? state.totalStepsExecuted : 0,
      toolCallsExecuted: state ? state.toolCallCount : 0,
      failureReason: input.reason ?? 'Stopped by user',
      durationMs: state ? state.getElapsedTimeMs() : 0,
    };
  }

  public async pause(
    input: { projectId: string; taskId: string; threadId: string; reason?: string },
    userId: string,
  ): Promise<AgentLoopRunResultDto> {
    await this.assertProjectAccess(input.projectId, userId);

    AgentConcurrencyManager.pauseExecution(input.taskId, input.reason);
    const state = AgentLoop.activeStates.get(input.taskId);
    if (state) {
      state.requestPause(input.reason);
    }

    await this.threadService.pauseTask(
      {
        projectId: input.projectId,
        taskId: input.taskId,
        reason: input.reason ?? 'Paused by user',
      },
      userId,
    );

    return {
      taskId: input.taskId,
      status: 'PAUSED',
      stepsCompleted: state ? state.totalStepsExecuted : 0,
      toolCallsExecuted: state ? state.toolCallCount : 0,
      failureReason: input.reason ?? 'Paused by user',
      durationMs: state ? state.getElapsedTimeMs() : 0,
    };
  }

  // ============================================================================
  // 4. Get Loop Status
  // ============================================================================

  public async getStatus(
    input: GetAgentLoopStatusInputDto,
    userId?: string,
  ): Promise<AgentLoopStateDto | null> {
    if (userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    // Return in-memory state if active
    const active = AgentLoop.activeStates.get(input.taskId);
    if (active && active.projectId === input.projectId) {
      return active.toDto();
    }

    // Otherwise load from persistent database
    const task = await this.prisma.agentThreadTask.findFirst({
      where: { id: input.taskId, projectId: input.projectId },
      include: {
        executionSteps: { orderBy: { sequence: 'asc' } },
        toolCalls: true,
      },
    });

    if (!task) {
      return null;
    }

    const activePlan = await this.planService
      .getActivePlan({ projectId: input.projectId, taskId: input.taskId }, userId)
      .catch(() => null);

    const stepsExecuted = task.executionSteps.filter(s => s.status === 'COMPLETED').length;
    const duration =
      task.completedAt && task.startedAt
        ? task.completedAt.getTime() - task.startedAt.getTime()
        : task.startedAt
          ? Date.now() - task.startedAt.getTime()
          : 0;

    return {
      taskId: task.id,
      threadId: task.threadId,
      projectId: task.projectId,
      status: task.status as any,
      currentStepSequence: task.executionSteps.length,
      totalStepsExecuted: stepsExecuted,
      toolCallsCount: task.toolCalls.length,
      consecutiveFailures: 0,
      activePlanId: activePlan?.id ?? null,
      activeStepId: null,
      activeToolName: null,
      pendingApprovalId: null,
      failureReason: task.failureReason ?? null,
      startedAt: task.startedAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      durationMs: Math.max(0, duration),
    };
  }

  // ============================================================================
  // Core Execution Loop
  // ============================================================================

  private async executeLoop(
    initialPlan: AgentPlanExecutionDto,
    state: AgentState,
    signal: AbortSignal,
    userId: string,
  ): Promise<AgentLoopRunResultDto> {
    let currentPlan = initialPlan;

    while (true) {
      // 1. Check cancellation, stop, or pause before step decision
      if (signal.aborted || state.isCancellationRequested()) {
        throw new AgentLoopCancelledError(
          state.taskId,
          state.getCancellationReason() ?? 'Cancelled',
        );
      }

      if (state.isStopRequested()) {
        state.status = 'STOPPED';
        await this.threadService.stopTask(
          {
            projectId: state.projectId,
            taskId: state.taskId,
            reason: state.getStopReason() ?? 'Stopped by user',
          },
          userId,
        );
        return {
          taskId: state.taskId,
          status: 'STOPPED',
          stepsCompleted: state.totalStepsExecuted,
          toolCallsExecuted: state.toolCallCount,
          planStatus: currentPlan.status,
          failureReason: state.getStopReason() ?? 'Stopped by user',
          durationMs: state.getElapsedTimeMs(),
        };
      }

      if (state.isPauseRequested()) {
        state.status = 'PAUSED';
        await this.threadService.pauseTask(
          {
            projectId: state.projectId,
            taskId: state.taskId,
            reason: state.getPauseReason() ?? 'Paused by user',
          },
          userId,
        );
        return {
          taskId: state.taskId,
          status: 'PAUSED',
          stepsCompleted: state.totalStepsExecuted,
          toolCallsExecuted: state.toolCallCount,
          planStatus: currentPlan.status,
          failureReason: state.getPauseReason() ?? 'Paused by user',
          durationMs: state.getElapsedTimeMs(),
        };
      }

      // 2. Check safety limits
      state.assertSafetyLimits();

      // 3. Refresh plan state from database to observe latest step statuses
      const refreshedPlan = await this.planService.getPlan(
        { projectId: state.projectId, planId: currentPlan.id },
        userId,
      );
      if (refreshedPlan) {
        currentPlan = refreshedPlan;
      }

      // 4. Planner decides next action
      const decision = this.planner.resolveNextStep(currentPlan, state);

      if (decision.type === 'COMPLETE') {
        // All steps successfully completed!
        state.status = 'COMPLETED';
        await this.planService
          .setPlanStatus(
            { projectId: state.projectId, planId: currentPlan.id, status: 'COMPLETED' },
            userId,
          )
          .catch(() => {});

        await this.threadService.updateTaskStatus(state.taskId, 'COMPLETED');
        await this.threadService
          .createTaskCheckpoint({
            taskId: state.taskId,
            projectId: state.projectId,
            threadId: state.threadId,
            userId,
            taskStatus: 'COMPLETED',
            isRecoverable: false,
          })
          .catch(() => {});
        await this.threadService.createMessage(
          state.threadId,
          'ASSISTANT',
          'Task completed successfully. All plan steps finished.',
          undefined,
          state.taskId,
        );

        await this.emitActivity(state.taskId, state.threadId, state.projectId, 'TASK_COMPLETED', {
          status: 'COMPLETED',
          stepsCompleted: state.totalStepsExecuted,
          toolCallsExecuted: state.toolCallCount,
          durationMs: state.getElapsedTimeMs(),
        });

        return {
          taskId: state.taskId,
          status: 'COMPLETED',
          stepsCompleted: state.totalStepsExecuted,
          toolCallsExecuted: state.toolCallCount,
          planStatus: 'COMPLETED',
          durationMs: state.getElapsedTimeMs(),
        };
      }

      if (decision.type === 'BLOCKED') {
        // Plan cannot proceed further
        state.status = 'FAILED';
        state.failureReason = decision.reason;

        await this.planService
          .setPlanStatus(
            { projectId: state.projectId, planId: currentPlan.id, status: 'FAILED' },
            userId,
          )
          .catch(() => {});

        await this.threadService.updateTaskStatus(state.taskId, 'FAILED', decision.reason);
        await this.threadService.createMessage(
          state.threadId,
          'ASSISTANT',
          `Task failed: ${decision.reason}`,
          undefined,
          state.taskId,
        );

        await this.emitActivity(state.taskId, state.threadId, state.projectId, 'TASK_FAILED', {
          status: 'FAILED',
          failureReason: decision.reason,
          stepsCompleted: state.totalStepsExecuted,
          toolCallsExecuted: state.toolCallCount,
          durationMs: state.getElapsedTimeMs(),
        });

        return {
          taskId: state.taskId,
          status: 'FAILED',
          stepsCompleted: state.totalStepsExecuted,
          toolCallsExecuted: state.toolCallCount,
          planStatus: 'FAILED',
          failureReason: decision.reason,
          durationMs: state.getElapsedTimeMs(),
        };
      }

      // 5. Execute Step
      const stepToRun = decision.step;
      state.stepIndex++;

      await this.emitActivity(state.taskId, state.threadId, state.projectId, 'STEP_STARTED', {
        stepId: stepToRun.id,
        sequence: stepToRun.sequence,
        title: stepToRun.title,
        objective: stepToRun.objective,
        toolAction: stepToRun.toolAction,
      });

      if (stepToRun.toolAction) {
        await this.emitActivity(state.taskId, state.threadId, state.projectId, 'TOOL_STARTED', {
          toolCallId: stepToRun.id,
          stepId: stepToRun.id,
          toolName: stepToRun.toolAction,
          inputSummary:
            stepToRun.structuredInput && typeof stepToRun.structuredInput === 'object'
              ? (stepToRun.structuredInput as Record<string, unknown>)
              : {},
        });
      }

      const stepStartTime = Date.now();
      const execResult = await this.executor.executeStep({
        projectId: state.projectId,
        threadId: state.threadId,
        taskId: state.taskId,
        userId,
        plan: currentPlan,
        step: stepToRun,
        state,
        signal,
      });
      const stepDurationMs = Date.now() - stepStartTime;

      // 6. Handle Human Approval Pause
      if (execResult.requiresApproval) {
        state.status = 'WAITING_FOR_APPROVAL';
        state.pendingApprovalId = execResult.approvalId ?? null;

        await this.threadService.updateTaskStatus(
          state.taskId,
          'WAITING_FOR_APPROVAL',
          `Operation paused: tool "${stepToRun.toolAction}" requires human authorization.`,
        );

        await this.threadService.createMessage(
          state.threadId,
          'ASSISTANT',
          `Task paused: tool "${stepToRun.toolAction}" requires human authorization (Approval ID: ${execResult.approvalId}).`,
          undefined,
          state.taskId,
        );

        await this.emitActivity(
          state.taskId,
          state.threadId,
          state.projectId,
          'APPROVAL_REQUIRED',
          {
            approvalId: execResult.approvalId ?? '',
            toolName: stepToRun.toolAction,
            permissionLevel: 'EXECUTE',
            requestedOperation: stepToRun.toolAction,
            reason: stepToRun.objective,
          },
        );

        return {
          taskId: state.taskId,
          status: 'WAITING_FOR_APPROVAL',
          stepsCompleted: state.totalStepsExecuted,
          toolCallsExecuted: state.toolCallCount,
          planStatus: 'EXECUTING',
          pendingApprovalId: execResult.approvalId,
          durationMs: state.getElapsedTimeMs(),
        };
      }

      if (stepToRun.toolAction) {
        if (execResult.success) {
          await this.emitActivity(state.taskId, state.threadId, state.projectId, 'TOOL_COMPLETED', {
            toolCallId: stepToRun.id,
            toolName: stepToRun.toolAction,
            durationMs: stepDurationMs,
            resultSummary: execResult.output,
          });
        } else {
          await this.emitActivity(state.taskId, state.threadId, state.projectId, 'TOOL_FAILED', {
            toolCallId: stepToRun.id,
            toolName: stepToRun.toolAction,
            durationMs: stepDurationMs,
            error: execResult.error ?? 'Tool execution failed',
          });
        }
      }

      await this.emitActivity(state.taskId, state.threadId, state.projectId, 'STEP_UPDATED', {
        stepId: stepToRun.id,
        sequence: stepToRun.sequence,
        status: execResult.success ? 'COMPLETED' : 'FAILED',
        durationMs: stepDurationMs,
      });

      // 7. Check if step failure breached consecutive failure limit
      if (
        !execResult.success &&
        state.consecutiveFailures >= state.safetyLimits.maxConsecutiveFailures
      ) {
        throw new AgentLoopSafetyLimitExceededError(
          'maxConsecutiveFailures',
          state.consecutiveFailures,
          state.safetyLimits.maxConsecutiveFailures,
        );
      }

      // 8. Check if stop or pause was requested during step execution
      if (state.isStopRequested()) {
        state.status = 'STOPPED';
        await this.threadService.stopTask(
          {
            projectId: state.projectId,
            taskId: state.taskId,
            reason: state.getStopReason() ?? 'Stopped by user',
          },
          userId,
        );
        return {
          taskId: state.taskId,
          status: 'STOPPED',
          stepsCompleted: state.totalStepsExecuted,
          toolCallsExecuted: state.toolCallCount,
          planStatus: currentPlan.status,
          failureReason: state.getStopReason() ?? 'Stopped by user',
          durationMs: state.getElapsedTimeMs(),
        };
      }

      if (state.isPauseRequested()) {
        state.status = 'PAUSED';
        await this.threadService.pauseTask(
          {
            projectId: state.projectId,
            taskId: state.taskId,
            reason: state.getPauseReason() ?? 'Paused by user',
          },
          userId,
        );
        return {
          taskId: state.taskId,
          status: 'PAUSED',
          stepsCompleted: state.totalStepsExecuted,
          toolCallsExecuted: state.toolCallCount,
          planStatus: currentPlan.status,
          failureReason: state.getPauseReason() ?? 'Paused by user',
          durationMs: state.getElapsedTimeMs(),
        };
      }

      // Persist checkpoint after step execution
      await this.threadService
        .createTaskCheckpoint({
          taskId: state.taskId,
          projectId: state.projectId,
          threadId: state.threadId,
          userId,
          taskStatus: 'RUNNING',
          stepId: stepToRun.id,
          activeToolName: stepToRun.toolAction,
          isRecoverable: true,
        })
        .catch(() => {});
    }
  }

  // ============================================================================
  // Error Handling
  // ============================================================================

  private async handleLoopError(
    taskId: string,
    projectId: string,
    threadId: string,
    err: unknown,
    state: AgentState,
    userId: string,
    _startTime: number,
  ): Promise<AgentLoopRunResultDto> {
    const durationMs = state.getElapsedTimeMs();

    if (err instanceof AgentLoopCancelledError || (err as any)?.name === 'AbortError') {
      state.status = 'CANCELLED';
      await this.threadService
        .cancelTask(
          { projectId, taskId, reason: state.getCancellationReason() ?? 'Cancelled' },
          userId,
        )
        .catch(() => {});

      if (state.activePlanId) {
        await this.planService
          .setPlanStatus({ projectId, planId: state.activePlanId, status: 'CANCELLED' }, userId)
          .catch(() => {});
      }

      await this.emitActivity(taskId, threadId, projectId, 'TASK_CANCELLED', {
        status: 'CANCELLED',
        reason: state.getCancellationReason() ?? 'Execution cancelled',
        durationMs,
      });

      return {
        taskId,
        status: 'CANCELLED',
        stepsCompleted: state.totalStepsExecuted,
        toolCallsExecuted: state.toolCallCount,
        planStatus: 'CANCELLED',
        failureReason: state.getCancellationReason() ?? 'Execution cancelled',
        durationMs,
      };
    }

    // Safety limits / timeouts / other failures
    const errorMessage = err instanceof Error ? err.message : String(err);
    state.status = 'FAILED';
    state.failureReason = errorMessage;

    await this.threadService.updateTaskStatus(taskId, 'FAILED', errorMessage).catch(() => {});
    await this.threadService
      .createTaskCheckpoint({
        taskId,
        projectId,
        threadId,
        userId,
        taskStatus: 'FAILED',
        failureReason: errorMessage,
        isRecoverable: true,
      })
      .catch(() => {});
    if (state.activePlanId) {
      await this.planService
        .setPlanStatus({ projectId, planId: state.activePlanId, status: 'FAILED' }, userId)
        .catch(() => {});
    }

    await this.threadService
      .createMessage(threadId, 'ASSISTANT', `Task failed: ${errorMessage}`, undefined, taskId)
      .catch(() => {});

    await this.emitActivity(taskId, threadId, projectId, 'TASK_FAILED', {
      status: 'FAILED',
      failureReason: errorMessage,
      stepsCompleted: state.totalStepsExecuted,
      toolCallsExecuted: state.toolCallCount,
      durationMs,
    });

    return {
      taskId,
      status: 'FAILED',
      stepsCompleted: state.totalStepsExecuted,
      toolCallsExecuted: state.toolCallCount,
      planStatus: 'FAILED',
      failureReason: errorMessage,
      durationMs,
    };
  }

  // ============================================================================
  // Project / Tenant Authorization
  // ============================================================================

  private async assertProjectAccess(projectId: string, userId?: string): Promise<void> {
    if (!userId) {
      return;
    }
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });
    if (!project) {
      throw new AgentLoopCrossProjectAccessError(
        `User "${userId}" does not have access to project "${projectId}".`,
      );
    }
  }

  public static clearStateForTest(taskId?: string): void {
    if (taskId) {
      AgentLoop.activeStates.delete(taskId);
    } else {
      AgentLoop.activeStates.clear();
    }
    AgentConcurrencyManager.clearAllForTest();
  }
}
