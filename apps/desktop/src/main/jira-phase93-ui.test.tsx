/**
 * @file apps/desktop/src/main/jira-phase93-ui.test.tsx
 * UI component tests for Jira Duplicate Prevention & Existing-Issue Linking (V7 Phase 93).
 * Verifies duplicate detected banners, conflict detected banners, create button suppression,
 * existing linked issue cards, cluster badges, and link confirmation modal.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StructuredBugReportPanel } from '../renderer/features/failures/StructuredBugReportPanel.js';
import type {
  StructuredBugReportDto,
  JiraProjectConfigDto,
  JiraDuplicateEvaluationDto,
  JiraIssueLinkDto,
} from '@ai-quality/contracts';

describe('StructuredBugReportPanel Phase 93 Duplicate Prevention UI Tests', () => {
  const projectId = '00000000-0000-0000-0000-000000000222';
  const failureCaseId = '00000000-0000-0000-0000-000000000333';
  const externalIssueId = '00000000-0000-0000-0000-000000000777';
  const linkId = '00000000-0000-0000-0000-000000000888';

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

  const sampleDuplicateEvaluation: JiraDuplicateEvaluationDto = {
    decision: 'USE_EXISTING',
    ruleId: 'JIRA_RULE_1_EXACT_BUG_REPORT',
    reason: 'Exact bug report is already linked to Jira issue ENG-202.',
    jiraIssueKey: 'ENG-202',
    jiraIssueId: '10202',
    jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-202',
    candidateCount: 1,
    evaluatedAt: new Date().toISOString(),
  };

  const sampleClusterDuplicateEvaluation: JiraDuplicateEvaluationDto = {
    decision: 'USE_EXISTING',
    ruleId: 'JIRA_RULE_3_DEFECT_CLUSTER',
    reason:
      "Failure belongs to authoritative defect cluster 'CLUSTER-PAYMENT-42', which is already linked to Jira issue ENG-303.",
    defectClusterId: 'cluster-42',
    defectClusterKey: 'CLUSTER-PAYMENT-42',
    clusterMembershipAuthoritative: true,
    jiraIssueKey: 'ENG-303',
    jiraIssueId: '10303',
    jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-303',
    candidateCount: 1,
    evaluatedAt: new Date().toISOString(),
  };

  const sampleConflictEvaluation: JiraDuplicateEvaluationDto = {
    decision: 'INCONCLUSIVE',
    ruleId: 'JIRA_RULE_3_CLUSTER_MERGE_CONFLICT',
    reason:
      "Merged defect cluster 'CLUSTER-PAYMENT-42' contains multiple conflicting Jira issues (ENG-301, ENG-302). Manual triage is required.",
    defectClusterId: 'cluster-42',
    defectClusterKey: 'CLUSTER-PAYMENT-42',
    clusterMembershipAuthoritative: true,
    candidateCount: 2,
    evaluatedAt: new Date().toISOString(),
  };

  const sampleJiraLink: JiraIssueLinkDto = {
    id: linkId,
    projectId,
    failureCaseId,
    bugReportId: baseReport.id,
    defectClusterId: 'cluster-42',
    externalIssueId,
    jiraConnectionId: 'conn-1',
    jiraProjectKey: 'ENG',
    jiraIssueId: '10404',
    jiraIssueKey: 'ENG-404',
    jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-404',
    linkReason: 'Linked to existing defect ticket',
    linkSource: 'USER_CONFIRMED_LINK',
    ruleId: 'JIRA_RULE_3_DEFECT_CLUSTER',
    decision: 'USE_EXISTING',
    isActive: true,
    invalidationReason: null,
    supersededById: null,
    metadataSnapshot: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

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
            data: null,
          }),
          createIssue: async () => ({
            ok: true,
            data: null,
          }),
          listAttachableEvidence: async () => ({
            ok: true,
            data: [],
          }),
          attachEvidence: async () => ({
            ok: true,
            data: {
              externalIssueId,
              jiraIssueKey: 'ENG-101',
              totalRequested: 0,
              attachedCount: 0,
              blockedCount: 0,
              failedCount: 0,
              skippedCount: 0,
              attachments: [],
            },
          }),
          getAttachmentStatus: async () => ({
            ok: true,
            data: [],
          }),
          evaluateDuplicate: async () => ({
            ok: true,
            data: sampleDuplicateEvaluation,
          }),
          linkExistingIssue: async () => ({
            ok: true,
            data: sampleJiraLink,
          }),
          getIssueLink: async () => ({
            ok: true,
            data: sampleJiraLink,
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

  it('renders duplicate detected banner when duplicate evaluation decision is USE_EXISTING', () => {
    const html = renderToString(
      <StructuredBugReportPanel
        projectId={projectId}
        failureCaseId={failureCaseId}
        initialReport={baseReport}
        initialJiraConfig={baseJiraConfig}
        initialDuplicateEvaluation={sampleDuplicateEvaluation}
      />,
    );

    assert.ok(html.includes('data-testid="jira-duplicate-detected-banner"'));
    assert.ok(html.includes('Existing Jira Issue Found'));
    assert.ok(html.includes('JIRA_RULE_1_EXACT_BUG_REPORT'));
    assert.ok(html.includes('ENG-202'));
    assert.ok(html.includes('data-testid="btn-link-existing-jira-issue"'));
    assert.ok(html.includes('Link Existing Issue'));
  });

  it('suppresses "Create Jira Issue" button when duplicate is detected', () => {
    const html = renderToString(
      <StructuredBugReportPanel
        projectId={projectId}
        failureCaseId={failureCaseId}
        initialReport={baseReport}
        initialJiraConfig={baseJiraConfig}
        initialDuplicateEvaluation={sampleDuplicateEvaluation}
      />,
    );

    // Create Jira Issue button must NOT be present
    assert.ok(!html.includes('data-testid="btn-create-jira-issue"'));
  });

  it('renders cluster badge when duplicate is detected via authoritative defect cluster', () => {
    const html = renderToString(
      <StructuredBugReportPanel
        projectId={projectId}
        failureCaseId={failureCaseId}
        initialReport={baseReport}
        initialJiraConfig={baseJiraConfig}
        initialDuplicateEvaluation={sampleClusterDuplicateEvaluation}
      />,
    );

    assert.ok(html.includes('data-testid="jira-defect-cluster-match-badge"'));
    assert.ok(html.includes('CLUSTER-PAYMENT-42'));
    assert.ok(html.includes('JIRA_RULE_3_DEFECT_CLUSTER'));
    assert.ok(html.includes('ENG-303'));
  });

  it('renders conflict warning banner when evaluation decision is INCONCLUSIVE', () => {
    const html = renderToString(
      <StructuredBugReportPanel
        projectId={projectId}
        failureCaseId={failureCaseId}
        initialReport={baseReport}
        initialJiraConfig={baseJiraConfig}
        initialDuplicateEvaluation={sampleConflictEvaluation}
      />,
    );

    assert.ok(html.includes('data-testid="jira-duplicate-conflict-banner"'));
    assert.ok(html.includes('Defect Cluster Conflict Detected'));
    assert.ok(html.includes('JIRA_RULE_3_CLUSTER_MERGE_CONFLICT'));
    assert.ok(html.includes('multiple conflicting Jira issues'));
    // Create button must NOT be rendered when conflict exists
    assert.ok(!html.includes('data-testid="btn-create-jira-issue"'));
  });

  it('renders linked issue card with link source and cluster badges when initialJiraLink is provided', () => {
    const html = renderToString(
      <StructuredBugReportPanel
        projectId={projectId}
        failureCaseId={failureCaseId}
        initialReport={baseReport}
        initialJiraConfig={baseJiraConfig}
        initialJiraLink={sampleJiraLink}
      />,
    );

    assert.ok(html.includes('data-testid="jira-linked-issue-card"'));
    assert.ok(html.includes('Linked Jira Issue:'));
    assert.ok(html.includes('ENG-404'));
    assert.ok(html.includes('data-testid="jira-link-source-badge"'));
    assert.ok(html.includes('User Confirmed Link'));
    assert.ok(html.includes('data-testid="jira-status-badge"'));
    assert.ok(html.includes('Linked'));
  });

  it('renders "Create Jira Issue" button when evaluation is clean (no duplicate)', () => {
    const cleanEvaluation: JiraDuplicateEvaluationDto = {
      decision: 'CREATE_NEW',
      ruleId: 'JIRA_RULE_6_NO_DUPLICATE',
      reason: 'No existing Jira issue or defect cluster match was found.',
      candidateCount: 0,
      evaluatedAt: new Date().toISOString(),
    };

    const html = renderToString(
      <StructuredBugReportPanel
        projectId={projectId}
        failureCaseId={failureCaseId}
        initialReport={baseReport}
        initialJiraConfig={baseJiraConfig}
        initialDuplicateEvaluation={cleanEvaluation}
      />,
    );

    assert.ok(html.includes('data-testid="btn-create-jira-issue"'));
    assert.ok(!html.includes('data-testid="jira-duplicate-detected-banner"'));
    assert.ok(!html.includes('data-testid="jira-duplicate-conflict-banner"'));
  });
});
