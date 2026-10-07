/**
 * @file apps/desktop/src/main/failures-classification-ui.test.tsx
 * UI rendering tests for ClassificationInspectionPanel (V6 Phase 77).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ClassificationInspectionPanel } from '../renderer/features/failures/ClassificationInspectionPanel.js';

describe('Failure Classification UI Component Tests (V6 Phase 77)', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      desktop: {
        failures: {
          getClassification: async () => ({
            ok: true,
            data: {
              id: 'class-111',
              projectId: 'proj-111',
              failureCaseId: 'fc-111',
              analysisRunId: null,
              category: 'APPLICATION_FAILURE',
              subcategory: 'ASSERTION_MISMATCH',
              classifierVersion: '1.0.0',
              taxonomyVersion: '1.0.0',
              primaryRuleId: 'APP_ASSERTION_MISMATCH_001',
              matchedRuleIds: ['APP_ASSERTION_MISMATCH_001'],
              ruleExplanations: [
                {
                  ruleId: 'APP_ASSERTION_MISMATCH_001',
                  ruleName: 'Application Assertion Mismatch',
                  category: 'APPLICATION_FAILURE',
                  subcategory: 'ASSERTION_MISMATCH',
                  explanation:
                    'The application UI reached the asserted state, but returned an actual value that did not match the expected specification.',
                  supportingEvidence: [
                    'Assertion failed: type=ELEMENT_TEXT',
                    'Expected: $90.00, Actual: $100.00',
                  ],
                  signalStrength: 'DEFINITIVE',
                },
              ],
              conflictingRuleIds: [],
              evidenceReferences: ['ev-ref-1'],
              isAuthoritative: true,
              reclassificationReason: null,
              supersededById: null,
              createdAt: '2026-09-08T12:00:00.000Z',
              updatedAt: '2026-09-08T12:00:00.000Z',
            },
          }),

          listClassificationHistory: async () => ({
            ok: true,
            data: [],
          }),

          classify: async () => ({
            ok: true,
            data: {} as any,
          }),

          reclassify: async () => ({
            ok: true,
            data: {} as any,
          }),

          getDecisionIntegrity: async () => ({
            ok: true,
            data: {
              id: 'di-111',
              projectId: 'proj-111',
              failureCaseId: 'fc-111',
              classificationId: 'class-111',
              classifierVersion: '1.0.0',
              taxonomyVersion: '1.0.0',
              evidencePackageIdentity: 'ev-pkg-111',
              evidencePackageVersion: '1.0.0',
              evidenceIntegrityState: 'VERIFIED',
              reproductionSnapshotIdentity: 'repro-snap-111',
              reproductionSummaryVersion: '1.0.0',
              decisionFingerprint:
                'sha256:abc123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
              decisionState: 'VALID',
              evidenceFreshnessState: 'CURRENT',
              consistencyState: 'CONSISTENT',
              arbitrationState: 'SUPPORTED',
              isAuthoritative: true,
              blockingReasons: [],
              warningReasons: [],
              conflictDetailsJson: {},
              materialChangesJson: [],
              evaluatedAt: '2026-09-08T12:00:00.000Z',
              createdAt: '2026-09-08T12:00:00.000Z',
              updatedAt: '2026-09-08T12:00:00.000Z',
            },
          }),

          evaluateDecisionIntegrity: async () => ({
            ok: true,
            data: {} as any,
          }),

          recomputeDecisionIntegrity: async () => ({
            ok: true,
            data: {} as any,
          }),

          listDecisionIntegrityHistory: async () => ({
            ok: true,
            data: [],
          }),
        },
      },
    };
  });

  it('renders ClassificationInspectionPanel without errors', () => {
    const html = renderToString(
      <ClassificationInspectionPanel projectId="proj-111" failureCaseId="fc-111" />,
    );

    assert.ok(html.length > 0);
    assert.ok(html.includes('Deterministic') || html.includes('classification'));
  });

  it('handles missing window.desktop gracefully', () => {
    delete (globalThis as any).window;

    const html = renderToString(
      <ClassificationInspectionPanel projectId="proj-111" failureCaseId="fc-111" />,
    );

    assert.ok(html.length > 0);
  });
});
