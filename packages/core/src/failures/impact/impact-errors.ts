/**
 * @file packages/core/src/failures/impact/impact-errors.ts
 * Domain errors for V6 Phase 84 Severity, Priority & Impact Intelligence.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export class ImpactAssessmentError extends Error {
  public readonly code: DesktopErrorCode;

  constructor(message: string, code: DesktopErrorCode = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class ImpactAssessmentNotFoundError extends ImpactAssessmentError {
  constructor(
    message = 'Impact assessment record not found.',
    public readonly failureCaseId?: string,
  ) {
    super(message, 'IMPACT_ASSESSMENT_NOT_FOUND');
  }
}

export class ImpactAssessmentStaleError extends ImpactAssessmentError {
  constructor(
    message = 'Impact assessment is stale because new pipeline facts were produced.',
    public readonly failureCaseId?: string,
  ) {
    super(message, 'IMPACT_ASSESSMENT_STALE');
  }
}

export class ImpactAssessmentInsufficientEvidenceError extends ImpactAssessmentError {
  constructor(
    message = 'Insufficient diagnostic evidence to assess severity, priority, or impact.',
    public readonly failureCaseId?: string,
  ) {
    super(message, 'IMPACT_ASSESSMENT_INSUFFICIENT_EVIDENCE');
  }
}

export class ImpactAssessmentBlockedError extends ImpactAssessmentError {
  constructor(
    message = 'Impact assessment is blocked due to pipeline decision integrity constraints.',
    public readonly failureCaseId?: string,
  ) {
    super(message, 'IMPACT_ASSESSMENT_BLOCKED');
  }
}

export class ImpactAssessmentCrossProjectError extends ImpactAssessmentError {
  constructor(message = 'Cross-project access violation in impact assessment operation.') {
    super(message, 'IMPACT_ASSESSMENT_CROSS_PROJECT');
  }
}

export class ImpactAssessmentConcurrentMutationError extends ImpactAssessmentError {
  constructor(
    message = 'Concurrent mutation conflict while persisting impact assessment.',
    public readonly failureCaseId?: string,
  ) {
    super(message, 'IMPACT_ASSESSMENT_CONCURRENT_MUTATION');
  }
}

export class ImpactAssessmentUnavailableError extends ImpactAssessmentError {
  constructor(message = 'Impact assessment engine is unavailable.') {
    super(message, 'IMPACT_ASSESSMENT_UNAVAILABLE');
  }
}
