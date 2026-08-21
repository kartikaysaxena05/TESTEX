/**
 * @file packages/core/src/test-review/test-review-errors.ts
 * Domain errors for Phase 56 Test Review, Approval, Regeneration & Versioning.
 */

export class TestReviewError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code = 'TEST_REVIEW_ERROR', details?: Record<string, unknown>) {
    super(message);
    this.name = 'TestReviewError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TestReviewNotFoundError extends TestReviewError {
  constructor(testCaseId: string, projectId?: string) {
    super(
      `Test Case '${testCaseId}' was not found in project '${projectId ?? 'unknown'}'.`,
      'TEST_REVIEW_NOT_FOUND',
      { testCaseId, projectId },
    );
    this.name = 'TestReviewNotFoundError';
  }
}

export class TestVersionNotFoundError extends TestReviewError {
  constructor(testCaseId: string, versionNumber: number) {
    super(
      `Version ${versionNumber} for Test Case '${testCaseId}' was not found.`,
      'TEST_VERSION_NOT_FOUND',
      { testCaseId, versionNumber },
    );
    this.name = 'TestVersionNotFoundError';
  }
}

export class TestVersionConflictError extends TestReviewError {
  constructor(testCaseId: string, expectedVersion: number, actualVersion: number) {
    super(
      `Optimistic concurrency conflict for Test Case '${testCaseId}': expected version ${expectedVersion}, but current version is ${actualVersion}.`,
      'TEST_VERSION_CONFLICT',
      { testCaseId, expectedVersion, actualVersion },
    );
    this.name = 'TestVersionConflictError';
  }
}

export class TestReviewProjectMismatchError extends TestReviewError {
  constructor(testCaseId: string, expectedProjectId: string, actualProjectId: string) {
    super(
      `Test Case '${testCaseId}' belongs to project '${actualProjectId}', not '${expectedProjectId}'.`,
      'TEST_REVIEW_PROJECT_MISMATCH',
      { testCaseId, expectedProjectId, actualProjectId },
    );
    this.name = 'TestReviewProjectMismatchError';
  }
}

export class TestReviewInvalidTransitionError extends TestReviewError {
  constructor(fromStatus: string, toStatus: string, reason?: string) {
    super(
      `Invalid review transition from '${fromStatus}' to '${toStatus}'${reason ? `: ${reason}` : ''}.`,
      'TEST_REVIEW_INVALID_TRANSITION',
      { fromStatus, toStatus, reason },
    );
    this.name = 'TestReviewInvalidTransitionError';
  }
}

export class TestRegenerationFailedError extends TestReviewError {
  constructor(testCaseId: string, cause: string) {
    super(
      `Regeneration failed for Test Case '${testCaseId}': ${cause}`,
      'TEST_REGENERATION_FAILED',
      { testCaseId, cause },
    );
    this.name = 'TestRegenerationFailedError';
  }
}

export class TestReviewValidationError extends TestReviewError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'TEST_REVIEW_VALIDATION_FAILED', details);
    this.name = 'TestReviewValidationError';
  }
}
