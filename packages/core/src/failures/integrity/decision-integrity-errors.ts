/**
 * @file packages/core/src/failures/integrity/decision-integrity-errors.ts
 * Domain errors for Classification Decision Integrity & Arbitration (V6 Phase 78).
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';
import { FailureDomainError } from '../failure-errors.js';

export class DecisionIntegrityError extends FailureDomainError {
  public override readonly code: DesktopErrorCode;

  constructor(
    message: string,
    code: DesktopErrorCode = 'INTERNAL_ERROR',
    context?: Record<string, unknown>,
  ) {
    super(message, context);
    this.code = code;
    this.name = 'DecisionIntegrityError';
  }
}

export class DecisionIntegrityNotFoundError extends DecisionIntegrityError {
  public override readonly code = 'DECISION_INTEGRITY_NOT_FOUND' as const;

  constructor(failureCaseId: string, projectId: string) {
    super(
      `Decision integrity record not found for failure case "${failureCaseId}" in project "${projectId}".`,
      'DECISION_INTEGRITY_NOT_FOUND',
      { failureCaseId, projectId },
    );
    this.name = 'DecisionIntegrityNotFoundError';
  }
}

export class DecisionIntegrityCrossProjectError extends DecisionIntegrityError {
  public override readonly code = 'UNAUTHORIZED_SENDER' as const;

  constructor(failureCaseId: string, requestedProjectId: string, actualProjectId: string) {
    super(
      `Cross-project security violation: Failure case "${failureCaseId}" belongs to project "${actualProjectId}", but was accessed with project "${requestedProjectId}".`,
      'UNAUTHORIZED_SENDER',
      { failureCaseId, requestedProjectId, actualProjectId },
    );
    this.name = 'DecisionIntegrityCrossProjectError';
  }
}

export class ConcurrentDecisionIntegrityError extends DecisionIntegrityError {
  public override readonly code = 'DECISION_INTEGRITY_CONCURRENT_MUTATION' as const;

  constructor(failureCaseId: string) {
    super(
      `Concurrent decision integrity mutation detected for failure case "${failureCaseId}". Please retry.`,
      'DECISION_INTEGRITY_CONCURRENT_MUTATION',
      { failureCaseId },
    );
    this.name = 'ConcurrentDecisionIntegrityError';
  }
}

export class DecisionIntegrityBlockedError extends DecisionIntegrityError {
  public override readonly code = 'DECISION_INTEGRITY_BLOCKED' as const;

  constructor(failureCaseId: string, reason: string) {
    super(
      `Decision integrity evaluation blocked for failure case "${failureCaseId}": ${reason}`,
      'DECISION_INTEGRITY_BLOCKED',
      { failureCaseId, reason },
    );
    this.name = 'DecisionIntegrityBlockedError';
  }
}
