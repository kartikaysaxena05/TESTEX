/**
 * @file apps/desktop/src/main/ipc/test-review-handlers.test.ts
 * Unit tests for Phase 56 Test Review IPC handlers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import type {
  TestHistoryResultDto,
  TestReviewDetailDto,
  TestReviewQueueResultDto,
  TestVersionDiffDto,
} from '@ai-quality/contracts';
import {
  handleApproveTestVersion,
  handleCompareTestVersions,
  handleEditTestCase,
  handleGetTestHistory,
  handleGetTestReviewDetail,
  handleListTestReviewQueue,
  handleRegenerateTestCase,
  handleRejectTestVersion,
  setTestReviewServiceForTesting,
} from './test-review-handlers.js';
import type { TestReviewService } from '@ai-quality/core';
import { TestReviewProjectMismatchError, TestVersionConflictError } from '@ai-quality/core';

const fakeEvent = {} as IpcMainInvokeEvent;

const sampleReviewQueue: TestReviewQueueResultDto = {
  items: [
    {
      testCaseId: '11111111-2222-3333-4444-555555555555',
      testCaseKey: 'TC-001',
      title: 'Valid Login',
      type: 'POSITIVE',
      priority: 'HIGH',
      currentVersionNumber: 1,
      reviewStatus: 'DRAFT',
      approvedVersionNumber: null,
      approvedAt: null,
      sourceRequirementId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      sourceRequirementKey: 'REQ-001',
      sourceRequirementTitle: 'Auth Flow',
      sourceRequirementVersionNumber: 1,
      currentRequirementVersionNumber: 1,
      isRequirementStale: false,
      latestValidationStatus: 'VALID',
      updatedAt: new Date().toISOString(),
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
};

const sampleDetail: TestReviewDetailDto = {
  testCase: {
    id: '11111111-2222-3333-4444-555555555555',
    projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    testCaseKey: 'TC-001',
    title: 'Valid Login',
    objective: 'Test user login',
    description: null,
    type: 'POSITIVE',
    priority: 'HIGH',
    status: 'ACTIVE' as any,
    executionSuitability: 'AUTOMATED',
    currentVersionNumber: 1,
    reviewStatus: 'DRAFT',
    assumptions: [],
    unknowns: [],
    tags: [],
    preconditionCount: 0,
    stepCount: 0,
    testDataCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  activeVersion: {
    id: '22222222-3333-4444-5555-666666666666',
    projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    testCaseId: '11111111-2222-3333-4444-555555555555',
    versionNumber: 1,
    sourceType: 'INITIAL_AI_GENERATION',
    title: 'Valid Login',
    objective: 'Test user login',
    description: null,
    type: 'POSITIVE',
    priority: 'HIGH',
    executionSuitability: 'AUTOMATED',
    reviewStatus: 'DRAFT',
    changedFields: [],
    generationMetadata: {},
    preconditions: [],
    steps: [],
    testData: [],
    assumptions: [],
    unknowns: [],
    createdAt: new Date().toISOString(),
  },
  currentRequirement: {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    key: 'REQ-001',
    title: 'Auth Flow',
    versionNumber: 1,
    originalText: 'Auth requirement text',
  },
  isRequirementStale: false,
  latestValidation: null,
  versionsCount: 1,
  reviewEvents: [],
};

const sampleHistory: TestHistoryResultDto = {
  versions: [sampleDetail.activeVersion],
  reviewEvents: [],
};

const sampleDiff: TestVersionDiffDto = {
  fromVersionNumber: 1,
  toVersionNumber: 2,
  fieldChanges: [{ field: 'title', oldValue: 'Old Title', newValue: 'New Title' }],
  preconditionChanges: { added: [], removed: [], modified: [] },
  stepChanges: { added: [], removed: [], modified: [] },
  testDataChanges: { added: [], removed: [], modified: [] },
};

describe('Test Review IPC Handlers', () => {
  it('returns validation error for invalid payload', async () => {
    const res = await handleListTestReviewQueue(fakeEvent, { projectId: 'not-a-uuid' });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'TEST_REVIEW_VALIDATION_FAILED');
    }
  });

  it('delegates handleListTestReviewQueue successfully', async () => {
    const mockService = {
      listReviewQueue: async () => sampleReviewQueue,
    } as unknown as TestReviewService;

    setTestReviewServiceForTesting(mockService);

    const res = await handleListTestReviewQueue(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.total, 1);
      assert.equal(res.data.items[0]?.testCaseKey, 'TC-001');
    }
  });

  it('maps domain errors properly (e.g. TestVersionConflictError)', async () => {
    const mockService = {
      editTestCase: async () => {
        throw new TestVersionConflictError('11111111-2222-3333-4444-555555555555', 1, 2);
      },
    } as unknown as TestReviewService;

    setTestReviewServiceForTesting(mockService);

    const res = await handleEditTestCase(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      testCaseId: '11111111-2222-3333-4444-555555555555',
      expectedVersionNumber: 1,
      title: 'Edited Title',
      objective: 'Edited Objective',
      preconditions: [],
      steps: [],
      testData: [],
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'TEST_VERSION_CONFLICT');
    }
  });

  it('handles approve, reject, regenerate, getHistory, and compareVersions', async () => {
    const mockService = {
      getReviewDetail: async () => sampleDetail,
      approveTestVersion: async () => ({
        ...sampleDetail,
        testCase: { ...sampleDetail.testCase, reviewStatus: 'APPROVED' },
      }),
      rejectTestVersion: async () => ({
        ...sampleDetail,
        testCase: { ...sampleDetail.testCase, reviewStatus: 'REJECTED' },
      }),
      regenerateTestCase: async () => sampleDetail,
      getTestHistory: async () => sampleHistory,
      compareTestVersions: async () => sampleDiff,
    } as unknown as TestReviewService;

    setTestReviewServiceForTesting(mockService);

    const detailRes = await handleGetTestReviewDetail(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      testCaseId: '11111111-2222-3333-4444-555555555555',
    });
    assert.equal(detailRes.ok, true);

    const approveRes = await handleApproveTestVersion(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      testCaseId: '11111111-2222-3333-4444-555555555555',
      versionNumber: 1,
    });
    assert.equal(approveRes.ok, true);

    const rejectRes = await handleRejectTestVersion(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      testCaseId: '11111111-2222-3333-4444-555555555555',
      versionNumber: 1,
      rejectionReason: 'INVALID_EXPECTED_RESULT',
    });
    assert.equal(rejectRes.ok, true);

    const regenRes = await handleRegenerateTestCase(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      testCaseId: '11111111-2222-3333-4444-555555555555',
      expectedVersionNumber: 1,
      reason: 'Regen test',
    });
    assert.equal(regenRes.ok, true);

    const historyRes = await handleGetTestHistory(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      testCaseId: '11111111-2222-3333-4444-555555555555',
    });
    assert.equal(historyRes.ok, true);

    const compareRes = await handleCompareTestVersions(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      testCaseId: '11111111-2222-3333-4444-555555555555',
      fromVersionNumber: 1,
      toVersionNumber: 2,
    });
    assert.equal(compareRes.ok, true);
  });

  it('maps TestReviewProjectMismatchError correctly', async () => {
    const mockService = {
      getReviewDetail: async () => {
        throw new TestReviewProjectMismatchError(
          '11111111-2222-3333-4444-555555555555',
          'proj-a',
          'proj-b',
        );
      },
    } as unknown as TestReviewService;

    setTestReviewServiceForTesting(mockService);

    const res = await handleGetTestReviewDetail(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      testCaseId: '11111111-2222-3333-4444-555555555555',
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'TEST_REVIEW_PROJECT_MISMATCH');
    }
  });
});
