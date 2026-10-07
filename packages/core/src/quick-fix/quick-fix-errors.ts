/**
 * @file packages/core/src/quick-fix/quick-fix-errors.ts
 * Domain error classes for AI Quick-Fix Eligibility & Safety Analysis (V7 Phase 99).
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export abstract class QuickFixError extends Error {
  public abstract readonly code: DesktopErrorCode;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class QuickFixNotFoundError extends QuickFixError {
  public readonly code: DesktopErrorCode = 'QUICK_FIX_NOT_FOUND';

  constructor(identifier: string) {
    super(`Quick-fix assessment record not found: ${identifier}`);
  }
}

export class QuickFixStaleError extends QuickFixError {
  public readonly code: DesktopErrorCode = 'QUICK_FIX_STALE';

  constructor(
    reason: string = 'Quick-fix assessment is stale due to underlying artifact mutations.',
  ) {
    super(reason);
  }
}

export class QuickFixBlockedError extends QuickFixError {
  public readonly code: DesktopErrorCode = 'QUICK_FIX_BLOCKED';

  constructor(
    reason: string,
    public readonly blockingRules: readonly string[] = [],
  ) {
    super(`Quick-fix evaluation blocked by safety policy: ${reason}`);
  }
}

export class QuickFixInsufficientEvidenceError extends QuickFixError {
  public readonly code: DesktopErrorCode = 'QUICK_FIX_INSUFFICIENT_EVIDENCE';

  constructor(
    reason: string,
    public readonly gaps: readonly string[] = [],
  ) {
    super(`Insufficient evidence to determine quick-fix eligibility: ${reason}`);
  }
}

export class QuickFixCrossProjectError extends QuickFixError {
  public readonly code: DesktopErrorCode = 'QUICK_FIX_CROSS_PROJECT';

  constructor(message: string = 'Cross-project quick-fix operations are strictly forbidden.') {
    super(message);
  }
}

export class QuickFixConcurrentMutationError extends QuickFixError {
  public readonly code: DesktopErrorCode = 'QUICK_FIX_CONCURRENT_MUTATION';

  constructor(message: string = 'Concurrent quick-fix evaluation or mutation detected.') {
    super(message);
  }
}

export class QuickFixSafetyPolicyViolationError extends QuickFixError {
  public readonly code: DesktopErrorCode = 'QUICK_FIX_SAFETY_POLICY_VIOLATION';

  constructor(
    reason: string,
    public readonly violations: readonly string[] = [],
  ) {
    super(`Quick-fix safety policy violation: ${reason}`);
  }
}

export class QuickFixGitDirtyWorktreeError extends QuickFixError {
  public readonly code: DesktopErrorCode = 'QUICK_FIX_GIT_DIRTY_WORKTREE';

  constructor(
    message: string = 'Working tree has uncommitted modifications affecting candidate fix files.',
  ) {
    super(message);
  }
}

export class QuickFixGitError extends QuickFixError {
  public readonly code: DesktopErrorCode = 'QUICK_FIX_GIT_ERROR';

  constructor(message: string) {
    super(`Git error encountered during quick-fix safety check: ${message}`);
  }
}
