/**
 * @file packages/core/src/jira/jira-duplicate-prevention.test.ts
 * Integration tests for V7 Phase 93 — Jira Duplicate Prevention & Existing-Issue Linking.
 * Verifies the 6-level deterministic precedence hierarchy, defect cluster split/merge detection,
 * title similarity prohibition, remote JQL metadata lookup, strong evidence signature matching,
 * safe existing-issue linking, idempotency, 404 deleted issue invalidation, moved key updates,
 * multi-tenant project isolation, concurrency serialization, and audit logging.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../database/index.js';
import { JiraConnectionService } from './jira-connection-service.js';
import { JiraDuplicatePreventionService } from './jira-duplicate-prevention-service.js';
import { JiraIssueCreationService } from './jira-issue-creation-service.js';
import { JiraCrossProjectError, JiraConnectionFailedError } from './jira-errors.js';
import type { IJiraClient, JiraValidationResult, JiraHealthCheckResultDto } from './jira-types.js';
import type { PrismaClient } from '@prisma/client';

describe('Jira Duplicate Prevention Integration (Phase 93)', () => {
  let prisma: PrismaClient;
  let connectionService: JiraConnectionService;
  let preventionService: JiraDuplicatePreventionService;
  let creationService: JiraIssueCreationService;

  const testProjectIdA = crypto.randomUUID();
  const testProjectIdB = crypto.randomUUID();

  let tcA1Id: string;
  let planA1Id: string;

  let failureCaseA1: string;
  let failureCaseA2: string;
  let failureCaseA3: string;
  let failureCaseA4: string;
  let failureCaseA5: string;
  let failureCaseB1: string;

  let bugReportA1: string;
  let bugReportA2: string;
  let _bugReportB1: string;

  let clusterActiveId: string;
  let clusterSplitId: string;
  let clusterConflictedId: string;

  let connAId: string;
  let _connBId: string;

  async function createUniqueFailureFixture(title: string, summary: string, signature?: string) {
    const run = await prisma.testRun.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1Id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA1Id,
        status: 'FAILED',
        planFingerprint: `plan-fp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        testCaseTitle: 'Payment 500 Test Case',
      },
    });
    const exec = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectIdA,
        testRunId: run.id,
        testCaseId: tcA1Id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA1Id,
        status: 'FAILED',
        errorMessage: summary,
      },
    });
    return prisma.failureCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1Id,
        testCaseVersionNumber: 1,
        testRunId: run.id,
        executionId: exec.id,
        triggeringExecutionStatus: 'FAILED',
        title,
        failureSummary: summary,
        failureSignature: signature,
        status: 'READY',
      },
    });
  }

  let mockSearchIssuesResults: {
    readonly issues: readonly {
      readonly id: string;
      readonly key: string;
      readonly fields?: Record<string, unknown>;
    }[];
    readonly total: number;
  } = {
    issues: [],
    total: 0,
  };

  let mockGetIssueReturnKey: string | null = null;
  let simulateGetIssue404 = false;
  let createIssueCallCount = 0;

  const knownIssues = new Map<string, { id: string; key: string }>();

  const mockJiraClient: IJiraClient = {
    async validateConnection(): Promise<JiraValidationResult> {
      return {
        status: 'CONNECTED',
        validatedAt: new Date(),
        durationMs: 35,
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
        durationMs: 40,
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
      const id = `mock-issue-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const key = `ENG-${Math.floor(Math.random() * 900) + 100}`;
      knownIssues.set(id, { id, key });
      knownIssues.set(key, { id, key });
      return {
        id,
        key,
        self: `${options.baseUrl}/rest/api/3/issue/${id}`,
      };
    },
    async getIssue(options) {
      if (simulateGetIssue404) {
        throw new JiraConnectionFailedError('Jira API error (HTTP 404): Issue Does Not Exist', 404);
      }
      if (mockGetIssueReturnKey) {
        return {
          id: options.issueIdOrKey,
          key: mockGetIssueReturnKey,
          self: `${options.baseUrl}/rest/api/3/issue/${options.issueIdOrKey}`,
          fields: {
            summary: 'Verified Defect',
            status: { name: 'To Do' },
          },
        };
      }
      const existing = knownIssues.get(options.issueIdOrKey);
      const id = existing?.id ?? options.issueIdOrKey;
      const key = existing?.key ?? options.issueIdOrKey;
      return {
        id,
        key,
        self: `${options.baseUrl}/rest/api/3/issue/${id}`,
        fields: {
          summary: 'Verified Defect',
          status: { name: 'To Do' },
        },
      };
    },
    async searchIssues() {
      return mockSearchIssuesResults;
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

    preventionService = new JiraDuplicatePreventionService({
      prisma,
      jiraClient: mockJiraClient,
      allowLocalhostForTesting: true,
    });

    creationService = new JiraIssueCreationService({
      prisma,
      jiraClient: mockJiraClient,
      duplicateService: preventionService,
      allowLocalhostForTesting: true,
    });

    // 1. Projects
    await prisma.project.createMany({
      data: [
        { id: testProjectIdA, name: `Phase 93 Proj A ${Date.now()}` },
        { id: testProjectIdB, name: `Phase 93 Proj B ${Date.now()}` },
      ],
    });

    // 2. Requirements
    const reqA = await prisma.requirement.create({
      data: {
        projectId: testProjectIdA,
        requirementKey: `REQ-A-${Date.now().toString(36).toUpperCase()}`,
        title: 'Checkout & Payments',
        originalText: 'Process payments and orders safely',
        status: 'ACTIVE',
      },
    });

    const reqB = await prisma.requirement.create({
      data: {
        projectId: testProjectIdB,
        requirementKey: `REQ-B-${Date.now().toString(36).toUpperCase()}`,
        title: 'User Profile Settings',
        originalText: 'Manage user profiles and settings',
        status: 'ACTIVE',
      },
    });

    // 3. Test Cases
    const tcA1 = await prisma.testCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseKey: `TC-A1-${Date.now().toString(36).toUpperCase()}`,
        title: 'Payment 500 Test Case',
        objective: 'Test payment gateway failure',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
        sourceRequirementId: reqA.id,
        sourceRequirementKey: reqA.requirementKey,
      },
    });
    tcA1Id = tcA1.id;

    const tcB1 = await prisma.testCase.create({
      data: {
        projectId: testProjectIdB,
        testCaseKey: `TC-B1-${Date.now().toString(36).toUpperCase()}`,
        title: 'Profile Crash Test Case',
        objective: 'Test profile crash',
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
        planFingerprint: 'plan-fp-a1-p93',
        summary: 'Executable checkout plan',
        status: 'VALID',
        isExecutable: true,
      },
    });
    planA1Id = planA1.id;

    const planB1 = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectIdB,
        testCaseId: tcB1.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-b1-p93',
        summary: 'Executable profile plan',
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
        planFingerprint: 'plan-fp-a1-p93',
        testCaseTitle: tcA1.title,
      },
    });

    const runA2 = await prisma.testRun.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA1.id,
        status: 'FAILED',
        planFingerprint: 'plan-fp-a2-p93',
        testCaseTitle: tcA1.title,
      },
    });

    const runA3 = await prisma.testRun.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA1.id,
        status: 'FAILED',
        planFingerprint: 'plan-fp-a3-p93',
        testCaseTitle: tcA1.title,
      },
    });

    const runA4 = await prisma.testRun.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA1.id,
        status: 'FAILED',
        planFingerprint: 'plan-fp-a4-p93',
        testCaseTitle: tcA1.title,
      },
    });

    const runA5 = await prisma.testRun.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA1.id,
        status: 'FAILED',
        planFingerprint: 'plan-fp-a5-p93',
        testCaseTitle: tcA1.title,
      },
    });

    const runB1 = await prisma.testRun.create({
      data: {
        projectId: testProjectIdB,
        testCaseId: tcB1.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planB1.id,
        status: 'FAILED',
        planFingerprint: 'plan-fp-b1-p93',
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
        errorMessage: '500 Internal Server Error during checkout 1',
      },
    });

    const execA2 = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectIdA,
        testRunId: runA2.id,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA1.id,
        status: 'FAILED',
        errorMessage: '500 Internal Server Error during checkout 2',
      },
    });

    const execA3 = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectIdA,
        testRunId: runA3.id,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA1.id,
        status: 'FAILED',
        errorMessage: '500 Internal Server Error during checkout 3',
      },
    });

    const execA4 = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectIdA,
        testRunId: runA4.id,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA1.id,
        status: 'FAILED',
        errorMessage: '500 Internal Server Error during checkout 4',
      },
    });

    const execA5 = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectIdA,
        testRunId: runA5.id,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA1.id,
        status: 'FAILED',
        errorMessage: '500 Internal Server Error during checkout 5',
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
        errorMessage: 'Crash in profile settings',
      },
    });

    // 7. Failure Cases in Project A
    const fcA1 = await prisma.failureCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        testRunId: runA1.id,
        executionId: execA1.id,
        triggeringExecutionStatus: 'FAILED',
        title: 'Payment 500 Defect Case 1',
        failureSummary: 'POST /checkout returns 500 error',
        failureSignature: 'sig-payment-gateway-500-null-ref',
        status: 'READY',
      },
    });
    failureCaseA1 = fcA1.id;

    const fcA2 = await prisma.failureCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        testRunId: runA2.id,
        executionId: execA2.id,
        triggeringExecutionStatus: 'FAILED',
        title: 'Payment 500 Defect Case 2 (Cluster Member)',
        failureSummary: 'POST /checkout returns 500 error on retry',
        failureSignature: 'sig-payment-gateway-500-null-ref',
        status: 'READY',
      },
    });
    failureCaseA2 = fcA2.id;

    const fcA3 = await prisma.failureCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        testRunId: runA3.id,
        executionId: execA3.id,
        triggeringExecutionStatus: 'FAILED',
        title: 'Payment 500 Defect Case 3 (Split Cluster Member)',
        failureSummary: 'POST /checkout returns 500 under high load',
        failureSignature: 'sig-payment-gateway-split',
        status: 'READY',
      },
    });
    failureCaseA3 = fcA3.id;

    const fcA4 = await prisma.failureCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        testRunId: runA4.id,
        executionId: execA4.id,
        triggeringExecutionStatus: 'FAILED',
        title: 'Payment 500 Defect Case 4 (Conflicted Cluster Member A)',
        failureSummary: 'Conflicting failure A in merged cluster',
        status: 'READY',
      },
    });
    failureCaseA4 = fcA4.id;

    const fcA5 = await prisma.failureCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        testRunId: runA5.id,
        executionId: execA5.id,
        triggeringExecutionStatus: 'FAILED',
        title: 'Payment 500 Defect Case 5 (Conflicted Cluster Member B)',
        failureSummary: 'Conflicting failure B in merged cluster',
        status: 'READY',
      },
    });
    failureCaseA5 = fcA5.id;

    // Failure Case in Project B
    const fcB1 = await prisma.failureCase.create({
      data: {
        projectId: testProjectIdB,
        testCaseId: tcB1.id,
        testCaseVersionNumber: 1,
        testRunId: runB1.id,
        executionId: execB1.id,
        triggeringExecutionStatus: 'FAILED',
        title: 'Payment 500 Defect Case 1', // Identical title to test cross-project & title similarity isolation
        failureSummary: 'POST /checkout returns 500 error',
        failureSignature: 'sig-payment-gateway-500-null-ref', // Identical signature across project
        status: 'READY',
      },
    });
    failureCaseB1 = fcB1.id;

    // 8. Structured Bug Reports
    const brA1 = await prisma.structuredBugReport.create({
      data: {
        projectId: testProjectIdA,
        failureCaseId: fcA1.id,
        reportNumber: 'BUG-P93-A1',
        revision: 1,
        isAuthoritative: true,
        status: 'READY',
        applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
        isApplicationDefect: true,
        title: 'Payment 500 in Checkout flow',
        summary: 'Unhandled 500 internal server error during payment.',
        testCaseId: tcA1.id,
        testCaseKey: tcA1.testCaseKey,
        testCaseVersionNumber: 1,
        testCaseTitle: tcA1.title,
        originalExecutionId: execA1.id,
        triggeringStatus: 'FAILED',
        expectedResult: '200 OK',
        actualResult: '500 Internal Server Error',
        markdownReport: '# Bug Report A1',
        reportFingerprint: 'fp-br-a1-p93',
      },
    });
    bugReportA1 = brA1.id;

    const brA2 = await prisma.structuredBugReport.create({
      data: {
        projectId: testProjectIdA,
        failureCaseId: fcA2.id,
        reportNumber: 'BUG-P93-A2',
        revision: 1,
        isAuthoritative: true,
        status: 'READY',
        applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
        isApplicationDefect: true,
        title: 'Payment 500 in Checkout flow (Identical Title)',
        summary: 'Unhandled 500 internal server error during payment retry.',
        testCaseId: tcA1.id,
        testCaseKey: tcA1.testCaseKey,
        testCaseVersionNumber: 1,
        testCaseTitle: tcA1.title,
        originalExecutionId: execA2.id,
        triggeringStatus: 'FAILED',
        expectedResult: '200 OK',
        actualResult: '500 Internal Server Error',
        markdownReport: '# Bug Report A2',
        reportFingerprint: 'fp-br-a2-p93',
      },
    });
    bugReportA2 = brA2.id;

    const brB1 = await prisma.structuredBugReport.create({
      data: {
        projectId: testProjectIdB,
        failureCaseId: fcB1.id,
        reportNumber: 'BUG-P93-B1',
        revision: 1,
        isAuthoritative: true,
        status: 'READY',
        applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
        isApplicationDefect: true,
        title: 'Payment 500 in Checkout flow',
        summary: 'Cross-project identical report title',
        testCaseId: tcB1.id,
        testCaseKey: tcB1.testCaseKey,
        testCaseVersionNumber: 1,
        testCaseTitle: tcB1.title,
        originalExecutionId: execB1.id,
        triggeringStatus: 'FAILED',
        expectedResult: '200 OK',
        actualResult: '500 Internal Server Error',
        markdownReport: '# Bug Report B1',
        reportFingerprint: 'fp-br-b1-p93',
      },
    });
    _bugReportB1 = brB1.id;

    // 9. Defect Clusters in Project A
    // Active Cluster
    const cActive = await prisma.defectCluster.create({
      data: {
        projectId: testProjectIdA,
        clusterKey: `CLUSTER-ACTIVE-${Date.now().toString(36).toUpperCase()}`,
        title: 'Active Payment Gateway Cluster',
        clusterStatus: 'ACTIVE',
        representativeFailureId: fcA1.id,
        memberCount: 2,
        clusterFingerprint: 'cluster-fp-active-1',
      },
    });
    clusterActiveId = cActive.id;

    // Split Cluster
    const cSplit = await prisma.defectCluster.create({
      data: {
        projectId: testProjectIdA,
        clusterKey: `CLUSTER-SPLIT-${Date.now().toString(36).toUpperCase()}`,
        title: 'Split Payment Gateway Cluster',
        clusterStatus: 'SPLIT',
        representativeFailureId: fcA3.id,
        memberCount: 1,
        clusterFingerprint: 'cluster-fp-split-1',
      },
    });
    clusterSplitId = cSplit.id;

    // Conflicted Cluster (to hold multiple member links)
    const cConflicted = await prisma.defectCluster.create({
      data: {
        projectId: testProjectIdA,
        clusterKey: `CLUSTER-CONFLICT-${Date.now().toString(36).toUpperCase()}`,
        title: 'Merged Conflicted Cluster',
        clusterStatus: 'ACTIVE',
        representativeFailureId: fcA4.id,
        memberCount: 2,
        clusterFingerprint: 'cluster-fp-conflicted-1',
      },
    });
    clusterConflictedId = cConflicted.id;

    // Cluster Memberships
    await prisma.defectClusterMembership.createMany({
      data: [
        {
          clusterId: cActive.id,
          failureCaseId: fcA1.id,
          projectId: testProjectIdA,
          relationshipType: 'EXACT_DUPLICATE',
          relationshipStrength: 'EXACT',
          similarityScore: 1.0,
          explanation: 'Representative failure',
          isRepresentative: true,
          isActive: true,
        },
        {
          clusterId: cActive.id,
          failureCaseId: fcA2.id,
          projectId: testProjectIdA,
          relationshipType: 'EXACT_DUPLICATE',
          relationshipStrength: 'STRONG',
          similarityScore: 0.95,
          explanation: 'Member failure',
          isRepresentative: false,
          isActive: true,
        },
        {
          clusterId: cSplit.id,
          failureCaseId: fcA3.id,
          projectId: testProjectIdA,
          relationshipType: 'PROBABLE_DUPLICATE',
          relationshipStrength: 'MODERATE',
          similarityScore: 0.8,
          explanation: 'Split member failure',
          isRepresentative: true,
          isActive: true,
        },
        {
          clusterId: cConflicted.id,
          failureCaseId: fcA4.id,
          projectId: testProjectIdA,
          relationshipType: 'EXACT_DUPLICATE',
          relationshipStrength: 'STRONG',
          similarityScore: 0.9,
          explanation: 'Conflicted member 1',
          isRepresentative: true,
          isActive: true,
        },
        {
          clusterId: cConflicted.id,
          failureCaseId: fcA5.id,
          projectId: testProjectIdA,
          relationshipType: 'EXACT_DUPLICATE',
          relationshipStrength: 'STRONG',
          similarityScore: 0.9,
          explanation: 'Conflicted member 2',
          isRepresentative: false,
          isActive: true,
        },
      ],
    });

    // 10. Connections & Configurations
    const connA = await connectionService.createConnection({
      projectId: testProjectIdA,
      displayName: 'Jira Integration A',
      baseUrl: 'https://test-jira.atlassian.net',
      accountIdentifier: 'admin@corp.test',
      apiToken: 'mock-valid-token-a',
    });
    connAId = connA.id;
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
    _connBId = connB.id;
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

  beforeEach(async () => {
    mockSearchIssuesResults = {
      issues: [],
      total: 0,
    };
    mockGetIssueReturnKey = null;
    simulateGetIssue404 = false;
    createIssueCallCount = 0;
    knownIssues.clear();

    // Default known issues for mocked tests
    const defaultKnown = [
      { id: '10010', key: 'ENG-10' },
      { id: '10020', key: 'ENG-20' },
      { id: '10030', key: 'ENG-30' },
      { id: '10040', key: 'ENG-40' },
      { id: '10050', key: 'ENG-50' },
      { id: '10061', key: 'ENG-61' },
      { id: '10062', key: 'ENG-62' },
      { id: '10070', key: 'ENG-70' },
      { id: '10090', key: 'ENG-90' },
    ];
    for (const issue of defaultKnown) {
      knownIssues.set(issue.id, issue);
      knownIssues.set(issue.key, issue);
    }

    // Clean up issue links and external issues between test groups
    await prisma.jiraIssueLink.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.jiraExternalIssue.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
  });

  after(async () => {
    await prisma.jiraIssueLink.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
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
    await prisma.defectClusterMembership.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.defectCluster.deleteMany({
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

  // ==========================================================================
  // 1. RULE 1: Exact Bug Report Reuse
  // ==========================================================================
  describe('Precedence Level 1: Exact Bug Report Reuse', () => {
    it('detects duplicate when active JiraIssueLink exists for exact bug report', async () => {
      // Seed an active JiraIssueLink for bugReportA1
      await prisma.jiraIssueLink.create({
        data: {
          projectId: testProjectIdA,
          failureCaseId: failureCaseA1,
          bugReportId: bugReportA1,
          jiraConnectionId: connAId,
          jiraProjectKey: 'ENG',
          jiraIssueId: '10010',
          jiraIssueKey: 'ENG-10',
          jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-10',
          linkReason: 'Manual linked issue',
          linkSource: 'USER_CONFIRMED_LINK',
          isActive: true,
        },
      });

      const evalResult = await preventionService.evaluateBeforeCreate({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        bugReportId: bugReportA1,
      });

      assert.equal(evalResult.decision, 'USE_EXISTING');
      assert.equal(evalResult.ruleId, 'JIRA_RULE_1_EXACT_BUG_REPORT');
      assert.equal(evalResult.jiraIssueKey, 'ENG-10');
      assert.equal(evalResult.jiraIssueId, '10010');
      assert.equal(evalResult.candidateCount, 1);
      assert.ok(evalResult.reason.includes('ENG-10'));
    });

    it('detects duplicate when JiraExternalIssue was previously created for exact bug report', async () => {
      await prisma.jiraExternalIssue.create({
        data: {
          projectId: testProjectIdA,
          failureCaseId: failureCaseA1,
          bugReportId: bugReportA1,
          connectionId: connAId,
          jiraProjectId: '10000',
          jiraProjectKey: 'ENG',
          jiraIssueId: '10020',
          jiraIssueKey: 'ENG-20',
          jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-20',
          issueType: 'Bug',
          summary: 'Created Bug Report Issue',
          priority: 'High',
          creationStatus: 'CREATED',
          requestFingerprint: 'fp-issue-eng-20',
        },
      });

      const evalResult = await preventionService.evaluateBeforeCreate({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        bugReportId: bugReportA1,
      });

      assert.equal(evalResult.decision, 'USE_EXISTING');
      assert.equal(evalResult.ruleId, 'JIRA_RULE_1_EXACT_BUG_REPORT');
      assert.equal(evalResult.jiraIssueKey, 'ENG-20');
      assert.equal(evalResult.jiraIssueId, '10020');
      assert.equal(evalResult.candidateCount, 1);
    });
  });

  // ==========================================================================
  // 2. RULE 2: Exact Failure Reuse
  // ==========================================================================
  describe('Precedence Level 2: Exact Failure Reuse', () => {
    it('detects duplicate when active JiraIssueLink exists for failureCase without bugReportId match', async () => {
      // Seed link for failureCaseA1 without matching bugReportId
      await prisma.jiraIssueLink.create({
        data: {
          projectId: testProjectIdA,
          failureCaseId: failureCaseA1,
          bugReportId: null,
          jiraConnectionId: connAId,
          jiraProjectKey: 'ENG',
          jiraIssueId: '10030',
          jiraIssueKey: 'ENG-30',
          jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-30',
          linkReason: 'Linked to failure',
          linkSource: 'USER_CONFIRMED_LINK',
          isActive: true,
        },
      });

      // Query without bugReportId
      const evalResult = await preventionService.evaluateBeforeCreate({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
      });

      assert.equal(evalResult.decision, 'USE_EXISTING');
      assert.equal(evalResult.ruleId, 'JIRA_RULE_2_EXACT_FAILURE');
      assert.equal(evalResult.jiraIssueKey, 'ENG-30');
      assert.equal(evalResult.candidateCount, 1);
    });

    it('detects duplicate when JiraExternalIssue was created for failureCase', async () => {
      await prisma.jiraExternalIssue.create({
        data: {
          projectId: testProjectIdA,
          failureCaseId: failureCaseA1,
          bugReportId: bugReportA1,
          connectionId: connAId,
          jiraProjectId: '10000',
          jiraProjectKey: 'ENG',
          jiraIssueId: '10040',
          jiraIssueKey: 'ENG-40',
          jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-40',
          issueType: 'Bug',
          summary: 'Created Failure Issue',
          priority: 'High',
          creationStatus: 'CREATED',
          requestFingerprint: 'fp-issue-eng-40',
        },
      });

      const evalResult = await preventionService.evaluateBeforeCreate({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
      });

      assert.equal(evalResult.decision, 'USE_EXISTING');
      assert.equal(evalResult.ruleId, 'JIRA_RULE_2_EXACT_FAILURE');
      assert.equal(evalResult.jiraIssueKey, 'ENG-40');
    });
  });

  // ==========================================================================
  // 3. RULE 3: Defect Cluster Reuse, Split Ambiguity & Merge Conflicts
  // ==========================================================================
  describe('Precedence Level 3: Authoritative Defect Cluster Reuse & Ambiguity', () => {
    it('reuses existing Jira issue from another member of the same active cluster', async () => {
      // Member 1 (failureCaseA1) has a linked issue
      await prisma.jiraIssueLink.create({
        data: {
          projectId: testProjectIdA,
          failureCaseId: failureCaseA1,
          bugReportId: bugReportA1,
          defectClusterId: clusterActiveId,
          jiraConnectionId: connAId,
          jiraProjectKey: 'ENG',
          jiraIssueId: '10050',
          jiraIssueKey: 'ENG-50',
          jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-50',
          linkReason: 'Cluster representative linked',
          linkSource: 'EXACT_EXISTING_LINK',
          isActive: true,
        },
      });

      // Member 2 (failureCaseA2) evaluates duplicate
      const evalResult = await preventionService.evaluateBeforeCreate({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA2,
        bugReportId: bugReportA2,
      });

      assert.equal(evalResult.decision, 'USE_EXISTING');
      assert.equal(evalResult.ruleId, 'JIRA_RULE_3_DEFECT_CLUSTER');
      assert.equal(evalResult.jiraIssueKey, 'ENG-50');
      assert.equal(evalResult.defectClusterId, clusterActiveId);
      assert.equal(evalResult.clusterMembershipAuthoritative, true);
      assert.equal(evalResult.candidateCount, 1);
      assert.ok(evalResult.reason.includes('authoritative defect cluster'));
    });

    it('returns INCONCLUSIVE when clusterStatus is SPLIT to prevent incorrect duplicate reuse', async () => {
      // failureCaseA3 belongs to clusterSplitId which has clusterStatus: 'SPLIT'
      const evalResult = await preventionService.evaluateBeforeCreate({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA3,
      });

      assert.equal(evalResult.decision, 'INCONCLUSIVE');
      assert.equal(evalResult.ruleId, 'JIRA_RULE_3_CLUSTER_SPLIT_AMBIGUOUS');
      assert.equal(evalResult.defectClusterId, clusterSplitId);
      assert.equal(evalResult.clusterMembershipAuthoritative, false);
      assert.ok(evalResult.reason.includes('has undergone a split'));
    });

    it('returns INCONCLUSIVE when cluster members are linked to multiple conflicting Jira issues', async () => {
      // In clusterConflictedId:
      // Member failureCaseA4 linked to ENG-61
      await prisma.jiraIssueLink.create({
        data: {
          projectId: testProjectIdA,
          failureCaseId: failureCaseA4,
          defectClusterId: clusterConflictedId,
          jiraConnectionId: connAId,
          jiraProjectKey: 'ENG',
          jiraIssueId: '10061',
          jiraIssueKey: 'ENG-61',
          jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-61',
          linkReason: 'Member 1 linked',
          linkSource: 'USER_CONFIRMED_LINK',
          isActive: true,
        },
      });

      // Member failureCaseA5 linked to ENG-62
      await prisma.jiraIssueLink.create({
        data: {
          projectId: testProjectIdA,
          failureCaseId: failureCaseA5,
          defectClusterId: clusterConflictedId,
          jiraConnectionId: connAId,
          jiraProjectKey: 'ENG',
          jiraIssueId: '10062',
          jiraIssueKey: 'ENG-62',
          jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-62',
          linkReason: 'Member 2 linked',
          linkSource: 'USER_CONFIRMED_LINK',
          isActive: true,
        },
      });

      // Create a 3rd unlinked member in the same cluster to verify merge conflict evaluation:
      const fcA6 = await createUniqueFailureFixture(
        'Unlinked Member 3 in Conflicted Cluster',
        'Summary 3',
      );

      await prisma.defectClusterMembership.create({
        data: {
          clusterId: clusterConflictedId,
          failureCaseId: fcA6.id,
          projectId: testProjectIdA,
          relationshipType: 'EXACT_DUPLICATE',
          relationshipStrength: 'STRONG',
          similarityScore: 0.9,
          explanation: 'Unlinked member',
          isRepresentative: false,
          isActive: true,
        },
      });

      const clusterEvalResult = await preventionService.evaluateBeforeCreate({
        projectId: testProjectIdA,
        failureCaseId: fcA6.id,
      });

      assert.equal(clusterEvalResult.decision, 'INCONCLUSIVE');
      assert.equal(clusterEvalResult.ruleId, 'JIRA_RULE_3_CLUSTER_MERGE_CONFLICT');
      assert.equal(clusterEvalResult.candidateCount, 2);
      assert.ok(clusterEvalResult.reason.includes('multiple conflicting Jira issues'));
      assert.ok(clusterEvalResult.reason.includes('ENG-61'));
      assert.ok(clusterEvalResult.reason.includes('ENG-62'));

      // Check audit log for DEDUPLICATION_CONFLICT
      const conflictAudit = await prisma.jiraConnectionAudit.findFirst({
        where: {
          projectId: testProjectIdA,
          eventType: 'DEDUPLICATION_CONFLICT',
        },
      });
      assert.ok(conflictAudit, 'DEDUPLICATION_CONFLICT audit must be recorded');
    });
  });

  // ==========================================================================
  // 4. TITLE SIMILARITY STRICT PROHIBITION
  // ==========================================================================
  describe('Title Similarity Prohibition', () => {
    it('never treats identical title alone as duplicate proof; returns CREATE_NEW', async () => {
      // Create a standalone failure and bug report with identical title to bugReportA1
      const isolatedFailure = await createUniqueFailureFixture(
        'Payment 500 Defect Case 1', // IDENTICAL TITLE
        'Different failure summary without matching signature',
        'completely-different-signature-xyz',
      );

      const isolatedBugReport = await prisma.structuredBugReport.create({
        data: {
          projectId: testProjectIdA,
          failureCaseId: isolatedFailure.id,
          reportNumber: 'BUG-P93-ISO-1',
          revision: 1,
          isAuthoritative: true,
          status: 'READY',
          applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
          isApplicationDefect: true,
          title: 'Payment 500 in Checkout flow', // IDENTICAL TITLE
          summary: 'Identical title but different cluster and failure',
          testCaseId: tcA1Id,
          testCaseKey: 'TC-A1',
          testCaseVersionNumber: 1,
          testCaseTitle: 'TC Title',
          originalExecutionId: isolatedFailure.executionId,
          triggeringStatus: 'FAILED',
          expectedResult: '200 OK',
          actualResult: '500 Error',
          markdownReport: '# Isolated Bug',
          reportFingerprint: 'fp-iso-1',
        },
      });

      // Even if another bug report has an active link:
      await prisma.jiraIssueLink.create({
        data: {
          projectId: testProjectIdA,
          failureCaseId: failureCaseA1,
          bugReportId: bugReportA1,
          jiraConnectionId: connAId,
          jiraProjectKey: 'ENG',
          jiraIssueId: '10070',
          jiraIssueKey: 'ENG-70',
          jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-70',
          linkReason: 'Existing bug report linked',
          linkSource: 'USER_CONFIRMED_LINK',
          isActive: true,
        },
      });

      // Isolated failure evaluates duplicate:
      const evalResult = await preventionService.evaluateBeforeCreate({
        projectId: testProjectIdA,
        failureCaseId: isolatedFailure.id,
        bugReportId: isolatedBugReport.id,
      });

      assert.equal(evalResult.decision, 'CREATE_NEW');
      assert.equal(evalResult.ruleId, 'JIRA_RULE_6_NO_DUPLICATE');
      assert.equal(evalResult.candidateCount, 0);
    });
  });

  // ==========================================================================
  // 5. RULE 4: Remote JQL Label Lookup
  // ==========================================================================
  describe('Precedence Level 4: External Jira Metadata Match (Labels/JQL)', () => {
    it('discovers existing Jira issue via remote JQL search when no DB link exists', async () => {
      // Create a failure case with no existing links or issues
      const remoteMatchFailure = await createUniqueFailureFixture(
        'Remote Match Failure',
        'Remote match summary',
        'remote-sig-unique',
      );

      // Configure mock search issues to return a match
      mockSearchIssuesResults = {
        issues: [
          {
            id: '99080',
            key: 'ENG-80',
            fields: {
              summary: 'Remote issue with matching label',
              status: { name: 'In Progress' },
            },
          },
        ],
        total: 1,
      };

      const evalResult = await preventionService.evaluateBeforeCreate({
        projectId: testProjectIdA,
        failureCaseId: remoteMatchFailure.id,
      });

      assert.equal(evalResult.decision, 'USE_EXISTING');
      assert.equal(evalResult.ruleId, 'JIRA_RULE_4_EXTERNAL_METADATA_MATCH');
      assert.equal(evalResult.jiraIssueKey, 'ENG-80');
      assert.equal(evalResult.jiraIssueId, '99080');
      assert.equal(evalResult.candidateCount, 1);
      assert.ok(evalResult.reason.includes('matching platform defect metadata'));

      // Verify audit recorded
      const audit = await prisma.jiraConnectionAudit.findFirst({
        where: {
          projectId: testProjectIdA,
          eventType: 'DUPLICATE_MATCH_FOUND',
        },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(audit);
      assert.equal((audit.details as any).jiraIssueKey, 'ENG-80');
    });
  });

  // ==========================================================================
  // 6. RULE 5: Strong Structured Evidence Signature Match
  // ==========================================================================
  describe('Precedence Level 5: Strong Structured Evidence Match', () => {
    it('detects duplicate when identical failure signature matches a failure with a created Jira issue', async () => {
      // failureCaseA1 has signature 'sig-payment-gateway-500-null-ref'
      // Create a JiraExternalIssue for failureCaseA1
      await prisma.jiraExternalIssue.create({
        data: {
          projectId: testProjectIdA,
          failureCaseId: failureCaseA1,
          bugReportId: bugReportA1,
          connectionId: connAId,
          jiraProjectId: '10000',
          jiraProjectKey: 'ENG',
          jiraIssueId: '10090',
          jiraIssueKey: 'ENG-90',
          jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-90',
          issueType: 'Bug',
          summary: 'Signature Match Parent Issue',
          priority: 'High',
          creationStatus: 'CREATED',
          requestFingerprint: 'fp-issue-eng-90',
        },
      });

      // Create a new unclustered failure with identical signature:
      const newFailureWithSameSig = await createUniqueFailureFixture(
        'A completely different title text',
        'Summary text',
        'sig-payment-gateway-500-null-ref',
      );

      const evalResult = await preventionService.evaluateBeforeCreate({
        projectId: testProjectIdA,
        failureCaseId: newFailureWithSameSig.id,
      });

      assert.equal(evalResult.decision, 'USE_EXISTING');
      assert.equal(evalResult.ruleId, 'JIRA_RULE_5_STRONG_EVIDENCE_MATCH');
      assert.equal(evalResult.jiraIssueKey, 'ENG-90');
      assert.equal(evalResult.jiraIssueId, '10090');
      assert.ok(evalResult.reason.includes('identical deterministic signature'));
    });
  });

  // ==========================================================================
  // 7. RULE 6: Allow New Issue
  // ==========================================================================
  describe('Precedence Level 6: Allow Creation', () => {
    it('allows new Jira issue creation when no duplicates or cluster links exist', async () => {
      const cleanFailure = await createUniqueFailureFixture(
        'Brand New Clean Failure',
        'No duplicates anywhere',
        'brand-new-unique-signature-111',
      );

      const evalResult = await preventionService.evaluateBeforeCreate({
        projectId: testProjectIdA,
        failureCaseId: cleanFailure.id,
      });

      assert.equal(evalResult.decision, 'CREATE_NEW');
      assert.equal(evalResult.ruleId, 'JIRA_RULE_6_NO_DUPLICATE');
      assert.equal(evalResult.candidateCount, 0);

      const audit = await prisma.jiraConnectionAudit.findFirst({
        where: {
          projectId: testProjectIdA,
          eventType: 'NEW_ISSUE_ALLOWED',
        },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(audit, 'NEW_ISSUE_ALLOWED audit must be logged');
    });
  });

  // ==========================================================================
  // 8. SAFE EXISTING-ISSUE LINKING & IDEMPOTENCY
  // ==========================================================================
  describe('Safe Existing-Issue Linking & Idempotency', () => {
    it('creates active JiraIssueLink and supersedes previous link on re-link', async () => {
      const link1 = await preventionService.linkExistingIssue({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        bugReportId: bugReportA1,
        jiraIssueKey: 'ENG-101',
        linkReason: 'User linked to existing ticket',
        linkSource: 'USER_CONFIRMED_LINK',
      });

      assert.equal(link1.jiraIssueKey, 'ENG-101');
      assert.equal(link1.isActive, true);
      assert.equal(link1.linkSource, 'USER_CONFIRMED_LINK');

      // Re-link to a different issue: old link must be deactivated and superseded
      const link2 = await preventionService.linkExistingIssue({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        bugReportId: bugReportA1,
        jiraIssueKey: 'ENG-102',
        linkReason: 'Updated to correct ticket',
        linkSource: 'USER_CONFIRMED_LINK',
      });

      assert.equal(link2.jiraIssueKey, 'ENG-102');
      assert.equal(link2.isActive, true);

      // Check link1 status in DB
      const oldLink = await prisma.jiraIssueLink.findUnique({
        where: { id: link1.id },
      });
      assert.ok(oldLink);
      assert.equal(oldLink.isActive, false);
      assert.equal(oldLink.supersededById, link2.id);
      assert.ok(oldLink.invalidationReason?.includes(link2.id));

      // getIssueLink returns the new active link
      const activeLink = await preventionService.getIssueLink({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        bugReportId: bugReportA1,
      });
      assert.ok(activeLink);
      assert.equal(activeLink.id, link2.id);
      assert.equal(activeLink.jiraIssueKey, 'ENG-102');
    });

    it('records EXISTING_ISSUE_LINKED audit event on link creation', async () => {
      const link = await preventionService.linkExistingIssue({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA2,
        jiraIssueKey: 'ENG-105',
        linkReason: 'Audit check linking',
      });

      const audit = await prisma.jiraConnectionAudit.findFirst({
        where: {
          projectId: testProjectIdA,
          eventType: 'EXISTING_ISSUE_LINKED',
        },
        orderBy: { createdAt: 'desc' },
      });

      assert.ok(audit);
      assert.equal((audit.details as any).linkId, link.id);
      assert.equal((audit.details as any).jiraIssueKey, 'ENG-105');
    });
  });

  // ==========================================================================
  // 9. DELETED JIRA ISSUE (404) DETECTION & INVALIDATION
  // ==========================================================================
  describe('Deleted Jira Issue (404) Invalidation', () => {
    it('invalidates active link when external Jira issue returns 404', async () => {
      const link = await preventionService.linkExistingIssue({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        jiraIssueKey: 'ENG-404',
        linkReason: 'Link before deletion',
      });
      assert.equal(link.isActive, true);

      // Simulate 404 in Jira client
      simulateGetIssue404 = true;

      // Evaluate duplicate will detect 404 and invalidate link
      const evalResult = await preventionService.evaluateBeforeCreate({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
      });

      // Link was invalidated, so it falls through to subsequent rules (or CREATE_NEW)
      assert.equal(evalResult.decision, 'CREATE_NEW');

      const dbLink = await prisma.jiraIssueLink.findUnique({
        where: { id: link.id },
      });
      assert.ok(dbLink);
      assert.equal(dbLink.isActive, false);
      assert.ok(dbLink.invalidationReason?.includes('deleted (404)'));

      const audit = await prisma.jiraConnectionAudit.findFirst({
        where: {
          projectId: testProjectIdA,
          eventType: 'LINK_INVALIDATED',
        },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(audit);
    });

    it('allows direct invalidation via invalidateLink', async () => {
      const link = await preventionService.linkExistingIssue({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        jiraIssueKey: 'ENG-333',
        linkReason: 'Direct invalidation test',
      });

      const invalidated = await preventionService.invalidateLink(link.id, 'Manual user unlinking');
      assert.equal(invalidated.isActive, false);
      assert.equal(invalidated.invalidationReason, 'Manual user unlinking');
    });
  });

  // ==========================================================================
  // 10. MOVED JIRA KEY DETECTION & AUTO-UPDATE
  // ==========================================================================
  describe('Moved Jira Key Detection & Auto-Update', () => {
    it('updates stored jiraIssueKey when remote Jira indicates issue key moved', async () => {
      const link = await preventionService.linkExistingIssue({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        jiraIssueKey: 'ENG-OLD',
        linkReason: 'Key move test',
      });

      // Mock Jira returning moved key ENG-NEW
      mockGetIssueReturnKey = 'ENG-NEW';

      const evalResult = await preventionService.evaluateBeforeCreate({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
      });

      assert.equal(evalResult.decision, 'USE_EXISTING');
      assert.equal(evalResult.jiraIssueKey, 'ENG-NEW');

      const updatedLink = await prisma.jiraIssueLink.findUnique({
        where: { id: link.id },
      });
      assert.ok(updatedLink);
      assert.equal(updatedLink.jiraIssueKey, 'ENG-NEW');
    });
  });

  // ==========================================================================
  // 11. MULTI-TENANT PROJECT ISOLATION
  // ==========================================================================
  describe('Multi-Tenant Project Isolation', () => {
    it('rejects cross-project duplicate evaluation', async () => {
      // Trying to evaluate failureCaseB1 (Project B) using Project A's ID
      await assert.rejects(
        async () => {
          await preventionService.evaluateBeforeCreate({
            projectId: testProjectIdA,
            failureCaseId: failureCaseB1,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof JiraCrossProjectError);
          return true;
        },
      );
    });

    it('rejects cross-project existing-issue linking', async () => {
      await assert.rejects(
        async () => {
          await preventionService.linkExistingIssue({
            projectId: testProjectIdA,
            failureCaseId: failureCaseB1,
            jiraIssueKey: 'ENG-CROSS',
            linkReason: 'Cross-project attack attempt',
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof JiraCrossProjectError);
          return true;
        },
      );
    });

    it('guarantees 0 cross-project issue reuse even with identical failure titles and signatures', async () => {
      // In Project A, link failureCaseA1 to ENG-999
      await preventionService.linkExistingIssue({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        jiraIssueKey: 'ENG-999',
        linkReason: 'Project A Link',
      });

      // Project B has failureCaseB1 which has the exact same title & signature as failureCaseA1
      const evalResultB = await preventionService.evaluateBeforeCreate({
        projectId: testProjectIdB,
        failureCaseId: failureCaseB1,
      });

      // Project B must NOT see Project A's ENG-999 link!
      assert.equal(evalResultB.decision, 'CREATE_NEW');
      assert.equal(evalResultB.ruleId, 'JIRA_RULE_6_NO_DUPLICATE');
    });
  });

  // ==========================================================================
  // 12. CONCURRENCY SERIALIZATION & RACE CONDITION DEFENSE
  // ==========================================================================
  describe('Concurrency Serialization & Mutex Protection', () => {
    it('serializes 50 concurrent evaluateBeforeCreate calls without race conditions or deadlocks', async () => {
      const promises = Array.from({ length: 50 }, () =>
        preventionService.evaluateBeforeCreate({
          projectId: testProjectIdA,
          failureCaseId: failureCaseA1,
        }),
      );

      const results = await Promise.all(promises);
      assert.equal(results.length, 50);
      for (const res of results) {
        assert.ok(res.decision === 'CREATE_NEW' || res.decision === 'USE_EXISTING');
      }
    });

    it('serializes 50 concurrent linkExistingIssue calls cleanly leaving a single active link', async () => {
      const promises = Array.from({ length: 50 }, (_, i) =>
        preventionService.linkExistingIssue({
          projectId: testProjectIdA,
          failureCaseId: failureCaseA2,
          jiraIssueKey: `ENG-RACE-${i}`,
          linkReason: `Concurrent link iteration ${i}`,
        }),
      );

      const results = await Promise.all(promises);
      assert.equal(results.length, 50);

      // Verify that exactly ONE active link exists for failureCaseA2
      const activeLinks = await prisma.jiraIssueLink.findMany({
        where: {
          projectId: testProjectIdA,
          failureCaseId: failureCaseA2,
          isActive: true,
        },
      });

      assert.equal(activeLinks.length, 1);
      const firstActiveLink = activeLinks[0];
      assert.ok(firstActiveLink && firstActiveLink.jiraIssueKey.startsWith('ENG-RACE-'));

      // Verify other 49 links are inactive and superseded
      const inactiveLinks = await prisma.jiraIssueLink.findMany({
        where: {
          projectId: testProjectIdA,
          failureCaseId: failureCaseA2,
          isActive: false,
        },
      });
      assert.equal(inactiveLinks.length, 49);
    });
  });

  // ==========================================================================
  // 13. INTEGRATION WITH JiraIssueCreationService
  // ==========================================================================
  describe('Integration with JiraIssueCreationService (Automated Reuse)', () => {
    it('reuses existing Jira issue when creating for a defect cluster member instead of calling Jira API', async () => {
      // 1. First member (failureCaseA1) creates an issue
      const issue1 = await creationService.createIssue({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        bugReportId: bugReportA1,
      });

      assert.equal(createIssueCallCount, 1);
      assert.ok(issue1.jiraIssueKey);

      // 2. Second member (failureCaseA2) in the same cluster calls createIssue
      const initialCallCount = createIssueCallCount;
      const issue2 = await creationService.createIssue({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA2,
        bugReportId: bugReportA2,
      });

      // Jira API createIssue MUST NOT have been called again!
      assert.equal(createIssueCallCount, initialCallCount);
      // Both issues must reference the same Jira issue key!
      assert.equal(issue2.jiraIssueKey, issue1.jiraIssueKey);

      // Verify JiraIssueLink was created for bugReportA2
      const link = await preventionService.getIssueLink({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA2,
        bugReportId: bugReportA2,
      });
      assert.ok(link);
      assert.equal(link.jiraIssueKey, issue1.jiraIssueKey);
      assert.equal(link.linkSource, 'SAME_DEFECT_CLUSTER');
    });

    it('returns existing issue idempotently on identical requestFingerprint retry', async () => {
      const issue1 = await creationService.createIssue({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        bugReportId: bugReportA1,
      });

      const callCountBefore = createIssueCallCount;
      const issue2 = await creationService.createIssue({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        bugReportId: bugReportA1,
      });

      assert.equal(createIssueCallCount, callCountBefore);
      assert.equal(issue2.id, issue1.id);
      assert.equal(issue2.jiraIssueKey, issue1.jiraIssueKey);
    });
  });
});
