/**
 * @file packages/core/src/reverification/reverification-errors.ts
 * Domain error classes for Defect Reverification Foundation (V7 Phase 97).
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export abstract class ReverificationError extends Error {
  public abstract readonly code: DesktopErrorCode;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ReverificationNotFoundError extends ReverificationError {
  public readonly code: DesktopErrorCode = 'REVERIFICATION_NOT_FOUND';

  constructor(identifier: string) {
    super(`Reverification record not found: ${identifier}`);
  }
}

export class ReverificationIneligibleError extends ReverificationError {
  public readonly code: DesktopErrorCode = 'REVERIFICATION_NOT_ELIGIBLE';

  constructor(
    reason: string,
    public readonly reasons: readonly string[] = [reason],
  ) {
    super(`Defect is not eligible for reverification: ${reason}`);
  }
}

export class ReverificationBlockedError extends ReverificationError {
  public readonly code: DesktopErrorCode = 'REVERIFICATION_BLOCKED';

  constructor(
    reason: string,
    public readonly reasons: readonly string[] = [reason],
  ) {
    super(`Defect reverification is blocked: ${reason}`);
  }
}

export class ReverificationCrossProjectForbiddenError extends ReverificationError {
  public readonly code: DesktopErrorCode = 'REVERIFICATION_CROSS_PROJECT_FORBIDDEN';

  constructor(message: string = 'Cross-project reverification operations are strictly forbidden.') {
    super(message);
  }
}

export class ReverificationUnsafeEnvironmentError extends ReverificationError {
  public readonly code: DesktopErrorCode = 'REVERIFICATION_UNSAFE_ENVIRONMENT';

  constructor(reason: string) {
    super(`Target environment violates production safety policy: ${reason}`);
  }
}

export class ReverificationHistoricalTestUnavailableError extends ReverificationError {
  public readonly code: DesktopErrorCode = 'REVERIFICATION_HISTORICAL_TEST_UNAVAILABLE';

  constructor(testCaseId: string, versionNumber: number) {
    super(`Historical test version ${versionNumber} for test case ${testCaseId} is unavailable.`);
  }
}

export class ReverificationManualFixForbiddenError extends ReverificationError {
  public readonly code: DesktopErrorCode = 'REVERIFICATION_MANUAL_FIX_FORBIDDEN';

  constructor(
    message: string = 'Manual marking of defect as VERIFIED_FIXED without Phase 98 execution evidence is strictly prohibited.',
  ) {
    super(message);
  }
}

export class ReverificationImmutableError extends ReverificationError {
  public readonly code: DesktopErrorCode = 'REVERIFICATION_IMMUTABLE';

  constructor(
    message: string = 'Historical execution, test run, or reproduction record is immutable and cannot be altered.',
  ) {
    super(message);
  }
}
