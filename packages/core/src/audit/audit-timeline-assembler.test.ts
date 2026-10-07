/**
 * @file packages/core/src/audit/audit-timeline-assembler.test.ts
 * Historical entity reconstruction tests for V7 Phase 108 Repair Audit Trail.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuditTimelineAssembler } from './audit-timeline-assembler.js';

describe('AuditTimelineAssembler', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const otherProjectId = '99999999-9999-9999-9999-999999999999';
  const failureCaseId = '22222222-2222-2222-2222-222222222222';
  const correlationId = '33333333-3333-3333-3333-333333333333';

  it('returns empty array if failure case is not found or belongs to different project', async () => {
    const mockPrisma: any = {
      failureCase: {
        findUnique: async () => null,
      },
    };

    const events = await AuditTimelineAssembler.reconstructLifecycleEvents({
      prisma: mockPrisma,
      projectId,
      failureCaseId,
      correlationId,
    });

    assert.equal(events.length, 0);

    const mismatchPrisma: any = {
      failureCase: {
        findUnique: async () => ({
          id: failureCaseId,
          projectId: otherProjectId,
        }),
      },
    };

    const mismatchEvents = await AuditTimelineAssembler.reconstructLifecycleEvents({
      prisma: mismatchPrisma,
      projectId,
      failureCaseId,
      correlationId,
    });

    assert.equal(mismatchEvents.length, 0);
  });

  it('reconstructs events across multiple phases with proper attribution and idempotency keys', async () => {
    const t0 = new Date('2026-09-12T10:00:00Z');
    const t1 = new Date('2026-09-12T10:05:00Z');
    const t2 = new Date('2026-09-12T10:10:00Z');
    const t3 = new Date('2026-09-12T10:15:00Z');
    const t4 = new Date('2026-09-12T10:20:00Z');
    const t5 = new Date('2026-09-12T10:25:00Z');
    const t6 = new Date('2026-09-12T10:30:00Z');

    const mockPrisma: any = {
      failureCase: {
        findUnique: async () => ({
          id: failureCaseId,
          projectId,
          title: 'Checkout payment gateway failure',
          failureSummary: 'Timeout during token exchange',
          triggeringExecutionStatus: 'FAILED',
          errorCode: 'ERR_PAYMENT_TIMEOUT',
          createdAt: t0,
          executionId: 'exec-1',
          testCaseId: 'tc-1',
          testRunId: 'tr-1',
          execution: {
            testRun: { id: 'tr-1' },
            testCase: { testCaseKey: 'TC-PAY-01' },
          },
        }),
      },
      structuredBugReport: {
        findMany: async () => [
          {
            id: 'bug-1',
            projectId,
            failureCaseId,
            reportNumber: 'BUG-100',
            title: 'Payment gateway timeout bug',
            summary: 'Token exchange fails after 30s',
            status: 'READY',
            createdAt: t1,
          },
        ],
      },
      jiraIssueLink: {
        findMany: async () => [
          {
            id: 'jira-1',
            projectId,
            failureCaseId,
            bugReportId: 'bug-1',
            jiraIssueKey: 'PROJ-101',
            jiraIssueId: '10001',
            jiraProjectKey: 'PROJ',
            jiraIssueUrl: 'https://jira.corp/browse/PROJ-101',
            decision: 'USE_EXISTING',
            linkReason: 'Linked bug report to existing issue PROJ-101',
            createdAt: t2,
          },
        ],
      },
      defectOwnership: {
        findMany: async () => [
          {
            id: 'owner-1',
            projectId,
            failureCaseId,
            assignedEngineerId: 'eng-1',
            assignmentSource: 'MANUAL',
            assignedByUserId: 'tech-lead@corp.com',
            assignmentReason: 'Assigned to billing domain expert',
            assignedAt: t3,
            createdAt: t3,
            assignedEngineer: {
              id: 'eng-1',
              displayName: 'Alice Engineer',
            },
          },
        ],
      },
      defectReverification: {
        findMany: async () => [
          {
            id: 'reverif-1',
            projectId,
            failureCaseId,
            status: 'COMPLETED',
            startedAt: t4,
            completedAt: t5,
            verificationAttempts: [
              {
                id: 'attempt-1',
                attemptNumber: 1,
                outcome: 'FAILED_REPRODUCED',
                createdAt: t4,
                executedAt: t4,
              },
            ],
          },
        ],
      },
      quickFixEligibilityAssessment: {
        findMany: async () => [
          {
            id: 'qf-1',
            projectId,
            failureCaseId,
            isEligible: true,
            ruleEvaluationsJson: [],
            reasoningSummary: 'Eligible for localized patch',
            createdAt: t5,
          },
        ],
      },
      repositoryDefectLocalization: {
        findMany: async () => [
          {
            id: 'loc-1',
            projectId,
            failureCaseId,
            topCandidatePath: 'src/payment/gateway.ts',
            confidenceScore: 0.92,
            createdAt: t5,
          },
        ],
      },
      defectPatchProposal: {
        findMany: async () => [
          {
            id: 'patch-1',
            projectId,
            failureCaseId,
            proposalState: 'APPROVED',
            targetBranch: 'main',
            createdAt: t5,
          },
        ],
      },
      defectPatchValidation: {
        findMany: async () => [
          {
            id: 'val-1',
            patchProposalId: 'patch-1',
            overallStatus: 'PASSED',
            startedAt: t5,
            completedAt: t5,
          },
        ],
      },
      defectPatchApproval: {
        findMany: async () => [
          {
            id: 'appr-1',
            patchProposalId: 'patch-1',
            status: 'APPROVED',
            reviewedBy: 'lead-dev@corp.com',
            reviewComment: 'Looks clean and safe',
            reviewedAt: t6,
            createdAt: t6,
          },
        ],
      },
      defectPatchRollback: {
        findMany: async () => [],
      },
      retestPlan: {
        findMany: async () => [],
      },
      postFixSyncRecord: {
        findMany: async () => [],
      },
    };

    const events = await AuditTimelineAssembler.reconstructLifecycleEvents({
      prisma: mockPrisma,
      projectId,
      failureCaseId,
      correlationId,
    });

    assert.ok(events.length >= 6);

    // 1. Failure creation: attributed to TEST_ENGINE
    const failureEvent = events.find(e => e.eventType === 'FAILURE_CREATED');
    assert.ok(failureEvent);
    assert.equal(failureEvent?.actorType, 'TEST_ENGINE');
    assert.ok(failureEvent?.idempotencyKey.includes('FAILURE_CREATED'));

    // 2. Bug report: attributed to AI
    const bugEvent = events.find(e => e.eventType === 'BUG_REPORT_CREATED');
    assert.ok(bugEvent);
    assert.equal(bugEvent?.actorType, 'AI');

    // 3. Jira link: attributed to JIRA_INTEGRATION
    const jiraEvent = events.find(e => e.eventType === 'JIRA_ISSUE_CREATED');
    assert.ok(jiraEvent);
    assert.equal(jiraEvent?.actorType, 'JIRA_INTEGRATION');

    // 4. Engineer ownership: attributed to USER
    const ownerEvent = events.find(e => e.eventType === 'ENGINEER_ASSIGNED');
    assert.ok(ownerEvent);
    assert.equal(ownerEvent?.actorType, 'USER');
    assert.equal(ownerEvent?.actorId, 'tech-lead@corp.com');

    // 5. Human approval: attributed strictly to USER
    const approvalEvent = events.find(e => e.eventType === 'PATCH_APPROVED');
    assert.ok(approvalEvent);
    assert.equal(approvalEvent?.actorType, 'USER');
    assert.equal(approvalEvent?.actorId, 'lead-dev@corp.com');

    // Chronological order verification
    for (let i = 1; i < events.length; i++) {
      assert.ok(
        events[i]!.timestamp.getTime() >= events[i - 1]!.timestamp.getTime(),
        `Event at index ${i} should be >= preceding event timestamp`,
      );
    }
  });
});
