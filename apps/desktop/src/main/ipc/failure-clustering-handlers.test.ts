/**
 * @file apps/desktop/src/main/ipc/failure-clustering-handlers.test.ts
 * Unit and security tests for Defect Clustering IPC handlers (V6 Phase 85).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleClusterDefects,
  handleGetCluster,
  handleGetFailureMembership,
  handleMergeClusters,
  handleSplitCluster,
  handleOverrideMembership,
  handleListClusterHistory,
  setSharedDefectClusteringService,
} from './failure-handlers.js';
import type { DefectClusteringService } from '@ai-quality/core';
import type {
  DefectClusterDto,
  DefectClusterMembershipDto,
  DefectClusterHistoryDto,
  DuplicateComparisonResultDto,
} from '@ai-quality/contracts';

describe('Defect Clustering IPC Handlers (V6 Phase 85)', () => {
  function createMockEvent(isMainFrame = true): IpcMainInvokeEvent {
    return {
      senderFrame: {
        parent: isMainFrame ? null : ({} as any),
        url: isMainFrame ? 'app://renderer/index.html' : 'https://malicious-site.com',
      },
    } as unknown as IpcMainInvokeEvent;
  }

  const trustedEvent = createMockEvent(true);
  const untrustedEvent = createMockEvent(false);

  const testProjectId = crypto.randomUUID();
  const testClusterId = crypto.randomUUID();
  const testFailureCaseId1 = crypto.randomUUID();
  const testFailureCaseId2 = crypto.randomUUID();

  const mockComparisonDto: DuplicateComparisonResultDto = {
    failureCaseIdA: testFailureCaseId1,
    failureCaseIdB: testFailureCaseId2,
    relationshipType: 'EXACT_DUPLICATE',
    relationshipStrength: 'STRONG',
    similarityScore: 0.94,
    matchedSignals: [
      {
        signal: 'SAME_ENDPOINT_AND_STATUS',
        description: 'Matching endpoint /api/pay status 500',
        weight: 0.35,
      },
    ],
    contradictorySignals: [],
    explanation: 'Exact match on endpoint and localized symbol',
    evaluatedAt: new Date().toISOString(),
  };

  const mockMembershipDto: DefectClusterMembershipDto = {
    id: crypto.randomUUID(),
    clusterId: testClusterId,
    failureCaseId: testFailureCaseId1,
    projectId: testProjectId,
    relationshipType: 'EXACT_DUPLICATE',
    relationshipStrength: 'STRONG',
    similarityScore: 0.94,
    matchedSignals: [
      {
        signal: 'SAME_ENDPOINT_AND_STATUS',
        description: 'Matching endpoint /api/pay status 500',
        weight: 0.35,
      },
    ],
    contradictorySignals: [],
    explanation: 'Exact duplicate match',
    isRepresentative: true,
    isManualOverride: false,
    manualOverrideReason: null,
    isActive: true,
    addedAt: new Date().toISOString(),
    removedAt: null,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockClusterDto: DefectClusterDto = {
    id: testClusterId,
    projectId: testProjectId,
    clusterKey: 'CLU-0001',
    title: 'Cluster: Exact duplicate failures',
    clusterStatus: 'ACTIVE',
    representativeFailureId: testFailureCaseId1,
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
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    clusterFingerprint: 'c'.repeat(64),
    version: 1,
    mergedIntoClusterId: null,
    splitFromClusterId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    memberships: [mockMembershipDto],
  };

  const mockHistoryDto: DefectClusterHistoryDto = {
    id: crypto.randomUUID(),
    clusterId: testClusterId,
    projectId: testProjectId,
    eventType: 'CREATED',
    failureCaseId: null,
    previousState: null,
    newState: null,
    reason: 'Initial cluster formation',
    actor: 'SYSTEM',
    createdAt: new Date().toISOString(),
  };

  let mockService: DefectClusteringService;

  beforeEach(() => {
    mockService = {
      compareFailures: async () => mockComparisonDto,
      clusterDefects: async () => [mockClusterDto],
      getCluster: async () => mockClusterDto,
      listClusters: async () => [mockClusterDto],
      getFailureMembership: async () => mockMembershipDto,
      mergeClusters: async () => mockClusterDto,
      splitCluster: async () => ({
        remainingCluster: mockClusterDto,
        newCluster: mockClusterDto,
      }),
      overrideMembership: async () => mockMembershipDto,
      listClusterHistory: async () => [mockHistoryDto],
    } as unknown as DefectClusteringService;

    setSharedDefectClusteringService(mockService);
  });

  it('1. Rejects untrusted IPC sender on clusterDefects', async () => {
    const res = await handleClusterDefects(untrustedEvent, {
      projectId: testProjectId,
      failureCaseIds: [testFailureCaseId1],
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('2. Rejects invalid schema payload on clusterDefects', async () => {
    const res = await handleClusterDefects(trustedEvent, {
      projectId: 'invalid-not-uuid',
      failureCaseIds: [testFailureCaseId1],
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'VALIDATION_ERROR');
    }
  });

  it('3. Successfully invokes clusterDefects with valid input', async () => {
    const res = await handleClusterDefects(trustedEvent, {
      projectId: testProjectId,
      failureCaseIds: [testFailureCaseId1, testFailureCaseId2],
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.length, 1);
      assert.equal(res.data[0]?.id, testClusterId);
      assert.equal(res.data[0]?.clusterKey, 'CLU-0001');
    }
  });

  it('4. Successfully invokes getCluster', async () => {
    const res = await handleGetCluster(trustedEvent, {
      projectId: testProjectId,
      clusterId: testClusterId,
    });
    assert.equal(res.ok, true);
    if (res.ok && res.data) {
      assert.equal(res.data.id, testClusterId);
    }
  });

  it('5. Successfully invokes getFailureMembership', async () => {
    const res = await handleGetFailureMembership(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId1,
    });
    assert.equal(res.ok, true);
    if (res.ok && res.data) {
      assert.equal(res.data.clusterId, testClusterId);
    }
  });

  it('6. Successfully invokes mergeClusters', async () => {
    const res = await handleMergeClusters(trustedEvent, {
      projectId: testProjectId,
      sourceClusterId: crypto.randomUUID(),
      targetClusterId: testClusterId,
      reason: 'Manual merge verified by engineer',
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.id, testClusterId);
    }
  });

  it('7. Successfully invokes splitCluster', async () => {
    const res = await handleSplitCluster(trustedEvent, {
      projectId: testProjectId,
      clusterId: testClusterId,
      failureCaseIdsToExtract: [testFailureCaseId2],
      reason: 'Splitting out non-identical error',
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.remainingCluster.id, testClusterId);
      assert.equal(res.data.newCluster.id, testClusterId);
    }
  });

  it('8. Successfully invokes overrideMembership', async () => {
    const res = await handleOverrideMembership(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId1,
      targetClusterId: testClusterId,
      action: 'MOVE',
      reason: 'Manual override to cluster 1',
    });
    assert.equal(res.ok, true);
    if (res.ok && res.data) {
      assert.equal(res.data.clusterId, testClusterId);
    }
  });

  it('9. Successfully invokes listClusterHistory', async () => {
    const res = await handleListClusterHistory(trustedEvent, {
      projectId: testProjectId,
      clusterId: testClusterId,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.length, 1);
      assert.equal(res.data[0]?.eventType, 'CREATED');
    }
  });
});
