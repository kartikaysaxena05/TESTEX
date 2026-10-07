/**
 * @file apps/desktop/src/main/workflow-sync-ui.test.tsx
 * UI component tests for Bug Status & External Workflow Synchronization (V7 Phase 96).
 * Verifies WorkflowSyncCard rendering within StructuredBugReportPanel and standalone,
 * status badges, verification status callouts, conflict banners, and transition controls.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StructuredBugReportPanel } from '../renderer/features/failures/StructuredBugReportPanel.js';
import { WorkflowSyncCard } from '../renderer/features/jira/WorkflowSyncCard.js';
import type { StructuredBugReportDto, JiraProjectConfigDto } from '@ai-quality/contracts';

describe('Workflow & External Synchronization UI Tests (Phase 96)', () => {
  const projectId = '00000000-0000-0000-0000-000000000111';
  const failureCaseId = '00000000-0000-0000-0000-000000000222';
  const bugReportId = '00000000-0000-0000-0000-000000000333';

  const baseReport: StructuredBugReportDto = {
    id: bugReportId,
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

  beforeEach(() => {
    (globalThis as any).window = {
      desktop: {
        workflow: {
          getState: async () => ({
            ok: true,
            data: {
              id: 'state-1',
              projectId,
              failureCaseId,
              bugReportId,
              currentStatus: 'OPEN',
              verificationStatus: 'NOT_VERIFIED',
              statusReason: null,
              resolvedAt: null,
              resolutionReason: null,
              reopenedAt: null,
              reopenReason: null,
              closedAt: null,
              lastChangedBy: 'SYSTEM',
              workflowVersion: 1,
              lastExternalStatus: null,
              lastExternalStatusId: null,
              lastSyncedInternalStatus: null,
              lastSyncedExternalStatus: null,
              lastSyncedAt: null,
              lastExternalUpdatedAt: null,
              syncVersion: 0,
              lastSyncResult: null,
              lastSyncError: null,
              conflictState: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
          updateInternalStatus: async () => ({ ok: true, data: null }),
          getStatusMappings: async () => ({ ok: true, data: [] }),
          saveStatusMapping: async () => ({ ok: true, data: null }),
          deleteStatusMapping: async () => ({ ok: true, data: { deleted: true } }),
          syncNow: async () => ({ ok: true, data: null }),
          resolveConflict: async () => ({ ok: true, data: null }),
          listSyncEvents: async () => ({
            ok: true,
            data: { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 },
          }),
        },
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
          listEligibleEngineers: async () => ({ ok: true, data: [] }),
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

  describe('Integration with StructuredBugReportPanel', () => {
    it('renders the WorkflowSyncCard inside StructuredBugReportPanel', () => {
      const html = renderToString(
        <StructuredBugReportPanel
          projectId={projectId}
          failureCaseId={failureCaseId}
          initialReport={baseReport}
          initialJiraConfig={baseJiraConfig}
        />,
      );

      assert.ok(html.includes('data-testid="workflow-sync-card"'));
      assert.ok(html.includes('Workflow &amp; Status Synchronization'));
      assert.ok(html.includes('data-testid="sync-now-button"'));
      assert.ok(html.includes('data-testid="internal-status-badge"'));
      assert.ok(html.includes('data-testid="external-jira-status-badge"'));
      assert.ok(html.includes('data-testid="verification-status-badge"'));
      assert.ok(html.includes('data-testid="sync-result-badge"'));
      assert.ok(html.includes('data-testid="target-status-select"'));
      assert.ok(html.includes('data-testid="update-status-button"'));
    });
  });

  describe('WorkflowSyncCard Standalone Rendering', () => {
    it('renders initial unlinked state with NOT_VERIFIED and PENDING sync badges', () => {
      const html = renderToString(
        <WorkflowSyncCard
          projectId={projectId}
          failureCaseId={failureCaseId}
          bugReportId={bugReportId}
        />,
      );

      assert.ok(html.includes('data-testid="workflow-sync-card"'));
      assert.ok(html.includes('data-testid="internal-status-badge"'));
      assert.ok(html.includes('OPEN'));
      assert.ok(html.includes('data-testid="verification-status-badge"'));
      assert.ok(html.includes('NOT_VERIFIED'));
      assert.ok(html.includes('Independent of Jira resolution'));
      assert.ok(html.includes('data-testid="external-jira-status-badge"'));
      assert.ok(html.includes('Unlinked'));
      assert.ok(html.includes('data-testid="sync-result-badge"'));
      assert.ok(html.includes('PENDING'));
    });

    it('renders linked defect with Jira issue key as Not Synced initially', () => {
      const html = renderToString(
        <WorkflowSyncCard
          projectId={projectId}
          failureCaseId={failureCaseId}
          bugReportId={bugReportId}
          jiraIssueKey="TEST-100"
        />,
      );

      assert.ok(html.includes('data-testid="external-jira-status-badge"'));
      assert.ok(html.includes('Not Synced'));
    });

    it('renders status options in dropdown including RESOLVED, REOPENED, and CLOSED', () => {
      const html = renderToString(
        <WorkflowSyncCard
          projectId={projectId}
          failureCaseId={failureCaseId}
          bugReportId={bugReportId}
        />,
      );

      assert.ok(html.includes('value="OPEN"'));
      assert.ok(html.includes('value="IN_PROGRESS"'));
      assert.ok(html.includes('value="RESOLVED"'));
      assert.ok(html.includes('value="REOPENED"'));
      assert.ok(html.includes('value="CLOSED"'));
      assert.ok(html.includes('value="WONT_FIX"'));
      assert.ok(html.includes('value="DUPLICATE"'));
    });
  });
});
