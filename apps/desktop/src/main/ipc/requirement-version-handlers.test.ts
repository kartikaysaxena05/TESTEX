/**
 * @file apps/desktop/src/main/ipc/requirement-version-handlers.test.ts
 * Unit tests for requirement versioning and change impact IPC handlers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleGetRequirementHistory,
  handleGetRequirementVersion,
  handleCompareRequirementVersions,
  handleUpdateRequirementVersioned,
  handleRestoreRequirementVersion,
  handleGetRequirementChangeImpact,
  handleReviewRequirementImpact,
} from './requirement-version-handlers.js';
import type { RequirementVersionService, RequirementImpactService } from '@ai-quality/core';
import type {
  RequirementHistoryDto,
  RequirementVersionDto,
  RequirementDiffDto,
  RequirementDto,
  RequirementImpactsResultDto,
  RequirementImpactCandidateDto,
} from '@ai-quality/contracts';

describe('Requirement Versioning & Impact IPC Handlers Unit Tests', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const requirementId = '22222222-2222-2222-2222-222222222222';
  const versionId = '33333333-3333-3333-3333-333333333333';
  const impactId = '44444444-4444-4444-4444-444444444444';

  const mockVersion: RequirementVersionDto = {
    id: versionId,
    projectId,
    requirementId,
    versionNumber: 1,
    requirementKeySnapshot: 'REQ-001',
    title: 'User Login',
    originalText: 'System shall authenticate users.',
    type: 'FUNCTIONAL',
    priority: 'HIGH',
    status: 'ACTIVE',
    sourceRequirementTextSha256: 'a'.repeat(64),
    changeKind: 'CREATED',
    changeReason: 'Initial requirement creation',
    changedFields: [],
    createdByActorId: null,
    createdAt: new Date().toISOString(),
  };

  const mockHistory: RequirementHistoryDto = {
    requirementId,
    requirementKey: 'REQ-001',
    currentVersionNumber: 1,
    totalVersions: 1,
    versions: [mockVersion],
  };

  const mockDiff: RequirementDiffDto = {
    sourceVersionNumber: 1,
    targetVersionNumber: 2,
    isNoOp: false,
    changedFields: ['originalText'],
    changeKinds: ['TEXT_CHANGED'],
    titleDiff: [],
    textDiff: [{ type: 'ADDED', value: 'System shall authenticate' }],
    structuredDiff: [],
  };

  const mockRequirement: RequirementDto = {
    id: requirementId,
    projectId,
    requirementSourceId: null,
    requirementSourceName: null,
    requirementKey: 'REQ-001',
    title: 'User Login',
    originalText: 'System shall authenticate users with MFA.',
    type: 'FUNCTIONAL',
    priority: 'HIGH',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockImpactCandidate: RequirementImpactCandidateDto = {
    id: impactId,
    projectId,
    requirementId,
    requirementVersionId: versionId,
    impactType: 'DEPENDENT_REQUIREMENT',
    targetRequirementId: '55555555-5555-5555-5555-555555555555',
    targetRequirementKey: 'REQ-002',
    targetRequirementTitle: 'Session Management',
    repositoryEvidenceId: null,
    repositoryEvidencePath: null,
    repositoryEvidenceSymbol: null,
    reasonCode: 'DIRECT_DEPENDENCY',
    status: 'OPEN',
    reviewRationale: null,
    depth: 1,
    createdAt: new Date().toISOString(),
    reviewedAt: null,
  };

  const mockImpactResult: RequirementImpactsResultDto = {
    requirementId,
    requirementVersionId: versionId,
    versionNumber: 1,
    totalCandidates: 1,
    openCount: 1,
    candidates: [mockImpactCandidate],
  };

  it('handles get requirement history successfully', async () => {
    const mockService = {
      getRequirementHistory: async (input: { projectId: string; requirementId: string }) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.requirementId, requirementId);
        return mockHistory;
      },
    } as unknown as RequirementVersionService;

    const result = await handleGetRequirementHistory({ projectId, requirementId }, mockService);
    assert.deepEqual(result, mockHistory);
  });

  it('handles get single version successfully', async () => {
    const mockService = {
      getRequirementVersion: async (input: {
        projectId: string;
        requirementId: string;
        versionNumber: number;
      }) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.requirementId, requirementId);
        assert.equal(input.versionNumber, 1);
        return mockVersion;
      },
    } as unknown as RequirementVersionService;

    const result = await handleGetRequirementVersion(
      { projectId, requirementId, versionNumber: 1 },
      mockService,
    );
    assert.deepEqual(result, mockVersion);
  });

  it('handles compare versions successfully', async () => {
    const mockService = {
      compareVersions: async (input: {
        projectId: string;
        requirementId: string;
        sourceVersionNumber: number;
        targetVersionNumber: number;
      }) => {
        assert.equal(input.sourceVersionNumber, 1);
        assert.equal(input.targetVersionNumber, 2);
        return mockDiff;
      },
    } as unknown as RequirementVersionService;

    const result = await handleCompareRequirementVersions(
      { projectId, requirementId, sourceVersionNumber: 1, targetVersionNumber: 2 },
      mockService,
    );
    assert.deepEqual(result, mockDiff);
  });

  it('handles update requirement versioned successfully', async () => {
    const mockService = {
      updateRequirementVersioned: async () => {
        return { requirement: mockRequirement, version: mockVersion };
      },
    } as unknown as RequirementVersionService;

    const result = await handleUpdateRequirementVersioned(
      {
        projectId,
        requirementId,
        expectedVersionNumber: 1,
        originalText: 'System shall authenticate users with MFA.',
      },
      mockService,
    );
    assert.deepEqual(result.requirement, mockRequirement);
  });

  it('handles restore version successfully', async () => {
    const mockService = {
      restoreRequirementVersion: async () => {
        return { requirement: mockRequirement, newVersion: mockVersion };
      },
    } as unknown as RequirementVersionService;

    const result = await handleRestoreRequirementVersion(
      {
        projectId,
        requirementId,
        versionNumberToRestore: 1,
        restoreReason: 'Test rollback',
      },
      mockService,
    );
    assert.deepEqual(result.newVersion, mockVersion);
  });

  it('handles get change impact successfully', async () => {
    const mockService = {
      getChangeImpact: async (input: { projectId: string; requirementId: string }) => {
        assert.equal(input.projectId, projectId);
        return mockImpactResult;
      },
    } as unknown as RequirementImpactService;

    const result = await handleGetRequirementChangeImpact(
      { projectId, requirementId },
      mockService,
    );
    assert.deepEqual(result, mockImpactResult);
  });

  it('handles review change impact successfully', async () => {
    const mockService = {
      reviewChangeImpact: async (input: {
        projectId: string;
        impactId: string;
        status: string;
      }) => {
        assert.equal(input.impactId, impactId);
        assert.equal(input.status, 'REVIEWED');
        return { ...mockImpactCandidate, status: 'REVIEWED' };
      },
    } as unknown as RequirementImpactService;

    const result = await handleReviewRequirementImpact(
      { projectId, impactId, status: 'REVIEWED', reviewRationale: 'Verified ok' },
      mockService,
    );
    assert.equal(result.status, 'REVIEWED');
  });

  it('rejects invalid inputs failing zod schema validation', async () => {
    const mockService = {} as unknown as RequirementVersionService;
    await assert.rejects(async () => {
      await handleGetRequirementHistory({ projectId: 'not-a-uuid', requirementId }, mockService);
    });
  });
});
