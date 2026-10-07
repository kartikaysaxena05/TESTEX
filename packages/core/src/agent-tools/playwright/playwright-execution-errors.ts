/**
 * @file packages/core/src/agent-tools/playwright/playwright-execution-errors.ts
 * Domain errors for V10 Phase 147: Playwright Execution Tool.
 */

export class PlaywrightExecutionToolError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code = 'PLAYWRIGHT_EXECUTION_ERROR', statusCode = 400) {
    super(message);
    this.name = 'PlaywrightExecutionToolError';
    this.code = code;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PlaywrightExecutionTestCaseNotFoundError extends PlaywrightExecutionToolError {
  constructor(testCaseIdOrKey: string, projectId: string) {
    super(
      `Test case '${testCaseIdOrKey}' was not found in project '${projectId}'.`,
      'TEST_CASE_NOT_FOUND',
      404,
    );
    this.name = 'PlaywrightExecutionTestCaseNotFoundError';
  }
}

export class PlaywrightExecutionUnauthorizedTargetError extends PlaywrightExecutionToolError {
  constructor(targetUrl: string, reason = 'Only http and https protocols are permitted for security.') {
    super(
      `Unauthorized or disallowed target URL '${targetUrl}': ${reason}`,
      'UNAUTHORIZED_TARGET_URL',
      403,
    );
    this.name = 'PlaywrightExecutionUnauthorizedTargetError';
  }
}

export class PlaywrightExecutionCancelledError extends PlaywrightExecutionToolError {
  constructor(message = 'Playwright test execution was cancelled.') {
    super(message, 'PLAYWRIGHT_EXECUTION_CANCELLED', 499);
    this.name = 'PlaywrightExecutionCancelledError';
  }
}

export class PlaywrightExecutionValidationError extends PlaywrightExecutionToolError {
  constructor(message: string) {
    super(message, 'PLAYWRIGHT_EXECUTION_VALIDATION_ERROR', 400);
    this.name = 'PlaywrightExecutionValidationError';
  }
}
