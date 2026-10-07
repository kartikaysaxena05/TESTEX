/**
 * @file apps/desktop/src/main/ipc/retry-handlers.test.ts
 * Security, validation, and functionality unit tests for Phase 71 Retry IPC handlers.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleGetAttempts,
  handleEvaluateReliability,
  setSharedRetryServices,
} from './retry-handlers.js';

describe('Retry & Flakiness IPC Handlers Unit & Security Tests', () => {
  const projectId = crypto.randomUUID();
  const testRunId = crypto.randomUUID();
  const executionId = crypto.randomUUID();

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

  beforeEach(() => {
    setSharedRetryServices(null, null);
  });

  describe('handleGetAttempts', () => {
    it('rejects calls from untrusted sender frame with UNAUTHORIZED_SENDER error', async () => {
      const result = await handleGetAttempts(untrustedEvent, { projectId, testRunId });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects malformed payloads with VALIDATION_ERROR', async () => {
      const result = await handleGetAttempts(trustedEvent, {
        projectId: 'invalid-uuid',
        testRunId,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, 'VALIDATION_ERROR');
      }
    });

    it('delegates to ExecutionPersistenceService when input is valid', async () => {
      const mockService = {
        listExecutionAttempts: async () => [
          {
            id: executionId,
            projectId,
            testRunId,
            testCaseId: crypto.randomUUID(),
            testCaseVersionNumber: 1,
            executableTestPlanId: crypto.randomUUID(),
            attempt: 1,
            status: 'FAILED' as const,
            passedAfterRetry: false,
            reliabilityStatus: 'NOT_EVALUATED',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: 250,
            errorMessage: 'Timeout exceeded',
            errorCode: 'TIMEOUT',
            retryReason: null,
            browserEngine: 'chromium',
            environmentSnapshotJson: {},
            metadataJson: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      setSharedRetryServices(mockService as any, null);

      const result = await handleGetAttempts(trustedEvent, { projectId, testRunId });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.data.length, 1);
        const first = result.data[0];
        assert.ok(first);
        assert.equal(first.attempt, 1);
        assert.equal(first.status, 'FAILED');
      }
    });
  });

  describe('handleEvaluateReliability', () => {
    it('rejects calls from untrusted sender frame with UNAUTHORIZED_SENDER error', async () => {
      const result = await handleEvaluateReliability(untrustedEvent, { projectId, testRunId });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects malformed payloads with VALIDATION_ERROR', async () => {
      const result = await handleEvaluateReliability(trustedEvent, {
        projectId: 'invalid-uuid',
        testRunId,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, 'VALIDATION_ERROR');
      }
    });
  });
});
