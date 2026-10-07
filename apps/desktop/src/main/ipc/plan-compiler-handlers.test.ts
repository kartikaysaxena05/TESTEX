/**
 * @file apps/desktop/src/main/ipc/plan-compiler-handlers.test.ts
 * Unit and security tests for Plan Compiler IPC handlers.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleCompilePlan,
  handleGetPlan,
  handleGetPlanByTestCase,
  handleListPlans,
  handlePreviewPlan,
  setExecutablePlanServiceForTest,
} from './plan-compiler-handlers.js';
import type { ExecutableTestPlanDto } from '@ai-quality/contracts';
import {
  ExecutablePlanService,
  TestNotApprovedError,
  TestPlanNotFoundError,
} from '@ai-quality/core';

describe('Plan Compiler IPC Handlers Unit & Security Tests', () => {
  const validProjectId = '11111111-1111-1111-1111-111111111111';
  const validTestCaseId = '22222222-2222-2222-2222-222222222222';
  const validPlanId = '33333333-3333-3333-3333-333333333333';

  const mockTrustedEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    },
  } as unknown as IpcMainInvokeEvent;

  const mockUntrustedEvent = {
    senderFrame: {
      parent: {},
      url: 'https://evil.attacker.com',
    },
  } as unknown as IpcMainInvokeEvent;

  const mockPlanDto: ExecutableTestPlanDto = {
    id: validPlanId,
    projectId: validProjectId,
    testCaseId: validTestCaseId,
    testCaseVersionNumber: 1,
    compilerVersion: '1.0.0',
    planSchemaVersion: 1,
    status: 'VALID',
    planFingerprint: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    sourceRequirementIds: [],
    sourceRequirementKeys: [],
    summary: 'Mock Compiled Plan',
    preconditions: [],
    steps: [],
    assertions: [],
    postconditions: [],
    diagnostics: [],
    hasErrors: false,
    hasWarnings: false,
    isExecutable: true,
    compiledAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockPlanService = {
    compilePlan: async () => mockPlanDto,
    getPlan: async () => mockPlanDto,
    getPlanByTestCase: async () => mockPlanDto,
    listPlans: async () => [mockPlanDto],
    previewPlan: async () => mockPlanDto,
  } as unknown as ExecutablePlanService;

  beforeEach(() => {
    setExecutablePlanServiceForTest(mockPlanService);
  });

  it('rejects untrusted sender frame for handleCompilePlan', async () => {
    const res = await handleCompilePlan(mockUntrustedEvent, {
      projectId: validProjectId,
      testCaseId: validTestCaseId,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('rejects invalid payload with VALIDATION_ERROR', async () => {
    const res = await handleCompilePlan(mockTrustedEvent, {
      projectId: 'invalid-uuid',
      testCaseId: 'invalid-uuid',
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'VALIDATION_ERROR');
    }
  });

  it('successfully compiles plan for trusted sender with valid payload', async () => {
    const res = await handleCompilePlan(mockTrustedEvent, {
      projectId: validProjectId,
      testCaseId: validTestCaseId,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.id, validPlanId);
      assert.equal(res.data.status, 'VALID');
    }
  });

  it('handles and sanitizes TestNotApprovedError cleanly', async () => {
    const failingService = {
      compilePlan: async () => {
        throw new TestNotApprovedError(validTestCaseId, 1, 'DRAFT');
      },
    } as unknown as ExecutablePlanService;
    setExecutablePlanServiceForTest(failingService);

    const res = await handleCompilePlan(mockTrustedEvent, {
      projectId: validProjectId,
      testCaseId: validTestCaseId,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'TEST_NOT_APPROVED');
      assert.match(res.error.message, /DRAFT/);
    }
  });

  it('successfully gets plan by ID and handles TestPlanNotFoundError', async () => {
    const res = await handleGetPlan(mockTrustedEvent, {
      projectId: validProjectId,
      planId: validPlanId,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.id, validPlanId);
    }

    const missingService = {
      getPlan: async () => {
        throw new TestPlanNotFoundError(validPlanId, validProjectId);
      },
    } as unknown as ExecutablePlanService;
    setExecutablePlanServiceForTest(missingService);

    const missingRes = await handleGetPlan(mockTrustedEvent, {
      projectId: validProjectId,
      planId: validPlanId,
    });
    assert.equal(missingRes.ok, false);
    if (!missingRes.ok) {
      assert.equal(missingRes.error.code, 'TEST_PLAN_NOT_FOUND');
    }
  });

  it('successfully retrieves plan by test case', async () => {
    const res = await handleGetPlanByTestCase(mockTrustedEvent, {
      projectId: validProjectId,
      testCaseId: validTestCaseId,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data?.id, validPlanId);
    }
  });

  it('successfully lists plans and previews a plan', async () => {
    const listRes = await handleListPlans(mockTrustedEvent, {
      projectId: validProjectId,
    });
    assert.equal(listRes.ok, true);
    if (listRes.ok) {
      assert.equal(listRes.data.length, 1);
    }

    const previewRes = await handlePreviewPlan(mockTrustedEvent, {
      projectId: validProjectId,
      testCaseId: validTestCaseId,
    });
    assert.equal(previewRes.ok, true);
    if (previewRes.ok) {
      assert.equal(previewRes.data.id, validPlanId);
    }
  });
});
