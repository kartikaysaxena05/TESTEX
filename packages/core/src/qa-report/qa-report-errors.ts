/**
 * @file packages/core/src/qa-report/qa-report-errors.ts
 * Domain exceptions for V7 Phase 109 Final QA Report & Release Readiness Intelligence.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export abstract class FinalQaReportError extends Error {
  public abstract readonly code: DesktopErrorCode;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class QaReportNotFoundError extends FinalQaReportError {
  public readonly code: DesktopErrorCode = 'QA_REPORT_NOT_FOUND';
}

export class QaReportAlreadyFinalError extends FinalQaReportError {
  public readonly code: DesktopErrorCode = 'QA_REPORT_ALREADY_FINAL';
}

export class QaReportImmutabilityViolationError extends FinalQaReportError {
  public readonly code: DesktopErrorCode = 'QA_REPORT_IMMUTABILITY_VIOLATION';
}

export class QaReportProjectMismatchError extends FinalQaReportError {
  public readonly code: DesktopErrorCode = 'QA_REPORT_PROJECT_MISMATCH';
}

export class QaReportValidationError extends FinalQaReportError {
  public readonly code: DesktopErrorCode = 'QA_REPORT_VALIDATION_ERROR';
}

export class QaReportExportFailedError extends FinalQaReportError {
  public readonly code: DesktopErrorCode = 'QA_REPORT_EXPORT_FAILED';
}

export class QaReportStaleDataError extends FinalQaReportError {
  public readonly code: DesktopErrorCode = 'QA_REPORT_STALE_DATA';
}

export class QaReportConcurrentMutationError extends FinalQaReportError {
  public readonly code: DesktopErrorCode = 'QA_REPORT_CONCURRENT_MUTATION';
}
