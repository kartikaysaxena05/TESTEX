/**
 * @file packages/core/src/jira/jira-issue-creation-service.ts
 * Core domain service for automated Jira issue creation from V6 Structured Bug Reports.
 * Enforces strict eligibility, idempotency, project isolation, concurrency control, and audit logging.
 */

import type { PrismaClient, JiraExternalIssue } from '@prisma/client';
import {
  type IJiraIssueCreationService,
  type IJiraCredentialVault,
  type IJiraClient,
  type IJiraDuplicatePreventionService,
  type CreateJiraIssueInputDto,
  type GetJiraIssueInputDto,
  type JiraExternalIssueDto,
  createJiraIssueInputSchema,
  getJiraIssueInputSchema,
} from './jira-types.js';
import { JiraCredentialVault } from './jira-credential-vault.js';
import { JiraClient } from './jira-client.js';
import { JiraIssuePayloadBuilder } from './jira-issue-payload-builder.js';
import { JiraDuplicatePreventionService } from './jira-duplicate-prevention-service.js';
import {
  JiraConnectionNotFoundError,
  JiraConfigNotFoundError,
  JiraStaleConfigError,
  JiraConfigurationInvalidError,
  JiraCrossProjectError,
  JiraIssueIneligibleError,
  JiraBugReportNotFoundError,
  JiraDeduplicationConflictError,
} from './jira-errors.js';
import { ProjectNotFoundError } from '../projects/project-errors.js';

export class JiraIssueCreationService implements IJiraIssueCreationService {
  private readonly prisma: PrismaClient;
  private readonly vault: IJiraCredentialVault;
  private readonly jiraClient: IJiraClient;
  private readonly duplicateService: IJiraDuplicatePreventionService;
  private readonly creationLocks: Map<string, Promise<void>> = new Map();
  private readonly allowLocalhostForTesting: boolean;

  constructor(options: {
    readonly prisma: PrismaClient;
    readonly vault?: IJiraCredentialVault;
    readonly jiraClient?: IJiraClient;
    readonly duplicateService?: IJiraDuplicatePreventionService;
    readonly allowLocalhostForTesting?: boolean;
  }) {
    this.prisma = options.prisma;
    this.vault = options.vault ?? new JiraCredentialVault();
    this.jiraClient = options.jiraClient ?? new JiraClient();
    this.allowLocalhostForTesting = Boolean(options.allowLocalhostForTesting);
    this.duplicateService =
      options.duplicateService ??
      new JiraDuplicatePreventionService({
        prisma: this.prisma,
        jiraClient: this.jiraClient,
        vault: this.vault,
        allowLocalhostForTesting: this.allowLocalhostForTesting,
      });
  }

  /**
   * Acquires a serialized in-memory lock for a specific failureCase to prevent race conditions.
   * Concurrent creation calls for the same failureCase are serialized: the first call creates the issue,
   * while queued calls wait and subsequently discover the existing external issue via idempotency check.
   */
  private async acquireLock(lockKey: string): Promise<() => void> {
    while (this.creationLocks.has(lockKey)) {
      await this.creationLocks.get(lockKey);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>(resolve => {
      resolveLock = resolve;
    });
    this.creationLocks.set(lockKey, lockPromise);

    return () => {
      this.creationLocks.delete(lockKey);
      resolveLock();
    };
  }

  /**
   * Creates an authoritative Jira issue from a verified V6 Structured Bug Report.
   */
  public async createIssue(rawInput: CreateJiraIssueInputDto): Promise<JiraExternalIssueDto> {
    const input = createJiraIssueInputSchema.parse(rawInput);

    // 1. Lock serialization to prevent concurrent duplicate creation attempts
    const lockKey = `${input.projectId}:${input.failureCaseId}`;
    const releaseLock = await this.acquireLock(lockKey);

    try {
      // 2. Validate Project Existence
      const project = await this.prisma.project.findUnique({
        where: { id: input.projectId },
      });
      if (!project) {
        throw new ProjectNotFoundError(input.projectId);
      }

      // 3. Validate FailureCase and Project Isolation
      const failureCase = await this.prisma.failureCase.findUnique({
        where: { id: input.failureCaseId },
      });
      if (!failureCase || failureCase.projectId !== input.projectId) {
        throw new JiraCrossProjectError(input.failureCaseId, input.projectId);
      }

      // 4. Validate StructuredBugReport and Project Isolation
      const bugReport = await this.prisma.structuredBugReport.findUnique({
        where: { id: input.bugReportId },
      });
      if (!bugReport || bugReport.projectId !== input.projectId) {
        throw new JiraBugReportNotFoundError(input.bugReportId);
      }
      if (bugReport.failureCaseId !== input.failureCaseId) {
        throw new JiraCrossProjectError(input.bugReportId, input.projectId);
      }

      // 5. Deterministic Eligibility Check
      if (
        !bugReport.isApplicationDefect ||
        (bugReport.applicationDefectState !== 'CONFIRMED_APPLICATION_DEFECT' &&
          bugReport.applicationDefectState !== 'SUPPORTED_APPLICATION_DEFECT')
      ) {
        throw new JiraIssueIneligibleError(
          `Only application defects can be published to Jira. Failure defect state is '${bugReport.applicationDefectState}'.`,
        );
      }

      if (bugReport.status === 'SUPERSEDED') {
        throw new JiraIssueIneligibleError(
          'Cannot create Jira issue for a superseded bug report revision.',
        );
      }

      // 6. Validate Jira Connection & Status
      const connection = await this.prisma.jiraConnection.findUnique({
        where: { projectId: input.projectId },
      });
      if (!connection) {
        throw new JiraConnectionNotFoundError(input.projectId);
      }
      if (connection.connectionStatus !== 'CONNECTED') {
        throw new JiraConfigurationInvalidError(
          `Jira connection is not active (current status: ${connection.connectionStatus}).`,
        );
      }
      if (!connection.encryptedCredentials) {
        throw new JiraConfigurationInvalidError('Jira connection credentials are missing.');
      }

      // 7. Validate Jira Project Config & Staleness
      const projectConfig = await this.prisma.jiraProjectConfig.findUnique({
        where: { projectId: input.projectId },
      });
      if (!projectConfig) {
        throw new JiraConfigNotFoundError(input.projectId);
      }
      if (projectConfig.configStatus !== 'CONFIGURED') {
        throw new JiraStaleConfigError(
          `Jira project configuration is not valid (status: ${projectConfig.configStatus}). Refresh configuration before creating issues.`,
        );
      }

      // 8. Idempotency Check via Deterministic Request Fingerprint
      const requestFingerprint = JiraIssuePayloadBuilder.computeFingerprint({
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        bugReportId: bugReport.id,
        revision: bugReport.revision,
        jiraProjectKey: projectConfig.jiraProjectKey,
        issueTypeId: projectConfig.selectedIssueTypeId,
      });

      // Check if an external issue with this exact fingerprint already exists
      const existingByFingerprint = await this.prisma.jiraExternalIssue.findUnique({
        where: { requestFingerprint },
      });
      if (existingByFingerprint) {
        return this.mapToDto(existingByFingerprint);
      }

      // 9. Duplicate Prevention & Existing-Issue Evaluation Gate (V7 Phase 93)
      const duplicateEval = await this.duplicateService.evaluateBeforeCreate({
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        bugReportId: bugReport.id,
      });

      if (duplicateEval.decision === 'USE_EXISTING') {
        const issueKey = duplicateEval.jiraIssueKey || duplicateEval.existingIssue?.jiraIssueKey;
        if (issueKey) {
          const linkSource =
            duplicateEval.ruleId === 'JIRA_RULE_3_DEFECT_CLUSTER'
              ? 'SAME_DEFECT_CLUSTER'
              : duplicateEval.ruleId === 'JIRA_RULE_2_EXACT_FAILURE'
                ? 'SAME_FAILURE'
                : duplicateEval.ruleId === 'JIRA_RULE_4_EXTERNAL_METADATA_MATCH'
                  ? 'EXTERNAL_EXACT_MATCH'
                  : 'SAME_BUG_REPORT';

          await this.duplicateService.linkExistingIssue({
            projectId: input.projectId,
            failureCaseId: input.failureCaseId,
            bugReportId: bugReport.id,
            jiraIssueKey: issueKey,
            linkReason: duplicateEval.reason,
            linkSource,
          });

          if (duplicateEval.existingIssue) {
            return duplicateEval.existingIssue;
          }

          const existingExt = await this.prisma.jiraExternalIssue.findFirst({
            where: {
              projectId: input.projectId,
              jiraIssueKey: issueKey,
            },
          });
          if (existingExt) {
            return this.mapToDto(existingExt);
          }

          const normalizedBase = connection.baseUrl.replace(/\/+$/, '');
          return {
            id: duplicateEval.matchedLink?.id ?? crypto.randomUUID(),
            projectId: input.projectId,
            failureCaseId: input.failureCaseId,
            bugReportId: bugReport.id,
            connectionId: connection.id,
            jiraProjectId: projectConfig.jiraProjectId,
            jiraProjectKey: projectConfig.jiraProjectKey,
            jiraIssueId: duplicateEval.jiraIssueId || issueKey,
            jiraIssueKey: issueKey,
            jiraIssueUrl: duplicateEval.jiraIssueUrl || `${normalizedBase}/browse/${issueKey}`,
            issueType: projectConfig.selectedIssueTypeName || projectConfig.selectedIssueTypeId,
            summary: bugReport.summary || bugReport.title,
            priority: projectConfig.defaultPriorityName || projectConfig.defaultPriorityId,
            creationStatus: 'CREATED',
            requestFingerprint: `REUSED_${issueKey}`,
            metadataSnapshot: {
              reusedFrom: duplicateEval.ruleId,
              reason: duplicateEval.reason,
            },
            createdBy: 'SYSTEM',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
      }

      if (duplicateEval.decision === 'BLOCKED' || duplicateEval.decision === 'INCONCLUSIVE') {
        throw new JiraDeduplicationConflictError(
          `Jira issue creation blocked by duplicate prevention policy (${duplicateEval.ruleId}): ${duplicateEval.reason}`,
        );
      }

      // Check if an external issue was already created for this bugReportId
      const existingByBugReport = await this.prisma.jiraExternalIssue.findFirst({
        where: {
          projectId: input.projectId,
          bugReportId: bugReport.id,
          creationStatus: 'CREATED',
        },
      });
      if (existingByBugReport) {
        return this.mapToDto(existingByBugReport);
      }

      // 9. Decrypt Jira Credentials
      const plainToken = await this.vault.decrypt(connection.encryptedCredentials, connection.id);

      // 10. Construct Safe Jira Payload
      const payload = JiraIssuePayloadBuilder.buildPayload({
        bugReport,
        config: projectConfig,
        deploymentType: connection.deploymentType,
      });

      // 11. Audit Attempt
      await this.prisma.jiraConnectionAudit.create({
        data: {
          connectionId: connection.id,
          projectId: input.projectId,
          eventType: 'ISSUE_CREATION_ATTEMPTED',
          actor: 'USER',
          details: {
            failureCaseId: input.failureCaseId,
            bugReportId: bugReport.id,
            jiraProjectKey: projectConfig.jiraProjectKey,
            issueTypeId: projectConfig.selectedIssueTypeId,
            requestFingerprint,
          },
        },
      });

      // 12. Dispatch External Issue Creation to Jira API
      let creationResponse: { id: string; key: string; self?: string };
      try {
        creationResponse = await this.jiraClient.createIssue({
          baseUrl: connection.baseUrl,
          deploymentType: connection.deploymentType,
          authenticationType: connection.authenticationType,
          accountIdentifier: connection.accountIdentifier,
          apiToken: plainToken,
          payload,
          allowLocalhostForTesting: this.allowLocalhostForTesting,
        });
      } catch (err: unknown) {
        // Record audit failure
        const errorMessage = err instanceof Error ? err.message : String(err);
        await this.prisma.jiraConnectionAudit.create({
          data: {
            connectionId: connection.id,
            projectId: input.projectId,
            eventType: 'ISSUE_CREATION_FAILED',
            actor: 'USER',
            details: {
              failureCaseId: input.failureCaseId,
              bugReportId: bugReport.id,
              error: errorMessage,
              requestFingerprint,
            },
          },
        });
        throw err;
      }

      // 13. Derive Authoritative Issue URL
      const normalizedBase = connection.baseUrl.replace(/\/+$/, '');
      const jiraIssueUrl = `${normalizedBase}/browse/${creationResponse.key}`;

      // 14. Persist Authoritative External Issue Identity
      const persisted = await this.prisma.jiraExternalIssue.create({
        data: {
          projectId: input.projectId,
          failureCaseId: input.failureCaseId,
          bugReportId: bugReport.id,
          connectionId: connection.id,
          jiraProjectId: projectConfig.jiraProjectId,
          jiraProjectKey: projectConfig.jiraProjectKey,
          jiraIssueId: creationResponse.id,
          jiraIssueKey: creationResponse.key,
          jiraIssueUrl,
          issueType: projectConfig.selectedIssueTypeName || projectConfig.selectedIssueTypeId,
          summary: payload.fields.summary,
          priority: projectConfig.defaultPriorityName || projectConfig.defaultPriorityId,
          creationStatus: 'CREATED',
          requestFingerprint,
          metadataSnapshot: {
            self: creationResponse.self,
            revision: bugReport.revision,
            reportNumber: bugReport.reportNumber,
            summary: payload.fields.summary,
          },
          createdBy: 'USER',
        },
      });

      // 14b. Persist Authoritative JiraIssueLink (V7 Phase 93)
      await this.prisma.jiraIssueLink.create({
        data: {
          projectId: input.projectId,
          failureCaseId: input.failureCaseId,
          bugReportId: bugReport.id,
          externalIssueId: persisted.id,
          jiraConnectionId: connection.id,
          jiraProjectKey: projectConfig.jiraProjectKey,
          jiraIssueId: creationResponse.id,
          jiraIssueKey: creationResponse.key,
          jiraIssueUrl,
          linkReason: 'Direct issue creation from verified bug report',
          linkSource: 'EXACT_EXISTING_LINK',
          decision: 'USE_EXISTING',
          isActive: true,
          metadataSnapshot: {
            self: creationResponse.self,
            revision: bugReport.revision,
            reportNumber: bugReport.reportNumber,
          },
        },
      });

      // 15. Audit Successful Creation
      await this.prisma.jiraConnectionAudit.create({
        data: {
          connectionId: connection.id,
          projectId: input.projectId,
          eventType: 'ISSUE_CREATED',
          actor: 'USER',
          details: {
            jiraIssueId: creationResponse.id,
            jiraIssueKey: creationResponse.key,
            jiraIssueUrl,
            failureCaseId: input.failureCaseId,
            bugReportId: bugReport.id,
            requestFingerprint,
          },
        },
      });

      return this.mapToDto(persisted);
    } finally {
      releaseLock();
    }
  }

  /**
   * Retrieves existing external Jira issue metadata for a given failure case without initiating external requests.
   */
  public async getIssue(rawInput: GetJiraIssueInputDto): Promise<JiraExternalIssueDto | null> {
    const input = getJiraIssueInputSchema.parse(rawInput);

    // Validate project existence
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
    });
    if (!project) {
      throw new ProjectNotFoundError(input.projectId);
    }

    const where: {
      projectId: string;
      failureCaseId: string;
      bugReportId?: string;
      creationStatus: 'CREATED';
    } = {
      projectId: input.projectId,
      failureCaseId: input.failureCaseId,
      creationStatus: 'CREATED',
    };

    if (input.bugReportId) {
      where.bugReportId = input.bugReportId;
    }

    const existing = await this.prisma.jiraExternalIssue.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (!existing) {
      return null;
    }

    return this.mapToDto(existing);
  }

  private mapToDto(model: JiraExternalIssue): JiraExternalIssueDto {
    return {
      id: model.id,
      projectId: model.projectId,
      failureCaseId: model.failureCaseId,
      bugReportId: model.bugReportId,
      connectionId: model.connectionId,
      jiraProjectId: model.jiraProjectId,
      jiraProjectKey: model.jiraProjectKey,
      jiraIssueId: model.jiraIssueId,
      jiraIssueKey: model.jiraIssueKey,
      jiraIssueUrl: model.jiraIssueUrl,
      issueType: model.issueType,
      summary: model.summary,
      priority: model.priority,
      creationStatus: model.creationStatus as 'CREATED' | 'FAILED',
      requestFingerprint: model.requestFingerprint,
      metadataSnapshot:
        model.metadataSnapshot && typeof model.metadataSnapshot === 'object'
          ? (model.metadataSnapshot as Record<string, unknown>)
          : undefined,
      createdBy: model.createdBy,
      createdAt: model.createdAt.toISOString(),
      updatedAt: model.updatedAt.toISOString(),
    };
  }
}
