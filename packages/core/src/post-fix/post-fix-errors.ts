/**
 * @file packages/core/src/post-fix/post-fix-errors.ts
 * Domain error taxonomy for Post-Fix Jira & Notification Updates (V7 Phase 107).
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export abstract class PostFixSyncError extends Error {
  public abstract readonly code: DesktopErrorCode;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PostFixSyncNotFoundError extends PostFixSyncError {
  public readonly code = 'POST_FIX_SYNC_NOT_FOUND';
}

export class PostFixReverificationNotFoundError extends PostFixSyncError {
  public readonly code = 'POST_FIX_REVERIFICATION_NOT_FOUND';
}

export class PostFixJiraLinkNotFoundError extends PostFixSyncError {
  public readonly code = 'POST_FIX_JIRA_LINK_NOT_FOUND';
}

export class PostFixProjectMismatchError extends PostFixSyncError {
  public readonly code = 'POST_FIX_PROJECT_MISMATCH';
}

export class PostFixValidationError extends PostFixSyncError {
  public readonly code = 'POST_FIX_VALIDATION_ERROR';
}

export class PostFixUnauthoritativeVerificationError extends PostFixSyncError {
  public readonly code = 'POST_FIX_UNAUTHORITATIVE_VERIFICATION';
}

export class PostFixConcurrentSyncError extends PostFixSyncError {
  public readonly code = 'POST_FIX_CONCURRENT_SYNC_ERROR';
}

export class PostFixInvalidTransitionError extends PostFixSyncError {
  public readonly code = 'POST_FIX_INVALID_TRANSITION';
}

export class PostFixJiraRateLimitedError extends PostFixSyncError {
  public readonly code = 'POST_FIX_JIRA_RATE_LIMITED';
  public readonly retryAfterSeconds?: number;

  constructor(message: string, retryAfterSeconds?: number) {
    super(message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class PostFixJiraAuthFailedError extends PostFixSyncError {
  public readonly code = 'POST_FIX_JIRA_AUTH_FAILED';
}

export class PostFixNotificationFailedError extends PostFixSyncError {
  public readonly code = 'POST_FIX_NOTIFICATION_FAILED';
}
