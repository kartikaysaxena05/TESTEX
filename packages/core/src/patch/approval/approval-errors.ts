/**
 * @file packages/core/src/patch/approval/approval-errors.ts
 * Domain error classes for V7 Phase 104 Human Approval, Reject & Apply Workflow.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export class PatchApprovalError extends Error {
  readonly code: DesktopErrorCode;

  constructor(message: string, code: DesktopErrorCode = 'VALIDATION_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PatchApprovalNotFoundError extends PatchApprovalError {
  constructor(message: string = 'Patch approval record not found.') {
    super(message, 'PATCH_APPROVAL_NOT_FOUND');
  }
}

export class PatchApprovalCrossProjectError extends PatchApprovalError {
  constructor(message: string = 'Cross-project access forbidden for patch approval/apply.') {
    super(message, 'PATCH_APPROVAL_CROSS_PROJECT');
  }
}

export class PatchApprovalInvalidStateTransitionError extends PatchApprovalError {
  constructor(message: string = 'Invalid patch approval state transition.') {
    super(message, 'PATCH_APPROVAL_INVALID_STATE_TRANSITION');
  }
}

export class PatchApprovalValidationNotValidError extends PatchApprovalError {
  constructor(
    message: string = 'Only patches with a VALID Phase 103 validation outcome can be approved.',
  ) {
    super(message, 'PATCH_APPROVAL_VALIDATION_NOT_VALID');
  }
}

export class PatchApprovalStaleValidationError extends PatchApprovalError {
  constructor(
    message: string = 'Patch validation is stale or superseded. Re-validation is required before review.',
  ) {
    super(message, 'PATCH_APPROVAL_STALE_VALIDATION');
  }
}

export class PatchApprovalHashMismatchError extends PatchApprovalError {
  constructor(
    message: string = 'Patch immutability violation: patch content does not match the reviewed hash.',
  ) {
    super(message, 'PATCH_APPROVAL_HASH_MISMATCH');
  }
}

export class PatchApprovalRepositoryDriftError extends PatchApprovalError {
  constructor(
    message: string = 'Repository base has drifted since patch review/validation. Apply blocked.',
  ) {
    super(message, 'PATCH_APPROVAL_REPOSITORY_DRIFT');
  }
}

export class PatchApprovalNotApprovedError extends PatchApprovalError {
  constructor(
    message: string = 'Patch application blocked: explicit human approval is strictly required.',
  ) {
    super(message, 'PATCH_APPROVAL_NOT_APPROVED');
  }
}

export class PatchApprovalAlreadyAppliedError extends PatchApprovalError {
  constructor(message: string = 'Patch has already been applied to workspace.') {
    super(message, 'PATCH_APPROVAL_ALREADY_APPLIED');
  }
}

export class PatchApprovalApplyFailedError extends PatchApprovalError {
  constructor(message: string = 'Failed to apply patch to workspace.') {
    super(message, 'PATCH_APPROVAL_APPLY_FAILED');
  }
}

export class PatchApprovalScopeViolationError extends PatchApprovalError {
  constructor(
    message: string = 'Patch attempted to modify files outside approved candidate scope or protected paths.',
  ) {
    super(message, 'PATCH_APPROVAL_SCOPE_VIOLATION');
  }
}

export class PatchApprovalConcurrentMutationError extends PatchApprovalError {
  constructor(
    message: string = 'Concurrent review/apply mutation in progress for this patch approval.',
  ) {
    super(message, 'PATCH_APPROVAL_CONCURRENT_MUTATION');
  }
}
