/**
 * @file packages/core/src/agent-activity/agent-activity-errors.ts
 * Domain errors for V10 Phase 154 Streaming Activity & Tool Progress UI.
 */

export class AgentActivityError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, code = 'AGENT_ACTIVITY_ERROR', details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AgentActivityNotFoundError extends AgentActivityError {
  constructor(message: string, details?: unknown) {
    super(message, 'AGENT_ACTIVITY_NOT_FOUND', details);
  }
}

export class AgentActivityUnauthorizedError extends AgentActivityError {
  constructor(message: string, details?: unknown) {
    super(message, 'AGENT_ACTIVITY_UNAUTHORIZED', details);
  }
}

export class AgentActivityInvalidEventError extends AgentActivityError {
  constructor(message: string, details?: unknown) {
    super(message, 'AGENT_ACTIVITY_INVALID_EVENT', details);
  }
}
