/**
 * @file apps/desktop/src/main/ipc/requirement-relationship-handlers.test.ts
 * Unit tests for requirement relationship and dependency graph IPC handlers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleProposeRelationships,
  handleGetRelationships,
  handleGetRelationshipGraph,
  handleCreateManualRelationship,
  handleReviewRelationship,
  handleDeleteRelationship,
} from './requirement-relationship-handlers.js';
import type { RequirementRelationshipService } from '@ai-quality/core';
import type {
  ProposeRelationshipsResultDto,
  RequirementRelationshipDto,
  RelationshipGraphDto,
} from '@ai-quality/contracts';

describe('Requirement Relationship IPC Handlers Unit Tests', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const requirementId = '22222222-2222-2222-2222-222222222222';
  const targetId = '33333333-3333-3333-3333-333333333333';
  const relationshipId = '44444444-4444-4444-4444-444444444444';

  const mockRelationship: RequirementRelationshipDto = {
    id: relationshipId,
    projectId,
    sourceRequirementId: requirementId,
    sourceRequirementKey: 'REQ-002',
    sourceRequirementTitle: 'Password Reset',
    targetRequirementId: targetId,
    targetRequirementKey: 'REQ-001',
    targetRequirementTitle: 'Authentication',
    relationshipType: 'DEPENDS_ON',
    detectionMethod: 'EXPLICIT_REFERENCE',
    status: 'PROPOSED',
    reasonCodes: ['EXPLICIT_REQUIREMENT_REFERENCE'],
    evidence: 'depends on REQ-001',
    sourceRequirementTextSha256: 'a'.repeat(64),
    targetRequirementTextSha256: 'b'.repeat(64),
    analyzerVersion: 'requirement-relationship-analyzer-v1',
    reviewRationale: null,
    isStale: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockProposeResult: ProposeRelationshipsResultDto = {
    proposedCount: 1,
    existingCount: 1,
    unresolvedReferences: [],
    relationships: [mockRelationship],
    cycles: [],
  };

  const mockGraphResult: RelationshipGraphDto = {
    projectId,
    nodes: [
      {
        id: requirementId,
        requirementKey: 'REQ-002',
        title: 'Password Reset',
        type: 'FUNCTIONAL',
        status: 'ACTIVE',
      },
      {
        id: targetId,
        requirementKey: 'REQ-001',
        title: 'Authentication',
        type: 'FUNCTIONAL',
        status: 'ACTIVE',
      },
    ],
    edges: [
      {
        id: relationshipId,
        sourceRequirementId: requirementId,
        targetRequirementId: targetId,
        relationshipType: 'DEPENDS_ON',
        status: 'PROPOSED',
        detectionMethod: 'EXPLICIT_REFERENCE',
        isStale: false,
      },
    ],
    cycles: [],
    confirmedEdgeCount: 0,
    proposedEdgeCount: 1,
    staleEdgeCount: 0,
  };

  it('handles propose relationships successfully', async () => {
    const mockService = {
      proposeRelationships: async (input: { projectId: string; requirementId?: string }) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.requirementId, requirementId);
        return mockProposeResult;
      },
    } as unknown as RequirementRelationshipService;

    const result = await handleProposeRelationships({ projectId, requirementId }, mockService);

    assert.deepEqual(result, mockProposeResult);
  });

  it('handles get relationships successfully', async () => {
    const mockService = {
      getRelationships: async (input: { projectId: string; requirementId: string }) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.requirementId, requirementId);
        return [mockRelationship];
      },
    } as unknown as RequirementRelationshipService;

    const result = await handleGetRelationships({ projectId, requirementId }, mockService);

    assert.deepEqual(result, [mockRelationship]);
  });

  it('handles get relationship graph successfully', async () => {
    const mockService = {
      getRelationshipGraph: async (input: { projectId: string }) => {
        assert.equal(input.projectId, projectId);
        return mockGraphResult;
      },
    } as unknown as RequirementRelationshipService;

    const result = await handleGetRelationshipGraph({ projectId }, mockService);

    assert.deepEqual(result, mockGraphResult);
  });

  it('handles create manual relationship successfully', async () => {
    const mockService = {
      createManualRelationship: async (input: {
        projectId: string;
        sourceRequirementId: string;
        targetRequirementId: string;
        relationshipType: string;
      }) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.sourceRequirementId, requirementId);
        assert.equal(input.targetRequirementId, targetId);
        return { ...mockRelationship, detectionMethod: 'MANUAL', status: 'CONFIRMED' };
      },
    } as unknown as RequirementRelationshipService;

    const result = await handleCreateManualRelationship(
      {
        projectId,
        sourceRequirementId: requirementId,
        targetRequirementId: targetId,
        relationshipType: 'DEPENDS_ON',
      },
      mockService,
    );

    assert.equal(result.status, 'CONFIRMED');
    assert.equal(result.detectionMethod, 'MANUAL');
  });

  it('handles review relationship successfully', async () => {
    const mockService = {
      reviewRelationship: async (input: {
        projectId: string;
        relationshipId: string;
        status: string;
      }) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.relationshipId, relationshipId);
        assert.equal(input.status, 'CONFIRMED');
        return { ...mockRelationship, status: 'CONFIRMED' };
      },
    } as unknown as RequirementRelationshipService;

    const result = await handleReviewRelationship(
      {
        projectId,
        relationshipId,
        status: 'CONFIRMED',
      },
      mockService,
    );

    assert.equal(result.status, 'CONFIRMED');
  });

  it('handles delete relationship successfully', async () => {
    const mockService = {
      deleteRelationship: async (input: { projectId: string; relationshipId: string }) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.relationshipId, relationshipId);
        return { deleted: true as const };
      },
    } as unknown as RequirementRelationshipService;

    const result = await handleDeleteRelationship(
      {
        projectId,
        relationshipId,
      },
      mockService,
    );

    assert.deepEqual(result, { deleted: true });
  });

  it('validates invalid UUID input and throws validation error', async () => {
    await assert.rejects(
      async () => {
        await handleProposeRelationships({ projectId: 'invalid-id' });
      },
      { name: 'ZodError' },
    );
  });
});
