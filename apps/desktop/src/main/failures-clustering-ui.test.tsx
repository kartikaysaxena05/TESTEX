/**
 * @file apps/desktop/src/main/failures-clustering-ui.test.tsx
 * UI rendering tests for DefectClusteringInspectionPanel (V6 Phase 85).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DefectClusteringInspectionPanel } from '../renderer/features/failures/DefectClusteringInspectionPanel.js';
import type {
  DefectClusterDto,
  DefectClusterMembershipDto,
  DefectClusterHistoryDto,
} from '@ai-quality/contracts';

describe('Defect Clustering UI Component Tests (V6 Phase 85)', () => {
  const mockClusterData: DefectClusterDto = {
    id: '00000000-0000-0000-0000-000000000111',
    projectId: '00000000-0000-0000-0000-000000000222',
    clusterKey: 'CLU-0001',
    title: 'Defect Cluster: Deadlock in OrderService',
    clusterStatus: 'ACTIVE',
    representativeFailureId: '00000000-0000-0000-0000-000000000333',
    memberCount: 2,
    relationshipStrength: 'STRONG',
    classificationSummary: null,
    probableLayer: 'BACKEND_SERVICE',
    rootCauseSummary: null,
    severitySummary: null,
    prioritySummary: null,
    affectedRequirements: [],
    affectedRoutes: [],
    affectedBuilds: [],
    firstSeenAt: '2026-09-08T12:00:00.000Z',
    lastSeenAt: '2026-09-08T12:00:00.000Z',
    clusterFingerprint: 'f'.repeat(64),
    version: 1,
    mergedIntoClusterId: null,
    splitFromClusterId: null,
    createdAt: '2026-09-08T12:00:00.000Z',
    updatedAt: '2026-09-08T12:00:00.000Z',
    memberships: [],
  };

  const mockMembershipData: DefectClusterMembershipDto = {
    id: '00000000-0000-0000-0000-000000000444',
    clusterId: mockClusterData.id,
    failureCaseId: '00000000-0000-0000-0000-000000000333',
    projectId: mockClusterData.projectId,
    similarityScore: 0.95,
    relationshipType: 'EXACT_DUPLICATE',
    relationshipStrength: 'STRONG',
    isRepresentative: true,
    isManualOverride: false,
    manualOverrideReason: null,
    matchedSignals: [
      {
        signal: 'SAME_ENDPOINT_AND_STATUS',
        description: 'Matching endpoint /api/pay status 500',
        weight: 0.35,
      },
    ],
    contradictorySignals: [],
    explanation: 'Exact duplicate match',
    isActive: true,
    addedAt: '2026-09-08T12:00:00.000Z',
    removedAt: null,
    version: 1,
    createdAt: '2026-09-08T12:00:00.000Z',
    updatedAt: '2026-09-08T12:00:00.000Z',
  };

  const mockHistoryData: DefectClusterHistoryDto = {
    id: '00000000-0000-0000-0000-000000000555',
    clusterId: mockClusterData.id,
    projectId: mockClusterData.projectId,
    eventType: 'CREATED',
    failureCaseId: null,
    previousState: null,
    newState: null,
    reason: 'Initial cluster formation',
    actor: 'SYSTEM',
    createdAt: '2026-09-08T12:00:00.000Z',
  };

  beforeEach(() => {
    (globalThis as any).window = {
      desktop: {
        failures: {
          getFailureMembership: async () => ({
            ok: true,
            data: mockMembershipData,
          }),
          getCluster: async () => ({
            ok: true,
            data: mockClusterData,
          }),
          listClusters: async () => ({
            ok: true,
            data: [mockClusterData],
          }),
          clusterDefects: async () => ({
            ok: true,
            data: [mockClusterData],
          }),
          mergeClusters: async () => ({
            ok: true,
            data: mockClusterData,
          }),
          splitCluster: async () => ({
            ok: true,
            data: {
              remainingCluster: mockClusterData,
              newCluster: mockClusterData,
            },
          }),
          overrideMembership: async () => ({
            ok: true,
            data: mockMembershipData,
          }),
          listClusterHistory: async () => ({
            ok: true,
            data: [mockHistoryData],
          }),
        },
      },
    };
  });

  it('renders DefectClusteringInspectionPanel loading state without errors', () => {
    const html = renderToString(
      <DefectClusteringInspectionPanel
        projectId="00000000-0000-0000-0000-000000000222"
        failureCaseId="00000000-0000-0000-0000-000000000333"
      />,
    );

    assert.ok(html.includes('Loading defect cluster intelligence...'));
  });

  it('handles missing window.desktop gracefully without throwing', () => {
    delete (globalThis as any).window;

    const html = renderToString(
      <DefectClusteringInspectionPanel
        projectId="00000000-0000-0000-0000-000000000222"
        failureCaseId="00000000-0000-0000-0000-000000000333"
      />,
    );

    assert.ok(html.length > 0);
  });
});
