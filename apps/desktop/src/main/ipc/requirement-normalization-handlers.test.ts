/**
 * @file apps/desktop/src/main/ipc/requirement-normalization-handlers.test.ts
 * Unit tests for requirement normalization IPC handlers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleNormalizeRequirement,
  handleGetRequirementRepresentation,
  handleUpdateRequirementRepresentation,
  handleRegenerateRequirementRepresentation,
  handleBatchNormalizeRequirements,
} from './requirement-normalization-handlers.js';
import type { RequirementNormalizationService } from '@ai-quality/core';
import type {
  RequirementRepresentationDto,
  BatchNormalizeRequirementsResultDto,
} from '@ai-quality/contracts';

describe('Requirement Normalization IPC Handlers Unit Tests', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const requirementId = '22222222-2222-2222-2222-222222222222';

  const mockRepresentation: RequirementRepresentationDto = {
    id: '33333333-3333-3333-3333-333333333333',
    projectId,
    requirementId,
    requirementKey: 'REQ-001',
    originalRequirementText: 'The system shall allow login.',
    normalizedText: 'The system shall allow login.',
    actor: 'system',
    modality: 'SHALL',
    negated: false,
    action: 'allow',
    object: 'login',
    conditions: [],
    constraints: [],
    quantitativeValues: [],
    expectedOutcome: null,
    sourceRequirementTextSha256: 'a'.repeat(64),
    normalizationStatus: 'NORMALIZED',
    normalizationMethod: 'DETERMINISTIC',
    normalizerVersion: 'requirement-normalizer-v1',
    reviewStatus: 'GENERATED',
    warnings: [],
    isStale: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('handles normalize requirement successfully', async () => {
    const mockService = {
      normalizeRequirement: async (input: { projectId: string; requirementId: string }) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.requirementId, requirementId);
        return mockRepresentation;
      },
    } as unknown as RequirementNormalizationService;

    const result = await handleNormalizeRequirement({ projectId, requirementId }, mockService);

    assert.deepEqual(result, mockRepresentation);
  });

  it('rejects invalid payload on normalize requirement', async () => {
    const mockService = {} as RequirementNormalizationService;

    await assert.rejects(
      async () => {
        await handleNormalizeRequirement({ projectId: 'not-a-uuid', requirementId }, mockService);
      },
      (err: unknown) => {
        assert.equal((err as Error).name, 'ZodError');
        return true;
      },
    );
  });

  it('handles get requirement representation successfully', async () => {
    const mockService = {
      getRepresentation: async (input: { projectId: string; requirementId: string }) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.requirementId, requirementId);
        return mockRepresentation;
      },
    } as unknown as RequirementNormalizationService;

    const result = await handleGetRequirementRepresentation(
      { projectId, requirementId },
      mockService,
    );

    assert.deepEqual(result, mockRepresentation);
  });

  it('handles update requirement representation successfully', async () => {
    const mockService = {
      updateRepresentation: async (input: {
        projectId: string;
        requirementId: string;
        actor?: string;
      }) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.requirementId, requirementId);
        assert.equal(input.actor, 'administrator');
        return {
          ...mockRepresentation,
          actor: 'administrator',
          reviewStatus: 'REVIEWED',
        };
      },
    } as unknown as RequirementNormalizationService;

    const result = await handleUpdateRequirementRepresentation(
      {
        projectId,
        requirementId,
        actor: 'administrator',
      },
      mockService,
    );

    assert.equal(result.actor, 'administrator');
    assert.equal(result.reviewStatus, 'REVIEWED');
  });

  it('handles regenerate requirement representation successfully', async () => {
    const mockService = {
      regenerateRepresentation: async (input: { projectId: string; requirementId: string }) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.requirementId, requirementId);
        return mockRepresentation;
      },
    } as unknown as RequirementNormalizationService;

    const result = await handleRegenerateRequirementRepresentation(
      { projectId, requirementId },
      mockService,
    );

    assert.deepEqual(result, mockRepresentation);
  });

  it('handles batch normalize requirements successfully', async () => {
    const mockBatchResult: BatchNormalizeRequirementsResultDto = {
      normalizedCount: 1,
      failedCount: 0,
      results: [{ requirementId, success: true, representation: mockRepresentation }],
    };

    const mockService = {
      batchNormalizeRequirements: async (input: {
        projectId: string;
        requirementIds: string[];
      }) => {
        assert.equal(input.projectId, projectId);
        assert.deepEqual(input.requirementIds, [requirementId]);
        return mockBatchResult;
      },
    } as unknown as RequirementNormalizationService;

    const result = await handleBatchNormalizeRequirements(
      { projectId, requirementIds: [requirementId] },
      mockService,
    );

    assert.deepEqual(result, mockBatchResult);
  });
});
