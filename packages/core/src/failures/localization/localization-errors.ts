/**
 * @file packages/core/src/failures/localization/localization-errors.ts
 * Strongly typed domain errors for Failure Evidence Correlation & Technical Cause Localization (V6 Phase 81).
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export class TechnicalLocalizationError extends Error {
  public readonly code: DesktopErrorCode;

  constructor(message: string, code: DesktopErrorCode = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'TechnicalLocalizationError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class LocalizationNotFoundError extends TechnicalLocalizationError {
  constructor(failureCaseId: string) {
    super(
      `No technical localization found for failure case "${failureCaseId}".`,
      'LOCALIZATION_NOT_FOUND',
    );
    this.name = 'LocalizationNotFoundError';
  }
}

export class LocalizationStaleError extends TechnicalLocalizationError {
  constructor(failureCaseId: string, reason?: string) {
    super(
      `Technical localization for failure case "${failureCaseId}" is stale${reason ? `: ${reason}` : '.'}`,
      'LOCALIZATION_STALE',
    );
    this.name = 'LocalizationStaleError';
  }
}

export class LocalizationInsufficientEvidenceError extends TechnicalLocalizationError {
  constructor(reason: string) {
    super(
      `Cannot localize technical cause due to insufficient evidence: ${reason}`,
      'LOCALIZATION_INSUFFICIENT_EVIDENCE',
    );
    this.name = 'LocalizationInsufficientEvidenceError';
  }
}

export class LocalizationBlockedError extends TechnicalLocalizationError {
  constructor(reason: string) {
    super(`Technical cause localization blocked: ${reason}`, 'LOCALIZATION_BLOCKED');
    this.name = 'LocalizationBlockedError';
  }
}

export class LocalizationConcurrentMutationError extends TechnicalLocalizationError {
  constructor(failureCaseId: string) {
    super(
      `Concurrent mutation detected for failure case "${failureCaseId}".`,
      'LOCALIZATION_CONCURRENT_MUTATION',
    );
    this.name = 'LocalizationConcurrentMutationError';
  }
}

export class LocalizationCrossProjectError extends TechnicalLocalizationError {
  constructor(entityName: string, entityId: string, expectedProjectId: string) {
    super(
      `Cross-project mismatch: ${entityName} "${entityId}" does not belong to project "${expectedProjectId}".`,
      'LOCALIZATION_CROSS_PROJECT',
    );
    this.name = 'LocalizationCrossProjectError';
  }
}
