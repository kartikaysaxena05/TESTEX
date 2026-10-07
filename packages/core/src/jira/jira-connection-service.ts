/**
 * @file packages/core/src/jira/jira-connection-service.ts
 * Core domain service for Jira integration configuration, credential encryption, connection validation, and audit tracking.
 */

import crypto from 'node:crypto';
import type { PrismaClient, JiraConnection, JiraProjectConfig } from '@prisma/client';
import {
  type IJiraConnectionService,
  type IJiraCredentialVault,
  type IJiraClient,
  type JiraConnectionDto,
  type JiraValidationResultDto,
  type JiraConnectionAuditDto,
  type CreateJiraConnectionInputDto,
  type UpdateJiraConnectionInputDto,
  type GetJiraConnectionInputDto,
  type DeleteJiraConnectionInputDto,
  type ValidateJiraConnectionInputDto,
  type ListJiraAuditLogInputDto,
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
  createJiraConnectionInputSchema,
  updateJiraConnectionInputSchema,
  getJiraConnectionInputSchema,
  deleteJiraConnectionInputSchema,
  validateJiraConnectionInputSchema,
  listJiraAuditLogInputSchema,
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
  JIRA_BOUNDS,
} from './jira-types.js';
import { JiraCredentialVault } from './jira-credential-vault.js';
import { JiraClient } from './jira-client.js';
import { JiraUrlValidator } from './jira-url-validator.js';
import {
  JiraConnectionNotFoundError,
  JiraCrossProjectError,
  JiraConcurrentMutationError,
  JiraConfigNotFoundError,
  JiraWrongProjectMetadataError,
} from './jira-errors.js';
import { ProjectNotFoundError } from '../projects/project-errors.js';

export class JiraConnectionService implements IJiraConnectionService {
  private readonly prisma: PrismaClient;
  private readonly vault: IJiraCredentialVault;
  private readonly jiraClient: IJiraClient;
  private readonly activeProjectLocks: Set<string> = new Set();
  private readonly allowLocalhostForTesting: boolean;

  constructor(options: {
    readonly prisma: PrismaClient;
    readonly vault?: IJiraCredentialVault;
    readonly jiraClient?: IJiraClient;
    readonly allowLocalhostForTesting?: boolean;
  }) {
    this.prisma = options.prisma;
    this.vault = options.vault ?? new JiraCredentialVault();
    this.jiraClient = options.jiraClient ?? new JiraClient();
    this.allowLocalhostForTesting = Boolean(options.allowLocalhostForTesting);
  }

  /**
   * Acquires a mutex lock for a specific project during mutations.
   */
  private acquireLock(projectId: string): () => void {
    if (this.activeProjectLocks.has(projectId)) {
      throw new JiraConcurrentMutationError();
    }
    this.activeProjectLocks.add(projectId);
    return () => {
      this.activeProjectLocks.delete(projectId);
    };
  }

  /**
   * Creates a new Jira connection within project boundaries.
   */
  public async createConnection(input: CreateJiraConnectionInputDto): Promise<JiraConnectionDto> {
    const validated = createJiraConnectionInputSchema.parse(input);
    const releaseLock = this.acquireLock(validated.projectId);

    try {
      // 1. Verify Project exists
      const project = await this.prisma.project.findUnique({
        where: { id: validated.projectId },
      });
      if (!project) {
        throw new ProjectNotFoundError(validated.projectId);
      }

      // 2. Validate Base URL & SSRF
      const normalizedBaseUrl = JiraUrlValidator.validateAndNormalizeBaseUrl(validated.baseUrl, {
        allowLocalhostForTesting: this.allowLocalhostForTesting,
      });

      // 3. Encrypt API Token
      const connectionId = crypto.randomUUID();
      const encryptedToken = await this.vault.encrypt(validated.apiToken, connectionId);
      const secretRef = `vault:jira:${connectionId}`;

      // 4. Persist connection atomically
      const connection = await this.prisma.jiraConnection.create({
        data: {
          id: connectionId,
          projectId: validated.projectId,
          displayName: validated.displayName.trim(),
          deploymentType: validated.deploymentType ?? 'JIRA_CLOUD',
          baseUrl: normalizedBaseUrl,
          authenticationType: validated.authenticationType ?? 'API_TOKEN',
          accountIdentifier: validated.accountIdentifier.trim(),
          secretReference: secretRef,
          encryptedCredentials: encryptedToken,
          connectionStatus: 'UNVALIDATED',
          createdBy: 'USER',
        },
      });

      // 5. Audit creation
      await this.createAuditRecord({
        connectionId: connection.id,
        projectId: validated.projectId,
        eventType: 'CONNECTION_CREATED',
        newStatus: 'UNVALIDATED',
        details: {
          displayName: connection.displayName,
          baseUrl: connection.baseUrl,
          deploymentType: connection.deploymentType,
          accountIdentifier: connection.accountIdentifier,
        },
      });

      // 6. Optional immediate validation
      if (validated.validateImmediately) {
        await this.executeValidationInternal(connection, undefined);
        const refreshed = await this.prisma.jiraConnection.findUniqueOrThrow({
          where: { id: connection.id },
        });
        return this.mapToDto(refreshed);
      }

      return this.mapToDto(connection);
    } finally {
      releaseLock();
    }
  }

  /**
   * Updates an existing Jira connection safely.
   */
  public async updateConnection(input: UpdateJiraConnectionInputDto): Promise<JiraConnectionDto> {
    const validated = updateJiraConnectionInputSchema.parse(input);
    const releaseLock = this.acquireLock(validated.projectId);

    try {
      // 1. Find existing connection and verify project boundary
      const existing = await this.prisma.jiraConnection.findUnique({
        where: { id: validated.connectionId },
      });
      if (!existing) {
        throw new JiraConnectionNotFoundError(validated.connectionId);
      }
      if (existing.projectId !== validated.projectId) {
        throw new JiraCrossProjectError(validated.connectionId, validated.projectId);
      }

      const updates: {
        displayName?: string;
        baseUrl?: string;
        accountIdentifier?: string;
        authenticationType?: JiraConnection['authenticationType'];
        encryptedCredentials?: string;
        connectionStatus?: JiraConnection['connectionStatus'];
      } = {};

      if (validated.displayName !== undefined) {
        updates.displayName = validated.displayName.trim();
      }

      if (validated.accountIdentifier !== undefined) {
        updates.accountIdentifier = validated.accountIdentifier.trim();
      }

      if (validated.authenticationType !== undefined) {
        updates.authenticationType = validated.authenticationType;
      }

      let credentialsReplaced = false;
      if (validated.apiToken && validated.apiToken.trim().length > 0) {
        updates.encryptedCredentials = await this.vault.encrypt(
          validated.apiToken.trim(),
          existing.id,
        );
        credentialsReplaced = true;
      }

      let urlChanged = false;
      if (validated.baseUrl !== undefined) {
        const normalized = JiraUrlValidator.validateAndNormalizeBaseUrl(validated.baseUrl, {
          allowLocalhostForTesting: this.allowLocalhostForTesting,
        });
        if (normalized !== existing.baseUrl) {
          updates.baseUrl = normalized;
          urlChanged = true;
          // Invalidate previous validation status
          updates.connectionStatus = 'UNVALIDATED';
        }
      }

      const updated = await this.prisma.jiraConnection.update({
        where: { id: existing.id },
        data: updates,
      });

      // Audit updates
      if (credentialsReplaced) {
        await this.createAuditRecord({
          connectionId: existing.id,
          projectId: validated.projectId,
          eventType: 'CREDENTIALS_REPLACED',
          previousStatus: existing.connectionStatus,
          newStatus: updated.connectionStatus,
          details: { replaced: true },
        });
      }

      await this.createAuditRecord({
        connectionId: existing.id,
        projectId: validated.projectId,
        eventType: 'CONNECTION_UPDATED',
        previousStatus: existing.connectionStatus,
        newStatus: updated.connectionStatus,
        details: {
          urlChanged,
          displayNameChanged: validated.displayName !== undefined,
        },
      });

      if (validated.validateImmediately) {
        await this.executeValidationInternal(updated, undefined);
        const refreshed = await this.prisma.jiraConnection.findUniqueOrThrow({
          where: { id: existing.id },
        });
        return this.mapToDto(refreshed);
      }

      return this.mapToDto(updated);
    } finally {
      releaseLock();
    }
  }

  /**
   * Idempotently retrieves the Jira connection for a project without side effects.
   */
  public async getConnection(input: GetJiraConnectionInputDto): Promise<JiraConnectionDto | null> {
    const validated = getJiraConnectionInputSchema.parse(input);

    let connection: JiraConnection | null = null;
    if (validated.connectionId) {
      connection = await this.prisma.jiraConnection.findUnique({
        where: { id: validated.connectionId },
      });
      if (connection && connection.projectId !== validated.projectId) {
        throw new JiraCrossProjectError(validated.connectionId, validated.projectId);
      }
    } else {
      connection = await this.prisma.jiraConnection.findFirst({
        where: { projectId: validated.projectId },
      });
    }

    if (!connection) {
      return null;
    }

    return this.mapToDto(connection);
  }

  /**
   * Deletes a Jira connection and cleans up local references safely.
   */
  public async deleteConnection(
    input: DeleteJiraConnectionInputDto,
  ): Promise<{ readonly deleted: boolean }> {
    const validated = deleteJiraConnectionInputSchema.parse(input);
    const releaseLock = this.acquireLock(validated.projectId);

    try {
      const existing = await this.prisma.jiraConnection.findUnique({
        where: { id: validated.connectionId },
      });
      if (!existing) {
        throw new JiraConnectionNotFoundError(validated.connectionId);
      }
      if (existing.projectId !== validated.projectId) {
        throw new JiraCrossProjectError(validated.connectionId, validated.projectId);
      }

      await this.createAuditRecord({
        connectionId: existing.id,
        projectId: validated.projectId,
        eventType: 'CONNECTION_DELETED',
        previousStatus: existing.connectionStatus,
        newStatus: 'DISCONNECTED',
        details: { displayName: existing.displayName },
      });

      await this.prisma.jiraConnection.delete({
        where: { id: existing.id },
      });

      return { deleted: true };
    } finally {
      releaseLock();
    }
  }

  /**
   * Validates connection to Jira using read-only endpoints.
   */
  public async validateConnection(
    input: ValidateJiraConnectionInputDto,
  ): Promise<JiraValidationResultDto> {
    const validated = validateJiraConnectionInputSchema.parse(input);
    const releaseLock = this.acquireLock(validated.projectId);

    try {
      const connection = await this.prisma.jiraConnection.findUnique({
        where: { id: validated.connectionId },
      });
      if (!connection) {
        throw new JiraConnectionNotFoundError(validated.connectionId);
      }
      if (connection.projectId !== validated.projectId) {
        throw new JiraCrossProjectError(validated.connectionId, validated.projectId);
      }

      return await this.executeValidationInternal(connection, validated.timeoutMs);
    } finally {
      releaseLock();
    }
  }

  /**
   * Internal connection validation execution.
   */
  private async executeValidationInternal(
    connection: JiraConnection,
    timeoutMs?: number,
  ): Promise<JiraValidationResultDto> {
    await this.createAuditRecord({
      connectionId: connection.id,
      projectId: connection.projectId,
      eventType: 'VALIDATION_ATTEMPTED',
      previousStatus: connection.connectionStatus,
    });

    if (!connection.encryptedCredentials) {
      throw new JiraConnectionNotFoundError('Connection has no encrypted credentials configured.');
    }

    // Decrypt token inside main process only
    const apiToken = await this.vault.decrypt(connection.encryptedCredentials, connection.id);

    const result = await this.jiraClient.validateConnection({
      baseUrl: connection.baseUrl,
      deploymentType: connection.deploymentType,
      authenticationType: connection.authenticationType,
      accountIdentifier: connection.accountIdentifier,
      apiToken,
      timeoutMs,
      allowLocalhostForTesting: this.allowLocalhostForTesting,
    });

    const isSuccess = result.status === 'CONNECTED';
    const validationResultJson: any = {
      status: result.status,
      validatedAt: result.validatedAt.toISOString(),
      durationMs: result.durationMs,
      accountIdentity: result.accountIdentity,
      serverInfo: result.serverInfo,
      rateLimitInfo: result.rateLimitInfo,
      errorMessage: result.errorMessage,
      errorCode: result.errorCode,
    };

    // Update connection status in PostgreSQL
    await this.prisma.jiraConnection.update({
      where: { id: connection.id },
      data: {
        connectionStatus: result.status,
        lastValidatedAt: result.validatedAt,
        lastValidationResult: validationResultJson,
      },
    });

    // Record audit event
    await this.createAuditRecord({
      connectionId: connection.id,
      projectId: connection.projectId,
      eventType: isSuccess ? 'VALIDATION_SUCCEEDED' : 'VALIDATION_FAILED',
      previousStatus: connection.connectionStatus,
      newStatus: result.status,
      details: {
        durationMs: result.durationMs,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      },
    });

    return validationResultJson;
  }

  /**
   * Retrieves audit logs for Jira integration.
   */
  public async listAuditLog(
    input: ListJiraAuditLogInputDto,
  ): Promise<readonly JiraConnectionAuditDto[]> {
    const validated = listJiraAuditLogInputSchema.parse(input);

    const logs = await this.prisma.jiraConnectionAudit.findMany({
      where: {
        projectId: validated.projectId,
        ...(validated.connectionId ? { connectionId: validated.connectionId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: validated.limit ?? JIRA_BOUNDS.DEFAULT_AUDIT_LOG_LIMIT,
    });

    return logs.map(l => ({
      id: l.id,
      connectionId: l.connectionId,
      projectId: l.projectId,
      eventType: l.eventType,
      previousStatus: l.previousStatus,
      newStatus: l.newStatus,
      details: (l.details as Record<string, unknown>) ?? null,
      actor: l.actor,
      createdAt: l.createdAt.toISOString(),
    }));
  }

  /**
   * Records an audit log entry.
   */
  private async createAuditRecord(params: {
    readonly connectionId: string;
    readonly projectId: string;
    readonly eventType: JiraConnectionAuditDto['eventType'];
    readonly previousStatus?: JiraConnection['connectionStatus'];
    readonly newStatus?: JiraConnection['connectionStatus'];
    readonly details?: Record<string, unknown>;
    readonly actor?: string;
  }): Promise<void> {
    await this.prisma.jiraConnectionAudit.create({
      data: {
        connectionId: params.connectionId,
        projectId: params.projectId,
        eventType: params.eventType,
        previousStatus: params.previousStatus ?? null,
        newStatus: params.newStatus ?? null,
        details: (params.details as any) ?? null,
        actor: params.actor ?? 'USER',
      },
    });
  }

  /**
   * Resolves a Jira connection within project boundaries and decrypts its credentials.
   */
  private async getDecryptedConnection(
    projectId: string,
    connectionId?: string,
  ): Promise<{
    readonly connection: JiraConnection;
    readonly apiToken: string;
  }> {
    let conn: JiraConnection | null = null;
    if (connectionId) {
      conn = await this.prisma.jiraConnection.findUnique({
        where: { id: connectionId },
      });
      if (conn && conn.projectId !== projectId) {
        throw new JiraCrossProjectError(connectionId, projectId);
      }
    } else {
      conn = await this.prisma.jiraConnection.findFirst({
        where: { projectId },
      });
    }

    if (!conn) {
      throw new JiraConnectionNotFoundError(connectionId ?? projectId);
    }
    if (!conn.encryptedCredentials) {
      throw new JiraConnectionNotFoundError('Connection has no encrypted credentials configured.');
    }

    const apiToken = await this.vault.decrypt(conn.encryptedCredentials, conn.id);
    return { connection: conn, apiToken };
  }

  /**
   * Discovers accessible Jira sites.
   */
  public async discoverSites(
    input: DiscoverJiraSitesInputDto,
  ): Promise<readonly JiraDiscoveredSiteDto[]> {
    const validated = discoverJiraSitesInputSchema.parse(input);
    const { connection, apiToken } = await this.getDecryptedConnection(
      validated.projectId,
      validated.connectionId,
    );

    return await this.jiraClient.discoverSites({
      baseUrl: connection.baseUrl,
      deploymentType: connection.deploymentType,
      authenticationType: connection.authenticationType,
      accountIdentifier: connection.accountIdentifier,
      apiToken,
      allowLocalhostForTesting: this.allowLocalhostForTesting,
    });
  }

  /**
   * Discovers accessible Jira projects.
   */
  public async discoverProjects(
    input: DiscoverJiraProjectsInputDto,
  ): Promise<readonly JiraDiscoveredProjectDto[]> {
    const validated = discoverJiraProjectsInputSchema.parse(input);
    const { connection, apiToken } = await this.getDecryptedConnection(
      validated.projectId,
      validated.connectionId,
    );

    return await this.jiraClient.discoverProjects({
      baseUrl: connection.baseUrl,
      deploymentType: connection.deploymentType,
      authenticationType: connection.authenticationType,
      accountIdentifier: connection.accountIdentifier,
      apiToken,
      allowLocalhostForTesting: this.allowLocalhostForTesting,
    });
  }

  /**
   * Discovers issue types for a specified project.
   */
  public async discoverIssueTypes(
    input: DiscoverJiraIssueTypesInputDto,
  ): Promise<readonly JiraDiscoveredIssueTypeDto[]> {
    const validated = discoverJiraIssueTypesInputSchema.parse(input);
    const { connection, apiToken } = await this.getDecryptedConnection(
      validated.projectId,
      validated.connectionId,
    );

    return await this.jiraClient.discoverIssueTypes({
      baseUrl: connection.baseUrl,
      deploymentType: connection.deploymentType,
      authenticationType: connection.authenticationType,
      accountIdentifier: connection.accountIdentifier,
      apiToken,
      projectIdOrKey: validated.jiraProjectIdOrKey,
      allowLocalhostForTesting: this.allowLocalhostForTesting,
    });
  }

  /**
   * Discovers priorities configured on Jira.
   */
  public async discoverPriorities(
    input: DiscoverJiraPrioritiesInputDto,
  ): Promise<readonly JiraDiscoveredPriorityDto[]> {
    const validated = discoverJiraPrioritiesInputSchema.parse(input);
    const { connection, apiToken } = await this.getDecryptedConnection(
      validated.projectId,
      validated.connectionId,
    );

    return await this.jiraClient.discoverPriorities({
      baseUrl: connection.baseUrl,
      deploymentType: connection.deploymentType,
      authenticationType: connection.authenticationType,
      accountIdentifier: connection.accountIdentifier,
      apiToken,
      allowLocalhostForTesting: this.allowLocalhostForTesting,
    });
  }

  /**
   * Discovers field metadata.
   */
  public async discoverFields(
    input: DiscoverJiraFieldsInputDto,
  ): Promise<readonly JiraDiscoveredFieldDto[]> {
    const validated = discoverJiraFieldsInputSchema.parse(input);
    const { connection, apiToken } = await this.getDecryptedConnection(
      validated.projectId,
      validated.connectionId,
    );

    return await this.jiraClient.discoverFields({
      baseUrl: connection.baseUrl,
      deploymentType: connection.deploymentType,
      authenticationType: connection.authenticationType,
      accountIdentifier: connection.accountIdentifier,
      apiToken,
      projectIdOrKey: validated.jiraProjectIdOrKey,
      issueTypeId: validated.issueTypeId,
      allowLocalhostForTesting: this.allowLocalhostForTesting,
    });
  }

  /**
   * Discovers components for a specified project.
   */
  public async discoverComponents(
    input: DiscoverJiraComponentsInputDto,
  ): Promise<readonly JiraDiscoveredComponentDto[]> {
    const validated = discoverJiraComponentsInputSchema.parse(input);
    const { connection, apiToken } = await this.getDecryptedConnection(
      validated.projectId,
      validated.connectionId,
    );

    return await this.jiraClient.discoverComponents({
      baseUrl: connection.baseUrl,
      deploymentType: connection.deploymentType,
      authenticationType: connection.authenticationType,
      accountIdentifier: connection.accountIdentifier,
      apiToken,
      projectIdOrKey: validated.jiraProjectIdOrKey,
      allowLocalhostForTesting: this.allowLocalhostForTesting,
    });
  }

  /**
   * Discovers assignable users for a given project key.
   */
  public async discoverAssignees(
    input: DiscoverJiraAssigneesInputDto,
  ): Promise<readonly JiraDiscoveredAssigneeDto[]> {
    const validated = discoverJiraAssigneesInputSchema.parse(input);
    const { connection, apiToken } = await this.getDecryptedConnection(
      validated.projectId,
      validated.connectionId,
    );

    return await this.jiraClient.discoverAssignees({
      baseUrl: connection.baseUrl,
      deploymentType: connection.deploymentType,
      authenticationType: connection.authenticationType,
      accountIdentifier: connection.accountIdentifier,
      apiToken,
      projectKey: validated.jiraProjectKey,
      query: validated.query,
      allowLocalhostForTesting: this.allowLocalhostForTesting,
    });
  }

  /**
   * Performs connection health check with multi-step diagnostics.
   */
  public async testConnectionHealth(
    input: TestJiraConnectionHealthInputDto,
  ): Promise<JiraHealthCheckResultDto> {
    const validated = testJiraConnectionHealthInputSchema.parse(input);
    const { connection, apiToken } = await this.getDecryptedConnection(
      validated.projectId,
      validated.connectionId,
    );

    const result = await this.jiraClient.testConnectionHealth({
      baseUrl: connection.baseUrl,
      deploymentType: connection.deploymentType,
      authenticationType: connection.authenticationType,
      accountIdentifier: connection.accountIdentifier,
      apiToken,
      projectIdOrKey: validated.jiraProjectIdOrKey,
      issueTypeId: validated.issueTypeId,
      allowLocalhostForTesting: this.allowLocalhostForTesting,
    });

    await this.createAuditRecord({
      connectionId: connection.id,
      projectId: validated.projectId,
      eventType: 'HEALTH_CHECKED',
      previousStatus: connection.connectionStatus,
      newStatus: result.status,
      details: {
        healthy: result.healthy,
        durationMs: result.durationMs,
        checks: result.checks,
      },
    });

    return result;
  }

  /**
   * Retrieves stored Jira project configuration profile.
   */
  public async getProjectConfig(
    input: GetJiraProjectConfigInputDto,
  ): Promise<JiraProjectConfigDto | null> {
    const validated = getJiraProjectConfigInputSchema.parse(input);
    const config = await this.prisma.jiraProjectConfig.findUnique({
      where: { projectId: validated.projectId },
    });

    if (!config) {
      return null;
    }

    return this.mapProjectConfigToDto(config);
  }

  /**
   * Saves Jira project configuration with cross-project validation and metadata verification.
   */
  public async saveProjectConfig(
    input: SaveJiraProjectConfigInputDto,
  ): Promise<JiraProjectConfigDto> {
    const validated = saveJiraProjectConfigInputSchema.parse(input);
    const releaseLock = this.acquireLock(validated.projectId);

    try {
      // 1. Verify project exists
      const project = await this.prisma.project.findUnique({
        where: { id: validated.projectId },
      });
      if (!project) {
        throw new ProjectNotFoundError(validated.projectId);
      }

      // 2. Resolve connection & credentials
      const { connection, apiToken } = await this.getDecryptedConnection(
        validated.projectId,
        validated.connectionId,
      );

      // 3. Defend against wrong-project metadata selection:
      // Verify selected issue type belongs to target Jira project
      const issueTypes = await this.jiraClient.discoverIssueTypes({
        baseUrl: connection.baseUrl,
        deploymentType: connection.deploymentType,
        authenticationType: connection.authenticationType,
        accountIdentifier: connection.accountIdentifier,
        apiToken,
        projectIdOrKey: validated.jiraProjectId,
        allowLocalhostForTesting: this.allowLocalhostForTesting,
      });

      const matchedIssueType = issueTypes.find(
        it =>
          it.id === validated.selectedIssueTypeId || it.name === validated.selectedIssueTypeName,
      );
      if (!matchedIssueType) {
        throw new JiraWrongProjectMetadataError(
          `Selected issue type '${validated.selectedIssueTypeName}' (${validated.selectedIssueTypeId}) does not belong to Jira project '${validated.jiraProjectKey}'.`,
        );
      }

      // If a default component is selected, verify it belongs to target project
      if (validated.defaultComponentId) {
        const components = await this.jiraClient.discoverComponents({
          baseUrl: connection.baseUrl,
          deploymentType: connection.deploymentType,
          authenticationType: connection.authenticationType,
          accountIdentifier: connection.accountIdentifier,
          apiToken,
          projectIdOrKey: validated.jiraProjectId,
          allowLocalhostForTesting: this.allowLocalhostForTesting,
        });
        const matchedComp = components.find(c => c.id === validated.defaultComponentId);
        if (!matchedComp) {
          throw new JiraWrongProjectMetadataError(
            `Selected component '${validated.defaultComponentName ?? validated.defaultComponentId}' does not belong to Jira project '${validated.jiraProjectKey}'.`,
          );
        }
      }

      const metadataSnapshot = {
        project: {
          id: validated.jiraProjectId,
          key: validated.jiraProjectKey,
          name: validated.jiraProjectName,
        },
        issueType: matchedIssueType,
        savedAt: new Date().toISOString(),
      };

      const config = await this.prisma.jiraProjectConfig.upsert({
        where: { projectId: validated.projectId },
        create: {
          projectId: validated.projectId,
          connectionId: validated.connectionId,
          jiraProjectId: validated.jiraProjectId,
          jiraProjectKey: validated.jiraProjectKey,
          jiraProjectName: validated.jiraProjectName,
          selectedIssueTypeId: validated.selectedIssueTypeId,
          selectedIssueTypeName: validated.selectedIssueTypeName,
          defaultPriorityId: validated.defaultPriorityId ?? null,
          defaultPriorityName: validated.defaultPriorityName ?? null,
          defaultComponentId: validated.defaultComponentId ?? null,
          defaultComponentName: validated.defaultComponentName ?? null,
          assigneeStrategy: validated.assigneeStrategy ?? 'UNASSIGNED',
          defaultAssigneeId: validated.defaultAssigneeId ?? null,
          defaultAssigneeName: validated.defaultAssigneeName ?? null,
          fieldMappings: (validated.fieldMappings as any) ?? null,
          configStatus: 'CONFIGURED',
          staleReason: null,
          metadataSnapshot,
          lastRefreshedAt: new Date(),
          createdBy: 'USER',
        },
        update: {
          connectionId: validated.connectionId,
          jiraProjectId: validated.jiraProjectId,
          jiraProjectKey: validated.jiraProjectKey,
          jiraProjectName: validated.jiraProjectName,
          selectedIssueTypeId: validated.selectedIssueTypeId,
          selectedIssueTypeName: validated.selectedIssueTypeName,
          defaultPriorityId: validated.defaultPriorityId ?? null,
          defaultPriorityName: validated.defaultPriorityName ?? null,
          defaultComponentId: validated.defaultComponentId ?? null,
          defaultComponentName: validated.defaultComponentName ?? null,
          assigneeStrategy: validated.assigneeStrategy ?? 'UNASSIGNED',
          defaultAssigneeId: validated.defaultAssigneeId ?? null,
          defaultAssigneeName: validated.defaultAssigneeName ?? null,
          fieldMappings: (validated.fieldMappings as any) ?? null,
          configStatus: 'CONFIGURED',
          staleReason: null,
          metadataSnapshot,
          lastRefreshedAt: new Date(),
        },
      });

      await this.createAuditRecord({
        connectionId: validated.connectionId,
        projectId: validated.projectId,
        eventType: 'CONFIGURATION_SAVED',
        details: {
          jiraProjectId: validated.jiraProjectId,
          jiraProjectKey: validated.jiraProjectKey,
          selectedIssueTypeId: validated.selectedIssueTypeId,
          selectedIssueTypeName: validated.selectedIssueTypeName,
        },
      });

      return this.mapProjectConfigToDto(config);
    } finally {
      releaseLock();
    }
  }

  /**
   * Refreshes project configuration and detects schema staleness.
   */
  public async refreshProjectConfig(
    input: RefreshJiraProjectConfigInputDto,
  ): Promise<JiraProjectConfigDto> {
    const validated = refreshJiraProjectConfigInputSchema.parse(input);
    const releaseLock = this.acquireLock(validated.projectId);

    try {
      const existing = await this.prisma.jiraProjectConfig.findUnique({
        where: { projectId: validated.projectId },
      });
      if (!existing) {
        throw new JiraConfigNotFoundError(validated.projectId);
      }

      const { connection, apiToken } = await this.getDecryptedConnection(
        validated.projectId,
        existing.connectionId,
      );

      let configStatus: JiraProjectConfig['configStatus'] = 'CONFIGURED';
      let staleReason: string | null = null;
      let refreshedSnapshot: Record<string, unknown> = (existing.metadataSnapshot as any) ?? {};

      try {
        // 1. Check if Jira Project still exists
        const projects = await this.jiraClient.discoverProjects({
          baseUrl: connection.baseUrl,
          deploymentType: connection.deploymentType,
          authenticationType: connection.authenticationType,
          accountIdentifier: connection.accountIdentifier,
          apiToken,
          allowLocalhostForTesting: this.allowLocalhostForTesting,
        });

        const proj = projects.find(
          p => p.id === existing.jiraProjectId || p.key === existing.jiraProjectKey,
        );
        if (!proj) {
          configStatus = 'INVALID';
          staleReason = `Target Jira project '${existing.jiraProjectKey}' (${existing.jiraProjectId}) is no longer accessible.`;
        } else {
          // 2. Check if selected Issue Type still exists
          const issueTypes = await this.jiraClient.discoverIssueTypes({
            baseUrl: connection.baseUrl,
            deploymentType: connection.deploymentType,
            authenticationType: connection.authenticationType,
            accountIdentifier: connection.accountIdentifier,
            apiToken,
            projectIdOrKey: existing.jiraProjectId,
            allowLocalhostForTesting: this.allowLocalhostForTesting,
          });

          const matchedIssueType = issueTypes.find(it => it.id === existing.selectedIssueTypeId);
          if (!matchedIssueType) {
            configStatus = 'STALE';
            staleReason = `Selected issue type '${existing.selectedIssueTypeName}' is no longer available in Jira project '${existing.jiraProjectKey}'.`;
          } else {
            // 3. If default component configured, check if component still exists
            if (existing.defaultComponentId) {
              const components = await this.jiraClient.discoverComponents({
                baseUrl: connection.baseUrl,
                deploymentType: connection.deploymentType,
                authenticationType: connection.authenticationType,
                accountIdentifier: connection.accountIdentifier,
                apiToken,
                projectIdOrKey: existing.jiraProjectId,
                allowLocalhostForTesting: this.allowLocalhostForTesting,
              });

              const matchedComp = components.find(c => c.id === existing.defaultComponentId);
              if (!matchedComp) {
                configStatus = 'NEEDS_REVIEW';
                staleReason = `Default component '${existing.defaultComponentName ?? existing.defaultComponentId}' no longer exists in Jira project.`;
              }
            }

            refreshedSnapshot = {
              project: proj,
              issueType: matchedIssueType,
              refreshedAt: new Date().toISOString(),
            };
          }
        }
      } catch (err: any) {
        configStatus = 'INVALID';
        staleReason = `Metadata refresh failed: ${err.message ?? String(err)}`;
      }

      const updated = await this.prisma.jiraProjectConfig.update({
        where: { id: existing.id },
        data: {
          configStatus,
          staleReason,
          metadataSnapshot: refreshedSnapshot as any,
          lastRefreshedAt: new Date(),
        },
      });

      await this.createAuditRecord({
        connectionId: existing.connectionId,
        projectId: validated.projectId,
        eventType: configStatus === 'CONFIGURED' ? 'METADATA_REFRESHED' : 'CONFIGURATION_STALE',
        details: {
          configStatus,
          staleReason,
        },
      });

      return this.mapProjectConfigToDto(updated);
    } finally {
      releaseLock();
    }
  }

  /**
   * Converts a database JiraProjectConfig record to a safe DTO.
   */
  private mapProjectConfigToDto(cfg: JiraProjectConfig): JiraProjectConfigDto {
    return {
      id: cfg.id,
      projectId: cfg.projectId,
      connectionId: cfg.connectionId,
      jiraProjectId: cfg.jiraProjectId,
      jiraProjectKey: cfg.jiraProjectKey,
      jiraProjectName: cfg.jiraProjectName,
      selectedIssueTypeId: cfg.selectedIssueTypeId,
      selectedIssueTypeName: cfg.selectedIssueTypeName,
      defaultPriorityId: cfg.defaultPriorityId,
      defaultPriorityName: cfg.defaultPriorityName,
      defaultComponentId: cfg.defaultComponentId,
      defaultComponentName: cfg.defaultComponentName,
      assigneeStrategy: cfg.assigneeStrategy,
      defaultAssigneeId: cfg.defaultAssigneeId,
      defaultAssigneeName: cfg.defaultAssigneeName,
      fieldMappings: (cfg.fieldMappings as Record<string, unknown>) ?? null,
      configStatus: cfg.configStatus,
      staleReason: cfg.staleReason,
      metadataSnapshot: (cfg.metadataSnapshot as Record<string, unknown>) ?? null,
      lastRefreshedAt: cfg.lastRefreshedAt ? cfg.lastRefreshedAt.toISOString() : null,
      createdBy: cfg.createdBy,
      createdAt: cfg.createdAt.toISOString(),
      updatedAt: cfg.updatedAt.toISOString(),
    };
  }

  /**
   * Converts a database JiraConnection record to a safe, unprivileged DTO.
   * NEVER returns the decrypted API token or raw encrypted payload.
   */
  private mapToDto(conn: JiraConnection): JiraConnectionDto {
    return {
      id: conn.id,
      projectId: conn.projectId,
      displayName: conn.displayName,
      deploymentType: conn.deploymentType,
      baseUrl: conn.baseUrl,
      authenticationType: conn.authenticationType,
      accountIdentifier: conn.accountIdentifier,
      credentialConfigured: Boolean(
        conn.encryptedCredentials && conn.encryptedCredentials.length > 0,
      ),
      connectionStatus: conn.connectionStatus,
      lastValidatedAt: conn.lastValidatedAt ? conn.lastValidatedAt.toISOString() : null,
      lastValidationResult: (conn.lastValidationResult as any) ?? null,
      createdBy: conn.createdBy,
      createdAt: conn.createdAt.toISOString(),
      updatedAt: conn.updatedAt.toISOString(),
    };
  }
}
