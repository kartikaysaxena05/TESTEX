/**
 * @file packages/core/src/execution/retry/retry-errors.ts
 * Domain errors for V5 Phase 71 Retry, Flakiness Detection & Execution Recovery.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';
import { ExecutionDomainError } from '../execution-errors.js';

export class RetryPolicyValidationError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'INTERNAL_ERROR';
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 400, context);
  }
}

export class RetryExhaustedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'INTERNAL_ERROR';
  constructor(testRunId: string, maxAttempts: number, lastError?: string) {
    super(
      `Execution retries exhausted for test run '${testRunId}' after ${maxAttempts} attempts. Last error: ${lastError ?? 'Unknown failure'}`,
      422,
      { testRunId, maxAttempts, lastError },
    );
  }
}

export class UnsafeRetryBlockedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'INTERNAL_ERROR';
  constructor(testRunId: string, reason: string, stepIndex?: number | null) {
    super(
      `Automatic execution retry blocked for test run '${testRunId}' due to side-effect safety policy: ${reason}`,
      400,
      { testRunId, reason, stepIndex },
    );
  }
}

export class ExecutionRecoveryFailedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'INTERNAL_ERROR';
  constructor(testRunId: string, attempt: number, reason: string) {
    super(
      `Failed to recover browser execution session for test run '${testRunId}' on attempt ${attempt}: ${reason}`,
      500,
      { testRunId, attempt, reason },
    );
  }
}
