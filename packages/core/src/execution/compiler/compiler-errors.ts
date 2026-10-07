/**
 * @file packages/core/src/execution/compiler/compiler-errors.ts
 * Strongly typed error hierarchy for the Executable Test Plan Compiler.
 */

export class CompilerBaseError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TestPlanNotFoundError extends CompilerBaseError {
  constructor(planId: string, projectId: string) {
    super(
      `Executable test plan '${planId}' not found for project '${projectId}'.`,
      'TEST_PLAN_NOT_FOUND',
      { planId, projectId },
    );
  }
}

export class TestNotApprovedError extends CompilerBaseError {
  constructor(testCaseId: string, versionNumber: number, reviewStatus: string) {
    super(
      `Test case '${testCaseId}' (v${versionNumber}) is in status '${reviewStatus}'. Only APPROVED tests can be compiled for execution.`,
      'TEST_NOT_APPROVED',
      { testCaseId, versionNumber, reviewStatus },
    );
  }
}

export class TestVersionStaleError extends CompilerBaseError {
  constructor(testCaseId: string, versionNumber: number, reason: string) {
    super(
      `Test case '${testCaseId}' (v${versionNumber}) is stale: ${reason}`,
      'TEST_VERSION_STALE',
      { testCaseId, versionNumber, reason },
    );
  }
}

export class TestEnvironmentMismatchError extends CompilerBaseError {
  constructor(environmentId: string, projectId: string, environmentProjectId: string) {
    super(
      `Environment '${environmentId}' belongs to project '${environmentProjectId}', not project '${projectId}'.`,
      'TEST_ENVIRONMENT_MISMATCH',
      { environmentId, projectId, environmentProjectId },
    );
  }
}

export class CompilationExecutionError extends CompilerBaseError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'COMPILATION_ERROR', details);
  }
}

export class CompilerProjectMismatchError extends CompilerBaseError {
  constructor(resourceId: string, expectedProjectId: string, actualProjectId: string) {
    super(
      `Resource '${resourceId}' belongs to project '${actualProjectId}', not requested project '${expectedProjectId}'.`,
      'UNAUTHORIZED_SENDER',
      { resourceId, expectedProjectId, actualProjectId },
    );
  }
}

export class UnsupportedActionError extends CompilerBaseError {
  constructor(actionText: string, stepSequence: number) {
    super(
      `Step ${stepSequence} contains unsupported action: '${actionText}'.`,
      'UNSUPPORTED_ACTION_ERROR',
      { actionText, stepSequence },
    );
  }
}

export class UnsafeUrlError extends CompilerBaseError {
  constructor(url: string, stepSequence: number, reason: string) {
    super(`Step ${stepSequence} navigation URL '${url}' is unsafe: ${reason}`, 'UNSAFE_URL_ERROR', {
      url,
      stepSequence,
      reason,
    });
  }
}

export class CompilerValidationError extends CompilerBaseError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'COMPILER_VALIDATION_ERROR', details);
  }
}
