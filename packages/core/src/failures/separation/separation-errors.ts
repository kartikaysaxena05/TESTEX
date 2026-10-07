/**
 * @file packages/core/src/failures/separation/separation-errors.ts
 * Strongly typed domain errors for Failure Domain Separation (V6 Phase 80).
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export class DomainSeparationError extends Error {
  public readonly code: DesktopErrorCode;

  constructor(message: string, code: DesktopErrorCode = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'DomainSeparationError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class FailureDomainNotFoundError extends DomainSeparationError {
  constructor(failureCaseId: string) {
    super(
      `No failure domain separation found for failure case "${failureCaseId}".`,
      'FAILURE_DOMAIN_NOT_FOUND',
    );
    this.name = 'FailureDomainNotFoundError';
  }
}

export class FailureDomainStaleError extends DomainSeparationError {
  constructor(failureCaseId: string) {
    super(
      `Failure domain separation for failure case "${failureCaseId}" is stale.`,
      'FAILURE_DOMAIN_STALE',
    );
    this.name = 'FailureDomainStaleError';
  }
}

export class FailureDomainInsufficientEvidenceError extends DomainSeparationError {
  constructor(reason: string) {
    super(
      `Cannot separate failure domain due to insufficient evidence: ${reason}`,
      'FAILURE_DOMAIN_INSUFFICIENT_EVIDENCE',
    );
    this.name = 'FailureDomainInsufficientEvidenceError';
  }
}

export class FailureDomainBlockedError extends DomainSeparationError {
  constructor(reason: string) {
    super(`Failure domain separation blocked: ${reason}`, 'FAILURE_DOMAIN_BLOCKED');
    this.name = 'FailureDomainBlockedError';
  }
}

export class FailureDomainConcurrentMutationError extends DomainSeparationError {
  constructor(failureCaseId: string) {
    super(
      `Concurrent mutation detected for failure case "${failureCaseId}".`,
      'FAILURE_DOMAIN_CONCURRENT_MUTATION',
    );
    this.name = 'FailureDomainConcurrentMutationError';
  }
}

export class FailureDomainCrossProjectError extends DomainSeparationError {
  constructor(entityType: string, entityId: string, projectId: string) {
    super(
      `${entityType} "${entityId}" does not belong to project "${projectId}". Cross-project access prohibited.`,
      'FAILURE_DOMAIN_CROSS_PROJECT',
    );
    this.name = 'FailureDomainCrossProjectError';
  }
}
