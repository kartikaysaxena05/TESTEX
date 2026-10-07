/**
 * @file apps/desktop/src/main/ipc/failure-reproduction-handlers.test.ts
 * Unit and security tests for Failure Reproduction IPC handlers (V6 Phase 76).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleExecuteReproduction,
  handleGetReproductionAttempts,
  handleGetReproducibilitySummary,
  handleCancelReproduction,
  setSharedFailureReproductionService,
} from './failure-handlers.js';
import type { FailureReproductionService } from '@ai-quality/core';

describe('Failure Reproduction IPC Handlers & Security Tests (V6 Phase 76)', () => {
  function createMockEvent(isMainFrame = true): IpcMainInvokeEvent {
    return {
      senderFrame: {
        parent: isMainFrame ? null : ({} as any),
        url: isMainFrame ? 'app://renderer/index.html' : 'https://malicious-website.com',
      },
    } as unknown as IpcMainInvokeEvent;
  }

  const trustedEvent = createMockEvent(true);
  const untrustedEvent = createMockEvent(false);

  const testProjectId = crypto.randomUUID();
  const testFailureCaseId = crypto.randomUUID();

  let mockService: Partial<FailureReproductionService>;

  beforeEach(() => {
    mockService = {
      executeReproduction: async (input: any) => ({
        failureCaseId: input.failureCaseId,
        projectId: input.projectId,
        overallOutcome: 'REPRODUCED' as const,
        attemptsRequested: input.maxAttempts ?? 1,
        attemptsStarted: 1,
        attemptsCompleted: 1,
        equivalentFailures: 1,
        differentFailures: 0,
        passes: 0,
        blockedAttempts: 0,
        cancelledAttempts: 0,
        environmentDriftDetected: false,
        reproducibilityRatio: 1.0,
      }),

      getReproductionAttempts: async (input: any) => [
        {
          id: crypto.randomUUID(),
          projectId: input.projectId,
          failureCaseId: input.failureCaseId,
          originalExecutionId: crypto.randomUUID(),
          reproductionExecutionId: crypto.randomUUID(),
          attemptNumber: 1,
          testCaseId: crypto.randomUUID(),
          testCaseVersionNumber: 1,
          browserEngine: 'chromium',
          reproductionVersion: '1.0.0',
          status: 'REPRODUCED' as const,
          environmentEquivalence: 'EXACT' as const,
          stepComparison: [],
          assertionComparison: null,
          environmentComparison: {
            status: 'EXACT' as const,
            driftItems: [],
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],

      getReproducibilitySummary: async (input: any) => ({
        failureCaseId: input.failureCaseId,
        projectId: input.projectId,
        overallOutcome: 'REPRODUCED' as const,
        attemptsRequested: 1,
        attemptsStarted: 1,
        attemptsCompleted: 1,
        equivalentFailures: 1,
        differentFailures: 0,
        passes: 0,
        blockedAttempts: 0,
        cancelledAttempts: 0,
        environmentDriftDetected: false,
        reproducibilityRatio: 1.0,
      }),

      cancelReproduction: async () => ({
        cancelled: true,
      }),
    };

    setSharedFailureReproductionService(mockService as FailureReproductionService);
  });

  describe('handleExecuteReproduction', () => {
    it('rejects untrusted sender', async () => {
      const res = await handleExecuteReproduction(untrustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects invalid payload with schema validation error', async () => {
      const res = await handleExecuteReproduction(trustedEvent, {
        projectId: 'not-a-uuid',
        failureCaseId: testFailureCaseId,
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'VALIDATION_ERROR');
      }
    });

    it('executes reproduction and returns success envelope', async () => {
      const res = await handleExecuteReproduction(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
        maxAttempts: 2,
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.data.overallOutcome, 'REPRODUCED');
        assert.equal(res.data.attemptsRequested, 2);
      }
    });
  });

  describe('handleGetReproductionAttempts', () => {
    it('rejects untrusted sender', async () => {
      const res = await handleGetReproductionAttempts(untrustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('returns attempts list for valid input', async () => {
      const res = await handleGetReproductionAttempts(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.data.length, 1);
        assert.equal(res.data[0]?.status, 'REPRODUCED');
      }
    });
  });

  describe('handleGetReproducibilitySummary', () => {
    it('returns reproducibility summary', async () => {
      const res = await handleGetReproducibilitySummary(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.data.overallOutcome, 'REPRODUCED');
        assert.equal(res.data.reproducibilityRatio, 1.0);
      }
    });
  });

  describe('handleCancelReproduction', () => {
    it('cancels in-flight reproduction', async () => {
      const res = await handleCancelReproduction(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.data.cancelled, true);
      }
    });
  });
});
