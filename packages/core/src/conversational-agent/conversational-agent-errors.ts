/**
 * @file packages/core/src/conversational-agent/conversational-agent-errors.ts
 * Typed domain errors for Conversational AI Testing Agent (V8 Phase 124).
 */

export class ConversationalAgentError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, statusCode = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AgentSessionNotFoundError extends ConversationalAgentError {
  constructor(sessionId?: string, message?: string) {
    super(
      message ?? (sessionId ? `Agent session not found: "${sessionId}"` : 'Agent session not found.'),
      'AGENT_SESSION_NOT_FOUND',
      404,
      sessionId ? { sessionId } : undefined,
    );
  }
}

export class AgentAccessDeniedError extends ConversationalAgentError {
  constructor(projectId?: string, message?: string) {
    super(
      message ?? 'You do not have permission to access or operate this testing agent session.',
      'AGENT_ACCESS_DENIED',
      403,
      projectId ? { projectId } : undefined,
    );
  }
}

export class AgentInvalidRequestError extends ConversationalAgentError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'AGENT_INVALID_REQUEST', 400, details);
  }
}

export class AgentToolFailedError extends ConversationalAgentError {
  public readonly toolName: string;

  constructor(toolName: string, reason: string, details?: Record<string, unknown>) {
    super(
      `Agent tool execution failed for "${toolName}": ${reason}`,
      'AGENT_TOOL_FAILED',
      502,
      { toolName, reason, ...details },
    );
    this.toolName = toolName;
  }
}

export class AgentApprovalRequiredError extends ConversationalAgentError {
  public readonly action: string;
  public readonly approvalReason: string;

  constructor(action: string, approvalReason: string, details?: Record<string, unknown>) {
    super(
      `Action "${action}" requires explicit user approval: ${approvalReason}`,
      'AGENT_APPROVAL_REQUIRED',
      403,
      { action, approvalReason, ...details },
    );
    this.action = action;
    this.approvalReason = approvalReason;
  }
}

export class AgentRunNotFoundError extends ConversationalAgentError {
  constructor(runId?: string, message?: string) {
    super(
      message ?? (runId ? `Test execution run not found: "${runId}"` : 'Test run not found.'),
      'AGENT_RUN_NOT_FOUND',
      404,
      runId ? { runId } : undefined,
    );
  }
}

export class AgentEvidenceNotFoundError extends ConversationalAgentError {
  constructor(message?: string, details?: Record<string, unknown>) {
    super(
      message ?? 'Requested test execution evidence was not found or has expired.',
      'AGENT_EVIDENCE_NOT_FOUND',
      404,
      details,
    );
  }
}

export class AgentExecutionFailedError extends ConversationalAgentError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'AGENT_EXECUTION_FAILED', 500, details);
  }
}
