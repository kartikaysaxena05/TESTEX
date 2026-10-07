/**
 * @file packages/core/src/audit/audit-timeline-assembler.ts
 * Assembles and reconstructs authoritative, chronologically ordered repair audit timelines
 * from relational entities across V7 Phases 89–107.
 */

import type { PrismaClient } from '@prisma/client';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';
import type { RepairAuditActorType, RepairAuditEventType } from './audit-types.js';

export interface UnpersistedAuditEvent {
  readonly eventType: RepairAuditEventType;
  readonly actorType: RepairAuditActorType;
  readonly actorId: string;
  readonly sourceComponent: string;
  readonly timestamp: Date;
  readonly previousState?: string | null;
  readonly newState?: string | null;
  readonly evidenceReferences?: any[];
  readonly repositoryState?: Record<string, any>;
  readonly testRunReferences?: any[];
  readonly jiraReference?: Record<string, any>;
  readonly notificationReference?: Record<string, any>;
  readonly reason?: string | null;
  readonly correlationId: string;
  readonly causationId?: string | null;
  readonly idempotencyKey: string;
  readonly metadata?: Record<string, any>;
}

export class AuditTimelineAssembler {
  /**
   * Reconstructs all lifecycle events from authoritative relational entities for a failure case.
   */
  public static async reconstructLifecycleEvents(params: {
    readonly prisma: PrismaClient;
    readonly projectId: string;
    readonly failureCaseId: string;
    readonly correlationId: string;
  }): Promise<UnpersistedAuditEvent[]> {
    const { prisma, projectId, failureCaseId, correlationId } = params;

    const events: UnpersistedAuditEvent[] = [];

    // 1. Failure Case & Triggering Execution
    const failureCase = await prisma.failureCase.findUnique({
      where: { id: failureCaseId },
      include: {
        execution: {
          include: {
            testRun: true,
            testCase: true,
          },
        },
      },
    });

    if (!failureCase || failureCase.projectId !== projectId) {
      return [];
    }

    events.push({
      eventType: 'FAILURE_CREATED',
      actorType: 'TEST_ENGINE',
      actorId: failureCase.execution?.testRun?.id || 'playwright-runner',
      sourceComponent: 'failure-intelligence',
      timestamp: failureCase.createdAt,
      previousState: 'PASSED',
      newState: failureCase.triggeringExecutionStatus || 'FAILED',
      evidenceReferences: [
        {
          type: 'FAILURE_CASE',
          id: failureCase.id,
          title: failureCase.title,
          summary: failureCase.failureSummary,
        },
      ],
      testRunReferences: failureCase.testRunId
        ? [
            {
              testRunId: failureCase.testRunId,
              executionId: failureCase.executionId,
              testCaseId: failureCase.testCaseId,
              testCaseKey: failureCase.execution?.testCase?.testCaseKey,
            },
          ]
        : [],
      reason: failureCase.failureSummary,
      correlationId,
      causationId: failureCase.executionId || undefined,
      idempotencyKey: `auto:${projectId}:${failureCaseId}:FAILURE_CREATED:${failureCase.id}`,
      metadata: {
        errorCode: failureCase.errorCode,
        status: failureCase.status,
      },
    });

    // 2. Structured Bug Reports
    const bugReports = await prisma.structuredBugReport.findMany({
      where: { projectId, failureCaseId },
      orderBy: { revision: 'asc' },
    });

    for (const br of bugReports) {
      events.push({
        eventType: 'BUG_REPORT_CREATED',
        actorType: 'AI',
        actorId: 'ai-bug-generator',
        sourceComponent: 'bug-report-workspace',
        timestamp: br.createdAt,
        previousState: 'UNREPORTED',
        newState: br.status,
        evidenceReferences: [
          {
            type: 'BUG_REPORT',
            id: br.id,
            title: br.title,
            reportNumber: br.reportNumber,
          },
        ],
        reason: br.summary,
        correlationId,
        causationId: failureCase.id,
        idempotencyKey: `auto:${projectId}:${failureCaseId}:BUG_REPORT_CREATED:${br.id}`,
        metadata: {
          reportNumber: br.reportNumber,
          revision: br.revision,
          status: br.status,
        },
      });
    }

    // 3. Jira Issue Links
    const jiraLinks = await prisma.jiraIssueLink.findMany({
      where: { projectId, failureCaseId },
      orderBy: { createdAt: 'asc' },
    });

    for (const jl of jiraLinks) {
      events.push({
        eventType: 'JIRA_ISSUE_CREATED',
        actorType: 'JIRA_INTEGRATION',
        actorId: 'jira-client',
        sourceComponent: 'jira-integration',
        timestamp: jl.createdAt,
        previousState: 'UNLINKED',
        newState: jl.jiraIssueKey,
        jiraReference: {
          issueKey: jl.jiraIssueKey,
          issueId: jl.jiraIssueId,
          projectKey: jl.jiraProjectKey,
          issueUrl: jl.jiraIssueUrl,
          decision: jl.decision,
        },
        reason: jl.linkReason,
        correlationId,
        causationId: jl.bugReportId || failureCase.id,
        idempotencyKey: `auto:${projectId}:${failureCaseId}:JIRA_ISSUE_LINKED:${jl.id}`,
      });
    }

    // 4. Engineer Ownership Assignments
    const ownerships = await prisma.defectOwnership.findMany({
      where: { projectId, failureCaseId },
      include: { assignedEngineer: true },
      orderBy: { createdAt: 'asc' },
    });

    for (const ow of ownerships) {
      events.push({
        eventType: 'ENGINEER_ASSIGNED',
        actorType:
          ow.assignmentSource === 'JIRA_SYNCHRONIZED'
            ? 'JIRA_INTEGRATION'
            : ow.assignmentSource === 'DETERMINISTIC_RULES'
              ? 'SYSTEM'
              : 'USER',
        actorId: ow.assignedByUserId || 'HUMAN_OPERATOR',
        sourceComponent: 'defect-ownership',
        timestamp: ow.assignedAt || ow.createdAt,
        previousState: 'UNASSIGNED',
        newState: ow.assignedEngineerId,
        reason: ow.assignmentReason,
        correlationId,
        causationId: failureCase.id,
        idempotencyKey: `auto:${projectId}:${failureCaseId}:ENGINEER_ASSIGNED:${ow.id}`,
        metadata: {
          assignedEngineerId: ow.assignedEngineerId,
          assignedEngineerName: ow.assignedEngineer?.displayName || null,
          assignmentSource: ow.assignmentSource,
        },
      });
    }

    // 5. Defect Reverifications & Verification Attempts
    const reverifications = await prisma.defectReverification.findMany({
      where: { projectId, failureCaseId },
      include: {
        verificationAttempts: {
          orderBy: { attemptNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const rev of reverifications) {
      events.push({
        eventType: 'REVERIFICATION_STARTED',
        actorType: 'USER',
        actorId: rev.triggerReference || 'HUMAN_OPERATOR',
        sourceComponent: 'reverification-service',
        timestamp: rev.createdAt,
        previousState: 'PENDING',
        newState: rev.status,
        correlationId,
        causationId: failureCase.id,
        idempotencyKey: `auto:${projectId}:${failureCaseId}:REVERIFICATION_STARTED:${rev.id}`,
        metadata: {
          triggerType: rev.triggerType,
          targetEnvironmentId: rev.targetEnvironmentId,
        },
      });

      if (rev.latestOutcome || rev.status === 'COMPLETED') {
        const lastAttempt = rev.verificationAttempts[rev.verificationAttempts.length - 1];
        events.push({
          eventType: 'REVERIFICATION_COMPLETED',
          actorType: 'TEST_ENGINE',
          actorId: 'playwright-runner',
          sourceComponent: 'reverification-service',
          timestamp: lastAttempt?.completedAt || rev.updatedAt,
          previousState: 'EXECUTING',
          newState: rev.latestOutcome || 'COMPLETED',
          testRunReferences: [
            {
              reverificationId: rev.id,
              outcome: rev.latestOutcome,
              attemptNumber: lastAttempt?.attemptNumber || 1,
              isSignatureMatch: lastAttempt?.isSignatureMatch,
              verificationExecutionId: lastAttempt?.verificationExecutionId,
            },
          ],
          reason: lastAttempt?.blockerReason || undefined,
          correlationId,
          causationId: rev.id,
          idempotencyKey: `auto:${projectId}:${failureCaseId}:REVERIFICATION_COMPLETED:${rev.id}`,
        });
      }
    }

    // 6. Quick-Fix Eligibility Assessments
    const quickFixes = await prisma.quickFixEligibilityAssessment.findMany({
      where: { projectId, failureCaseId },
      orderBy: { createdAt: 'asc' },
    });

    for (const qf of quickFixes) {
      events.push({
        eventType: 'QUICK_FIX_EVALUATED',
        actorType: 'AI',
        actorId: 'ai-quick-fix-rules-engine',
        sourceComponent: 'quick-fix-eligibility',
        timestamp: qf.createdAt,
        previousState: 'UNEVALUATED',
        newState: qf.decision,
        reason: qf.primaryReason,
        correlationId,
        causationId: failureCase.id,
        idempotencyKey: `auto:${projectId}:${failureCaseId}:QUICK_FIX_EVALUATED:${qf.id}`,
        metadata: {
          matchedRules: qf.matchedRules,
          blockingRules: qf.blockingRules,
        },
      });

      if (qf.decision === 'ELIGIBLE') {
        events.push({
          eventType: 'QUICK_FIX_APPROVED_FOR_GENERATION',
          actorType: 'AI',
          actorId: 'ai-quick-fix-engine',
          sourceComponent: 'quick-fix-eligibility',
          timestamp: new Date(qf.createdAt.getTime() + 1),
          previousState: 'ELIGIBLE',
          newState: 'READY_FOR_PATCH',
          reason: 'Quick-fix assessment verified all safety bounds satisfied.',
          correlationId,
          causationId: qf.id,
          idempotencyKey: `auto:${projectId}:${failureCaseId}:QUICK_FIX_APPROVED_FOR_GENERATION:${qf.id}`,
        });
      }
    }

    // 7. Defect Localizations
    const localizations = await prisma.repositoryDefectLocalization.findMany({
      where: { projectId, failureCaseId },
      orderBy: { createdAt: 'asc' },
    });

    for (const loc of localizations) {
      events.push({
        eventType: 'DEFECT_LOCALIZED',
        actorType: 'AI',
        actorId: 'ai-defect-localizer',
        sourceComponent: 'defect-localization',
        timestamp: loc.createdAt,
        previousState: 'UNLOCALIZED',
        newState: loc.topCandidateFilePath || 'LOCALIZED',
        repositoryState: {
          repositoryRevision: loc.repositoryRevision,
          topCandidateFilePath: loc.topCandidateFilePath,
          topCandidateSymbolName: loc.topCandidateSymbolName,
          topCandidateScore: loc.topCandidateScore,
        },
        reason: `Localized defect to ${loc.topCandidateFilePath || 'candidate files'}`,
        correlationId,
        causationId: loc.quickFixAssessmentId || failureCase.id,
        idempotencyKey: `auto:${projectId}:${failureCaseId}:DEFECT_LOCALIZED:${loc.id}`,
      });
    }

    // 8. Patch Proposals
    const patches = await prisma.defectPatchProposal.findMany({
      where: { projectId, failureCaseId },
      orderBy: { createdAt: 'asc' },
    });

    for (const patch of patches) {
      events.push({
        eventType: 'PATCH_PROPOSED',
        actorType: 'AI',
        actorId: patch.modelName || 'ai-patch-generator',
        sourceComponent: 'patch-proposal-service',
        timestamp: patch.createdAt,
        previousState: 'UNPATCHED',
        newState: patch.status,
        repositoryState: {
          baseRevision: patch.repositoryRevision,
          patchHash: patch.patchFingerprint,
          targetFiles: patch.targetFiles,
          filesChangedCount: patch.filesChangedCount,
          linesAddedCount: patch.linesAddedCount,
          linesRemovedCount: patch.linesRemovedCount,
          unifiedDiff: patch.unifiedDiff,
        },
        reason: patch.rationale,
        correlationId,
        causationId: patch.defectLocalizationId || failureCase.id,
        idempotencyKey: `auto:${projectId}:${failureCaseId}:PATCH_PROPOSED:${patch.id}`,
        metadata: {
          riskLevel: patch.riskLevel,
          modelProvider: patch.modelProvider,
          expectedBehaviorChange: patch.expectedBehaviorChange,
        },
      });
    }

    // 9. Patch Validations
    const validations = await prisma.defectPatchValidation.findMany({
      where: { projectId, failureCaseId },
      orderBy: { createdAt: 'asc' },
    });

    for (const val of validations) {
      events.push({
        eventType: 'PATCH_VALIDATION_STARTED',
        actorType: 'TEST_ENGINE',
        actorId: val.executedBy || 'patch-validator',
        sourceComponent: 'patch-validation-service',
        timestamp: val.startedAt || val.createdAt,
        previousState: 'PENDING',
        newState: 'VALIDATING',
        repositoryState: {
          baseRevision: val.baseRevision,
          patchHash: val.patchHash,
        },
        correlationId,
        causationId: val.patchProposalId,
        idempotencyKey: `auto:${projectId}:${failureCaseId}:PATCH_VALIDATION_STARTED:${val.id}`,
      });

      if (val.validationOutcome) {
        events.push({
          eventType: 'PATCH_VALIDATION_COMPLETED',
          actorType: 'TEST_ENGINE',
          actorId: val.executedBy || 'patch-validator',
          sourceComponent: 'patch-validation-service',
          timestamp: val.completedAt || val.updatedAt,
          previousState: 'VALIDATING',
          newState: val.validationOutcome,
          testRunReferences: [
            {
              validationId: val.id,
              targetFailureFixed: val.targetFailureFixed,
              regressionDetected: val.regressionDetected,
              targetedRegressionPassed: val.targetedRegressionPassed,
              targetedRegressionFailed: val.targetedRegressionFailed,
            },
          ],
          reason: val.validationReason,
          correlationId,
          causationId: val.id,
          idempotencyKey: `auto:${projectId}:${failureCaseId}:PATCH_VALIDATION_COMPLETED:${val.id}`,
        });
      }
    }

    // 10. Human Approvals & Rejections
    const approvals = await prisma.defectPatchApproval.findMany({
      where: { projectId, failureCaseId },
      orderBy: { createdAt: 'asc' },
    });

    for (const app of approvals) {
      if (app.status === 'APPROVED') {
        events.push({
          eventType: 'PATCH_APPROVED',
          actorType: 'USER',
          actorId: app.reviewedBy || 'HUMAN_REVIEWER',
          sourceComponent: 'patch-approval-service',
          timestamp: app.reviewedAt || app.createdAt,
          previousState: 'PENDING_REVIEW',
          newState: 'APPROVED',
          repositoryState: {
            baseRevision: app.baseRevision,
            reviewedPatchHash: app.reviewedPatchHash,
          },
          reason: app.reviewComment,
          correlationId,
          causationId: app.validationId,
          idempotencyKey: `auto:${projectId}:${failureCaseId}:PATCH_APPROVED:${app.id}`,
        });
      } else if (app.status === 'REJECTED') {
        events.push({
          eventType: 'PATCH_REJECTED',
          actorType: 'USER',
          actorId: app.reviewedBy || 'HUMAN_REVIEWER',
          sourceComponent: 'patch-approval-service',
          timestamp: app.reviewedAt || app.createdAt,
          previousState: 'PENDING_REVIEW',
          newState: 'REJECTED',
          repositoryState: {
            baseRevision: app.baseRevision,
            reviewedPatchHash: app.reviewedPatchHash,
          },
          reason: app.rejectionDetails || app.reviewComment,
          correlationId,
          causationId: app.validationId,
          idempotencyKey: `auto:${projectId}:${failureCaseId}:PATCH_REJECTED:${app.id}`,
          metadata: {
            rejectionReason: app.rejectionReason,
          },
        });
      }

      if (app.status === 'APPLIED' || app.appliedAt) {
        events.push({
          eventType: 'PATCH_APPLIED',
          actorType: 'REPAIR_ENGINE',
          actorId: app.appliedBy || 'patch-applicator',
          sourceComponent: 'patch-approval-service',
          timestamp: app.appliedAt || app.updatedAt,
          previousState: 'APPROVED',
          newState: 'APPLIED',
          repositoryState: {
            baseRevision: app.baseRevision,
            appliedRevision: app.appliedRevision || undefined,
            appliedPatchHash: app.appliedPatchHash || undefined,
            affectedFiles: app.affectedFiles,
            appliedUnifiedDiff: app.appliedUnifiedDiff || undefined,
          },
          correlationId,
          causationId: app.id,
          idempotencyKey: `auto:${projectId}:${failureCaseId}:PATCH_APPLIED:${app.id}`,
        });
      } else if (app.status === 'APPLY_FAILED') {
        events.push({
          eventType: 'PATCH_APPLY_FAILED',
          actorType: 'REPAIR_ENGINE',
          actorId: app.appliedBy || 'patch-applicator',
          sourceComponent: 'patch-approval-service',
          timestamp: app.updatedAt,
          previousState: 'APPROVED',
          newState: 'APPLY_FAILED',
          reason: app.applyError,
          correlationId,
          causationId: app.id,
          idempotencyKey: `auto:${projectId}:${failureCaseId}:PATCH_APPLY_FAILED:${app.id}`,
        });
      }
    }

    // 11. Rollbacks
    const rollbacks = await prisma.defectPatchRollback.findMany({
      where: { projectId, failureCaseId },
      orderBy: { createdAt: 'asc' },
    });

    for (const rb of rollbacks) {
      events.push({
        eventType: 'ROLLBACK_STARTED',
        actorType: 'USER',
        actorId: rb.rollbackRequestedBy || 'HUMAN_OPERATOR',
        sourceComponent: 'patch-rollback-service',
        timestamp: rb.startedAt || rb.createdAt,
        previousState: 'APPLIED',
        newState: 'ROLLING_BACK',
        reason: rb.rollbackReason,
        correlationId,
        causationId: rb.patchApprovalId,
        idempotencyKey: `auto:${projectId}:${failureCaseId}:ROLLBACK_STARTED:${rb.id}`,
      });

      if (rb.status === 'COMPLETED') {
        events.push({
          eventType: 'ROLLBACK_COMPLETED',
          actorType: 'REPAIR_ENGINE',
          actorId: 'rollback-engine',
          sourceComponent: 'patch-rollback-service',
          timestamp: rb.completedAt || rb.updatedAt,
          previousState: 'ROLLING_BACK',
          newState: 'ROLLED_BACK',
          repositoryState: {
            targetFiles: rb.targetFiles,
            restoredFiles: rb.restoredFiles,
            reverseDiff: rb.reverseDiff || undefined,
          },
          testRunReferences: rb.postRollbackTestRunId
            ? [
                {
                  postRollbackTestRunId: rb.postRollbackTestRunId,
                  postRollbackTestPassed: rb.postRollbackTestPassed,
                  originalFailureReoccurred: rb.originalFailureReoccurred,
                },
              ]
            : [],
          reason: 'Patch was cleanly reverted; baseline repository restored.',
          correlationId,
          causationId: rb.id,
          idempotencyKey: `auto:${projectId}:${failureCaseId}:ROLLBACK_COMPLETED:${rb.id}`,
        });
      }
    }

    // 12. Change-Impact & Retest Plans (Phase 106)
    const retestPlans = await prisma.retestPlan.findMany({
      where: { projectId },
      include: {
        changeSnapshot: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const plan of retestPlans) {
      events.push({
        eventType: 'CHANGE_IMPACT_ANALYZED',
        actorType: 'SYSTEM',
        actorId: 'impact-dimension-analyzer',
        sourceComponent: 'retest-service',
        timestamp: plan.createdAt,
        previousState: 'RAW_CHANGESET',
        newState: 'IMPACT_ANALYZED',
        repositoryState: {
          baseRevision: plan.baseRevision || undefined,
          targetRevision: plan.targetRevision || undefined,
          changedFiles: plan.changeSnapshot?.changedFiles || [],
        },
        reason: plan.fullRegressionReason || undefined,
        correlationId,
        causationId: plan.changeSnapshotId,
        idempotencyKey: `auto:${projectId}:${failureCaseId}:CHANGE_IMPACT_ANALYZED:${plan.id}`,
        metadata: {
          totalTestsCount: plan.totalTestsCount,
          mandatoryCount: plan.mandatoryCount,
          recommendedCount: plan.recommendedCount,
        },
      });

      events.push({
        eventType: 'REGRESSION_SELECTION_CREATED',
        actorType: 'SYSTEM',
        actorId: 'intelligent-retest-selector',
        sourceComponent: 'retest-service',
        timestamp: new Date(plan.createdAt.getTime() + 1),
        previousState: 'IMPACT_ANALYZED',
        newState: 'TEST_SUITE_SELECTED',
        testRunReferences: [
          {
            planId: plan.id,
            mandatoryCount: plan.mandatoryCount,
            recommendedCount: plan.recommendedCount,
            optionalCount: plan.optionalCount,
          },
        ],
        correlationId,
        causationId: plan.id,
        idempotencyKey: `auto:${projectId}:${failureCaseId}:REGRESSION_SELECTION_CREATED:${plan.id}`,
      });
    }

    // 13. Post-Fix Jira & Notification Updates (Phase 107)
    const postFixRecords = await prisma.postFixSyncRecord.findMany({
      where: { projectId, failureCaseId },
      orderBy: { createdAt: 'asc' },
    });

    for (const sync of postFixRecords) {
      events.push({
        eventType: 'POST_FIX_STATUS_UPDATED',
        actorType: 'JIRA_INTEGRATION',
        actorId: sync.actor || 'SYSTEM',
        sourceComponent: 'post-fix-sync',
        timestamp: sync.requestedAt || sync.createdAt,
        previousState: 'UNSYNCHRONIZED',
        newState: sync.outcome,
        jiraReference: {
          jiraIssueKey: sync.jiraIssueKey,
          commentStatus: sync.jiraCommentStatus,
          transitionStatus: sync.jiraTransitionStatus,
          jiraToStatus: sync.jiraToStatus,
        },
        reason: sync.customNote,
        correlationId,
        causationId: sync.reverificationId,
        idempotencyKey: `auto:${projectId}:${failureCaseId}:POST_FIX_STATUS_UPDATED:${sync.id}`,
      });

      if (sync.notificationStatus === 'SENT') {
        events.push({
          eventType: 'NOTIFICATION_SENT',
          actorType: 'NOTIFICATION_SERVICE',
          actorId: 'notification-service',
          sourceComponent: 'post-fix-sync',
          timestamp: sync.completedAt || sync.createdAt,
          previousState: 'PENDING',
          newState: 'DELIVERED',
          notificationReference: {
            recipient: sync.notificationRecipient,
            subject: sync.notificationSubject,
            status: sync.notificationStatus,
          },
          correlationId,
          causationId: sync.id,
          idempotencyKey: `auto:${projectId}:${failureCaseId}:NOTIFICATION_SENT:${sync.id}`,
        });
      }

      if (sync.overallStatus === 'SUCCESS') {
        events.push({
          eventType: 'REPAIR_SESSION_COMPLETED',
          actorType: 'SYSTEM',
          actorId: 'repair-coordinator',
          sourceComponent: 'post-fix-sync',
          timestamp: sync.completedAt || sync.createdAt,
          previousState: 'ACTIVE',
          newState: 'COMPLETED',
          reason: `Repair session completed with outcome: ${sync.outcome}`,
          correlationId,
          causationId: sync.id,
          idempotencyKey: `auto:${projectId}:${failureCaseId}:REPAIR_SESSION_COMPLETED:${sync.id}`,
        });
      }
    }

    // Sort deterministically by timestamp ascending
    const toValidDate = (d: any): Date => {
      if (d instanceof Date && !isNaN(d.getTime())) return d;
      if (d) {
        const parsed = new Date(d);
        if (!isNaN(parsed.getTime())) return parsed;
      }
      return new Date();
    };

    events.sort((a, b) => toValidDate(a.timestamp).getTime() - toValidDate(b.timestamp).getTime());

    // Sanitize any secret strings across all reconstructed events
    return events.map(ev => ({
      ...ev,
      timestamp: toValidDate(ev.timestamp),
      actorId: SecretRedactor.redactText(ev.actorId),
      reason: ev.reason ? SecretRedactor.redactText(ev.reason) : ev.reason,
    }));
  }
}
