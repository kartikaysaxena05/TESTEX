/**
 * @file packages/core/src/coverage/coverage-errors.ts
 * Domain errors for Coverage Analysis & Traceability Matrix operations.
 */

export class CoverageError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CoverageError';
  }
}

export class CoverageProjectMismatchError extends CoverageError {
  constructor(message: string = 'Requested resource does not belong to the active project.') {
    super(message);
    this.name = 'CoverageProjectMismatchError';
  }
}

export class CoverageRequirementNotFoundError extends CoverageError {
  constructor(requirementId: string) {
    super(`Requirement with ID "${requirementId}" was not found.`);
    this.name = 'CoverageRequirementNotFoundError';
  }
}

export class CoverageValidationError extends CoverageError {
  constructor(message: string) {
    super(message);
    this.name = 'CoverageValidationError';
  }
}
