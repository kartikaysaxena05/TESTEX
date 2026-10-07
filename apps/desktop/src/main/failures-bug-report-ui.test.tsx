/**
 * @file apps/desktop/src/main/failures-bug-report-ui.test.tsx
 * UI rendering tests for StructuredBugReportPanel (V6 Phase 87).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StructuredBugReportPanel } from '../renderer/features/failures/StructuredBugReportPanel.js';
import type { StructuredBugReportDto } from '@ai-quality/contracts';

describe('Structured Bug Report UI Component Tests (V6 Phase 87)', () => {
  const mockBugReportData: StructuredBugReportDto = {
    id: '00000000-0000-0000-0000-000000000111',
    projectId: '00000000-0000-0000-0000-000000000222',
    failureCaseId: '00000000-0000-0000-0000-000000000333',
    analysisRunId: null,
    reportNumber: 'BUG-000001',
    revision: 1,
    status: 'READY',
    defectState: 'CONFIRMED_APPLICATION_DEFECT',
    isApplicationDefect: true,
    title: 'Checkout Button Unresponsive On High Latency',
    summary: 'Failure case exhibiting persistent button unresponsiveness during checkout.',
    environmentSummary: {
      os: 'mac',
      browserEngine: 'CHROMIUM',
      viewport: '1920x1080',
    },
    requirementId: '00000000-0000-0000-0000-000000000555',
    requirementKey: 'REQ-001',
    requirementVersion: 1,
    testCaseId: '00000000-0000-0000-0000-000000000444',
    testCaseKey: 'TC-001',
    testCaseVersion: 1,
    executionPlanId: '00000000-0000-0000-0000-000000000666',
    preconditions: [
      'User authenticated as standard customer',
      'Cart contains 1 item with positive balance',
    ],
    reproductionSteps: [
      {
        stepIndex: 1,
        actionType: 'NAVIGATE',
        description: 'Navigate to checkout page',
        targetSummary: 'http://localhost:3000/checkout',
        expectedSummary: 'Checkout page loads',
        actualSummary: 'Checkout page loaded',
        status: 'PASSED',
        isFailureStep: false,
      },
      {
        stepIndex: 2,
        actionType: 'CLICK',
        description: 'Click place order button',
        targetSummary: '#place-order-btn',
        expectedSummary: 'Order confirmation modal opens',
        actualSummary: 'Button clicked but no response',
        status: 'FAILED',
        isFailureStep: true,
        errorMessage: 'HTTP 500 error on /api/order',
      },
    ],
    expectedBehavior: 'Order confirmation modal opens and confirmation number is generated.',
    actualBehavior: 'Button clicked but no response; HTTP 500 returned on backend endpoint.',
    failedStepIndex: 2,
    rootCauseHypothesis: 'Backend order placement endpoint threw unhandled null pointer exception.',
    probableLayer: 'BACKEND',
    probableComponent: 'OrderProcessingService',
    severity: 'HIGH',
    priority: 'P1_URGENT',
    clusterKey: 'CLUSTER-ORDER-FAIL-01',
    clusterMemberCount: 3,
    calibratedScore: 0.92,
    evidenceReferences: [
      {
        id: '00000000-0000-0000-0000-000000000777',
        evidenceType: 'SCREENSHOT',
        filePath: '/evidence/screenshot-001.png',
        sha256: 'e'.repeat(64),
        byteSize: 10240,
        mimeType: 'image/png',
        integrityStatus: 'VERIFIED',
        description: 'Screenshot at moment of failure',
      },
      {
        id: '00000000-0000-0000-0000-000000000888',
        evidenceType: 'NETWORK_RECORDING',
        filePath: '/evidence/har-001.har',
        sha256: 'f'.repeat(64),
        byteSize: 2048,
        mimeType: 'application/json',
        integrityStatus: 'VERIFIED',
        description: 'HAR capture showing 500 Internal Server Error',
      },
    ],
    limitationsAndUnknowns: [
      'No frontend memory heap dump was collected.',
      'Transient database contention not measured during step 2.',
    ],
    reportMarkdown:
      '# [BUG-000001] Checkout Button Unresponsive On High Latency\n\nDefect state: CONFIRMED_APPLICATION_DEFECT',
    reportFingerprint: 'a'.repeat(64),
    generatorVersion: '1.0.0',
    regenerationReason: null,
    supersededById: null,
    supersedesId: null,
    isStale: false,
    stalenessReason: null,
    createdAt: '2026-09-08T12:00:00.000Z',
    updatedAt: '2026-09-08T12:00:00.000Z',
  };

  beforeEach(() => {
    (globalThis as any).window = {
      desktop: {
        failures: {
          getBugReport: async () => ({
            ok: true,
            data: mockBugReportData,
          }),
          createBugReport: async () => ({
            ok: true,
            data: mockBugReportData,
          }),
          regenerateBugReport: async () => ({
            ok: true,
            data: { ...mockBugReportData, revision: 2 },
          }),
          listBugReports: async () => ({
            ok: true,
            data: {
              items: [mockBugReportData],
              total: 1,
              page: 1,
              pageSize: 20,
            },
          }),
          listBugReportHistory: async () => ({
            ok: true,
            data: [mockBugReportData],
          }),
        },
      },
    };
  });

  it('renders StructuredBugReportPanel loading state without errors', () => {
    const html = renderToString(
      <StructuredBugReportPanel
        projectId="00000000-0000-0000-0000-000000000222"
        failureCaseId="00000000-0000-0000-0000-000000000333"
      />,
    );

    assert.ok(html.includes('Loading structured bug report...'));
  });

  it('handles missing window.desktop gracefully without throwing', () => {
    delete (globalThis as any).window;

    const html = renderToString(
      <StructuredBugReportPanel
        projectId="00000000-0000-0000-0000-000000000222"
        failureCaseId="00000000-0000-0000-0000-000000000333"
      />,
    );

    assert.ok(html.length > 0);
    assert.ok(html.includes('Loading structured bug report...'));
  });
});
