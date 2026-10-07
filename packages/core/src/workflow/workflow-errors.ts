/**
 * @file packages/core/src/workflow/workflow-errors.ts
 * Domain error classes for workflow synchronization operations.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export abstract class WorkflowError extends Error {
  public abstract readonly code: DesktopErrorCode;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class WorkflowStateNotFoundError extends WorkflowError {
  public readonly code: DesktopErrorCode = 'WORKFLOW_STATE_NOT_FOUND';

  constructor(identifier: string) {
    super(`Workflow state not found for defect: ${identifier}`);
  }
}

export class InvalidWorkflowTransitionError extends WorkflowError {
  public readonly code: DesktopErrorCode = 'WORKFLOW_INVALID_TRANSITION';

  constructor(currentStatus: string, targetStatus: string, reason?: string) {
    super(
      `Invalid workflow transition from ${currentStatus} to ${targetStatus}${reason ? `: ${reason}` : ''}`,
    );
  }
}

export class WorkflowStatusUnmappedError extends WorkflowError {
  public readonly code: DesktopErrorCode = 'WORKFLOW_STATUS_UNMAPPED';

  constructor(externalStatus: string, externalSystem: string = 'JIRA') {
    super(
      `External status '${externalStatus}' in system '${externalSystem}' has no configured mapping to an internal bug status. Synchronization is blocked.`,
    );
  }
}

export class WorkflowSyncConflictError extends WorkflowError {
  public readonly code: DesktopErrorCode = 'WORKFLOW_SYNC_CONFLICT';

  constructor(
    message: string,
    public readonly conflictDetails?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export class WorkflowExternalIssueNotFoundError extends WorkflowError {
  public readonly code: DesktopErrorCode = 'WORKFLOW_EXTERNAL_ISSUE_NOT_FOUND';

  constructor(issueIdOrKey: string) {
    super(`External issue not found or deleted: ${issueIdOrKey}`);
  }
}

export class WorkflowSyncLockedError extends WorkflowError {
  public readonly code: DesktopErrorCode = 'WORKFLOW_SYNC_LOCKED';

  constructor(failureCaseId: string) {
    super(
      `Workflow synchronization for failure case ${failureCaseId} is already in progress. Please retry shortly.`,
    );
  }
}

export class WorkflowCrossProjectForbiddenError extends WorkflowError {
  public readonly code: DesktopErrorCode = 'WORKFLOW_CROSS_PROJECT_FORBIDDEN';

  constructor(message: string = 'Cross-project workflow operations are strictly forbidden.') {
    super(message);
  }
}

export class WorkflowMappingNotFoundError extends WorkflowError {
  public readonly code: DesktopErrorCode = 'WORKFLOW_MAPPING_NOT_FOUND';

  constructor(mappingId: string) {
    super(`Workflow status mapping not found: ${mappingId}`);
  }
}
