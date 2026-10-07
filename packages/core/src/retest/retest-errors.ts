/**
 * @file packages/core/src/retest/retest-errors.ts
 * Domain error classes for Requirement Change-Impact & Retest Selection.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export abstract class RetestError extends Error {
  abstract readonly code: DesktopErrorCode;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class RetestPlanNotFoundError extends RetestError {
  readonly code: DesktopErrorCode = 'RETEST_PLAN_NOT_FOUND';
  constructor(message = 'Retest plan not found.') {
    super(message);
  }
}

export class RetestSnapshotNotFoundError extends RetestError {
  readonly code: DesktopErrorCode = 'RETEST_SNAPSHOT_NOT_FOUND';
  constructor(message = 'Change snapshot not found.') {
    super(message);
  }
}

export class RetestProjectMismatchError extends RetestError {
  readonly code: DesktopErrorCode = 'RETEST_PROJECT_MISMATCH';
  constructor(message = 'Entity does not belong to the specified project.') {
    super(message);
  }
}

export class RetestValidationError extends RetestError {
  readonly code: DesktopErrorCode = 'RETEST_VALIDATION_ERROR';
  constructor(message = 'Retest validation failed.') {
    super(message);
  }
}

export class RetestPatchNotFoundError extends RetestError {
  readonly code: DesktopErrorCode = 'RETEST_PATCH_NOT_FOUND';
  constructor(message = 'Approved patch or patch proposal not found.') {
    super(message);
  }
}

export class RetestRequirementNotFoundError extends RetestError {
  readonly code: DesktopErrorCode = 'RETEST_REQUIREMENT_NOT_FOUND';
  constructor(message = 'Requirement not found.') {
    super(message);
  }
}

export class RetestConcurrentAnalysisError extends RetestError {
  readonly code: DesktopErrorCode = 'RETEST_CONCURRENT_ANALYSIS_ERROR';
  constructor(message = 'Another impact analysis is already running for this project/snapshot.') {
    super(message);
  }
}

export class RetestUnboundedScopeError extends RetestError {
  readonly code: DesktopErrorCode = 'RETEST_UNBOUNDED_SCOPE_ERROR';
  constructor(message = 'Change scope cannot be safely bounded; full regression is required.') {
    super(message);
  }
}
