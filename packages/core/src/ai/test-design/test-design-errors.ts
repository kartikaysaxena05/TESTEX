/**
 * @file packages/core/src/ai/test-design/test-design-errors.ts
 * Domain errors for Test Design Intelligence Foundation.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export class TestDesignError extends Error {
  readonly code: DesktopErrorCode;

  constructor(message: string, code: DesktopErrorCode = 'TEST_DESIGN_FAILED') {
    super(message);
    this.name = 'TestDesignError';
    this.code = code;
  }
}

export class TestDesignProjectMismatchError extends TestDesignError {
  constructor(projectId: string, requirementId: string) {
    super(
      `Requirement "${requirementId}" does not belong to Project "${projectId}".`,
      'TEST_DESIGN_PROJECT_MISMATCH',
    );
    this.name = 'TestDesignProjectMismatchError';
  }
}

export class TestDesignRequirementNotFoundError extends TestDesignError {
  constructor(requirementId: string) {
    super(`Requirement "${requirementId}" was not found.`, 'TEST_DESIGN_REQUIREMENT_NOT_FOUND');
    this.name = 'TestDesignRequirementNotFoundError';
  }
}

export class TestDesignRequirementChangedError extends TestDesignError {
  constructor(requirementId: string) {
    super(
      `Requirement "${requirementId}" was modified concurrently during test design analysis.`,
      'TEST_DESIGN_REQUIREMENT_CHANGED',
    );
    this.name = 'TestDesignRequirementChangedError';
  }
}

export class TestDesignSchemaValidationError extends TestDesignError {
  constructor(details: string) {
    super(
      `Test design output failed schema validation: ${details}`,
      'TEST_DESIGN_SCHEMA_VALIDATION_FAILED',
    );
    this.name = 'TestDesignSchemaValidationError';
  }
}

export class TestDesignGroundingError extends TestDesignError {
  constructor(details: string) {
    super(
      `Test design recommendations failed grounding validation: ${details}`,
      'TEST_DESIGN_GROUNDING_FAILED',
    );
    this.name = 'TestDesignGroundingError';
  }
}
