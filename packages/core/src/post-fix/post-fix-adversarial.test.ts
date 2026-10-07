/**
 * @file packages/core/src/post-fix/post-fix-adversarial.test.ts
 * Adversarial, boundary, and multi-tenant security test suite for V7 Phase 107.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../database/client.js';
import type { PrismaClient } from '@prisma/client';
import { PostFixExternalUpdateService } from './post-fix-external-update-service.js';
import {
  PostFixProjectMismatchError,
  PostFixUnauthoritativeVerificationError,
  PostFixJiraAuthFailedError,
  PostFixJiraRateLimitedError,
} from './post-fix-errors.js';
import { JiraAuthenticationFailedError, JiraRateLimitedError } from '../jira/jira-errors.js';
import { JiraCredentialVault } from '../jira/jira-credential-vault.js';
import type { IJiraClient } from '../jira/jira-types.js';

describe('Post-Fix Adversarial & Multi-Tenant Security', () => {
  let prisma: PrismaClient;
  const projectA = crypto.randomUUID();
  const projectB = crypto.randomUUID();

  let fcAId: string;
  let revAId: string;
  let uncompletedRevId: string;

  before(async () => {
    const client = getPrismaClient();
    if (!client) throw new Error('Prisma client unavailable');
    prisma = client;

    // 1. Create Projects
    await prisma.project.create({
      data: { id: projectA, name: 'Adversarial Project A', status: 'ACTIVE' },
    });
    await prisma.project.create({
      data: { id: projectB, name: 'Adversarial Project B', status: 'ACTIVE' },
    });

    // 2. Create Environment
    const envA = await prisma.projectEnvironment.create({
      data: {
        projectId: projectA,
        name: 'Adv Dev Env',
        type: 'DEVELOPMENT',
        baseUrl: 'http://localhost:3000',
        isDefault: true,
        isEnabled: true,
        isProduction: false,
        productionSafetyPolicy: 'SAFE_MODE',
      },
    });

    // 3. Create TestCase and Version
    const tc = await prisma.testCase.create({
      data: {
        projectId: projectA,
        testCaseKey: 'TC-ADV-01',
        title: 'Adversarial Test',
        objective: 'Adversarial test case objective',
        type: 'REGRESSION',
        status: 'ACTIVE',
        priority: 'HIGH',
      },
    });

    const ver = await prisma.testCaseVersion.create({
      data: {
        projectId: projectA,
        testCaseId: tc.id,
        versionNumber: 1,
        title: 'Adversarial Test v1',
        objective: 'Adversarial test case objective',
        stepsJson: [],
      },
    });

    // 4. ExecutableTestPlan, Run, and Execution
    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId: projectA,
        environmentId: envA.id,
        testCaseId: tc.id,
        testCaseVersionId: ver.id,
        testCaseVersionNumber: 1,
        planFingerprint: `fp-adv-${Date.now()}`,
        status: 'VALID',
      },
    });

    const run = await prisma.testRun.create({
      data: {
        projectId: projectA,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        testCaseTitle: 'Adversarial Test',
        planFingerprint: plan.planFingerprint,
        status: 'FAILED',
        environmentId: envA.id,
        executableTestPlanId: plan.id,
      },
    });

    const exec = await prisma.testCaseExecution.create({
      data: {
        projectId: projectA,
        testRunId: run.id,
        testCaseId: tc.id,
        testCaseVersionId: ver.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        environmentId: envA.id,
        status: 'FAILED',
      },
    });

    // 5. FailureCase
    const fc = await prisma.failureCase.create({
      data: {
        projectId: projectA,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        testRunId: run.id,
        executionId: exec.id,
        triggeringExecutionStatus: 'FAILED',
        status: 'READY',
        title: 'Adversarial failure',
        failureSummary: 'Failure summary for adversarial testing',
      },
    });
    fcAId = fc.id;

    // 6. Bug Report
    await prisma.structuredBugReport.create({
      data: {
        projectId: projectA,
        failureCaseId: fc.id,
        reportNumber: 'BUG-ADV-1',
        revision: 1,
        isAuthoritative: true,
        status: 'READY',
        applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
        isApplicationDefect: true,
        title: 'Adversarial bug report',
        summary: 'Adversarial bug report summary',
        testCaseId: tc.id,
        testCaseKey: tc.testCaseKey,
        testCaseVersionNumber: 1,
        testCaseTitle: tc.title,
        originalExecutionId: exec.id,
        triggeringStatus: 'FAILED',
        expectedResult: 'Expected success',
        actualResult: 'Actual failure',
        markdownReport: '# Bug Report',
        reportFingerprint: `fp-adv-br-${Date.now()}`,
      },
    });

    // 7. Completed Reverification & Attempt
    const rev = await prisma.defectReverification.create({
      data: {
        projectId: projectA,
        failureCaseId: fcAId,
        originalTestRunId: run.id,
        originalExecutionId: exec.id,
        originalTestCaseId: tc.id,
        originalTestCaseVersionNumber: 1,
        selectedTestCaseId: tc.id,
        selectedTestCaseVersionNumber: 1,
        triggerType: 'MANUAL_REQUEST',
        targetEnvironmentId: envA.id,
        status: 'COMPLETED',
        latestOutcome: 'VERIFIED_FIXED',
        isAuthoritative: true,
      },
    });
    revAId = rev.id;

    await prisma.defectVerificationAttempt.create({
      data: {
        projectId: projectA,
        reverificationId: revAId,
        failureCaseId: fcAId,
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

    // 8. Reverification that is still EXECUTING without outcome (unauthoritative)
    const uncompleted = await prisma.defectReverification.create({
      data: {
        projectId: projectA,
        failureCaseId: fcAId,
        originalTestRunId: run.id,
        originalExecutionId: exec.id,
        originalTestCaseId: tc.id,
        originalTestCaseVersionNumber: 1,
        selectedTestCaseId: tc.id,
        selectedTestCaseVersionNumber: 1,
        triggerType: 'MANUAL_REQUEST',
        targetEnvironmentId: envA.id,
        status: 'EXECUTING',
        latestOutcome: null,
        isAuthoritative: false,
      },
    });
    uncompletedRevId = uncompleted.id;
  });

  after(async () => {
    if (prisma) {
      await prisma.postFixSyncAudit.deleteMany({ where: { projectId: { in: [projectA, projectB] } } }).catch(() => {});
      await prisma.postFixSyncRecord.deleteMany({ where: { projectId: { in: [projectA, projectB] } } }).catch(() => {});
      await prisma.defectVerificationAttempt.deleteMany({ where: { projectId: { in: [projectA, projectB] } } }).catch(() => {});
      await prisma.defectReverification.deleteMany({ where: { projectId: { in: [projectA, projectB] } } }).catch(() => {});
      await prisma.jiraIssueLink.deleteMany({ where: { projectId: { in: [projectA, projectB] } } }).catch(() => {});
      await prisma.jiraConnection.deleteMany({ where: { projectId: { in: [projectA, projectB] } } }).catch(() => {});
      await prisma.structuredBugReport.deleteMany({ where: { projectId: { in: [projectA, projectB] } } }).catch(() => {});
      await prisma.failureCase.deleteMany({ where: { projectId: { in: [projectA, projectB] } } }).catch(() => {});
      await prisma.testCaseExecution.deleteMany({ where: { projectId: { in: [projectA, projectB] } } }).catch(() => {});
      await prisma.testRun.deleteMany({ where: { projectId: { in: [projectA, projectB] } } }).catch(() => {});
      await prisma.executableTestPlan.deleteMany({ where: { projectId: { in: [projectA, projectB] } } }).catch(() => {});
      await prisma.testCaseVersion.deleteMany({ where: { projectId: { in: [projectA, projectB] } } }).catch(() => {});
      await prisma.testCase.deleteMany({ where: { projectId: { in: [projectA, projectB] } } }).catch(() => {});
      await prisma.projectEnvironment.deleteMany({ where: { projectId: { in: [projectA, projectB] } } }).catch(() => {});
      await prisma.project.deleteMany({ where: { id: { in: [projectA, projectB] } } }).catch(() => {});
    }
  });

  it('rejects cross-project sync requests with PostFixProjectMismatchError', async () => {
    const service = new PostFixExternalUpdateService({ prisma });

    await assert.rejects(
      async () => {
        await service.executeSync({
          projectId: projectB, // Project B trying to sync Project A's failure
          failureCaseId: fcAId,
          reverificationId: revAId,
        });
      },
      (err: any) => {
        assert.ok(err instanceof PostFixProjectMismatchError);
        assert.equal(err.code, 'POST_FIX_PROJECT_MISMATCH');
        return true;
      },
    );
  });

  it('rejects uncompleted or unauthoritative reverifications', async () => {
    const service = new PostFixExternalUpdateService({ prisma });

    await assert.rejects(
      async () => {
        await service.executeSync({
          projectId: projectA,
          failureCaseId: fcAId,
          reverificationId: uncompletedRevId, // Not completed yet
        });
      },
      (err: any) => {
        assert.ok(err instanceof PostFixUnauthoritativeVerificationError);
        assert.equal(err.code, 'POST_FIX_UNAUTHORITATIVE_VERIFICATION');
        return true;
      },
    );
  });

  it('translates Jira 401 Unauthorized errors into PostFixJiraAuthFailedError', async () => {
    // Setup Jira link for project A
    const vault = new JiraCredentialVault();
    const connId = crypto.randomUUID();
    const encrypted = await vault.encrypt('secret-token', connId);

    const conn = await prisma.jiraConnection.create({
      data: {
        id: connId,
        projectId: projectA,
        displayName: 'Project A Jira',
        baseUrl: 'https://proja.atlassian.net',
        accountIdentifier: 'qa@proja.com',
        secretReference: 'vault:proja',
        encryptedCredentials: encrypted,
        connectionStatus: 'CONNECTED',
      },
    });

    await prisma.jiraIssueLink.create({
      data: {
        projectId: projectA,
        failureCaseId: fcAId,
        jiraConnectionId: conn.id,
        jiraProjectKey: 'PROJA',
        jiraIssueKey: 'PROJA-1',
        jiraIssueId: '10001',
        jiraIssueUrl: 'https://proja.atlassian.net/browse/PROJA-1',
        linkReason: 'Primary defect link',
        isActive: true,
      },
    });

    const failingJiraClient = {
      validateConnection: async () => ({ ok: true, statusCode: 200, latencyMs: 10 }),
      testConnectionHealth: async () => ({ isReachable: true, latencyMs: 10, checkedAt: new Date().toISOString() }),
      addComment: async () => {
        throw new JiraAuthenticationFailedError('Invalid Jira credentials or expired token');
      },
      getTransitions: async () => [],
      transitionIssue: async () => {},
    } as unknown as IJiraClient;

    const service = new PostFixExternalUpdateService({
      prisma,
      jiraClient: failingJiraClient,
      vault,
      allowLocalhostForTesting: true,
    });

    await assert.rejects(
      async () => {
        await service.executeSync({
          projectId: projectA,
          failureCaseId: fcAId,
          reverificationId: revAId,
        });
      },
      (err: any) => {
        assert.ok(err instanceof PostFixJiraAuthFailedError);
        assert.equal(err.code, 'POST_FIX_JIRA_AUTH_FAILED');
        return true;
      },
    );
  });

  it('translates Jira 429 Rate Limited errors with backoff retry info', async () => {
    const vault = new JiraCredentialVault();
    const rateLimitedClient = {
      validateConnection: async () => ({ ok: true, statusCode: 200, latencyMs: 10 }),
      testConnectionHealth: async () => ({ isReachable: true, latencyMs: 10, checkedAt: new Date().toISOString() }),
      addComment: async () => {
        throw new JiraRateLimitedError('Too many requests to Jira REST API', 45);
      },
      getTransitions: async () => [],
      transitionIssue: async () => {},
    } as unknown as IJiraClient;

    const service = new PostFixExternalUpdateService({
      prisma,
      jiraClient: rateLimitedClient,
      vault,
      allowLocalhostForTesting: true,
    });

    await assert.rejects(
      async () => {
        await service.executeSync({
          projectId: projectA,
          failureCaseId: fcAId,
          reverificationId: revAId,
        });
      },
      (err: any) => {
        assert.ok(err instanceof PostFixJiraRateLimitedError);
        assert.equal(err.code, 'POST_FIX_JIRA_RATE_LIMITED');
        assert.equal(err.retryAfterSeconds, 45);
        return true;
      },
    );
  });
});
