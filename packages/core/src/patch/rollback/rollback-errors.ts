/**
 * @file packages/core/src/patch/rollback/rollback-errors.ts
 * Domain errors for V7 Phase 105 Patch Rollback & Recovery.
 */

import type {
  DesktopErrorCode,
  PatchRollbackConflictTypeDto,
  RollbackConflictItemDto,
} from '@ai-quality/contracts';

export class PatchRollbackError extends Error {
  public readonly code: DesktopErrorCode;

  constructor(message: string, code: DesktopErrorCode) {
    super(message);
    this.name = 'PatchRollbackError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PatchRollbackNotFoundError extends PatchRollbackError {
  constructor(message = 'Patch rollback or approval record not found.') {
    super(message, 'PATCH_ROLLBACK_NOT_FOUND');
    this.name = 'PatchRollbackNotFoundError';
  }
}

export class PatchRollbackCrossProjectError extends PatchRollbackError {
  constructor(message = 'Cross-project rollback access is forbidden.') {
    super(message, 'PATCH_ROLLBACK_CROSS_PROJECT');
    this.name = 'PatchRollbackCrossProjectError';
  }
}

export class PatchRollbackInvalidStateError extends PatchRollbackError {
  constructor(message = 'Patch is not in a valid state for rollback.') {
    super(message, 'PATCH_ROLLBACK_INVALID_STATE');
    this.name = 'PatchRollbackInvalidStateError';
  }
}

export class PatchRollbackNotAppliedError extends PatchRollbackError {
  constructor(message = 'Cannot rollback: Patch has not been applied to the workspace.') {
    super(message, 'PATCH_ROLLBACK_NOT_APPLIED');
    this.name = 'PatchRollbackNotAppliedError';
  }
}

export class PatchRollbackAlreadyAppliedError extends PatchRollbackError {
  constructor(message = 'Patch has already been rolled back.') {
    super(message, 'PATCH_ROLLBACK_INVALID_STATE');
    this.name = 'PatchRollbackAlreadyAppliedError';
  }
}

export class PatchRollbackConflictError extends PatchRollbackError {
  public readonly conflictType: PatchRollbackConflictTypeDto;
  public readonly conflicts: RollbackConflictItemDto[];

  constructor(
    message: string,
    conflictType: PatchRollbackConflictTypeDto,
    conflicts: RollbackConflictItemDto[] = [],
  ) {
    super(message, 'PATCH_ROLLBACK_CONFLICT');
    this.name = 'PatchRollbackConflictError';
    this.conflictType = conflictType;
    this.conflicts = conflicts;
  }
}

export class PatchRollbackDriftDetectedError extends PatchRollbackError {
  constructor(message = 'Repository base revision drift detected. Rollback blocked.') {
    super(message, 'PATCH_ROLLBACK_DRIFT_DETECTED');
    this.name = 'PatchRollbackDriftDetectedError';
  }
}

export class PatchRollbackRecoveryFailedError extends PatchRollbackError {
  constructor(message = 'Failed to execute or restore from recovery point.') {
    super(message, 'PATCH_ROLLBACK_RECOVERY_FAILED');
    this.name = 'PatchRollbackRecoveryFailedError';
  }
}

export class PatchRollbackIntegrityFailedError extends PatchRollbackError {
  constructor(message = 'Post-rollback repository integrity verification failed.') {
    super(message, 'PATCH_ROLLBACK_INTEGRITY_FAILED');
    this.name = 'PatchRollbackIntegrityFailedError';
  }
}

export class PatchRollbackConcurrentMutationError extends PatchRollbackError {
  constructor(message = 'A rollback or patch mutation is already in progress.') {
    super(message, 'PATCH_ROLLBACK_CONCURRENT_MUTATION');
    this.name = 'PatchRollbackConcurrentMutationError';
  }
}

export class PatchRollbackRecoveryRequiredError extends PatchRollbackError {
  constructor(message = 'Interrupted rollback detected. Manual or automated recovery required.') {
    super(message, 'PATCH_ROLLBACK_RECOVERY_REQUIRED');
    this.name = 'PatchRollbackRecoveryRequiredError';
  }
}
