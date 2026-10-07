/**
 * @file apps/desktop/src/main/ipc/failure-flakiness-handlers.test.ts
 * Unit and security tests for Flakiness Detection & Reproducibility Intelligence IPC handlers (V6 Phase 79).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleAnalyzeFlakiness,
  handleGetFlakinessAnalysis,
  handleReanalyzeFlakiness,
  handleListFlakinessHistory,
  setSharedFlakinessAnalysisService,
} from './failure-handlers.js';
import type { FlakinessAnalysisService } from '@ai-quality/core';

describe('Flakiness Intelligence IPC Handlers (V6 Phase 79)', () => {
  function createMockEvent(isMainFrame = true): IpcMainInvokeEvent {
    return {
      senderFrame: {
        parent: isMainFrame ? null : ({} as any),
        url: isMainFrame ? 'app://renderer/index.html' : 'https://malicious-site.com',
      },
    } as unknown as IpcMainInvokeEvent;
  }

  const trustedEvent = createMockEvent(true);
  const untrustedEvent = createMockEvent(false);

  const testProjectId = crypto.randomUUID();
  const testFailureCaseId = crypto.randomUUID();
  const testTestCaseId = crypto.randomUUID();

  let mockService: Partial<FlakinessAnalysisService>;

  beforeEach(() => {
    mockService = {
      analyzeFlakiness: async (input: any) => ({
        id: crypto.randomUUID(),
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        testCaseId: testTestCaseId,
        testCaseVersionNumber: 1,
        analysisVersion: '1.0.0',
        flakinessPolicyVersion: '1.0.0',
        flakinessState: 'CONFIRMED_FLAKY',
        stabilityState: 'INTERMITTENT',
        attemptCount: 3,
        validAttemptCount: 3,
        passCount: 1,
        failCount: 2,
        blockedCount: 0,
        cancelledCount: 0,
        executionErrorCount: 0,
        equivalentFailureCount: 2,
        differentFailureCount: 0,
        sameStepFailureCount: 2,
        differentStepFailureCount: 0,
        environmentComparableCount: 3,
        environmentDriftCount: 0,
        reproducibilityRatio: 0.6667,
        passRate: 0.3333,
        failureRate: 0.6667,
        analysisFingerprint:
          'sha256:1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
        isAuthoritative: true,
        isStale: false,
        warnings: [],
        evidenceGaps: [],
        attemptTimeline: [],
        evaluatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),

      getFlakinessAnalysis: async (input: any) => ({
        id: crypto.randomUUID(),
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        testCaseId: testTestCaseId,
        testCaseVersionNumber: 1,
        analysisVersion: '1.0.0',
        flakinessPolicyVersion: '1.0.0',
        flakinessState: 'CONFIRMED_FLAKY',
        stabilityState: 'INTERMITTENT',
        attemptCount: 3,
        validAttemptCount: 3,
        passCount: 1,
        failCount: 2,
        blockedCount: 0,
        cancelledCount: 0,
        executionErrorCount: 0,
        equivalentFailureCount: 2,
        differentFailureCount: 0,
        sameStepFailureCount: 2,
        differentStepFailureCount: 0,
        environmentComparableCount: 3,
        environmentDriftCount: 0,
        reproducibilityRatio: 0.6667,
        passRate: 0.3333,
        failureRate: 0.6667,
        analysisFingerprint:
          'sha256:1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
        isAuthoritative: true,
        isStale: false,
        warnings: [],
        evidenceGaps: [],
        attemptTimeline: [],
        evaluatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),

      reanalyzeFlakiness: async (input: any) => ({
        id: crypto.randomUUID(),
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        testCaseId: testTestCaseId,
        testCaseVersionNumber: 1,
        analysisVersion: '1.0.0',
        flakinessPolicyVersion: '1.0.0',
        flakinessState: 'STABLE_FAILURE',
        stabilityState: 'STABLE',
        attemptCount: 4,
        validAttemptCount: 4,
        passCount: 0,
        failCount: 4,
        blockedCount: 0,
        cancelledCount: 0,
        executionErrorCount: 0,
        equivalentFailureCount: 4,
        differentFailureCount: 0,
        sameStepFailureCount: 4,
        differentStepFailureCount: 0,
        environmentComparableCount: 4,
        environmentDriftCount: 0,
        reproducibilityRatio: 1.0,
        passRate: 0.0,
        failureRate: 1.0,
        analysisFingerprint:
          'sha256:222233334444555566667777888899990000aaaabbbbccccddddeeeeffff1111',
        isAuthoritative: true,
        isStale: false,
        warnings: [],
        evidenceGaps: [],
        attemptTimeline: [],
        evaluatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),

      listFlakinessHistory: async () => [],
    };

    setSharedFlakinessAnalysisService(mockService as any);
  });

  it('rejects untrusted sender on handleAnalyzeFlakiness', async () => {
    const result = await handleAnalyzeFlakiness(untrustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('rejects untrusted sender on handleGetFlakinessAnalysis', async () => {
    const result = await handleGetFlakinessAnalysis(untrustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('rejects untrusted sender on handleReanalyzeFlakiness', async () => {
    const result = await handleReanalyzeFlakiness(untrustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
      reanalysisReason: 'Manual operator rerun',
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('rejects untrusted sender on handleListFlakinessHistory', async () => {
    const result = await handleListFlakinessHistory(untrustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('invokes analyzeFlakiness cleanly for trusted sender and returns DTO', async () => {
    const result = await handleAnalyzeFlakiness(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data.flakinessState, 'CONFIRMED_FLAKY');
      assert.strictEqual(result.data.stabilityState, 'INTERMITTENT');
      assert.strictEqual(result.data.isAuthoritative, true);
    }
  });

  it('invokes getFlakinessAnalysis cleanly for trusted sender', async () => {
    const result = await handleGetFlakinessAnalysis(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data?.flakinessState, 'CONFIRMED_FLAKY');
    }
  });

  it('invokes reanalyzeFlakiness cleanly for trusted sender with reason', async () => {
    const result = await handleReanalyzeFlakiness(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
      reanalysisReason: 'Operator requested reanalysis',
    });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data.flakinessState, 'STABLE_FAILURE');
      assert.strictEqual(result.data.stabilityState, 'STABLE');
    }
  });

  it('rejects invalid payload on handleAnalyzeFlakiness schema validation', async () => {
    const result = await handleAnalyzeFlakiness(trustedEvent, {
      projectId: 'not-a-uuid',
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'VALIDATION_ERROR');
    }
  });

  it('rejects invalid payload without reason on handleReanalyzeFlakiness', async () => {
    const result = await handleReanalyzeFlakiness(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
      reanalysisReason: '', // Empty reason prohibited
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'VALIDATION_ERROR');
    }
  });
});
