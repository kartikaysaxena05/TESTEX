/**
 * @file apps/desktop/src/main/ipc/test-case-handlers.test.ts
 * Tests for Phase 52 Test Case IPC handlers.
 */

import type {
  TestCaseDetailDto,
  TestCaseListResultDto,
  BatchPersistTestCasesResultDto,
  CreateTestCaseInputDto,
  PersistGeneratedTestCaseInputDto,
  PersistGeneratedTestCasesBatchInputDto,
  ListTestCasesInputDto,
  GetTestCaseByIdInputDto,
  DeleteTestCaseInputDto,
} from '@ai-quality/contracts';
import { TestCaseValidationError, type TestCaseService } from '@ai-quality/core';
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  handleCreateTestCase,
  handleGetTestCaseById,
  handleListTestCases,
  handlePersistFromGeneration,
  handlePersistBatchFromGeneration,
  handleDeleteTestCase,
  setTestCaseServiceForTest,
} from './test-case-handlers.js';

describe('Test Case IPC Handlers', () => {
  const dummyDetail: TestCaseDetailDto = {
    id: '4c47864f-4d9d-476c-843e-b851b9e84605',
    projectId: '11111111-1111-1111-1111-111111111111',
    testCaseKey: 'TC-001',
    title: 'Verify valid login',
    objective: 'Ensure users can log in with valid credentials.',
    description: null,
    type: 'POSITIVE',
    priority: 'MEDIUM',
    status: 'GENERATED',
    executionSuitability: 'AUTOMATED',
    sourceRequirementId: '22222222-2222-2222-2222-222222222222',
    sourceRequirementKey: 'REQ-001',
    sourceRequirementVersionId: null,
    sourceRequirementVersionNumber: 1,
    sourceScenarioCandidateId: null,
    sourceScenarioKey: 'SCN-001',
    generationId: null,
    inputFingerprint: 'dummy-fingerprint',
    providerId: 'FAKE',
    model: 'fake-model',
    promptId: 'prompt-enrichment',
    promptVersion: 1,
    overallExpectedResult: '[SUCCESS] User authenticated',
    assumptions: [],
    unknowns: [],
    tags: [],
    preconditionCount: 1,
    stepCount: 2,
    testDataCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    preconditions: [
      {
        id: '33333333-3333-3333-3333-333333333333',
        testCaseId: '4c47864f-4d9d-476c-843e-b851b9e84605',
        sequenceOrder: 1,
        category: 'AUTHENTICATION',
        description: 'User exists',
        isEnforced: true,
        confidence: 'HIGH',
        sourceEvidenceRefs: [],
        reviewRequired: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    steps: [
      {
        id: '44444444-4444-4444-4444-444444444444',
        testCaseId: '4c47864f-4d9d-476c-843e-b851b9e84605',
        stepNumber: 1,
        action: 'Enter email and password',
        expectedResult: 'Fields populated',
        testDataSummary: 'email, pass',
        stateChangeFrom: null,
        stateChangeTo: null,
        stateEntity: null,
        isOptional: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    testData: [
      {
        id: '55555555-5555-5555-5555-555555555555',
        testCaseId: '4c47864f-4d9d-476c-843e-b851b9e84605',
        sequenceOrder: 1,
        name: 'email',
        dataType: 'STRING',
        origin: 'DERIVED',
        value: 'test@example.com',
        generator: null,
        constraint: null,
        isSensitive: false,
        unknownReason: null,
        confidence: 'HIGH',
        sourceEvidenceRefs: [],
        reviewRequired: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };

  const dummyList: TestCaseListResultDto = {
    items: [dummyDetail],
    total: 1,
    page: 1,
    pageSize: 25,
    totalPages: 1,
  };

  const mockService = {
    createTestCase: async (_input: CreateTestCaseInputDto): Promise<TestCaseDetailDto> =>
      dummyDetail,
    getTestCaseById: async (_input: GetTestCaseByIdInputDto): Promise<TestCaseDetailDto | null> =>
      dummyDetail,
    listTestCases: async (_input: ListTestCasesInputDto): Promise<TestCaseListResultDto> =>
      dummyList,
    persistFromGeneration: async (
      _input: PersistGeneratedTestCaseInputDto,
    ): Promise<TestCaseDetailDto> => dummyDetail,
    persistBatchFromGeneration: async (
      _input: PersistGeneratedTestCasesBatchInputDto,
    ): Promise<BatchPersistTestCasesResultDto> => ({
      createdCount: 1,
      testCases: [dummyDetail],
      idempotentHit: false,
    }),
    deleteTestCase: async (
      _input: DeleteTestCaseInputDto,
    ): Promise<{ readonly deleted: true }> => ({
      deleted: true,
    }),
  } as unknown as TestCaseService;

  beforeEach(() => {
    setTestCaseServiceForTest(mockService);
  });

  it('handles createTestCase with valid input', async () => {
    const payload = {
      projectId: '11111111-1111-1111-1111-111111111111',
      title: 'Valid test case',
      objective: 'Valid objective',
      steps: [{ action: 'Do something' }],
    };

    const res = await handleCreateTestCase(payload);
    assert.equal(res.testCaseKey, 'TC-001');
    assert.equal(res.title, 'Verify valid login');
  });

  it('rejects createTestCase with invalid schema (missing title)', async () => {
    const payload = {
      projectId: '11111111-1111-1111-1111-111111111111',
      objective: 'Missing title',
      steps: [{ action: 'Do something' }],
    };

    await assert.rejects(() => handleCreateTestCase(payload), TestCaseValidationError);
  });

  it('handles getTestCaseById with valid input', async () => {
    const payload = {
      projectId: '11111111-1111-1111-1111-111111111111',
      testCaseId: '4c47864f-4d9d-476c-843e-b851b9e84605',
    };

    const res = await handleGetTestCaseById(payload);
    assert.ok(res);
    assert.equal(res.testCaseKey, 'TC-001');
  });

  it('handles listTestCases with valid input', async () => {
    const payload = {
      projectId: '11111111-1111-1111-1111-111111111111',
      type: 'POSITIVE',
    };

    const res = await handleListTestCases(payload);
    assert.equal(res.total, 1);
    assert.equal(res.items[0]?.testCaseKey, 'TC-001');
  });

  it('handles deleteTestCase with valid input', async () => {
    const payload = {
      projectId: '11111111-1111-1111-1111-111111111111',
      testCaseId: '4c47864f-4d9d-476c-843e-b851b9e84605',
    };

    const res = await handleDeleteTestCase(payload);
    assert.equal(res.deleted, true);
  });

  it('handles handlePersistFromGeneration with valid input', async () => {
    const payload = {
      projectId: '11111111-1111-1111-1111-111111111111',
      requirementId: '22222222-2222-2222-2222-222222222222',
      specification: {
        id: '33333333-3333-3333-3333-333333333333',
        title: 'Verify valid login',
        category: 'POSITIVE',
        preconditions: [],
        testData: [],
        expectedResults: [],
        assumptions: [],
        unknowns: [],
        confidence: 'HIGH',
        reviewRequired: false,
        reviewReasons: [],
        sourceEvidenceRefs: [],
      },
    };

    const res = await handlePersistFromGeneration(payload);
    assert.equal(res.testCaseKey, 'TC-001');
  });

  it('handles handlePersistBatchFromGeneration with valid input', async () => {
    const payload = {
      projectId: '11111111-1111-1111-1111-111111111111',
      requirementId: '22222222-2222-2222-2222-222222222222',
      specifications: [
        {
          id: '33333333-3333-3333-3333-333333333333',
          title: 'Verify valid login',
          category: 'POSITIVE',
          preconditions: [],
          testData: [],
          expectedResults: [],
          assumptions: [],
          unknowns: [],
          confidence: 'HIGH',
          reviewRequired: false,
          reviewReasons: [],
          sourceEvidenceRefs: [],
        },
      ],
    };

    const res = await handlePersistBatchFromGeneration(payload);
    assert.equal(res.createdCount, 1);
    assert.equal(res.testCases.length, 1);
  });
});
