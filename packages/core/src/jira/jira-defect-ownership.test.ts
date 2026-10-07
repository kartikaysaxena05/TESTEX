/**
 * @file packages/core/src/jira/jira-defect-ownership.test.ts
 * Integration tests for V7 Phase 94 — Engineer Assignment & Defect Ownership Workflow.
 * Verifies engineer registration, eligibility listing, deterministic assignment/reassignment/unassignment,
 * optimistic concurrency version locking, cross-project multi-tenant isolation, Jira API synchronization,
 * partial failure semantics, retry sync, remote sync with conflict detection, and audit logging.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../database/index.js';
import { JiraDefectOwnershipService } from './jira-defect-ownership-service.js';
import { JiraConnectionService } from './jira-connection-service.js';
import { JiraCredentialVault } from './jira-credential-vault.js';
import {
  JiraEngineerIneligibleError,
  JiraEngineerNotFoundError,
  JiraStaleOwnershipVersionError,
  JiraOwnershipNotFoundError,
  JiraCrossProjectError,
  JiraBugReportNotFoundError,
} from './jira-errors.js';
import { ProjectNotFoundError } from '../projects/project-errors.js';
import type { IJiraClient } from './jira-types.js';
import type { PrismaClient } from '@prisma/client';

type AssignIssueOptions = Parameters<NonNullable<IJiraClient['assignIssue']>>[0];
type JiraGetIssueResult = Awaited<ReturnType<IJiraClient['getIssue']>>;

describe('Jira Defect Ownership Service Integration (Phase 94)', () => {
  let prisma: PrismaClient;
  let vault: JiraCredentialVault;
  let connectionService: JiraConnectionService;
  let ownershipService: JiraDefectOwnershipService;

  const testProjectIdA = crypto.randomUUID();
  const testProjectIdB = crypto.randomUUID();

  let tcA1Id: string;
  let tcB1Id: string;
  let planA1Id: string;
  let planB1Id: string;

  let failureCaseA1: string;
  let failureCaseA2: string;
  let failureCaseB1: string;

  let bugReportA1: string;
  let bugReportA2: string;
  let bugReportB1: string;

  let connAId: string;
  let _issueLinkA1Id: string;

  // Mock Jira Client state
  let assignIssueCalls: AssignIssueOptions[] = [];
  let shouldAssignIssueFail = false;
  let assignIssueErrorMessage = 'Jira API 500 error';
  let mockRemoteAssignee: {
    accountId?: string;
    name?: string;
    emailAddress?: string;
    displayName?: string;
  } | null = null;

  const mockJiraClient: IJiraClient = {
    async validateConnection() {
      return {
        status: 'CONNECTED',
        validatedAt: new Date(),
        durationMs: 30,
        accountIdentity: {
          accountId: 'jira-mock-admin',
          displayName: 'Admin User',
          emailAddress: 'admin@test.local',
          active: true,
        },
      };
    },
    async discoverSites() {
      return [{ id: 'site-1', name: 'Test Site', url: 'https://test-jira.atlassian.net' }];
    },
    async discoverProjects() {
      return [{ id: '10000', key: 'TEST', name: 'Test Project' }];
    },
    async discoverIssueTypes() {
      return [{ id: '10001', name: 'Bug', subtask: false }];
    },
    async discoverPriorities() {
      return [{ id: '1', name: 'High' }];
    },
    async discoverFields() {
      return [];
    },
    async discoverComponents() {
      return [];
    },
    async discoverAssignees() {
      return [];
    },
    async testConnectionHealth() {
      return {
        status: 'CONNECTED',
        healthy: true,
        checkedAt: new Date().toISOString(),
        durationMs: 25,
        checks: {
          authentication: { passed: true, message: 'OK' },
          reachability: { passed: true, message: 'OK' },
          projectAccess: { passed: true, message: 'OK', accessibleCount: 1 },
          issueMetadataAccess: { passed: true, message: 'OK' },
        },
      };
    },
    async createIssue(options) {
      return {
        id: '10050',
        key: 'TEST-100',
        self: `${options.baseUrl}/rest/api/3/issue/10050`,
      };
    },
    async getIssue(options): Promise<JiraGetIssueResult> {
      return {
        id: '10050',
        key: options.issueIdOrKey,
        self: `${options.baseUrl}/rest/api/3/issue/10050`,
        fields: {
          summary: 'Simulated Issue',
          status: { name: 'To Do' },
          assignee: mockRemoteAssignee,
        },
      };
    },
    async searchIssues() {
      return { issues: [], total: 0 };
    },
    async attachEvidence() {
      return [];
    },
    async assignIssue(options: AssignIssueOptions): Promise<void> {
      assignIssueCalls.push(options);
      if (shouldAssignIssueFail) {
        throw new Error(assignIssueErrorMessage);
      }
    },
  };

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('DATABASE_URL must be configured for integration tests.');
    }
    prisma = client;
    vault = new JiraCredentialVault();

    connectionService = new JiraConnectionService({
      prisma,
      jiraClient: mockJiraClient,
      allowLocalhostForTesting: true,
    });

    ownershipService = new JiraDefectOwnershipService({
      prisma,
      jiraClient: mockJiraClient,
      vault,
      allowLocalhostForTesting: true,
    });

    // 1. Create Projects
    await prisma.project.createMany({
      data: [
        { id: testProjectIdA, name: `Phase 94 Proj A ${Date.now()}` },
        { id: testProjectIdB, name: `Phase 94 Proj B ${Date.now()}` },
      ],
    });

    // 2. Requirements
    const reqA = await prisma.requirement.create({
      data: {
        projectId: testProjectIdA,
        requirementKey: `REQ-A-${Date.now().toString(36).toUpperCase()}`,
        title: 'Authentication Module',
        originalText: 'User login and auth module',
        status: 'ACTIVE',
      },
    });

    const reqB = await prisma.requirement.create({
      data: {
        projectId: testProjectIdB,
        requirementKey: `REQ-B-${Date.now().toString(36).toUpperCase()}`,
        title: 'User Profile Module',
        originalText: 'User profile module',
        status: 'ACTIVE',
      },
    });

    // 3. Test Cases
    const tcA1 = await prisma.testCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseKey: `TC-A1-${Date.now().toString(36).toUpperCase()}`,
        title: 'Login Test Case',
        objective: 'Verify login behavior',
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
        title: 'Profile Test Case',
        objective: 'Verify profile behavior',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
        sourceRequirementId: reqB.id,
        sourceRequirementKey: reqB.requirementKey,
      },
    });
    tcB1Id = tcB1.id;

    // 4. Executable Test Plans
    const planA1 = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        planFingerprint: `plan-a1-${Date.now()}`,
        summary: 'Executable auth plan',
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
        planFingerprint: `plan-b1-${Date.now()}`,
        summary: 'Executable profile plan',
        status: 'VALID',
        isExecutable: true,
      },
    });
    planB1Id = planB1.id;

    // Helper for creating Failure Cases
    async function createFailureCase(
      projId: string,
      tcId: string,
      planId: string,
      summary: string,
    ) {
      const run = await prisma.testRun.create({
        data: {
          projectId: projId,
          testCaseId: tcId,
          testCaseVersionNumber: 1,
          executableTestPlanId: planId,
          status: 'FAILED',
          planFingerprint: `fp-${Date.now()}-${Math.random()}`,
          testCaseTitle: 'Test Case Failure',
        },
      });
      const exec = await prisma.testCaseExecution.create({
        data: {
          projectId: projId,
          testRunId: run.id,
          testCaseId: tcId,
          testCaseVersionNumber: 1,
          executableTestPlanId: planId,
          status: 'FAILED',
          errorMessage: summary,
        },
      });
      const fc = await prisma.failureCase.create({
        data: {
          projectId: projId,
          testCaseId: tcId,
          testCaseVersionNumber: 1,
          testRunId: run.id,
          executionId: exec.id,
          triggeringExecutionStatus: 'FAILED',
          title: `Failure: ${summary}`,
          failureSummary: summary,
          status: 'READY',
        },
      });
      return { fc, exec };
    }

    const { fc: fcA1, exec: execA1 } = await createFailureCase(
      testProjectIdA,
      tcA1Id,
      planA1Id,
      'Null pointer exception in auth',
    );
    const { fc: fcA2, exec: execA2 } = await createFailureCase(
      testProjectIdA,
      tcA1Id,
      planA1Id,
      'Timeout connecting to DB',
    );
    const { fc: fcB1, exec: execB1 } = await createFailureCase(
      testProjectIdB,
      tcB1Id,
      planB1Id,
      'Cross project failure',
    );
    failureCaseA1 = fcA1.id;
    failureCaseA2 = fcA2.id;
    failureCaseB1 = fcB1.id;

    // 5. Bug Reports
    async function createBugReport(
      projId: string,
      fcId: string,
      tcId: string,
      execId: string,
      title: string,
    ) {
      return prisma.structuredBugReport.create({
        data: {
          projectId: projId,
          failureCaseId: fcId,
          reportNumber: `BUG-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`,
          revision: 1,
          isAuthoritative: true,
          status: 'READY',
          applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
          isApplicationDefect: true,
          title,
          summary: `Summary of ${title}`,
          testCaseId: tcId,
          testCaseKey: 'TC-001',
          testCaseVersionNumber: 1,
          testCaseTitle: 'Login Test Case',
          originalExecutionId: execId,
          triggeringStatus: 'FAILED',
          expectedResult: 'Expected 200',
          actualResult: 'Received 500',
          markdownReport: `# ${title}`,
          reportFingerprint: `fp-${Date.now()}-${Math.random()}`,
          generatorVersion: '1.0.0',
        },
      });
    }

    const brA1 = await createBugReport(
      testProjectIdA,
      failureCaseA1,
      tcA1Id,
      execA1.id,
      'Auth NPE Bug',
    );
    const brA2 = await createBugReport(
      testProjectIdA,
      failureCaseA2,
      tcA1Id,
      execA2.id,
      'DB Timeout Bug',
    );
    const brB1 = await createBugReport(
      testProjectIdB,
      failureCaseB1,
      tcB1Id,
      execB1.id,
      'Proj B Bug',
    );
    bugReportA1 = brA1.id;
    bugReportA2 = brA2.id;
    bugReportB1 = brB1.id;

    // 6. Jira Connection & Link for Project A
    const connA = await connectionService.createConnection({
      projectId: testProjectIdA,
      displayName: 'Jira Integration A',
      baseUrl: 'https://test-jira.atlassian.net',
      accountIdentifier: 'admin@test.local',
      apiToken: 'mock-valid-token-a',
    });
    connAId = connA.id;

    const link = await prisma.jiraIssueLink.create({
      data: {
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        bugReportId: bugReportA1,
        jiraConnectionId: connAId,
        jiraProjectKey: 'TEST',
        jiraIssueId: '10050',
        jiraIssueKey: 'TEST-100',
        jiraIssueUrl: 'https://test-jira.atlassian.net/browse/TEST-100',
        linkReason: 'Primary defect link',
        linkSource: 'USER_CONFIRMED_LINK',
        decision: 'CREATE_NEW',
        isActive: true,
      },
    });
    _issueLinkA1Id = link.id;
  });

  beforeEach(() => {
    assignIssueCalls = [];
    shouldAssignIssueFail = false;
    assignIssueErrorMessage = 'Jira API 500 error';
    mockRemoteAssignee = null;
  });

  after(async () => {
    if (!prisma) return;
    await prisma.defectOwnershipHistory.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.defectOwnership.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.jiraIssueLink.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.projectEngineer.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.jiraConnectionAudit.deleteMany({
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

  // ============================================================================
  // 1. Engineer Registration & Profile Management
  // ============================================================================
  describe('Engineer Registration', () => {
    it('registers an active engineer with Jira account identity and routing tags', async () => {
      const eng = await ownershipService.registerProjectEngineer({
        projectId: testProjectIdA,
        userId: 'eng-alice',
        displayName: 'Alice Engineer',
        email: 'alice@eng.local',
        jiraAccountId: 'jira-account-alice-777',
        routingTags: ['auth', 'backend', 'security'],
        isActive: true,
      });

      assert.ok(eng.id);
      assert.equal(eng.projectId, testProjectIdA);
      assert.equal(eng.userId, 'eng-alice');
      assert.equal(eng.displayName, 'Alice Engineer');
      assert.equal(eng.jiraAccountId, 'jira-account-alice-777');
      assert.deepEqual(eng.routingTags, ['auth', 'backend', 'security']);
      assert.equal(eng.isActive, true);
    });

    it('upserts an existing engineer on identical projectId + userId', async () => {
      const updated = await ownershipService.registerProjectEngineer({
        projectId: testProjectIdA,
        userId: 'eng-alice',
        displayName: 'Alice E. Smith',
        email: 'alice.smith@eng.local',
        jiraAccountId: 'jira-account-alice-777',
        routingTags: ['auth', 'core'],
        isActive: true,
      });

      assert.equal(updated.displayName, 'Alice E. Smith');
      assert.equal(updated.email, 'alice.smith@eng.local');
      assert.deepEqual(updated.routingTags, ['auth', 'core']);
    });

    it('rejects registration when project does not exist', async () => {
      const bogusProjectId = crypto.randomUUID();
      await assert.rejects(
        () =>
          ownershipService.registerProjectEngineer({
            projectId: bogusProjectId,
            userId: 'eng-ghost',
            displayName: 'Ghost',
            email: 'ghost@nowhere.local',
          }),
        (err: Error) => {
          assert.ok(err instanceof ProjectNotFoundError);
          return true;
        },
      );
    });
  });

  // ============================================================================
  // 2. Eligible Engineers Listing & Tenant Isolation
  // ============================================================================
  describe('Eligible Engineers Listing', () => {
    let inactiveCharlieId: string;

    before(async () => {
      await ownershipService.registerProjectEngineer({
        projectId: testProjectIdA,
        userId: 'eng-bob',
        displayName: 'Bob Developer',
        email: 'bob@eng.local',
        jiraAccountId: 'jira-account-bob-888',
        routingTags: ['database', 'backend'],
        isActive: true,
      });

      const charlie = await ownershipService.registerProjectEngineer({
        projectId: testProjectIdA,
        userId: 'eng-charlie',
        displayName: 'Charlie Inactive',
        email: 'charlie@eng.local',
        isActive: false,
      });
      inactiveCharlieId = charlie.id;

      // Register an engineer in Project B
      await ownershipService.registerProjectEngineer({
        projectId: testProjectIdB,
        userId: 'eng-dan-b',
        displayName: 'Dan Project B',
        email: 'dan@projb.local',
        isActive: true,
      });
    });

    it('lists only active engineers when activeOnly is true (default)', async () => {
      const list = await ownershipService.listEligibleEngineers({
        projectId: testProjectIdA,
      });

      assert.ok(list.length >= 2);
      assert.ok(list.every(e => e.isActive));
      assert.ok(!list.some(e => e.id === inactiveCharlieId));
      assert.ok(!list.some(e => e.displayName === 'Dan Project B'));
    });

    it('includes inactive engineers when activeOnly is false', async () => {
      const list = await ownershipService.listEligibleEngineers({
        projectId: testProjectIdA,
        activeOnly: false,
      });

      assert.ok(list.some(e => e.id === inactiveCharlieId));
    });

    it('returns engineers sorted alphabetically by displayName', async () => {
      const list = await ownershipService.listEligibleEngineers({
        projectId: testProjectIdA,
        activeOnly: true,
      });

      const names = list.map(e => e.displayName);
      const sortedNames = [...names].sort((a, b) => a.localeCompare(b));
      assert.deepEqual(names, sortedNames);
    });

    it('enforces multi-tenant project isolation: Project B cannot see Project A engineers', async () => {
      const listB = await ownershipService.listEligibleEngineers({
        projectId: testProjectIdB,
      });

      assert.equal(listB.length, 1);
      assert.equal(listB[0]?.displayName, 'Dan Project B');
    });
  });

  // ============================================================================
  // 3. Defect Assignment, Version Tracking & Jira Sync
  // ============================================================================
  describe('Defect Assignment & Version Tracking', () => {
    let aliceId: string;
    let bobId: string;
    let inactiveCharlieId: string;

    before(async () => {
      const engineers = await ownershipService.listEligibleEngineers({
        projectId: testProjectIdA,
        activeOnly: false,
      });
      aliceId = engineers.find(e => e.userId === 'eng-alice')!.id;
      bobId = engineers.find(e => e.userId === 'eng-bob')!.id;
      inactiveCharlieId = engineers.find(e => e.userId === 'eng-charlie')!.id;
    });

    it('successfully assigns an eligible engineer and synchronizes to Jira', async () => {
      const ownership = await ownershipService.assignEngineer({
        projectId: testProjectIdA,
        bugReportId: bugReportA1,
        engineerId: aliceId,
        assignmentReason: 'Alice is the subject matter expert on auth.',
        actorUserId: 'admin-lead',
      });

      assert.ok(ownership.id);
      assert.equal(ownership.projectId, testProjectIdA);
      assert.equal(ownership.bugReportId, bugReportA1);
      assert.equal(ownership.assignedEngineerId, aliceId);
      assert.equal(ownership.assignmentSource, 'MANUAL');
      assert.equal(ownership.assignmentReason, 'Alice is the subject matter expert on auth.');
      assert.equal(ownership.ownershipVersion, 1);
      assert.equal(ownership.jiraAssigneeSyncStatus, 'SYNCHRONIZED');
      assert.equal(ownership.lastJiraSyncError, null);
      assert.equal(ownership.jiraIssueKey, 'TEST-100');
      assert.ok(ownership.assignedEngineer);
      assert.equal(ownership.assignedEngineer?.displayName, 'Alice E. Smith');

      // History checks
      assert.ok(ownership.history && ownership.history.length === 1);
      assert.equal(ownership.history[0]?.action, 'ASSIGNED');
      assert.equal(ownership.history[0]?.newEngineerId, aliceId);
      assert.equal(ownership.history[0]?.previousEngineerId, null);
      assert.equal(ownership.history[0]?.ownershipVersion, 1);

      // Verify remote Jira call occurred
      assert.equal(assignIssueCalls.length, 1);
      assert.equal(assignIssueCalls[0]?.issueIdOrKey, 'TEST-100');
      assert.equal(assignIssueCalls[0]?.accountId, 'jira-account-alice-777');

      // Verify audit trail
      const audits = await prisma.jiraConnectionAudit.findMany({
        where: { projectId: testProjectIdA },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(audits.some(a => a.eventType === 'DEFECT_ASSIGNED'));
      assert.ok(audits.some(a => a.eventType === 'JIRA_ASSIGNEE_SYNCED'));
    });

    it('reassigns to another engineer, increments version, and updates Jira', async () => {
      const reassigned = await ownershipService.assignEngineer({
        projectId: testProjectIdA,
        bugReportId: bugReportA1,
        engineerId: bobId,
        assignmentReason: 'Handing off auth defect to Bob.',
        expectedVersion: 1,
        actorUserId: 'admin-lead',
      });

      assert.equal(reassigned.assignedEngineerId, bobId);
      assert.equal(reassigned.ownershipVersion, 2);
      assert.equal(reassigned.jiraAssigneeSyncStatus, 'SYNCHRONIZED');

      // Check history has 2 records
      assert.ok(reassigned.history && reassigned.history.length === 2);
      assert.equal(reassigned.history[0]?.action, 'REASSIGNED');
      assert.equal(reassigned.history[0]?.previousEngineerId, aliceId);
      assert.equal(reassigned.history[0]?.newEngineerId, bobId);
      assert.equal(reassigned.history[0]?.ownershipVersion, 2);

      // Verify remote Jira call was made for Bob
      assert.equal(assignIssueCalls.length, 1);
      assert.equal(assignIssueCalls[0]?.accountId, 'jira-account-bob-888');
    });

    it('rejects assignment when expectedVersion does not match current version (optimistic locking)', async () => {
      await assert.rejects(
        () =>
          ownershipService.assignEngineer({
            projectId: testProjectIdA,
            bugReportId: bugReportA1,
            engineerId: aliceId,
            expectedVersion: 1, // Current version is 2!
          }),
        (err: Error) => {
          assert.ok(err instanceof JiraStaleOwnershipVersionError);
          assert.ok(err.message.includes('expected 1, but current version is 2'));
          return true;
        },
      );
    });

    it('rejects assignment when engineer is marked inactive', async () => {
      await assert.rejects(
        () =>
          ownershipService.assignEngineer({
            projectId: testProjectIdA,
            bugReportId: bugReportA1,
            engineerId: inactiveCharlieId,
            expectedVersion: 2,
          }),
        (err: Error) => {
          assert.ok(err instanceof JiraEngineerIneligibleError);
          return true;
        },
      );
    });

    it('rejects assignment when engineer belongs to a different project', async () => {
      const engineersB = await ownershipService.listEligibleEngineers({
        projectId: testProjectIdB,
      });
      const dan = engineersB[0];
      assert.ok(dan);
      const danId = dan.id;

      await assert.rejects(
        () =>
          ownershipService.assignEngineer({
            projectId: testProjectIdA,
            bugReportId: bugReportA1,
            engineerId: danId,
            expectedVersion: 2,
          }),
        (err: Error) => {
          assert.ok(err instanceof JiraEngineerNotFoundError);
          return true;
        },
      );
    });

    it('rejects assignment when bug report belongs to a different project', async () => {
      await assert.rejects(
        () =>
          ownershipService.assignEngineer({
            projectId: testProjectIdA,
            bugReportId: bugReportB1,
            engineerId: aliceId,
          }),
        (err: Error) => {
          assert.ok(err instanceof JiraBugReportNotFoundError);
          return true;
        },
      );
    });
  });

  // ============================================================================
  // 4. Partial Failure Semantics & Retry
  // ============================================================================
  describe('Partial Failure Semantics & Retry Jira Sync', () => {
    let aliceId: string;

    before(async () => {
      const engineers = await ownershipService.listEligibleEngineers({
        projectId: testProjectIdA,
      });
      aliceId = engineers.find(e => e.userId === 'eng-alice')!.id;
    });

    it('persists local ownership and records JIRA_SYNC_FAILED when remote Jira API fails', async () => {
      shouldAssignIssueFail = true;
      assignIssueErrorMessage = 'Jira upstream 503 Service Unavailable';

      const ownership = await ownershipService.assignEngineer({
        projectId: testProjectIdA,
        bugReportId: bugReportA1,
        engineerId: aliceId,
        expectedVersion: 2,
        assignmentReason: 'Reassigning back to Alice with Jira down',
      });

      // Local ownership is safely preserved!
      assert.equal(ownership.assignedEngineerId, aliceId);
      assert.equal(ownership.ownershipVersion, 3);
      assert.equal(ownership.jiraAssigneeSyncStatus, 'JIRA_SYNC_FAILED');
      assert.ok(ownership.lastJiraSyncError?.includes('503 Service Unavailable'));

      // Check failure audit event was logged
      const audits = await prisma.jiraConnectionAudit.findMany({
        where: {
          projectId: testProjectIdA,
          eventType: 'JIRA_ASSIGNEE_SYNC_FAILED',
        },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(audits.length > 0);
      assert.ok((audits[0]?.details as any)?.error?.includes('503 Service Unavailable'));
    });

    it('retries Jira sync and updates status to SYNCHRONIZED upon success', async () => {
      // Restore normal Jira mock response
      shouldAssignIssueFail = false;

      const retried = await ownershipService.retryJiraSync({
        projectId: testProjectIdA,
        bugReportId: bugReportA1,
      });

      assert.equal(retried.assignedEngineerId, aliceId);
      assert.equal(retried.jiraAssigneeSyncStatus, 'SYNCHRONIZED');
      assert.equal(retried.lastJiraSyncError, null);
      assert.equal(assignIssueCalls.length, 1);
      assert.equal(assignIssueCalls[0]?.accountId, 'jira-account-alice-777');
    });

    it('sets JIRA_SYNC_FAILED if engineer lacks Jira identity mappings', async () => {
      // Register engineer without Jira account ID or username
      const dave = await ownershipService.registerProjectEngineer({
        projectId: testProjectIdA,
        userId: 'eng-dave-nojira',
        displayName: 'Dave No Jira',
        email: 'dave@eng.local',
        isActive: true,
      });

      const ownership = await ownershipService.assignEngineer({
        projectId: testProjectIdA,
        bugReportId: bugReportA1,
        engineerId: dave.id,
        expectedVersion: 4,
      });

      assert.equal(ownership.assignedEngineerId, dave.id);
      assert.equal(ownership.ownershipVersion, 5);
      assert.equal(ownership.jiraAssigneeSyncStatus, 'JIRA_SYNC_FAILED');
      assert.ok(ownership.lastJiraSyncError?.includes('does not have a linked Jira account ID'));
    });
  });

  // ============================================================================
  // 5. Defect Unassignment
  // ============================================================================
  describe('Defect Unassignment', () => {
    it('successfully unassigns engineer and synchronizes null assignee to Jira', async () => {
      const unassigned = await ownershipService.unassignEngineer({
        projectId: testProjectIdA,
        bugReportId: bugReportA1,
        expectedVersion: 5,
        reason: 'Investigating unassigned pool triage.',
        actorUserId: 'admin-lead',
      });

      assert.equal(unassigned.assignedEngineerId, null);
      assert.equal(unassigned.assignedEngineer, null);
      assert.equal(unassigned.ownershipVersion, 6);
      assert.equal(unassigned.jiraAssigneeSyncStatus, 'SYNCHRONIZED');

      // Check history
      assert.ok(unassigned.history);
      assert.equal(unassigned.history[0]?.action, 'UNASSIGNED');
      assert.equal(unassigned.history[0]?.newEngineerId, null);
      assert.equal(unassigned.history[0]?.ownershipVersion, 6);

      // Verify remote call with accountId: null
      assert.equal(assignIssueCalls.length, 1);
      assert.equal(assignIssueCalls[0]?.accountId, null);

      // Audit trail
      const audits = await prisma.jiraConnectionAudit.findMany({
        where: {
          projectId: testProjectIdA,
          eventType: 'DEFECT_UNASSIGNED',
        },
      });
      assert.ok(audits.length > 0);
    });

    it('rejects unassignment with stale expectedVersion', async () => {
      await assert.rejects(
        () =>
          ownershipService.unassignEngineer({
            projectId: testProjectIdA,
            bugReportId: bugReportA1,
            expectedVersion: 1, // Current is 6
          }),
        (err: Error) => {
          assert.ok(err instanceof JiraStaleOwnershipVersionError);
          return true;
        },
      );
    });

    it('rejects unassignment when ownership does not exist', async () => {
      await assert.rejects(
        () =>
          ownershipService.unassignEngineer({
            projectId: testProjectIdA,
            bugReportId: bugReportA2, // Not yet assigned
          }),
        (err: Error) => {
          assert.ok(err instanceof JiraOwnershipNotFoundError);
          return true;
        },
      );
    });
  });

  // ============================================================================
  // 6. Remote Jira Sync & Conflict Detection
  // ============================================================================
  describe('Remote Jira Sync & Conflict Detection', () => {
    let bobId: string;

    before(async () => {
      const engineers = await ownershipService.listEligibleEngineers({
        projectId: testProjectIdA,
      });
      bobId = engineers.find(e => e.userId === 'eng-bob')!.id;
    });

    it('syncs remote Jira assignment when remote assignee matches a registered project engineer', async () => {
      mockRemoteAssignee = {
        accountId: 'jira-account-bob-888',
        displayName: 'Bob Developer',
        emailAddress: 'bob@eng.local',
      };

      const synced = await ownershipService.syncOwnershipFromJira({
        projectId: testProjectIdA,
        bugReportId: bugReportA1,
      });

      assert.equal(synced.assignedEngineerId, bobId);
      assert.equal(synced.assignmentSource, 'JIRA_SYNCHRONIZED');
      assert.equal(synced.jiraAssigneeSyncStatus, 'SYNCHRONIZED');
      assert.equal(synced.ownershipVersion, 7);
      assert.equal(synced.history?.[0]?.action, 'JIRA_SYNC_UPDATED');
    });

    it('syncs remote unassigned state when remote Jira issue has no assignee', async () => {
      mockRemoteAssignee = null;

      const synced = await ownershipService.syncOwnershipFromJira({
        projectId: testProjectIdA,
        bugReportId: bugReportA1,
      });

      assert.equal(synced.assignedEngineerId, null);
      assert.equal(synced.jiraAssigneeSyncStatus, 'SYNCHRONIZED');
      assert.equal(synced.ownershipVersion, 8);
      assert.equal(synced.history?.[0]?.action, 'UNASSIGNED');
    });

    it('detects conflict and logs audit event when remote assignee is unknown to project', async () => {
      mockRemoteAssignee = {
        accountId: 'jira-external-vendor-999',
        displayName: 'External Contractor',
        emailAddress: 'contractor@external.org',
      };

      const synced = await ownershipService.syncOwnershipFromJira({
        projectId: testProjectIdA,
        bugReportId: bugReportA1,
      });

      assert.equal(synced.jiraAssigneeSyncStatus, 'CONFLICT_DETECTED');
      assert.ok(synced.lastJiraSyncError?.includes('External Contractor'));
      assert.equal(synced.ownershipVersion, 9);

      const audits = await prisma.jiraConnectionAudit.findMany({
        where: {
          projectId: testProjectIdA,
          eventType: 'OWNERSHIP_CONFLICT_DETECTED',
        },
      });
      assert.ok(audits.length > 0);
    });
  });

  // ============================================================================
  // 7. Ownership Retrieval & Cross-Project Isolation
  // ============================================================================
  describe('Ownership Retrieval & Multi-Tenant Isolation', () => {
    it('returns null when querying defect ownership for a bug report without ownership', async () => {
      const ownership = await ownershipService.getDefectOwnership({
        projectId: testProjectIdA,
        bugReportId: bugReportA2,
      });

      assert.equal(ownership, null);
    });

    it('retrieves full ownership record with populated engineer, link, and history', async () => {
      const ownership = await ownershipService.getDefectOwnership({
        projectId: testProjectIdA,
        bugReportId: bugReportA1,
      });

      assert.ok(ownership);
      assert.equal(ownership.bugReportId, bugReportA1);
      assert.equal(ownership.jiraIssueKey, 'TEST-100');
      assert.ok(Array.isArray(ownership.history));
      assert.ok(ownership.history.length >= 5);
    });

    it('rejects cross-project retrieval attempts with JiraCrossProjectError', async () => {
      await assert.rejects(
        () =>
          ownershipService.getDefectOwnership({
            projectId: testProjectIdB, // Wrong tenant!
            bugReportId: bugReportA1,
          }),
        (err: Error) => {
          assert.ok(err instanceof JiraCrossProjectError);
          return true;
        },
      );
    });
  });
});
