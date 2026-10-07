/**
 * @file packages/core/src/failures/flakiness/flakiness-errors.ts
 * Typed domain errors for Failure Flakiness Detection & Reproducibility Intelligence (V6 Phase 79).
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export class FlakinessAnalysisError extends Error {
  public readonly code: DesktopErrorCode;

  constructor(message: string, code: DesktopErrorCode = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'FlakinessAnalysisError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class FlakinessAnalysisNotFoundError extends FlakinessAnalysisError {
  constructor(failureCaseId: string) {
    super(
      `Flakiness analysis record not found for failure case ID: ${failureCaseId}`,
      'FLAKINESS_ANALYSIS_NOT_FOUND',
    );
    this.name = 'FlakinessAnalysisNotFoundError';
  }
}

export class FlakinessCrossProjectError extends FlakinessAnalysisError {
  constructor(entityId: string, requestedProjectId: string) {
    super(
      `Cross-project access forbidden for entity ${entityId} within project ${requestedProjectId}`,
      'FLAKINESS_ANALYSIS_CROSS_PROJECT',
    );
    this.name = 'FlakinessCrossProjectError';
  }
}

export class ConcurrentFlakinessAnalysisError extends FlakinessAnalysisError {
  constructor(failureCaseId: string) {
    super(
      `Concurrent flakiness analysis or mutation detected for failure case: ${failureCaseId}. Please retry.`,
      'FLAKINESS_ANALYSIS_CONCURRENT_MUTATION',
    );
    this.name = 'ConcurrentFlakinessAnalysisError';
  }
}

export class FlakinessAnalysisBlockedError extends FlakinessAnalysisError {
  constructor(reason: string) {
    super(`Flakiness analysis blocked: ${reason}`, 'FLAKINESS_ANALYSIS_BLOCKED');
    this.name = 'FlakinessAnalysisBlockedError';
  }
}

export class FlakinessAnalysisInsufficientEvidenceError extends FlakinessAnalysisError {
  constructor(reason: string) {
    super(
      `Insufficient evidence for flakiness evaluation: ${reason}`,
      'FLAKINESS_ANALYSIS_INSUFFICIENT_EVIDENCE',
    );
    this.name = 'FlakinessAnalysisInsufficientEvidenceError';
  }
}
