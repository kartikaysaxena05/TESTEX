/**
 * @file apps/desktop/src/main/jira-phase91-ui.test.tsx
 * UI component tests for Automated Jira Issue Creation integration card and modal (V7 Phase 91).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StructuredBugReportPanel } from '../renderer/features/failures/StructuredBugReportPanel.js';
import type { StructuredBugReportDto } from '@ai-quality/contracts';

describe('StructuredBugReportPanel Phase 91 Jira UI Tests', () => {
  const baseReport: StructuredBugReportDto = {
    id: '00000000-0000-0000-0000-000000000111',
    projectId: '00000000-0000-0000-0000-000000000222',
    failureCaseId: '00000000-0000-0000-0000-000000000333',
    analysisRunId: null,
    reportNumber: 'BUG-000001',
    revision: 1,
    status: 'READY',
    defectState: 'CONFIRMED_APPLICATION_DEFECT',
    isApplicationDefect: true,
    title: 'Checkout Button Unresponsive On High Latency',
    summary: 'Failure case exhibiting persistent button unresponsiveness during checkout.',
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
    expectedBehavior: 'Order completes with confirmation modal',
    actualBehavior: 'Button clicked but server responds with 500 error',
    probableLayer: 'FRONTEND_COMPONENT',
    probableComponent: 'CheckoutButton',
    rootCauseHypothesis: 'React state mutation race condition in unmounted hook',
    severity: 'CRITICAL',
    priority: 'HIGH',
    clusterKey: 'CLUSTER-01',
    clusterMemberCount: 3,
    calibratedScore: 0.92,
    evidenceReferences: [],
    limitationsAndUnknowns: [],
    reportMarkdown: '# Checkout Bug Report\nServer responds with 500 error',
    reportFingerprint: 'fp-12345',
    generatorVersion: '1.0.0',
    isStale: false,
    stalenessReason: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    (globalThis as any).window = {
      desktop: {
        jira: {
          getProjectConfig: async () => ({
            success: true,
            data: {
              id: 'cfg-1',
              projectId: '00000000-0000-0000-0000-000000000222',
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
            },
          }),
          getIssue: async () => ({
            success: true,
            data: null,
          }),
          createIssue: async () => ({
            success: true,
            data: {
              id: 'ext-iss-1',
              projectId: '00000000-0000-0000-0000-000000000222',
              failureCaseId: '00000000-0000-0000-0000-000000000333',
              bugReportId: '00000000-0000-0000-0000-000000000111',
              connectionId: 'conn-1',
              jiraIssueId: '10001',
              jiraIssueKey: 'ENG-101',
              jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-101',
              jiraProjectKey: 'ENG',
              issueType: 'Bug',
              requestFingerprint: 'fp-123',
              status: 'CREATED',
              errorMessage: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
        },
        failures: {
          getBugReport: async () => ({
            ok: true,
            data: baseReport,
          }),
          listBugReportHistory: async () => ({
            ok: true,
            data: [baseReport],
          }),
        },
      },
    };
  });

  it('renders Jira Issue Integration card within the structured bug report panel', () => {
    const html = renderToString(
      <StructuredBugReportPanel
        projectId="00000000-0000-0000-0000-000000000222"
        failureCaseId="00000000-0000-0000-0000-000000000333"
        initialReport={baseReport}
      />,
    );

    assert.ok(html.includes('Jira Issue Integration'));
    assert.ok(html.includes('Target Project:'));
    assert.ok(html.includes('Configured Issue Type:'));
  });

  it('shows restriction warning when defect is an AUTOMATION_FAILURE', () => {
    const automationFailureReport: StructuredBugReportDto = {
      ...baseReport,
      defectState: 'AUTOMATION_FAILURE',
      isApplicationDefect: false,
    };

    const html = renderToString(
      <StructuredBugReportPanel
        projectId="00000000-0000-0000-0000-000000000222"
        failureCaseId="00000000-0000-0000-0000-000000000333"
        initialReport={automationFailureReport}
      />,
    );

    assert.ok(
      html.includes(
        'Jira issue creation is restricted to verified application defects. Automation, environment, or inconclusive runs cannot be published as Jira bugs.',
      ),
    );
    // Should NOT show the create Jira button when ineligible
    assert.ok(!html.includes('data-testid="btn-create-jira-issue"'));
  });

  it('shows restriction warning when isApplicationDefect is false', () => {
    const diagnosticReport: StructuredBugReportDto = {
      ...baseReport,
      isApplicationDefect: false,
    };

    const html = renderToString(
      <StructuredBugReportPanel
        projectId="00000000-0000-0000-0000-000000000222"
        failureCaseId="00000000-0000-0000-0000-000000000333"
        initialReport={diagnosticReport}
      />,
    );

    assert.ok(
      html.includes(
        'Jira issue creation is restricted to verified application defects. Automation, environment, or inconclusive runs cannot be published as Jira bugs.',
      ),
    );
    assert.ok(!html.includes('data-testid="btn-create-jira-issue"'));
  });
});
