/**
 * @file apps/desktop/src/main/ipc/healing-handlers.test.ts
 * Unit and security tests for Locator Healing & Parallel Pool IPC handlers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleGetHealingAttempts,
  handleListHealingSuggestions,
  handleReviewHealingSuggestion,
  handleGetParallelPoolState,
  setSharedHealingServices,
} from './healing-handlers.js';

describe('Healing & Parallel Pool IPC Handlers', () => {
  const validProjectId = '00000000-0000-0000-0000-000000000001';
  const validRunId = '00000000-0000-0000-0000-000000000002';
  const validSuggestionId = '00000000-0000-0000-0000-000000000003';

  const mockTrustedEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    },
  } as unknown as IpcMainInvokeEvent;

  const mockUntrustedEvent = {
    senderFrame: {
      parent: {},
      url: 'https://malicious.evil.com',
    },
  } as unknown as IpcMainInvokeEvent;

  const mockPersistenceService: any = {
    getHealingAttempts: async () => [
      {
        id: '00000000-0000-0000-0000-000000000010',
        projectId: validProjectId,
        testRunId: validRunId,
        executionId: '00000000-0000-0000-0000-000000000020',
        stepIndex: 1,
        attempt: 1,
        actionType: 'CLICK',
        originalTarget: { strategy: 'ROLE', role: 'button', name: 'Submit' },
        originalSelector: "page.getByRole('button', { name: 'Submit' })",
        failureReason: 'Element not found',
        healingResult: 'HEALED',
        candidateCount: 1,
        confidenceThreshold: 75,
        scoringModelVersion: '1.0.0',
        policyVersion: '1.0.0',
        candidatesEvaluated: [],
        actionAttempted: true,
        actionSucceeded: true,
        createdAt: new Date().toISOString(),
      },
    ],
    listHealingSuggestions: async () => [
      {
        id: validSuggestionId,
        projectId: validProjectId,
        testCaseId: '00000000-0000-0000-0000-000000000030',
        testCaseVersionNumber: 1,
        stepIndex: 1,
        originalTarget: { strategy: 'ROLE', role: 'button', name: 'Submit' },
        suggestedTarget: { strategy: 'ROLE', role: 'button', name: 'Submit Order' },
        suggestedSelector: "page.getByRole('button', { name: 'Submit Order' })",
        reason: 'Score 90',
        score: 90,
        reviewStatus: 'PENDING',
        discoveredInRunId: validRunId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    reviewHealingSuggestion: async (input: any) => ({
      id: input.suggestionId,
      projectId: input.projectId,
      testCaseId: '00000000-0000-0000-0000-000000000030',
      testCaseVersionNumber: 1,
      stepIndex: 1,
      originalTarget: { strategy: 'ROLE', role: 'button', name: 'Submit' },
      suggestedTarget: { strategy: 'ROLE', role: 'button', name: 'Submit Order' },
      suggestedSelector: "page.getByRole('button', { name: 'Submit Order' })",
      reason: 'Score 90',
      score: 90,
      reviewStatus: input.reviewStatus,
      discoveredInRunId: validRunId,
      reviewedAt: new Date().toISOString(),
      reviewedBy: 'test-reviewer',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  };

  const mockPool: any = {
    getState: async () => ({
      activeWorkers: 2,
      maxParallelRuns: 4,
      activeRuns: [],
      queuedCount: 5,
      preparingCount: 0,
      runningCount: 2,
    }),
  };

  setSharedHealingServices(mockPersistenceService, mockPool);

  it('rejects untrusted IPC senders with UNAUTHORIZED_SENDER', async () => {
    const res = await handleGetHealingAttempts(mockUntrustedEvent, {
      projectId: validProjectId,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('rejects invalid input schemas with VALIDATION_ERROR', async () => {
    const res = await handleGetHealingAttempts(mockTrustedEvent, {
      projectId: 'invalid-not-uuid',
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'VALIDATION_ERROR');
    }
  });

  it('retrieves healing attempts successfully for valid request', async () => {
    const res = await handleGetHealingAttempts(mockTrustedEvent, {
      projectId: validProjectId,
      testRunId: validRunId,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.length, 1);
      assert.equal(res.data[0]?.healingResult, 'HEALED');
    }
  });

  it('lists healing suggestions successfully', async () => {
    const res = await handleListHealingSuggestions(mockTrustedEvent, {
      projectId: validProjectId,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.length, 1);
      assert.equal(res.data[0]?.reviewStatus, 'PENDING');
    }
  });

  it('reviews healing suggestion (ACCEPTED)', async () => {
    const res = await handleReviewHealingSuggestion(mockTrustedEvent, {
      projectId: validProjectId,
      suggestionId: validSuggestionId,
      reviewStatus: 'ACCEPTED',
      reviewerId: 'qa-engineer',
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.reviewStatus, 'ACCEPTED');
    }
  });

  it('retrieves parallel pool state successfully', async () => {
    const res = await handleGetParallelPoolState(mockTrustedEvent, {});
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.maxParallelRuns, 4);
      assert.equal(res.data.queuedCount, 5);
    }
  });
});
