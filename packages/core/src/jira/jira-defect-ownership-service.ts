/**
 * @file packages/core/src/jira/jira-defect-ownership-service.ts
 * Core domain service for Engineer Assignment & Defect Ownership Workflow (V7 Phase 94).
 * Enforces deterministic ownership management, multi-tenant isolation, optimistic version locking,
 * bi-directional Jira assignee synchronization, audit trailing, and truthful partial failure semantics.
 */

import type {
  PrismaClient,
  ProjectEngineer,
  DefectOwnership,
  DefectOwnershipHistory,
  JiraIssueLink,
} from '@prisma/client';
import {
  type IJiraDefectOwnershipService,
  type IJiraClient,
  type IJiraCredentialVault,
  type RegisterProjectEngineerInputDto,
  type ListEligibleEngineersInputDto,
  type GetDefectOwnershipInputDto,
  type AssignEngineerInputDto,
  type UnassignEngineerInputDto,
  type SyncOwnershipFromJiraInputDto,
  type RetryJiraSyncInputDto,
  type ProjectEngineerDto,
  type DefectOwnershipDto,
  type DefectOwnershipHistoryDto,
  registerProjectEngineerInputSchema,
  listEligibleEngineersInputSchema,
  getDefectOwnershipInputSchema,
  assignEngineerInputSchema,
  unassignEngineerInputSchema,
  syncOwnershipFromJiraInputSchema,
  retryJiraSyncInputSchema,
} from './jira-types.js';
import { JiraClient } from './jira-client.js';
import { JiraCredentialVault } from './jira-credential-vault.js';
import {
  JiraBugReportNotFoundError,
  JiraCrossProjectError,
  JiraEngineerIneligibleError,
  JiraEngineerNotFoundError,
  JiraStaleOwnershipVersionError,
  JiraOwnershipNotFoundError,
  JiraLinkNotFoundError,
} from './jira-errors.js';
import { ProjectNotFoundError } from '../projects/project-errors.js';

export class JiraDefectOwnershipService implements IJiraDefectOwnershipService {
  private readonly prisma: PrismaClient;
  private readonly jiraClient: IJiraClient;
  private readonly vault: IJiraCredentialVault;
  private readonly allowLocalhostForTesting: boolean;
  private readonly ownershipLocks: Map<string, Promise<void>> = new Map();

  constructor(options: {
    readonly prisma: PrismaClient;
    readonly jiraClient?: IJiraClient;
    readonly vault?: IJiraCredentialVault;
    readonly allowLocalhostForTesting?: boolean;
  }) {
    this.prisma = options.prisma;
    this.jiraClient = options.jiraClient ?? new JiraClient();
    this.vault = options.vault ?? new JiraCredentialVault();
    this.allowLocalhostForTesting = Boolean(options.allowLocalhostForTesting);
  }

  /**
   * Acquires a serialized in-memory lock for a specific defect ownership key.
   */
  private async acquireLock(lockKey: string): Promise<() => void> {
    while (this.ownershipLocks.has(lockKey)) {
      await this.ownershipLocks.get(lockKey);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>(resolve => {
      resolveLock = resolve;
    });
    this.ownershipLocks.set(lockKey, lockPromise);

    return () => {
      this.ownershipLocks.delete(lockKey);
      resolveLock();
    };
  }

  /**
   * Maps a ProjectEngineer Prisma model to its contract DTO.
   */
  private mapEngineerDto(eng: ProjectEngineer): ProjectEngineerDto {
    return {
      id: eng.id,
      projectId: eng.projectId,
      userId: eng.userId,
      displayName: eng.displayName,
      email: eng.email,
      jiraAccountId: eng.jiraAccountId,
      jiraUsername: eng.jiraUsername,
      isActive: eng.isActive,
      routingTags: Array.isArray(eng.routingTags) ? (eng.routingTags as string[]) : [],
      createdAt: eng.createdAt.toISOString(),
      updatedAt: eng.updatedAt.toISOString(),
    };
  }

  /**
   * Maps a DefectOwnership Prisma model to its contract DTO.
   */
  private mapOwnershipDto(
    ownership: DefectOwnership & {
      assignedEngineer?: ProjectEngineer | null;
      jiraIssueLink?: JiraIssueLink | null;
      history?: DefectOwnershipHistory[];
    },
    jiraIssueKeyOverride?: string | null,
  ): DefectOwnershipDto {
    const historyDtos: DefectOwnershipHistoryDto[] | undefined = ownership.history?.map(h => ({
      id: h.id,
      ownershipId: h.ownershipId,
      projectId: h.projectId,
      bugReportId: h.bugReportId,
      action: h.action,
      previousEngineerId: h.previousEngineerId,
      newEngineerId: h.newEngineerId,
      assignmentSource: h.assignmentSource,
      assignmentReason: h.assignmentReason,
      ruleId: h.ruleId,
      jiraAssigneeSyncStatus: h.jiraAssigneeSyncStatus,
      syncErrorMessage: h.syncErrorMessage,
      ownershipVersion: h.ownershipVersion,
      actorUserId: h.actorUserId,
      createdAt: h.createdAt.toISOString(),
    }));

    return {
      id: ownership.id,
      projectId: ownership.projectId,
      failureCaseId: ownership.failureCaseId,
      bugReportId: ownership.bugReportId,
      jiraIssueLinkId: ownership.jiraIssueLinkId,
      assignedEngineerId: ownership.assignedEngineerId,
      assignmentSource: ownership.assignmentSource,
      assignmentReason: ownership.assignmentReason,
      ruleId: ownership.ruleId,
      jiraAssigneeSyncStatus: ownership.jiraAssigneeSyncStatus,
      lastJiraSyncError: ownership.lastJiraSyncError,
      lastJiraSyncAt: ownership.lastJiraSyncAt ? ownership.lastJiraSyncAt.toISOString() : null,
      ownershipVersion: ownership.ownershipVersion,
      assignedByUserId: ownership.assignedByUserId,
      assignedAt: ownership.assignedAt ? ownership.assignedAt.toISOString() : null,
      assignedEngineer: ownership.assignedEngineer
        ? this.mapEngineerDto(ownership.assignedEngineer)
        : null,
      jiraIssueKey: jiraIssueKeyOverride ?? ownership.jiraIssueLink?.jiraIssueKey ?? null,
      createdAt: ownership.createdAt.toISOString(),
      updatedAt: ownership.updatedAt.toISOString(),
      history: historyDtos,
    };
  }

  /**
   * Resolves an active Jira issue link or external issue record for the given bug report.
   */
  private async findActiveJiraLink(
    projectId: string,
    bugReportId: string,
    failureCaseId: string,
  ): Promise<{ linkId: string | null; jiraIssueKey: string; connectionId: string } | null> {
    const directLink = await this.prisma.jiraIssueLink.findFirst({
      where: {
        projectId,
        isActive: true,
        OR: [{ bugReportId }, { failureCaseId }],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (directLink) {
      return {
        linkId: directLink.id,
        jiraIssueKey: directLink.jiraIssueKey,
        connectionId: directLink.jiraConnectionId,
      };
    }

    const externalIssue = await this.prisma.jiraExternalIssue.findFirst({
      where: {
        projectId,
        OR: [{ bugReportId }, { failureCaseId }],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (externalIssue) {
      return {
        linkId: null,
        jiraIssueKey: externalIssue.jiraIssueKey,
        connectionId: externalIssue.connectionId,
      };
    }

    return null;
  }

  /**
   * Synchronizes assignee changes directly to the remote Jira API.
   */
  private async syncAssigneeToJira(options: {
    readonly projectId: string;
    readonly jiraIssueKey: string;
    readonly connectionId: string;
    readonly accountId?: string | null;
    readonly username?: string | null;
  }): Promise<{ readonly success: boolean; readonly errorMessage?: string }> {
    try {
      const connection = await this.prisma.jiraConnection.findUnique({
        where: { id: options.connectionId },
      });
      if (!connection || !connection.encryptedCredentials) {
        return { success: false, errorMessage: 'Jira connection or credentials not found.' };
      }

      const plainToken = await this.vault.decrypt(connection.encryptedCredentials, connection.id);

      if (this.jiraClient.assignIssue) {
        await this.jiraClient.assignIssue({
          baseUrl: connection.baseUrl,
          deploymentType: connection.deploymentType,
          authenticationType: connection.authenticationType,
          accountIdentifier: connection.accountIdentifier,
          apiToken: plainToken,
          issueIdOrKey: options.jiraIssueKey,
          accountId: options.accountId,
          username: options.username,
          allowLocalhostForTesting: this.allowLocalhostForTesting,
        });
      }

      return { success: true };
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      return { success: false, errorMessage: rawMsg };
    }
  }

  /**
   * Registers or updates an engineer's identity and Jira account mapping within a project.
   */
  public async registerProjectEngineer(
    rawInput: RegisterProjectEngineerInputDto,
  ): Promise<ProjectEngineerDto> {
    const input = registerProjectEngineerInputSchema.parse(rawInput);

    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
    });
    if (!project) {
      throw new ProjectNotFoundError(input.projectId);
    }

    const engineer = await this.prisma.projectEngineer.upsert({
      where: {
        projectId_userId: {
          projectId: input.projectId,
          userId: input.userId,
        },
      },
      create: {
        projectId: input.projectId,
        userId: input.userId,
        displayName: input.displayName,
        email: input.email,
        jiraAccountId: input.jiraAccountId ?? null,
        jiraUsername: input.jiraUsername ?? null,
        routingTags: input.routingTags ?? [],
        isActive: input.isActive ?? true,
      },
      update: {
        displayName: input.displayName,
        email: input.email,
        jiraAccountId: input.jiraAccountId !== undefined ? input.jiraAccountId : undefined,
        jiraUsername: input.jiraUsername !== undefined ? input.jiraUsername : undefined,
        routingTags: input.routingTags !== undefined ? input.routingTags : undefined,
        isActive: input.isActive !== undefined ? input.isActive : undefined,
      },
    });

    return this.mapEngineerDto(engineer);
  }

  /**
   * Lists all eligible engineers registered for a project.
   */
  public async listEligibleEngineers(
    rawInput: ListEligibleEngineersInputDto,
  ): Promise<readonly ProjectEngineerDto[]> {
    const input = listEligibleEngineersInputSchema.parse(rawInput);

    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
    });
    if (!project) {
      throw new ProjectNotFoundError(input.projectId);
    }

    const engineers = await this.prisma.projectEngineer.findMany({
      where: {
        projectId: input.projectId,
        ...(input.activeOnly ? { isActive: true } : {}),
      },
      orderBy: { displayName: 'asc' },
    });

    return engineers.map(e => this.mapEngineerDto(e));
  }

  /**
   * Retrieves the authoritative ownership record and history for a bug report.
   */
  public async getDefectOwnership(
    rawInput: GetDefectOwnershipInputDto,
  ): Promise<DefectOwnershipDto | null> {
    const input = getDefectOwnershipInputSchema.parse(rawInput);

    const ownership = await this.prisma.defectOwnership.findUnique({
      where: { bugReportId: input.bugReportId },
      include: {
        assignedEngineer: true,
        jiraIssueLink: true,
        history: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!ownership) {
      return null;
    }

    if (ownership.projectId !== input.projectId) {
      throw new JiraCrossProjectError(ownership.bugReportId, input.projectId);
    }

    // Resolve Jira issue key if not directly on link
    let jiraIssueKey = ownership.jiraIssueLink?.jiraIssueKey ?? null;
    if (!jiraIssueKey) {
      const activeLink = await this.findActiveJiraLink(
        input.projectId,
        input.bugReportId,
        ownership.failureCaseId,
      );
      jiraIssueKey = activeLink?.jiraIssueKey ?? null;
    }

    return this.mapOwnershipDto(ownership, jiraIssueKey);
  }

  /**
   * Assigns or reassigns defect ownership to an eligible project engineer with Jira synchronization.
   */
  public async assignEngineer(rawInput: AssignEngineerInputDto): Promise<DefectOwnershipDto> {
    const input = assignEngineerInputSchema.parse(rawInput);
    const lockKey = `${input.projectId}:${input.bugReportId}`;
    const releaseLock = await this.acquireLock(lockKey);

    try {
      const project = await this.prisma.project.findUnique({
        where: { id: input.projectId },
      });
      if (!project) {
        throw new ProjectNotFoundError(input.projectId);
      }

      const bugReport = await this.prisma.structuredBugReport.findFirst({
        where: { id: input.bugReportId, projectId: input.projectId },
      });
      if (!bugReport) {
        throw new JiraBugReportNotFoundError(input.bugReportId);
      }

      const engineer = await this.prisma.projectEngineer.findFirst({
        where: { id: input.engineerId, projectId: input.projectId },
      });
      if (!engineer) {
        throw new JiraEngineerNotFoundError(input.engineerId);
      }
      if (!engineer.isActive) {
        throw new JiraEngineerIneligibleError('Engineer is marked inactive.');
      }

      const existingOwnership = await this.prisma.defectOwnership.findUnique({
        where: { bugReportId: input.bugReportId },
        include: { assignedEngineer: true, jiraIssueLink: true },
      });

      if (
        input.expectedVersion !== undefined &&
        existingOwnership &&
        existingOwnership.ownershipVersion !== input.expectedVersion
      ) {
        throw new JiraStaleOwnershipVersionError(
          input.expectedVersion,
          existingOwnership.ownershipVersion,
        );
      }

      const prevEngineerId = existingOwnership?.assignedEngineerId ?? null;
      const isReassignment = prevEngineerId !== null && prevEngineerId !== engineer.id;
      const action = isReassignment ? 'REASSIGNED' : 'ASSIGNED';
      const newVersion = existingOwnership ? existingOwnership.ownershipVersion + 1 : 1;

      // Resolve Jira issue linkage
      const jiraLink = await this.findActiveJiraLink(
        input.projectId,
        input.bugReportId,
        bugReport.failureCaseId,
      );

      let jiraSyncStatus: 'NOT_APPLICABLE' | 'SYNCHRONIZED' | 'JIRA_SYNC_FAILED' = 'NOT_APPLICABLE';
      let jiraSyncError: string | null = null;
      const syncTimestamp = new Date();

      if (jiraLink) {
        if (!engineer.jiraAccountId && !engineer.jiraUsername) {
          jiraSyncStatus = 'JIRA_SYNC_FAILED';
          jiraSyncError = `Engineer '${engineer.displayName}' does not have a linked Jira account ID or username.`;
        } else {
          const syncResult = await this.syncAssigneeToJira({
            projectId: input.projectId,
            jiraIssueKey: jiraLink.jiraIssueKey,
            connectionId: jiraLink.connectionId,
            accountId: engineer.jiraAccountId,
            username: engineer.jiraUsername,
          });

          if (syncResult.success) {
            jiraSyncStatus = 'SYNCHRONIZED';
            jiraSyncError = null;
          } else {
            jiraSyncStatus = 'JIRA_SYNC_FAILED';
            jiraSyncError = syncResult.errorMessage ?? 'Failed to update assignee in Jira.';
          }
        }
      }

      const resolvedLinkId = jiraLink?.linkId ?? existingOwnership?.jiraIssueLinkId ?? null;

      // Atomic persistence of ownership state and audit trail
      const savedOwnership = await this.prisma.$transaction(async tx => {
        const ownership = await tx.defectOwnership.upsert({
          where: { bugReportId: input.bugReportId },
          create: {
            projectId: input.projectId,
            failureCaseId: bugReport.failureCaseId,
            bugReportId: input.bugReportId,
            jiraIssueLinkId: resolvedLinkId,
            assignedEngineerId: engineer.id,
            assignmentSource: 'MANUAL',
            assignmentReason: input.assignmentReason ?? null,
            jiraAssigneeSyncStatus: jiraSyncStatus,
            lastJiraSyncError: jiraSyncError,
            lastJiraSyncAt: jiraLink ? syncTimestamp : null,
            ownershipVersion: newVersion,
            assignedByUserId: input.actorUserId ?? null,
            assignedAt: syncTimestamp,
          },
          update: {
            assignedEngineerId: engineer.id,
            assignmentSource: 'MANUAL',
            assignmentReason: input.assignmentReason ?? null,
            jiraAssigneeSyncStatus: jiraSyncStatus,
            lastJiraSyncError: jiraSyncError,
            lastJiraSyncAt: jiraLink ? syncTimestamp : undefined,
            ownershipVersion: newVersion,
            assignedByUserId: input.actorUserId ?? null,
            assignedAt: syncTimestamp,
            jiraIssueLinkId: resolvedLinkId,
          },
          include: {
            assignedEngineer: true,
            jiraIssueLink: true,
            history: { orderBy: { createdAt: 'desc' } },
          },
        });

        await tx.defectOwnershipHistory.create({
          data: {
            ownershipId: ownership.id,
            projectId: input.projectId,
            bugReportId: input.bugReportId,
            action,
            previousEngineerId: prevEngineerId,
            newEngineerId: engineer.id,
            assignmentSource: 'MANUAL',
            assignmentReason: input.assignmentReason ?? null,
            jiraAssigneeSyncStatus: jiraSyncStatus,
            syncErrorMessage: jiraSyncError,
            ownershipVersion: newVersion,
            actorUserId: input.actorUserId ?? null,
          },
        });

        if (jiraLink) {
          await tx.jiraConnectionAudit.create({
            data: {
              connectionId: jiraLink.connectionId,
              projectId: input.projectId,
              eventType: action === 'ASSIGNED' ? 'DEFECT_ASSIGNED' : 'DEFECT_REASSIGNED',
              actor: input.actorUserId ?? 'USER',
              details: {
                bugReportId: input.bugReportId,
                engineerId: engineer.id,
                engineerName: engineer.displayName,
                jiraIssueKey: jiraLink.jiraIssueKey,
                action,
              },
            },
          });

          if (jiraSyncStatus === 'SYNCHRONIZED') {
            await tx.jiraConnectionAudit.create({
              data: {
                connectionId: jiraLink.connectionId,
                projectId: input.projectId,
                eventType: 'JIRA_ASSIGNEE_SYNCED',
                actor: 'SYSTEM',
                details: {
                  bugReportId: input.bugReportId,
                  engineerId: engineer.id,
                  jiraIssueKey: jiraLink.jiraIssueKey,
                },
              },
            });
          } else if (jiraSyncStatus === 'JIRA_SYNC_FAILED') {
            await tx.jiraConnectionAudit.create({
              data: {
                connectionId: jiraLink.connectionId,
                projectId: input.projectId,
                eventType: 'JIRA_ASSIGNEE_SYNC_FAILED',
                actor: 'SYSTEM',
                details: {
                  bugReportId: input.bugReportId,
                  engineerId: engineer.id,
                  jiraIssueKey: jiraLink.jiraIssueKey,
                  error: jiraSyncError,
                },
              },
            });
          }
        }

        return ownership;
      });

      // Refetch history to ensure caller gets full lineage
      const fullHistory = await this.prisma.defectOwnershipHistory.findMany({
        where: { ownershipId: savedOwnership.id },
        orderBy: { createdAt: 'desc' },
      });

      return this.mapOwnershipDto(
        {
          ...savedOwnership,
          history: fullHistory,
        },
        jiraLink?.jiraIssueKey ?? null,
      );
    } finally {
      releaseLock();
    }
  }

  /**
   * Unassigns an engineer from defect ownership and updates remote Jira issue to unassigned.
   */
  public async unassignEngineer(rawInput: UnassignEngineerInputDto): Promise<DefectOwnershipDto> {
    const input = unassignEngineerInputSchema.parse(rawInput);
    const lockKey = `${input.projectId}:${input.bugReportId}`;
    const releaseLock = await this.acquireLock(lockKey);

    try {
      const project = await this.prisma.project.findUnique({
        where: { id: input.projectId },
      });
      if (!project) {
        throw new ProjectNotFoundError(input.projectId);
      }

      const existingOwnership = await this.prisma.defectOwnership.findUnique({
        where: { bugReportId: input.bugReportId },
        include: { assignedEngineer: true, jiraIssueLink: true },
      });

      if (!existingOwnership) {
        throw new JiraOwnershipNotFoundError(input.bugReportId);
      }

      if (existingOwnership.projectId !== input.projectId) {
        throw new JiraCrossProjectError(input.bugReportId, input.projectId);
      }

      if (
        input.expectedVersion !== undefined &&
        existingOwnership.ownershipVersion !== input.expectedVersion
      ) {
        throw new JiraStaleOwnershipVersionError(
          input.expectedVersion,
          existingOwnership.ownershipVersion,
        );
      }

      const prevEngineerId = existingOwnership.assignedEngineerId;
      const newVersion = existingOwnership.ownershipVersion + 1;
      const syncTimestamp = new Date();

      const jiraLink = await this.findActiveJiraLink(
        input.projectId,
        input.bugReportId,
        existingOwnership.failureCaseId,
      );

      let jiraSyncStatus: 'NOT_APPLICABLE' | 'SYNCHRONIZED' | 'JIRA_SYNC_FAILED' = 'NOT_APPLICABLE';
      let jiraSyncError: string | null = null;

      if (jiraLink) {
        const syncResult = await this.syncAssigneeToJira({
          projectId: input.projectId,
          jiraIssueKey: jiraLink.jiraIssueKey,
          connectionId: jiraLink.connectionId,
          accountId: null,
          username: null,
        });

        if (syncResult.success) {
          jiraSyncStatus = 'SYNCHRONIZED';
          jiraSyncError = null;
        } else {
          jiraSyncStatus = 'JIRA_SYNC_FAILED';
          jiraSyncError = syncResult.errorMessage ?? 'Failed to unassign issue in Jira.';
        }
      }

      const updatedOwnership = await this.prisma.$transaction(async tx => {
        const updated = await tx.defectOwnership.update({
          where: { bugReportId: input.bugReportId },
          data: {
            assignedEngineerId: null,
            assignmentSource: 'MANUAL',
            assignmentReason: input.reason ?? null,
            jiraAssigneeSyncStatus: jiraSyncStatus,
            lastJiraSyncError: jiraSyncError,
            lastJiraSyncAt: jiraLink ? syncTimestamp : undefined,
            ownershipVersion: newVersion,
            assignedByUserId: input.actorUserId ?? null,
            assignedAt: syncTimestamp,
          },
          include: {
            assignedEngineer: true,
            jiraIssueLink: true,
          },
        });

        await tx.defectOwnershipHistory.create({
          data: {
            ownershipId: updated.id,
            projectId: input.projectId,
            bugReportId: input.bugReportId,
            action: 'UNASSIGNED',
            previousEngineerId: prevEngineerId,
            newEngineerId: null,
            assignmentSource: 'MANUAL',
            assignmentReason: input.reason ?? null,
            jiraAssigneeSyncStatus: jiraSyncStatus,
            syncErrorMessage: jiraSyncError,
            ownershipVersion: newVersion,
            actorUserId: input.actorUserId ?? null,
          },
        });

        if (jiraLink) {
          await tx.jiraConnectionAudit.create({
            data: {
              connectionId: jiraLink.connectionId,
              projectId: input.projectId,
              eventType: 'DEFECT_UNASSIGNED',
              actor: input.actorUserId ?? 'USER',
              details: {
                bugReportId: input.bugReportId,
                previousEngineerId: prevEngineerId,
                jiraIssueKey: jiraLink.jiraIssueKey,
              },
            },
          });
        }

        return updated;
      });

      const fullHistory = await this.prisma.defectOwnershipHistory.findMany({
        where: { ownershipId: updatedOwnership.id },
        orderBy: { createdAt: 'desc' },
      });

      return this.mapOwnershipDto(
        {
          ...updatedOwnership,
          history: fullHistory,
        },
        jiraLink?.jiraIssueKey ?? null,
      );
    } finally {
      releaseLock();
    }
  }

  /**
   * Synchronizes ownership from the remote Jira issue's current assignee.
   */
  public async syncOwnershipFromJira(
    rawInput: SyncOwnershipFromJiraInputDto,
  ): Promise<DefectOwnershipDto> {
    const input = syncOwnershipFromJiraInputSchema.parse(rawInput);
    const lockKey = `${input.projectId}:${input.bugReportId}`;
    const releaseLock = await this.acquireLock(lockKey);

    try {
      const bugReport = await this.prisma.structuredBugReport.findFirst({
        where: { id: input.bugReportId, projectId: input.projectId },
      });
      if (!bugReport) {
        throw new JiraBugReportNotFoundError(input.bugReportId);
      }

      const jiraLink = await this.findActiveJiraLink(
        input.projectId,
        input.bugReportId,
        bugReport.failureCaseId,
      );
      if (!jiraLink) {
        throw new JiraLinkNotFoundError(input.bugReportId);
      }

      const connection = await this.prisma.jiraConnection.findUnique({
        where: { id: jiraLink.connectionId },
      });
      if (!connection || !connection.encryptedCredentials) {
        throw new JiraOwnershipNotFoundError(
          `Jira connection or credentials for ${jiraLink.connectionId} not found`,
        );
      }

      const plainToken = await this.vault.decrypt(connection.encryptedCredentials, connection.id);

      // Fetch remote issue details from Jira
      const remoteIssue = await this.jiraClient.getIssue({
        baseUrl: connection.baseUrl,
        deploymentType: connection.deploymentType,
        authenticationType: connection.authenticationType,
        accountIdentifier: connection.accountIdentifier,
        apiToken: plainToken,
        issueIdOrKey: jiraLink.jiraIssueKey,
        allowLocalhostForTesting: this.allowLocalhostForTesting,
      });

      const remoteAssignee = remoteIssue.fields?.assignee as
        Record<string, unknown> | null | undefined;
      const existingOwnership = await this.prisma.defectOwnership.findUnique({
        where: { bugReportId: input.bugReportId },
        include: { assignedEngineer: true },
      });

      const newVersion = existingOwnership ? existingOwnership.ownershipVersion + 1 : 1;
      const syncTimestamp = new Date();

      if (!remoteAssignee) {
        // Remote issue is unassigned in Jira
        const updatedOwnership = await this.prisma.$transaction(async tx => {
          const updated = await tx.defectOwnership.upsert({
            where: { bugReportId: input.bugReportId },
            create: {
              projectId: input.projectId,
              failureCaseId: bugReport.failureCaseId,
              bugReportId: input.bugReportId,
              jiraIssueLinkId: jiraLink.linkId,
              assignedEngineerId: null,
              assignmentSource: 'JIRA_SYNCHRONIZED',
              assignmentReason: 'Synchronized unassigned state from Jira.',
              jiraAssigneeSyncStatus: 'SYNCHRONIZED',
              lastJiraSyncError: null,
              lastJiraSyncAt: syncTimestamp,
              ownershipVersion: newVersion,
              assignedByUserId: input.actorUserId ?? 'JIRA_SYNC',
              assignedAt: syncTimestamp,
            },
            update: {
              assignedEngineerId: null,
              assignmentSource: 'JIRA_SYNCHRONIZED',
              assignmentReason: 'Synchronized unassigned state from Jira.',
              jiraAssigneeSyncStatus: 'SYNCHRONIZED',
              lastJiraSyncError: null,
              lastJiraSyncAt: syncTimestamp,
              ownershipVersion: newVersion,
              assignedByUserId: input.actorUserId ?? 'JIRA_SYNC',
              assignedAt: syncTimestamp,
            },
            include: { assignedEngineer: true, jiraIssueLink: true },
          });

          await tx.defectOwnershipHistory.create({
            data: {
              ownershipId: updated.id,
              projectId: input.projectId,
              bugReportId: input.bugReportId,
              action: 'UNASSIGNED',
              previousEngineerId: existingOwnership?.assignedEngineerId ?? null,
              newEngineerId: null,
              assignmentSource: 'JIRA_SYNCHRONIZED',
              assignmentReason: 'Synchronized unassigned state from Jira.',
              jiraAssigneeSyncStatus: 'SYNCHRONIZED',
              ownershipVersion: newVersion,
              actorUserId: input.actorUserId ?? 'JIRA_SYNC',
            },
          });

          return updated;
        });

        const fullHistory = await this.prisma.defectOwnershipHistory.findMany({
          where: { ownershipId: updatedOwnership.id },
          orderBy: { createdAt: 'desc' },
        });

        return this.mapOwnershipDto(
          { ...updatedOwnership, history: fullHistory },
          jiraLink.jiraIssueKey,
        );
      }

      // Remote assignee exists: match against registered project engineers
      const remoteAccountId =
        typeof remoteAssignee.accountId === 'string' ? remoteAssignee.accountId : undefined;
      const remoteName = typeof remoteAssignee.name === 'string' ? remoteAssignee.name : undefined;
      const remoteEmail =
        typeof remoteAssignee.emailAddress === 'string' ? remoteAssignee.emailAddress : undefined;

      const matchedEngineer = await this.prisma.projectEngineer.findFirst({
        where: {
          projectId: input.projectId,
          OR: [
            ...(remoteAccountId ? [{ jiraAccountId: remoteAccountId }] : []),
            ...(remoteName ? [{ jiraUsername: remoteName }] : []),
            ...(remoteEmail ? [{ email: remoteEmail }] : []),
          ],
        },
      });

      if (!matchedEngineer) {
        // Conflict: Remote assignee is not registered in this project
        const conflictError = `Remote Jira assignee (${remoteAssignee.displayName ?? remoteAccountId ?? remoteName}) does not match any registered engineer in project ${input.projectId}.`;

        const updatedOwnership = await this.prisma.$transaction(async tx => {
          const updated = await tx.defectOwnership.upsert({
            where: { bugReportId: input.bugReportId },
            create: {
              projectId: input.projectId,
              failureCaseId: bugReport.failureCaseId,
              bugReportId: input.bugReportId,
              jiraIssueLinkId: jiraLink.linkId,
              assignedEngineerId: existingOwnership?.assignedEngineerId ?? null,
              assignmentSource: 'JIRA_SYNCHRONIZED',
              assignmentReason: conflictError,
              jiraAssigneeSyncStatus: 'CONFLICT_DETECTED',
              lastJiraSyncError: conflictError,
              lastJiraSyncAt: syncTimestamp,
              ownershipVersion: newVersion,
              assignedByUserId: input.actorUserId ?? 'JIRA_SYNC',
              assignedAt: syncTimestamp,
            },
            update: {
              jiraAssigneeSyncStatus: 'CONFLICT_DETECTED',
              lastJiraSyncError: conflictError,
              lastJiraSyncAt: syncTimestamp,
              ownershipVersion: newVersion,
            },
            include: { assignedEngineer: true, jiraIssueLink: true },
          });

          await tx.jiraConnectionAudit.create({
            data: {
              connectionId: jiraLink.connectionId,
              projectId: input.projectId,
              eventType: 'OWNERSHIP_CONFLICT_DETECTED',
              actor: 'SYSTEM',
              details: {
                bugReportId: input.bugReportId,
                jiraIssueKey: jiraLink.jiraIssueKey,
                remoteAssignee: remoteAssignee.displayName ?? remoteAccountId ?? remoteName,
                conflict: conflictError,
              },
            },
          });

          return updated;
        });

        const fullHistory = await this.prisma.defectOwnershipHistory.findMany({
          where: { ownershipId: updatedOwnership.id },
          orderBy: { createdAt: 'desc' },
        });

        return this.mapOwnershipDto(
          { ...updatedOwnership, history: fullHistory },
          jiraLink.jiraIssueKey,
        );
      }

      // Matched registered engineer: update ownership to this engineer
      const updatedOwnership = await this.prisma.$transaction(async tx => {
        const updated = await tx.defectOwnership.upsert({
          where: { bugReportId: input.bugReportId },
          create: {
            projectId: input.projectId,
            failureCaseId: bugReport.failureCaseId,
            bugReportId: input.bugReportId,
            jiraIssueLinkId: jiraLink.linkId,
            assignedEngineerId: matchedEngineer.id,
            assignmentSource: 'JIRA_SYNCHRONIZED',
            assignmentReason: `Synchronized assignee from Jira (${remoteAssignee.displayName ?? matchedEngineer.displayName}).`,
            jiraAssigneeSyncStatus: 'SYNCHRONIZED',
            lastJiraSyncError: null,
            lastJiraSyncAt: syncTimestamp,
            ownershipVersion: newVersion,
            assignedByUserId: input.actorUserId ?? 'JIRA_SYNC',
            assignedAt: syncTimestamp,
          },
          update: {
            assignedEngineerId: matchedEngineer.id,
            assignmentSource: 'JIRA_SYNCHRONIZED',
            assignmentReason: `Synchronized assignee from Jira (${remoteAssignee.displayName ?? matchedEngineer.displayName}).`,
            jiraAssigneeSyncStatus: 'SYNCHRONIZED',
            lastJiraSyncError: null,
            lastJiraSyncAt: syncTimestamp,
            ownershipVersion: newVersion,
            assignedByUserId: input.actorUserId ?? 'JIRA_SYNC',
            assignedAt: syncTimestamp,
          },
          include: { assignedEngineer: true, jiraIssueLink: true },
        });

        await tx.defectOwnershipHistory.create({
          data: {
            ownershipId: updated.id,
            projectId: input.projectId,
            bugReportId: input.bugReportId,
            action: 'JIRA_SYNC_UPDATED',
            previousEngineerId: existingOwnership?.assignedEngineerId ?? null,
            newEngineerId: matchedEngineer.id,
            assignmentSource: 'JIRA_SYNCHRONIZED',
            assignmentReason: `Synchronized assignee from Jira.`,
            jiraAssigneeSyncStatus: 'SYNCHRONIZED',
            ownershipVersion: newVersion,
            actorUserId: input.actorUserId ?? 'JIRA_SYNC',
          },
        });

        return updated;
      });

      const fullHistory = await this.prisma.defectOwnershipHistory.findMany({
        where: { ownershipId: updatedOwnership.id },
        orderBy: { createdAt: 'desc' },
      });

      return this.mapOwnershipDto(
        { ...updatedOwnership, history: fullHistory },
        jiraLink.jiraIssueKey,
      );
    } finally {
      releaseLock();
    }
  }

  /**
   * Retries synchronization of current local ownership state to Jira.
   */
  public async retryJiraSync(rawInput: RetryJiraSyncInputDto): Promise<DefectOwnershipDto> {
    const input = retryJiraSyncInputSchema.parse(rawInput);
    const lockKey = `${input.projectId}:${input.bugReportId}`;
    const releaseLock = await this.acquireLock(lockKey);

    try {
      const existingOwnership = await this.prisma.defectOwnership.findUnique({
        where: { bugReportId: input.bugReportId },
        include: { assignedEngineer: true, jiraIssueLink: true },
      });

      if (!existingOwnership) {
        throw new JiraOwnershipNotFoundError(input.bugReportId);
      }

      if (existingOwnership.projectId !== input.projectId) {
        throw new JiraCrossProjectError(input.bugReportId, input.projectId);
      }

      const jiraLink = await this.findActiveJiraLink(
        input.projectId,
        input.bugReportId,
        existingOwnership.failureCaseId,
      );

      if (!jiraLink) {
        return this.mapOwnershipDto(existingOwnership);
      }

      const syncTimestamp = new Date();
      let jiraSyncStatus: 'SYNCHRONIZED' | 'JIRA_SYNC_FAILED' = 'SYNCHRONIZED';
      let jiraSyncError: string | null = null;

      if (existingOwnership.assignedEngineerId) {
        const engineer = existingOwnership.assignedEngineer;
        if (!engineer || (!engineer.jiraAccountId && !engineer.jiraUsername)) {
          jiraSyncStatus = 'JIRA_SYNC_FAILED';
          jiraSyncError = `Engineer does not have a linked Jira account ID or username.`;
        } else {
          const syncResult = await this.syncAssigneeToJira({
            projectId: input.projectId,
            jiraIssueKey: jiraLink.jiraIssueKey,
            connectionId: jiraLink.connectionId,
            accountId: engineer.jiraAccountId,
            username: engineer.jiraUsername,
          });

          if (syncResult.success) {
            jiraSyncStatus = 'SYNCHRONIZED';
            jiraSyncError = null;
          } else {
            jiraSyncStatus = 'JIRA_SYNC_FAILED';
            jiraSyncError = syncResult.errorMessage ?? 'Failed to update assignee in Jira.';
          }
        }
      } else {
        const syncResult = await this.syncAssigneeToJira({
          projectId: input.projectId,
          jiraIssueKey: jiraLink.jiraIssueKey,
          connectionId: jiraLink.connectionId,
          accountId: null,
          username: null,
        });

        if (syncResult.success) {
          jiraSyncStatus = 'SYNCHRONIZED';
          jiraSyncError = null;
        } else {
          jiraSyncStatus = 'JIRA_SYNC_FAILED';
          jiraSyncError = syncResult.errorMessage ?? 'Failed to unassign in Jira.';
        }
      }

      const newVersion = existingOwnership.ownershipVersion + 1;

      const updatedOwnership = await this.prisma.$transaction(async tx => {
        const updated = await tx.defectOwnership.update({
          where: { bugReportId: input.bugReportId },
          data: {
            jiraAssigneeSyncStatus: jiraSyncStatus,
            lastJiraSyncError: jiraSyncError,
            lastJiraSyncAt: syncTimestamp,
            ownershipVersion: newVersion,
          },
          include: { assignedEngineer: true, jiraIssueLink: true },
        });

        await tx.defectOwnershipHistory.create({
          data: {
            ownershipId: updated.id,
            projectId: input.projectId,
            bugReportId: input.bugReportId,
            action: jiraSyncStatus === 'SYNCHRONIZED' ? 'JIRA_SYNC_UPDATED' : 'JIRA_SYNC_FAILED',
            previousEngineerId: existingOwnership.assignedEngineerId,
            newEngineerId: existingOwnership.assignedEngineerId,
            assignmentSource: existingOwnership.assignmentSource,
            assignmentReason: 'Manual retry of Jira assignee synchronization.',
            jiraAssigneeSyncStatus: jiraSyncStatus,
            syncErrorMessage: jiraSyncError,
            ownershipVersion: newVersion,
          },
        });

        return updated;
      });

      const fullHistory = await this.prisma.defectOwnershipHistory.findMany({
        where: { ownershipId: updatedOwnership.id },
        orderBy: { createdAt: 'desc' },
      });

      return this.mapOwnershipDto(
        { ...updatedOwnership, history: fullHistory },
        jiraLink.jiraIssueKey,
      );
    } finally {
      releaseLock();
    }
  }
}
