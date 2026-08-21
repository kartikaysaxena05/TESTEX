import type { DesktopErrorCode } from '@ai-quality/contracts';

/**
 * Base domain error for Test Case operations.
 */
export abstract class TestCaseError extends Error {
  abstract readonly code: DesktopErrorCode;
  readonly httpStatus: number;

  constructor(message: string, httpStatus = 400) {
    super(message);
    this.name = this.constructor.name;
    this.httpStatus = httpStatus;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TestCaseProjectMismatchError extends TestCaseError {
  readonly code: DesktopErrorCode = 'TEST_CASE_PROJECT_MISMATCH';
  constructor(message = 'Project mismatch: Test case does not belong to specified project.') {
    super(message, 403);
  }
}

export class TestCaseNotFoundError extends TestCaseError {
  readonly code: DesktopErrorCode = 'TEST_CASE_NOT_FOUND';
  constructor(testCaseId: string) {
    super(`Test case with ID '${testCaseId}' not found.`, 404);
  }
}

export class TestCaseRequirementNotFoundError extends TestCaseError {
  readonly code: DesktopErrorCode = 'TEST_CASE_REQUIREMENT_NOT_FOUND';
  constructor(requirementId: string) {
    super(`Source requirement with ID '${requirementId}' not found.`, 404);
  }
}

export class TestCaseVersionMismatchError extends TestCaseError {
  readonly code: DesktopErrorCode = 'TEST_CASE_VERSION_MISMATCH';
  constructor(message = 'Source requirement version mismatch or not found.') {
    super(message, 409);
  }
}

export class TestCaseValidationError extends TestCaseError {
  readonly code: DesktopErrorCode = 'TEST_CASE_VALIDATION_FAILED';
  constructor(message: string) {
    super(message, 422);
  }
}

export class TestCaseDuplicateKeyError extends TestCaseError {
  readonly code: DesktopErrorCode = 'TEST_CASE_DUPLICATE_KEY';
  constructor(key: string) {
    super(`Test case key '${key}' already exists in this project.`, 409);
  }
}

export class TestCaseConcurrencyError extends TestCaseError {
  readonly code: DesktopErrorCode = 'TEST_CASE_CONCURRENCY_ERROR';
  constructor(message = 'Concurrent modification error during test case operation.') {
    super(message, 409);
  }
}

export class TestCasePersistenceError extends TestCaseError {
  readonly code: DesktopErrorCode = 'TEST_CASE_PERSISTENCE_FAILED';
  constructor(message: string, originalError?: unknown) {
    super(message, 500);
    if (originalError instanceof Error) {
      this.cause = originalError;
    }
  }
}

export class TestCaseIdempotencyConflictError extends TestCaseError {
  readonly code: DesktopErrorCode = 'TEST_CASE_IDEMPOTENCY_CONFLICT';
  constructor(message = 'Conflicting idempotency key for test case operation.') {
    super(message, 409);
  }
}
