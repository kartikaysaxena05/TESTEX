/**
 * @file apps/desktop/src/main/ipc/failure-decision-integrity-handlers.test.ts
 * Unit and security tests for Classification Decision Integrity IPC handlers (V6 Phase 78).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleEvaluateDecisionIntegrity,
  handleGetDecisionIntegrity,
  handleRecomputeDecisionIntegrity,
  handleListDecisionIntegrityHistory,
  setSharedDecisionIntegrityService,
} from './failure-handlers.js';
import type { ClassificationDecisionIntegrityService } from '@ai-quality/core';

describe('Classification Decision Integrity IPC Handlers (V6 Phase 78)', () => {
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
  const testClassificationId = crypto.randomUUID();

  let mockService: Partial<ClassificationDecisionIntegrityService>;

  beforeEach(() => {
    mockService = {
      evaluateDecisionIntegrity: async (input: any) => ({
        id: crypto.randomUUID(),
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        classificationId: input.classificationId ?? testClassificationId,
        classifierVersion: '1.0.0',
        taxonomyVersion: '1.0.0',
        evidencePackageIdentity: 'pkg-1',
        evidencePackageVersion: '1.0.0',
        evidenceIntegrityState: 'VERIFIED',
        reproductionSnapshotIdentity: 'repro-1',
        reproductionSummaryVersion: '1.0.0',
        decisionFingerprint:
          'sha256:1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
        decisionState: 'VALID',
        evidenceFreshnessState: 'CURRENT',
        consistencyState: 'CONSISTENT',
        arbitrationState: 'SUPPORTED',
        isAuthoritative: true,
        blockingReasons: [],
        warningReasons: [],
        conflictDetailsJson: {},
        materialChangesJson: [],
        evaluatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),

      getDecisionIntegrity: async (input: any) => ({
        id: crypto.randomUUID(),
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        classificationId: testClassificationId,
        classifierVersion: '1.0.0',
        taxonomyVersion: '1.0.0',
        evidencePackageIdentity: 'pkg-1',
        evidencePackageVersion: '1.0.0',
        evidenceIntegrityState: 'VERIFIED',
        reproductionSnapshotIdentity: 'repro-1',
        reproductionSummaryVersion: '1.0.0',
        decisionFingerprint:
          'sha256:1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
        decisionState: 'VALID',
        evidenceFreshnessState: 'CURRENT',
        consistencyState: 'CONSISTENT',
        arbitrationState: 'SUPPORTED',
        isAuthoritative: true,
        blockingReasons: [],
        warningReasons: [],
        conflictDetailsJson: {},
        materialChangesJson: [],
        evaluatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),

      recomputeDecisionIntegrity: async (input: any) => ({
        id: crypto.randomUUID(),
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        classificationId: input.classificationId ?? testClassificationId,
        classifierVersion: '1.0.0',
        taxonomyVersion: '1.0.0',
        evidencePackageIdentity: 'pkg-1',
        evidencePackageVersion: '1.0.0',
        evidenceIntegrityState: 'VERIFIED',
        reproductionSnapshotIdentity: 'repro-1',
        reproductionSummaryVersion: '1.0.0',
        decisionFingerprint:
          'sha256:1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
        decisionState: 'VALID',
        evidenceFreshnessState: 'CURRENT',
        consistencyState: 'CONSISTENT',
        arbitrationState: 'SUPPORTED',
        isAuthoritative: true,
        blockingReasons: [],
        warningReasons: [],
        conflictDetailsJson: {},
        materialChangesJson: [],
        evaluatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),

      listDecisionIntegrityHistory: async () => [],
    };

    setSharedDecisionIntegrityService(mockService as any);
  });

  it('rejects untrusted sender on handleEvaluateDecisionIntegrity', async () => {
    const result = await handleEvaluateDecisionIntegrity(untrustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('validates input schema on handleEvaluateDecisionIntegrity', async () => {
    const result = await handleEvaluateDecisionIntegrity(trustedEvent, {
      projectId: 'not-a-uuid',
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'VALIDATION_ERROR');
    }
  });

  it('evaluates decision integrity successfully with trusted sender and valid input', async () => {
    const result = await handleEvaluateDecisionIntegrity(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data.decisionState, 'VALID');
      assert.strictEqual(result.data.projectId, testProjectId);
    }
  });

  it('rejects untrusted sender on handleGetDecisionIntegrity', async () => {
    const result = await handleGetDecisionIntegrity(untrustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('gets decision integrity successfully', async () => {
    const result = await handleGetDecisionIntegrity(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.ok(result.data);
      assert.strictEqual(result.data?.decisionState, 'VALID');
    }
  });

  it('recomputes decision integrity successfully', async () => {
    const result = await handleRecomputeDecisionIntegrity(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data.decisionState, 'VALID');
    }
  });

  it('lists decision integrity history successfully', async () => {
    const result = await handleListDecisionIntegrityHistory(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.deepStrictEqual(result.data, []);
    }
  });
});
