/**
 * @file packages/core/src/agent-runtime/agent-runtime-errors.ts
 * Typed error hierarchy for the V10 Phase 141 Agent Runtime Foundation.
 */

export class AgentRuntimeError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, code = 'AGENT_RUNTIME_ERROR', details?: unknown) {
    super(message);
    this.name = 'AgentRuntimeError';
    this.code = code;
    this.details = details;
  }
}

export class AgentInvalidStateTransitionError extends AgentRuntimeError {
  constructor(currentState: string, attemptedState: string, reason?: string) {
    super(
      `Invalid agent state transition from '${currentState}' to '${attemptedState}'${
        reason ? `: ${reason}` : '.'
      }`,
      'AGENT_INVALID_STATE',
      { currentState, attemptedState },
    );
    this.name = 'AgentInvalidStateTransitionError';
  }
}

export class AgentTimeoutError extends AgentRuntimeError {
  constructor(taskId: string, timeoutMs: number) {
    super(
      `Agent task '${taskId}' exceeded execution timeout of ${timeoutMs}ms.`,
      'AGENT_TIMEOUT',
      { taskId, timeoutMs },
    );
    this.name = 'AgentTimeoutError';
  }
}

export class AgentCancelledError extends AgentRuntimeError {
  constructor(taskId: string, reason = 'Agent task was cancelled.') {
    super(reason, 'AGENT_CANCELLED', { taskId });
    this.name = 'AgentCancelledError';
  }
}

export class AgentMalformedResponseError extends AgentRuntimeError {
  constructor(message: string, details?: unknown) {
    super(message, 'AGENT_MALFORMED_RESPONSE', details);
    this.name = 'AgentMalformedResponseError';
  }
}

export class AgentUnauthorizedToolError extends AgentRuntimeError {
  constructor(toolName: string, reason = 'Tool is not authorized or not registered.') {
    super(`Unauthorized tool execution attempt for '${toolName}': ${reason}`, 'AGENT_UNAUTHORIZED_TOOL', {
      toolName,
    });
    this.name = 'AgentUnauthorizedToolError';
  }
}
