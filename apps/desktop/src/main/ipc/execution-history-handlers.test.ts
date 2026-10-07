/**
 * @file apps/desktop/src/main/ipc/execution-history-handlers.test.ts
 * Security and functionality tests for Execution History IPC handlers.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleGetExecution,
  handleListExecutions,
  handleGetExecutionSteps,
  handleGetExecutionTimeline,
  handleReconcileOrphaned,
  setSharedPersistenceService,
} from './execution-history-handlers.js';
import { ExecutionPersistenceService } from '@ai-quality/core';

describe('Execution History IPC Handlers Unit & Security Tests', () => {
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
    setSharedPersistenceService(null);
  });

  it('rejects calls from untrusted sender frame with UNAUTHORIZED_SENDER error', async () => {
    const result = await handleGetExecution(untrustedEvent, { projectId, executionId });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('rejects malformed payloads with VALIDATION_ERROR', async () => {
    const result = await handleGetExecution(trustedEvent, { projectId: 'not-a-uuid', executionId });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'VALIDATION_ERROR');
    }
  });

  it('delegates getExecution to ExecutionPersistenceService when input is valid', async () => {
    const mockService = {
      getExecution: async () => ({
        id: executionId,
        projectId,
        testRunId,
        testCaseId: crypto.randomUUID(),
        testCaseVersionNumber: 1,
        executableTestPlanId: crypto.randomUUID(),
        attempt: 1,
        status: 'PASSED' as const,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 250,
        browserEngine: 'chromium',
        environmentSnapshotJson: {},
        metadataJson: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    } as unknown as ExecutionPersistenceService;

    setSharedPersistenceService(mockService);

    const result = await handleGetExecution(trustedEvent, { projectId, executionId });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.id, executionId);
      assert.equal(result.data.status, 'PASSED');
    }
  });

  it('delegates listExecutions and getExecutionSteps with pagination', async () => {
    const mockService = {
      listExecutions: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      }),
      getExecutionSteps: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
      }),
    } as unknown as ExecutionPersistenceService;

    setSharedPersistenceService(mockService);

    const listRes = await handleListExecutions(trustedEvent, { projectId, page: 1, pageSize: 20 });
    assert.equal(listRes.ok, true);

    const stepsRes = await handleGetExecutionSteps(trustedEvent, {
      projectId,
      executionId,
      page: 1,
      pageSize: 50,
    });
    assert.equal(stepsRes.ok, true);
  });

  it('delegates getExecutionTimeline and reconcileOrphaned successfully', async () => {
    const mockService = {
      getExecutionAuditTimeline: async () => ({
        executionId,
        testRunId,
        projectId,
        testCaseId: crypto.randomUUID(),
        testCaseTitle: 'Login Test',
        testCaseVersionNumber: 1,
        status: 'PASSED' as const,
        events: [],
      }),
      reconcileOrphanedExecutions: async () => ({
        reconciledCount: 3,
      }),
    } as unknown as ExecutionPersistenceService;

    setSharedPersistenceService(mockService);

    const timelineRes = await handleGetExecutionTimeline(trustedEvent, { projectId, executionId });
    assert.equal(timelineRes.ok, true);

    const reconcileRes = await handleReconcileOrphaned(trustedEvent, { projectId });
    assert.equal(reconcileRes.ok, true);
    if (reconcileRes.ok) {
      assert.equal(reconcileRes.data.reconciledCount, 3);
    }
  });
});
