import type { DesktopErrorCode } from '@ai-quality/contracts';

/**
 * Base domain error for Phase 49 Scenario Generation.
 */
export class ScenarioGenerationError extends Error {
  public readonly code: DesktopErrorCode;

  constructor(message: string, code: DesktopErrorCode = 'SCENARIO_GENERATION_FAILED') {
    super(message);
    this.name = 'ScenarioGenerationError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ScenarioProjectMismatchError extends ScenarioGenerationError {
  constructor(message = 'The specified requirement does not belong to the active project.') {
    super(message, 'SCENARIO_PROJECT_MISMATCH');
    this.name = 'ScenarioProjectMismatchError';
  }
}

export class ScenarioRequirementNotFoundError extends ScenarioGenerationError {
  constructor(requirementId: string) {
    super(
      `Requirement with ID '${requirementId}' was not found.`,
      'SCENARIO_REQUIREMENT_NOT_FOUND',
    );
    this.name = 'ScenarioRequirementNotFoundError';
  }
}

export class ScenarioRequirementChangedError extends ScenarioGenerationError {
  constructor(message = 'The requirement was modified while scenario generation was in progress.') {
    super(message, 'SCENARIO_REQUIREMENT_CHANGED');
    this.name = 'ScenarioRequirementChangedError';
  }
}

export class ScenarioSchemaValidationFailedError extends ScenarioGenerationError {
  constructor(message: string) {
    super(message, 'SCENARIO_SCHEMA_VALIDATION_FAILED');
    this.name = 'ScenarioSchemaValidationFailedError';
  }
}

export class ScenarioGroundingFailedError extends ScenarioGenerationError {
  constructor(message: string) {
    super(message, 'SCENARIO_GROUNDING_FAILED');
    this.name = 'ScenarioGroundingFailedError';
  }
}
