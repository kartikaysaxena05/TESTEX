/**
 * @file apps/desktop/src/main/failures-confidence-ui.test.tsx
 * UI rendering tests for ConfidenceExplainabilityInspectionPanel (V6 Phase 86).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ConfidenceExplainabilityInspectionPanel } from '../renderer/features/failures/ConfidenceExplainabilityInspectionPanel.js';
import type { ConfidenceAssessmentDto, EvidenceAttributionDto } from '@ai-quality/contracts';

describe('Confidence & Explainability UI Component Tests (V6 Phase 86)', () => {
  const mockAssessmentData: ConfidenceAssessmentDto = {
    id: '00000000-0000-0000-0000-000000000111',
    projectId: '00000000-0000-0000-0000-000000000222',
    failureCaseId: '00000000-0000-0000-0000-000000000333',
    revision: 1,
    isAuthoritative: true,
    supersededById: null,
    supersedesId: null,
    overallConfidence: 0.88,
    confidenceBand: 'VERY_HIGH',
    classificationConfidence: 0.95,
    reproducibilityConfidence: 0.9,
    rootCauseConfidence: 0.85,
    severityConfidence: 0.8,
    duplicateConfidence: 0.95,
    componentBreakdown: [
      {
        component: 'EVIDENCE_INTEGRITY',
        score: 1.0,
        weight: 0.15,
        applicable: true,
        description: 'Verified SHA-256 digests',
        supportingCount: 2,
        contradictingCount: 0,
        missingCount: 0,
      },
      {
        component: 'EVIDENCE_COMPLETENESS',
        score: 1.0,
        weight: 0.15,
        applicable: true,
        description: '4 of 4 standard evidence types captured',
        supportingCount: 4,
        contradictingCount: 0,
        missingCount: 0,
      },
    ],
    supportingFactors: ['Deterministic rule match', 'Verified repository references'],
    penalties: [],
    missingFactors: [],
    contradictions: [],
    deterministicFacts: ['Screenshot verified', 'Console log verified'],
    aiInferences: [],
    humanExplanation: '# Confidence & Explainability Assessment\nOverall: 88%',
    confidenceFingerprint: 'f'.repeat(64),
    confidenceEngineVersion: '1.0.0',
    scoringPolicyVersion: '2026.1',
    explanationVersion: '1.0.0',
    isStale: false,
    stalenessReason: null,
    recalculationReason: null,
    assessedAt: '2026-09-08T12:00:00.000Z',
    createdAt: '2026-09-08T12:00:00.000Z',
    attributions: [],
  };

  const mockAttributionData: EvidenceAttributionDto = {
    id: '00000000-0000-0000-0000-000000000444',
    confidenceAssessmentId: mockAssessmentData.id,
    projectId: mockAssessmentData.projectId,
    failureCaseId: mockAssessmentData.failureCaseId,
    conclusionType: 'CLASSIFICATION',
    conclusionValue: 'APPLICATION_FAILURE',
    evidenceReferenceId: null,
    evidenceType: 'DETERMINISTIC_RULE',
    relationship: 'SUPPORTS',
    supportStrength: 'DECISIVE',
    sourceSubsystem: 'PHASE_77_CLASSIFICATION',
    reason: 'Deterministic rule matched category',
    epistemicType: 'DETERMINISTIC_INFERENCE',
    canonicalEvidenceKey: 'classification:application_failure',
    createdAt: '2026-09-08T12:00:00.000Z',
  };

  beforeEach(() => {
    (globalThis as any).window = {
      desktop: {
        failures: {
          getConfidence: async () => ({
            ok: true,
            data: mockAssessmentData,
          }),
          assessConfidence: async () => ({
            ok: true,
            data: mockAssessmentData,
          }),
          reassessConfidence: async () => ({
            ok: true,
            data: { ...mockAssessmentData, revision: 2 },
          }),
          listConfidenceHistory: async () => ({
            ok: true,
            data: [mockAssessmentData],
          }),
          listEvidenceAttributions: async () => ({
            ok: true,
            data: [mockAttributionData],
          }),
        },
      },
    };
  });

  it('renders ConfidenceExplainabilityInspectionPanel loading state without errors', () => {
    const html = renderToString(
      <ConfidenceExplainabilityInspectionPanel
        projectId="00000000-0000-0000-0000-000000000222"
        failureCaseId="00000000-0000-0000-0000-000000000333"
      />,
    );

    assert.ok(html.includes('Calculating confidence scores'));
  });

  it('handles missing window.desktop gracefully without throwing', () => {
    delete (globalThis as any).window;

    const html = renderToString(
      <ConfidenceExplainabilityInspectionPanel
        projectId="00000000-0000-0000-0000-000000000222"
        failureCaseId="00000000-0000-0000-0000-000000000333"
      />,
    );

    assert.ok(html.length > 0);
  });
});
