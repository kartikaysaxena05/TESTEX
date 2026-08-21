/**
 * @file apps/desktop/src/main/ipc/specification-handlers.test.ts
 * Tests for Phase 51 Test Specification Enrichment IPC handlers.
 */

import type {
  EnrichTestSpecificationInputDto,
  GetEnrichedTestSpecificationsInputDto,
  TestSpecificationEnrichmentResultDto,
} from '@ai-quality/contracts';
import { AiInvalidRequestError, type TestSpecificationEnrichmentService } from '@ai-quality/core';
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  handleEnrichTestSpecifications,
  handleGetEnrichedTestSpecifications,
  setTestSpecificationServiceForTest,
} from './specification-handlers.js';

describe('Test Specification Enrichment IPC Handlers', () => {
  const dummyResult: TestSpecificationEnrichmentResultDto = {
    id: '4c47864f-4d9d-476c-843e-b851b9e84605',
    projectId: '11111111-1111-1111-1111-111111111111',
    requirementId: '22222222-2222-2222-2222-222222222222',
    requirementKey: 'REQ-IPC-051',
    requirementVersionNumber: 1,
    scenarioId: null,
    inputFingerprint: 'dummy-fingerprint',
    providerId: 'FAKE',
    model: 'fake-model',
    promptId: 'requirement.test-specification-enrichment',
    promptVersion: 1,
    specifications: [
      {
        id: '33333333-3333-3333-3333-333333333333',
        scenarioId: null,
        scenarioKey: 'SCN-001',
        testDesignId: null,
        title: 'Verify valid login specification',
        category: 'POSITIVE',
        preconditions: [],
        testData: [],
        expectedResults: [],
        assumptions: [],
        unknowns: [],
        confidence: 'HIGH',
        reviewRequired: false,
        reviewReasons: [],
        sourceEvidenceRefs: ['REQ-IPC-051'],
      },
    ],
    metrics: {
      totalSpecifications: 1,
      totalPreconditions: 0,
      totalTestDataItems: 0,
      totalExpectedResults: 0,
      reviewRequiredCount: 0,
      unknownCount: 0,
    },
    warnings: [],
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    durationMs: 42,
    createdAt: new Date().toISOString(),
  };

  const mockService = {
    enrichTestSpecifications: async (
      _input: EnrichTestSpecificationInputDto,
    ): Promise<TestSpecificationEnrichmentResultDto> => dummyResult,
    getEnrichedTestSpecifications: async (
      _input: GetEnrichedTestSpecificationsInputDto,
    ): Promise<TestSpecificationEnrichmentResultDto | null> => dummyResult,
  } as unknown as TestSpecificationEnrichmentService;

  beforeEach(() => {
    setTestSpecificationServiceForTest(mockService);
  });

  it('successfully executes handleEnrichTestSpecifications with valid input', async () => {
    const payload = {
      projectId: '11111111-1111-1111-1111-111111111111',
      requirementId: '22222222-2222-2222-2222-222222222222',
    };

    const result = await handleEnrichTestSpecifications(payload);
    assert.equal(result.requirementKey, 'REQ-IPC-051');
    assert.equal(result.specifications.length, 1);
  });

  it('rejects handleEnrichTestSpecifications with invalid UUID', async () => {
    const payload = {
      projectId: 'not-a-uuid',
      requirementId: '22222222-2222-2222-2222-222222222222',
    };

    await assert.rejects(() => handleEnrichTestSpecifications(payload), AiInvalidRequestError);
  });

  it('successfully executes handleGetEnrichedTestSpecifications with valid input', async () => {
    const payload = {
      projectId: '11111111-1111-1111-1111-111111111111',
      requirementId: '22222222-2222-2222-2222-222222222222',
    };

    const result = await handleGetEnrichedTestSpecifications(payload);
    assert.ok(result);
    assert.equal(result.requirementKey, 'REQ-IPC-051');
  });
});
