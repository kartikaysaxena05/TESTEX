/**
 * @file apps/desktop/src/main/ipc/requirement-classification-handlers.test.ts
 * Unit tests for requirement classification IPC handlers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleClassifyRequirement,
  handleGetRequirementMetadata,
  handleUpdateRequirementMetadata,
  handleRegenerateRequirementMetadata,
  handleBatchClassifyRequirements,
} from './requirement-classification-handlers.js';
import type { RequirementClassificationService } from '@ai-quality/core';
import type {
  RequirementMetadataDto,
  BatchClassifyRequirementsResultDto,
} from '@ai-quality/contracts';

describe('Requirement Classification IPC Handlers Unit Tests', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const requirementId = '22222222-2222-2222-2222-222222222222';

  const mockMetadata: RequirementMetadataDto = {
    id: '33333333-3333-3333-3333-333333333333',
    projectId,
    requirementId,
    requirementKey: 'REQ-001',
    originalRequirementText: 'The system shall encrypt all stored passwords.',
    category: 'NON_FUNCTIONAL',
    subCategory: 'SECURITY',
    domain: 'Authentication',
    module: 'Identity & Access',
    businessCapability: 'Encrypt Passwords',
    actors: ['system'],
    securityRelevant: true,
    performanceRelevant: false,
    complianceRelevant: false,
    complianceStandards: [],
    priority: 'HIGH',
    riskLevel: 'HIGH',
    criticality: 'HIGH',
    tags: ['security', 'encryption', 'password'],
    classificationMethod: 'DETERMINISTIC',
    classifierVersion: 'requirement-classifier-v1',
    reviewStatus: 'GENERATED',
    reasons: ['ENCRYPTION_PATTERN'],
    sourceRequirementTextSha256: 'a'.repeat(64),
    isStale: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('handles classify requirement successfully', async () => {
    const mockService = {
      classifyRequirement: async (pId: string, rId: string) => {
        assert.equal(pId, projectId);
        assert.equal(rId, requirementId);
        return mockMetadata;
      },
    } as unknown as RequirementClassificationService;

    const result = await handleClassifyRequirement({ projectId, requirementId }, mockService);

    assert.deepEqual(result, mockMetadata);
  });

  it('rejects invalid payload on classify requirement', async () => {
    const mockService = {} as RequirementClassificationService;

    await assert.rejects(
      async () => {
        await handleClassifyRequirement({ projectId: 'invalid-uuid', requirementId }, mockService);
      },
      (err: unknown) => {
        assert.equal((err as Error).name, 'ZodError');
        return true;
      },
    );
  });

  it('handles get requirement metadata successfully', async () => {
    const mockService = {
      getMetadata: async (pId: string, rId: string) => {
        assert.equal(pId, projectId);
        assert.equal(rId, requirementId);
        return mockMetadata;
      },
    } as unknown as RequirementClassificationService;

    const result = await handleGetRequirementMetadata({ projectId, requirementId }, mockService);

    assert.deepEqual(result, mockMetadata);
  });

  it('handles update requirement metadata successfully', async () => {
    const mockService = {
      updateMetadata: async (input: {
        projectId: string;
        requirementId: string;
        category?: string;
      }) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.requirementId, requirementId);
        assert.equal(input.category, 'BUSINESS_RULE');
        return { ...mockMetadata, category: 'BUSINESS_RULE' };
      },
    } as unknown as RequirementClassificationService;

    const result = await handleUpdateRequirementMetadata(
      {
        projectId,
        requirementId,
        category: 'BUSINESS_RULE',
      },
      mockService,
    );

    assert.equal(result.category, 'BUSINESS_RULE');
  });

  it('handles regenerate requirement metadata successfully', async () => {
    const mockService = {
      regenerateMetadata: async (pId: string, rId: string) => {
        assert.equal(pId, projectId);
        assert.equal(rId, requirementId);
        return mockMetadata;
      },
    } as unknown as RequirementClassificationService;

    const result = await handleRegenerateRequirementMetadata(
      { projectId, requirementId },
      mockService,
    );

    assert.deepEqual(result, mockMetadata);
  });

  it('handles batch classify requirements successfully', async () => {
    const mockBatchResult: BatchClassifyRequirementsResultDto = {
      classifiedCount: 1,
      failedCount: 0,
      results: [
        {
          requirementId,
          requirementKey: 'REQ-001',
          success: true,
          metadata: mockMetadata,
        },
      ],
    };

    const mockService = {
      batchClassifyRequirements: async (pId: string, rIds: readonly string[]) => {
        assert.equal(pId, projectId);
        assert.deepEqual(rIds, [requirementId]);
        return mockBatchResult;
      },
    } as unknown as RequirementClassificationService;

    const result = await handleBatchClassifyRequirements(
      {
        projectId,
        requirementIds: [requirementId],
      },
      mockService,
    );

    assert.deepEqual(result, mockBatchResult);
  });
});
