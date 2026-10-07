/**
 * @file packages/core/src/agent-loop/agent-state.ts
 * In-memory lifecycle & execution state tracking for V10 Phase 153: Agent Execution Loop.
 */

import type {
  AgentLoopStatus,
  AgentLoopSafetyLimits,
  AgentLoopObservationDto,
  AgentLoopStateDto,
} from '@ai-quality/contracts';
import { AgentLoopSafetyLimitExceededError, AgentLoopTimeoutError } from './agent-loop-errors.js';

export interface AgentStateOptions {
  readonly taskId: string;
  readonly threadId: string;
  readonly projectId: string;
  readonly userId: string;
  readonly safetyLimits?: Partial<AgentLoopSafetyLimits>;
}

export class AgentState {
  public readonly taskId: string;
  public readonly threadId: string;
  public readonly projectId: string;
  public readonly userId: string;

  public status: AgentLoopStatus = 'IDLE';
  public stepIndex = 0;
  public totalStepsExecuted = 0;
  public toolCallCount = 0;
  public consecutiveFailures = 0;

  public activePlanId: string | null = null;
  public activeStepId: string | null = null;
  public activeToolName: string | null = null;
  public pendingApprovalId: string | null = null;
  public failureReason: string | null = null;

  public readonly startTime: number;
  public completedTime: number | null = null;

  public readonly safetyLimits: Required<AgentLoopSafetyLimits>;
  public readonly observations: AgentLoopObservationDto[] = [];

  private cancellationRequested = false;
  private cancellationReason: string | null = null;
  private pauseRequested = false;
  private pauseReason: string | null = null;
  private stopRequested = false;
  private stopReason: string | null = null;

  constructor(options: AgentStateOptions) {
    this.taskId = options.taskId;
    this.threadId = options.threadId;
    this.projectId = options.projectId;
    this.userId = options.userId;
    this.startTime = Date.now();

    this.safetyLimits = {
      maxSteps: options.safetyLimits?.maxSteps ?? 25,
      maxConsecutiveFailures: options.safetyLimits?.maxConsecutiveFailures ?? 3,
      maxDurationMs: options.safetyLimits?.maxDurationMs ?? 300000, // 5 min
      maxToolCalls: options.safetyLimits?.maxToolCalls ?? 50,
    };
  }

  public getElapsedTimeMs(): number {
    return Date.now() - this.startTime;
  }

  public requestCancellation(reason?: string): void {
    this.cancellationRequested = true;
    this.cancellationReason = reason ?? 'Execution cancelled';
    this.status = 'CANCELLED';
  }

  public isCancellationRequested(): boolean {
    return this.cancellationRequested;
  }

  public getCancellationReason(): string | null {
    return this.cancellationReason;
  }

  public requestPause(reason?: string): void {
    this.pauseRequested = true;
    this.pauseReason = reason ?? 'Execution paused';
  }

  public isPauseRequested(): boolean {
    return this.pauseRequested;
  }

  public getPauseReason(): string | null {
    return this.pauseReason;
  }

  public requestStop(reason?: string): void {
    this.stopRequested = true;
    this.stopReason = reason ?? 'Execution stopped';
  }

  public isStopRequested(): boolean {
    return this.stopRequested;
  }

  public getStopReason(): string | null {
    return this.stopReason;
  }

  /**
   * Enforces all safety limit boundaries before proceeding with next step or tool execution.
   */
  public assertSafetyLimits(): void {
    const elapsed = this.getElapsedTimeMs();
    if (elapsed > this.safetyLimits.maxDurationMs) {
      throw new AgentLoopTimeoutError(elapsed, this.safetyLimits.maxDurationMs);
    }

    if (this.totalStepsExecuted >= this.safetyLimits.maxSteps) {
      throw new AgentLoopSafetyLimitExceededError(
        'maxSteps',
        this.totalStepsExecuted,
        this.safetyLimits.maxSteps,
      );
    }

    if (this.consecutiveFailures >= this.safetyLimits.maxConsecutiveFailures) {
      throw new AgentLoopSafetyLimitExceededError(
        'maxConsecutiveFailures',
        this.consecutiveFailures,
        this.safetyLimits.maxConsecutiveFailures,
      );
    }

    if (this.toolCallCount >= this.safetyLimits.maxToolCalls) {
      throw new AgentLoopSafetyLimitExceededError(
        'maxToolCalls',
        this.toolCallCount,
        this.safetyLimits.maxToolCalls,
      );
    }
  }

  public recordStepStarted(stepId: string, toolAction?: string): void {
    this.activeStepId = stepId;
    this.activeToolName = toolAction ?? null;
  }

  public recordStepCompleted(stepId: string): void {
    this.totalStepsExecuted++;
    this.consecutiveFailures = 0;
    if (this.activeStepId === stepId) {
      this.activeStepId = null;
      this.activeToolName = null;
    }
  }

  public recordStepFailed(stepId: string, error: string): void {
    this.totalStepsExecuted++;
    this.consecutiveFailures++;
    this.failureReason = error;
    if (this.activeStepId === stepId) {
      this.activeStepId = null;
      this.activeToolName = null;
    }
  }

  public recordToolCallSuccess(
    stepId: string,
    toolName: string,
    output: unknown,
    durationMs: number,
  ): void {
    this.toolCallCount++;
    this.consecutiveFailures = 0;
    this.observations.push({
      stepId,
      toolName,
      result: output,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  }

  public recordToolCallFailure(
    stepId: string,
    toolName: string,
    error: string,
    durationMs: number,
  ): void {
    this.toolCallCount++;
    this.consecutiveFailures++;
    this.observations.push({
      stepId,
      toolName,
      error,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  }

  public toDto(): AgentLoopStateDto {
    return {
      taskId: this.taskId,
      threadId: this.threadId,
      projectId: this.projectId,
      status: this.status,
      currentStepSequence: this.stepIndex,
      totalStepsExecuted: this.totalStepsExecuted,
      toolCallsCount: this.toolCallCount,
      consecutiveFailures: this.consecutiveFailures,
      activePlanId: this.activePlanId,
      activeStepId: this.activeStepId,
      activeToolName: this.activeToolName,
      pendingApprovalId: this.pendingApprovalId,
      failureReason: this.failureReason,
      startedAt: new Date(this.startTime).toISOString(),
      completedAt: this.completedTime ? new Date(this.completedTime).toISOString() : null,
      durationMs: this.completedTime
        ? this.completedTime - this.startTime
        : this.getElapsedTimeMs(),
    };
  }
}
