/**
 * @file packages/core/src/workflow/workflow-sync-service.test.ts
 * Integration tests for V7 Phase 96 — Bug Status & External Workflow Synchronization.
 * Verifies workflow state lifecycle, transition validation, bidirectional Jira sync,
 * 3-way conflict detection & resolution, unmapped status rejection, multi-tenant isolation,
 * email notification dispatch, and audit event logging.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../database/index.js';
import { WorkflowSyncService } from './workflow-sync-service.js';
import { JiraConnectionService } from '../jira/jira-connection-service.js';
import { JiraCredentialVault } from '../jira/jira-credential-vault.js';
import {
  WorkflowCrossProjectForbiddenError,
  InvalidWorkflowTransitionError,
  WorkflowMappingNotFoundError,
} from './workflow-errors.js';
import type { IJiraClient, JiraTransitionDto } from '../jira/jira-types.js';
import type { PrismaClient } from '@prisma/client';

describe('WorkflowSyncService Integration (Phase 96)', () => {
  let prisma: PrismaClient;
  let vault: JiraCredentialVault;
  let connectionService: JiraConnectionService;
  let workflowService: WorkflowSyncService;

  const testProjectIdA = crypto.randomUUID();
  const testProjectIdB = crypto.randomUUID();

  let failureCaseA1: string;
  let failureCaseA2: string;
  let failureCaseB1: string;

  let bugReportA1: string;
  let bugReportA2: string;
  let bugReportB1: string;

  let connAId: string;
  let _issueLinkA1Id: string;

  // Mock Jira Client state
  let mockRemoteStatus = { id: '1', name: 'To Do' };
  let mockRemoteUpdatedAt = new Date();
  let transitionIssueCalls: { issueIdOrKey: string; transitionId: string }[] = [];
  let shouldTransitionFail = false;

  // Mock Email Notification Service state
  let notificationCalls: Array<{
    projectId: string;
    eventType: string;
    entityType: string;
    entityId: string;
    failureCaseId?: string;
    bugReportId?: string;
  }> = [];

  const mockEmailService = {
    async notifyWorkflowEvent(params: any) {
      notificationCalls.push(params);
    },
  } as any;

  const mockJiraClient: IJiraClient = {
    async validateConnection() {
      return {
        status: 'CONNECTED',
        validatedAt: new Date(),
        durationMs: 20,
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
        durationMs: 20,
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
    async getIssue(options) {
      return {
        id: '10050',
        key: options.issueIdOrKey,
        self: `${options.baseUrl}/rest/api/3/issue/10050`,
        fields: {
          summary: 'Simulated Issue',
          status: mockRemoteStatus,
          updated: mockRemoteUpdatedAt.toISOString(),
        },
      };
    },
    async getTransitions(_options): Promise<readonly JiraTransitionDto[]> {
      return [
        { id: '11', name: 'In Progress', to: { id: '3', name: 'In Progress' } },
        { id: '21', name: 'Done', to: { id: '5', name: 'Done' } },
        { id: '31', name: 'Reopen', to: { id: '4', name: 'Reopened' } },
        { id: '41', name: 'Close', to: { id: '6', name: 'Closed' } },
      ];
    },
    async transitionIssue(options): Promise<void> {
      transitionIssueCalls.push({
        issueIdOrKey: options.issueIdOrKey,
        transitionId: options.transitionId,
      });
      if (shouldTransitionFail) {
        throw new Error('Jira transition API failed with 500 error');
      }
    },
    async searchIssues() {
      return { issues: [], total: 0 };
    },
    async attachEvidence() {
      return [];
    },
    async assignIssue() {},
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

    workflowService = new WorkflowSyncService({
      prisma,
      jiraClient: mockJiraClient,
      vault,
      emailService: mockEmailService,
      allowLocalhostForTesting: true,
    });

    // 1. Projects
    await prisma.project.createMany({
      data: [
        { id: testProjectIdA, name: `Phase 96 Proj A ${Date.now()}` },
        { id: testProjectIdB, name: `Phase 96 Proj B ${Date.now()}` },
      ],
    });

    // 2. Requirements
    const reqA = await prisma.requirement.create({
      data: {
        projectId: testProjectIdA,
        requirementKey: `REQ-A-${Date.now().toString(36).toUpperCase()}`,
        title: 'Checkout Flow',
        originalText: 'User checkout module',
        status: 'ACTIVE',
      },
    });
    const reqB = await prisma.requirement.create({
      data: {
        projectId: testProjectIdB,
        requirementKey: `REQ-B-${Date.now().toString(36).toUpperCase()}`,
        title: 'Inventory Flow',
        originalText: 'Inventory module',
        status: 'ACTIVE',
      },
    });

    // 3. Test Cases
    const tcA = await prisma.testCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseKey: `TC-A-${Date.now().toString(36).toUpperCase()}`,
        title: 'Checkout TC',
        objective: 'Verify checkout behavior',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
        sourceRequirementId: reqA.id,
        sourceRequirementKey: reqA.requirementKey,
      },
    });
    const tcB = await prisma.testCase.create({
      data: {
        projectId: testProjectIdB,
        testCaseKey: `TC-B-${Date.now().toString(36).toUpperCase()}`,
        title: 'Inventory TC',
        objective: 'Verify inventory behavior',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
        sourceRequirementId: reqB.id,
        sourceRequirementKey: reqB.requirementKey,
      },
    });

    // 4. Executable Plans
    const planA = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA.id,
        testCaseVersionNumber: 1,
        planFingerprint: `fp-a-${Date.now()}-${Math.random()}`,
        isExecutable: true,
      },
    });
    const planB = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectIdB,
        testCaseId: tcB.id,
        testCaseVersionNumber: 1,
        planFingerprint: `fp-b-${Date.now()}-${Math.random()}`,
        isExecutable: true,
      },
    });

    // Helper for Failure Case
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
          testCaseTitle: 'Failure Run',
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
      tcA.id,
      planA.id,
      'Checkout 500 error',
    );
    const { fc: fcA2, exec: execA2 } = await createFailureCase(
      testProjectIdA,
      tcA.id,
      planA.id,
      'Stripe timeout error',
    );
    const { fc: fcB1, exec: execB1 } = await createFailureCase(
      testProjectIdB,
      tcB.id,
      planB.id,
      'Inventory out of sync',
    );

    failureCaseA1 = fcA1.id;
    failureCaseA2 = fcA2.id;
    failureCaseB1 = fcB1.id;

    // Helper for Bug Report
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
          testCaseTitle: 'Checkout Test Case',
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
      tcA.id,
      execA1.id,
      'Checkout Bug 1',
    );
    const brA2 = await createBugReport(
      testProjectIdA,
      failureCaseA2,
      tcA.id,
      execA2.id,
      'Checkout Bug 2',
    );
    const brB1 = await createBugReport(
      testProjectIdB,
      failureCaseB1,
      tcB.id,
      execB1.id,
      'Inventory Bug 1',
    );

    bugReportA1 = brA1.id;
    bugReportA2 = brA2.id;
    bugReportB1 = brB1.id;

    // 5. Jira Connection for Project A
    const connA = await connectionService.createConnection({
      projectId: testProjectIdA,
      displayName: 'Jira Integration A',
      baseUrl: 'https://test-jira.atlassian.net',
      accountIdentifier: 'admin@test.local',
      apiToken: 'mock-valid-jira-token',
    });
    connAId = connA.id;

    // 6. Jira Issue Link for Project A - failureCaseA1
    const linkA1 = await prisma.jiraIssueLink.create({
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
    _issueLinkA1Id = linkA1.id;
  });

  beforeEach(() => {
    mockRemoteStatus = { id: '1', name: 'To Do' };
    mockRemoteUpdatedAt = new Date();
    transitionIssueCalls = [];
    shouldTransitionFail = false;
    notificationCalls = [];
  });

  after(async () => {
    if (!prisma) return;
    await prisma.workflowSyncEvent.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.bugWorkflowState.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.workflowStatusMapping.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.jiraIssueLink.deleteMany({
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

  describe('Workflow State Retrieval & Initialization (getState)', () => {
    it('initializes default workflow state with OPEN and NOT_VERIFIED', async () => {
      const state = await workflowService.getState({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
      });

      assert.ok(state.id);
      assert.strictEqual(state.projectId, testProjectIdA);
      assert.strictEqual(state.failureCaseId, failureCaseA1);
      assert.strictEqual(state.currentStatus, 'OPEN');
      assert.strictEqual(state.verificationStatus, 'NOT_VERIFIED');
      assert.strictEqual(state.workflowVersion, 1);
      assert.strictEqual(state.syncVersion, 0);
    });

    it('retrieves state by bugReportId when failureCaseId is omitted', async () => {
      const state = await workflowService.getState({
        projectId: testProjectIdA,
        bugReportId: bugReportA1,
      });

      assert.strictEqual(state.failureCaseId, failureCaseA1);
      assert.strictEqual(state.currentStatus, 'OPEN');
    });

    it('rejects cross-project access (Project B accessing Project A failureCase)', async () => {
      await assert.rejects(
        workflowService.getState({
          projectId: testProjectIdB,
          failureCaseId: failureCaseA1,
        }),
        (err: unknown) => err instanceof WorkflowCrossProjectForbiddenError,
      );
    });
  });

  describe('Internal Status Transitions (updateInternalStatus)', () => {
    it('successfully transitions from OPEN to IN_PROGRESS and increments workflowVersion', async () => {
      const updated = await workflowService.updateInternalStatus({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        targetStatus: 'IN_PROGRESS',
        reason: 'Engineer started investigating',
        actor: 'eng-alice',
        syncExternal: false,
      });

      assert.strictEqual(updated.currentStatus, 'IN_PROGRESS');
      assert.strictEqual(updated.workflowVersion, 2);
      assert.strictEqual(updated.statusReason, 'Engineer started investigating');
      assert.strictEqual(updated.lastChangedBy, 'eng-alice');
    });

    it('marks defect as RESOLVED, updates timestamps, sends Phase 95 email notification, keeps NOT_VERIFIED', async () => {
      const updated = await workflowService.updateInternalStatus({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        targetStatus: 'RESOLVED',
        reason: 'Bug fix deployed to staging',
        actor: 'eng-bob',
        syncExternal: false,
      });

      assert.strictEqual(updated.currentStatus, 'RESOLVED');
      assert.ok(updated.resolvedAt);
      assert.strictEqual(updated.resolutionReason, 'Bug fix deployed to staging');
      // CRITICAL INVARIANT: verificationStatus must NOT be set to VERIFIED. Must remain NOT_VERIFIED.
      assert.strictEqual(updated.verificationStatus, 'NOT_VERIFIED');

      // Verify email notification dispatch
      assert.strictEqual(notificationCalls.length, 1);
      assert.strictEqual(notificationCalls[0]?.eventType, 'TEST_REVERIFICATION_REQUIRED');
      assert.strictEqual(notificationCalls[0]?.failureCaseId, failureCaseA1);
    });

    it('transitions from RESOLVED to REOPENED with reopen timestamp and keeps NOT_VERIFIED', async () => {
      const updated = await workflowService.updateInternalStatus({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        targetStatus: 'REOPENED',
        reason: 'Defect still observed in staging',
        actor: 'qa-tester',
        syncExternal: false,
      });

      assert.strictEqual(updated.currentStatus, 'REOPENED');
      assert.ok(updated.reopenedAt);
      assert.strictEqual(updated.reopenReason, 'Defect still observed in staging');
      assert.strictEqual(updated.verificationStatus, 'NOT_VERIFIED');
    });

    it('transitions from REOPENED to CLOSED (via RESOLVED -> CLOSED) and sets closedAt', async () => {
      // Reopened -> Resolved
      await workflowService.updateInternalStatus({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        targetStatus: 'RESOLVED',
        reason: 'Fixed again',
        syncExternal: false,
      });

      // Resolved -> Closed
      const closed = await workflowService.updateInternalStatus({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        targetStatus: 'CLOSED',
        reason: 'Sign-off complete',
        syncExternal: false,
      });

      assert.strictEqual(closed.currentStatus, 'CLOSED');
      assert.ok(closed.closedAt);
    });

    it('strictly forbids jumping directly from CLOSED to IN_PROGRESS without reopening', async () => {
      await assert.rejects(
        workflowService.updateInternalStatus({
          projectId: testProjectIdA,
          failureCaseId: failureCaseA1,
          targetStatus: 'IN_PROGRESS',
          syncExternal: false,
        }),
        (err: unknown) => {
          assert.ok(err instanceof InvalidWorkflowTransitionError);
          assert.match(err.message, /cannot transition directly to 'IN_PROGRESS'/i);
          return true;
        },
      );
    });

    it('handles identical status as a valid no-op without bumping version', async () => {
      const beforeState = await workflowService.getState({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
      });

      const same = await workflowService.updateInternalStatus({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        targetStatus: 'CLOSED',
        syncExternal: false,
      });

      assert.strictEqual(same.workflowVersion, beforeState.workflowVersion);
    });

    it('rejects cross-project updateInternalStatus', async () => {
      await assert.rejects(
        workflowService.updateInternalStatus({
          projectId: testProjectIdB,
          failureCaseId: failureCaseA1,
          targetStatus: 'REOPENED',
          syncExternal: false,
        }),
        (err: unknown) => err instanceof WorkflowCrossProjectForbiddenError,
      );
    });
  });

  describe('Status Mapping CRUD', () => {
    let createdMappingId: string;

    it('returns default status mappings when no custom project mappings exist', async () => {
      const mappings = await workflowService.getStatusMappings({
        projectId: testProjectIdA,
      });

      assert.ok(mappings.length >= 8);
      const doneMapping = mappings.find(m => m.externalStatusName.toLowerCase() === 'done');
      assert.ok(doneMapping);
      assert.strictEqual(doneMapping?.internalStatus, 'RESOLVED');
    });

    it('creates and saves a custom workflow status mapping', async () => {
      const custom = await workflowService.saveStatusMapping({
        projectId: testProjectIdA,
        externalSystem: 'JIRA',
        externalStatusName: 'QA Validation',
        internalStatus: 'RESOLVED',
        direction: 'BIDIRECTIONAL',
        conflictPolicy: 'MANUAL_REVIEW',
        isEnabled: true,
      });

      createdMappingId = custom.id;
      assert.ok(custom.id);
      assert.strictEqual(custom.externalStatusName, 'QA Validation');
      assert.strictEqual(custom.internalStatus, 'RESOLVED');
    });

    it('retrieves saved custom status mapping in project list', async () => {
      const mappings = await workflowService.getStatusMappings({
        projectId: testProjectIdA,
      });

      const found = mappings.find(m => m.id === createdMappingId);
      assert.ok(found);
      assert.strictEqual(found?.externalStatusName, 'QA Validation');
    });

    it('updates an existing workflow status mapping', async () => {
      const updated = await workflowService.saveStatusMapping({
        id: createdMappingId,
        projectId: testProjectIdA,
        externalSystem: 'JIRA',
        externalStatusName: 'QA Validation Active',
        internalStatus: 'RESOLVED',
        direction: 'EXTERNAL_TO_INTERNAL',
        conflictPolicy: 'EXTERNAL_WINS',
        isEnabled: true,
      });

      assert.strictEqual(updated.externalStatusName, 'QA Validation Active');
      assert.strictEqual(updated.direction, 'EXTERNAL_TO_INTERNAL');
      assert.strictEqual(updated.conflictPolicy, 'EXTERNAL_WINS');
    });

    it('deletes a custom status mapping with project isolation', async () => {
      // Rejects cross-project deletion
      await assert.rejects(
        workflowService.deleteStatusMapping({
          projectId: testProjectIdB,
          mappingId: createdMappingId,
        }),
        (err: unknown) => err instanceof WorkflowMappingNotFoundError,
      );

      const result = await workflowService.deleteStatusMapping({
        projectId: testProjectIdA,
        mappingId: createdMappingId,
      });

      assert.strictEqual(result.deleted, true);

      // Verify deletion
      const mappings = await workflowService.getStatusMappings({
        projectId: testProjectIdA,
      });
      assert.ok(!mappings.some(m => m.id === createdMappingId));
    });
  });

  describe('Synchronization & Conflict Handling (syncNow)', () => {
    it('returns BLOCKED when defect has no linked Jira issue', async () => {
      const result = await workflowService.syncNow({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA2, // Has no Jira link
      });

      assert.strictEqual(result.lastSyncResult, 'BLOCKED');
      assert.match(result.lastSyncError || '', /No linked Jira issue found/);
    });

    it('returns NO_CHANGE when internal and external statuses are already synchronized', async () => {
      // Reset defect A1 to OPEN and lastSyncedExternalStatus to 'To Do'
      await prisma.bugWorkflowState.update({
        where: { failureCaseId: failureCaseA1 },
        data: {
          currentStatus: 'OPEN',
          lastExternalStatus: 'To Do',
          lastSyncedInternalStatus: 'OPEN',
          lastSyncedExternalStatus: 'To Do',
          lastSyncResult: 'SYNCED',
          lastSyncError: null,
        },
      });

      mockRemoteStatus = { id: '1', name: 'To Do' };

      const result = await workflowService.syncNow({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
      });

      assert.strictEqual(result.lastSyncResult, 'NO_CHANGE');
      assert.strictEqual(result.currentStatus, 'OPEN');
      assert.strictEqual(transitionIssueCalls.length, 0);
    });

    it('synchronizes external change into internal state (Jira "In Progress" -> internal IN_PROGRESS)', async () => {
      // Jira moved to 'In Progress' externally
      mockRemoteStatus = { id: '3', name: 'In Progress' };
      mockRemoteUpdatedAt = new Date(Date.now() + 1000);

      const result = await workflowService.syncNow({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
      });

      assert.strictEqual(result.lastSyncResult, 'SYNCED');
      assert.strictEqual(result.currentStatus, 'IN_PROGRESS');
      assert.strictEqual(result.lastExternalStatus, 'In Progress');
      assert.strictEqual(result.lastSyncedInternalStatus, 'IN_PROGRESS');
      assert.strictEqual(result.lastSyncedExternalStatus, 'In Progress');
    });

    it('synchronizes external Jira "Done" into internal RESOLVED without marking verified', async () => {
      mockRemoteStatus = { id: '5', name: 'Done' };
      mockRemoteUpdatedAt = new Date(Date.now() + 2000);

      const result = await workflowService.syncNow({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
      });

      assert.strictEqual(result.lastSyncResult, 'SYNCED');
      assert.strictEqual(result.currentStatus, 'RESOLVED');
      assert.ok(result.resolvedAt);
      // CRITICAL INVARIANT: verificationStatus must remain NOT_VERIFIED
      assert.strictEqual(result.verificationStatus, 'NOT_VERIFIED');
    });

    it('pushes internal status change to Jira via transitionIssue when Jira was unchanged', async () => {
      // Internal was moved to REOPENED while Jira remained 'Done' (matches lastSyncedExternalStatus)
      await prisma.bugWorkflowState.update({
        where: { failureCaseId: failureCaseA1 },
        data: {
          currentStatus: 'REOPENED',
          lastSyncedInternalStatus: 'RESOLVED',
          lastSyncedExternalStatus: 'Done',
          lastExternalStatus: 'Done',
        },
      });

      mockRemoteStatus = { id: '5', name: 'Done' };

      const result = await workflowService.syncNow({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
      });

      assert.strictEqual(result.lastSyncResult, 'SYNCED');
      assert.strictEqual(result.currentStatus, 'REOPENED');
      assert.strictEqual(transitionIssueCalls.length, 1);
      assert.strictEqual(transitionIssueCalls[0]?.issueIdOrKey, 'TEST-100');
      assert.strictEqual(transitionIssueCalls[0]?.transitionId, '31'); // Reopen transition
    });

    it('flags CONFLICT when both internal and external changed independently under MANUAL_REVIEW policy', async () => {
      // Internal changed from IN_PROGRESS to WONT_FIX
      // External changed from In Progress to Done
      // Snapshot was IN_PROGRESS / In Progress
      await prisma.bugWorkflowState.update({
        where: { failureCaseId: failureCaseA1 },
        data: {
          currentStatus: 'WONT_FIX',
          lastSyncedInternalStatus: 'IN_PROGRESS',
          lastSyncedExternalStatus: 'In Progress',
          updatedAt: new Date(Date.now() - 5000),
        },
      });

      mockRemoteStatus = { id: '5', name: 'Done' };
      mockRemoteUpdatedAt = new Date();

      const result = await workflowService.syncNow({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
      });

      assert.strictEqual(result.lastSyncResult, 'CONFLICT');
      // Crucial: Neither side was overwritten! Internal remains WONT_FIX
      assert.strictEqual(result.currentStatus, 'WONT_FIX');
      assert.ok(result.conflictState);
      const conflict = result.conflictState as Record<string, unknown>;
      assert.strictEqual(conflict['internalStatus'], 'WONT_FIX');
      assert.strictEqual(conflict['externalStatus'], 'Done');
    });

    it('rejects unmapped external status without guessing or corrupting internal state (Prompt Section 11)', async () => {
      // Remote status changed to an unmapped Jira status
      mockRemoteStatus = { id: '999', name: 'Under Security Review' };

      const result = await workflowService.syncNow({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
      });

      assert.strictEqual(result.lastSyncResult, 'UNMAPPED');
      assert.strictEqual(result.lastExternalStatus, 'Under Security Review');
      assert.match(result.lastSyncError || '', /unmapped/i);
    });
  });

  describe('Conflict Resolution (resolveConflict)', () => {
    it('manually resolves conflict in favor of INTERNAL and pushes to Jira', async () => {
      // Set up defect in conflict state
      await prisma.bugWorkflowState.update({
        where: { failureCaseId: failureCaseA1 },
        data: {
          currentStatus: 'CLOSED',
          conflictState: {
            internalStatus: 'CLOSED',
            externalStatus: 'In Progress',
          },
          lastSyncResult: 'CONFLICT',
        },
      });

      transitionIssueCalls = [];

      const resolved = await workflowService.resolveConflict({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        chosenWinner: 'INTERNAL',
        resolutionNote: 'Management decided defect is closed',
        actor: 'lead-dev',
      });

      assert.strictEqual(resolved.currentStatus, 'CLOSED');
      assert.strictEqual(resolved.lastSyncResult, 'SYNCED');
      assert.strictEqual(resolved.conflictState, null);
      assert.strictEqual(transitionIssueCalls.length, 1);
      assert.strictEqual(transitionIssueCalls[0]?.transitionId, '41'); // Close transition
    });

    it('manually resolves conflict in favor of EXTERNAL and pulls into internal state', async () => {
      // Set up defect in conflict state
      await prisma.bugWorkflowState.update({
        where: { failureCaseId: failureCaseA1 },
        data: {
          currentStatus: 'REOPENED',
          lastExternalStatus: 'Done',
          conflictState: {
            internalStatus: 'REOPENED',
            externalStatus: 'Done',
          },
          lastSyncResult: 'CONFLICT',
        },
      });

      const resolved = await workflowService.resolveConflict({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        chosenWinner: 'EXTERNAL',
        overrideStatus: 'Done',
        resolutionNote: 'Accepting QA verification in Jira',
        actor: 'lead-dev',
      });

      assert.strictEqual(resolved.currentStatus, 'RESOLVED');
      assert.strictEqual(resolved.lastSyncResult, 'SYNCED');
      assert.strictEqual(resolved.conflictState, null);
      // Verification status still remains NOT_VERIFIED
      assert.strictEqual(resolved.verificationStatus, 'NOT_VERIFIED');
    });
  });

  describe('Audit Trail & Event Logging (listSyncEvents)', () => {
    it('retrieves paginated audit events for the failureCase', async () => {
      const events = await workflowService.listSyncEvents({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        page: 1,
        pageSize: 10,
      });

      assert.ok(events.total > 0);
      assert.ok(events.items.length > 0);
      const latest = events.items[0];
      assert.ok(latest);
      assert.strictEqual(latest.projectId, testProjectIdA);
      assert.strictEqual(latest.failureCaseId, failureCaseA1);
      assert.ok(latest.direction);
      assert.ok(latest.syncResult);
    });

    it('maintains strict multi-tenant isolation in audit event retrieval', async () => {
      const eventsB = await workflowService.listSyncEvents({
        projectId: testProjectIdB,
        failureCaseId: failureCaseA1,
      });

      // Project B query must return 0 events for failureCase belonging to Project A
      assert.strictEqual(eventsB.total, 0);
      assert.strictEqual(eventsB.items.length, 0);
    });
  });
});
