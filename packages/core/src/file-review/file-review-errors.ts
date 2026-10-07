/**
 * @file packages/core/src/file-review/file-review-errors.ts
 * Strongly typed error hierarchy for V10 Phase 156: File & Diff Review Workspace.
 */

export class FileReviewError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'FILE_REVIEW_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class FileReviewNotFoundError extends FileReviewError {
  constructor(reviewId: string) {
    super(`File review "${reviewId}" was not found.`, 'FILE_REVIEW_NOT_FOUND');
  }
}

export class FileReviewAlreadyDecidedError extends FileReviewError {
  constructor(reviewId: string, currentStatus: string) {
    super(
      `File review "${reviewId}" has already been decided with status "${currentStatus}".`,
      'FILE_REVIEW_ALREADY_DECIDED',
    );
  }
}

export class FileReviewNotApprovedError extends FileReviewError {
  constructor(reviewId: string, currentStatus: string) {
    super(
      `File review "${reviewId}" cannot be applied because its status is "${currentStatus}". It must be APPROVED first.`,
      'FILE_REVIEW_NOT_APPROVED',
    );
  }
}

export class FileReviewAlreadyAppliedError extends FileReviewError {
  constructor(reviewId: string) {
    super(`File review "${reviewId}" has already been applied.`, 'FILE_REVIEW_ALREADY_APPLIED');
  }
}

export class FileReviewInvalidStateTransitionError extends FileReviewError {
  constructor(fromStatus: string, toStatus: string) {
    super(
      `Invalid review status transition from "${fromStatus}" to "${toStatus}".`,
      'FILE_REVIEW_INVALID_STATE_TRANSITION',
    );
  }
}

export class FileReviewPathTraversalError extends FileReviewError {
  constructor(filePath: string) {
    super(
      `Prohibited path traversal or invalid path: "${filePath}".`,
      'FILE_REVIEW_PATH_TRAVERSAL',
    );
  }
}

export class FileReviewFileNotFoundError extends FileReviewError {
  constructor(filePath: string) {
    super(`Project file "${filePath}" was not found.`, 'FILE_REVIEW_FILE_NOT_FOUND');
  }
}

export class FileReviewFileTooLargeError extends FileReviewError {
  constructor(filePath: string, sizeBytes: number, limitBytes: number) {
    super(
      `Project file "${filePath}" size (${sizeBytes} bytes) exceeds limit of ${limitBytes} bytes.`,
      'FILE_REVIEW_FILE_TOO_LARGE',
    );
  }
}

export class FileReviewUnauthorizedError extends FileReviewError {
  constructor(reason: string) {
    super(reason, 'FILE_REVIEW_UNAUTHORIZED');
  }
}

export class FileReviewValidationError extends FileReviewError {
  constructor(reason: string) {
    super(reason, 'FILE_REVIEW_VALIDATION_ERROR');
  }
}

export class FileReviewApplyFailedError extends FileReviewError {
  constructor(reason: string) {
    super(`Failed to apply code review patch: ${reason}`, 'FILE_REVIEW_APPLY_FAILED');
  }
}

export class FileReviewChecksumMismatchError extends FileReviewError {
  constructor(reviewId: string) {
    super(
      `Integrity violation: Original diff checksum mismatch for review "${reviewId}". Proposal has been tampered with.`,
      'FILE_REVIEW_CHECKSUM_MISMATCH',
    );
  }
}
