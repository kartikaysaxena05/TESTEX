/**
 * @file packages/core/src/test-validation/test-validation-errors.ts
 * Domain errors for AI Test Generation Validation & Hallucination Controls.
 */

export class TestValidationError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'TEST_VALIDATION_VALIDATION_FAILED') {
    super(message);
    this.name = 'TestValidationError';
    this.code = code;
  }
}

export class TestValidationNotFoundError extends TestValidationError {
  constructor(message = 'Test validation record not found.') {
    super(message, 'TEST_VALIDATION_NOT_FOUND');
    this.name = 'TestValidationNotFoundError';
  }
}

export class TestValidationProjectMismatchError extends TestValidationError {
  constructor(message = 'Validation entity belongs to a different project.') {
    super(message, 'TEST_VALIDATION_PROJECT_MISMATCH');
    this.name = 'TestValidationProjectMismatchError';
  }
}

export class TestValidationRequirementNotFoundError extends TestValidationError {
  constructor(message = 'Source requirement not found for validation.') {
    super(message, 'TEST_VALIDATION_REQUIREMENT_NOT_FOUND');
    this.name = 'TestValidationRequirementNotFoundError';
  }
}

export class TestValidationTestCaseNotFoundError extends TestValidationError {
  constructor(message = 'Test case not found for validation.') {
    super(message, 'TEST_VALIDATION_TEST_CASE_NOT_FOUND');
    this.name = 'TestValidationTestCaseNotFoundError';
  }
}

export class TestValidationExecutionError extends TestValidationError {
  constructor(message: string) {
    super(message, 'TEST_VALIDATION_VALIDATION_FAILED');
    this.name = 'TestValidationExecutionError';
  }
}
