/**
 * @file packages/core/src/failures/bug-report/bug-report-errors.ts
 * Domain error classes for V6 Phase 87: Structured Bug Report Generation & Workspace.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export class BugReportError extends Error {
  public readonly code: DesktopErrorCode;

  constructor(message: string, code: DesktopErrorCode = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class BugReportNotFoundError extends BugReportError {
  constructor(
    message = 'Structured bug report not found.',
    public readonly reportId?: string,
  ) {
    super(message, 'BUG_REPORT_NOT_FOUND');
  }
}

export class BugReportStaleError extends BugReportError {
  constructor(
    message = 'Structured bug report is stale due to upstream analysis or evidence updates.',
    public readonly reportId?: string,
  ) {
    super(message, 'BUG_REPORT_STALE');
  }
}

export class BugReportCrossProjectError extends BugReportError {
  constructor(message = 'Cross-project access violation in structured bug report operation.') {
    super(message, 'BUG_REPORT_CROSS_PROJECT');
  }
}

export class BugReportInvalidOperationError extends BugReportError {
  constructor(message = 'Invalid operation on structured bug report.') {
    super(message, 'BUG_REPORT_INVALID_OPERATION');
  }
}

export class BugReportInsufficientEvidenceError extends BugReportError {
  constructor(message = 'Insufficient evidence to generate structured bug report.') {
    super(message, 'BUG_REPORT_INSUFFICIENT_EVIDENCE');
  }
}

export class BugReportConcurrentMutationError extends BugReportError {
  constructor(
    message = 'Concurrent modification detected during structured bug report operation.',
  ) {
    super(message, 'BUG_REPORT_CONCURRENT_MUTATION');
  }
}

export class BugReportIntegrityViolationError extends BugReportError {
  constructor(
    message = 'Integrity violation detected in structured bug report computation or persistence.',
  ) {
    super(message, 'BUG_REPORT_INTEGRITY_VIOLATION');
  }
}
