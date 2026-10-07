/**
 * @file apps/desktop/src/main/final-qa-report-ui.test.tsx
 * UI component tests for Final QA Report & Release Readiness Intelligence (V7 Phase 109).
 * Tests FinalQaReportCard rendering, verdict banner, KPI metrics, tabs, and export triggers via SSR.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { FinalQaReportCard } from '../renderer/features/qa-report/FinalQaReportCard.js';
import type { FinalQaReportDto } from '@ai-quality/contracts';

describe('Final QA Report UI Component Tests (Phase 109)', () => {
  const projectId = '00000000-0000-0000-0000-000000000111';

  const mockReport: FinalQaReportDto = {
    id: '11111111-1111-1111-1111-111111111111',
    projectId,
    environmentId: null,
    reportKey: 'REP-20260912-UI01',
    releaseIdentifier: 'v1.5.0-rc2',
    buildIdentifier: 'build-99',
    commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
    branch: 'release/1.5',
    environmentName: 'Staging E2E',
    reportVersion: 1,
    status: 'DRAFT',
    verdict: 'READY',
    policyVersion: '1.0.0',
    policyRulesEvaluated: [],
    policyRulesPassed: [],
    policyRulesFailed: [],
    blockingRules: [],
    warningRules: [],
    readinessScore: 96.5,
    readinessExplanation: 'Release criteria fully met with 0 blockers.',
    executiveSummary: 'Authoritative evaluation for release v1.5.0-rc2.',
    overallRecommendation: 'Proceed with standard deployment rollout.',
    requirementSummary: {
      total: 10,
      testable: 10,
      covered: 10,
      verified: 10,
      uncovered: 0,
      failing: 0,
      blocked: 0,
      coveragePercentage: 100,
      verifiedPercentage: 100,
    },
    testExecutionSummary: {
      totalDistinctTests: 40,
      totalExecutionAttempts: 42,
      passedCount: 40,
      failedCount: 0,
      blockedCount: 0,
      automationErrorCount: 0,
      cancelledCount: 0,
      passPercentage: 100,
      retryCount: 2,
      passedAfterRetryCount: 2,
    },
    failureDomainSummary: {
      totalFailures: 0,
      applicationDefects: 0,
      automationFailures: 0,
      testDataFailures: 0,
      environmentFailures: 0,
      blockedFailures: 0,
      inconclusiveFailures: 0,
      unknownFailures: 0,
    },
    defectSummary: {
      totalDefects: 0,
      openCritical: 0,
      openHigh: 0,
      openMedium: 0,
      openLow: 0,
      resolvedOrClosed: 2,
      verifiedFixed: 2,
      reverificationPending: 0,
      reverificationFailed: 0,
    },
    reverificationSummary: {
      totalReverifications: 2,
      verifiedFixedCount: 2,
      stillFailingCount: 0,
      differentFailureCount: 0,
      blockedCount: 0,
      inconclusiveCount: 0,
    },
    regressionSummary: {
      totalRetestPlans: 1,
      totalRegressionTests: 15,
      passedRegressionTests: 15,
      failedRegressionTests: 0,
      untestedRegressionTests: 0,
      allMandatoryRegressionsPassed: true,
    },
    flakinessSummary: {
      flakyTestsDetected: 1,
      flakyExecutionAttempts: 2,
      flakinessRate: 4.8,
    },
    automationHealth: { status: 'HEALTHY', issues: [], details: {} },
    environmentHealth: { status: 'HEALTHY', issues: [], details: {} },
    testDataHealth: { status: 'HEALTHY', issues: [], details: {} },
    securityFindings: [],
    releaseBlockers: [],
    residualRisks: [],
    knownLimitations: [],
    traceabilityMatrix: [
      {
        requirementId: 'req-1',
        requirementKey: 'REQ-101',
        title: 'Authentication flow',
        priority: 'P0',
        status: 'ACTIVE',
        associatedTestCount: 2,
        verified: true,
        failingTests: [],
      },
    ],
    evidenceReferences: [],
    sourceSnapshotTime: '2026-09-12T04:00:00.000Z',
    finalizedAt: null,
    generatedByActorId: 'SYSTEM',
    isStale: false,
    staleReason: null,
    checksumSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    createdAt: '2026-09-12T04:00:00.000Z',
    updatedAt: '2026-09-12T04:00:00.000Z',
  };

  it('renders empty state when report is null', () => {
    const html = renderToString(
      <FinalQaReportCard projectId={projectId} report={null} />,
    );

    assert.ok(html.includes('Final QA Report &amp; Release Readiness'));
    assert.ok(html.includes('No QA Report has been generated for this release.'));
    assert.ok(html.includes('Generate QA Report'));
  });

  it('renders populated state with verdict banner, readiness score, and metrics', () => {
    const html = renderToString(
      <FinalQaReportCard projectId={projectId} report={mockReport} />,
    );

    assert.ok(html.includes('Final QA &amp; Release Readiness'));
    assert.ok(html.includes('v1.5.0-rc2'));
    assert.ok(html.includes('REP-20260912-UI01'));
    assert.ok(html.includes('READY'));
    assert.ok(html.includes('96.5'));
    assert.ok(html.includes('Release criteria fully met with 0 blockers.'));
    assert.ok(html.includes('Finalize Report'));
    assert.ok(html.includes('Export JSON'));
    assert.ok(html.includes('Export Markdown'));
  });

  it('renders tab headers for drill-down navigation', () => {
    const html = renderToString(
      <FinalQaReportCard projectId={projectId} report={mockReport} />,
    );

    assert.ok(html.includes('Blockers &amp; Risks'));
    assert.ok(html.includes('Requirement Traceability'));
    assert.ok(html.includes('Defects &amp; Reverifications'));
    assert.ok(html.includes('Harness &amp; Environment Health'));
  });
});
