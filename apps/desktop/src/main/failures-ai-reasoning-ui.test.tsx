/**
 * @file apps/desktop/src/main/failures-ai-reasoning-ui.test.tsx
 * UI rendering tests for AiClassificationInspectionPanel (V6 Phase 82).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AiClassificationInspectionPanel } from '../renderer/features/failures/AiClassificationInspectionPanel.js';
import type { FailureAiAssessmentDto } from '@ai-quality/contracts';

describe('AI-Assisted Failure Classification UI Component Tests (V6 Phase 82)', () => {
  const mockAssessmentData: FailureAiAssessmentDto = {
    id: '00000000-0000-0000-0000-000000000111',
    projectId: '00000000-0000-0000-0000-000000000222',
    failureCaseId: '00000000-0000-0000-0000-000000000333',
    testCaseId: '00000000-0000-0000-0000-000000000444',
    testCaseVersionNumber: 1,
    failureAnalysisRunId: null,
    deterministicClassificationId: null,
    technicalLocalizationId: null,
    domainSeparationId: null,

    aiCategory: 'APPLICATION_FAILURE',
    aiSubcategory: 'HTTP_ERROR_RESPONSE',
    agreementState: 'AGREES',
    confidenceLevel: 'HIGH',
    confidenceScore: 0.88,
    confidenceBasis: ['Evidence completeness: 80%', 'Reproduction consistency: High'],

    primaryReasoning: 'API returned HTTP 500 status on submission.',
    humanExplanation: 'Application backend crashed during transaction submission.',
    supportingEvidence: [
      {
        id: 'ev-ui-1',
        fact: 'HTTP 500 status returned from API',
        significance: 'CRITICAL',
        evidenceType: 'NETWORK_LOG',
      },
    ],
    contradictingEvidence: [],
    alternativeHypotheses: [
      {
        category: 'ENVIRONMENT_FAILURE',
        rationale: 'Could be network outage',
        plausibility: 'LOW',
        disqualifyingFactor: '500 status returned with JSON payload',
      },
    ],
    uncertainties: ['Database query log not available'],

    modelProvider: 'fake',
    modelName: 'mock-classifier-v1',
    promptVersion: '1.0.0',
    schemaVersion: '1.0.0',
    assessmentFingerprint:
      'sha256:1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',

    isAuthoritative: true,
    isStale: false,
    stalenessReason: null,
    reanalysisCount: 0,
    lastReanalyzedAt: null,
    reanalysisReason: null,
    supersededById: null,

    assessedAt: '2026-09-08T12:00:00.000Z',
    createdAt: '2026-09-08T12:00:00.000Z',
    updatedAt: '2026-09-08T12:00:00.000Z',
  };

  beforeEach(() => {
    (globalThis as any).window = {
      desktop: {
        failures: {
          getAiAssessment: async () => ({
            ok: true,
            data: mockAssessmentData,
          }),
          assessWithAi: async () => ({
            ok: true,
            data: mockAssessmentData,
          }),
          reassessWithAi: async () => ({
            ok: true,
            data: { ...mockAssessmentData, reanalysisCount: 1 },
          }),
          listAiAssessmentHistory: async () => ({
            ok: true,
            data: [mockAssessmentData],
          }),
        },
      },
    };
  });

  it('renders AiClassificationInspectionPanel loading state without errors', () => {
    const html = renderToString(
      <AiClassificationInspectionPanel
        projectId="00000000-0000-0000-0000-000000000222"
        failureCaseId="00000000-0000-0000-0000-000000000333"
      />,
    );

    assert.ok(html.includes('data-testid="ai-reasoning-loading"'));
    assert.ok(html.includes('Loading AI reasoning assessment'));
  });

  it('handles missing window.desktop gracefully without throwing', () => {
    delete (globalThis as any).window;

    const html = renderToString(
      <AiClassificationInspectionPanel
        projectId="00000000-0000-0000-0000-000000000222"
        failureCaseId="00000000-0000-0000-0000-000000000333"
      />,
    );

    assert.ok(html.length > 0);
    assert.ok(
      html.includes('Loading AI reasoning assessment') || html.includes('ai-reasoning-loading'),
    );
  });
});
