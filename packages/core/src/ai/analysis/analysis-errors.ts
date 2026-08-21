/**
 * @file packages/core/src/ai/analysis/analysis-errors.ts
 * Domain error classes for Phase 47 LLM Requirement Analysis subsystem.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';
import { AiGatewayError } from '../ai-errors.js';

export class AiAnalysisError extends AiGatewayError {
  constructor(message: string, code: DesktopErrorCode = 'AI_ANALYSIS_FAILED') {
    super(message, code);
    this.name = 'AiAnalysisError';
  }
}

export class AiAnalysisProjectMismatchError extends AiAnalysisError {
  constructor(
    message: string = 'Requested requirement does not belong to the authorized project.',
  ) {
    super(message, 'AI_ANALYSIS_PROJECT_MISMATCH');
    this.name = 'AiAnalysisProjectMismatchError';
  }
}

export class AiAnalysisRequirementNotFoundError extends AiAnalysisError {
  constructor(requirementId: string) {
    super(
      `Requirement with ID "${requirementId}" was not found.`,
      'AI_ANALYSIS_REQUIREMENT_NOT_FOUND',
    );
    this.name = 'AiAnalysisRequirementNotFoundError';
  }
}

export class AiAnalysisGroundingError extends AiAnalysisError {
  constructor(message: string) {
    super(message, 'AI_ANALYSIS_GROUNDING_FAILED');
    this.name = 'AiAnalysisGroundingError';
  }
}

export class AiAnalysisRequirementChangedError extends AiAnalysisError {
  constructor(requirementId: string) {
    super(
      `Requirement "${requirementId}" was modified concurrently during AI analysis.`,
      'AI_ANALYSIS_REQUIREMENT_CHANGED',
    );
    this.name = 'AiAnalysisRequirementChangedError';
  }
}
