/**
 * @file packages/core/src/traceability/traceability-errors.ts
 * Domain error classes for Requirement-to-Test Traceability.
 */

export class TraceabilityError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'TraceabilityError';
  }
}

export class TraceNotFoundError extends TraceabilityError {
  constructor(message = 'Trace relationship not found.') {
    super(message);
    this.name = 'TraceNotFoundError';
  }
}

export class TraceProjectMismatchError extends TraceabilityError {
  constructor(message = 'Project mismatch in trace operation.') {
    super(message);
    this.name = 'TraceProjectMismatchError';
  }
}

export class TraceRequirementNotFoundError extends TraceabilityError {
  constructor(message = 'Requirement not found for trace operation.') {
    super(message);
    this.name = 'TraceRequirementNotFoundError';
  }
}

export class TraceTestCaseNotFoundError extends TraceabilityError {
  constructor(message = 'Test case not found for trace operation.') {
    super(message);
    this.name = 'TraceTestCaseNotFoundError';
  }
}

export class TraceDuplicateError extends TraceabilityError {
  constructor(message = 'Trace link between requirement and test case already exists.') {
    super(message);
    this.name = 'TraceDuplicateError';
  }
}

export class TraceValidationError extends TraceabilityError {
  constructor(message: string) {
    super(message);
    this.name = 'TraceValidationError';
  }
}
