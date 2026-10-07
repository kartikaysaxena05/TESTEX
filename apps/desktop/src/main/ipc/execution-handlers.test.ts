/**
 * @file apps/desktop/src/main/ipc/execution-handlers.test.ts
 * Security and handler unit tests for Execution IPC handlers.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleGetExecutionCapabilities,
  handleRunRuntimeSmoke,
  handleValidateTestEligibility,
  setExecutionServiceForTest,
} from './execution-handlers.js';
import type {
  ExecutionCapabilitiesDto,
  RuntimeSmokeResultDto,
  TestEligibilityDto,
} from '@ai-quality/contracts';
import { TestExecutionService } from '@ai-quality/core';

describe('Execution IPC Handlers Unit Tests', () => {
  const validProjectId = '11111111-1111-1111-1111-111111111111';
  const validTestCaseId = '22222222-2222-2222-2222-222222222222';

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

  const mockCapabilities: ExecutionCapabilitiesDto = {
    playwrightInstalled: true,
    playwrightVersion: '1.62.1',
    supportedBrowsers: ['chromium', 'firefox', 'webkit'],
    defaultBrowser: 'chromium',
    chromiumAvailable: true,
    chromiumVersion: '151.0.7922.34',
    runtimeStatus: 'READY',
    activeExecutionsCount: 0,
  };

  const mockSmokeResult: RuntimeSmokeResultDto = {
    executionId: 'exec-mock-1',
    browserEngine: 'chromium',
    browserVersion: '151.0.7922.34',
    headless: true,
    launchSuccess: true,
    contextSuccess: true,
    pageSuccess: true,
    navigationSuccess: true,
    cleanupSuccess: true,
    timings: {
      launchMs: 100,
      contextMs: 20,
      pageMs: 30,
      navigationMs: 40,
      cleanupMs: 10,
      totalMs: 200,
    },
    pageTitle: 'V5 Playwright Runtime Smoke',
    verifiedText: 'READY',
    timestamp: new Date().toISOString(),
  };

  const mockEligibility: TestEligibilityDto = {
    testCaseId: validTestCaseId,
    testCaseKey: 'TC-001',
    title: 'Login Test',
    status: 'ELIGIBLE',
    isEligible: true,
    reviewStatus: 'APPROVED',
    currentVersionNumber: 1,
    approvedVersionNumber: 1,
    isRequirementStale: false,
    sourceRequirementVersionNumber: 1,
    currentRequirementVersionNumber: 1,
    reasons: ['Test case is approved and up to date.'],
  };

  beforeEach(() => {
    const mockService = {
      getCapabilities: async () => mockCapabilities,
      runRuntimeSmoke: async () => mockSmokeResult,
      validateTestEligibility: async () => mockEligibility,
    } as unknown as TestExecutionService;

    setExecutionServiceForTest(mockService);
  });

  it('rejects untrusted sender frame on getCapabilities', async () => {
    const res = await handleGetExecutionCapabilities(mockUntrustedEvent);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('handles getCapabilities for trusted sender frame', async () => {
    const res = await handleGetExecutionCapabilities(mockTrustedEvent);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.playwrightInstalled, true);
      assert.equal(res.data.chromiumAvailable, true);
    }
  });

  it('handles runRuntimeSmoke with valid default input', async () => {
    const res = await handleRunRuntimeSmoke(mockTrustedEvent, {});
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.launchSuccess, true);
      assert.equal(res.data.pageTitle, 'V5 Playwright Runtime Smoke');
    }
  });

  it('rejects runRuntimeSmoke with invalid parameters', async () => {
    const res = await handleRunRuntimeSmoke(mockTrustedEvent, {
      timeoutMs: -50,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'EXECUTION_REQUEST_INVALID');
    }
  });

  it('handles validateTestEligibility with valid input', async () => {
    const res = await handleValidateTestEligibility(mockTrustedEvent, {
      projectId: validProjectId,
      testCaseId: validTestCaseId,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.isEligible, true);
      assert.equal(res.data.status, 'ELIGIBLE');
    }
  });

  it('rejects validateTestEligibility with malformed non-UUID input', async () => {
    const res = await handleValidateTestEligibility(mockTrustedEvent, {
      projectId: 'not-a-uuid',
      testCaseId: 'bad-id',
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'EXECUTION_REQUEST_INVALID');
    }
  });
});
