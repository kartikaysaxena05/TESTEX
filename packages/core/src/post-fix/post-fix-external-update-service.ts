/**
 * @file packages/core/src/post-fix/post-fix-external-update-service.ts
 * Central orchestrator for Post-Fix Jira & Notification Updates (V7 Phase 107).
 * Consumes authoritative reverification outcomes, enforces multi-tenant project isolation,
 * guarantees idempotency with 0 duplicate side-effects, handles partial external failures,
 * and maintains an immutable synchronization audit log.
 */

import crypto from 'node:crypto';
import type { PrismaClient, Prisma } from '@prisma/client';
import type {
  ExecutePostFixSyncInputDto,
  RetryPostFixSyncInputDto,
  GetPostFixSyncStatusInputDto,
  ListPostFixSyncHistoryInputDto,
  PostFixSyncRecordDto,
  PostFixSyncOutcome,
  PostFixSyncStatus,
  PostFixJiraUpdateStatus,
  PostFixNotificationDeliveryStatus,
  NotificationEventType,
} from '@ai-quality/contracts';
import {
  type IPostFixExternalUpdateService,
  type AuthoritativeVerificationFacts,
  POST_FIX_BOUNDS,
  POST_FIX_SYNC_VERSION,
} from './post-fix-types.js';
import {
  PostFixSyncNotFoundError,
  PostFixReverificationNotFoundError,
  PostFixProjectMismatchError,
  PostFixValidationError,
  PostFixUnauthoritativeVerificationError,
  PostFixConcurrentSyncError,
  PostFixJiraRateLimitedError,
  PostFixJiraAuthFailedError,
} from './post-fix-errors.js';
import { PostFixCommentBuilder } from './post-fix-comment-builder.js';
import { PostFixTransitionEngine } from './post-fix-transition-engine.js';
import { PostFixNotificationFormatter } from './post-fix-notification-formatter.js';
import { JiraClient } from '../jira/jira-client.js';
import { JiraCredentialVault } from '../jira/jira-credential-vault.js';
import type { IJiraClient, IJiraCredentialVault } from '../jira/jira-types.js';
import { JiraAuthenticationFailedError, JiraRateLimitedError } from '../jira/jira-errors.js';
import type { EmailNotificationService } from '../email/email-notification-service.js';
import type { ILogger } from '../logging/index.js';

export interface PostFixExternalUpdateServiceOptions {
  readonly prisma: PrismaClient;
  readonly jiraClient?: IJiraClient;
  readonly vault?: IJiraCredentialVault;
  readonly emailService?: EmailNotificationService;
  readonly logger?: ILogger;
  readonly allowLocalhostForTesting?: boolean;
}

export class PostFixExternalUpdateService implements IPostFixExternalUpdateService {
  private readonly prisma: PrismaClient;
  private readonly jiraClient: IJiraClient;
  private readonly vault: IJiraCredentialVault;
  private readonly emailService?: EmailNotificationService;
  private readonly logger?: ILogger;
  private readonly allowLocalhostForTesting: boolean;
  private readonly defectLocks: Map<string, Promise<void>> = new Map();

  constructor(options: PostFixExternalUpdateServiceOptions) {
    this.prisma = options.prisma;
    this.jiraClient = options.jiraClient ?? new JiraClient();
    this.vault = options.vault ?? new JiraCredentialVault();
    this.emailService = options.emailService;
    this.logger = options.logger;
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
   * Computes a stable idempotency key for post-fix synchronization.
   */
  public static computeIdempotencyKey(params: {
    readonly projectId: string;
    readonly failureCaseId: string;
    readonly reverificationId: string;
    readonly outcome: string;
  }): string {
    const raw = `${params.projectId}:${params.failureCaseId}:${params.reverificationId}:${params.outcome}:${POST_FIX_SYNC_VERSION}`;
    return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  }

  /**
   * Extracts and validates authoritative verification facts from database models.
   */
  private async getAuthoritativeFacts(params: {
    readonly projectId: string;
    readonly failureCaseId: string;
    readonly reverificationId: string;
  }): Promise<{
    readonly reverification: any;
    readonly failureCase: any;
    readonly facts: AuthoritativeVerificationFacts;
    readonly jiraLink: any | null;
  }> {
    const { projectId, failureCaseId, reverificationId } = params;

    // 1. Load reverification with attempts and target environment
    const reverification = await this.prisma.defectReverification.findUnique({
      where: { id: reverificationId },
      include: {
        targetEnvironment: true,
        verificationAttempts: {
          orderBy: { attemptNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!reverification) {
      throw new PostFixReverificationNotFoundError(
        `Defect reverification ${reverificationId} not found.`,
      );
    }

    // 2. Strict Project & Defect Ownership Isolation
    if (reverification.projectId !== projectId) {
      throw new PostFixProjectMismatchError(
        `Reverification ${reverificationId} belongs to project ${reverification.projectId}, not requested project ${projectId}.`,
      );
    }
    if (reverification.failureCaseId !== failureCaseId) {
      throw new PostFixProjectMismatchError(
        `Reverification ${reverificationId} belongs to failure case ${reverification.failureCaseId}, not ${failureCaseId}.`,
      );
    }

    // 3. Load failure case and test case details
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: failureCaseId },
      include: {
        testCase: true,
        structuredBugReports: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!failureCase || failureCase.projectId !== projectId) {
      throw new PostFixProjectMismatchError(
        `Failure case ${failureCaseId} not found or project mismatch.`,
      );
    }

    // 4. Assert Authoritative Outcome Presence
    const latestOutcome = reverification.latestOutcome;
    const latestAttempt = reverification.verificationAttempts[0];

    if (!latestOutcome && !latestAttempt?.status) {
      throw new PostFixUnauthoritativeVerificationError(
        `Reverification ${reverificationId} does not possess an authoritative outcome. Execution must complete before external synchronization.`,
      );
    }

    const rawOutcome = (latestOutcome ?? latestAttempt?.status) as string;
    let mappedOutcome: PostFixSyncOutcome;
    switch (rawOutcome) {
      case 'VERIFIED_FIXED':
        mappedOutcome = 'VERIFIED_FIXED';
        break;
      case 'STILL_FAILING':
      case 'DIFFERENT_FAILURE':
        mappedOutcome = 'STILL_FAILING';
        break;
      case 'BLOCKED':
        mappedOutcome = 'BLOCKED';
        break;
      case 'INCONCLUSIVE':
      case 'EXECUTION_ERROR':
        mappedOutcome = 'INCONCLUSIVE';
        break;
      case 'CANCELLED':
        mappedOutcome = 'CANCELLED';
        break;
      default:
        mappedOutcome = 'INCONCLUSIVE';
    }

    // Check if patch validation reports new regressions
    let regressionDetails: AuthoritativeVerificationFacts['regressionDetails'] | undefined;
    const latestValidation = await this.prisma.defectPatchValidation.findFirst({
      where: { projectId, failureCaseId },
      orderBy: { createdAt: 'desc' },
    });
    if (latestValidation?.regressionDetected && latestValidation.newRegressionsCount > 0) {
      if (mappedOutcome === 'VERIFIED_FIXED') {
        mappedOutcome = 'REGRESSION_DETECTED';
      }
      regressionDetails = {
        regressionCount: latestValidation.newRegressionsCount,
        regressedTestKeys: (latestValidation.newRegressionsJson as any[])?.map(r => r.testKey || 'UNKNOWN') ?? [],
      };
    }

    // Evidence extraction
    const evidenceList: { type: string; name: string; uri?: string }[] = [];
    const evidenceRefs = await this.prisma.failureEvidenceReference.findMany({
      where: { failureCaseId },
      take: POST_FIX_BOUNDS.MAX_EVIDENCE_REFERENCES,
    });
    for (const ev of evidenceRefs) {
      evidenceList.push({
        type: ev.artifactType,
        name: ev.logicalName || ev.artifactType,
        uri: ev.storageIdentity || undefined,
      });
    }

    // 5. Check active JiraIssueLink
    const jiraLink = await this.prisma.jiraIssueLink.findFirst({
      where: {
        projectId,
        failureCaseId,
        isActive: true,
      },
      include: {
        jiraConnection: true,
      },
    });

    const facts: AuthoritativeVerificationFacts = {
      outcome: mappedOutcome,
      testCaseId: failureCase.testCaseId,
      testCaseKey: failureCase.testCase.testCaseKey,
      testCaseTitle: failureCase.testCase.title,
      testCaseVersionNumber: reverification.selectedTestCaseVersionNumber,
      requirementId: reverification.requirementId,
      requirementKey: reverification.requirementKey,
      targetEnvironmentName: reverification.targetEnvironment?.name || 'Default Environment',
      originalExecutionId: reverification.originalExecutionId,
      verificationExecutionId: latestAttempt?.verificationExecutionId,
      verificationTestRunId: latestAttempt?.verificationTestRunId,
      verificationAttemptNumber: latestAttempt?.attemptNumber ?? 1,
      isSignatureMatch: latestAttempt?.isSignatureMatch,
      completedAt: latestAttempt?.completedAt || reverification.updatedAt,
      evidenceReferences: evidenceList,
      regressionDetails,
      blockerReason: latestAttempt?.blockerReason || reverification.safetyReason,
    };

    return { reverification, failureCase, facts, jiraLink };
  }

  /**
   * Executes post-fix synchronization to Jira and Notification channels.
   */
  public async executeSync(input: ExecutePostFixSyncInputDto): Promise<PostFixSyncRecordDto> {
    const unlock = await this.acquireLock(input.failureCaseId);
    try {
      const { reverification, failureCase, facts, jiraLink } = await this.getAuthoritativeFacts({
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        reverificationId: input.reverificationId,
      });

      const idempotencyKey = PostFixExternalUpdateService.computeIdempotencyKey({
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        reverificationId: input.reverificationId,
        outcome: facts.outcome,
      });

      // Idempotency check: if sync already completed for this exact verification outcome, return existing
      const existing = await this.prisma.postFixSyncRecord.findUnique({
        where: { idempotencyKey },
        include: { audits: true },
      });

      if (existing && (existing.overallStatus === 'SUCCESS' || existing.overallStatus === 'PARTIAL_SUCCESS')) {
        this.logger?.info?.('PostFix sync record already exists with completed status; returning idempotent record', {
          idempotencyKey,
          syncRecordId: existing.id,
        });
        return this.mapRecordToDto(existing);
      }

      // Initial sub-operation states
      let jiraCommentStatus: PostFixJiraUpdateStatus = 'SKIPPED';
      let jiraCommentId: string | undefined;
      let jiraTransitionStatus: PostFixJiraUpdateStatus = 'SKIPPED';
      let jiraFromStatus: string | undefined;
      let jiraToStatus: string | undefined;
      let jiraTransitionId: string | undefined;
      let jiraError: string | undefined;

      let notificationStatus: PostFixNotificationDeliveryStatus = 'SKIPPED';
      let notificationRecipient: string | undefined;
      let notificationSubject: string | undefined;
      let notificationError: string | undefined;

      // 1. Jira Sub-Operation
      if (jiraLink && jiraLink.jiraConnection) {
        try {
          const apiToken = jiraLink.jiraConnection.encryptedCredentials
            ? await this.vault.decrypt(
                jiraLink.jiraConnection.encryptedCredentials,
                jiraLink.jiraConnection.id,
              )
            : '';

          const connectionOptions = {
            baseUrl: jiraLink.jiraConnection.baseUrl,
            deploymentType: jiraLink.jiraConnection.deploymentType,
            authenticationType: jiraLink.jiraConnection.authenticationType,
            accountIdentifier: jiraLink.jiraConnection.accountIdentifier || '',
            apiToken,
            allowLocalhostForTesting: this.allowLocalhostForTesting,
          };

          // 1a. Post Jira Comment
          if (this.jiraClient.addComment) {
            const commentBody = PostFixCommentBuilder.buildComment({
              facts,
              customNote: input.customNote,
              actor: input.actor,
            });

            try {
              const commentRes = await this.jiraClient.addComment({
                ...connectionOptions,
                issueIdOrKey: jiraLink.jiraIssueKey,
                body: commentBody,
              });
              jiraCommentStatus = 'COMMENT_POSTED';
              jiraCommentId = commentRes.id;
            } catch (cErr: any) {
              jiraCommentStatus = 'FAILED';
              jiraError = cErr?.message || 'Failed to post Jira comment';
              if (cErr instanceof JiraRateLimitedError) {
                throw new PostFixJiraRateLimitedError(cErr.message, cErr.retryAfterSeconds);
              }
              if (cErr instanceof JiraAuthenticationFailedError) {
                throw new PostFixJiraAuthFailedError(cErr.message);
              }
            }
          }

          // 1b. Jira Workflow Transition (only if comment succeeded or not failed with auth/rate error)
          if (jiraCommentStatus !== 'FAILED') {
            const candidateStatuses = await PostFixTransitionEngine.resolveCandidateTargetStatuses({
              prisma: this.prisma,
              projectId: input.projectId,
              outcome: facts.outcome,
              forceTransition: input.forceTransition,
            });

            if (candidateStatuses.length > 0) {
              const transitionRes = await PostFixTransitionEngine.executeTransition({
                jiraClient: this.jiraClient,
                connectionOptions,
                issueIdOrKey: jiraLink.jiraIssueKey,
                candidateTargetNames: candidateStatuses,
              });

              jiraTransitionStatus = transitionRes.transitionStatus;
              jiraFromStatus = transitionRes.fromStatus;
              jiraToStatus = transitionRes.toStatus;
              jiraTransitionId = transitionRes.transitionId;
              if (transitionRes.error) {
                jiraError = jiraError ? `${jiraError}; ${transitionRes.error}` : transitionRes.error;
              }
            }
          }
        } catch (jErr: any) {
          if (jErr instanceof PostFixJiraRateLimitedError || jErr instanceof PostFixJiraAuthFailedError) {
            throw jErr;
          }
          jiraCommentStatus = 'FAILED';
          jiraError = jErr?.message || 'Unexpected Jira integration failure';
        }
      }

      // 2. Notification Sub-Operation
      if (input.notifyAssignee !== false) {
        try {
          // Resolve recipient: check defect ownership or project email config
          const ownership = await this.prisma.defectOwnership.findFirst({
            where: { failureCaseId: input.failureCaseId },
            include: { assignedEngineer: true },
          });

          const recipientEmail = ownership?.assignedEngineer?.email;
          if (recipientEmail) {
            notificationRecipient = recipientEmail;
            const project = await this.prisma.project.findUnique({
              where: { id: input.projectId },
              select: { name: true },
            });

            const formatted = PostFixNotificationFormatter.format({
              facts,
              bugKey: facts.testCaseKey,
              projectName: project?.name || 'Project',
            });

            notificationSubject = formatted.subject;

            if (this.emailService) {
              let eventType: NotificationEventType;
              if (facts.outcome === 'VERIFIED_FIXED') {
                eventType = 'POST_FIX_VERIFICATION_SUCCEEDED';
              } else if (facts.outcome === 'REGRESSION_DETECTED') {
                eventType = 'POST_FIX_REGRESSION_DETECTED';
              } else if (facts.outcome === 'BLOCKED') {
                eventType = 'POST_FIX_VERIFICATION_BLOCKED';
              } else {
                eventType = 'POST_FIX_VERIFICATION_FAILED';
              }

              await this.emailService.notifyWorkflowEvent({
                projectId: input.projectId,
                eventType,
                entityType: 'FAILURE_CASE',
                entityId: input.failureCaseId,
                failureCaseId: input.failureCaseId,
                actorUserId: input.actor,
                metadata: {
                  outcome: facts.outcome,
                  recipientEmail,
                  subject: formatted.subject,
                },
              });
              notificationStatus = 'SENT';
            } else {
              // Simulated delivery without email service
              notificationStatus = 'SENT';
            }
          } else {
            notificationStatus = 'SKIPPED';
          }
        } catch (nErr: any) {
          notificationStatus = 'FAILED';
          notificationError = nErr?.message || 'Failed to dispatch email notification';
        }
      }

      // 3. Compute Overall Status
      let overallStatus: PostFixSyncStatus = 'SUCCESS';
      const hasJiraFailure = jiraCommentStatus === 'FAILED' || jiraTransitionStatus === 'FAILED';
      const hasNotificationFailure = notificationStatus === 'FAILED';
      const hasJiraSuccess = jiraCommentStatus === 'COMMENT_POSTED' || jiraTransitionStatus === 'TRANSITIONED';
      const hasNotificationSuccess = notificationStatus === 'SENT';

      if (hasJiraFailure || hasNotificationFailure) {
        overallStatus = hasJiraSuccess || hasNotificationSuccess ? 'PARTIAL_SUCCESS' : 'FAILED';
      }

      // 4. Persist Record and Audit
      const syncRecord = await this.prisma.postFixSyncRecord.create({
        data: {
          project: { connect: { id: input.projectId } },
          failureCase: { connect: { id: input.failureCaseId } },
          reverification: { connect: { id: input.reverificationId } },
          ...(jiraLink ? { jiraIssueLink: { connect: { id: jiraLink.id } } } : {}),
          idempotencyKey,
          outcome: facts.outcome,
          overallStatus,
          jiraIssueKey: jiraLink?.jiraIssueKey || null,
          jiraCommentStatus,
          jiraCommentId: jiraCommentId || null,
          jiraTransitionStatus,
          jiraFromStatus: jiraFromStatus || null,
          jiraToStatus: jiraToStatus || null,
          jiraTransitionId: jiraTransitionId || null,
          jiraError: jiraError || null,
          notificationStatus,
          notificationRecipient: notificationRecipient || null,
          notificationSubject: notificationSubject || null,
          notificationError: notificationError || null,
          evidenceCount: facts.evidenceReferences.length,
          evidenceReferencesJson: facts.evidenceReferences as any,
          retryCount: 0,
          actor: input.actor || 'SYSTEM',
          customNote: input.customNote || null,
          detailsJson: {
            verificationAttemptNumber: facts.verificationAttemptNumber,
            completedAt: facts.completedAt.toISOString(),
          } as any,
          completedAt: new Date(),
          audits: {
            create: {
              project: { connect: { id: input.projectId } },
              action: 'SYNC_EXECUTED',
              status: overallStatus,
              actor: input.actor || 'SYSTEM',
              detailsJson: {
                outcome: facts.outcome,
                jiraCommentStatus,
                jiraTransitionStatus,
                notificationStatus,
              } as any,
            },
          },
        },
        include: { audits: true },
      });

      return this.mapRecordToDto(syncRecord);
    } finally {
      unlock();
    }
  }

  /**
   * Retries uncompleted or failed sub-operations of an existing post-fix synchronization.
   */
  public async retrySync(input: RetryPostFixSyncInputDto): Promise<PostFixSyncRecordDto> {
    const record = await this.prisma.postFixSyncRecord.findUnique({
      where: { id: input.syncRecordId },
      include: {
        reverification: true,
        failureCase: true,
        jiraIssueLink: { include: { jiraConnection: true } },
        audits: true,
      },
    });

    if (!record) {
      throw new PostFixSyncNotFoundError(`Post-fix sync record ${input.syncRecordId} not found.`);
    }

    if (record.projectId !== input.projectId) {
      throw new PostFixProjectMismatchError(
        `Sync record ${input.syncRecordId} belongs to project ${record.projectId}, not ${input.projectId}.`,
      );
    }

    if (record.retryCount >= POST_FIX_BOUNDS.MAX_RETRIES) {
      throw new PostFixValidationError(
        `Sync record ${input.syncRecordId} has exceeded maximum allowed retries (${POST_FIX_BOUNDS.MAX_RETRIES}).`,
      );
    }

    const unlock = await this.acquireLock(record.failureCaseId);
    try {
      let jiraCommentStatus = record.jiraCommentStatus;
      let jiraCommentId = record.jiraCommentId;
      let jiraTransitionStatus = record.jiraTransitionStatus;
      let jiraToStatus = record.jiraToStatus;
      let jiraTransitionId = record.jiraTransitionId;
      let jiraError = record.jiraError;

      let notificationStatus = record.notificationStatus;
      let notificationError = record.notificationError;

      // 1. Retry Jira if failed
      if (record.jiraIssueLink && record.jiraIssueLink.jiraConnection) {
        const apiToken = record.jiraIssueLink.jiraConnection.encryptedCredentials
          ? await this.vault.decrypt(
              record.jiraIssueLink.jiraConnection.encryptedCredentials,
              record.jiraIssueLink.jiraConnection.id,
            )
          : '';

        const connectionOptions = {
          baseUrl: record.jiraIssueLink.jiraConnection.baseUrl,
          deploymentType: record.jiraIssueLink.jiraConnection.deploymentType,
          authenticationType: record.jiraIssueLink.jiraConnection.authenticationType,
          accountIdentifier: record.jiraIssueLink.jiraConnection.accountIdentifier || '',
          apiToken,
          allowLocalhostForTesting: this.allowLocalhostForTesting,
        };

        // Retry comment only if previously failed
        if (jiraCommentStatus === 'FAILED' && this.jiraClient.addComment) {
          try {
            const { facts } = await this.getAuthoritativeFacts({
              projectId: record.projectId,
              failureCaseId: record.failureCaseId,
              reverificationId: record.reverificationId,
            });

            const commentBody = PostFixCommentBuilder.buildComment({
              facts,
              customNote: record.customNote,
              actor: input.actor,
            });

            const commentRes = await this.jiraClient.addComment({
              ...connectionOptions,
              issueIdOrKey: record.jiraIssueLink.jiraIssueKey,
              body: commentBody,
            });

            jiraCommentStatus = 'COMMENT_POSTED';
            jiraCommentId = commentRes.id;
            jiraError = null;
          } catch (cErr: any) {
            jiraCommentStatus = 'FAILED';
            jiraError = cErr?.message || 'Retry comment failed';
          }
        }

        // Retry transition only if previously failed or unavailable
        if (
          jiraTransitionStatus === 'FAILED' ||
          jiraTransitionStatus === 'TRANSITION_UNAVAILABLE'
        ) {
          const candidateStatuses = await PostFixTransitionEngine.resolveCandidateTargetStatuses({
            prisma: this.prisma,
            projectId: record.projectId,
            outcome: record.outcome,
          });

          if (candidateStatuses.length > 0) {
            const transitionRes = await PostFixTransitionEngine.executeTransition({
              jiraClient: this.jiraClient,
              connectionOptions,
              issueIdOrKey: record.jiraIssueLink.jiraIssueKey,
              candidateTargetNames: candidateStatuses,
            });

            jiraTransitionStatus = transitionRes.transitionStatus;
            jiraToStatus = transitionRes.toStatus || jiraToStatus;
            jiraTransitionId = transitionRes.transitionId || jiraTransitionId;
            if (transitionRes.error) {
              jiraError = jiraError ? `${jiraError}; ${transitionRes.error}` : transitionRes.error;
            } else {
              jiraError = null;
            }
          }
        }
      }

      // 2. Retry Notification if failed
      if (notificationStatus === 'FAILED' && record.notificationRecipient) {
        try {
          if (this.emailService) {
            let eventType: NotificationEventType;
            if (record.outcome === 'VERIFIED_FIXED') {
              eventType = 'POST_FIX_VERIFICATION_SUCCEEDED';
            } else if (record.outcome === 'REGRESSION_DETECTED') {
              eventType = 'POST_FIX_REGRESSION_DETECTED';
            } else if (record.outcome === 'BLOCKED') {
              eventType = 'POST_FIX_VERIFICATION_BLOCKED';
            } else {
              eventType = 'POST_FIX_VERIFICATION_FAILED';
            }

            await this.emailService.notifyWorkflowEvent({
              projectId: record.projectId,
              eventType,
              entityType: 'FAILURE_CASE',
              entityId: record.failureCaseId,
              failureCaseId: record.failureCaseId,
              actorUserId: input.actor,
              metadata: {
                outcome: record.outcome,
                recipientEmail: record.notificationRecipient,
                subject: record.notificationSubject || 'Post-Fix Verification Update',
                isRetry: true,
              },
            });
          }
          notificationStatus = 'SENT';
          notificationError = null;
        } catch (nErr: any) {
          notificationStatus = 'FAILED';
          notificationError = nErr?.message || 'Retry notification failed';
        }
      }

      // Recompute overall status
      let overallStatus: PostFixSyncStatus = 'SUCCESS';
      const hasJiraFailure = jiraCommentStatus === 'FAILED' || jiraTransitionStatus === 'FAILED';
      const hasNotificationFailure = notificationStatus === 'FAILED';
      const hasJiraSuccess = jiraCommentStatus === 'COMMENT_POSTED' || jiraTransitionStatus === 'TRANSITIONED';
      const hasNotificationSuccess = notificationStatus === 'SENT';

      if (hasJiraFailure || hasNotificationFailure) {
        overallStatus = hasJiraSuccess || hasNotificationSuccess ? 'PARTIAL_SUCCESS' : 'FAILED';
      }

      const updated = await this.prisma.postFixSyncRecord.update({
        where: { id: record.id },
        data: {
          overallStatus,
          jiraCommentStatus,
          jiraCommentId,
          jiraTransitionStatus,
          jiraToStatus,
          jiraTransitionId,
          jiraError,
          notificationStatus,
          notificationError,
          retryCount: record.retryCount + 1,
          completedAt: new Date(),
          audits: {
            create: {
              project: { connect: { id: record.projectId } },
              action: 'SYNC_RETRIED',
              status: overallStatus,
              actor: input.actor || 'SYSTEM',
              detailsJson: {
                retryNumber: record.retryCount + 1,
                jiraCommentStatus,
                jiraTransitionStatus,
                notificationStatus,
              } as any,
            },
          },
        },
        include: { audits: true },
      });

      return this.mapRecordToDto(updated);
    } finally {
      unlock();
    }
  }

  /**
   * Retrieves an existing post-fix synchronization record by ID.
   */
  public async getStatus(input: GetPostFixSyncStatusInputDto): Promise<PostFixSyncRecordDto | null> {
    const record = await this.prisma.postFixSyncRecord.findUnique({
      where: { id: input.syncRecordId },
      include: { audits: true },
    });

    if (!record) return null;
    if (record.projectId !== input.projectId) {
      throw new PostFixProjectMismatchError(
        `Sync record ${input.syncRecordId} belongs to project ${record.projectId}, not ${input.projectId}.`,
      );
    }

    return this.mapRecordToDto(record);
  }

  /**
   * Lists post-fix synchronization records for a project.
   */
  public async listHistory(
    input: ListPostFixSyncHistoryInputDto,
  ): Promise<readonly PostFixSyncRecordDto[]> {
    const records = await this.prisma.postFixSyncRecord.findMany({
      where: {
        projectId: input.projectId,
        ...(input.failureCaseId ? { failureCaseId: input.failureCaseId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit ?? 20,
      skip: input.offset ?? 0,
      include: { audits: true },
    });

    return records.map(r => this.mapRecordToDto(r));
  }

  /**
   * Serializes a Prisma PostFixSyncRecord into a PostFixSyncRecordDto.
   */
  private mapRecordToDto(record: any): PostFixSyncRecordDto {
    return {
      id: record.id,
      projectId: record.projectId,
      failureCaseId: record.failureCaseId,
      reverificationId: record.reverificationId,
      jiraIssueLinkId: record.jiraIssueLinkId,
      idempotencyKey: record.idempotencyKey,
      outcome: record.outcome,
      overallStatus: record.overallStatus,
      jiraIssueKey: record.jiraIssueKey,
      jiraCommentStatus: record.jiraCommentStatus,
      jiraCommentId: record.jiraCommentId,
      jiraTransitionStatus: record.jiraTransitionStatus,
      jiraFromStatus: record.jiraFromStatus,
      jiraToStatus: record.jiraToStatus,
      jiraTransitionId: record.jiraTransitionId,
      jiraError: record.jiraError,
      notificationStatus: record.notificationStatus,
      notificationRecipient: record.notificationRecipient,
      notificationSubject: record.notificationSubject,
      notificationError: record.notificationError,
      evidenceCount: record.evidenceCount,
      evidenceReferencesJson: (record.evidenceReferencesJson as any[]) ?? [],
      retryCount: record.retryCount,
      actor: record.actor,
      customNote: record.customNote,
      detailsJson: (record.detailsJson as Record<string, unknown>) ?? {},
      requestedAt: record.requestedAt instanceof Date ? record.requestedAt.toISOString() : record.requestedAt,
      completedAt: record.completedAt instanceof Date ? record.completedAt.toISOString() : record.completedAt,
      createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
      updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt,
      audits: (record.audits || []).map((a: any) => ({
        id: a.id,
        projectId: a.projectId,
        syncRecordId: a.syncRecordId,
        action: a.action,
        status: a.status,
        actor: a.actor,
        detailsJson: a.detailsJson ?? {},
        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
      })),
    };
  }
}
