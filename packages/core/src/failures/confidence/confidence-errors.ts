/**
 * @file packages/core/src/failures/confidence/confidence-errors.ts
 * Domain errors for V6 Phase 86: Confidence Scoring, Explainability & Evidence Attribution.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export class ConfidenceAssessmentError extends Error {
  public readonly code: DesktopErrorCode;

  constructor(message: string, code: DesktopErrorCode = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class ConfidenceAssessmentNotFoundError extends ConfidenceAssessmentError {
  constructor(
    message = 'Confidence assessment record not found.',
    public readonly assessmentId?: string,
  ) {
    super(message, 'CONFIDENCE_ASSESSMENT_NOT_FOUND');
  }
}

export class ConfidenceAssessmentStaleError extends ConfidenceAssessmentError {
  constructor(
    message = 'Confidence assessment is stale due to underlying evidence changes.',
    public readonly assessmentId?: string,
  ) {
    super(message, 'CONFIDENCE_ASSESSMENT_STALE');
  }
}

export class ConfidenceAssessmentCrossProjectError extends ConfidenceAssessmentError {
  constructor(message = 'Cross-project access violation in confidence assessment operation.') {
    super(message, 'CONFIDENCE_ASSESSMENT_CROSS_PROJECT');
  }
}

export class ConfidenceAssessmentInvalidOperationError extends ConfidenceAssessmentError {
  constructor(message = 'Invalid operation on confidence assessment.') {
    super(message, 'CONFIDENCE_ASSESSMENT_INVALID_OPERATION');
  }
}

export class ConfidenceAssessmentInsufficientEvidenceError extends ConfidenceAssessmentError {
  constructor(message = 'Insufficient evidence to compute confidence assessment.') {
    super(message, 'CONFIDENCE_ASSESSMENT_INSUFFICIENT_EVIDENCE');
  }
}

export class ConfidenceAssessmentConcurrentMutationError extends ConfidenceAssessmentError {
  constructor(message = 'Concurrent modification detected during confidence assessment.') {
    super(message, 'CONFIDENCE_ASSESSMENT_CONCURRENT_MUTATION');
  }
}

export class ConfidenceIntegrityViolationError extends ConfidenceAssessmentError {
  constructor(message = 'Integrity violation detected in confidence assessment computation.') {
    super(message, 'CONFIDENCE_INTEGRITY_VIOLATION');
  }
}
