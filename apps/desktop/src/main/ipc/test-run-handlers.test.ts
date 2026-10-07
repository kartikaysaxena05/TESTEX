/**
 * @file apps/desktop/src/main/ipc/test-run-handlers.test.ts
 * Unit and security tests for Test Run IPC handlers.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleEnqueueTestRun,
  handleGetTestRun,
  handleListTestRuns,
  handleCancelTestRun,
  handleGetTestRunQueueState,
  setTestRunServiceForTest,
} from './test-run-handlers.js';
import type { TestRunDto, TestRunQueueStateDto } from '@ai-quality/contracts';
import {
  TestRunService,
  TestRunNotFoundError,
  TestRunAlreadyTerminalError,
} from '@ai-quality/core';

describe('Test Run IPC Handlers Unit & Security Tests', () => {
  const validProjectId = '11111111-1111-1111-1111-111111111111';
  const validTestCaseId = '22222222-2222-2222-2222-222222222222';
  const validPlanId = '33333333-3333-3333-3333-333333333333';
  const validRunId = '44444444-4444-4444-4444-444444444444';

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

  const mockRunDto: TestRunDto = {
    id: validRunId,
    projectId: validProjectId,
    testCaseId: validTestCaseId,
    testCaseVersionNumber: 1,
    executableTestPlanId: validPlanId,
    status: 'QUEUED',
    queuedAt: new Date().toISOString(),
    planFingerprint: 'mock-plan-fp',
    testCaseTitle: 'Mock Test Run',
    browserEngine: 'chromium',
    headless: true,
    timeoutMs: 30000,
    totalAttempts: 1,
    passedAfterRetry: false,
    reliabilityStatus: 'NOT_EVALUATED',
    healingUsed: false,
    healingCount: 0,
    diagnosticsJson: [],
    metadataJson: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockQueueStateDto: TestRunQueueStateDto = {
    queuedCount: 1,
    preparingCount: 0,
    runningCount: 0,
    maxConcurrentRuns: 1,
    maxQueueDepth: 100,
    isQueueFull: false,
    activeWorkerIds: [],
  };

  let mockService: Partial<TestRunService>;

  beforeEach(() => {
    mockService = {
      enqueueRun: async () => mockRunDto,
      getRun: async () => mockRunDto,
      listRuns: async () => [mockRunDto],
      cancelRun: async () => ({ ...mockRunDto, status: 'CANCELLED' }),
      getQueueState: async () => mockQueueStateDto,
    };
    setTestRunServiceForTest(mockService as TestRunService);
  });

  it('rejects invocations from untrusted senders with UNAUTHORIZED_SENDER', async () => {
    const enqueueRes = await handleEnqueueTestRun(mockUntrustedEvent, {
      projectId: validProjectId,
      testCaseId: validTestCaseId,
    });
    assert.equal(enqueueRes.ok, false);
    assert.equal(enqueueRes.error?.code, 'UNAUTHORIZED_SENDER');

    const getRes = await handleGetTestRun(mockUntrustedEvent, {
      projectId: validProjectId,
      runId: validRunId,
    });
    assert.equal(getRes.ok, false);
    assert.equal(getRes.error?.code, 'UNAUTHORIZED_SENDER');

    const listRes = await handleListTestRuns(mockUntrustedEvent, {
      projectId: validProjectId,
    });
    assert.equal(listRes.ok, false);
    assert.equal(listRes.error?.code, 'UNAUTHORIZED_SENDER');

    const cancelRes = await handleCancelTestRun(mockUntrustedEvent, {
      projectId: validProjectId,
      runId: validRunId,
    });
    assert.equal(cancelRes.ok, false);
    assert.equal(cancelRes.error?.code, 'UNAUTHORIZED_SENDER');

    const stateRes = await handleGetTestRunQueueState(mockUntrustedEvent, {
      projectId: validProjectId,
    });
    assert.equal(stateRes.ok, false);
    assert.equal(stateRes.error?.code, 'UNAUTHORIZED_SENDER');
  });

  it('validates input schemas and rejects invalid payloads with VALIDATION_ERROR', async () => {
    const res = await handleEnqueueTestRun(mockTrustedEvent, {
      projectId: 'not-a-uuid',
      testCaseId: 'also-invalid',
    } as any);

    assert.equal(res.ok, false);
    assert.equal(res.error?.code, 'VALIDATION_ERROR');
  });

  it('handles enqueue test run successfully', async () => {
    const res = await handleEnqueueTestRun(mockTrustedEvent, {
      projectId: validProjectId,
      testCaseId: validTestCaseId,
    });

    assert.equal(res.ok, true);
    assert.equal(res.data?.id, validRunId);
    assert.equal(res.data?.status, 'QUEUED');
  });

  it('handles get test run successfully and sanitizes errors', async () => {
    const res = await handleGetTestRun(mockTrustedEvent, {
      projectId: validProjectId,
      runId: validRunId,
    });

    assert.equal(res.ok, true);
    assert.equal(res.data?.id, validRunId);

    // Test error sanitization
    mockService.getRun = async () => {
      throw new TestRunNotFoundError(validRunId, validProjectId);
    };

    const errRes = await handleGetTestRun(mockTrustedEvent, {
      projectId: validProjectId,
      runId: validRunId,
    });

    assert.equal(errRes.ok, false);
    assert.equal(errRes.error?.code, 'TEST_RUN_NOT_FOUND');
  });

  it('handles cancel test run and maps terminal error correctly', async () => {
    const res = await handleCancelTestRun(mockTrustedEvent, {
      projectId: validProjectId,
      runId: validRunId,
      reason: 'User cancelled',
    });

    assert.equal(res.ok, true);
    assert.equal(res.data?.status, 'CANCELLED');

    mockService.cancelRun = async () => {
      throw new TestRunAlreadyTerminalError(validRunId, 'PASSED', 'cancel');
    };

    const errRes = await handleCancelTestRun(mockTrustedEvent, {
      projectId: validProjectId,
      runId: validRunId,
    });

    assert.equal(errRes.ok, false);
    assert.equal(errRes.error?.code, 'TEST_RUN_ALREADY_TERMINAL');
  });

  it('handles getQueueState successfully', async () => {
    const res = await handleGetTestRunQueueState(mockTrustedEvent, {
      projectId: validProjectId,
    });

    assert.equal(res.ok, true);
    assert.equal(res.data?.queuedCount, 1);
    assert.equal(res.data?.maxQueueDepth, 100);
  });
});
