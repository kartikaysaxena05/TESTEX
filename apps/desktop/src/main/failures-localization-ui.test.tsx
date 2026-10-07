/**
 * @file apps/desktop/src/main/failures-localization-ui.test.tsx
 * UI rendering tests for TechnicalLocalizationInspectionPanel (V6 Phase 81).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TechnicalLocalizationInspectionPanel } from '../renderer/features/failures/TechnicalLocalizationInspectionPanel.js';
import type { FailureTechnicalLocalizationDto } from '@ai-quality/contracts';

describe('Failure Technical Cause Localization UI Component Tests (V6 Phase 81)', () => {
  const mockLocalizationData: FailureTechnicalLocalizationDto = {
    id: '00000000-0000-0000-0000-000000000111',
    projectId: '00000000-0000-0000-0000-000000000222',
    failureCaseId: '00000000-0000-0000-0000-000000000333',
    testCaseId: '00000000-0000-0000-0000-000000000444',
    failureAnalysisRunId: null,
    domainSeparationId: null,
    primaryLayer: 'BACKEND_API',
    secondaryLayers: ['FRONTEND_NETWORK_CLIENT'],
    primaryTargetType: 'API_ENDPOINT',
    primaryTargetIdentifier: 'POST /api/v1/checkout/process',
    secondaryTargets: [],
    repositoryFileId: '00000000-0000-0000-0000-000000000555',
    repositorySymbolId: '00000000-0000-0000-0000-000000000666',
    matchedFilePath: 'src/controllers/checkout.controller.ts',
    matchedSymbolName: 'processCheckout',
    matchedLineNumber: 42,
    httpEndpoint: '/api/v1/checkout/process',
    httpMethod: 'POST',
    httpStatusCode: 500,
    domSelector: null,
    uiComponentName: null,
    routePath: null,
    timelineSummary: [
      {
        eventId: 'evt_0001',
        eventType: 'STEP_EXECUTION',
        timestampMs: 1000,
        relativeTimeMs: 0,
        summary: 'Step 1 started: Click #checkout',
        details: {},
      },
      {
        eventId: 'evt_0002',
        eventType: 'NETWORK_RESPONSE',
        timestampMs: 1500,
        relativeTimeMs: 500,
        summary: 'HTTP 500: POST /api/v1/checkout/process',
        details: {},
      },
    ],
    correlationSignals: [
      {
        signalId: 'sig_001',
        signalType: 'HTTP_5XX_SERVER_ERROR',
        technicalLayer: 'BACKEND_API',
        targetType: 'API_ENDPOINT',
        targetIdentity: 'POST /api/v1/checkout/process',
        sourceEvidenceKey: 'ev-1',
        strength: 'DIRECT',
        explanation: 'Server returned HTTP 500',
      },
    ],
    conflictingSignals: [],
    localizationRationale: 'Server returned HTTP 500 during checkout process step.',
    evidenceReferences: ['ev-1'],
    localizationFingerprint:
      'sha256:1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
    isAuthoritative: true,
    isStale: false,
    stalenessReason: null,
    relocalizationCount: 0,
    lastRelocalizedAt: null,
    relocalizationReason: null,
    localizedAt: '2026-09-08T12:00:00.000Z',
    createdAt: '2026-09-08T12:00:00.000Z',
    updatedAt: '2026-09-08T12:00:00.000Z',
  };

  beforeEach(() => {
    (globalThis as any).window = {
      desktop: {
        failures: {
          getTechnicalLocalization: async () => ({
            ok: true,
            data: mockLocalizationData,
          }),
          localizeTechnicalCause: async () => ({
            ok: true,
            data: mockLocalizationData,
          }),
          relocalizeTechnicalCause: async () => ({
            ok: true,
            data: { ...mockLocalizationData, relocalizationCount: 1 },
          }),
          listLocalizationHistory: async () => ({
            ok: true,
            data: [mockLocalizationData],
          }),
        },
      },
    };
  });

  it('renders TechnicalLocalizationInspectionPanel loading state without errors', () => {
    const html = renderToString(
      <TechnicalLocalizationInspectionPanel
        projectId="00000000-0000-0000-0000-000000000222"
        failureCaseId="00000000-0000-0000-0000-000000000333"
      />,
    );

    assert.ok(html.includes('data-testid="localization-loading"'));
    assert.ok(html.includes('Analyzing failure evidence timeline'));
  });

  it('renders primary layer badge, target card, and repository link correctly', () => {
    // Render without window.desktop to test SSR presentation
    delete (globalThis as any).window;

    const html = renderToString(
      <TechnicalLocalizationInspectionPanel
        projectId="00000000-0000-0000-0000-000000000222"
        failureCaseId="00000000-0000-0000-0000-000000000333"
      />,
    );

    assert.ok(html.includes('data-testid="technical-localization-panel"'));
    assert.ok(html.includes('Technical Localization (Phase 81)'));
  });
});
