/**
 * @file packages/core/src/agent-approval/agent-approval-errors.ts
 * Domain errors for V10 Phase 155: Human Approval Gates.
 */

export class ApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalError';
  }
}

export class ApprovalNotFoundError extends ApprovalError {
  constructor(public readonly approvalId: string) {
    super(`Approval request "${approvalId}" was not found.`);
    this.name = 'ApprovalNotFoundError';
  }
}

export class ApprovalAlreadyDecidedError extends ApprovalError {
  constructor(
    public readonly approvalId: string,
    public readonly currentStatus: string,
  ) {
    super(
      `Approval request "${approvalId}" has already been decided with status "${currentStatus}".`,
    );
    this.name = 'ApprovalAlreadyDecidedError';
  }
}

export class ApprovalExpiredError extends ApprovalError {
  constructor(public readonly approvalId: string) {
    super(`Approval request "${approvalId}" has expired and can no longer be decided.`);
    this.name = 'ApprovalExpiredError';
  }
}

export class ApprovalCancelledError extends ApprovalError {
  constructor(public readonly approvalId: string) {
    super(`Approval request "${approvalId}" was cancelled and cannot be executed.`);
    this.name = 'ApprovalCancelledError';
  }
}

export class ApprovalActionModifiedError extends ApprovalError {
  constructor(
    public readonly approvalId: string,
    public readonly expectedHash: string,
    public readonly actualHash: string,
  ) {
    super(
      `Requested action for approval "${approvalId}" has been modified (expected hash "${expectedHash}", got "${actualHash}"). New approval required.`,
    );
    this.name = 'ApprovalActionModifiedError';
  }
}

export class ApprovalUnauthorizedError extends ApprovalError {
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalUnauthorizedError';
  }
}

export class ApprovalConflictError extends ApprovalError {
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalConflictError';
  }
}

export class ApprovalValidationError extends ApprovalError {
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalValidationError';
  }
}
