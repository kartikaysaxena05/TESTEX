/**
 * @file packages/core/src/failures/reproduction/failure-reproduction-errors.ts
 * Domain errors for Failure Reproduction & Reproducibility Verification (V6 Phase 76).
 */

import { FailureDomainError } from '../failure-errors.js';

export class FailureReproductionBlockedError extends FailureDomainError {
  public override readonly code = 'REPRODUCTION_BLOCKED';
  constructor(
    public readonly failureCaseId: string,
    public readonly blockerReason: string,
    message?: string,
  ) {
    super(message ?? `Reproduction blocked for failure case '${failureCaseId}': ${blockerReason}`);
  }
}

export class HistoricalTestVersionUnavailableError extends FailureDomainError {
  public override readonly code = 'HISTORICAL_TEST_VERSION_UNAVAILABLE';
  constructor(
    public readonly testCaseId: string,
    public readonly versionNumber: number,
    message?: string,
  ) {
    super(
      message ??
        `Historical test version ${versionNumber} for test case '${testCaseId}' is unavailable or no longer executable.`,
    );
  }
}

export class ReproductionEnvironmentIncompatibleError extends FailureDomainError {
  public override readonly code = 'REPRODUCTION_ENVIRONMENT_INCOMPATIBLE';
  constructor(
    public readonly environmentId: string,
    public readonly reason: string,
    message?: string,
  ) {
    super(
      message ?? `Target reproduction environment '${environmentId}' is incompatible: ${reason}`,
    );
  }
}

export class ReproductionAttemptLimitExceededError extends FailureDomainError {
  public override readonly code = 'REPRODUCTION_ATTEMPT_LIMIT_EXCEEDED';
  constructor(
    public readonly requestedAttempts: number,
    public readonly maxAllowed: number,
    message?: string,
  ) {
    super(
      message ??
        `Requested reproduction attempts (${requestedAttempts}) exceeds maximum allowed (${maxAllowed}).`,
    );
  }
}

export class ReproductionAlreadyInProgressError extends FailureDomainError {
  public override readonly code = 'REPRODUCTION_ALREADY_IN_PROGRESS';
  constructor(
    public readonly failureCaseId: string,
    message?: string,
  ) {
    super(
      message ??
        `A reproduction attempt is already actively in progress for failure case '${failureCaseId}'.`,
    );
  }
}

export class ReproductionAttemptNotFoundError extends FailureDomainError {
  public override readonly code = 'REPRODUCTION_NOT_FOUND';
  constructor(
    public readonly attemptId: string,
    message?: string,
  ) {
    super(message ?? `Failure reproduction attempt '${attemptId}' was not found.`);
  }
}
