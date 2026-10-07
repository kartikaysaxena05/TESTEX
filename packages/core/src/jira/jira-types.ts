/**
 * @file packages/core/src/jira/jira-types.ts
 * Core domain types, bounds, lifecycle models, and service interfaces for Jira Integration Foundation (V7 Phase 89).
 */

import {
  type JiraDeploymentType,
  type JiraAuthenticationType,
  type JiraConnectionStatus,
  type JiraAuditEventType,
  type JiraConnectionDto,
  type JiraValidationResultDto,
  type JiraConnectionAuditDto,
  type CreateJiraConnectionInputDto,
  type UpdateJiraConnectionInputDto,
  type GetJiraConnectionInputDto,
  type DeleteJiraConnectionInputDto,
  type ValidateJiraConnectionInputDto,
  type ListJiraAuditLogInputDto,
  type JiraProjectConfigStatus,
  type JiraAssigneeStrategy,
  type JiraDiscoveredSiteDto,
  type JiraDiscoveredProjectDto,
  type JiraDiscoveredIssueTypeDto,
  type JiraDiscoveredPriorityDto,
  type JiraDiscoveredFieldDto,
  type JiraDiscoveredComponentDto,
  type JiraDiscoveredAssigneeDto,
  type JiraHealthCheckResultDto,
  type JiraProjectConfigDto,
  type DiscoverJiraSitesInputDto,
  type DiscoverJiraProjectsInputDto,
  type DiscoverJiraIssueTypesInputDto,
  type DiscoverJiraPrioritiesInputDto,
  type DiscoverJiraFieldsInputDto,
  type DiscoverJiraComponentsInputDto,
  type DiscoverJiraAssigneesInputDto,
  type GetJiraProjectConfigInputDto,
  type SaveJiraProjectConfigInputDto,
  type RefreshJiraProjectConfigInputDto,
  type TestJiraConnectionHealthInputDto,
  type JiraIssueCreationStatus,
  type JiraExternalIssueDto,
  type CreateJiraIssueInputDto,
  type GetJiraIssueInputDto,
  type JiraAttachmentStatusDto,
  type ListAttachableEvidenceInputDto,
  type JiraAttachableEvidenceItemDto,
  type AttachEvidenceInputDto,
  type JiraEvidenceAttachmentDto,
  type JiraAttachmentBatchResultDto,
  type GetAttachmentStatusInputDto,
  type JiraLinkSource,
  type JiraDuplicateDecision,
  type JiraIssueLinkDto,
  type EvaluateDuplicateInputDto,
  type JiraDuplicateEvaluationDto,
  type LinkExistingIssueInputDto,
  type GetIssueLinkInputDto,
  createJiraConnectionInputSchema,
  updateJiraConnectionInputSchema,
  getJiraConnectionInputSchema,
  deleteJiraConnectionInputSchema,
  validateJiraConnectionInputSchema,
  listJiraAuditLogInputSchema,
  jiraProjectConfigStatusSchema,
  jiraAssigneeStrategySchema,
  jiraDiscoveredSiteDtoSchema,
  jiraDiscoveredProjectDtoSchema,
  jiraDiscoveredIssueTypeDtoSchema,
  jiraDiscoveredPriorityDtoSchema,
  jiraDiscoveredFieldDtoSchema,
  jiraDiscoveredComponentDtoSchema,
  jiraDiscoveredAssigneeDtoSchema,
  jiraHealthCheckResultDtoSchema,
  jiraProjectConfigDtoSchema,
  discoverJiraSitesInputSchema,
  discoverJiraProjectsInputSchema,
  discoverJiraIssueTypesInputSchema,
  discoverJiraPrioritiesInputSchema,
  discoverJiraFieldsInputSchema,
  discoverJiraComponentsInputSchema,
  discoverJiraAssigneesInputSchema,
  getJiraProjectConfigInputSchema,
  saveJiraProjectConfigInputSchema,
  refreshJiraProjectConfigInputSchema,
  testJiraConnectionHealthInputSchema,
  jiraIssueCreationStatusSchema,
  jiraExternalIssueDtoSchema,
  createJiraIssueInputSchema,
  getJiraIssueInputSchema,
  jiraAttachmentStatusSchema,
  listAttachableEvidenceInputSchema,
  jiraAttachableEvidenceItemSchema,
  attachEvidenceInputSchema,
  jiraEvidenceAttachmentDtoSchema,
  jiraAttachmentBatchResultSchema,
  getAttachmentStatusInputSchema,
  jiraLinkSourceSchema,
  jiraDuplicateDecisionSchema,
  jiraIssueLinkDtoSchema,
  evaluateDuplicateInputSchema,
  jiraDuplicateEvaluationDtoSchema,
  linkExistingIssueInputSchema,
  getIssueLinkInputSchema,
  type DefectAssignmentSource,
  type JiraAssigneeSyncStatus,
  type DefectOwnershipAction,
  type ProjectEngineerDto,
  type RegisterProjectEngineerInputDto,
  type ListEligibleEngineersInputDto,
  type DefectOwnershipHistoryDto,
  type DefectOwnershipDto,
  type GetDefectOwnershipInputDto,
  type AssignEngineerInputDto,
  type UnassignEngineerInputDto,
  type SyncOwnershipFromJiraInputDto,
  type RetryJiraSyncInputDto,
  defectAssignmentSourceSchema,
  jiraAssigneeSyncStatusSchema,
  defectOwnershipActionSchema,
  projectEngineerDtoSchema,
  registerProjectEngineerInputSchema,
  listEligibleEngineersInputSchema,
  defectOwnershipHistoryDtoSchema,
  defectOwnershipDtoSchema,
  getDefectOwnershipInputSchema,
  assignEngineerInputSchema,
  unassignEngineerInputSchema,
  syncOwnershipFromJiraInputSchema,
  retryJiraSyncInputSchema,
} from '@ai-quality/contracts';

export {
  JiraDeploymentType,
  JiraAuthenticationType,
  JiraConnectionStatus,
  JiraAuditEventType,
  JiraConnectionDto,
  JiraValidationResultDto,
  JiraConnectionAuditDto,
  CreateJiraConnectionInputDto,
  UpdateJiraConnectionInputDto,
  GetJiraConnectionInputDto,
  DeleteJiraConnectionInputDto,
  ValidateJiraConnectionInputDto,
  ListJiraAuditLogInputDto,
  JiraProjectConfigStatus,
  JiraAssigneeStrategy,
  JiraDiscoveredSiteDto,
  JiraDiscoveredProjectDto,
  JiraDiscoveredIssueTypeDto,
  JiraDiscoveredPriorityDto,
  JiraDiscoveredFieldDto,
  JiraDiscoveredComponentDto,
  JiraDiscoveredAssigneeDto,
  JiraHealthCheckResultDto,
  JiraProjectConfigDto,
  DiscoverJiraSitesInputDto,
  DiscoverJiraProjectsInputDto,
  DiscoverJiraIssueTypesInputDto,
  DiscoverJiraPrioritiesInputDto,
  DiscoverJiraFieldsInputDto,
  DiscoverJiraComponentsInputDto,
  DiscoverJiraAssigneesInputDto,
  GetJiraProjectConfigInputDto,
  SaveJiraProjectConfigInputDto,
  RefreshJiraProjectConfigInputDto,
  TestJiraConnectionHealthInputDto,
  createJiraConnectionInputSchema,
  updateJiraConnectionInputSchema,
  getJiraConnectionInputSchema,
  deleteJiraConnectionInputSchema,
  validateJiraConnectionInputSchema,
  listJiraAuditLogInputSchema,
  jiraProjectConfigStatusSchema,
  jiraAssigneeStrategySchema,
  jiraDiscoveredSiteDtoSchema,
  jiraDiscoveredProjectDtoSchema,
  jiraDiscoveredIssueTypeDtoSchema,
  jiraDiscoveredPriorityDtoSchema,
  jiraDiscoveredFieldDtoSchema,
  jiraDiscoveredComponentDtoSchema,
  jiraDiscoveredAssigneeDtoSchema,
  jiraHealthCheckResultDtoSchema,
  jiraProjectConfigDtoSchema,
  discoverJiraSitesInputSchema,
  discoverJiraProjectsInputSchema,
  discoverJiraIssueTypesInputSchema,
  discoverJiraPrioritiesInputSchema,
  discoverJiraFieldsInputSchema,
  discoverJiraComponentsInputSchema,
  discoverJiraAssigneesInputSchema,
  getJiraProjectConfigInputSchema,
  saveJiraProjectConfigInputSchema,
  refreshJiraProjectConfigInputSchema,
  testJiraConnectionHealthInputSchema,
  jiraIssueCreationStatusSchema,
  jiraExternalIssueDtoSchema,
  createJiraIssueInputSchema,
  getJiraIssueInputSchema,
  jiraAttachmentStatusSchema,
  listAttachableEvidenceInputSchema,
  jiraAttachableEvidenceItemSchema,
  attachEvidenceInputSchema,
  jiraEvidenceAttachmentDtoSchema,
  jiraAttachmentBatchResultSchema,
  getAttachmentStatusInputSchema,
  type JiraIssueCreationStatus,
  type JiraExternalIssueDto,
  type CreateJiraIssueInputDto,
  type GetJiraIssueInputDto,
  type JiraAttachmentStatusDto,
  type ListAttachableEvidenceInputDto,
  type JiraAttachableEvidenceItemDto,
  type AttachEvidenceInputDto,
  type JiraEvidenceAttachmentDto,
  type JiraAttachmentBatchResultDto,
  type GetAttachmentStatusInputDto,
  type JiraLinkSource,
  type JiraDuplicateDecision,
  type JiraIssueLinkDto,
  type EvaluateDuplicateInputDto,
  type JiraDuplicateEvaluationDto,
  type LinkExistingIssueInputDto,
  type GetIssueLinkInputDto,
  jiraLinkSourceSchema,
  jiraDuplicateDecisionSchema,
  jiraIssueLinkDtoSchema,
  evaluateDuplicateInputSchema,
  jiraDuplicateEvaluationDtoSchema,
  linkExistingIssueInputSchema,
  getIssueLinkInputSchema,
  type DefectAssignmentSource,
  type JiraAssigneeSyncStatus,
  type DefectOwnershipAction,
  type ProjectEngineerDto,
  type RegisterProjectEngineerInputDto,
  type ListEligibleEngineersInputDto,
  type DefectOwnershipHistoryDto,
  type DefectOwnershipDto,
  type GetDefectOwnershipInputDto,
  type AssignEngineerInputDto,
  type UnassignEngineerInputDto,
  type SyncOwnershipFromJiraInputDto,
  type RetryJiraSyncInputDto,
  defectAssignmentSourceSchema,
  jiraAssigneeSyncStatusSchema,
  defectOwnershipActionSchema,
  projectEngineerDtoSchema,
  registerProjectEngineerInputSchema,
  listEligibleEngineersInputSchema,
  defectOwnershipHistoryDtoSchema,
  defectOwnershipDtoSchema,
  getDefectOwnershipInputSchema,
  assignEngineerInputSchema,
  unassignEngineerInputSchema,
  syncOwnershipFromJiraInputSchema,
  retryJiraSyncInputSchema,
};

/**
 * Architectural bounds and invariants for Jira integrations.
 */
export const JIRA_BOUNDS = {
  MAX_DISPLAY_NAME_LENGTH: 128,
  MAX_BASE_URL_LENGTH: 512,
  MAX_ACCOUNT_IDENTIFIER_LENGTH: 255,
  MAX_API_TOKEN_LENGTH: 4096,
  DEFAULT_TIMEOUT_MS: 10000,
  MIN_TIMEOUT_MS: 1000,
  MAX_TIMEOUT_MS: 60000,
  MAX_RETRIES: 2,
  RETRY_BASE_DELAY_MS: 250,
  MAX_RETRY_DELAY_MS: 2000,
  MAX_AUDIT_LOG_LIMIT: 100,
  DEFAULT_AUDIT_LOG_LIMIT: 50,
  MAX_ATTACHMENT_SIZE_BYTES: 10 * 1024 * 1024,
  MAX_ATTACHMENTS_PER_BATCH: 25,
} as const;

/**
 * Authenticated Jira identity metadata.
 */
export interface JiraAuthenticatedIdentity {
  readonly accountId?: string;
  readonly displayName?: string;
  readonly emailAddress?: string;
  readonly active?: boolean;
}

/**
 * Safe server/cloud information.
 */
export interface JiraServerInfo {
  readonly baseUrl?: string;
  readonly version?: string;
  readonly deploymentType?: string;
  readonly serverTitle?: string;
}

/**
 * Result of connection validation execution.
 */
export interface JiraValidationResult {
  readonly status: JiraConnectionStatus;
  readonly validatedAt: Date;
  readonly durationMs: number;
  readonly accountIdentity?: JiraAuthenticatedIdentity;
  readonly serverInfo?: JiraServerInfo;
  readonly accessibleProjectCount?: number;
  readonly rateLimitInfo?: {
    readonly retryAfterSeconds?: number;
  };
  readonly errorMessage?: string;
  readonly errorCode?: string;
}

/**
 * Common Jira request options for direct API client calls.
 */
export interface JiraRequestOptions {
  readonly baseUrl: string;
  readonly deploymentType: JiraDeploymentType;
  readonly authenticationType: JiraAuthenticationType;
  readonly accountIdentifier: string;
  readonly apiToken: string;
  readonly timeoutMs?: number;
  readonly allowLocalhostForTesting?: boolean;
}

/**
 * Decrypted credentials ready for authenticated Jira API requests.
 */
export interface ResolvedJiraCredentials {
  readonly accountIdentifier: string;
  readonly apiToken: string;
  readonly authenticationType: JiraAuthenticationType;
}

/**
 * Secure Credential Vault interface for Jira tokens.
 */
export interface IJiraCredentialVault {
  encrypt(plainToken: string, connectionId: string): Promise<string>;
  decrypt(encryptedPayload: string, connectionId: string): Promise<string>;
}

/**
 * Authoritative Jira Client interface.
 */
export interface IJiraClient {
  validateConnection(options: JiraRequestOptions): Promise<JiraValidationResult>;
  discoverSites(options: JiraRequestOptions): Promise<readonly JiraDiscoveredSiteDto[]>;
  discoverProjects(options: JiraRequestOptions): Promise<readonly JiraDiscoveredProjectDto[]>;
  discoverIssueTypes(
    options: JiraRequestOptions & { readonly projectIdOrKey: string },
  ): Promise<readonly JiraDiscoveredIssueTypeDto[]>;
  discoverPriorities(options: JiraRequestOptions): Promise<readonly JiraDiscoveredPriorityDto[]>;
  discoverFields(
    options: JiraRequestOptions & {
      readonly projectIdOrKey?: string;
      readonly issueTypeId?: string;
    },
  ): Promise<readonly JiraDiscoveredFieldDto[]>;
  discoverComponents(
    options: JiraRequestOptions & { readonly projectIdOrKey: string },
  ): Promise<readonly JiraDiscoveredComponentDto[]>;
  discoverAssignees(
    options: JiraRequestOptions & { readonly projectKey: string; readonly query?: string },
  ): Promise<readonly JiraDiscoveredAssigneeDto[]>;
  testConnectionHealth(
    options: JiraRequestOptions & {
      readonly projectIdOrKey?: string;
      readonly issueTypeId?: string;
    },
  ): Promise<JiraHealthCheckResultDto>;
  createIssue(
    options: JiraRequestOptions & { readonly payload: unknown },
  ): Promise<{ readonly id: string; readonly key: string; readonly self?: string }>;
  getIssue(options: JiraRequestOptions & { readonly issueIdOrKey: string }): Promise<{
    readonly id: string;
    readonly key: string;
    readonly self?: string;
    readonly fields?: Record<string, unknown>;
  }>;
  attachEvidence(
    options: JiraRequestOptions & {
      readonly issueIdOrKey: string;
      readonly filename: string;
      readonly content: Buffer;
      readonly mimeType?: string;
    },
  ): Promise<readonly JiraAttachmentResponseDto[]>;
  searchIssues?(
    options: JiraRequestOptions & {
      readonly jql: string;
      readonly maxResults?: number;
      readonly fields?: readonly string[];
    },
  ): Promise<{
    readonly issues: readonly {
      readonly id: string;
      readonly key: string;
      readonly fields?: Record<string, unknown>;
    }[];
    readonly total: number;
  }>;
  assignIssue?(
    options: JiraRequestOptions & {
      readonly issueIdOrKey: string;
      readonly accountId?: string | null;
      readonly username?: string | null;
    },
  ): Promise<void>;
  getTransitions?(
    options: JiraRequestOptions & { readonly issueIdOrKey: string },
  ): Promise<readonly JiraTransitionDto[]>;
  transitionIssue?(
    options: JiraRequestOptions & { readonly issueIdOrKey: string; readonly transitionId: string },
  ): Promise<void>;
  addComment?(
    options: JiraRequestOptions & {
      readonly issueIdOrKey: string;
      readonly body: string;
    },
  ): Promise<{ readonly id: string; readonly created?: string }>;
}

/**
 * Jira Transition DTO representing an available workflow transition.
 */
export interface JiraTransitionDto {
  readonly id: string;
  readonly name: string;
  readonly to: {
    readonly id: string;
    readonly name: string;
    readonly statusCategory?: {
      readonly id?: number;
      readonly key?: string;
      readonly name?: string;
    };
  };
  readonly hasScreen?: boolean;
  readonly isGlobal?: boolean;
  readonly isInitial?: boolean;
  readonly isConditional?: boolean;
}

/**
 * Jira Attachment response payload item from POST /rest/api/3/issue/{issueIdOrKey}/attachments.
 */
export interface JiraAttachmentResponseDto {
  readonly id: string;
  readonly self: string;
  readonly filename: string;
  readonly size: number;
  readonly mimeType: string;
  readonly created?: string;
}

/**
 * Core Jira Connection Service interface.
 */
export interface IJiraConnectionService {
  createConnection(input: CreateJiraConnectionInputDto): Promise<JiraConnectionDto>;
  updateConnection(input: UpdateJiraConnectionInputDto): Promise<JiraConnectionDto>;
  getConnection(input: GetJiraConnectionInputDto): Promise<JiraConnectionDto | null>;
  deleteConnection(input: DeleteJiraConnectionInputDto): Promise<{ readonly deleted: boolean }>;
  validateConnection(input: ValidateJiraConnectionInputDto): Promise<JiraValidationResultDto>;
  listAuditLog(input: ListJiraAuditLogInputDto): Promise<readonly JiraConnectionAuditDto[]>;

  // Phase 90 Discovery & Configuration
  discoverSites(input: DiscoverJiraSitesInputDto): Promise<readonly JiraDiscoveredSiteDto[]>;
  discoverProjects(
    input: DiscoverJiraProjectsInputDto,
  ): Promise<readonly JiraDiscoveredProjectDto[]>;
  discoverIssueTypes(
    input: DiscoverJiraIssueTypesInputDto,
  ): Promise<readonly JiraDiscoveredIssueTypeDto[]>;
  discoverPriorities(
    input: DiscoverJiraPrioritiesInputDto,
  ): Promise<readonly JiraDiscoveredPriorityDto[]>;
  discoverFields(input: DiscoverJiraFieldsInputDto): Promise<readonly JiraDiscoveredFieldDto[]>;
  discoverComponents(
    input: DiscoverJiraComponentsInputDto,
  ): Promise<readonly JiraDiscoveredComponentDto[]>;
  discoverAssignees(
    input: DiscoverJiraAssigneesInputDto,
  ): Promise<readonly JiraDiscoveredAssigneeDto[]>;
  getProjectConfig(input: GetJiraProjectConfigInputDto): Promise<JiraProjectConfigDto | null>;
  saveProjectConfig(input: SaveJiraProjectConfigInputDto): Promise<JiraProjectConfigDto>;
  refreshProjectConfig(input: RefreshJiraProjectConfigInputDto): Promise<JiraProjectConfigDto>;
  testConnectionHealth(input: TestJiraConnectionHealthInputDto): Promise<JiraHealthCheckResultDto>;
}

/**
 * Phase 91: Automated Jira Issue Creation Service interface.
 */
export interface IJiraIssueCreationService {
  createIssue(input: CreateJiraIssueInputDto): Promise<JiraExternalIssueDto>;
  getIssue(input: GetJiraIssueInputDto): Promise<JiraExternalIssueDto | null>;
}

/**
 * Phase 92: Bug Evidence & Artifact Attachment Service interface.
 */
export interface IJiraEvidenceAttachmentService {
  listAttachableEvidence(
    input: ListAttachableEvidenceInputDto,
  ): Promise<readonly JiraAttachableEvidenceItemDto[]>;
  attachEvidence(input: AttachEvidenceInputDto): Promise<JiraAttachmentBatchResultDto>;
  getAttachmentStatus(
    input: GetAttachmentStatusInputDto,
  ): Promise<readonly JiraEvidenceAttachmentDto[]>;
}

/**
 * Phase 93: Jira Duplicate Prevention & Existing-Issue Linking Service interface.
 */
export interface IJiraDuplicatePreventionService {
  evaluateBeforeCreate(input: EvaluateDuplicateInputDto): Promise<JiraDuplicateEvaluationDto>;
  linkExistingIssue(input: LinkExistingIssueInputDto): Promise<JiraIssueLinkDto>;
  getIssueLink(input: GetIssueLinkInputDto): Promise<JiraIssueLinkDto | null>;
  invalidateLink(linkId: string, reason: string): Promise<JiraIssueLinkDto>;
}

/**
 * Phase 94: Engineer Assignment & Defect Ownership Service interface.
 */
export interface IJiraDefectOwnershipService {
  registerProjectEngineer(input: RegisterProjectEngineerInputDto): Promise<ProjectEngineerDto>;
  listEligibleEngineers(
    input: ListEligibleEngineersInputDto,
  ): Promise<readonly ProjectEngineerDto[]>;
  getDefectOwnership(input: GetDefectOwnershipInputDto): Promise<DefectOwnershipDto | null>;
  assignEngineer(input: AssignEngineerInputDto): Promise<DefectOwnershipDto>;
  unassignEngineer(input: UnassignEngineerInputDto): Promise<DefectOwnershipDto>;
  syncOwnershipFromJira(input: SyncOwnershipFromJiraInputDto): Promise<DefectOwnershipDto>;
  retryJiraSync(input: RetryJiraSyncInputDto): Promise<DefectOwnershipDto>;
}
