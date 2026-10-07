/**
 * @file packages/core/src/failures/failure-errors.ts
 * Domain-safe error definitions for V6 Failure Intelligence operations.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export abstract class FailureDomainError extends Error {
  public abstract readonly code: DesktopErrorCode;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
  }
}

export class FailureCaseNotFoundError extends FailureDomainError {
  public readonly code = 'FAILURE_CASE_NOT_FOUND' as const;

  constructor(failureCaseId: string, projectId: string) {
    super(`FailureCase '${failureCaseId}' not found in project '${projectId}'.`, {
      failureCaseId,
      projectId,
    });
  }
}

export class ExecutionIneligibleForFailureCaseError extends FailureDomainError {
  public readonly code = 'EXECUTION_INELIGIBLE' as const;

  constructor(executionId: string, status: string, reason?: string) {
    super(
      `Execution '${executionId}' with status '${status}' is not eligible for failure intelligence: ${reason ?? 'Execution did not fail abnormally'}.`,
      { executionId, status, reason },
    );
  }
}

export class FailureCaseAlreadyExistsError extends FailureDomainError {
  public readonly code = 'FAILURE_CASE_ALREADY_EXISTS' as const;

  constructor(executionId: string, existingCaseId: string) {
    super(`A FailureCase '${existingCaseId}' already exists for execution '${executionId}'.`, {
      executionId,
      existingCaseId,
    });
  }
}

export class InvalidLifecycleTransitionError extends FailureDomainError {
  public readonly code = 'INVALID_LIFECYCLE_TRANSITION' as const;

  constructor(fromStatus: string, toStatus: string, entity: string = 'FailureCase') {
    super(`Invalid ${entity} lifecycle transition from '${fromStatus}' to '${toStatus}'.`, {
      fromStatus,
      toStatus,
      entity,
    });
  }
}

export class AnalysisAlreadyRunningError extends FailureDomainError {
  public readonly code = 'ANALYSIS_ALREADY_RUNNING' as const;

  constructor(failureCaseId: string, currentRunId?: string) {
    super(
      `FailureCase '${failureCaseId}' is already in ANALYZING state${currentRunId ? ` (run: ${currentRunId})` : ''}.`,
      { failureCaseId, currentRunId },
    );
  }
}

export class CrossProjectAccessDeniedError extends FailureDomainError {
  public readonly code = 'CROSS_PROJECT_MISMATCH' as const;

  constructor(
    entityName: string,
    entityId: string,
    requestedProjectId: string,
    actualProjectId: string,
  ) {
    super(
      `Cross-project access violation: ${entityName} '${entityId}' belongs to project '${actualProjectId}', but request specified project '${requestedProjectId}'.`,
      { entityName, entityId, requestedProjectId, actualProjectId },
    );
  }
}

export class FailureAnalysisRunNotFoundError extends FailureDomainError {
  public readonly code = 'FAILURE_ANALYSIS_RUN_NOT_FOUND' as const;

  constructor(analysisRunId: string, failureCaseId?: string) {
    super(
      `FailureAnalysisRun '${analysisRunId}' not found${failureCaseId ? ` for failure case '${failureCaseId}'` : ''}.`,
      { analysisRunId, failureCaseId },
    );
  }
}

export class FailureEvidenceNotFoundError extends FailureDomainError {
  public readonly code = 'FAILURE_EVIDENCE_NOT_FOUND' as const;

  constructor(evidenceReferenceId: string, failureCaseId?: string) {
    super(
      `FailureEvidenceReference '${evidenceReferenceId}' not found${failureCaseId ? ` for failure case '${failureCaseId}'` : ''}.`,
      { evidenceReferenceId, failureCaseId },
    );
  }
}
