/**
 * @file apps/desktop/src/main/jira-phase94-ui.test.tsx
 * UI component tests for Engineer Assignment & Defect Ownership Workflow (V7 Phase94).
 * Verifies Defect Ownership Card rendering, unassigned/assigned states, sync status badges,
 * retry sync buttons, and action buttons.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StructuredBugReportPanel } from '../renderer/features/failures/StructuredBugReportPanel.js';
import type {
  StructuredBugReportDto,
  JiraProjectConfigDto,
  ProjectEngineerDto,
  DefectOwnershipDto,
} from '@ai-quality/contracts';

describe('StructuredBugReportPanel Phase 94 Defect Ownership UI Tests', () => {
  const projectId = '00000000-0000-0000-0000-000000000222';
  const failureCaseId = '00000000-0000-0000-0000-000000000333';
  const engineerId1 = '00000000-0000-0000-0000-000000000444';
  const engineerId2 = '00000000-0000-0000-0000-000000000555';

  const baseReport: StructuredBugReportDto = {
    id: '00000000-0000-0000-0000-000000000111',
    projectId,
    failureCaseId,
    analysisRunId: null,
    reportNumber: 'BUG-000001',
    revision: 1,
    status: 'READY',
    defectState: 'CONFIRMED_APPLICATION_DEFECT',
    isApplicationDefect: true,
    title: 'Payment 500 Defect in Checkout',
    summary: 'Failure case exhibiting unhandled exception during payment processing.',
    environmentSummary: {
      os: 'mac',
      browserEngine: 'CHROMIUM',
      viewport: '1920x1080',
    },
    requirementId: '00000000-0000-0000-0000-000000000555',
    requirementKey: 'REQ-001',
    requirementVersion: 1,
    testCaseId: '00000000-0000-0000-0000-000000000444',
    testCaseKey: 'TC-001',
    testCaseVersion: 1,
    executionPlanId: '00000000-0000-0000-0000-000000000666',
    preconditions: ['User is logged in'],
    reproductionSteps: [
      {
        stepIndex: 1,
        actionType: 'NAVIGATE',
        description: 'Navigate to checkout',
        targetSummary: '/checkout',
        expectedSummary: 'Page loaded',
        actualSummary: 'Page loaded',
        status: 'PASSED',
        isFailureStep: false,
      },
    ],
    expectedBehavior: 'Order completes with 200 OK',
    actualBehavior: 'Server returns 500 error',
    probableLayer: 'BACKEND_SERVICE',
    probableComponent: 'PaymentGateway',
    rootCauseHypothesis: 'Null pointer in transaction tokenizer',
    severity: 'CRITICAL',
    priority: 'HIGH',
    clusterKey: 'CLUSTER-01',
    clusterMemberCount: 1,
    calibratedScore: 0.95,
    evidenceReferences: [],
    limitationsAndUnknowns: [],
    reportMarkdown: '# Payment 500 Defect\nServer responds with 500 error',
    reportFingerprint: 'fp-12345',
    generatorVersion: '1.0.0',
    isStale: false,
    stalenessReason: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const baseJiraConfig: JiraProjectConfigDto = {
    id: 'cfg-1',
    projectId,
    connectionId: 'conn-1',
    jiraProjectId: '10000',
    jiraProjectKey: 'ENG',
    jiraProjectName: 'Engineering Workspace',
    selectedIssueTypeId: '10001',
    selectedIssueTypeName: 'Bug',
    defaultPriorityId: '1',
    defaultPriorityName: 'High',
    defaultComponentId: null,
    defaultComponentName: null,
    assigneeStrategy: 'UNASSIGNED',
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    fieldMappings: null,
    configStatus: 'CONFIGURED',
    staleReason: null,
    metadataSnapshot: null,
    lastRefreshedAt: new Date().toISOString(),
    createdBy: 'USER',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockEngineer1: ProjectEngineerDto = {
    id: engineerId1,
    projectId,
    userId: 'eng-sarah',
    displayName: 'Sarah Connor',
    email: 'sarah.connor@cyberdyne.corp',
    jiraAccountId: 'jira-acc-sarah-123',
    jiraUsername: null,
    isActive: true,
    routingTags: ['security', 'core-engine'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockEngineer2: ProjectEngineerDto = {
    id: engineerId2,
    projectId,
    userId: 'eng-john',
    displayName: 'John Connor',
    email: 'john.connor@cyberdyne.corp',
    jiraAccountId: 'jira-acc-john-456',
    jiraUsername: null,
    isActive: true,
    routingTags: ['frontend', 'ux'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockEligibleEngineers: ProjectEngineerDto[] = [mockEngineer1, mockEngineer2];

  beforeEach(() => {
    (globalThis as any).window = {
      desktop: {
        jira: {
          getProjectConfig: async () => ({ ok: true, data: baseJiraConfig }),
          getIssue: async () => ({ ok: true, data: null }),
          createIssue: async () => ({ ok: true, data: null }),
          listAttachableEvidence: async () => ({ ok: true, data: [] }),
          attachEvidence: async () => ({ ok: true, data: null }),
          getAttachmentStatus: async () => ({ ok: true, data: [] }),
          evaluateDuplicate: async () => ({ ok: true, data: null }),
          linkExistingIssue: async () => ({ ok: true, data: null }),
          getIssueLink: async () => ({ ok: true, data: null }),
          listEligibleEngineers: async () => ({ ok: true, data: mockEligibleEngineers }),
          getDefectOwnership: async () => ({ ok: true, data: null }),
          assignEngineer: async () => ({ ok: true, data: null }),
          unassignEngineer: async () => ({ ok: true, data: null }),
          syncOwnershipFromJira: async () => ({ ok: true, data: null }),
          retryJiraSync: async () => ({ ok: true, data: null }),
        },
        failures: {
          getBugReport: async () => ({ ok: true, data: baseReport }),
          listBugReportHistory: async () => ({ ok: true, data: [baseReport] }),
        },
      },
    };
  });

  // ============================================================================
  // 1. Unassigned State Rendering
  // ============================================================================
  describe('Unassigned Defect Ownership State', () => {
    it('renders the Defect Ownership Card with unassigned badge and assign button', () => {
      const html = renderToString(
        <StructuredBugReportPanel
          projectId={projectId}
          failureCaseId={failureCaseId}
          initialReport={baseReport}
          initialJiraConfig={baseJiraConfig}
          initialEligibleEngineers={mockEligibleEngineers}
        />,
      );

      assert.ok(html.includes('data-testid="defect-ownership-card"'));
      assert.ok(html.includes('data-testid="defect-owner-unassigned"'));
      assert.ok(html.includes('Unassigned'));
      assert.ok(html.includes('data-testid="btn-assign-engineer"'));
      assert.ok(html.includes('Assign Engineer'));
      assert.ok(!html.includes('data-testid="btn-unassign-engineer"'));
    });
  });

  // ============================================================================
  // 2. Assigned State Rendering
  // ============================================================================
  describe('Assigned Defect Ownership State', () => {
    const assignedOwnership: DefectOwnershipDto = {
      id: 'own-001',
      projectId,
      failureCaseId,
      bugReportId: baseReport.id,
      jiraIssueLinkId: 'link-001',
      assignedEngineerId: engineerId1,
      assignmentSource: 'MANUAL',
      assignmentReason: 'Lead security engineer assigned to investigate vulnerability.',
      ruleId: null,
      jiraAssigneeSyncStatus: 'SYNCHRONIZED',
      lastJiraSyncError: null,
      lastJiraSyncAt: new Date().toISOString(),
      ownershipVersion: 2,
      assignedByUserId: 'tech-lead-01',
      assignedAt: new Date().toISOString(),
      assignedEngineer: mockEngineer1,
      jiraIssueKey: 'ENG-101',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [
        {
          id: 'hist-1',
          ownershipId: 'own-001',
          projectId,
          bugReportId: baseReport.id,
          action: 'ASSIGNED',
          previousEngineerId: null,
          newEngineerId: engineerId1,
          assignmentSource: 'MANUAL',
          assignmentReason: 'Lead security engineer assigned to investigate vulnerability.',
          ruleId: null,
          jiraAssigneeSyncStatus: 'SYNCHRONIZED',
          syncErrorMessage: null,
          ownershipVersion: 1,
          actorUserId: 'tech-lead-01',
          createdAt: new Date().toISOString(),
        },
      ],
    };

    it('renders assigned engineer information, sync badge, version badge, and action buttons', () => {
      const html = renderToString(
        <StructuredBugReportPanel
          projectId={projectId}
          failureCaseId={failureCaseId}
          initialReport={baseReport}
          initialJiraConfig={baseJiraConfig}
          initialOwnership={assignedOwnership}
          initialEligibleEngineers={mockEligibleEngineers}
        />,
      );

      assert.ok(html.includes('data-testid="defect-ownership-card"'));
      assert.ok(html.includes('data-testid="defect-owner-name"'));
      assert.ok(html.includes('Sarah Connor'));
      assert.ok(html.includes('data-testid="defect-owner-email"'));
      assert.ok(html.includes('sarah.connor@cyberdyne.corp'));
      assert.ok(html.includes('data-testid="defect-ownership-version"'));
      assert.ok(html.includes('v2'));
      assert.ok(html.includes('data-testid="jira-sync-status-badge"'));
      assert.ok(html.includes('Synced with Jira'));
      assert.ok(html.includes('data-testid="btn-assign-engineer"'));
      assert.ok(html.includes('Reassign Engineer'));
      assert.ok(html.includes('data-testid="btn-unassign-engineer"'));
      assert.ok(html.includes('Unassign'));
      assert.ok(html.includes('data-testid="btn-view-ownership-history"'));
      assert.ok(html.includes('Ownership History (1)'));
    });
  });

  // ============================================================================
  // 3. Jira Sync Failure & Conflict Badges
  // ============================================================================
  describe('Jira Sync Status Variants', () => {
    it('renders Sync Failed badge and Retry button when jiraAssigneeSyncStatus is JIRA_SYNC_FAILED', () => {
      const failedSyncOwnership: DefectOwnershipDto = {
        id: 'own-002',
        projectId,
        failureCaseId,
        bugReportId: baseReport.id,
        jiraIssueLinkId: 'link-001',
        assignedEngineerId: engineerId1,
        assignmentSource: 'MANUAL',
        assignmentReason: 'Assigning Sarah',
        ruleId: null,
        jiraAssigneeSyncStatus: 'JIRA_SYNC_FAILED',
        lastJiraSyncError: 'Connection timeout connecting to Jira Cloud API',
        lastJiraSyncAt: new Date().toISOString(),
        ownershipVersion: 1,
        assignedByUserId: 'user-1',
        assignedAt: new Date().toISOString(),
        assignedEngineer: mockEngineer1,
        jiraIssueKey: 'ENG-101',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const html = renderToString(
        <StructuredBugReportPanel
          projectId={projectId}
          failureCaseId={failureCaseId}
          initialReport={baseReport}
          initialJiraConfig={baseJiraConfig}
          initialOwnership={failedSyncOwnership}
          initialEligibleEngineers={mockEligibleEngineers}
        />,
      );

      assert.ok(html.includes('data-testid="jira-sync-status-badge"'));
      assert.ok(html.includes('Jira Sync Failed'));
      assert.ok(html.includes('data-testid="btn-retry-jira-sync"'));
      assert.ok(html.includes('Retry Sync'));
      assert.ok(html.includes('Connection timeout connecting to Jira Cloud API'));
    });

    it('renders Conflict Detected badge when jiraAssigneeSyncStatus is CONFLICT_DETECTED', () => {
      const conflictOwnership: DefectOwnershipDto = {
        id: 'own-003',
        projectId,
        failureCaseId,
        bugReportId: baseReport.id,
        jiraIssueLinkId: 'link-001',
        assignedEngineerId: engineerId1,
        assignmentSource: 'JIRA_SYNCHRONIZED',
        assignmentReason: 'Conflict with remote assignee',
        ruleId: null,
        jiraAssigneeSyncStatus: 'CONFLICT_DETECTED',
        lastJiraSyncError:
          'Remote Jira assignee does not match any registered engineer in project.',
        lastJiraSyncAt: new Date().toISOString(),
        ownershipVersion: 3,
        assignedByUserId: 'JIRA_SYNC',
        assignedAt: new Date().toISOString(),
        assignedEngineer: mockEngineer1,
        jiraIssueKey: 'ENG-101',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const html = renderToString(
        <StructuredBugReportPanel
          projectId={projectId}
          failureCaseId={failureCaseId}
          initialReport={baseReport}
          initialJiraConfig={baseJiraConfig}
          initialOwnership={conflictOwnership}
          initialEligibleEngineers={mockEligibleEngineers}
        />,
      );

      assert.ok(html.includes('data-testid="jira-sync-status-badge"'));
      assert.ok(html.includes('Assignee Conflict'));
    });
  });
});
