/**
 * @file packages/core/src/jira/jira-errors.ts
 * Typed domain errors for Jira Integration Foundation (V7 Phase 89).
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export abstract class JiraError extends Error {
  public abstract readonly code: DesktopErrorCode;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class JiraAuthenticationFailedError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_AUTHENTICATION_FAILED';
  constructor(
    message = 'Jira authentication failed. Please verify your account email and API token.',
  ) {
    super(message);
  }
}

export class JiraPermissionDeniedError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_PERMISSION_DENIED';
  constructor(
    message = 'Jira permission denied. Authenticated identity lacks required permissions.',
  ) {
    super(message);
  }
}

export class JiraConnectionFailedError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_CONNECTION_FAILED';
  public readonly httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.httpStatus = httpStatus;
  }
}

export class JiraRequestTimeoutError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_REQUEST_TIMEOUT';
  constructor(timeoutMs: number, operation = 'request') {
    super(`Jira ${operation} timed out after ${timeoutMs}ms.`);
  }
}

export class JiraRateLimitedError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_RATE_LIMITED';
  public readonly retryAfterSeconds?: number;

  constructor(message: string, retryAfterSeconds?: number) {
    super(message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class JiraInvalidResponseError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_INVALID_RESPONSE';
  constructor(message = 'Received invalid or malformed response from Jira API.') {
    super(message);
  }
}

export class JiraConfigurationInvalidError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_CONFIGURATION_INVALID';
  constructor(message: string) {
    super(message);
  }
}

export class JiraConnectionNotFoundError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_CONNECTION_NOT_FOUND';
  constructor(identifier: string) {
    super(`Jira connection '${identifier}' was not found.`);
  }
}

export class JiraSecurityError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_SECURITY_VIOLATION';
  constructor(message: string) {
    super(message);
  }
}

export class JiraConcurrentMutationError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_CONCURRENT_MUTATION';
  constructor(message = 'Another Jira operation is already in progress for this project.') {
    super(message);
  }
}

export class JiraCrossProjectError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_CROSS_PROJECT';
  constructor(connectionId: string, projectId: string) {
    super(`Jira connection '${connectionId}' does not belong to project '${projectId}'.`);
  }
}

export class JiraProjectNotFoundError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_PROJECT_NOT_FOUND';
  constructor(projectKeyOrId: string) {
    super(`Jira project '${projectKeyOrId}' was not found or is inaccessible.`);
  }
}

export class JiraProjectAccessDeniedError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_PROJECT_ACCESS_DENIED';
  constructor(projectKeyOrId: string) {
    super(`Access to Jira project '${projectKeyOrId}' was denied.`);
  }
}

export class JiraIssueTypeNotFoundError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_ISSUE_TYPE_NOT_FOUND';
  constructor(issueTypeId: string, projectKeyOrId?: string) {
    super(
      `Jira issue type '${issueTypeId}' was not found${projectKeyOrId ? ` in project '${projectKeyOrId}'` : ''}.`,
    );
  }
}

export class JiraPriorityNotFoundError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_PRIORITY_NOT_FOUND';
  constructor(priorityId: string) {
    super(`Jira priority '${priorityId}' was not found.`);
  }
}

export class JiraConfigNotFoundError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_CONFIG_NOT_FOUND';
  constructor(projectId: string) {
    super(`Jira project configuration for project '${projectId}' was not found.`);
  }
}

export class JiraStaleConfigError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_STALE_CONFIG';
  constructor(message: string) {
    super(message);
  }
}

export class JiraWrongProjectMetadataError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_WRONG_PROJECT_METADATA';
  constructor(message: string) {
    super(message);
  }
}

export class JiraConnectionExpiredError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_CONNECTION_EXPIRED';
  constructor(message = 'Jira authentication credentials have expired.') {
    super(message);
  }
}

export class JiraConnectionRevokedError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_CONNECTION_REVOKED';
  constructor(message = 'Jira authentication credentials have been revoked.') {
    super(message);
  }
}

export class JiraSiteUnreachableError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_SITE_UNREACHABLE';
  constructor(url: string, cause?: string) {
    super(`Jira site at '${url}' is unreachable.${cause ? ` Cause: ${cause}` : ''}`);
  }
}

export class JiraIssueIneligibleError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_ISSUE_INELIGIBLE';
  constructor(reason: string) {
    super(`Failure report is not eligible for Jira issue creation: ${reason}`);
  }
}

export class JiraIssueCreationFailedError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_ISSUE_CREATION_FAILED';
  constructor(message: string) {
    super(message);
  }
}

export class JiraIssueAlreadyExistsError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_ISSUE_ALREADY_EXISTS';
  constructor(jiraIssueKey: string) {
    super(`A Jira issue has already been created for this failure report: ${jiraIssueKey}`);
  }
}

export class JiraBugReportNotFoundError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_BUG_REPORT_NOT_FOUND';
  constructor(identifier: string) {
    super(`Bug report '${identifier}' was not found.`);
  }
}

export class JiraAttachmentIneligibleError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_ATTACHMENT_INELIGIBLE';
  constructor(reason: string) {
    super(`Evidence artifact is not eligible for Jira attachment: ${reason}`);
  }
}

export class JiraEvidenceNotFoundError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_EVIDENCE_NOT_FOUND';
  constructor(referenceId: string) {
    super(`Evidence reference '${referenceId}' was not found.`);
  }
}

export class JiraEvidenceIntegrityError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_EVIDENCE_INTEGRITY_FAILED';
  constructor(referenceId: string, details?: string) {
    super(
      `Evidence integrity verification failed for reference '${referenceId}'.${details ? ` ${details}` : ''}`,
    );
  }
}

export class JiraEvidenceTooLargeError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_EVIDENCE_TOO_LARGE';
  constructor(fileName: string, sizeBytes: number, maxBytes: number) {
    super(
      `Evidence artifact '${fileName}' (${sizeBytes} bytes) exceeds maximum Jira upload limit of ${maxBytes} bytes.`,
    );
  }
}

export class JiraEvidenceUnsupportedTypeError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_EVIDENCE_UNSUPPORTED_TYPE';
  constructor(artifactType: string) {
    super(`Evidence artifact type '${artifactType}' is unsupported for automated Jira attachment.`);
  }
}

export class JiraAttachmentFailedError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_ATTACHMENT_FAILED';
  constructor(message: string) {
    super(message);
  }
}

export class JiraDuplicateFoundError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_DUPLICATE_FOUND';
  constructor(jiraIssueKey: string, reason: string) {
    super(`Duplicate Jira issue detected (${jiraIssueKey}): ${reason}`);
  }
}

export class JiraLinkNotFoundError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_LINK_NOT_FOUND';
  constructor(identifier: string) {
    super(`Jira issue linkage '${identifier}' was not found.`);
  }
}

export class JiraLinkInvalidError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_LINK_INVALID';
  constructor(reason: string) {
    super(`Jira issue linkage is invalid: ${reason}`);
  }
}

export class JiraDeduplicationConflictError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_DEDUPLICATION_CONFLICT';
  constructor(message: string) {
    super(message);
  }
}

export class JiraDefectClusterNotFoundError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_DEFECT_CLUSTER_NOT_FOUND';
  constructor(clusterId: string) {
    super(`Defect cluster '${clusterId}' was not found.`);
  }
}

export class JiraIssueNotFoundError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_ISSUE_NOT_FOUND';
  constructor(issueKeyOrId: string) {
    super(`Jira issue '${issueKeyOrId}' was not found in remote Jira instance.`);
  }
}

export class JiraEngineerIneligibleError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_ENGINEER_INELIGIBLE';
  constructor(reason: string) {
    super(`Engineer is not eligible for assignment: ${reason}`);
  }
}

export class JiraEngineerNotFoundError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_ENGINEER_NOT_FOUND';
  constructor(identifier: string) {
    super(`Project engineer '${identifier}' was not found.`);
  }
}

export class JiraStaleOwnershipVersionError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_STALE_OWNERSHIP_VERSION';
  constructor(expectedVersion: number, currentVersion: number) {
    super(
      `Defect ownership update rejected due to version mismatch: expected ${expectedVersion}, but current version is ${currentVersion}.`,
    );
  }
}

export class JiraOwnershipNotFoundError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_OWNERSHIP_NOT_FOUND';
  constructor(identifier: string) {
    super(`Defect ownership for bug report '${identifier}' was not found.`);
  }
}

export class JiraOwnershipConflictError extends JiraError {
  public readonly code: DesktopErrorCode = 'JIRA_OWNERSHIP_CONFLICT';
  constructor(message: string) {
    super(message);
  }
}
