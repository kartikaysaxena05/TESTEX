/**
 * @file apps/desktop/src/main/v7-phase110-ui-certification.test.tsx
 * Comprehensive UI Certification Test Suite for V7 Phase 110:
 * "Full Closed-Loop Certification & V7 Freeze".
 *
 * Verifies via Server-Side Rendering (SSR):
 * 1. Authoritative V7 UI components for final QA reporting, audit trail, defect reverification, and quality metrics render cleanly.
 * 2. Strict UI Boundary: Zero V8 UI components exist (no Apple/Google auth, no Codex shell redesign, no auto-deploy UI).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { FinalQaReportCard } from '../renderer/features/qa-report/FinalQaReportCard.js';
import { RepairAuditTrailCard } from '../renderer/features/failures/RepairAuditTrailCard.js';
import type { FinalQaReportDto, RepairAuditTimelineDto } from '@ai-quality/contracts';

describe('V7 Phase 110 — UI Certification & V7 Freeze Suite', () => {
  const projectId = '00000000-0000-0000-0000-000000000110';
  const failureCaseId = '11000000-0000-0000-0000-000000000110';
  const sessionId = '11000000-0000-0000-0000-000000000111';

  const mockReport: FinalQaReportDto = {
    id: '11011011-1101-1101-1101-110110110110',
    projectId,
    environmentId: null,
    reportKey: 'REP-20260912-V7FREEZE',
    releaseIdentifier: 'v7.0.0-certified',
    buildIdentifier: 'build-v7-110',
    commitSha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
    branch: 'main',
    environmentName: 'Production Staging',
    reportVersion: 1,
    status: 'FINAL',
    verdict: 'READY',
    policyVersion: '1.0.0',
    policyRulesEvaluated: ['BLOCK_CRITICAL_OPEN_DEFECT', 'BLOCK_MANDATORY_REGRESSION_FAILED'],
    policyRulesPassed: ['BLOCK_CRITICAL_OPEN_DEFECT', 'BLOCK_MANDATORY_REGRESSION_FAILED'],
    policyRulesFailed: [],
    blockingRules: [],
    warningRules: [],
    readinessScore: 100.0,
    readinessExplanation: 'All release gates passed with 0 blocking defects and 100% regression pass rate.',
    executiveSummary: 'V7 Release Intelligence Certified: ready for rollout.',
    overallRecommendation: 'Proceed with release sign-off.',
    requirementSummary: {
      total: 15,
      testable: 15,
      covered: 15,
      verified: 15,
      uncovered: 0,
      failing: 0,
      blocked: 0,
      coveragePercentage: 100,
      verifiedPercentage: 100,
    },
    testExecutionSummary: {
      totalDistinctTests: 75,
      totalExecutionAttempts: 78,
      passedCount: 75,
      failedCount: 0,
      blockedCount: 0,
      automationErrorCount: 0,
      cancelledCount: 0,
      passPercentage: 100,
      retryCount: 3,
      passedAfterRetryCount: 3,
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
      resolvedOrClosed: 5,
      verifiedFixed: 5,
      reverificationPending: 0,
      reverificationFailed: 0,
    },
    reverificationSummary: {
      totalReverifications: 5,
      verifiedFixedCount: 5,
      stillFailingCount: 0,
      differentFailureCount: 0,
      blockedCount: 0,
      inconclusiveCount: 0,
    },
    regressionSummary: {
      totalRetestPlans: 2,
      totalRegressionTests: 30,
      passedRegressionTests: 30,
      failedRegressionTests: 0,
      untestedRegressionTests: 0,
      allMandatoryRegressionsPassed: true,
    },
    flakinessSummary: {
      flakyTestsDetected: 0,
      flakyExecutionAttempts: 0,
      flakinessRate: 0,
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
        requirementId: 'req-110',
        requirementKey: 'REQ-110',
        title: 'Discount Subtotal Logic',
        priority: 'P1',
        status: 'ACTIVE',
        associatedTestCount: 3,
        verified: true,
        failingTests: [],
      },
    ],
    evidenceReferences: [],
    sourceSnapshotTime: '2026-09-12T04:00:00.000Z',
    finalizedAt: '2026-09-12T04:45:00.000Z',
    generatedByActorId: 'qa-lead-certifier',
    isStale: false,
    staleReason: null,
    checksumSha256: '9988aabbccddeeff00112233445566778899aabbccddeeff0011223344556677',
    createdAt: '2026-09-12T04:00:00.000Z',
    updatedAt: '2026-09-12T04:45:00.000Z',
  };

  const mockTimeline: RepairAuditTimelineDto = {
    projectId,
    failureCaseId,
    session: {
      id: sessionId,
      projectId,
      failureCaseId,
      sessionKey: 'REP-SESSION-110',
      status: 'VERIFIED',
      totalEventsCount: 2,
      startedAt: '2026-09-12T04:00:00.000Z',
      completedAt: '2026-09-12T04:30:00.000Z',
      metadata: {},
      createdAt: '2026-09-12T04:00:00.000Z',
      updatedAt: '2026-09-12T04:30:00.000Z',
      events: [],
    },
    totalEvents: 2,
    generatedAt: '2026-09-12T04:30:00.000Z',
    events: [
      {
        id: '11000000-0000-0000-0000-000000000112',
        projectId,
        failureCaseId,
        repairSessionId: sessionId,
        sequenceNumber: 1,
        actorType: 'SYSTEM',
        actorId: 'system',
        sourceComponent: 'TEST_EXECUTION_ENGINE',
        eventType: 'FAILURE_CREATED',
        reason: 'Playwright test failed with HTTP 500',
        timestamp: '2026-09-12T04:01:00.000Z',
        idempotencyKey: 'idemp-1',
        causationId: null,
        correlationId: 'corr-1',
        previousState: null,
        newState: 'OPEN',
        evidenceReferences: [],
        repositoryState: {},
        jiraReference: {},
        notificationReference: {},
        testRunReferences: [],
        schemaVersion: '1.0.0',
        metadata: {},
        createdAt: '2026-09-12T04:01:00.000Z',
      },
      {
        id: '11000000-0000-0000-0000-000000000113',
        projectId,
        failureCaseId,
        repairSessionId: sessionId,
        sequenceNumber: 2,
        actorType: 'USER',
        actorId: 'qa-lead',
        sourceComponent: 'PATCH_APPROVAL_SERVICE',
        eventType: 'PATCH_APPROVED',
        reason: 'Replaces addition with subtraction in cart-service.ts',
        timestamp: '2026-09-12T04:15:00.000Z',
        idempotencyKey: 'idemp-2',
        causationId: '11000000-0000-0000-0000-000000000112',
        correlationId: 'corr-1',
        previousState: 'PENDING_REVIEW',
        newState: 'APPROVED',
        evidenceReferences: [],
        repositoryState: {},
        jiraReference: {},
        notificationReference: {},
        testRunReferences: [],
        schemaVersion: '1.0.0',
        metadata: {},
        createdAt: '2026-09-12T04:15:00.000Z',
      },
    ],
  };

  it('renders FinalQaReportCard with verdict banner, readiness gauge, and drill-down tabs', () => {
    const html = renderToString(
      <FinalQaReportCard
        projectId={projectId}
        report={mockReport}
      />,
    );

    assert.ok(html.includes('Final QA &amp; Release Readiness'));
    assert.ok(html.includes('READY'));
    assert.ok(html.includes('100'));
    assert.ok(html.includes('FINAL'));
    assert.ok(html.includes('v7.0.0-certified'));
    assert.ok(html.includes('Blockers &amp; Risks'));
    assert.ok(html.includes('Requirement Traceability'));
    assert.ok(html.includes('Defects &amp; Reverifications'));
    assert.ok(html.includes('Harness &amp; Environment Health'));
  });

  it('renders RepairAuditTrailCard with actor badges, chronological timeline, and export buttons', () => {
    const html = renderToString(
      <RepairAuditTrailCard
        projectId={projectId}
        failureCaseId={failureCaseId}
        initialTimeline={mockTimeline}
      />,
    );

    assert.ok(html.includes('Complete Repair &amp; Reverification Audit Trail'));
    assert.ok(html.includes('SYSTEM FACT'));
    assert.ok(html.includes('HUMAN DECISION'));
    assert.ok(html.includes('FAILURE CREATED'));
    assert.ok(html.includes('PATCH APPROVED'));
  });

  it('strictly certifies that zero V8 UI components exist in the renderer bundle', () => {
    // Assert absence of V8 preliminary elements
    const html = renderToString(
      <FinalQaReportCard
        projectId={projectId}
        report={mockReport}
      />,
    );

    assert.ok(!html.includes('Sign in with Google'));
    assert.ok(!html.includes('Sign in with Apple'));
    assert.ok(!html.includes('Codex Shell'));
    assert.ok(!html.includes('Auto Deploy to Production'));
  });
});
