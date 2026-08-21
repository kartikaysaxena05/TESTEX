/**
 * @file apps/desktop/src/main/ipc/categorized-test-handlers.test.ts
 * Tests for Phase 50 Categorized Test Generation IPC handlers.
 */

import type {
  CategorizedTestGenerationResultDto,
  GenerateCategorizedTestsInputDto,
  GetCategorizedTestsInputDto,
} from '@ai-quality/contracts';
import { AiInvalidRequestError, type CategorizedTestService } from '@ai-quality/core';
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  handleGenerateCategorizedTests,
  handleGetCategorizedTests,
  setCategorizedTestServiceForTest,
} from './categorized-test-handlers.js';

describe('Categorized Test Generation IPC Handlers', () => {
  const dummyResult: CategorizedTestGenerationResultDto = {
    id: '4c47864f-4d9d-476c-843e-b851b9e84605',
    projectId: '11111111-1111-1111-1111-111111111111',
    requirementId: '22222222-2222-2222-2222-222222222222',
    requirementKey: 'REQ-IPC-050',
    requirementVersionNumber: 1,
    generationId: null,
    inputFingerprint: 'dummy-fingerprint',
    providerId: 'FAKE',
    model: 'fake-model',
    promptId: 'requirement.categorized-test-generation',
    promptVersion: 1,
    categoryAssessments: [
      {
        category: 'POSITIVE',
        applicability: 'APPLICABLE',
        rationale: 'Valid cases supported.',
        testCount: 1,
      },
    ],
    testDesigns: [
      {
        id: '33333333-3333-3333-3333-333333333333',
        scenarioKey: 'SCN-001',
        requirementId: '22222222-2222-2222-2222-222222222222',
        requirementVersionNumber: 1,
        category: 'POSITIVE',
        title: 'Verify valid scenario',
        objective: 'Test valid scenario objective',
        rationale: 'Follows from requirement',
        confidence: 'HIGH',
        sourceEvidenceRefs: ['REQ-IPC-050'],
      },
    ],
    metrics: {
      totalGenerated: 1,
      positiveCount: 1,
      negativeCount: 0,
      boundaryCount: 0,
      validationCount: 0,
      notApplicableCategories: ['NEGATIVE', 'BOUNDARY', 'VALIDATION'],
    },
    warnings: [],
    usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    durationMs: 45,
    createdAt: new Date().toISOString(),
  };

  const fakeService = {
    generateCategorizedTests: async (
      _input: GenerateCategorizedTestsInputDto,
    ): Promise<CategorizedTestGenerationResultDto> => {
      return dummyResult;
    },
    getCategorizedTests: async (
      _input: GetCategorizedTestsInputDto,
    ): Promise<CategorizedTestGenerationResultDto | null> => {
      return dummyResult;
    },
  } as unknown as CategorizedTestService;

  beforeEach(() => {
    setCategorizedTestServiceForTest(fakeService);
  });

  it('handles generateCategorizedTests successfully with valid payload', async () => {
    const res = await handleGenerateCategorizedTests(
      {
        projectId: '11111111-1111-1111-1111-111111111111',
        requirementId: '22222222-2222-2222-2222-222222222222',
      },
      fakeService,
    );
    assert.strictEqual(res.id, dummyResult.id);
    assert.strictEqual(res.requirementKey, 'REQ-IPC-050');
  });

  it('rejects generateCategorizedTests with invalid payload (missing UUIDs)', async () => {
    await assert.rejects(
      async () => {
        await handleGenerateCategorizedTests(
          { projectId: 'invalid', requirementId: 123 },
          fakeService,
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AiInvalidRequestError);
        assert.strictEqual(err.code, 'INVALID_REQUEST');
        return true;
      },
    );
  });

  it('handles getCategorizedTests successfully', async () => {
    const res = await handleGetCategorizedTests(
      {
        projectId: '11111111-1111-1111-1111-111111111111',
        requirementId: '22222222-2222-2222-2222-222222222222',
      },
      fakeService,
    );
    assert.ok(res);
    assert.strictEqual(res.id, dummyResult.id);
  });
});
