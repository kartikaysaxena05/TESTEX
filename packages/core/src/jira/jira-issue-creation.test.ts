/**
 * @file packages/core/src/jira/jira-issue-creation.test.ts
 * Integration tests for Jira issue creation, deterministic eligibility checks,
 * idempotency, cross-project isolation, and audit trail (V7 Phase 91).
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../database/index.js';
import { JiraConnectionService } from './jira-connection-service.js';
import { JiraIssueCreationService } from './jira-issue-creation-service.js';
import {
  JiraIssueIneligibleError,
  JiraCrossProjectError,
  JiraBugReportNotFoundError,
  JiraConfigNotFoundError,
  JiraIssueCreationFailedError,
} from './jira-errors.js';
import type { IJiraClient, JiraValidationResult, JiraHealthCheckResultDto } from './jira-types.js';
import type { PrismaClient } from '@prisma/client';

describe('Jira Issue Creation Integration (Phase 91)', () => {
  let prisma: PrismaClient;
  let connectionService: JiraConnectionService;
  let creationService: JiraIssueCreationService;

  const testProjectIdA = crypto.randomUUID();
  const testProjectIdB = crypto.randomUUID();

  let failureCaseA1: string;
  let failureCaseA2: string;
  let failureCaseB1: string;

  let bugReportA_Eligible: string;
  let bugReportA_Ineligible: string;
  let bugReportB_Eligible: string;

  let createIssueCallCount = 0;
  let simulateJiraFailure = false;

  const mockJiraClient: IJiraClient = {
    async validateConnection(): Promise<JiraValidationResult> {
      return {
        status: 'CONNECTED',
        validatedAt: new Date(),
        durationMs: 40,
        accountIdentity: {
          accountId: 'jira-mock-user',
          displayName: 'Test Admin',
          emailAddress: 'admin@corp.test',
          active: true,
        },
      };
    },
    async discoverSites() {
      return [{ id: 'mock-site', name: 'Corporate Jira', url: 'https://test-jira.atlassian.net' }];
    },
    async discoverProjects() {
      return [{ id: '10000', key: 'ENG', name: 'Engineering Workspace' }];
    },
    async discoverIssueTypes() {
      return [{ id: '10001', name: 'Bug', subtask: false }];
    },
    async discoverPriorities() {
      return [{ id: '2', name: 'High' }];
    },
    async discoverFields() {
      return [];
    },
    async discoverComponents() {
      return [{ id: '30001', name: 'Core Engine' }];
    },
    async discoverAssignees() {
      return [];
    },
    async testConnectionHealth(): Promise<JiraHealthCheckResultDto> {
      return {
        status: 'CONNECTED',
        healthy: true,
        checkedAt: new Date().toISOString(),
        durationMs: 50,
        checks: {
          authentication: { passed: true, message: 'OK' },
          reachability: { passed: true, message: 'OK' },
          projectAccess: { passed: true, message: 'OK', accessibleCount: 1 },
          issueMetadataAccess: { passed: true, message: 'OK' },
        },
      };
    },
    async createIssue(options) {
      createIssueCallCount++;
      if (simulateJiraFailure) {
        throw new JiraIssueCreationFailedError(
          'Jira API error (HTTP 400): Field "summary" cannot be empty',
        );
      }
      return {
        id: '99001',
        key: 'ENG-99',
        self: `${options.baseUrl}/rest/api/3/issue/99001`,
      };
    },
    async getIssue(options) {
      return {
        id: options.issueIdOrKey,
        key: options.issueIdOrKey,
        self: `${options.baseUrl}/rest/api/3/issue/${options.issueIdOrKey}`,
        fields: {
          summary: 'Verified Defect',
          status: { name: 'To Do' },
        },
      };
    },
    async attachEvidence() {
      return [];
    },
  };

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('DATABASE_URL must be configured for integration tests.');
    }
    prisma = client;

    connectionService = new JiraConnectionService({
      prisma,
      jiraClient: mockJiraClient,
      allowLocalhostForTesting: true,
    });

    creationService = new JiraIssueCreationService({
      prisma,
      jiraClient: mockJiraClient,
      allowLocalhostForTesting: true,
    });

    // 1. Projects
    await prisma.project.createMany({
      data: [
        { id: testProjectIdA, name: `Phase 91 Proj A ${Date.now()}` },
        { id: testProjectIdB, name: `Phase 91 Proj B ${Date.now()}` },
      ],
    });

    // 2. Requirements
    const reqA = await prisma.requirement.create({
      data: {
        projectId: testProjectIdA,
        requirementKey: `REQ-A-${Date.now().toString(36).toUpperCase()}`,
        title: 'Payment Processing',
        originalText: 'Process payments securely',
        status: 'ACTIVE',
      },
    });

    const reqB = await prisma.requirement.create({
      data: {
        projectId: testProjectIdB,
        requirementKey: `REQ-B-${Date.now().toString(36).toUpperCase()}`,
        title: 'User Onboarding',
        originalText: 'Onboard new team members',
        status: 'ACTIVE',
      },
    });

    // 3. Test Cases
    const tcA1 = await prisma.testCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseKey: `TC-A1-${Date.now().toString(36).toUpperCase()}`,
        title: 'Checkout Flow Defect Test',
        objective: 'Test payment flow',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
        sourceRequirementId: reqA.id,
        sourceRequirementKey: reqA.requirementKey,
      },
    });

    const tcA2 = await prisma.testCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseKey: `TC-A2-${Date.now().toString(36).toUpperCase()}`,
        title: 'Automation Failure Test',
        objective: 'Test invalid locator failure',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
        sourceRequirementId: reqA.id,
        sourceRequirementKey: reqA.requirementKey,
      },
    });

    const tcB1 = await prisma.testCase.create({
      data: {
        projectId: testProjectIdB,
        testCaseKey: `TC-B1-${Date.now().toString(36).toUpperCase()}`,
        title: 'Onboarding Defect Test',
        objective: 'Test onboarding',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
        sourceRequirementId: reqB.id,
        sourceRequirementKey: reqB.requirementKey,
      },
    });

    // 4. Executable Test Plans
    const planA1 = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-a1',
        summary: 'Executable checkout plan',
        status: 'VALID',
        isExecutable: true,
      },
    });

    const planA2 = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA2.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-a2',
        summary: 'Executable invalid plan',
        status: 'VALID',
        isExecutable: true,
      },
    });

    const planB1 = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectIdB,
        testCaseId: tcB1.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-b1',
        summary: 'Executable onboarding plan',
        status: 'VALID',
        isExecutable: true,
      },
    });

    // 5. Test Runs
    const runA1 = await prisma.testRun.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA1.id,
        status: 'FAILED',
        planFingerprint: 'plan-fp-a1',
        testCaseTitle: tcA1.title,
      },
    });

    const runA2 = await prisma.testRun.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA2.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA2.id,
        status: 'FAILED',
        planFingerprint: 'plan-fp-a2',
        testCaseTitle: tcA2.title,
      },
    });

    const runB1 = await prisma.testRun.create({
      data: {
        projectId: testProjectIdB,
        testCaseId: tcB1.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planB1.id,
        status: 'FAILED',
        planFingerprint: 'plan-fp-b1',
        testCaseTitle: tcB1.title,
      },
    });

    // 6. Test Executions
    const execA1 = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectIdA,
        testRunId: runA1.id,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA1.id,
        status: 'FAILED',
        errorMessage: '500 Internal Server Error',
      },
    });

    const execA2 = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectIdA,
        testRunId: runA2.id,
        testCaseId: tcA2.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA2.id,
        status: 'FAILED',
        errorMessage: 'Locator timeout waiting for element',
      },
    });

    const execB1 = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectIdB,
        testRunId: runB1.id,
        testCaseId: tcB1.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planB1.id,
        status: 'FAILED',
        errorMessage: 'Onboarding step error',
      },
    });

    // 7. Failure Cases
    const fcA1 = await prisma.failureCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        testRunId: runA1.id,
        executionId: execA1.id,
        triggeringExecutionStatus: 'FAILED',
        title: 'Checkout flow returns 500 error',
        failureSummary: 'POST /checkout returns 500',
        status: 'READY',
      },
    });
    failureCaseA1 = fcA1.id;

    const fcA2 = await prisma.failureCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA2.id,
        testCaseVersionNumber: 1,
        testRunId: runA2.id,
        executionId: execA2.id,
        triggeringExecutionStatus: 'FAILED',
        title: 'Locator timeout on button',
        failureSummary: 'Timeout on element click',
        status: 'READY',
      },
    });
    failureCaseA2 = fcA2.id;

    const fcB1 = await prisma.failureCase.create({
      data: {
        projectId: testProjectIdB,
        testCaseId: tcB1.id,
        testCaseVersionNumber: 1,
        testRunId: runB1.id,
        executionId: execB1.id,
        triggeringExecutionStatus: 'FAILED',
        title: 'Onboarding modal fails',
        failureSummary: 'Modal did not render',
        status: 'READY',
      },
    });
    failureCaseB1 = fcB1.id;

    // 8. Structured Bug Reports
    const brA_Eligible = await prisma.structuredBugReport.create({
      data: {
        projectId: testProjectIdA,
        failureCaseId: fcA1.id,
        reportNumber: 'BUG-A1',
        revision: 1,
        isAuthoritative: true,
        status: 'READY',
        applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
        isApplicationDefect: true,
        title: 'Server throws 500 on valid checkout payload',
        summary: 'Checkout endpoint fails with unhandled NullReferenceException.',
        testCaseId: tcA1.id,
        testCaseKey: tcA1.testCaseKey,
        testCaseVersionNumber: 1,
        testCaseTitle: tcA1.title,
        originalExecutionId: execA1.id,
        triggeringStatus: 'FAILED',
        expectedResult: 'HTTP 200 with order confirmation',
        actualResult: 'HTTP 500 Internal Server Error',
        markdownReport: '# Bug Report\nCheckout failed',
        reportFingerprint: 'fp-report-a1',
      },
    });
    bugReportA_Eligible = brA_Eligible.id;

    const brA_Ineligible = await prisma.structuredBugReport.create({
      data: {
        projectId: testProjectIdA,
        failureCaseId: fcA2.id,
        reportNumber: 'BUG-A2',
        revision: 1,
        isAuthoritative: true,
        status: 'READY',
        applicationDefectState: 'AUTOMATION_FAILURE',
        isApplicationDefect: false,
        title: 'Locator timeout waiting for modal',
        summary: 'Playwright locator failed to find element.',
        testCaseId: tcA2.id,
        testCaseKey: tcA2.testCaseKey,
        testCaseVersionNumber: 1,
        testCaseTitle: tcA2.title,
        originalExecutionId: execA2.id,
        triggeringStatus: 'FAILED',
        expectedResult: 'Element appears within 5s',
        actualResult: 'Timeout 30000ms exceeded',
        markdownReport: '# Bug Report\nLocator failure',
        reportFingerprint: 'fp-report-a2',
      },
    });
    bugReportA_Ineligible = brA_Ineligible.id;

    const brB_Eligible = await prisma.structuredBugReport.create({
      data: {
        projectId: testProjectIdB,
        failureCaseId: fcB1.id,
        reportNumber: 'BUG-B1',
        revision: 1,
        isAuthoritative: true,
        status: 'READY',
        applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
        isApplicationDefect: true,
        title: 'Project B Onboarding crash',
        summary: 'User onboarding flow crash.',
        testCaseId: tcB1.id,
        testCaseKey: tcB1.testCaseKey,
        testCaseVersionNumber: 1,
        testCaseTitle: tcB1.title,
        originalExecutionId: execB1.id,
        triggeringStatus: 'FAILED',
        expectedResult: 'Onboarding finishes',
        actualResult: 'Crash occurred',
        markdownReport: '# Bug Report B\nCrash',
        reportFingerprint: 'fp-report-b1',
      },
    });
    bugReportB_Eligible = brB_Eligible.id;

    // 9. Jira Connections & Configurations
    const connA = await connectionService.createConnection({
      projectId: testProjectIdA,
      displayName: 'Jira Integration A',
      baseUrl: 'https://test-jira.atlassian.net',
      accountIdentifier: 'admin@corp.test',
      apiToken: 'mock-valid-token-a',
    });
    await connectionService.validateConnection({
      projectId: testProjectIdA,
      connectionId: connA.id,
    });

    await connectionService.saveProjectConfig({
      projectId: testProjectIdA,
      connectionId: connA.id,
      jiraProjectId: '10000',
      jiraProjectKey: 'ENG',
      jiraProjectName: 'Engineering Workspace',
      selectedIssueTypeId: '10001',
      selectedIssueTypeName: 'Bug',
      defaultPriorityId: '2',
      defaultPriorityName: 'High',
      defaultComponentId: '30001',
      defaultComponentName: 'Core Engine',
      assigneeStrategy: 'UNASSIGNED',
    });

    const connB = await connectionService.createConnection({
      projectId: testProjectIdB,
      displayName: 'Jira Integration B',
      baseUrl: 'https://test-jira.atlassian.net',
      accountIdentifier: 'admin@corp.test',
      apiToken: 'mock-valid-token-b',
    });
    await connectionService.validateConnection({
      projectId: testProjectIdB,
      connectionId: connB.id,
    });

    await connectionService.saveProjectConfig({
      projectId: testProjectIdB,
      connectionId: connB.id,
      jiraProjectId: '10000',
      jiraProjectKey: 'ENG',
      jiraProjectName: 'Engineering Workspace',
      selectedIssueTypeId: '10001',
      selectedIssueTypeName: 'Bug',
      assigneeStrategy: 'UNASSIGNED',
    });
  });

  beforeEach(() => {
    createIssueCallCount = 0;
    simulateJiraFailure = false;
  });

  after(async () => {
    await prisma.jiraExternalIssue.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.jiraConnectionAudit.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.jiraProjectConfig.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.jiraConnection.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.structuredBugReport.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.failureCase.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.testCaseExecution.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.testRun.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.executableTestPlan.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.testCase.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.requirement.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [testProjectIdA, testProjectIdB] } },
    });
  });

  describe('Deterministic Defect Eligibility Enforcement', () => {
    it('creates Jira issue for CONFIRMED_APPLICATION_DEFECT when isApplicationDefect is true', async () => {
      const issue = await creationService.createIssue({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        bugReportId: bugReportA_Eligible,
      });

      assert.equal(issue.projectId, testProjectIdA);
      assert.equal(issue.failureCaseId, failureCaseA1);
      assert.equal(issue.bugReportId, bugReportA_Eligible);
      assert.equal(issue.jiraIssueId, '99001');
      assert.equal(issue.jiraIssueKey, 'ENG-99');
      assert.equal(issue.creationStatus, 'CREATED');
      assert.equal(createIssueCallCount, 1);
    });

    it('strictly blocks AUTOMATION_FAILURE with JiraIssueIneligibleError', async () => {
      await assert.rejects(
        async () =>
          await creationService.createIssue({
            projectId: testProjectIdA,
            failureCaseId: failureCaseA2,
            bugReportId: bugReportA_Ineligible,
          }),
        (err: any) => {
          assert.ok(err instanceof JiraIssueIneligibleError);
          assert.equal(err.code, 'JIRA_ISSUE_INELIGIBLE');
          assert.ok(err.message.includes('AUTOMATION_FAILURE'));
          return true;
        },
      );

      // Verify remote Jira API was NEVER invoked for ineligible failure
      assert.equal(createIssueCallCount, 0);
    });

    it('strictly blocks when isApplicationDefect is false', async () => {
      // Temporarily create a report with CONFIRMED_APPLICATION_DEFECT but isApplicationDefect = false
      const corruptReport = await prisma.structuredBugReport.create({
        data: {
          projectId: testProjectIdA,
          failureCaseId: failureCaseA1,
          reportNumber: 'BUG-CORRUPT',
          revision: 2,
          isAuthoritative: true,
          status: 'READY',
          applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
          isApplicationDefect: false,
          title: 'Contradictory defect report',
          summary: 'Report marked confirmed defect but isApplicationDefect is false',
          testCaseId: (await prisma.failureCase.findUniqueOrThrow({ where: { id: failureCaseA1 } }))
            .testCaseId,
          testCaseKey: 'TC-CORRUPT',
          testCaseVersionNumber: 1,
          testCaseTitle: 'Corrupt Test',
          originalExecutionId: (
            await prisma.failureCase.findUniqueOrThrow({ where: { id: failureCaseA1 } })
          ).executionId,
          triggeringStatus: 'FAILED',
          expectedResult: 'Expected',
          actualResult: 'Actual',
          markdownReport: '# Corrupt',
          reportFingerprint: 'fp-report-corrupt',
        },
      });

      await assert.rejects(
        async () =>
          await creationService.createIssue({
            projectId: testProjectIdA,
            failureCaseId: failureCaseA1,
            bugReportId: corruptReport.id,
          }),
        JiraIssueIneligibleError,
      );

      assert.equal(createIssueCallCount, 0);

      // Clean up corrupt report
      await prisma.structuredBugReport.delete({ where: { id: corruptReport.id } });
    });
  });

  describe('Strict Idempotency & Concurrency Protection', () => {
    it('returns existing JiraExternalIssue without calling Jira API on duplicate requests', async () => {
      // First call was made in the previous test (or make sure an issue exists)
      const existing = await creationService.getIssue({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
      });
      assert.ok(existing);

      // Reset call counter
      createIssueCallCount = 0;

      // Duplicate call for the same bug report / failure case
      const secondCallResult = await creationService.createIssue({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        bugReportId: bugReportA_Eligible,
      });

      // Assert identical issue returned
      assert.equal(secondCallResult.id, existing.id);
      assert.equal(secondCallResult.jiraIssueKey, existing.jiraIssueKey);
      assert.equal(secondCallResult.requestFingerprint, existing.requestFingerprint);

      // Assert remote Jira API was NOT called again
      assert.equal(createIssueCallCount, 0);
    });

    it('serializes concurrent creation calls via mutex locking', async () => {
      // Create a fresh eligible bug report for concurrency test
      const concurrentReport = await prisma.structuredBugReport.create({
        data: {
          projectId: testProjectIdB,
          failureCaseId: failureCaseB1,
          reportNumber: 'BUG-B-CONCURRENT',
          revision: 2,
          isAuthoritative: true,
          status: 'READY',
          applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
          isApplicationDefect: true,
          title: 'Concurrent creation test',
          summary: 'Testing concurrent dispatch serialization',
          testCaseId: (await prisma.failureCase.findUniqueOrThrow({ where: { id: failureCaseB1 } }))
            .testCaseId,
          testCaseKey: 'TC-CONCURRENT',
          testCaseVersionNumber: 1,
          testCaseTitle: 'Concurrent Test',
          originalExecutionId: (
            await prisma.failureCase.findUniqueOrThrow({ where: { id: failureCaseB1 } })
          ).executionId,
          triggeringStatus: 'FAILED',
          expectedResult: 'Expected',
          actualResult: 'Actual',
          markdownReport: '# Concurrent',
          reportFingerprint: 'fp-concurrent-test',
        },
      });

      createIssueCallCount = 0;

      // Fire 3 simultaneous createIssue calls
      const [res1, res2, res3] = await Promise.all([
        creationService.createIssue({
          projectId: testProjectIdB,
          failureCaseId: failureCaseB1,
          bugReportId: concurrentReport.id,
        }),
        creationService.createIssue({
          projectId: testProjectIdB,
          failureCaseId: failureCaseB1,
          bugReportId: concurrentReport.id,
        }),
        creationService.createIssue({
          projectId: testProjectIdB,
          failureCaseId: failureCaseB1,
          bugReportId: concurrentReport.id,
        }),
      ]);

      // All 3 calls must resolve to the identical persisted JiraExternalIssue
      assert.equal(res1.id, res2.id);
      assert.equal(res2.id, res3.id);
      assert.equal(res1.jiraIssueKey, 'ENG-99');

      // Crucially, Jira API should only have been called ONCE
      assert.equal(createIssueCallCount, 1);
    });
  });

  describe('Cross-Project Isolation & Security Boundary', () => {
    it('strictly blocks creation when bug report belongs to a different project', async () => {
      await assert.rejects(
        async () =>
          await creationService.createIssue({
            projectId: testProjectIdA, // Project A
            failureCaseId: failureCaseB1, // Belongs to Project B
            bugReportId: bugReportB_Eligible, // Belongs to Project B
          }),
        (err: any) => {
          assert.ok(
            err instanceof JiraCrossProjectError || err instanceof JiraBugReportNotFoundError,
          );
          return true;
        },
      );

      assert.equal(createIssueCallCount, 0);
    });

    it('rejects creation when bug report does not exist', async () => {
      createIssueCallCount = 0;
      await assert.rejects(
        async () =>
          await creationService.createIssue({
            projectId: testProjectIdA,
            failureCaseId: failureCaseA1,
            bugReportId: crypto.randomUUID(),
          }),
        JiraBugReportNotFoundError,
      );

      assert.equal(createIssueCallCount, 0);
    });

    it('rejects creation when Jira project config is missing', async () => {
      createIssueCallCount = 0;
      const unconfiguredProjId = crypto.randomUUID();
      await prisma.project.create({
        data: { id: unconfiguredProjId, name: 'Unconfigured Project' },
      });

      const unconfiguredConn = await connectionService.createConnection({
        projectId: unconfiguredProjId,
        displayName: 'Unconfigured Jira',
        baseUrl: 'https://test-jira.atlassian.net',
        accountIdentifier: 'admin@corp.test',
        apiToken: 'mock-valid-token-uncfg',
      });
      await connectionService.validateConnection({
        projectId: unconfiguredProjId,
        connectionId: unconfiguredConn.id,
      });

      const baseFc = await prisma.failureCase.findUniqueOrThrow({ where: { id: failureCaseA1 } });
      const baseExec = await prisma.testCaseExecution.findUniqueOrThrow({
        where: { id: baseFc.executionId },
      });
      const unconfiguredExec = await prisma.testCaseExecution.create({
        data: {
          projectId: unconfiguredProjId,
          testRunId: baseFc.testRunId,
          testCaseId: baseFc.testCaseId,
          testCaseVersionNumber: 1,
          executableTestPlanId: baseExec.executableTestPlanId,
          attempt: 2,
          status: 'FAILED',
          errorMessage: 'Unconfigured execution error',
        },
      });

      const unconfiguredFc = await prisma.failureCase.create({
        data: {
          projectId: unconfiguredProjId,
          testCaseId: baseFc.testCaseId,
          testCaseVersionNumber: 1,
          testRunId: baseFc.testRunId,
          executionId: unconfiguredExec.id,
          triggeringExecutionStatus: 'FAILED',
          title: 'Unconfigured case',
          failureSummary: 'Failure in unconfigured project',
          status: 'READY',
        },
      });

      const unconfiguredReport = await prisma.structuredBugReport.create({
        data: {
          projectId: unconfiguredProjId,
          failureCaseId: unconfiguredFc.id,
          reportNumber: 'BUG-UNCFG',
          revision: 1,
          isAuthoritative: true,
          status: 'READY',
          applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
          isApplicationDefect: true,
          title: 'Unconfigured defect',
          summary: 'Defect in project without Jira config',
          testCaseId: baseFc.testCaseId,
          testCaseKey: 'TC-UNCFG',
          testCaseVersionNumber: 1,
          testCaseTitle: 'Unconfigured Test',
          originalExecutionId: unconfiguredExec.id,
          triggeringStatus: 'FAILED',
          expectedResult: 'Expected',
          actualResult: 'Actual',
          markdownReport: '# Unconfigured',
          reportFingerprint: 'fp-report-uncfg',
        },
      });

      await assert.rejects(
        async () =>
          await creationService.createIssue({
            projectId: unconfiguredProjId,
            failureCaseId: unconfiguredFc.id,
            bugReportId: unconfiguredReport.id,
          }),
        JiraConfigNotFoundError,
      );

      await prisma.jiraConnectionAudit.deleteMany({ where: { projectId: unconfiguredProjId } });
      await prisma.jiraConnection.deleteMany({ where: { projectId: unconfiguredProjId } });
      await prisma.structuredBugReport.delete({ where: { id: unconfiguredReport.id } });
      await prisma.failureCase.delete({ where: { id: unconfiguredFc.id } });
      await prisma.testCaseExecution.delete({ where: { id: unconfiguredExec.id } });
      await prisma.project.delete({ where: { id: unconfiguredProjId } });
    });
  });

  describe('Audit Trail Recording', () => {
    it('creates ISSUE_CREATION_ATTEMPTED and ISSUE_CREATED audit logs', async () => {
      const audits = await prisma.jiraConnectionAudit.findMany({
        where: {
          projectId: testProjectIdA,
          eventType: { in: ['ISSUE_CREATION_ATTEMPTED', 'ISSUE_CREATED'] },
        },
        orderBy: { createdAt: 'asc' },
      });

      assert.ok(audits.length >= 2);
      const attemptAudit = audits.find(a => a.eventType === 'ISSUE_CREATION_ATTEMPTED');
      const createdAudit = audits.find(a => a.eventType === 'ISSUE_CREATED');

      assert.ok(attemptAudit);
      assert.ok(createdAudit);
      assert.equal((attemptAudit?.details as any)?.bugReportId, bugReportA_Eligible);
      assert.equal((createdAudit?.details as any)?.jiraIssueKey, 'ENG-99');
    });

    it('records ISSUE_CREATION_FAILED audit log and rethrows when Jira API fails', async () => {
      simulateJiraFailure = true;

      // Create fresh report for failure simulation
      const failedReport = await prisma.structuredBugReport.create({
        data: {
          projectId: testProjectIdA,
          failureCaseId: failureCaseA1,
          reportNumber: 'BUG-FAIL-SIM',
          revision: 3,
          isAuthoritative: true,
          status: 'READY',
          applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
          isApplicationDefect: true,
          title: 'Failure Simulation',
          summary: 'Simulating remote 400 error',
          testCaseId: (await prisma.failureCase.findUniqueOrThrow({ where: { id: failureCaseA1 } }))
            .testCaseId,
          testCaseKey: 'TC-FAIL-SIM',
          testCaseVersionNumber: 1,
          testCaseTitle: 'Fail Sim Test',
          originalExecutionId: (
            await prisma.failureCase.findUniqueOrThrow({ where: { id: failureCaseA1 } })
          ).executionId,
          triggeringStatus: 'FAILED',
          expectedResult: 'Expected',
          actualResult: 'Actual',
          markdownReport: '# Fail Sim',
          reportFingerprint: 'fp-fail-sim',
        },
      });

      // Clear any existing external issue for failureCaseA1 to allow new attempt
      await prisma.jiraExternalIssue.deleteMany({
        where: { failureCaseId: failureCaseA1 },
      });

      await assert.rejects(
        async () =>
          await creationService.createIssue({
            projectId: testProjectIdA,
            failureCaseId: failureCaseA1,
            bugReportId: failedReport.id,
          }),
        JiraIssueCreationFailedError,
      );

      const failedAudits = await prisma.jiraConnectionAudit.findMany({
        where: {
          projectId: testProjectIdA,
          eventType: 'ISSUE_CREATION_FAILED',
        },
      });

      assert.ok(failedAudits.length > 0);
      assert.ok(
        (failedAudits[0]?.details as any)?.error?.includes('Field "summary" cannot be empty'),
      );
    });
  });
});
