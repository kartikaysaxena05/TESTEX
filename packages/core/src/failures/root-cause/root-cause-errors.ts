/**
 * @file packages/core/src/failures/root-cause/root-cause-errors.ts
 * Strongly typed domain errors for Phase 83 Root-Cause Analysis & Probable Layer Identification.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';
import { FailureDomainError } from '../failure-errors.js';

export abstract class RootCauseError extends FailureDomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}

export class RootCauseNotFoundError extends RootCauseError {
  public readonly code: DesktopErrorCode = 'ROOT_CAUSE_NOT_FOUND';

  constructor(failureCaseId: string, projectId: string) {
    super(
      `No root-cause analysis found for failure case '${failureCaseId}' in project '${projectId}'.`,
      {
        failureCaseId,
        projectId,
      },
    );
  }
}

export class RootCauseStaleError extends RootCauseError {
  public readonly code: DesktopErrorCode = 'ROOT_CAUSE_STALE';

  constructor(failureCaseId: string, reason?: string) {
    super(
      `Root-cause analysis for failure case '${failureCaseId}' is stale${reason ? `: ${reason}` : '.'}`,
      {
        failureCaseId,
        reason,
      },
    );
  }
}

export class RootCauseUnavailableError extends RootCauseError {
  public readonly code: DesktopErrorCode = 'ROOT_CAUSE_UNAVAILABLE';

  constructor(message: string, cause?: unknown) {
    super(`Root-cause analysis service is unavailable: ${message}`, {
      cause: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

export class RootCauseInsufficientEvidenceError extends RootCauseError {
  public readonly code: DesktopErrorCode = 'ROOT_CAUSE_INSUFFICIENT_EVIDENCE';

  constructor(reason: string, failureCaseId?: string) {
    super(`Cannot perform root-cause analysis due to insufficient evidence: ${reason}`, {
      reason,
      failureCaseId,
    });
  }
}

export class RootCauseBlockedError extends RootCauseError {
  public readonly code: DesktopErrorCode = 'ROOT_CAUSE_BLOCKED';

  constructor(reason: string, failureCaseId?: string) {
    super(`Root-cause analysis blocked: ${reason}`, {
      reason,
      failureCaseId,
    });
  }
}

export class RootCauseCrossProjectError extends RootCauseError {
  public readonly code: DesktopErrorCode = 'ROOT_CAUSE_CROSS_PROJECT';

  constructor(entityType: string, entityId: string, requestedProjectId: string) {
    super(
      `Cross-project violation: ${entityType} '${entityId}' does not belong to project '${requestedProjectId}'.`,
      { entityType, entityId, requestedProjectId },
    );
  }
}

export class RootCauseConcurrentMutationError extends RootCauseError {
  public readonly code: DesktopErrorCode = 'ROOT_CAUSE_CONCURRENT_MUTATION';

  constructor(failureCaseId: string) {
    super(`Concurrent root-cause mutation detected for failure case '${failureCaseId}'.`, {
      failureCaseId,
    });
  }
}

export class RootCausePromptError extends RootCauseError {
  public readonly code: DesktopErrorCode = 'INTERNAL_ERROR';

  constructor(message: string, details?: Record<string, unknown>) {
    super(`Root-cause analysis prompt execution failed: ${message}`, details);
  }
}
