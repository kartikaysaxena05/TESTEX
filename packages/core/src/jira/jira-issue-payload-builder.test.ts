/**
 * @file packages/core/src/jira/jira-issue-payload-builder.test.ts
 * Unit tests for Jira issue payload generation, ADF formatting, epistemic demarcation,
 * and credential redaction (V7 Phase 91).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JiraIssuePayloadBuilder } from './jira-issue-payload-builder.js';
import type { JiraProjectConfigDto } from '@ai-quality/contracts';

describe('JiraIssuePayloadBuilder (Phase 91)', () => {
  const mockConfig: JiraProjectConfigDto = {
    id: 'cfg-1',
    projectId: 'proj-1',
    connectionId: 'conn-1',
    jiraProjectId: '10000',
    jiraProjectKey: 'ENG',
    jiraProjectName: 'Engineering',
    selectedIssueTypeId: '10001',
    selectedIssueTypeName: 'Bug',
    defaultPriorityId: '2',
    defaultPriorityName: 'High',
    defaultComponentId: '30001',
    defaultComponentName: 'Auth Service',
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

  const mockBugReport: any = {
    id: 'report-1',
    projectId: 'proj-1',
    failureCaseId: 'fc-1',
    reportNumber: 'BUG-0001',
    revision: 1,
    title: 'Authentication token expiration fails to trigger refresh modal on checkout',
    summary:
      'When the auth token expires during checkout flow, user is locked out without refresh.',
    applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
    isApplicationDefect: true,
    testCaseKey: 'TC-101',
    testCaseTitle: 'Checkout Authentication Flow',
    expectedResult: 'System displays auth refresh modal with Bearer secret-token-xyz.',
    actualResult: 'Application throws HTTP 500 with password=super-secret-pw and crash occurs.',
    failedStepIndex: 1,
    failedStepAction: 'Submit checkout form with expired token',
    reproductionStepsJson: [
      { action: 'Navigate to checkout page' },
      { action: 'Wait for session expiry' },
    ],
    classificationCategory: 'APPLICATION_STATE_MUTATION',
    severity: 'HIGH',
    priority: 'HIGH',
    probableLayer: 'FRONTEND_COMPONENT',
    probableComponent: 'CheckoutModal',
    rootCauseSummary: 'Token refresher listener was unmounted before callback completion.',
    reproducibilityState: 'CONSISTENTLY_REPRODUCIBLE',
    reproductionAttempts: 5,
    reproductionSuccessCount: 5,
    reproducibilityRatio: 1.0,
    overallConfidence: 0.98,
    confidenceBand: 'HIGH',
    environmentJson: { browser: 'Chrome', os: 'macOS' },
    evidenceReferencesJson: [],
    knownLimitationsJson: [],
    unknownsJson: [],
  };

  describe('Summary Formatting & Length Bounds', () => {
    it('truncates summary to 254 characters and removes newlines', () => {
      const longTitle = 'Very long summary '.repeat(20) + '\nwith unwanted newline';
      const report = { ...mockBugReport, title: longTitle };

      const payload = JiraIssuePayloadBuilder.buildPayload({
        config: mockConfig as any,
        bugReport: report,
        deploymentType: 'JIRA_CLOUD',
      });

      assert.ok(payload.fields.summary.length <= 254);
      assert.ok(!payload.fields.summary.includes('\n'));
      assert.ok(!payload.fields.summary.includes('\r'));
    });

    it('preserves clean short summaries with project key prefix without truncation', () => {
      const payload = JiraIssuePayloadBuilder.buildPayload({
        config: mockConfig as any,
        bugReport: mockBugReport,
        deploymentType: 'JIRA_CLOUD',
      });

      assert.equal(payload.fields.summary, `[ENG] ${mockBugReport.title}`);
    });
  });

  describe('Epistemic Demarcation & ADF Structure (Jira Cloud)', () => {
    it('generates valid ADF document root for Jira Cloud', () => {
      const payload = JiraIssuePayloadBuilder.buildPayload({
        config: mockConfig as any,
        bugReport: mockBugReport,
        deploymentType: 'JIRA_CLOUD',
      });

      const desc = payload.fields.description as any;
      assert.equal(desc.type, 'doc');
      assert.equal(desc.version, 1);
      assert.ok(Array.isArray(desc.content));
      assert.ok(desc.content.length > 0);
    });

    it('clearly demarcates FACT, DETERMINISTIC CLASSIFICATION, and AI INFERENCE', () => {
      const payload = JiraIssuePayloadBuilder.buildPayload({
        config: mockConfig as any,
        bugReport: mockBugReport,
        deploymentType: 'JIRA_CLOUD',
      });

      const jsonStr = JSON.stringify(payload.fields.description);

      // Verify FACT section
      assert.ok(jsonStr.includes('Observed Test Behavior (FACT)'));
      assert.ok(jsonStr.includes('Actual Result:'));
      assert.ok(jsonStr.includes('Expected Result:'));
      assert.ok(jsonStr.includes('Steps to Reproduce:'));

      // Verify DETERMINISTIC CLASSIFICATION section
      assert.ok(jsonStr.includes('Failure Classification (DETERMINISTIC CLASSIFICATION)'));
      assert.ok(jsonStr.includes('APPLICATION_STATE_MUTATION'));

      // Verify AI INFERENCE section and mandatory disclaimer
      assert.ok(jsonStr.includes('Root Cause Analysis (AI INFERENCE)'));
      assert.ok(
        jsonStr.includes(
          'The root cause summary above is an AI inference based on execution telemetry and is not proven.',
        ),
      );
    });

    it('renders plain text / markdown description for Jira Server / DC', () => {
      const payload = JiraIssuePayloadBuilder.buildPayload({
        config: mockConfig as any,
        bugReport: mockBugReport,
        deploymentType: 'JIRA_DATA_CENTER',
      });

      const desc = payload.fields.description as string;
      assert.equal(typeof desc, 'string');
      assert.ok(desc.includes('h3. 3. Observed Test Behavior (FACT)'));
      assert.ok(desc.includes('h3. 5. Failure Classification (DETERMINISTIC CLASSIFICATION)'));
      assert.ok(desc.includes('h3. 6. Root Cause Analysis (AI INFERENCE)'));
      assert.ok(
        desc.includes(
          '_DISCLAIMER: The root cause summary above is an AI inference based on execution telemetry and is not proven._',
        ),
      );
    });
  });

  describe('Secret Redaction', () => {
    it('redacts sensitive bearer tokens and passwords in description and summary', () => {
      const payload = JiraIssuePayloadBuilder.buildPayload({
        config: mockConfig as any,
        bugReport: mockBugReport,
        deploymentType: 'JIRA_DATA_CENTER',
      });

      const desc = payload.fields.description as string;
      assert.ok(!desc.includes('super-secret-pw'));
      assert.ok(!desc.includes('secret-token-xyz'));
    });
  });

  describe('Component and Priority Configuration Mapping', () => {
    it('includes component when defaultComponentId is configured', () => {
      const payload = JiraIssuePayloadBuilder.buildPayload({
        config: mockConfig as any,
        bugReport: mockBugReport,
        deploymentType: 'JIRA_CLOUD',
      });

      assert.deepEqual(payload.fields.components, [{ id: '30001' }]);
    });

    it('omits component when defaultComponentId is null or empty', () => {
      const noCompConfig = { ...mockConfig, defaultComponentId: null };
      const payload = JiraIssuePayloadBuilder.buildPayload({
        config: noCompConfig as any,
        bugReport: mockBugReport,
        deploymentType: 'JIRA_CLOUD',
      });

      assert.equal(payload.fields.components, undefined);
    });

    it('includes priority when defaultPriorityId is configured', () => {
      const payload = JiraIssuePayloadBuilder.buildPayload({
        config: mockConfig as any,
        bugReport: mockBugReport,
        deploymentType: 'JIRA_CLOUD',
      });

      assert.deepEqual(payload.fields.priority, { id: '2' });
    });

    it('strictly omits priority when defaultPriorityId is null to allow Jira default', () => {
      const noPriorityConfig = { ...mockConfig, defaultPriorityId: null };
      const payload = JiraIssuePayloadBuilder.buildPayload({
        config: noPriorityConfig as any,
        bugReport: mockBugReport,
        deploymentType: 'JIRA_CLOUD',
      });

      assert.equal(payload.fields.priority, undefined);
    });
  });

  describe('Safe Label Synthesis', () => {
    it('synthesizes clean labels without illegal characters or spaces', () => {
      const payload = JiraIssuePayloadBuilder.buildPayload({
        config: mockConfig as any,
        bugReport: mockBugReport,
        deploymentType: 'JIRA_CLOUD',
      });

      const labels = payload.fields.labels;
      assert.ok(Array.isArray(labels));
      assert.ok(labels.includes('ai-quality'));
      assert.ok(labels.includes('automated-testing'));
      assert.ok(labels.includes('v6-classified'));
      assert.ok(labels.includes('application-defect'));

      for (const label of labels) {
        assert.ok(!label.includes(' '));
        assert.ok(/^[a-zA-Z0-9_-]+$/.test(label));
      }
    });
  });

  describe('Handling Unknown / Optional Fields Gracefully', () => {
    it('gracefully handles missing localization and root cause hypothesis', () => {
      const minimalReport = {
        ...mockBugReport,
        probableLayer: null,
        probableComponent: null,
        rootCauseSummary: null,
      };

      const payload = JiraIssuePayloadBuilder.buildPayload({
        config: mockConfig as any,
        bugReport: minimalReport,
        deploymentType: 'JIRA_CLOUD',
      });

      const jsonStr = JSON.stringify(payload.fields.description);
      assert.ok(jsonStr.includes('Root cause hypothesis unavailable'));
      assert.ok(!jsonStr.includes('undefined'));
    });
  });
});
