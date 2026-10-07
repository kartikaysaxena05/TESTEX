/**
 * @file apps/desktop/src/main/jira-phase92-ui.test.tsx
 * UI component tests for Bug Evidence & Artifact Attachment to Jira (V7 Phase 92).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StructuredBugReportPanel } from '../renderer/features/failures/StructuredBugReportPanel.js';
import type {
  StructuredBugReportDto,
  JiraExternalIssueDto,
  JiraProjectConfigDto,
  JiraAttachableEvidenceItemDto,
} from '@ai-quality/contracts';

describe('StructuredBugReportPanel Phase 92 Evidence Attachment UI Tests', () => {
  const projectId = '00000000-0000-0000-0000-000000000222';
  const failureCaseId = '00000000-0000-0000-0000-000000000333';
  const externalIssueId = '00000000-0000-0000-0000-000000000777';

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

  const baseJiraIssue: JiraExternalIssueDto = {
    id: externalIssueId,
    projectId,
    failureCaseId,
    bugReportId: baseReport.id,
    connectionId: 'conn-1',
    jiraProjectId: '10000',
    jiraProjectKey: 'ENG',
    jiraIssueId: '10001',
    jiraIssueKey: 'ENG-101',
    jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-101',
    issueType: 'Bug',
    summary: 'Payment 500 Defect in Checkout',
    priority: 'High',
    creationStatus: 'CREATED',
    requestFingerprint: 'mock-sha256-fingerprint',
    metadataSnapshot: null,
    createdBy: 'USER',
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

  const sampleEvidenceItems: readonly JiraAttachableEvidenceItemDto[] = [
    {
      evidenceReferenceId: 'ref-screenshot-1',
      artifactType: 'SCREENSHOT',
      logicalName: 'checkout_failure_view.png',
      mimeType: 'image/png',
      byteSize: 20480,
      sha256: 'screenshotsha256',
      isEligible: true,
      requiresRedaction: false,
      isAlreadyAttached: false,
    },
    {
      evidenceReferenceId: 'ref-console-2',
      artifactType: 'CONSOLE_LOG',
      logicalName: 'browser_console.log',
      mimeType: 'text/plain',
      byteSize: 4096,
      sha256: 'consolesha256',
      isEligible: true,
      requiresRedaction: true,
      isAlreadyAttached: false,
    },
    {
      evidenceReferenceId: 'ref-trace-3',
      artifactType: 'PLAYWRIGHT_TRACE',
      logicalName: 'session_trace.zip',
      mimeType: 'application/zip',
      byteSize: 102400,
      sha256: 'tracesha256',
      isEligible: false,
      ineligibilityReason:
        'Sensitive trace content cannot be safely sanitized; manual review required',
      requiresRedaction: false,
      isAlreadyAttached: false,
    },
    {
      evidenceReferenceId: 'ref-dom-4',
      artifactType: 'DOM_SNAPSHOT',
      logicalName: 'modal_dom.html',
      mimeType: 'text/html',
      byteSize: 8192,
      sha256: 'domsha256',
      isEligible: false,
      ineligibilityReason: 'Artifact is already attached to this Jira issue',
      requiresRedaction: true,
      isAlreadyAttached: true,
      attachedJiraAttachmentId: 'jira-att-444',
      attachmentStatus: 'ATTACHED',
    },
  ];

  beforeEach(() => {
    (globalThis as any).window = {
      desktop: {
        jira: {
          getProjectConfig: async () => ({
            ok: true,
            data: baseJiraConfig,
          }),
          getIssue: async () => ({
            ok: true,
            data: baseJiraIssue,
          }),
          listAttachableEvidence: async () => ({
            ok: true,
            data: sampleEvidenceItems,
          }),
          attachEvidence: async () => ({
            ok: true,
            data: {
              externalIssueId,
              jiraIssueKey: 'ENG-101',
              totalRequested: 2,
              attachedCount: 2,
              blockedCount: 0,
              failedCount: 0,
              skippedCount: 0,
              attachments: [],
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

  it('renders Evidence Attachment section when Jira issue exists', () => {
    const html = renderToString(
      <StructuredBugReportPanel
        projectId={projectId}
        failureCaseId={failureCaseId}
        initialReport={baseReport}
        initialJiraIssue={baseJiraIssue}
        initialJiraConfig={baseJiraConfig}
        initialAttachableEvidence={sampleEvidenceItems}
      />,
    );

    assert.ok(html.includes('data-testid="jira-evidence-attachment-section"'));
    assert.ok(html.includes('Execution Evidence &amp; Artifact Attachments'));
    assert.ok(html.includes('ENG-101'));
  });

  it('renders evidence item rows with correct artifact types and logical names', () => {
    const html = renderToString(
      <StructuredBugReportPanel
        projectId={projectId}
        failureCaseId={failureCaseId}
        initialReport={baseReport}
        initialJiraIssue={baseJiraIssue}
        initialJiraConfig={baseJiraConfig}
        initialAttachableEvidence={sampleEvidenceItems}
      />,
    );

    assert.ok(html.includes('data-testid="evidence-row-ref-screenshot-1"'));
    assert.ok(html.includes('checkout_failure_view.png'));
    assert.ok(html.includes('SCREENSHOT'));

    assert.ok(html.includes('data-testid="evidence-row-ref-console-2"'));
    assert.ok(html.includes('browser_console.log'));
    assert.ok(html.includes('CONSOLE_LOG'));

    assert.ok(html.includes('data-testid="evidence-row-ref-trace-3"'));
    assert.ok(html.includes('session_trace.zip'));
    assert.ok(html.includes('PLAYWRIGHT_TRACE'));

    assert.ok(html.includes('data-testid="evidence-row-ref-dom-4"'));
    assert.ok(html.includes('modal_dom.html'));
    assert.ok(html.includes('DOM_SNAPSHOT'));
  });

  it('renders Auto-Redaction badge for text/log evidence items', () => {
    const html = renderToString(
      <StructuredBugReportPanel
        projectId={projectId}
        failureCaseId={failureCaseId}
        initialReport={baseReport}
        initialJiraIssue={baseJiraIssue}
        initialJiraConfig={baseJiraConfig}
        initialAttachableEvidence={sampleEvidenceItems}
      />,
    );

    assert.ok(html.includes('data-testid="badge-redaction-ref-console-2"'));
    assert.ok(html.includes('Auto-Redaction'));
    // Screenshot is binary and should NOT have Auto-Redaction badge
    assert.ok(!html.includes('data-testid="badge-redaction-ref-screenshot-1"'));
  });

  it('renders Blocked (Trace) badge and disables checkbox for Playwright trace', () => {
    const html = renderToString(
      <StructuredBugReportPanel
        projectId={projectId}
        failureCaseId={failureCaseId}
        initialReport={baseReport}
        initialJiraIssue={baseJiraIssue}
        initialJiraConfig={baseJiraConfig}
        initialAttachableEvidence={sampleEvidenceItems}
      />,
    );

    assert.ok(html.includes('Blocked (Trace)'));
    // Verify trace checkbox is disabled
    assert.ok(
      html.includes('data-testid="checkbox-evidence-ref-trace-3"') && html.includes('disabled=""'),
    );
  });

  it('renders Attached badge and disables checkbox for already attached evidence', () => {
    const html = renderToString(
      <StructuredBugReportPanel
        projectId={projectId}
        failureCaseId={failureCaseId}
        initialReport={baseReport}
        initialJiraIssue={baseJiraIssue}
        initialJiraConfig={baseJiraConfig}
        initialAttachableEvidence={sampleEvidenceItems}
      />,
    );

    assert.ok(html.includes('Attached'));
    assert.ok(
      html.includes('data-testid="checkbox-evidence-ref-dom-4"') && html.includes('disabled=""'),
    );
  });

  it('renders Attach Selected Evidence button with preselected eligible count', () => {
    const html = renderToString(
      <StructuredBugReportPanel
        projectId={projectId}
        failureCaseId={failureCaseId}
        initialReport={baseReport}
        initialJiraIssue={baseJiraIssue}
        initialJiraConfig={baseJiraConfig}
        initialAttachableEvidence={sampleEvidenceItems}
      />,
    );

    assert.ok(html.includes('data-testid="btn-attach-evidence"'));
    // Screenshot and Console are eligible -> 2 items preselected
    assert.ok(html.includes('Attach Selected Evidence (2)'));
  });

  it('renders empty message when no evidence artifacts are found', () => {
    const html = renderToString(
      <StructuredBugReportPanel
        projectId={projectId}
        failureCaseId={failureCaseId}
        initialReport={baseReport}
        initialJiraIssue={baseJiraIssue}
        initialJiraConfig={baseJiraConfig}
        initialAttachableEvidence={[]}
      />,
    );

    assert.ok(html.includes('No evidence artifacts found for this failure case.'));
  });
});
