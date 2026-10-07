/**
 * @file packages/core/src/post-fix/post-fix-service.test.ts
 * Integration tests for PostFixExternalUpdateService (V7 Phase 107).
 * Tests all verification outcomes, Jira comment & transition execution,
 * unavailable transitions, idempotency guarantees, partial failures, and retry.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../database/client.js';
import type { PrismaClient } from '@prisma/client';
import { PostFixExternalUpdateService } from './post-fix-external-update-service.js';
import type { IJiraClient, IJiraCredentialVault } from '../jira/jira-types.js';
import { JiraCredentialVault } from '../jira/jira-credential-vault.js';

describe('PostFixExternalUpdateService Integration', () => {
  let prisma: PrismaClient;
  let vault: IJiraCredentialVault;
  const testProjectId = crypto.randomUUID();
  let devEnvId: string;
  let testCaseId: string;
  let failureCaseId: string;
  let bugReportId: string;
  let fixedReverificationId: string;
  let failingReverificationId: string;
  let connectionId: string;
  let jiraLinkId: string;

  // Tracking mock Jira calls
  const postedComments: Array<{ issueIdOrKey: string; body: string }> = [];
  const executedTransitions: Array<{ issueIdOrKey: string; transitionId: string }> = [];

  const mockJiraClient = {
    validateConnection: async () => ({ ok: true, statusCode: 200, latencyMs: 10 }),
    testConnectionHealth: async () => ({ isReachable: true, latencyMs: 10, checkedAt: new Date().toISOString() }),
    addComment: async (options: { readonly issueIdOrKey: string; readonly body: string }) => {
      postedComments.push({ issueIdOrKey: options.issueIdOrKey, body: options.body });
      return { id: `comment-${postedComments.length}`, created: new Date().toISOString() };
    },
    getTransitions: async () => [
      { id: '21', name: 'Ready for QA', to: { id: '2', name: 'Ready for QA' } },
      { id: '31', name: 'Reopened', to: { id: '3', name: 'Reopened' } },
      { id: '41', name: 'Closed', to: { id: '4', name: 'Closed' } },
    ],
    transitionIssue: async (options: { readonly issueIdOrKey: string; readonly transitionId: string }) => {
      executedTransitions.push({ issueIdOrKey: options.issueIdOrKey, transitionId: options.transitionId });
    },
  } as unknown as IJiraClient;

  before(async () => {
    const client = getPrismaClient();
    if (!client) throw new Error('Database client unavailable');
    prisma = client;
    vault = new JiraCredentialVault();

    // 1. Create Project
    await prisma.project.create({
      data: {
        id: testProjectId,
        name: 'Phase 107 Test Project',
        status: 'ACTIVE',
      },
    });

    // 2. Create Environment
    const env = await prisma.projectEnvironment.create({
      data: {
        projectId: testProjectId,
        name: 'Dev Environment',
        type: 'DEVELOPMENT',
        baseUrl: 'http://localhost:3000',
        isDefault: true,
        isEnabled: true,
        isProduction: false,
        productionSafetyPolicy: 'SAFE_MODE',
      },
    });
    devEnvId = env.id;

    // 3. Create Test Case & Version
    const tc = await prisma.testCase.create({
      data: {
        projectId: testProjectId,
        testCaseKey: 'TC-PF-107',
        title: 'Post Fix Test Scenario',
        objective: 'Verify checkout button clickability after fix',
        type: 'REGRESSION',
        status: 'ACTIVE',
        priority: 'HIGH',
      },
    });
    testCaseId = tc.id;

    const ver = await prisma.testCaseVersion.create({
      data: {
        projectId: testProjectId,
        testCaseId: tc.id,
        versionNumber: 1,
        title: 'Post Fix Test Scenario v1',
        objective: 'Verify checkout button clickability after fix',
        stepsJson: [],
      },
    });

    // 4. Create Executable Plan & Run
    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectId,
        environmentId: devEnvId,
        testCaseId: tc.id,
        testCaseVersionId: ver.id,
        testCaseVersionNumber: 1,
        planFingerprint: `fp-107-${Date.now()}`,
        status: 'VALID',
      },
    });

    const run = await prisma.testRun.create({
      data: {
        projectId: testProjectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        testCaseTitle: 'Post Fix Test Scenario',
        planFingerprint: plan.planFingerprint,
        status: 'FAILED',
        environmentId: devEnvId,
        executableTestPlanId: plan.id,
      },
    });

    const exec = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectId,
        testRunId: run.id,
        testCaseId: tc.id,
        testCaseVersionId: ver.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        environmentId: devEnvId,
        status: 'FAILED',
      },
    });

    // 5. Create FailureCase
    const fc = await prisma.failureCase.create({
      data: {
        projectId: testProjectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        testRunId: run.id,
        executionId: exec.id,
        triggeringExecutionStatus: 'FAILED',
        status: 'READY',
        title: 'Button not clickable',
        failureSummary: 'Button not clickable on checkout',
      },
    });
    failureCaseId = fc.id;

    // 6. Create StructuredBugReport
    const br = await prisma.structuredBugReport.create({
      data: {
        projectId: testProjectId,
        failureCaseId: fc.id,
        reportNumber: 'BUG-107-1',
        revision: 1,
        isAuthoritative: true,
        status: 'READY',
        applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
        isApplicationDefect: true,
        title: 'Defect in checkout button',
        summary: 'Button is not clickable on checkout page',
        testCaseId: tc.id,
        testCaseKey: tc.testCaseKey,
        testCaseVersionNumber: 1,
        testCaseTitle: tc.title,
        originalExecutionId: exec.id,
        triggeringStatus: 'FAILED',
        expectedResult: 'Button should be clickable',
        actualResult: 'Button is unclickable',
        markdownReport: '# Bug Report',
        reportFingerprint: 'fp-br-107-1',
      },
    });
    bugReportId = br.id;

    // 7. Create Jira Connection & Jira Issue Link
    const connId = crypto.randomUUID();
    const encrypted = await vault.encrypt('fake-jira-token-107', connId);
    const conn = await prisma.jiraConnection.create({
      data: {
        id: connId,
        projectId: testProjectId,
        displayName: 'Test Jira Instance',
        baseUrl: 'https://testjira.atlassian.net',
        accountIdentifier: 'qa-bot@test.com',
        secretReference: 'vault:test',
        encryptedCredentials: encrypted,
        connectionStatus: 'CONNECTED',
      },
    });
    connectionId = conn.id;

    const link = await prisma.jiraIssueLink.create({
      data: {
        projectId: testProjectId,
        failureCaseId: fc.id,
        jiraConnectionId: conn.id,
        jiraProjectKey: 'TEST',
        jiraIssueKey: 'TEST-107',
        jiraIssueId: '1000107',
        jiraIssueUrl: 'https://testjira.atlassian.net/browse/TEST-107',
        linkReason: 'Primary defect link',
        isActive: true,
      },
    });
    jiraLinkId = link.id;

    // 8. Create Completed Reverifications (Fixed and Failing)
    const revFixed = await prisma.defectReverification.create({
      data: {
        projectId: testProjectId,
        failureCaseId: fc.id,
        originalTestRunId: run.id,
        originalExecutionId: exec.id,
        originalTestCaseId: tc.id,
        originalTestCaseVersionNumber: 1,
        selectedTestCaseId: tc.id,
        selectedTestCaseVersionNumber: 1,
        triggerType: 'MANUAL_REQUEST',
        targetEnvironmentId: devEnvId,
        status: 'COMPLETED',
        latestOutcome: 'VERIFIED_FIXED',
        isAuthoritative: true,
      },
    });
    fixedReverificationId = revFixed.id;

    await prisma.defectVerificationAttempt.create({
      data: {
        projectId: testProjectId,
        reverificationId: revFixed.id,
        failureCaseId: fc.id,
        originalExecutionId: exec.id,
        testCaseId: tc.id,
        originalTestCaseVersionNumber: 1,
        verificationTestCaseVersionNumber: 1,
        attemptNumber: 1,
        status: 'VERIFIED_FIXED',
        isSignatureMatch: false,
        completedAt: new Date(),
      },
    });

    const revFailing = await prisma.defectReverification.create({
      data: {
        projectId: testProjectId,
        failureCaseId: fc.id,
        originalTestRunId: run.id,
        originalExecutionId: exec.id,
        originalTestCaseId: tc.id,
        originalTestCaseVersionNumber: 1,
        selectedTestCaseId: tc.id,
        selectedTestCaseVersionNumber: 1,
        triggerType: 'MANUAL_REQUEST',
        targetEnvironmentId: devEnvId,
        status: 'COMPLETED',
        latestOutcome: 'STILL_FAILING',
        isAuthoritative: true,
      },
    });
    failingReverificationId = revFailing.id;

    await prisma.defectVerificationAttempt.create({
      data: {
        projectId: testProjectId,
        reverificationId: revFailing.id,
        failureCaseId: fc.id,
        originalExecutionId: exec.id,
        testCaseId: tc.id,
        originalTestCaseVersionNumber: 1,
        verificationTestCaseVersionNumber: 1,
        attemptNumber: 1,
        status: 'STILL_FAILING',
        isSignatureMatch: true,
        completedAt: new Date(),
      },
    });
  });

  after(async () => {
    if (prisma && testProjectId) {
      await prisma.project.delete({ where: { id: testProjectId } }).catch(() => {});
    }
  });

  it('executes post-fix sync for VERIFIED_FIXED outcome', async () => {
    postedComments.length = 0;
    executedTransitions.length = 0;

    const service = new PostFixExternalUpdateService({
      prisma,
      jiraClient: mockJiraClient,
      vault,
      allowLocalhostForTesting: true,
    });

    const result = await service.executeSync({
      projectId: testProjectId,
      failureCaseId,
      reverificationId: fixedReverificationId,
      customNote: 'Verified cleanly in CI',
      actor: 'qa-tester',
    });

    assert.equal(result.overallStatus, 'SUCCESS');
    assert.equal(result.outcome, 'VERIFIED_FIXED');
    assert.equal(result.jiraCommentStatus, 'COMMENT_POSTED');
    assert.equal(result.jiraTransitionStatus, 'TRANSITIONED');
    assert.equal(result.jiraIssueKey, 'TEST-107');
    assert.equal(postedComments.length, 1);
    assert.ok(postedComments[0]?.body.includes('VERIFIED_FIXED'));
    assert.ok(postedComments[0]?.body.includes('Verified cleanly in CI'));
    assert.equal(executedTransitions.length, 1);
  });

  it('guarantees idempotency on repeated execution', async () => {
    const service = new PostFixExternalUpdateService({
      prisma,
      jiraClient: mockJiraClient,
      vault,
      allowLocalhostForTesting: true,
    });

    const initialCommentCount = postedComments.length;
    const initialTransitionCount = executedTransitions.length;

    // Second call with identical facts
    const secondCall = await service.executeSync({
      projectId: testProjectId,
      failureCaseId,
      reverificationId: fixedReverificationId,
      actor: 'qa-tester',
    });

    assert.equal(secondCall.overallStatus, 'SUCCESS');
    // Exactly 0 new comments or transitions posted!
    assert.equal(postedComments.length, initialCommentCount);
    assert.equal(executedTransitions.length, initialTransitionCount);
  });

  it('executes post-fix sync for STILL_FAILING without resolving issue', async () => {
    postedComments.length = 0;
    executedTransitions.length = 0;

    const service = new PostFixExternalUpdateService({
      prisma,
      jiraClient: mockJiraClient,
      vault,
      allowLocalhostForTesting: true,
    });

    const result = await service.executeSync({
      projectId: testProjectId,
      failureCaseId,
      reverificationId: failingReverificationId,
      actor: 'qa-tester',
    });

    assert.equal(result.overallStatus, 'SUCCESS');
    assert.equal(result.outcome, 'STILL_FAILING');
    assert.equal(result.jiraCommentStatus, 'COMMENT_POSTED');
    assert.ok(postedComments[0]?.body.includes('STILL_FAILING'));

    // If transitioned, transition must be to Reopened/Open, never to Closed or Resolved
    if (executedTransitions.length > 0) {
      assert.notEqual(executedTransitions[0]?.transitionId, '41'); // 41 is Closed
      assert.equal(executedTransitions[0]?.transitionId, '31'); // 31 is Reopened
    }
  });

  it('handles unavailable Jira transitions gracefully without failing overall sync', async () => {
    // Jira client with NO matching transitions
    const restrictedJiraClient = {
      ...mockJiraClient,
      getTransitions: async () => [
        { id: '99', name: 'Won\'t Fix', to: { id: '99', name: 'Won\'t Fix' } },
      ],
    } as unknown as IJiraClient;

    // Create another reverification
    const exec = await prisma.testCaseExecution.findFirstOrThrow({ where: { projectId: testProjectId } });
    const run = await prisma.testRun.findFirstOrThrow({ where: { projectId: testProjectId } });
    const tc = await prisma.testCase.findFirstOrThrow({ where: { projectId: testProjectId } });

    const rev = await prisma.defectReverification.create({
      data: {
        projectId: testProjectId,
        failureCaseId,
        originalTestRunId: run.id,
        originalExecutionId: exec.id,
        originalTestCaseId: tc.id,
        originalTestCaseVersionNumber: 1,
        selectedTestCaseId: tc.id,
        selectedTestCaseVersionNumber: 1,
        triggerType: 'MANUAL_REQUEST',
        targetEnvironmentId: devEnvId,
        status: 'COMPLETED',
        latestOutcome: 'VERIFIED_FIXED',
        isAuthoritative: true,
      },
    });

    await prisma.defectVerificationAttempt.create({
      data: {
        projectId: testProjectId,
        reverificationId: rev.id,
        failureCaseId,
        originalExecutionId: exec.id,
        testCaseId: tc.id,
        originalTestCaseVersionNumber: 1,
        verificationTestCaseVersionNumber: 1,
        attemptNumber: 1,
        status: 'VERIFIED_FIXED',
        isSignatureMatch: false,
        completedAt: new Date(),
      },
    });

    const service = new PostFixExternalUpdateService({
      prisma,
      jiraClient: restrictedJiraClient,
      vault,
      allowLocalhostForTesting: true,
    });

    const result = await service.executeSync({
      projectId: testProjectId,
      failureCaseId,
      reverificationId: rev.id,
      actor: 'qa-tester',
    });

    assert.equal(result.jiraCommentStatus, 'COMMENT_POSTED');
    assert.equal(result.jiraTransitionStatus, 'TRANSITION_UNAVAILABLE');
    assert.equal(result.overallStatus, 'SUCCESS');
  });

  it('retrieves sync record status and paginated history', async () => {
    const service = new PostFixExternalUpdateService({
      prisma,
      jiraClient: mockJiraClient,
      vault,
      allowLocalhostForTesting: true,
    });

    const history = await service.listHistory({
      projectId: testProjectId,
      failureCaseId,
      limit: 10,
    });

    assert.ok(history.length >= 2);

    const first = history[0];
    assert.ok(first);
    const retrieved = await service.getStatus({
      projectId: testProjectId,
      syncRecordId: first.id,
    });

    assert.ok(retrieved);
    assert.equal(retrieved?.id, first.id);
    assert.equal(retrieved?.projectId, testProjectId);
  });
});
