/**
 * @file packages/core/src/ai/categorized-tests/categorized-test-errors.ts
 * Domain errors for Phase 50 Positive, Negative, Boundary & Validation Test Generation.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

/**
 * Base domain error for Phase 50 Categorized Test Generation.
 */
export class CategorizedTestError extends Error {
  public readonly code: DesktopErrorCode;

  constructor(message: string, code: DesktopErrorCode = 'CATEGORIZED_TESTS_GENERATION_FAILED') {
    super(message);
    this.name = 'CategorizedTestError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class CategorizedTestsProjectMismatchError extends CategorizedTestError {
  constructor(projectId?: string, requirementId?: string) {
    super(
      projectId && requirementId
        ? `Requirement "${requirementId}" does not belong to project "${projectId}".`
        : 'Requirement does not belong to the specified project.',
      'CATEGORIZED_TESTS_PROJECT_MISMATCH',
    );
    this.name = 'CategorizedTestsProjectMismatchError';
  }
}

export class CategorizedTestsRequirementNotFoundError extends CategorizedTestError {
  constructor(requirementId: string) {
    super(
      `Requirement "${requirementId}" was not found.`,
      'CATEGORIZED_TESTS_REQUIREMENT_NOT_FOUND',
    );
    this.name = 'CategorizedTestsRequirementNotFoundError';
  }
}

export class CategorizedTestsScenarioNotFoundError extends CategorizedTestError {
  constructor(scenarioId: string) {
    super(
      `Scenario "${scenarioId}" was not found or does not belong to this requirement.`,
      'CATEGORIZED_TESTS_SCENARIO_NOT_FOUND',
    );
    this.name = 'CategorizedTestsScenarioNotFoundError';
  }
}

export class CategorizedTestsGenerationFailedError extends CategorizedTestError {
  constructor(message: string) {
    super(message, 'CATEGORIZED_TESTS_GENERATION_FAILED');
    this.name = 'CategorizedTestsGenerationFailedError';
  }
}

export class CategorizedTestsSchemaValidationFailedError extends CategorizedTestError {
  constructor(message: string) {
    super(message, 'CATEGORIZED_TESTS_SCHEMA_VALIDATION_FAILED');
    this.name = 'CategorizedTestsSchemaValidationFailedError';
  }
}

export class CategorizedTestsGroundingFailedError extends CategorizedTestError {
  constructor(message: string) {
    super(message, 'CATEGORIZED_TESTS_GROUNDING_FAILED');
    this.name = 'CategorizedTestsGroundingFailedError';
  }
}

export class CategorizedTestsRequirementChangedError extends CategorizedTestError {
  constructor(message?: string) {
    super(
      message ??
        'The requirement was modified while categorized test generation was in progress. Please re-run generation against the latest version.',
      'CATEGORIZED_TESTS_REQUIREMENT_CHANGED',
    );
    this.name = 'CategorizedTestsRequirementChangedError';
  }
}
