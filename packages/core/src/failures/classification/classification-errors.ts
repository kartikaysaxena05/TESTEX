/**
 * @file packages/core/src/failures/classification/classification-errors.ts
 * Typed domain errors for Failure Taxonomy & Deterministic Classification Foundation (V6 Phase 77).
 */

import { FailureDomainError } from '../failure-errors.js';

export class ClassificationNotFoundError extends FailureDomainError {
  public readonly code = 'CLASSIFICATION_NOT_FOUND' as const;

  constructor(failureCaseId: string, projectId: string) {
    super(
      `Classification not found for failure case '${failureCaseId}' in project '${projectId}'.`,
      { failureCaseId, projectId },
    );
  }
}

export class ClassificationBlockedError extends FailureDomainError {
  public readonly code = 'CLASSIFICATION_BLOCKED' as const;

  constructor(failureCaseId: string, reason: string) {
    super(`Classification is blocked for failure case '${failureCaseId}': ${reason}`, {
      failureCaseId,
      reason,
    });
  }
}

export class InsufficientEvidenceError extends FailureDomainError {
  public readonly code = 'CLASSIFICATION_EVIDENCE_INSUFFICIENT' as const;

  constructor(failureCaseId: string, reason: string) {
    super(
      `Evidence is insufficient to perform definitive classification on failure case '${failureCaseId}': ${reason}`,
      { failureCaseId, reason },
    );
  }
}

export class ClassificationCrossProjectError extends FailureDomainError {
  public readonly code = 'CROSS_PROJECT_MISMATCH' as const;

  constructor(resourceId: string, expectedProjectId: string, actualProjectId: string) {
    super(
      `Cross-project violation: Resource '${resourceId}' belongs to project '${actualProjectId}', not '${expectedProjectId}'.`,
      { resourceId, expectedProjectId, actualProjectId },
    );
  }
}

export class ClassificationConflictError extends FailureDomainError {
  public readonly code = 'CLASSIFICATION_CONFLICT' as const;

  constructor(failureCaseId: string, reason: string) {
    super(`Classification conflict on failure case '${failureCaseId}': ${reason}`, {
      failureCaseId,
      reason,
    });
  }
}

export class ConcurrentClassificationError extends FailureDomainError {
  public readonly code = 'CLASSIFICATION_CONCURRENT_MUTATION' as const;

  constructor(failureCaseId: string) {
    super(
      `Concurrent classification mutation detected on failure case '${failureCaseId}'. Request aborted to prevent state corruption.`,
      { failureCaseId },
    );
  }
}
