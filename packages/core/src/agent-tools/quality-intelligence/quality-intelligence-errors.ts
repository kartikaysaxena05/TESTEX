/**
 * @file packages/core/src/agent-tools/quality-intelligence/quality-intelligence-errors.ts
 * Domain errors for V10 Phase 146: Requirement & Test Intelligence Tools.
 */

export class QualityIntelligenceToolError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code = 'QUALITY_INTELLIGENCE_ERROR', statusCode = 400) {
    super(message);
    this.name = 'QualityIntelligenceToolError';
    this.code = code;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class QualityIntelligenceRequirementNotFoundError extends QualityIntelligenceToolError {
  constructor(requirementIdOrKey: string, projectId: string) {
    super(
      `Requirement '${requirementIdOrKey}' was not found in project '${projectId}'.`,
      'REQUIREMENT_NOT_FOUND',
      404,
    );
    this.name = 'QualityIntelligenceRequirementNotFoundError';
  }
}

export class QualityIntelligenceTestCaseNotFoundError extends QualityIntelligenceToolError {
  constructor(testCaseIdOrKey: string, projectId: string) {
    super(
      `Test case '${testCaseIdOrKey}' was not found in project '${projectId}'.`,
      'TEST_CASE_NOT_FOUND',
      404,
    );
    this.name = 'QualityIntelligenceTestCaseNotFoundError';
  }
}

export class QualityIntelligenceValidationError extends QualityIntelligenceToolError {
  constructor(message: string) {
    super(message, 'QUALITY_INTELLIGENCE_VALIDATION_ERROR', 400);
    this.name = 'QualityIntelligenceValidationError';
  }
}
