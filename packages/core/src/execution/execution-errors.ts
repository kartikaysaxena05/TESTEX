/**
 * @file packages/core/src/execution/execution-errors.ts
 * Strongly typed execution domain errors with code sanitization and context encapsulation.
 */

import type { DesktopErrorCode, DesktopError } from '@ai-quality/contracts';

/**
 * Base abstract execution domain error.
 */
export abstract class ExecutionDomainError extends Error {
  public abstract readonly code: DesktopErrorCode;
  public readonly status: number;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, status = 400, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.context = context;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public toDesktopError(): DesktopError {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

export class ExecutionRequestInvalidError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'EXECUTION_REQUEST_INVALID';
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 400, context);
  }
}

export class ExecutionProjectMismatchError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'EXECUTION_PROJECT_MISMATCH';
  constructor(testCaseId: string, requestedProjectId: string, actualProjectId: string) {
    super(
      `Test case '${testCaseId}' belongs to project '${actualProjectId}', not requested project '${requestedProjectId}'`,
      403,
      { testCaseId, requestedProjectId, actualProjectId },
    );
  }
}

export class ExecutionTestNotFoundError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'EXECUTION_TEST_NOT_FOUND';
  constructor(testCaseId: string, projectId: string) {
    super(`Test case '${testCaseId}' was not found in project '${projectId}'`, 404, {
      testCaseId,
      projectId,
    });
  }
}

export class ExecutionTestNotApprovedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'EXECUTION_TEST_NOT_APPROVED';
  constructor(testCaseId: string, currentStatus: string) {
    super(
      `Test case '${testCaseId}' cannot be executed because its review status is '${currentStatus}' (must be APPROVED)`,
      400,
      { testCaseId, currentStatus },
    );
  }
}

export class ExecutionTestStaleError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'EXECUTION_TEST_STALE';
  constructor(testCaseId: string, testVersion: number, requirementVersion: number) {
    super(
      `Test case '${testCaseId}' is stale: bound to requirement version ${testVersion}, but current requirement is version ${requirementVersion}`,
      400,
      { testCaseId, testVersion, requirementVersion },
    );
  }
}

export class ExecutionTestRejectedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'EXECUTION_TEST_REJECTED';
  constructor(testCaseId: string, reason?: string | null) {
    super(
      `Test case '${testCaseId}' is rejected and not eligible for execution${reason ? `: ${reason}` : ''}`,
      400,
      { testCaseId, reason },
    );
  }
}

export class ExecutionTestNotExecutableError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'EXECUTION_TEST_NOT_EXECUTABLE';
  constructor(testCaseId: string, reason: string) {
    super(`Test case '${testCaseId}' is not executable: ${reason}`, 400, {
      testCaseId,
      reason,
    });
  }
}

export class BrowserLaunchFailedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'BROWSER_LAUNCH_FAILED';
  constructor(engine: string, originalError?: unknown) {
    const rawMessage =
      originalError instanceof Error ? originalError.message : String(originalError ?? '');
    // Sanitize any potential internal filesystem paths
    const sanitized = rawMessage.replace(/\/[\w.-]+/g, '[path]').slice(0, 300);
    super(`Failed to launch browser engine '${engine}'${sanitized ? `: ${sanitized}` : ''}`, 500, {
      engine,
    });
  }
}

export class BrowserRuntimeError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'BROWSER_RUNTIME_ERROR';
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 500, context);
  }
}

export class BrowserUnavailableError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'BROWSER_UNAVAILABLE';
  constructor(engine: string) {
    super(
      `Browser engine '${engine}' is not available or executable binary is missing. Please ensure Playwright browsers are installed.`,
      503,
      { engine },
    );
  }
}

export class BrowserUnsupportedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'BROWSER_UNSUPPORTED';
  constructor(engine: string) {
    super(
      `Browser engine '${engine}' is not supported. Supported engines are: chromium, firefox, webkit.`,
      400,
      { engine },
    );
  }
}

export class ExecutionTimeoutError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'EXECUTION_TIMEOUT';
  constructor(operation: string, timeoutMs: number) {
    super(`Execution timed out during '${operation}' after ${timeoutMs}ms`, 408, {
      operation,
      timeoutMs,
    });
  }
}

export class ExecutionCleanupFailedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'EXECUTION_CLEANUP_FAILED';
  constructor(executionId: string, reason: string) {
    super(`Failed to cleanup execution resources for '${executionId}': ${reason}`, 500, {
      executionId,
      reason,
    });
  }
}

export class ExecutionSecurityViolationError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'EXECUTION_SECURITY_VIOLATION';
  constructor(reason: string) {
    super(`Security policy violation during execution request: ${reason}`, 403, { reason });
  }
}
