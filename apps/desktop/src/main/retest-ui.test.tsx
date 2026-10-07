/**
 * @file apps/desktop/src/main/retest-ui.test.tsx
 * UI component tests for Requirement Change-Impact & Retest Selection (V7 Phase 106).
 * Verifies RetestPlanCard rendering, full regression banners, statistics badges, and ImpactExplanationModal.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { RetestPlanCard } from '../renderer/features/retest/RetestPlanCard.js';
import { ImpactExplanationModal } from '../renderer/features/retest/ImpactExplanationModal.js';
import type { RetestPlanDto } from '@ai-quality/contracts';

describe('Retest UI Component Tests (Phase 106)', () => {
  const projectId = '00000000-0000-0000-0000-000000000111';
  const planId = '00000000-0000-0000-0000-000000000222';
  const snapshotId = '00000000-0000-0000-0000-000000000333';
  const testCaseId = '00000000-0000-0000-0000-000000000444';

  const mockPlan: RetestPlanDto = {
    id: planId,
    projectId,
    changeSnapshotId: snapshotId,
    impactGraph: { nodes: [], edges: [] },
    selectedTests: [
      {
        testCaseId,
        testCaseKey: 'TC-AUTH-001',
        testCaseTitle: 'Verify valid credentials login',
        testCaseVersionId: null,
        testCaseVersionNumber: 1,
        selectionState: 'MANDATORY',
        impactCategory: 'DIRECT',
        confidence: 'HIGH',
        selectionReason: 'Directly traces to modified requirement REQ-AUTH-01.',
        dependencyPath: [],
        riskSignals: ['SECURITY_CRITICAL_PATH'],
        evidenceReferences: ['Requirement:REQ-AUTH-01'],
        historicalFailureSignal: false,
        isExecutable: true,
      },
      {
        testCaseId: '00000000-0000-0000-0000-000000000555',
        testCaseKey: 'TC-PROF-002',
        testCaseTitle: 'Verify user profile management',
        testCaseVersionId: null,
        testCaseVersionNumber: 1,
        selectionState: 'RECOMMENDED',
        impactCategory: 'INDIRECT',
        confidence: 'HIGH',
        selectionReason: 'Exercises dependent module profile-service.ts.',
        dependencyPath: ['src/auth/login.ts', 'src/profile/profile-service.ts'],
        riskSignals: [],
        evidenceReferences: [],
        historicalFailureSignal: false,
        isExecutable: true,
      },
    ],
    totalTestsCount: 2,
    mandatoryCount: 1,
    recommendedCount: 1,
    optionalCount: 0,
    unknownCount: 0,
    excludedCount: 0,
    fullRegressionRequired: false,
    fullRegressionReason: null,
    status: 'COMPLETED',
    selectionPolicyVersion: '1.0.0',
    riskPolicyVersion: '1.0.0',
    impactEngineVersion: '1.0.0',
    auditTrail: [],
    changeSnapshot: {
      id: snapshotId,
      projectId,
      sourceType: 'REQUIREMENT_CHANGE',
      sourceEntityId: 'req-auth-1',
      baseRevision: 'base-sha-1',
      targetRevision: 'head-sha-1',
      title: 'Auth Flow Modernization',
      description: 'Updated auth contract',
      changedFiles: ['src/auth/login.ts'],
      changedSymbolsJson: [],
      changedRequirements: ['REQ-AUTH-01'],
      changedApisJson: [],
      changedConfiguration: {},
      diffText: null,
      metadataJson: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('renders RetestPlanCard with header, statistics counters, and change snapshot info', () => {
    const html = renderToString(<RetestPlanCard projectId={projectId} plan={mockPlan} />);

    assert.ok(
      html.includes('Intelligent Retest &amp; Impact Analysis') ||
        html.includes('Intelligent Retest & Impact Analysis'),
    );
    assert.ok(html.includes('Analyze Change Impact'));
    assert.ok(html.includes('Auth Flow Modernization'));
    assert.ok(html.includes('TC-AUTH-001'));
    assert.ok(html.includes('TC-PROF-002'));
    assert.ok(html.includes('MANDATORY'));
    assert.ok(html.includes('RECOMMENDED'));
  });

  it('renders full regression escalation alert when fullRegressionRequired is true', () => {
    const fullRegPlan: RetestPlanDto = {
      ...mockPlan,
      fullRegressionRequired: true,
      fullRegressionReason:
        'Root package.json changed; safe selective boundary cannot be established.',
      mandatoryCount: 2,
      recommendedCount: 0,
    };

    const html = renderToString(<RetestPlanCard projectId={projectId} plan={fullRegPlan} />);

    assert.ok(html.includes('Full Regression Escalation Mandated'));
    assert.ok(html.includes('Root package.json changed'));
  });

  it('renders ImpactExplanationModal with trace path, signals, and evidence', () => {
    const selectedTest = mockPlan.selectedTests[0]!;
    const html = renderToString(
      <ImpactExplanationModal isOpen={true} onClose={() => {}} test={selectedTest} />,
    );

    assert.ok(html.includes('Test Selection Explanation'));
    assert.ok(html.includes('TC-AUTH-001'));
    assert.ok(html.includes('Verify valid credentials login'));
    assert.ok(html.includes('Directly traces to modified requirement'));
    assert.ok(html.includes('SECURITY_CRITICAL_PATH'));
  });
});
