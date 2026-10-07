/**
 * @file packages/core/src/agent-tools/repair-patch/repair-patch-tool-errors.ts
 * Domain errors for V10 Phase 149 Repair / Patch Tool.
 */

import { AgentToolError } from '../agent-tool-errors.js';

export class RepairPatchToolError extends AgentToolError {
  constructor(code: any, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'RepairPatchToolError';
  }
}

export class RepairPatchValidationError extends RepairPatchToolError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, details);
    this.name = 'RepairPatchValidationError';
  }
}

export class RepairPatchPathTraversalError extends RepairPatchToolError {
  constructor(path: string, reason?: string) {
    super(
      'PATH_TRAVERSAL_DETECTED',
      `Path traversal rejected for path '${path}': ${reason ?? 'path attempts to escape sandbox boundary'}.`,
      { path, reason },
    );
    this.name = 'RepairPatchPathTraversalError';
  }
}

export class RepairPatchAbsolutePathError extends RepairPatchToolError {
  constructor(path: string) {
    super(
      'ABSOLUTE_PATH_REJECTED',
      `Absolute filesystem path rejected: '${path}'. Only relative paths contained in project workspace are allowed.`,
      { path },
    );
    this.name = 'RepairPatchAbsolutePathError';
  }
}

export class RepairPatchProtectedFileError extends RepairPatchToolError {
  constructor(path: string, reason?: string) {
    super(
      'PROTECTED_FILE_MODIFICATION_BLOCKED',
      `Modification of protected/sensitive file '${path}' is strictly blocked: ${reason ?? 'system/credential protection policy'}.`,
      { path, reason },
    );
    this.name = 'RepairPatchProtectedFileError';
  }
}

export class RepairPatchOversizedError extends RepairPatchToolError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('PATCH_SIZE_LIMIT_EXCEEDED', message, details);
    this.name = 'RepairPatchOversizedError';
  }
}

export class RepairPatchMalformedError extends RepairPatchToolError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('MALFORMED_PATCH_ERROR', message, details);
    this.name = 'RepairPatchMalformedError';
  }
}

export class RepairPatchApprovalRequiredError extends RepairPatchToolError {
  constructor(proposalId: string, currentStatus: string) {
    super(
      'APPROVAL_REQUIRED',
      `Cannot apply patch proposal '${proposalId}': Current status is '${currentStatus}'. Explicit human approval (status 'APPROVED') is required before application.`,
      { proposalId, currentStatus },
    );
    this.name = 'RepairPatchApprovalRequiredError';
  }
}

export class RepairPatchAlreadyDecidedError extends RepairPatchToolError {
  constructor(proposalId: string, status: string) {
    super(
      'PATCH_ALREADY_DECIDED',
      `Patch proposal '${proposalId}' has already been decided with status '${status}'.`,
      { proposalId, status },
    );
    this.name = 'RepairPatchAlreadyDecidedError';
  }
}

export class RepairPatchNotFoundError extends RepairPatchToolError {
  constructor(proposalId: string, projectId?: string) {
    super(
      'NOT_FOUND',
      `Patch proposal '${proposalId}' was not found in project '${projectId ?? 'unknown'}'.`,
      { proposalId, projectId },
    );
    this.name = 'RepairPatchNotFoundError';
  }
}

export class RepairPatchApplyFailedError extends RepairPatchToolError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('PATCH_APPLY_FAILED', message, details);
    this.name = 'RepairPatchApplyFailedError';
  }
}
