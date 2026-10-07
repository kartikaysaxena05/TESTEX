/**
 * @file apps/desktop/src/main/reverification-ui.test.tsx
 * UI component tests for Defect Reverification Foundation (V7 Phase 97).
 * Verifies DefectReverificationCard rendering, status badges, historical test version preservation,
 * safety guards, action controls, and strict absence of manual verification buttons.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DefectReverificationCard } from '../renderer/features/failures/DefectReverificationCard.js';
import { StructuredBugReportPanel } from '../renderer/features/failures/StructuredBugReportPanel.js';
import type { StructuredBugReportDto } from '@ai-quality/contracts';

describe('Defect Reverification UI Tests (Phase 97)', () => {
  const projectId = '00000000-0000-0000-0000-000000000111';
  const failureCaseId = '00000000-0000-0000-0000-000000000222';
  const bugReportId = '00000000-0000-0000-0000-000000000333';

  it('renders DefectReverificationCard with core status badges and controls', () => {
    const html = renderToString(
      <DefectReverificationCard
        projectId={projectId}
        failureCaseId={failureCaseId}
        bugReportId={bugReportId}
        jiraIssueKey="ENG-105"
      />,
    );

    assert.ok(html.includes('defect-reverification-card'), 'Card container rendered');
    assert.ok(html.includes('Defect Reverification Foundation'), 'Card title rendered');
    assert.ok(html.includes('reverification-status-badge'), 'Status badge rendered');
    assert.ok(html.includes('reverification-eligibility-badge'), 'Eligibility badge rendered');
    assert.ok(html.includes('original-test-version'), 'Original test version rendered');
    assert.ok(html.includes('safety-status-badge'), 'Safety status badge rendered');
    assert.ok(html.includes('prepare-reverification-btn'), 'Prepare button rendered');
    assert.ok(html.includes('ENG-105'), 'Jira issue key rendered');
  });

  it('strictly enforces absence of manual verification or browser execution controls (Prompt Section 34, 35)', () => {
    const html = renderToString(
      <DefectReverificationCard
        projectId={projectId}
        failureCaseId={failureCaseId}
        bugReportId={bugReportId}
      />,
    );

    // Prompt Section 34 & 35:
    // Do NOT add 'Run Reverification', 'Run Browser Test', 'Mark Fixed'
    assert.equal(html.includes('Run Reverification'), false, "Must NOT have 'Run Reverification'");
    assert.equal(html.includes('Run Browser Test'), false, "Must NOT have 'Run Browser Test'");
    assert.equal(html.includes('Mark Fixed'), false, "Must NOT have 'Mark Fixed'");
    assert.equal(html.includes('Verified Fixed'), false, "Must NOT have 'Verified Fixed'");
    assert.ok(
      html.includes('Execution reserved for Phase 98'),
      'Explains execution belongs to Phase 98',
    );
  });

  it('embeds DefectReverificationCard cleanly inside StructuredBugReportPanel', () => {
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
      title: 'Checkout 500 Defect',
      summary: 'Unhandled exception during checkout',
      environmentSummary: {
        os: 'mac',
        browserEngine: 'CHROMIUM',
        viewport: '1920x1080',
      },
      requirementId: null,
      requirementKey: null,
      requirementVersion: null,
      testCaseId: '00000000-0000-0000-0000-000000000444',
      testCaseKey: 'TC-001',
      testCaseVersion: 1,
      executionPlanId: '00000000-0000-0000-0000-000000000666',
      preconditions: [],
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
      expectedBehavior: 'Checkout completes',
      actualBehavior: '500 Internal error',
      probableLayer: 'BACKEND_SERVICE',
      probableComponent: 'PaymentGateway',
      rootCauseHypothesis: 'Null pointer exception',
      severity: 'CRITICAL',
      priority: 'HIGH',
      clusterKey: 'CLUSTER-01',
      clusterMemberCount: 1,
      calibratedScore: 0.95,
      evidenceReferences: [],
      limitationsAndUnknowns: [],
      reportMarkdown: '# Bug Report',
      reportFingerprint: 'fp-001',
      generatorVersion: '1.0.0',
      isStale: false,
      stalenessReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const panelHtml = renderToString(
      <StructuredBugReportPanel
        projectId={projectId}
        failureCaseId={failureCaseId}
        initialReport={baseReport}
      />,
    );

    assert.ok(
      panelHtml.includes('defect-reverification-card'),
      'StructuredBugReportPanel embeds reverification card',
    );
  });
});
