/**
 * @file apps/desktop/src/main/failures-domain-separation-ui.test.tsx
 * UI rendering tests for DomainSeparationInspectionPanel (V6 Phase 80).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DomainSeparationInspectionPanel } from '../renderer/features/failures/DomainSeparationInspectionPanel.js';
import type { FailureDomainSeparationDto } from '@ai-quality/contracts';

describe('Failure Domain Separation UI Component Tests (V6 Phase 80)', () => {
  const mockSeparationData: FailureDomainSeparationDto = {
    id: '00000000-0000-0000-0000-000000000111',
    projectId: '00000000-0000-0000-0000-000000000222',
    failureCaseId: '00000000-0000-0000-0000-000000000333',
    failureAnalysisRunId: null,
    classificationId: null,
    decisionIntegrityId: null,
    flakinessAnalysisId: null,
    testCaseId: '00000000-0000-0000-0000-000000000444',
    domain: 'APPLICATION_DEFECT_CANDIDATE',
    domainSubreason: 'ASSERTION_MISMATCH',
    separationRulesVersion: '1.0.0',
    primaryRationale:
      'Authoritatively identified as an Application Defect Candidate. Automation syntax and locator errors were excluded because the target selector is structurally valid.',
    decisionExplanation:
      'Deterministic assertion failure verified against rendered DOM. Target selector syntax valid and unambiguous.',
    matchedRuleIds: ['RULE_APP_DEFECT_ASSERTION'],
    excludedDomains: ['AUTOMATION_FAILURE', 'ENVIRONMENT_FAILURE', 'TEST_DATA_FAILURE'],
    exclusionReasons: {
      AUTOMATION_FAILURE: 'Selector syntax is valid, no driver timeout, no script error.',
      ENVIRONMENT_FAILURE: 'Host reachable, HTTP 200 responses, no network socket reset.',
      TEST_DATA_FAILURE: 'Test data fixtures present, seeded accounts active.',
    },
    conflictingSignals: [],
    evidenceReferences: ['ev-ref-1'],
    reproductionSummary: {},
    flakinessSummary: {},
    separationFingerprint:
      'sha256:1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
    isAuthoritative: true,
    isStale: false,
    stalenessReason: null,
    reevaluationCount: 0,
    lastReevaluatedAt: null,
    reevaluationReason: null,
    evaluatedAt: '2026-09-08T12:00:00.000Z',
    createdAt: '2026-09-08T12:00:00.000Z',
    updatedAt: '2026-09-08T12:00:00.000Z',
  };

  beforeEach(() => {
    (globalThis as any).window = {
      desktop: {
        failures: {
          getDomainSeparation: async () => ({
            ok: true,
            data: mockSeparationData,
          }),
          separateFailureDomain: async () => ({
            ok: true,
            data: mockSeparationData,
          }),
          reevaluateDomainSeparation: async () => ({
            ok: true,
            data: {
              ...mockSeparationData,
              id: '00000000-0000-0000-0000-000000000555',
              reevaluationReason: 'Operator requested re-evaluation',
              reevaluationCount: 1,
            },
          }),
          listDomainSeparationHistory: async () => ({
            ok: true,
            data: [mockSeparationData],
          }),
        },
      },
    };
  });

  it('renders DomainSeparationInspectionPanel in initial server-render state without errors', () => {
    const html = renderToString(
      <DomainSeparationInspectionPanel
        projectId="00000000-0000-0000-0000-000000000222"
        failureCaseId="00000000-0000-0000-0000-000000000333"
      />,
    );

    assert.ok(html.length > 0);
    assert.ok(html.includes('Failure Domain Separation') || html.includes('Loading'));
  });

  it('handles missing window.desktop gracefully without throwing', () => {
    delete (globalThis as any).window;

    const html = renderToString(
      <DomainSeparationInspectionPanel
        projectId="00000000-0000-0000-0000-000000000222"
        failureCaseId="00000000-0000-0000-0000-000000000333"
      />,
    );

    assert.ok(html.length > 0);
    assert.ok(html.includes('domain separation') || html.includes('Loading'));
  });
});
