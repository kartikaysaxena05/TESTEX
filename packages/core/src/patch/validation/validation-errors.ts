/**
 * @file packages/core/src/patch/validation/validation-errors.ts
 * Domain errors for V7 Phase 103 Patch Validation & Before/After Testing.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export class PatchValidationError extends Error {
  readonly code: DesktopErrorCode;

  constructor(message: string, code: DesktopErrorCode = 'VALIDATION_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PatchValidationNotFoundError extends PatchValidationError {
  constructor(message: string = 'Patch validation record not found.') {
    super(message, 'PATCH_VALIDATION_NOT_FOUND');
  }
}

export class PatchValidationInProgressError extends PatchValidationError {
  constructor(failureCaseId: string) {
    super(
      `Patch validation is currently in progress for failure case '${failureCaseId}'. Concurrency blocked.`,
      'PATCH_VALIDATION_IN_PROGRESS',
    );
  }
}

export class PatchValidationCrossProjectError extends PatchValidationError {
  constructor(message: string = 'Cross-project access forbidden for patch validation.') {
    super(message, 'PATCH_VALIDATION_CROSS_PROJECT');
  }
}

export class PatchValidationSandboxUnavailableError extends PatchValidationError {
  constructor(message: string = 'Patch sandbox is not ready or unavailable for validation.') {
    super(message, 'PATCH_VALIDATION_SANDBOX_UNAVAILABLE');
  }
}

export class PatchValidationBaselineFailedError extends PatchValidationError {
  constructor(message: string = 'Pre-patch baseline execution failed to run.') {
    super(message, 'PATCH_VALIDATION_BEFORE_EXECUTION_FAILED');
  }
}

export class PatchValidationInconclusiveError extends PatchValidationError {
  constructor(
    message: string = 'Validation is inconclusive; baseline test unexpectedly passed without patch.',
  ) {
    super(message, 'VALIDATION_ERROR');
  }
}

export class PatchValidationRegressionError extends PatchValidationError {
  constructor(message: string = 'Patch introduced new test regressions.') {
    super(message, 'PATCH_VALIDATION_REGRESSION_DETECTED');
  }
}

export class PatchValidationQualityGateError extends PatchValidationError {
  constructor(message: string = 'Controlled quality gates failed in sandbox.') {
    super(message, 'PATCH_VALIDATION_QUALITY_GATE_FAILED');
  }
}

export class PatchValidationScopeViolationError extends PatchValidationError {
  constructor(
    message: string = 'Patch modified out-of-scope or sensitive files outside declared boundaries.',
  ) {
    super(message, 'PATCH_VALIDATION_UNEXPECTED_CHANGES');
  }
}

export class PatchValidationTimeoutError extends PatchValidationError {
  constructor(message: string = 'Patch validation exceeded maximum timeout limit.') {
    super(message, 'PATCH_VALIDATION_TIMEOUT');
  }
}

export class PatchValidationCancelledError extends PatchValidationError {
  constructor(message: string = 'Patch validation was cancelled by user.') {
    super(message, 'PATCH_VALIDATION_CANCELLED');
  }
}

export class PatchValidationImmutabilityViolationError extends PatchValidationError {
  constructor(
    message: string = 'CRITICAL: Authoritative repository was mutated during patch validation.',
  ) {
    super(message, 'PATCH_SANDBOX_IMMUTABILITY_VIOLATION');
  }
}
