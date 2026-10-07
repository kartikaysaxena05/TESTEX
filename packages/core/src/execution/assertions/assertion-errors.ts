/**
 * @file packages/core/src/execution/assertions/assertion-errors.ts
 * Strongly typed error taxonomy for the Phase 67 Assertion & Verification Engine.
 */

import { ExecutionDomainError } from '../execution-errors.js';
import type { DesktopErrorCode } from '@ai-quality/contracts';

export class AssertionEvaluationError extends ExecutionDomainError {
  public override readonly code: DesktopErrorCode;
  public readonly expected?: unknown;
  public readonly actual?: unknown;

  constructor(
    message: string,
    expected?: unknown,
    actual?: unknown,
    code: DesktopErrorCode = 'ASSERTION_FAILED',
  ) {
    super(message);
    this.name = 'AssertionEvaluationError';
    this.code = code;
    this.expected = expected;
    this.actual = actual;
  }
}

export class AssertionTimeoutError extends ExecutionDomainError {
  public override readonly code: DesktopErrorCode = 'ASSERTION_TIMEOUT';
  public readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = 'AssertionTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class InvalidAssertionTypeError extends ExecutionDomainError {
  public override readonly code: DesktopErrorCode = 'INVALID_ASSERTION_TYPE';

  constructor(type: string) {
    super(`Unsupported or invalid assertion type: '${type}'.`);
    this.name = 'InvalidAssertionTypeError';
  }
}

export class InvalidAssertionOperatorError extends ExecutionDomainError {
  public override readonly code: DesktopErrorCode = 'INVALID_ASSERTION_OPERATOR';

  constructor(type: string, operator: string) {
    super(`Operator '${operator}' is not valid for assertion type '${type}'.`);
    this.name = 'InvalidAssertionOperatorError';
  }
}

export class InvalidExpectedValueError extends ExecutionDomainError {
  public override readonly code: DesktopErrorCode = 'INVALID_EXPECTED_VALUE';

  constructor(reason: string) {
    super(`Invalid expected value for assertion: ${reason}`);
    this.name = 'InvalidExpectedValueError';
  }
}

export class MalformedRegexError extends ExecutionDomainError {
  public override readonly code: DesktopErrorCode = 'MALFORMED_REGEX';

  constructor(pattern: string, details?: string) {
    super(
      `Malformed or unsafe regex pattern '${pattern}': ${details || 'invalid regular expression syntax'}`,
    );
    this.name = 'MalformedRegexError';
  }
}

export class UnresolvedVariableError extends ExecutionDomainError {
  public override readonly code: DesktopErrorCode = 'UNRESOLVED_VARIABLE';

  constructor(variableName: string) {
    super(`Runtime variable '{{${variableName}}}' could not be resolved from execution state.`);
    this.name = 'UnresolvedVariableError';
  }
}

export class UnsupportedAssertionError extends ExecutionDomainError {
  public override readonly code: DesktopErrorCode = 'UNSUPPORTED_ASSERTION';

  constructor(description: string) {
    super(`Expectation cannot be deterministically verified: '${description}'.`);
    this.name = 'UnsupportedAssertionError';
  }
}

export class AssertionTargetResolutionError extends ExecutionDomainError {
  public override readonly code: DesktopErrorCode;

  constructor(message: string, code: DesktopErrorCode = 'LOCATOR_NOT_FOUND') {
    super(message);
    this.name = 'AssertionTargetResolutionError';
    this.code = code;
  }
}
