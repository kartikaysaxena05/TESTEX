/**
 * @file apps/desktop/src/main/failures-flakiness-ui.test.tsx
 * UI rendering tests for FlakinessInspectionPanel (V6 Phase 79).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { FlakinessInspectionPanel } from '../renderer/features/failures/FlakinessInspectionPanel.js';

describe('Failure Flakiness UI Component Tests (V6 Phase 79)', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      desktop: {
        failures: {
          getFlakinessAnalysis: async () => ({
            ok: true,
            data: {
              id: 'flaky-111',
              projectId: 'proj-111',
              failureCaseId: 'fc-111',
              classificationId: 'class-111',
              decisionIntegrityId: 'di-111',
              testCaseId: 'tc-111',
              testCaseVersionId: null,
              testCaseVersionNumber: 1,
              analysisVersion: '1.0.0',
              flakinessPolicyVersion: '1.0.0',
              flakinessState: 'CONFIRMED_FLAKY',
              stabilityState: 'INTERMITTENT',
              attemptCount: 3,
              validAttemptCount: 3,
              passCount: 1,
              failCount: 2,
              blockedCount: 0,
              cancelledCount: 0,
              executionErrorCount: 0,
              equivalentFailureCount: 2,
              differentFailureCount: 0,
              sameStepFailureCount: 2,
              differentStepFailureCount: 0,
              environmentComparableCount: 3,
              environmentDriftCount: 0,
              reproducibilityRatio: 0.6667,
              passRate: 0.3333,
              failureRate: 0.6667,
              dominantFailureSignature: 'ERR_TIMEOUT_BUTTON_CLICK',
              analysisFingerprint:
                'sha256:1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
              isAuthoritative: true,
              isStale: false,
              stalenessReason: null,
              analysisExplanation:
                'Confirmed flaky: observed intermittent oscillation across 3 comparable attempts.',
              attemptTimeline: [
                {
                  attemptId: 'att-1',
                  source: 'PRIMARY_EXECUTION',
                  attemptNumber: 1,
                  status: 'FAILED',
                  isEligible: true,
                  ineligibilityReason: null,
                  environmentEquivalence: 'EXACT',
                  failureSignature: 'ERR_TIMEOUT_BUTTON_CLICK',
                  isSignatureMatch: true,
                  failedStepIndex: 3,
                  isStepMatch: true,
                  durationMs: 1200,
                  timestamp: '2026-09-08T10:00:00.000Z',
                },
                {
                  attemptId: 'att-2',
                  source: 'V5_RETRY',
                  attemptNumber: 2,
                  status: 'PASSED',
                  isEligible: true,
                  ineligibilityReason: null,
                  environmentEquivalence: 'EXACT',
                  failureSignature: null,
                  isSignatureMatch: null,
                  failedStepIndex: null,
                  isStepMatch: null,
                  durationMs: 950,
                  timestamp: '2026-09-08T10:02:00.000Z',
                },
                {
                  attemptId: 'att-3',
                  source: 'PHASE76_REPRODUCTION',
                  attemptNumber: 3,
                  status: 'FAILED',
                  isEligible: true,
                  ineligibilityReason: null,
                  environmentEquivalence: 'EXACT',
                  failureSignature: 'ERR_TIMEOUT_BUTTON_CLICK',
                  isSignatureMatch: true,
                  failedStepIndex: 3,
                  isStepMatch: true,
                  durationMs: 1180,
                  timestamp: '2026-09-08T10:05:00.000Z',
                },
              ],
              warnings: [],
              evidenceGaps: [],
              evaluatedAt: '2026-09-08T12:00:00.000Z',
              createdAt: '2026-09-08T12:00:00.000Z',
              updatedAt: '2026-09-08T12:00:00.000Z',
            },
          }),

          listFlakinessHistory: async () => ({
            ok: true,
            data: [],
          }),

          analyzeFlakiness: async () => ({
            ok: true,
            data: {} as any,
          }),

          reanalyzeFlakiness: async () => ({
            ok: true,
            data: {} as any,
          }),
        },
      },
    };
  });

  it('renders FlakinessInspectionPanel without errors in initial state', () => {
    const html = renderToString(
      <FlakinessInspectionPanel projectId="proj-111" failureCaseId="fc-111" />,
    );

    assert.ok(html.length > 0);
    assert.ok(html.includes('Flakiness') || html.includes('reproducibility'));
  });

  it('handles missing window.desktop gracefully', () => {
    delete (globalThis as any).window;

    const html = renderToString(
      <FlakinessInspectionPanel projectId="proj-111" failureCaseId="fc-111" />,
    );

    assert.ok(html.length > 0);
  });
});
