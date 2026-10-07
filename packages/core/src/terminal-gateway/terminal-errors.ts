/**
 * @file packages/core/src/terminal-gateway/terminal-errors.ts
 * Domain and security error definitions for V10 Phase 151 Sandboxed Terminal Gateway.
 */

export class TerminalGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TerminalGatewayError';
  }
}

export class TerminalValidationError extends TerminalGatewayError {
  constructor(message: string) {
    super(message);
    this.name = 'TerminalValidationError';
  }
}

export class TerminalPathTraversalError extends TerminalGatewayError {
  constructor(path: string) {
    super(`Access denied: Working directory path '${path}' contains illegal path traversal or control characters.`);
    this.name = 'TerminalPathTraversalError';
  }
}

export class TerminalOutsideWorktreeError extends TerminalGatewayError {
  constructor(path: string, worktreeRoot: string) {
    super(`Access denied: Directory '${path}' is outside the authorized project root '${worktreeRoot}'.`);
    this.name = 'TerminalOutsideWorktreeError';
  }
}

export class TerminalCommandBlockedError extends TerminalGatewayError {
  public readonly command: string;
  public readonly reason: string;

  constructor(command: string, reason: string) {
    super(`Command execution blocked by security policy: ${reason}`);
    this.name = 'TerminalCommandBlockedError';
    this.command = command;
    this.reason = reason;
  }
}

export class TerminalApprovalRequiredError extends TerminalGatewayError {
  public readonly executionId: string;
  public readonly command: string;

  constructor(executionId: string, command: string) {
    super(`Command '${command}' requires human approval before execution (execution ID: ${executionId}).`);
    this.name = 'TerminalApprovalRequiredError';
    this.executionId = executionId;
    this.command = command;
  }
}

export class TerminalSelfApprovalForbiddenError extends TerminalGatewayError {
  constructor(actor: string) {
    super(`Self-approval forbidden: Autonomous actor '${actor}' is strictly prohibited from approving terminal commands.`);
    this.name = 'TerminalSelfApprovalForbiddenError';
  }
}

export class TerminalExecutionNotFoundError extends TerminalGatewayError {
  constructor(executionId: string, projectId: string) {
    super(`Terminal execution '${executionId}' was not found in project '${projectId}'.`);
    this.name = 'TerminalExecutionNotFoundError';
  }
}

export class TerminalAlreadyDecidedError extends TerminalGatewayError {
  constructor(executionId: string, status: string) {
    super(`Terminal execution '${executionId}' has already been decided with status '${status}'.`);
    this.name = 'TerminalAlreadyDecidedError';
  }
}

export class TerminalTimeoutError extends TerminalGatewayError {
  public readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Terminal command execution timed out after ${timeoutMs}ms.`);
    this.name = 'TerminalTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class TerminalCancelledError extends TerminalGatewayError {
  constructor(message: string = 'Terminal execution was cancelled.') {
    super(message);
    this.name = 'TerminalCancelledError';
  }
}
