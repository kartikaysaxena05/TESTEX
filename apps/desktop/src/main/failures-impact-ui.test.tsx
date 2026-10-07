/**
 * @file apps/desktop/src/main/failures-impact-ui.test.tsx
 * UI rendering tests for ImpactAssessmentInspectionPanel (V6 Phase 84).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ImpactAssessmentInspectionPanel } from '../renderer/features/failures/ImpactAssessmentInspectionPanel.js';
import type { FailureImpactAssessmentDto } from '@ai-quality/contracts';

describe('Severity, Priority & Impact UI Component Tests (V6 Phase 84)', () => {
  const mockImpactData: FailureImpactAssessmentDto = {
    id: '00000000-0000-0000-0000-000000000111',
    projectId: '00000000-0000-0000-0000-000000000222',
    failureCaseId: '00000000-0000-0000-0000-000000000333',
    testCaseId: '00000000-0000-0000-0000-000000000444',
    testCaseVersionNumber: 1,
    failureAnalysisRunId: null,
    deterministicClassificationId: null,
    technicalLocalizationId: null,
    domainSeparationId: null,
    aiAssessmentId: null,
    rootCauseAnalysisId: null,

    severity: 'HIGH',
    severityRuleId: 'SEV_HIGH_MAJOR_WORKFLOW_BLOCKED_001',
    severityRationale: 'Major workflow blocked without workaround.',
    severityReasons: ['Persistent HTTP 500 error encountered.'],

    priority: 'P1_URGENT',
    priorityRuleId: 'PRI_P1_URGENT_001',
    priorityRationale: 'High defect severity requires urgent release resolution.',
    priorityReasons: ['Confirmed reproducible failure on core checkout.'],

    releaseRecommendation: 'BLOCK_RELEASE',
    releaseRecommendationRationale:
      'High severity defect without verified workaround blocks release candidate.',

    userImpact: 'ALL_USERS',
    userImpactDetails: 'All users unable to checkout.',
    functionalImpact: 'Checkout impaired.',
    businessImpact: 'Direct revenue loss.',
    businessCriticality: 'HIGH',
    dataImpact: 'NO_DATA_IMPACT',
    dataImpactDetails: null,
    securityImpact: 'NONE_PROVEN',
    securityImpactDetails: null,
    availabilityImpact: 'MODULE_UNAVAILABLE',
    integrationImpact: 'No integrations impacted.',
    blastRadius: 'SINGLE_MODULE',
    workaroundStatus: 'NO_WORKAROUND',
    workaroundDetails: null,

    supportingEvidence: [],
    conflictingSignals: [],
    unknownFactors: [],

    severityModelVersion: '1.0.0',
    priorityModelVersion: '1.0.0',
    impactModelVersion: '1.0.0',
    assessmentFingerprint: 'a'.repeat(64),

    isAuthoritative: true,
    isStale: false,
    stalenessReason: null,
    reassessmentCount: 0,
    lastReassessedAt: null,
    reassessmentReason: null,
    supersededById: null,

    assessedAt: '2026-09-08T12:00:00.000Z',
    createdAt: '2026-09-08T12:00:00.000Z',
    updatedAt: '2026-09-08T12:00:00.000Z',
  };

  beforeEach(() => {
    (globalThis as any).window = {
      desktop: {
        failures: {
          getImpactAssessment: async () => ({
            ok: true,
            data: mockImpactData,
          }),
          assessImpact: async () => ({
            ok: true,
            data: mockImpactData,
          }),
          reassessImpact: async () => ({
            ok: true,
            data: { ...mockImpactData, reassessmentCount: 1 },
          }),
          listImpactHistory: async () => ({
            ok: true,
            data: [mockImpactData],
          }),
        },
      },
    };
  });

  it('renders ImpactAssessmentInspectionPanel loading state without errors', () => {
    const html = renderToString(
      <ImpactAssessmentInspectionPanel
        projectId="00000000-0000-0000-0000-000000000222"
        failureCaseId="00000000-0000-0000-0000-000000000333"
      />,
    );

    assert.ok(html.includes('Loading Severity &amp; Impact assessment'));
  });

  it('handles missing window.desktop gracefully without throwing', () => {
    delete (globalThis as any).window;

    const html = renderToString(
      <ImpactAssessmentInspectionPanel
        projectId="00000000-0000-0000-0000-000000000222"
        failureCaseId="00000000-0000-0000-0000-000000000333"
      />,
    );

    assert.ok(html.length > 0);
  });
});
