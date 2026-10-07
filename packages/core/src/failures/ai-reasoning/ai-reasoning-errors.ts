/**
 * @file packages/core/src/failures/ai-reasoning/ai-reasoning-errors.ts
 * Strongly typed domain errors for Phase 82 AI-Assisted Failure Classification & Reasoning.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';
import { FailureDomainError } from '../failure-errors.js';

export abstract class AiAssessmentError extends FailureDomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}

export class AiAssessmentNotFoundError extends AiAssessmentError {
  public readonly code: DesktopErrorCode = 'AI_ASSESSMENT_NOT_FOUND';

  constructor(failureCaseId: string, projectId: string) {
    super(
      `No AI classification assessment found for failure case '${failureCaseId}' in project '${projectId}'.`,
      {
        failureCaseId,
        projectId,
      },
    );
  }
}

export class AiAssessmentStaleError extends AiAssessmentError {
  public readonly code: DesktopErrorCode = 'AI_ASSESSMENT_STALE';

  constructor(failureCaseId: string, reason?: string) {
    super(
      `AI classification assessment for failure case '${failureCaseId}' is stale${reason ? `: ${reason}` : '.'}`,
      {
        failureCaseId,
        reason,
      },
    );
  }
}

export class AiAssessmentUnavailableError extends AiAssessmentError {
  public readonly code: DesktopErrorCode = 'AI_ASSESSMENT_UNAVAILABLE';

  constructor(message: string, cause?: unknown) {
    super(`AI assessment service is unavailable: ${message}`, {
      cause: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

export class AiAssessmentInsufficientEvidenceError extends AiAssessmentError {
  public readonly code: DesktopErrorCode = 'AI_ASSESSMENT_INSUFFICIENT_EVIDENCE';

  constructor(reason: string, failureCaseId?: string) {
    super(`Cannot perform AI classification assessment due to insufficient evidence: ${reason}`, {
      reason,
      failureCaseId,
    });
  }
}

export class AiAssessmentBlockedError extends AiAssessmentError {
  public readonly code: DesktopErrorCode = 'AI_ASSESSMENT_BLOCKED';

  constructor(reason: string, failureCaseId?: string) {
    super(`AI classification assessment blocked: ${reason}`, {
      reason,
      failureCaseId,
    });
  }
}

export class AiAssessmentCrossProjectError extends AiAssessmentError {
  public readonly code: DesktopErrorCode = 'AI_ASSESSMENT_CROSS_PROJECT';

  constructor(entityType: string, entityId: string, requestedProjectId: string) {
    super(
      `Cross-project violation: ${entityType} '${entityId}' does not belong to project '${requestedProjectId}'.`,
      { entityType, entityId, requestedProjectId },
    );
  }
}

export class AiAssessmentConcurrentMutationError extends AiAssessmentError {
  public readonly code: DesktopErrorCode = 'AI_ASSESSMENT_CONCURRENT_MUTATION';

  constructor(failureCaseId: string) {
    super(`Concurrent AI classification mutation detected for failure case '${failureCaseId}'.`, {
      failureCaseId,
    });
  }
}

export class AiClassificationPromptError extends AiAssessmentError {
  public readonly code: DesktopErrorCode = 'INTERNAL_ERROR';

  constructor(message: string, details?: Record<string, unknown>) {
    super(`AI classification prompt execution failed: ${message}`, details);
  }
}
