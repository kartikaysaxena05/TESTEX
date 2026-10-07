/**
 * @file packages/core/src/verification/verification-errors.ts
 * Domain error classes for Automated Failed-Test Rerun & Fix Verification (V7 Phase 98).
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export abstract class VerificationError extends Error {
  public abstract readonly code: DesktopErrorCode;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class VerificationNotFoundError extends VerificationError {
  public readonly code: DesktopErrorCode = 'VERIFICATION_NOT_FOUND';

  constructor(identifier: string) {
    super(`Verification record or attempt not found: ${identifier}`);
  }
}

export class VerificationInProgressError extends VerificationError {
  public readonly code: DesktopErrorCode = 'VERIFICATION_IN_PROGRESS';

  constructor(identifier: string) {
    super(`Verification is already in progress for defect or reverification: ${identifier}`);
  }
}

export class VerificationAttemptLimitExceededError extends VerificationError {
  public readonly code: DesktopErrorCode = 'VERIFICATION_ATTEMPT_LIMIT_EXCEEDED';

  constructor(requested: number, max: number) {
    super(`Requested verification attempts (${requested}) exceeds maximum limit (${max}).`);
  }
}

export class VerificationCrossProjectForbiddenError extends VerificationError {
  public readonly code: DesktopErrorCode = 'REVERIFICATION_CROSS_PROJECT_FORBIDDEN';

  constructor(message: string = 'Cross-project verification operations are strictly forbidden.') {
    super(message);
  }
}

export class VerificationBlockedError extends VerificationError {
  public readonly code: DesktopErrorCode = 'VERIFICATION_BLOCKED';

  constructor(
    reason: string,
    public readonly reasons: readonly string[] = [reason],
  ) {
    super(`Verification execution is blocked: ${reason}`);
  }
}

export class VerificationEnvironmentIncompatibleError extends VerificationError {
  public readonly code: DesktopErrorCode = 'VERIFICATION_ENVIRONMENT_INCOMPATIBLE';

  constructor(environmentId: string, reason: string) {
    super(`Target environment ${environmentId} is incompatible for verification: ${reason}`);
  }
}

export class VerificationExecutionError extends VerificationError {
  public readonly code: DesktopErrorCode = 'VERIFICATION_EXECUTION_FAILED';

  constructor(
    message: string,
    public readonly causeError?: unknown,
  ) {
    super(`Verification execution failed: ${message}`);
  }
}

export class VerificationCancelledError extends VerificationError {
  public readonly code: DesktopErrorCode = 'VERIFICATION_CANCELLED';

  constructor(reason: string = 'Verification was cancelled by user.') {
    super(`Verification cancelled: ${reason}`);
  }
}
