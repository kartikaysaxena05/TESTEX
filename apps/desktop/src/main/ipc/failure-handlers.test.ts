/**
 * @file apps/desktop/src/main/ipc/failure-handlers.test.ts
 * Unit and security tests for Failure Intelligence IPC handlers (V6 Phase 74).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleCreateFailureCase,
  handleEnsureFailureCase,
  handleGetFailureCase,
  handleListFailureCases,
  handleStartFailureAnalysis,
  handleCompleteFailureAnalysis,
  handleFailFailureAnalysis,
  handleCancelFailureAnalysis,
  handleMarkFailureCaseStale,
  handleListFailureAnalysisRuns,
  handleListFailureEvidenceReferences,
  setSharedFailureCaseService,
} from './failure-handlers.js';
import type { FailureCaseService } from '@ai-quality/core';

describe('Failure IPC Handlers & Security Tests (V6 Phase 74)', () => {
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
  const testExecutionId = crypto.randomUUID();
  const testCaseId = crypto.randomUUID();
  const testRunId = crypto.randomUUID();
  const testAnalysisRunId = crypto.randomUUID();

  let mockService: Partial<FailureCaseService>;

  beforeEach(() => {
    mockService = {
      createFailureCase: async (input: any) => ({
        id: testCaseId,
        projectId: input.projectId,
        testCaseId: crypto.randomUUID(),
        testCaseVersionNumber: 1,
        testRunId,
        executionId: input.executionId,
        stepExecutionId: null,
        stepIndex: null,
        triggeringExecutionStatus: 'FAILED',
        status: 'READY',
        isEligible: true,
        isStale: false,
        analysisAttemptCount: 0,
        title: 'Checkout Failure Case',
        metadataJson: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      ensureFailureCaseFromExecution: async (input: any) => ({
        id: testCaseId,
        projectId: input.projectId,
        testCaseId: crypto.randomUUID(),
        testCaseVersionNumber: 1,
        testRunId,
        executionId: input.executionId,
        stepExecutionId: null,
        stepIndex: null,
        triggeringExecutionStatus: 'FAILED',
        status: 'READY',
        isEligible: true,
        isStale: false,
        analysisAttemptCount: 0,
        title: 'Checkout Failure Case',
        metadataJson: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      getFailureCase: async (input: any) => ({
        id: input.failureCaseId,
        projectId: input.projectId,
        testCaseId: crypto.randomUUID(),
        testCaseVersionNumber: 1,
        testRunId,
        executionId: testExecutionId,
        stepExecutionId: null,
        stepIndex: null,
        triggeringExecutionStatus: 'FAILED',
        status: 'READY',
        isEligible: true,
        isStale: false,
        analysisAttemptCount: 0,
        title: 'Checkout Failure Case',
        metadataJson: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      listFailureCases: async (input: any) => ({
        items: [],
        total: 0,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 25,
        totalPages: 1,
      }),
      startAnalysis: async (input: any) => ({
        id: testAnalysisRunId,
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        attemptNumber: 1,
        analyzerVersion: input.analyzerVersion ?? '1.0.0',
        status: 'RUNNING',
        startedAt: new Date().toISOString(),
        triggerSource: input.triggerSource ?? 'MANUAL',
        inputSnapshotJson: {},
        metadataJson: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      completeAnalysis: async (input: any) => ({
        id: input.analysisRunId,
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        attemptNumber: 1,
        analyzerVersion: '1.0.0',
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
        durationMs: 1500,
        triggerSource: 'MANUAL',
        inputSnapshotJson: {},
        metadataJson: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      failAnalysis: async (input: any) => ({
        id: input.analysisRunId,
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        attemptNumber: 1,
        analyzerVersion: '1.0.0',
        status: 'FAILED',
        completedAt: new Date().toISOString(),
        durationMs: 1500,
        triggerSource: 'MANUAL',
        failureReason: input.failureReason,
        inputSnapshotJson: {},
        metadataJson: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      cancelAnalysis: async (input: any) => ({
        id: input.failureCaseId,
        projectId: input.projectId,
        testCaseId: crypto.randomUUID(),
        testCaseVersionNumber: 1,
        testRunId,
        executionId: testExecutionId,
        stepExecutionId: null,
        stepIndex: null,
        triggeringExecutionStatus: 'FAILED',
        status: 'CANCELLED',
        isEligible: true,
        isStale: false,
        analysisAttemptCount: 1,
        title: 'Checkout Failure Case',
        metadataJson: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      markStale: async (input: any) => ({
        id: input.failureCaseId,
        projectId: input.projectId,
        testCaseId: crypto.randomUUID(),
        testCaseVersionNumber: 1,
        testRunId,
        executionId: testExecutionId,
        stepExecutionId: null,
        stepIndex: null,
        triggeringExecutionStatus: 'FAILED',
        status: 'STALE',
        isEligible: true,
        isStale: true,
        stalenessReason: input.reason,
        staleAt: new Date().toISOString(),
        analysisAttemptCount: 1,
        title: 'Checkout Failure Case',
        metadataJson: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      listAnalysisRuns: async () => [],
      listEvidenceReferences: async () => [],
    };

    setSharedFailureCaseService(mockService as FailureCaseService);
  });

  describe('Security Sender Validation', () => {
    it('rejects unauthorized IPC sender frame', async () => {
      const res = await handleCreateFailureCase(untrustedEvent, {
        projectId: testProjectId,
        executionId: testExecutionId,
      });

      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects invalid payload without proper UUIDs', async () => {
      const res = await handleCreateFailureCase(trustedEvent, {
        projectId: 'invalid-uuid',
        executionId: testExecutionId,
      });

      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'VALIDATION_ERROR');
      }
    });
  });

  describe('Successful IPC Invocations', () => {
    it('handles createFailureCase successfully', async () => {
      const res = await handleCreateFailureCase(trustedEvent, {
        projectId: testProjectId,
        executionId: testExecutionId,
      });

      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.id, testCaseId);
        assert.strictEqual(res.data.projectId, testProjectId);
      }
    });

    it('handles ensureFailureCase successfully', async () => {
      const res = await handleEnsureFailureCase(trustedEvent, {
        projectId: testProjectId,
        executionId: testExecutionId,
      });

      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.id, testCaseId);
      }
    });

    it('handles startFailureAnalysis successfully', async () => {
      const res = await handleStartFailureAnalysis(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testCaseId,
      });

      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.id, testAnalysisRunId);
        assert.strictEqual(res.data.status, 'RUNNING');
      }
    });

    it('handles completeFailureAnalysis successfully', async () => {
      const res = await handleCompleteFailureAnalysis(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testCaseId,
        analysisRunId: testAnalysisRunId,
      });

      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.status, 'COMPLETED');
      }
    });

    it('handles cancelFailureAnalysis successfully', async () => {
      const res = await handleCancelFailureAnalysis(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testCaseId,
      });

      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.status, 'CANCELLED');
      }
    });

    it('handles getFailureCase successfully', async () => {
      const res = await handleGetFailureCase(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testCaseId,
      });

      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.id, testCaseId);
      }
    });

    it('handles listFailureCases successfully', async () => {
      const res = await handleListFailureCases(trustedEvent, {
        projectId: testProjectId,
      });

      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.total, 0);
      }
    });

    it('handles failFailureAnalysis successfully', async () => {
      const res = await handleFailFailureAnalysis(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testCaseId,
        analysisRunId: testAnalysisRunId,
        failureReason: 'Analysis timed out',
      });

      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.status, 'FAILED');
      }
    });

    it('handles listFailureAnalysisRuns successfully', async () => {
      const res = await handleListFailureAnalysisRuns(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testCaseId,
      });

      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(Array.isArray(res.data), true);
      }
    });

    it('handles markFailureCaseStale successfully', async () => {
      const res = await handleMarkFailureCaseStale(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testCaseId,
        reason: 'Stale requirement updated',
      });

      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.status, 'STALE');
        assert.strictEqual(res.data.isStale, true);
      }
    });

    it('handles listFailureEvidenceReferences successfully', async () => {
      const res = await handleListFailureEvidenceReferences(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testCaseId,
      });

      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(Array.isArray(res.data), true);
      }
    });
  });
});
