/**
 * @file apps/desktop/src/main/ipc/test-validation-handlers.test.ts
 * Tests for Phase 53 AI Test Generation Validation IPC handlers.
 */

import type {
  TestCaseValidationDto,
  BatchValidationResultDto,
  ValidateTestCaseInputDto,
  ValidateSpecificationInputDto,
  ValidateTestBatchInputDto,
  GetLatestValidationInputDto,
  ListValidationHistoryInputDto,
} from '@ai-quality/contracts';
import { TestValidationError, type TestGenerationValidationService } from '@ai-quality/core';
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  handleValidateTestCase,
  handleValidateSpecification,
  handleValidateBatch,
  handleGetLatestValidation,
  handleListValidationHistory,
  setTestGenerationValidationServiceForTest,
} from './test-validation-handlers.js';

describe('Test Validation IPC Handlers', () => {
  const dummyValidation: TestCaseValidationDto = {
    id: '4c47864f-4d9d-476c-843e-b851b9e84605',
    projectId: '11111111-1111-1111-1111-111111111111',
    testCaseId: '5c47864f-4d9d-476c-843e-b851b9e84606',
    requirementId: '22222222-2222-2222-2222-222222222222',
    requirementVersionNumber: 1,
    validatorVersion: 'test-validation-v1',
    status: 'VALID',
    isStale: false,
    staleReason: null,
    testContentHash: 'abc123hash',
    requirementContentHash: 'def456hash',
    summary: 'Test case is valid.',
    metrics: {
      totalFindings: 0,
      infoCount: 0,
      warningCount: 0,
      errorCount: 0,
      blockerCount: 0,
      structuralValid: true,
      grounded: true,
      contradictionCount: 0,
      hallucinationCount: 0,
      durationMs: 12,
    },
    provenance: {},
    findings: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const dummyBatchResult: BatchValidationResultDto = {
    validations: [dummyValidation],
    summary: {
      total: 1,
      validCount: 1,
      reviewRequiredCount: 0,
      rejectedCount: 0,
      errorCount: 0,
    },
  };

  let mockService: Partial<TestGenerationValidationService>;

  beforeEach(() => {
    mockService = {
      validateTestCase: async () => dummyValidation,
      validateSpecification: async () => dummyValidation,
      validateBatch: async () => dummyBatchResult,
      getLatestValidation: async () => dummyValidation,
      listValidationHistory: async () => [dummyValidation],
    };
    setTestGenerationValidationServiceForTest(mockService as TestGenerationValidationService);
  });

  it('handles validateTestCase successfully', async () => {
    const payload: ValidateTestCaseInputDto = {
      projectId: '11111111-1111-1111-1111-111111111111',
      testCaseId: '5c47864f-4d9d-476c-843e-b851b9e84606',
    };

    const result = await handleValidateTestCase(
      payload,
      mockService as TestGenerationValidationService,
    );
    assert.strictEqual(result.id, dummyValidation.id);
    assert.strictEqual(result.status, 'VALID');
  });

  it('rejects invalid validateTestCase payload', async () => {
    const invalidPayload = {
      projectId: 'not-a-uuid',
      testCaseId: '123',
    };

    await assert.rejects(
      async () => {
        await handleValidateTestCase(
          invalidPayload,
          mockService as TestGenerationValidationService,
        );
      },
      (err: unknown) => err instanceof TestValidationError,
    );
  });

  it('handles validateSpecification successfully', async () => {
    const payload: ValidateSpecificationInputDto = {
      projectId: '11111111-1111-1111-1111-111111111111',
      requirementId: '22222222-2222-2222-2222-222222222222',
      specification: {
        id: '6c47864f-4d9d-476c-843e-b851b9e84607',
        scenarioId: null,
        scenarioKey: 'SCN-001',
        testDesignId: null,
        title: 'Spec login',
        category: 'POSITIVE',
        preconditions: [],
        testData: [],
        expectedResults: [
          {
            id: '7c47864f-4d9d-476c-843e-b851b9e84608',
            key: 'EXP-001',
            category: 'SUCCESS',
            description: 'Logged in',
            observable: true,
            httpStatusExpected: 200,
            stateChange: null,
            nonChange: null,
            exactMessageExpected: null,
            confidence: 'HIGH',
            sourceEvidenceRefs: [],
            reviewRequired: false,
          },
        ],
        confidence: 'HIGH',
        reviewRequired: false,
        reviewReasons: [],
        assumptions: [],
        unknowns: [],
        sourceEvidenceRefs: [],
      },
    };

    const result = await handleValidateSpecification(
      payload,
      mockService as TestGenerationValidationService,
    );
    assert.strictEqual(result.id, dummyValidation.id);
  });

  it('handles validateBatch successfully', async () => {
    const payload: ValidateTestBatchInputDto = {
      projectId: '11111111-1111-1111-1111-111111111111',
      testCaseIds: ['5c47864f-4d9d-476c-843e-b851b9e84606'],
    };

    const result = await handleValidateBatch(
      payload,
      mockService as TestGenerationValidationService,
    );
    assert.strictEqual(result.summary.total, 1);
    assert.strictEqual(result.summary.validCount, 1);
  });

  it('handles getLatestValidation successfully', async () => {
    const payload: GetLatestValidationInputDto = {
      projectId: '11111111-1111-1111-1111-111111111111',
      testCaseId: '5c47864f-4d9d-476c-843e-b851b9e84606',
    };

    const result = await handleGetLatestValidation(
      payload,
      mockService as TestGenerationValidationService,
    );
    assert.strictEqual(result?.id, dummyValidation.id);
  });

  it('handles listValidationHistory successfully', async () => {
    const payload: ListValidationHistoryInputDto = {
      projectId: '11111111-1111-1111-1111-111111111111',
      testCaseId: '5c47864f-4d9d-476c-843e-b851b9e84606',
    };

    const result = await handleListValidationHistory(
      payload,
      mockService as TestGenerationValidationService,
    );
    assert.strictEqual(result.length, 1);
  });
});
