/**
 * @file packages/core/src/ai/specifications/specification-errors.ts
 * Typed domain errors for Phase 51 Test Specification Enrichment.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export class TestSpecificationError extends Error {
  readonly code: DesktopErrorCode;

  constructor(message: string, code: DesktopErrorCode = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class TestSpecificationsProjectMismatchError extends TestSpecificationError {
  constructor(requirementId: string, projectId: string) {
    super(
      `Requirement '${requirementId}' does not belong to project '${projectId}'.`,
      'TEST_SPECIFICATIONS_PROJECT_MISMATCH',
    );
  }
}

export class TestSpecificationsRequirementNotFoundError extends TestSpecificationError {
  constructor(requirementId: string) {
    super(
      `Requirement '${requirementId}' was not found.`,
      'TEST_SPECIFICATIONS_REQUIREMENT_NOT_FOUND',
    );
  }
}

export class TestSpecificationsScenarioNotFoundError extends TestSpecificationError {
  constructor(scenarioId: string, requirementId: string) {
    super(
      `Scenario candidate '${scenarioId}' does not belong to requirement '${requirementId}'.`,
      'TEST_SPECIFICATIONS_SCENARIO_NOT_FOUND',
    );
  }
}

export class TestSpecificationsGenerationFailedError extends TestSpecificationError {
  constructor(reason: string) {
    super(
      `Test specification enrichment failed: ${reason}`,
      'TEST_SPECIFICATIONS_GENERATION_FAILED',
    );
  }
}

export class TestSpecificationsSchemaValidationFailedError extends TestSpecificationError {
  constructor(details: string) {
    super(
      `Structured output failed schema validation: ${details}`,
      'TEST_SPECIFICATIONS_SCHEMA_VALIDATION_FAILED',
    );
  }
}

export class TestSpecificationsGroundingFailedError extends TestSpecificationError {
  constructor(details: string) {
    super(
      `Test specification enrichment grounding validation failed: ${details}`,
      'TEST_SPECIFICATIONS_GROUNDING_FAILED',
    );
  }
}

export class TestSpecificationsRequirementChangedError extends TestSpecificationError {
  constructor(requirementKey: string) {
    super(
      `Requirement '${requirementKey}' was modified concurrently during test specification enrichment. Please retry.`,
      'TEST_SPECIFICATIONS_REQUIREMENT_CHANGED',
    );
  }
}
