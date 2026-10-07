/**
 * @file packages/core/src/workflow/workflow-sync-service.ts
 * Authoritative orchestrator for Bug Status & External Workflow Synchronization.
 */

import { type PrismaClient, Prisma } from '@prisma/client';
import type {
  GetWorkflowStateInputDto,
  UpdateInternalStatusInputDto,
  GetWorkflowStatusMappingsInputDto,
  SaveWorkflowStatusMappingInputDto,
  DeleteWorkflowStatusMappingInputDto,
  SyncWorkflowNowInputDto,
  ResolveWorkflowConflictInputDto,
  ListWorkflowSyncEventsInputDto,
} from '@ai-quality/contracts';
import {
  type IWorkflowSyncService,
  type BugWorkflowState,
  type WorkflowStatusMapping,
  type WorkflowSyncEvent,
  type InternalBugStatus,
  type SyncResultStatus,
  type SyncDirection,
  type SyncConflictPolicy,
  DEFAULT_JIRA_STATUS_MAPPINGS,
} from './workflow-types.js';
import {
  WorkflowStateNotFoundError,
  InvalidWorkflowTransitionError,
  WorkflowCrossProjectForbiddenError,
  WorkflowMappingNotFoundError,
} from './workflow-errors.js';
import { WorkflowTransitionValidator } from './workflow-transition-validator.js';
import { WorkflowStatusMappingEngine } from './workflow-status-mapping-engine.js';
import { WorkflowConflictDetector } from './workflow-conflict-detector.js';
import type { IJiraClient, IJiraCredentialVault, JiraTransitionDto } from '../jira/jira-types.js';
import { JiraClient } from '../jira/jira-client.js';
import { JiraCredentialVault } from '../jira/jira-credential-vault.js';
import {
  JiraIssueNotFoundError,
  JiraAuthenticationFailedError,
  JiraRateLimitedError,
} from '../jira/jira-errors.js';
import type { EmailNotificationService } from '../email/email-notification-service.js';

export interface WorkflowSyncServiceOptions {
  readonly prisma: PrismaClient;
  readonly jiraClient?: IJiraClient;
  readonly vault?: IJiraCredentialVault;
  readonly emailService?: EmailNotificationService;
  readonly allowLocalhostForTesting?: boolean;
}

export class WorkflowSyncService implements IWorkflowSyncService {
  private readonly prisma: PrismaClient;
  private readonly jiraClient: IJiraClient;
  private readonly vault: IJiraCredentialVault;
  private readonly emailService?: EmailNotificationService;
  private readonly allowLocalhostForTesting: boolean;
  private readonly defectLocks: Map<string, Promise<void>> = new Map();

  constructor(options: WorkflowSyncServiceOptions) {
    this.prisma = options.prisma;
    this.jiraClient = options.jiraClient ?? new JiraClient();
    this.vault = options.vault ?? new JiraCredentialVault();
    this.emailService = options.emailService;
    this.allowLocalhostForTesting = Boolean(options.allowLocalhostForTesting);
  }

  /**
   * Acquires a serialized in-memory async mutex lock for a failure case.
   */
  private async acquireLock(failureCaseId: string): Promise<() => void> {
    while (this.defectLocks.has(failureCaseId)) {
      await this.defectLocks.get(failureCaseId);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>(resolve => {
      resolveLock = resolve;
    });
    this.defectLocks.set(failureCaseId, lockPromise);

    return () => {
      this.defectLocks.delete(failureCaseId);
      resolveLock();
    };
  }

  /**
   * Asserts project ownership of failureCase and bugReport.
   */
  private async assertProjectOwnership(
    projectId: string,
    failureCaseId: string,
    bugReportId?: string | null,
  ): Promise<void> {
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase) {
      throw new WorkflowStateNotFoundError(failureCaseId);
    }

    if (failureCase.projectId !== projectId) {
      throw new WorkflowCrossProjectForbiddenError(
        `FailureCase ${failureCaseId} belongs to project ${failureCase.projectId}, not ${projectId}`,
      );
    }

    if (bugReportId) {
      const bugReport = await this.prisma.structuredBugReport.findUnique({
        where: { id: bugReportId },
        select: { id: true, projectId: true },
      });
      if (bugReport && bugReport.projectId !== projectId) {
        throw new WorkflowCrossProjectForbiddenError(
          `BugReport ${bugReportId} belongs to project ${bugReport.projectId}, not ${projectId}`,
        );
      }
    }
  }

  /**
   * Retrieves or initializes the current workflow state for a defect.
   */
  public async getState(input: GetWorkflowStateInputDto): Promise<BugWorkflowState> {
    const { projectId } = input;
    let failureCaseId = input.failureCaseId;
    let bugReportId = input.bugReportId;

    if (!failureCaseId && bugReportId) {
      const bugReport = await this.prisma.structuredBugReport.findUnique({
        where: { id: bugReportId },
        select: { failureCaseId: true, projectId: true },
      });
      if (!bugReport) {
        throw new WorkflowStateNotFoundError(bugReportId);
      }
      if (bugReport.projectId !== projectId) {
        throw new WorkflowCrossProjectForbiddenError();
      }
      failureCaseId = bugReport.failureCaseId;
    }

    if (!failureCaseId) {
      throw new WorkflowStateNotFoundError('No failureCaseId or bugReportId provided');
    }

    await this.assertProjectOwnership(projectId, failureCaseId, bugReportId);

    let state = await this.prisma.bugWorkflowState.findUnique({
      where: { failureCaseId },
    });

    if (!state) {
      // Find associated bug report if not provided
      if (!bugReportId) {
        const report = await this.prisma.structuredBugReport.findFirst({
          where: { failureCaseId, projectId },
          select: { id: true },
        });
        bugReportId = report?.id;
      }

      state = await this.prisma.bugWorkflowState.create({
        data: {
          projectId,
          failureCaseId,
          bugReportId: bugReportId ?? null,
          currentStatus: 'OPEN',
          verificationStatus: 'NOT_VERIFIED',
          lastChangedBy: 'SYSTEM',
        },
      });
    }

    return this.mapWorkflowStateDto(state);
  }

  /**
   * Updates internal defect triage status with transition validation and optional Jira sync.
   */
  public async updateInternalStatus(
    input: UpdateInternalStatusInputDto,
  ): Promise<BugWorkflowState> {
    const {
      projectId,
      failureCaseId,
      targetStatus,
      reason,
      actor = 'SYSTEM',
      syncExternal = true,
    } = input;
    await this.assertProjectOwnership(projectId, failureCaseId);

    const unlock = await this.acquireLock(failureCaseId);
    try {
      let state = await this.prisma.bugWorkflowState.findUnique({
        where: { failureCaseId },
      });

      if (!state) {
        const report = await this.prisma.structuredBugReport.findFirst({
          where: { failureCaseId, projectId },
          select: { id: true },
        });
        state = await this.prisma.bugWorkflowState.create({
          data: {
            projectId,
            failureCaseId,
            bugReportId: report?.id ?? null,
            currentStatus: 'OPEN',
            verificationStatus: 'NOT_VERIFIED',
            lastChangedBy: actor,
          },
        });
      }

      const currentStatus = state.currentStatus as InternalBugStatus;

      // Validate internal transition
      const transitionResult = WorkflowTransitionValidator.validate(
        currentStatus,
        targetStatus as InternalBugStatus,
      );
      if (!transitionResult.valid) {
        throw new InvalidWorkflowTransitionError(
          currentStatus,
          targetStatus,
          transitionResult.reason,
        );
      }

      // If no-op, return without mutation
      if (transitionResult.isNoOp) {
        return this.mapWorkflowStateDto(state);
      }

      const now = new Date();
      const updateData: Prisma.BugWorkflowStateUpdateInput = {
        currentStatus: targetStatus as InternalBugStatus,
        statusReason: reason ?? null,
        lastChangedBy: actor,
        workflowVersion: { increment: 1 },
        updatedAt: now,
      };

      if (transitionResult.isResolution) {
        updateData.resolvedAt = now;
        updateData.resolutionReason = reason ?? 'Defect marked as resolved';
      } else if (transitionResult.isReopen) {
        updateData.reopenedAt = now;
        updateData.reopenReason = reason ?? 'Defect reopened';
      } else if (transitionResult.isClosure) {
        updateData.closedAt = now;
      }

      const updatedState = await this.prisma.bugWorkflowState.update({
        where: { id: state.id },
        data: updateData,
      });

      // External sync if enabled and linked Jira issue exists
      if (syncExternal) {
        await this.syncInternalToExternal({
          projectId,
          workflowStateId: updatedState.id,
          failureCaseId,
          bugReportId: updatedState.bugReportId,
          targetStatus: targetStatus as InternalBugStatus,
          actor,
        });
      }

      // Safe asynchronous notification dispatch (Phase 95 integration)
      if (this.emailService && transitionResult.isResolution) {
        try {
          await this.emailService.notifyWorkflowEvent({
            projectId,
            eventType: 'TEST_REVERIFICATION_REQUIRED',
            entityType: updatedState.bugReportId ? 'BUG_REPORT' : 'FAILURE_CASE',
            entityId: updatedState.bugReportId ?? failureCaseId,
            failureCaseId,
            bugReportId: updatedState.bugReportId ?? undefined,
          });
        } catch {
          // Failure to send email must never abort or roll back workflow state
        }
      }

      const finalState = await this.prisma.bugWorkflowState.findUniqueOrThrow({
        where: { id: state.id },
      });
      return this.mapWorkflowStateDto(finalState);
    } finally {
      unlock();
    }
  }

  /**
   * Helper to push internal status transition out to linked Jira issue.
   */
  private async syncInternalToExternal(params: {
    readonly projectId: string;
    readonly workflowStateId: string;
    readonly failureCaseId: string;
    readonly bugReportId: string | null;
    readonly targetStatus: InternalBugStatus;
    readonly actor: string;
  }): Promise<void> {
    const { projectId, workflowStateId, failureCaseId, bugReportId, targetStatus, actor } = params;

    const jiraLink = await this.prisma.jiraIssueLink.findFirst({
      where: { failureCaseId, projectId },
    });

    if (!jiraLink) {
      return;
    }

    const mappings = await this.getStatusMappings({ projectId });
    const targetExternalName = WorkflowStatusMappingEngine.mapInternalToExternal(
      targetStatus,
      mappings,
    );

    if (!targetExternalName) {
      await this.prisma.workflowSyncEvent.create({
        data: {
          projectId,
          workflowStateId,
          failureCaseId,
          bugReportId,
          connectionId: jiraLink.jiraConnectionId,
          externalIssueId: jiraLink.jiraIssueId,
          externalIssueKey: jiraLink.jiraIssueKey,
          direction: 'INTERNAL_TO_EXTERNAL',
          sourceStatus: targetStatus,
          syncResult: 'UNMAPPED',
          errorMessage: `No external Jira status mapped for internal status '${targetStatus}'`,
          actor,
        },
      });
      await this.prisma.bugWorkflowState.update({
        where: { id: workflowStateId },
        data: {
          lastSyncResult: 'UNMAPPED',
          lastSyncError: `No external Jira status mapped for internal status '${targetStatus}'`,
        },
      });
      return;
    }

    const connection = await this.prisma.jiraConnection.findUnique({
      where: { id: jiraLink.jiraConnectionId },
    });

    if (!connection || !connection.encryptedCredentials) {
      await this.prisma.workflowSyncEvent.create({
        data: {
          projectId,
          workflowStateId,
          failureCaseId,
          bugReportId,
          connectionId: jiraLink.jiraConnectionId,
          externalIssueId: jiraLink.jiraIssueId,
          externalIssueKey: jiraLink.jiraIssueKey,
          direction: 'INTERNAL_TO_EXTERNAL',
          sourceStatus: targetStatus,
          targetStatus: targetExternalName,
          syncResult: 'UNAUTHORIZED',
          errorMessage: 'Jira connection credentials missing or inaccessible',
          actor,
        },
      });
      return;
    }

    try {
      const plainToken = await this.vault.decrypt(connection.encryptedCredentials, connection.id);

      // Query available transitions for the remote issue
      const availableTransitions =
        (await this.jiraClient.getTransitions?.({
          baseUrl: connection.baseUrl,
          deploymentType: connection.deploymentType,
          authenticationType: connection.authenticationType,
          accountIdentifier: connection.accountIdentifier,
          apiToken: plainToken,
          issueIdOrKey: jiraLink.jiraIssueKey,
          allowLocalhostForTesting: this.allowLocalhostForTesting,
        })) ?? [];

      const targetLower = targetExternalName.trim().toLowerCase();
      const matchedTransition = availableTransitions.find(
        (t: JiraTransitionDto) =>
          t.to.name.trim().toLowerCase() === targetLower ||
          t.name.trim().toLowerCase() === targetLower,
      );

      if (!matchedTransition) {
        await this.prisma.workflowSyncEvent.create({
          data: {
            projectId,
            workflowStateId,
            failureCaseId,
            bugReportId,
            connectionId: connection.id,
            externalIssueId: jiraLink.jiraIssueId,
            externalIssueKey: jiraLink.jiraIssueKey,
            direction: 'INTERNAL_TO_EXTERNAL',
            sourceStatus: targetStatus,
            targetStatus: targetExternalName,
            syncResult: 'BLOCKED',
            errorMessage: `No valid Jira workflow transition available to reach '${targetExternalName}' for issue ${jiraLink.jiraIssueKey}`,
            actor,
          },
        });
        await this.prisma.bugWorkflowState.update({
          where: { id: workflowStateId },
          data: {
            lastSyncResult: 'BLOCKED',
            lastSyncError: `No valid Jira transition to '${targetExternalName}'`,
          },
        });
        return;
      }

      // Execute Jira transition
      await this.jiraClient.transitionIssue?.({
        baseUrl: connection.baseUrl,
        deploymentType: connection.deploymentType,
        authenticationType: connection.authenticationType,
        accountIdentifier: connection.accountIdentifier,
        apiToken: plainToken,
        issueIdOrKey: jiraLink.jiraIssueKey,
        transitionId: matchedTransition.id,
        allowLocalhostForTesting: this.allowLocalhostForTesting,
      });

      const now = new Date();
      await this.prisma.bugWorkflowState.update({
        where: { id: workflowStateId },
        data: {
          lastExternalStatus: targetExternalName,
          lastSyncedInternalStatus: targetStatus,
          lastSyncedExternalStatus: targetExternalName,
          lastSyncedAt: now,
          lastSyncResult: 'SYNCED',
          lastSyncError: null,
          syncVersion: { increment: 1 },
          conflictState: Prisma.DbNull,
        },
      });

      await this.prisma.workflowSyncEvent.create({
        data: {
          projectId,
          workflowStateId,
          failureCaseId,
          bugReportId,
          connectionId: connection.id,
          externalIssueId: jiraLink.jiraIssueId,
          externalIssueKey: jiraLink.jiraIssueKey,
          direction: 'INTERNAL_TO_EXTERNAL',
          sourceStatus: targetStatus,
          targetStatus: targetExternalName,
          mappedStatus: targetExternalName,
          syncResult: 'SYNCED',
          completedAt: now,
          actor,
        },
      });
    } catch (err: unknown) {
      let syncResult: SyncResultStatus = 'FAILED';
      let errorMsg = err instanceof Error ? err.message : String(err);

      if (err instanceof JiraIssueNotFoundError) {
        syncResult = 'EXTERNAL_NOT_FOUND';
      } else if (err instanceof JiraAuthenticationFailedError) {
        syncResult = 'UNAUTHORIZED';
      } else if (err instanceof JiraRateLimitedError) {
        syncResult = 'RATE_LIMITED';
      }

      await this.prisma.workflowSyncEvent.create({
        data: {
          projectId,
          workflowStateId,
          failureCaseId,
          bugReportId,
          connectionId: connection.id,
          externalIssueId: jiraLink.jiraIssueId,
          externalIssueKey: jiraLink.jiraIssueKey,
          direction: 'INTERNAL_TO_EXTERNAL',
          sourceStatus: targetStatus,
          targetStatus: targetExternalName,
          syncResult,
          errorMessage: errorMsg,
          actor,
        },
      });

      await this.prisma.bugWorkflowState.update({
        where: { id: workflowStateId },
        data: {
          lastSyncResult: syncResult,
          lastSyncError: errorMsg,
        },
      });
    }
  }

  /**
   * Performs an immediate bidirectional synchronization between internal status and external Jira issue.
   */
  public async syncNow(input: SyncWorkflowNowInputDto): Promise<BugWorkflowState> {
    const { projectId, failureCaseId, direction = 'BIDIRECTIONAL', actor = 'SYSTEM' } = input;
    await this.assertProjectOwnership(projectId, failureCaseId);

    const unlock = await this.acquireLock(failureCaseId);
    try {
      const state = await this.getState({ projectId, failureCaseId });
      const jiraLink = await this.prisma.jiraIssueLink.findFirst({
        where: { failureCaseId, projectId },
      });

      if (!jiraLink) {
        await this.prisma.workflowSyncEvent.create({
          data: {
            projectId,
            workflowStateId: state.id,
            failureCaseId,
            bugReportId: state.bugReportId,
            direction,
            sourceStatus: state.currentStatus,
            syncResult: 'BLOCKED',
            errorMessage: 'No linked Jira issue found for this defect. Synchronization is blocked.',
            actor,
          },
        });

        const updated = await this.prisma.bugWorkflowState.update({
          where: { id: state.id },
          data: {
            lastSyncResult: 'BLOCKED',
            lastSyncError: 'No linked Jira issue found for this defect.',
          },
        });
        return this.mapWorkflowStateDto(updated);
      }

      const connection = await this.prisma.jiraConnection.findUnique({
        where: { id: jiraLink.jiraConnectionId },
      });

      if (!connection || !connection.encryptedCredentials) {
        await this.prisma.workflowSyncEvent.create({
          data: {
            projectId,
            workflowStateId: state.id,
            failureCaseId,
            bugReportId: state.bugReportId,
            connectionId: jiraLink.jiraConnectionId,
            externalIssueId: jiraLink.jiraIssueId,
            externalIssueKey: jiraLink.jiraIssueKey,
            direction,
            sourceStatus: state.currentStatus,
            syncResult: 'UNAUTHORIZED',
            errorMessage: 'Jira connection credentials missing or inaccessible.',
            actor,
          },
        });
        const updated = await this.prisma.bugWorkflowState.update({
          where: { id: state.id },
          data: {
            lastSyncResult: 'UNAUTHORIZED',
            lastSyncError: 'Jira connection credentials missing or inaccessible.',
          },
        });
        return this.mapWorkflowStateDto(updated);
      }

      let remoteIssue: { fields?: Record<string, unknown> };
      try {
        const plainToken = await this.vault.decrypt(connection.encryptedCredentials, connection.id);
        remoteIssue = await this.jiraClient.getIssue({
          baseUrl: connection.baseUrl,
          deploymentType: connection.deploymentType,
          authenticationType: connection.authenticationType,
          accountIdentifier: connection.accountIdentifier,
          apiToken: plainToken,
          issueIdOrKey: jiraLink.jiraIssueKey,
          allowLocalhostForTesting: this.allowLocalhostForTesting,
        });
      } catch (err: unknown) {
        let syncResult: SyncResultStatus = 'FAILED';
        let errorMsg = err instanceof Error ? err.message : String(err);

        if (err instanceof JiraIssueNotFoundError) {
          syncResult = 'EXTERNAL_NOT_FOUND';
        } else if (err instanceof JiraAuthenticationFailedError) {
          syncResult = 'UNAUTHORIZED';
        } else if (err instanceof JiraRateLimitedError) {
          syncResult = 'RATE_LIMITED';
        }

        await this.prisma.workflowSyncEvent.create({
          data: {
            projectId,
            workflowStateId: state.id,
            failureCaseId,
            bugReportId: state.bugReportId,
            connectionId: connection.id,
            externalIssueId: jiraLink.jiraIssueId,
            externalIssueKey: jiraLink.jiraIssueKey,
            direction,
            sourceStatus: state.currentStatus,
            syncResult,
            errorMessage: errorMsg,
            actor,
          },
        });

        const updated = await this.prisma.bugWorkflowState.update({
          where: { id: state.id },
          data: {
            lastSyncResult: syncResult,
            lastSyncError: errorMsg,
          },
        });
        return this.mapWorkflowStateDto(updated);
      }

      // Extract remote status
      const statusField = remoteIssue.fields?.status as { name?: string; id?: string } | undefined;
      const remoteStatusName = statusField?.name ?? 'Unknown';
      const remoteStatusId = statusField?.id;
      const remoteUpdatedAt = remoteIssue.fields?.updated
        ? new Date(String(remoteIssue.fields.updated))
        : new Date();

      const mappings = await this.getStatusMappings({ projectId });
      const mappedInternalStatus = WorkflowStatusMappingEngine.mapExternalToInternal(
        remoteStatusName,
        mappings,
      );

      // If external status cannot be mapped, sync is blocked (Prompt invariant: UNMAPPED STATUS)
      if (!mappedInternalStatus) {
        await this.prisma.workflowSyncEvent.create({
          data: {
            projectId,
            workflowStateId: state.id,
            failureCaseId,
            bugReportId: state.bugReportId,
            connectionId: connection.id,
            externalIssueId: jiraLink.jiraIssueId,
            externalIssueKey: jiraLink.jiraIssueKey,
            direction,
            sourceStatus: remoteStatusName,
            syncResult: 'UNMAPPED',
            errorMessage: `External Jira status '${remoteStatusName}' has no configured mapping. Synchronization blocked.`,
            actor,
          },
        });

        const updated = await this.prisma.bugWorkflowState.update({
          where: { id: state.id },
          data: {
            lastExternalStatus: remoteStatusName,
            lastExternalStatusId: remoteStatusId,
            lastSyncResult: 'UNMAPPED',
            lastSyncError: `External status '${remoteStatusName}' is unmapped.`,
          },
        });
        return this.mapWorkflowStateDto(updated);
      }

      // Evaluate conflict & policy
      const projectConfig = await this.prisma.jiraProjectConfig.findFirst({
        where: { projectId },
      });
      const conflictPolicy =
        (projectConfig as { conflictPolicy?: SyncConflictPolicy } | null)?.conflictPolicy ??
        'MANUAL_REVIEW';

      const conflictResult = WorkflowConflictDetector.evaluate({
        currentInternalStatus: state.currentStatus,
        currentExternalStatus: remoteStatusName,
        mappedInternalFromExternal: mappedInternalStatus,
        lastSyncedInternalStatus: state.lastSyncedInternalStatus ?? null,
        lastSyncedExternalStatus: state.lastSyncedExternalStatus ?? null,
        internalUpdatedAt: state.updatedAt,
        externalUpdatedAt: remoteUpdatedAt,
        policy: conflictPolicy,
      });

      // Case 1: Already synchronized (NO_CHANGE) - Idempotent
      if (!conflictResult.hasConflict && conflictResult.resolvedWinner === null) {
        await this.prisma.workflowSyncEvent.create({
          data: {
            projectId,
            workflowStateId: state.id,
            failureCaseId,
            bugReportId: state.bugReportId,
            connectionId: connection.id,
            externalIssueId: jiraLink.jiraIssueId,
            externalIssueKey: jiraLink.jiraIssueKey,
            direction,
            sourceStatus: remoteStatusName,
            targetStatus: state.currentStatus,
            mappedStatus: mappedInternalStatus,
            syncResult: 'NO_CHANGE',
            actor,
          },
        });

        const updated = await this.prisma.bugWorkflowState.update({
          where: { id: state.id },
          data: {
            lastExternalStatus: remoteStatusName,
            lastExternalStatusId: remoteStatusId,
            lastSyncedInternalStatus: state.currentStatus,
            lastSyncedExternalStatus: remoteStatusName,
            lastSyncedAt: new Date(),
            lastSyncResult: 'NO_CHANGE',
            lastSyncError: null,
            conflictState: Prisma.DbNull,
          },
        });
        return this.mapWorkflowStateDto(updated);
      }

      // Case 2: Manual Review Conflict (Do not overwrite!)
      if (conflictResult.hasConflict && conflictResult.resolvedWinner === null) {
        const conflictStateJson = {
          detectedAt: new Date().toISOString(),
          internalStatus: state.currentStatus,
          externalStatus: remoteStatusName,
          lastSyncedInternalStatus: state.lastSyncedInternalStatus,
          lastSyncedExternalStatus: state.lastSyncedExternalStatus,
          reason: conflictResult.reason,
          suggestedAction: conflictResult.suggestedAction,
        };

        await this.prisma.workflowSyncEvent.create({
          data: {
            projectId,
            workflowStateId: state.id,
            failureCaseId,
            bugReportId: state.bugReportId,
            connectionId: connection.id,
            externalIssueId: jiraLink.jiraIssueId,
            externalIssueKey: jiraLink.jiraIssueKey,
            direction,
            sourceStatus: remoteStatusName,
            targetStatus: state.currentStatus,
            mappedStatus: mappedInternalStatus,
            syncResult: 'CONFLICT',
            conflictDetails: conflictStateJson,
            actor,
          },
        });

        const updated = await this.prisma.bugWorkflowState.update({
          where: { id: state.id },
          data: {
            lastExternalStatus: remoteStatusName,
            lastExternalStatusId: remoteStatusId,
            lastSyncResult: 'CONFLICT',
            lastSyncError: conflictResult.reason,
            conflictState: conflictStateJson,
          },
        });
        return this.mapWorkflowStateDto(updated);
      }

      // Case 3: External wins (Pull remote status into internal platform)
      if (conflictResult.resolvedWinner === 'EXTERNAL') {
        const transition = WorkflowTransitionValidator.validate(
          state.currentStatus,
          mappedInternalStatus,
        );

        if (!transition.valid) {
          await this.prisma.workflowSyncEvent.create({
            data: {
              projectId,
              workflowStateId: state.id,
              failureCaseId,
              bugReportId: state.bugReportId,
              connectionId: connection.id,
              externalIssueId: jiraLink.jiraIssueId,
              externalIssueKey: jiraLink.jiraIssueKey,
              direction: 'EXTERNAL_TO_INTERNAL',
              sourceStatus: remoteStatusName,
              targetStatus: mappedInternalStatus,
              syncResult: 'BLOCKED',
              errorMessage: `External update to '${remoteStatusName}' violates internal transition rules: ${transition.reason}`,
              actor,
            },
          });
          const updated = await this.prisma.bugWorkflowState.update({
            where: { id: state.id },
            data: {
              lastExternalStatus: remoteStatusName,
              lastSyncResult: 'BLOCKED',
              lastSyncError: transition.reason,
            },
          });
          return this.mapWorkflowStateDto(updated);
        }

        const now = new Date();
        const updateData: Prisma.BugWorkflowStateUpdateInput = {
          currentStatus: mappedInternalStatus,
          statusReason: `Synchronized from external Jira status '${remoteStatusName}'`,
          lastChangedBy: actor,
          workflowVersion: { increment: 1 },
          lastExternalStatus: remoteStatusName,
          lastExternalStatusId: remoteStatusId,
          lastSyncedInternalStatus: mappedInternalStatus,
          lastSyncedExternalStatus: remoteStatusName,
          lastSyncedAt: now,
          lastExternalUpdatedAt: remoteUpdatedAt,
          syncVersion: { increment: 1 },
          lastSyncResult: 'SYNCED',
          lastSyncError: null,
          conflictState: Prisma.DbNull,
          updatedAt: now,
        };

        if (transition.isResolution) {
          updateData.resolvedAt = now;
          updateData.resolutionReason = `Externally resolved in Jira as '${remoteStatusName}'`;
        } else if (transition.isReopen) {
          updateData.reopenedAt = now;
          updateData.reopenReason = `Externally reopened in Jira as '${remoteStatusName}'`;
        } else if (transition.isClosure) {
          updateData.closedAt = now;
        }

        // CRITICAL INVARIANT: verificationStatus is NOT touched. Remains NOT_VERIFIED.

        const updated = await this.prisma.bugWorkflowState.update({
          where: { id: state.id },
          data: updateData,
        });

        await this.prisma.workflowSyncEvent.create({
          data: {
            projectId,
            workflowStateId: state.id,
            failureCaseId,
            bugReportId: state.bugReportId,
            connectionId: connection.id,
            externalIssueId: jiraLink.jiraIssueId,
            externalIssueKey: jiraLink.jiraIssueKey,
            direction: 'EXTERNAL_TO_INTERNAL',
            sourceStatus: remoteStatusName,
            targetStatus: mappedInternalStatus,
            mappedStatus: mappedInternalStatus,
            syncResult: 'SYNCED',
            completedAt: now,
            externalUpdatedAt: remoteUpdatedAt,
            internalUpdatedAt: now,
            actor,
          },
        });

        return this.mapWorkflowStateDto(updated);
      }

      // Case 4: Internal wins (Push internal status out to Jira)
      if (conflictResult.resolvedWinner === 'INTERNAL') {
        await this.syncInternalToExternal({
          projectId,
          workflowStateId: state.id,
          failureCaseId,
          bugReportId: state.bugReportId ?? null,
          targetStatus: state.currentStatus,
          actor,
        });

        const finalState = await this.prisma.bugWorkflowState.findUniqueOrThrow({
          where: { id: state.id },
        });
        return this.mapWorkflowStateDto(finalState);
      }

      return state;
    } finally {
      unlock();
    }
  }

  /**
   * Resolves a flagged synchronization conflict with an explicit user choice.
   */
  public async resolveConflict(input: ResolveWorkflowConflictInputDto): Promise<BugWorkflowState> {
    const {
      projectId,
      failureCaseId,
      chosenWinner,
      overrideStatus,
      resolutionNote,
      actor = 'SYSTEM',
    } = input;
    await this.assertProjectOwnership(projectId, failureCaseId);

    const unlock = await this.acquireLock(failureCaseId);
    try {
      const state = await this.getState({ projectId, failureCaseId });

      if (chosenWinner === 'INTERNAL') {
        // Internal wins: Push internal status to Jira
        await this.syncInternalToExternal({
          projectId,
          workflowStateId: state.id,
          failureCaseId,
          bugReportId: state.bugReportId ?? null,
          targetStatus: state.currentStatus,
          actor,
        });

        const updated = await this.prisma.bugWorkflowState.update({
          where: { id: state.id },
          data: {
            conflictState: Prisma.DbNull,
            lastSyncResult: 'SYNCED',
            lastSyncError: null,
            statusReason: `Conflict resolved in favor of INTERNAL: ${resolutionNote}`,
          },
        });
        return this.mapWorkflowStateDto(updated);
      } else {
        // External wins: Map external status to internal
        const targetInternal =
          (overrideStatus as InternalBugStatus) || state.lastExternalStatus
            ? WorkflowStatusMappingEngine.mapExternalToInternal(
                overrideStatus || state.lastExternalStatus!,
                await this.getStatusMappings({ projectId }),
              )
            : null;

        if (!targetInternal) {
          throw new InvalidWorkflowTransitionError(
            state.currentStatus,
            overrideStatus ?? 'UNKNOWN',
            'Cannot resolve conflict: external status has no valid internal mapping',
          );
        }

        const now = new Date();
        const updated = await this.prisma.bugWorkflowState.update({
          where: { id: state.id },
          data: {
            currentStatus: targetInternal,
            statusReason: `Conflict resolved in favor of EXTERNAL: ${resolutionNote}`,
            lastChangedBy: actor,
            workflowVersion: { increment: 1 },
            lastSyncedInternalStatus: targetInternal,
            lastSyncedExternalStatus: overrideStatus ?? state.lastExternalStatus ?? null,
            lastSyncedAt: now,
            lastSyncResult: 'SYNCED',
            lastSyncError: null,
            conflictState: Prisma.DbNull,
          },
        });

        await this.prisma.workflowSyncEvent.create({
          data: {
            projectId,
            workflowStateId: state.id,
            failureCaseId,
            bugReportId: state.bugReportId,
            direction: 'EXTERNAL_TO_INTERNAL',
            sourceStatus: overrideStatus ?? state.lastExternalStatus ?? 'UNKNOWN',
            targetStatus: targetInternal,
            mappedStatus: targetInternal,
            syncResult: 'SYNCED',
            completedAt: now,
            actor,
            errorMessage: `Conflict manually resolved: ${resolutionNote}`,
          },
        });

        return this.mapWorkflowStateDto(updated);
      }
    } finally {
      unlock();
    }
  }

  /**
   * Webhook or background poller ingestion entrypoint.
   */
  public async handleExternalUpdate(input: {
    readonly projectId: string;
    readonly externalSystem: string;
    readonly externalIssueIdOrKey: string;
    readonly externalStatusName: string;
    readonly externalStatusId?: string;
    readonly externalUpdatedAt?: Date | string;
    readonly actor?: string;
  }): Promise<BugWorkflowState> {
    const { projectId, externalIssueIdOrKey, externalStatusName } = input;

    const jiraLink = await this.prisma.jiraIssueLink.findFirst({
      where: {
        projectId,
        OR: [{ jiraIssueKey: externalIssueIdOrKey }, { jiraIssueId: externalIssueIdOrKey }],
      },
    });

    if (!jiraLink) {
      throw new WorkflowStateNotFoundError(
        `No linked failure case for external issue ${externalIssueIdOrKey} in project ${projectId}`,
      );
    }

    return this.syncNow({
      projectId,
      failureCaseId: jiraLink.failureCaseId,
      direction: 'EXTERNAL_TO_INTERNAL',
      actor: input.actor ?? 'WEBHOOK',
    });
  }

  /**
   * Retrieves configured workflow status mappings for a project.
   */
  public async getStatusMappings(
    input: GetWorkflowStatusMappingsInputDto,
  ): Promise<readonly WorkflowStatusMapping[]> {
    const { projectId, connectionId, externalSystem = 'JIRA' } = input;

    const where: Prisma.WorkflowStatusMappingWhereInput = {
      projectId,
      externalSystem,
    };
    if (connectionId) {
      where.connectionId = connectionId;
    }

    const items = await this.prisma.workflowStatusMapping.findMany({
      where,
      orderBy: { externalStatusName: 'asc' },
    });

    if (items.length === 0 && externalSystem === 'JIRA') {
      return DEFAULT_JIRA_STATUS_MAPPINGS.map((m, index) => ({
        id: `default-${index}`,
        projectId,
        connectionId: connectionId ?? null,
        externalSystem: 'JIRA',
        externalStatusId: '*',
        externalStatusName: m.externalStatusName,
        internalStatus: m.internalStatus as InternalBugStatus,
        direction: m.direction as SyncDirection,
        conflictPolicy: m.conflictPolicy as SyncConflictPolicy,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
    }

    return items.map(m => ({
      id: m.id,
      projectId: m.projectId,
      connectionId: m.connectionId,
      externalSystem: m.externalSystem,
      externalStatusId: m.externalStatusId,
      externalStatusName: m.externalStatusName,
      internalStatus: m.internalStatus as InternalBugStatus,
      direction: m.direction as SyncDirection,
      conflictPolicy: m.conflictPolicy as SyncConflictPolicy,
      isEnabled: m.isEnabled,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    }));
  }

  /**
   * Saves or updates a project status mapping.
   */
  public async saveStatusMapping(
    input: SaveWorkflowStatusMappingInputDto,
  ): Promise<WorkflowStatusMapping> {
    const {
      projectId,
      id,
      connectionId,
      externalSystem = 'JIRA',
      externalStatusId = '*',
      externalStatusName,
      internalStatus,
      direction = 'BIDIRECTIONAL',
      conflictPolicy = 'MANUAL_REVIEW',
      isEnabled = true,
    } = input;

    if (id) {
      const existing = await this.prisma.workflowStatusMapping.findUnique({
        where: { id },
      });
      if (!existing || existing.projectId !== projectId) {
        throw new WorkflowMappingNotFoundError(id);
      }
      const updated = await this.prisma.workflowStatusMapping.update({
        where: { id },
        data: {
          connectionId: connectionId ?? null,
          externalSystem,
          externalStatusId,
          externalStatusName,
          internalStatus: internalStatus as InternalBugStatus,
          direction: direction as SyncDirection,
          conflictPolicy: conflictPolicy as SyncConflictPolicy,
          isEnabled,
          updatedAt: new Date(),
        },
      });
      return {
        id: updated.id,
        projectId: updated.projectId,
        connectionId: updated.connectionId,
        externalSystem: updated.externalSystem,
        externalStatusId: updated.externalStatusId,
        externalStatusName: updated.externalStatusName,
        internalStatus: updated.internalStatus as InternalBugStatus,
        direction: updated.direction as SyncDirection,
        conflictPolicy: updated.conflictPolicy as SyncConflictPolicy,
        isEnabled: updated.isEnabled,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    }

    const created = await this.prisma.workflowStatusMapping.upsert({
      where: {
        projectId_externalSystem_externalStatusName: {
          projectId,
          externalSystem,
          externalStatusName,
        },
      },
      update: {
        connectionId: connectionId ?? null,
        externalStatusId,
        internalStatus: internalStatus as InternalBugStatus,
        direction: direction as SyncDirection,
        conflictPolicy: conflictPolicy as SyncConflictPolicy,
        isEnabled,
        updatedAt: new Date(),
      },
      create: {
        projectId,
        connectionId: connectionId ?? null,
        externalSystem,
        externalStatusId,
        externalStatusName,
        internalStatus: internalStatus as InternalBugStatus,
        direction: direction as SyncDirection,
        conflictPolicy: conflictPolicy as SyncConflictPolicy,
        isEnabled,
      },
    });

    return {
      id: created.id,
      projectId: created.projectId,
      connectionId: created.connectionId,
      externalSystem: created.externalSystem,
      externalStatusId: created.externalStatusId,
      externalStatusName: created.externalStatusName,
      internalStatus: created.internalStatus as InternalBugStatus,
      direction: created.direction as SyncDirection,
      conflictPolicy: created.conflictPolicy as SyncConflictPolicy,
      isEnabled: created.isEnabled,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  /**
   * Deletes a workflow status mapping with strict project isolation.
   */
  public async deleteStatusMapping(
    input: DeleteWorkflowStatusMappingInputDto,
  ): Promise<{ readonly deleted: true }> {
    const { projectId, mappingId } = input;

    const existing = await this.prisma.workflowStatusMapping.findUnique({
      where: { id: mappingId },
    });

    if (!existing || existing.projectId !== projectId) {
      throw new WorkflowMappingNotFoundError(mappingId);
    }

    await this.prisma.workflowStatusMapping.delete({
      where: { id: mappingId },
    });

    return { deleted: true };
  }

  /**
   * Lists paginated workflow sync audit events.
   */
  public async listSyncEvents(input: ListWorkflowSyncEventsInputDto): Promise<{
    readonly items: readonly WorkflowSyncEvent[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly totalPages: number;
  }> {
    const {
      projectId,
      failureCaseId,
      workflowStateId,
      syncResult,
      page = 1,
      pageSize = 20,
    } = input;

    const where: Prisma.WorkflowSyncEventWhereInput = { projectId };
    if (failureCaseId) {
      where.failureCaseId = failureCaseId;
    }
    if (workflowStateId) {
      where.workflowStateId = workflowStateId;
    }
    if (syncResult) {
      where.syncResult = syncResult as SyncResultStatus;
    }

    const [total, items] = await Promise.all([
      this.prisma.workflowSyncEvent.count({ where }),
      this.prisma.workflowSyncEvent.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: items.map(e => ({
        id: e.id,
        projectId: e.projectId,
        workflowStateId: e.workflowStateId,
        failureCaseId: e.failureCaseId,
        bugReportId: e.bugReportId,
        connectionId: e.connectionId,
        externalIssueId: e.externalIssueId,
        externalIssueKey: e.externalIssueKey,
        direction: e.direction as SyncDirection,
        sourceStatus: e.sourceStatus,
        targetStatus: e.targetStatus,
        mappedStatus: e.mappedStatus,
        syncResult: e.syncResult as SyncResultStatus,
        conflictDetails: e.conflictDetails,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
        externalUpdatedAt: e.externalUpdatedAt,
        internalUpdatedAt: e.internalUpdatedAt,
        errorCode: e.errorCode,
        errorMessage: e.errorMessage,
        retryCount: e.retryCount,
        actor: e.actor,
        createdAt: e.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  /**
   * Maps Prisma BugWorkflowState to contract DTO.
   */
  private mapWorkflowStateDto(model: {
    id: string;
    projectId: string;
    failureCaseId: string;
    bugReportId: string | null;
    currentStatus: string;
    verificationStatus: string;
    statusReason: string | null;
    resolvedAt: Date | null;
    resolutionReason: string | null;
    reopenedAt: Date | null;
    reopenReason: string | null;
    closedAt: Date | null;
    lastChangedBy: string;
    workflowVersion: number;
    lastExternalStatus: string | null;
    lastExternalStatusId: string | null;
    lastSyncedInternalStatus: string | null;
    lastSyncedExternalStatus: string | null;
    lastSyncedAt: Date | null;
    lastExternalUpdatedAt: Date | null;
    syncVersion: number;
    lastSyncResult: string | null;
    lastSyncError: string | null;
    conflictState: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }): BugWorkflowState {
    return {
      id: model.id,
      projectId: model.projectId,
      failureCaseId: model.failureCaseId,
      bugReportId: model.bugReportId,
      currentStatus: model.currentStatus as InternalBugStatus,
      verificationStatus: model.verificationStatus as BugWorkflowState['verificationStatus'],
      statusReason: model.statusReason,
      resolvedAt: model.resolvedAt,
      resolutionReason: model.resolutionReason,
      reopenedAt: model.reopenedAt,
      reopenReason: model.reopenReason,
      closedAt: model.closedAt,
      lastChangedBy: model.lastChangedBy,
      workflowVersion: model.workflowVersion,
      lastExternalStatus: model.lastExternalStatus,
      lastExternalStatusId: model.lastExternalStatusId,
      lastSyncedInternalStatus: model.lastSyncedInternalStatus as InternalBugStatus | null,
      lastSyncedExternalStatus: model.lastSyncedExternalStatus,
      lastSyncedAt: model.lastSyncedAt,
      lastExternalUpdatedAt: model.lastExternalUpdatedAt,
      syncVersion: model.syncVersion,
      lastSyncResult: model.lastSyncResult as SyncResultStatus | null,
      lastSyncError: model.lastSyncError,
      conflictState: model.conflictState,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    };
  }
}
