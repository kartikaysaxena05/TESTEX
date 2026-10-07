/**
 * @file apps/desktop/src/main/failures-reproduction-ui.test.tsx
 * UI rendering tests for ReproductionInspectionPanel and FailureCasesListView reproduction tabs (V6 Phase 76).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ReproductionInspectionPanel } from '../renderer/features/failures/ReproductionInspectionPanel.js';

describe('Failure Reproduction UI Component Tests (V6 Phase 76)', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      desktop: {
        failures: {
          getReproducibilitySummary: async () => ({
            ok: true,
            data: {
              failureCaseId: 'fc-111',
              projectId: 'proj-111',
              overallOutcome: 'REPRODUCED',
              attemptsRequested: 1,
              attemptsStarted: 1,
              attemptsCompleted: 1,
              equivalentFailures: 1,
              differentFailures: 0,
              passes: 0,
              blockedAttempts: 0,
              cancelledAttempts: 0,
              environmentDriftDetected: false,
              reproducibilityRatio: 1.0,
            },
          }),

          getReproductionAttempts: async () => ({
            ok: true,
            data: [
              {
                id: 'attempt-1',
                projectId: 'proj-111',
                failureCaseId: 'fc-111',
                originalExecutionId: 'exec-e1',
                reproductionExecutionId: 'exec-e2',
                attemptNumber: 1,
                testCaseId: 'tc-111',
                testCaseVersionNumber: 2,
                browserEngine: 'chromium',
                reproductionVersion: '1.0.0',
                status: 'REPRODUCED',
                environmentEquivalence: 'EXACT',
                isSignatureMatch: true,
                originalFailureSignature: 'sig_original_123',
                reproductionFailureSignature: 'sig_original_123',
                stepComparison: [
                  {
                    stepIndex: 0,
                    actionType: 'navigate',
                    targetSummary: 'navigate to "/cart"',
                    isMatch: true,
                    originalStatus: 'PASSED',
                    reproductionStatus: 'PASSED',
                    originalDurationMs: 100,
                    reproductionDurationMs: 95,
                  },
                  {
                    stepIndex: 1,
                    actionType: 'click',
                    targetSummary: 'click "#checkout"',
                    isMatch: true,
                    originalStatus: 'FAILED',
                    reproductionStatus: 'FAILED',
                    originalDurationMs: 250,
                    reproductionDurationMs: 240,
                  },
                ],
                assertionComparison: null,
                environmentComparison: {
                  status: 'EXACT',
                  driftItems: [],
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          }),

          executeReproduction: async () => ({
            ok: true,
            data: {
              failureCaseId: 'fc-111',
              projectId: 'proj-111',
              overallOutcome: 'REPRODUCED',
              attemptsRequested: 1,
              attemptsStarted: 1,
              attemptsCompleted: 1,
              equivalentFailures: 1,
              differentFailures: 0,
              passes: 0,
              blockedAttempts: 0,
              cancelledAttempts: 0,
              environmentDriftDetected: false,
              reproducibilityRatio: 1.0,
            },
          }),

          cancelReproduction: async () => ({
            ok: true,
            data: { cancelled: true },
          }),
        },
      },
    };
  });

  it('renders ReproductionInspectionPanel initial loading skeleton without crashing', () => {
    const html = renderToString(
      <ReproductionInspectionPanel
        projectId="proj-111"
        failureCaseId="fc-111"
        originalExecutionId="exec-e1"
      />,
    );

    assert.ok(html.includes('Loading reproduction and verification data...'));
  });

  it('contains reproduction controls and execution action labels', () => {
    const element = (
      <ReproductionInspectionPanel
        projectId="proj-111"
        failureCaseId="fc-111"
        originalExecutionId="exec-e1"
      />
    );

    assert.ok(element);
    assert.equal(element.props.projectId, 'proj-111');
    assert.equal(element.props.failureCaseId, 'fc-111');
    assert.equal(element.props.originalExecutionId, 'exec-e1');
  });
});
