/**
 * @file apps/desktop/src/main/failures-root-cause-ui.test.tsx
 * UI rendering tests for RootCauseInspectionPanel (V6 Phase 83).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { RootCauseInspectionPanel } from '../renderer/features/failures/RootCauseInspectionPanel.js';
import type { FailureRootCauseAnalysisDto } from '@ai-quality/contracts';

describe('Root-Cause Analysis UI Component Tests (V6 Phase 83)', () => {
  const mockRcaData: FailureRootCauseAnalysisDto = {
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

    rootCauseStatus: 'SUPPORTED_HYPOTHESIS',
    probableLayer: 'API',
    probableComponent: 'AuthGateway',
    relatedEndpoint: '/api/v1/auth',

    probableCause: 'Null pointer dereference during session token verification.',
    humanExplanation: 'The API server returned HTTP 500 because the auth session was null.',
    affectedExecutionPath: ['POST /api/v1/auth', 'verifyToken()', '500 Server Error'],
    supportingEvidence: [
      {
        id: 'ev-ui-rca-1',
        fact: 'HTTP 500 status returned from API',
        significance: 'CRITICAL',
        evidenceType: 'NETWORK_LOG',
      },
    ],
    contradictingEvidence: [],
    alternativeHypotheses: [
      {
        layer: 'NETWORK',
        probableCause: 'Gateway socket timeout',
        rationale: 'Could be edge network disconnect',
        plausibility: 'LOW',
        disqualifyingFactor: 'Server produced application stack trace',
      },
    ],
    repositoryReferences: [
      {
        filePath: 'src/api/auth.ts',
        symbolName: 'loginHandler',
        relevance: 'Primary endpoint handler',
      },
    ],
    repositoryContextAvailable: true,
    limitations: ['Trace headers missing'],
    uncertainties: [],

    modelProvider: 'fake',
    modelName: 'mock-rca-v1',
    promptVersion: '1.0.0',
    schemaVersion: '1.0.0',
    rootCauseFingerprint: 'b'.repeat(64),

    isAuthoritative: true,
    isStale: false,
    stalenessReason: null,
    reanalysisCount: 0,
    lastReanalyzedAt: null,
    reanalysisReason: null,
    supersededById: null,

    analyzedAt: '2026-09-08T12:00:00.000Z',
    createdAt: '2026-09-08T12:00:00.000Z',
    updatedAt: '2026-09-08T12:00:00.000Z',
  };

  beforeEach(() => {
    (globalThis as any).window = {
      desktop: {
        failures: {
          getRootCauseAnalysis: async () => ({
            ok: true,
            data: mockRcaData,
          }),
          analyzeRootCause: async () => ({
            ok: true,
            data: mockRcaData,
          }),
          reanalyzeRootCause: async () => ({
            ok: true,
            data: { ...mockRcaData, reanalysisCount: 1 },
          }),
          listRootCauseHistory: async () => ({
            ok: true,
            data: [mockRcaData],
          }),
        },
      },
    };
  });

  it('renders RootCauseInspectionPanel loading state without errors', () => {
    const html = renderToString(
      <RootCauseInspectionPanel
        projectId="00000000-0000-0000-0000-000000000222"
        failureCaseId="00000000-0000-0000-0000-000000000333"
      />,
    );

    assert.ok(html.includes('Loading Root-Cause Analysis'));
  });

  it('handles missing window.desktop gracefully without throwing', () => {
    delete (globalThis as any).window;

    const html = renderToString(
      <RootCauseInspectionPanel
        projectId="00000000-0000-0000-0000-000000000222"
        failureCaseId="00000000-0000-0000-0000-000000000333"
      />,
    );

    assert.ok(html.length > 0);
    assert.ok(html.includes('Loading Root-Cause Analysis'));
  });
});
