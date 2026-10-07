/**
 * @file packages/core/src/agent-loop/agent-loop-errors.ts
 * Domain errors for V10 Phase 153: Agent Execution Loop.
 */

export abstract class AgentLoopError extends Error {
  public abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AgentLoopNotFoundError extends AgentLoopError {
  public readonly code = 'AGENT_LOOP_NOT_FOUND';

  constructor(message: string) {
    super(message);
  }
}

export class AgentLoopInvalidStateError extends AgentLoopError {
  public readonly code = 'AGENT_LOOP_INVALID_STATE';

  constructor(
    public readonly currentStatus: string,
    public readonly targetStatus: string,
    message?: string,
  ) {
    super(
      message ??
        `Invalid agent loop state transition from "${currentStatus}" to "${targetStatus}".`,
    );
  }
}

export class AgentLoopConcurrentExecutionError extends AgentLoopError {
  public readonly code = 'AGENT_LOOP_CONCURRENT_EXECUTION';

  constructor(public readonly taskId: string) {
    super(`Task "${taskId}" is already being executed by an active agent loop.`);
  }
}

export class AgentLoopSafetyLimitExceededError extends AgentLoopError {
  public readonly code = 'AGENT_LOOP_SAFETY_LIMIT_EXCEEDED';

  constructor(
    public readonly limitType:
      'maxSteps' | 'maxConsecutiveFailures' | 'maxDurationMs' | 'maxToolCalls',
    public readonly currentVal: number,
    public readonly maxVal: number,
  ) {
    super(
      `Agent safety limit exceeded for ${limitType}: current ${currentVal} exceeded limit of ${maxVal}.`,
    );
  }
}

export class AgentLoopTimeoutError extends AgentLoopError {
  public readonly code = 'AGENT_LOOP_TIMEOUT';

  constructor(
    public readonly durationMs: number,
    public readonly timeoutMs: number,
  ) {
    super(`Agent loop execution timed out after ${durationMs}ms (limit was ${timeoutMs}ms).`);
  }
}

export class AgentLoopCancelledError extends AgentLoopError {
  public readonly code = 'AGENT_LOOP_CANCELLED';

  constructor(
    public readonly taskId: string,
    message?: string,
  ) {
    super(message ?? `Agent loop execution for task "${taskId}" was cancelled.`);
  }
}

export class AgentLoopApprovalRequiredError extends AgentLoopError {
  public readonly code = 'AGENT_LOOP_APPROVAL_REQUIRED';

  constructor(
    public readonly approvalId: string,
    public readonly toolName: string,
    public readonly taskId: string,
  ) {
    super(
      `Agent loop execution paused: tool "${toolName}" requires human approval (approvalId: ${approvalId}).`,
    );
  }
}

export class AgentLoopToolExecutionError extends AgentLoopError {
  public readonly code = 'AGENT_LOOP_EXECUTION_FAILED';

  constructor(
    public readonly toolName: string,
    public readonly originalError: string,
  ) {
    super(`Execution of tool "${toolName}" failed: ${originalError}`);
  }
}

export class AgentLoopPlannerError extends AgentLoopError {
  public readonly code = 'AGENT_LOOP_PLANNER_FAILED';

  constructor(message: string) {
    super(`Agent planner failed: ${message}`);
  }
}

export class AgentLoopCrossProjectAccessError extends AgentLoopError {
  public readonly code = 'AGENT_LOOP_CROSS_PROJECT_ACCESS';

  constructor(message?: string) {
    super(message ?? 'Cross-project or unauthorized agent loop access rejected.');
  }
}
