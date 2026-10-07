/**
 * @file apps/desktop/src/main/ipc/evidence-handlers.test.ts
 * IPC handler unit and security tests for Failure Evidence Capture Foundation (V5 Phase 69).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleCreateEvidenceBundle,
  handleAddEvidenceArtifact,
  handleFinalizeEvidenceBundle,
  handleGetEvidenceBundle,
  handleListEvidenceBundles,
  handleListEvidenceArtifacts,
  handleGetEvidenceArtifactMetadata,
  handleGetEvidenceArtifactContent,
  handleVerifyEvidenceIntegrity,
  setSharedEvidenceService,
} from './evidence-handlers.js';
import type { ExecutionEvidenceService } from '@ai-quality/core';

describe('Evidence IPC Handlers & Security Tests (V5 Phase 69)', () => {
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
  const testRunId = crypto.randomUUID();
  const testExecutionId = crypto.randomUUID();
  const testBundleId = crypto.randomUUID();
  const testArtifactId = crypto.randomUUID();

  let mockService: Partial<ExecutionEvidenceService>;

  beforeEach(() => {
    mockService = {
      createBundle: async (input: any) => ({
        id: testBundleId,
        projectId: input.projectId,
        testRunId: input.testRunId,
        executionId: input.executionId,
        stepExecutionId: input.stepExecutionId,
        stepIndex: input.stepIndex,
        attempt: 1,
        status: 'PENDING',
        retentionStatus: 'ACTIVE',
        metadataJson: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        artifacts: [],
      }),
      addArtifact: async (input: any) => ({
        id: testArtifactId,
        projectId: input.projectId,
        bundleId: input.bundleId,
        testRunId: input.testRunId,
        executionId: input.executionId,
        artifactType: input.artifactType,
        storageIdentity: 'art_dummy.png',
        originalLogicalName: input.originalLogicalName,
        mimeType: input.mimeType,
        byteSize: 1024,
        sha256: 'a'.repeat(64),
        redactionStatus: 'NONE',
        capturedAt: new Date().toISOString(),
        persistedAt: new Date().toISOString(),
        metadataJson: {},
        createdAt: new Date().toISOString(),
      }),
      finalizeBundle: async (input: any) => ({
        id: input.bundleId,
        projectId: input.projectId,
        testRunId,
        executionId: testExecutionId,
        attempt: 1,
        status: input.status,
        retentionStatus: 'ACTIVE',
        metadataJson: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        artifacts: [],
      }),
      getBundle: async (input: any) => ({
        id: input.bundleId,
        projectId: input.projectId,
        testRunId,
        executionId: testExecutionId,
        attempt: 1,
        status: 'COMPLETE',
        retentionStatus: 'ACTIVE',
        metadataJson: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        artifacts: [],
      }),
      listBundles: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      }),
      listArtifacts: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
        totalPages: 0,
      }),
      getArtifactMetadata: async (input: any) => ({
        id: input.artifactId,
        projectId: input.projectId,
        bundleId: testBundleId,
        testRunId,
        executionId: testExecutionId,
        artifactType: 'SCREENSHOT',
        storageIdentity: 'art_dummy.png',
        originalLogicalName: 'screen.png',
        mimeType: 'image/png',
        byteSize: 500,
        sha256: 'b'.repeat(64),
        redactionStatus: 'NONE',
        capturedAt: new Date().toISOString(),
        persistedAt: new Date().toISOString(),
        metadataJson: {},
        createdAt: new Date().toISOString(),
      }),
      verifyArtifactIntegrity: async () => ({
        isValid: true,
        expectedSha256: 'c'.repeat(64),
        actualSha256: 'c'.repeat(64),
        byteSize: 100,
      }),
    };

    setSharedEvidenceService(mockService as ExecutionEvidenceService);
  });

  describe('1. Sender Validation & Security Boundary', () => {
    it('rejects invocations from unauthorized sender frames with UNAUTHORIZED_SENDER', async () => {
      const res = await handleCreateEvidenceBundle(untrustedEvent, {
        projectId: testProjectId,
        testRunId,
        executionId: testExecutionId,
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });
  });

  describe('2. Input Validation', () => {
    it('rejects malformed payloads with VALIDATION_ERROR', async () => {
      const res = await handleCreateEvidenceBundle(trustedEvent, {
        projectId: 'not-a-uuid',
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'VALIDATION_ERROR');
      }
    });
  });

  describe('3. Delegation & Bridge Operations', () => {
    it('delegates createEvidenceBundle to domain service', async () => {
      const res = await handleCreateEvidenceBundle(trustedEvent, {
        projectId: testProjectId,
        testRunId,
        executionId: testExecutionId,
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.data.id, testBundleId);
        assert.equal(res.data.status, 'PENDING');
      }
    });

    it('delegates addEvidenceArtifact to domain service', async () => {
      const res = await handleAddEvidenceArtifact(trustedEvent, {
        projectId: testProjectId,
        bundleId: testBundleId,
        testRunId,
        executionId: testExecutionId,
        artifactType: 'SCREENSHOT',
        originalLogicalName: 'screenshot.png',
        mimeType: 'image/png',
        content: 'dummy-content',
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.data.id, testArtifactId);
      }
    });

    it('delegates finalizeEvidenceBundle to domain service', async () => {
      const res = await handleFinalizeEvidenceBundle(trustedEvent, {
        projectId: testProjectId,
        bundleId: testBundleId,
        status: 'COMPLETE',
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.data.status, 'COMPLETE');
      }
    });

    it('delegates getEvidenceBundle to domain service', async () => {
      const res = await handleGetEvidenceBundle(trustedEvent, {
        projectId: testProjectId,
        bundleId: testBundleId,
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.data.id, testBundleId);
      }
    });

    it('delegates listEvidenceBundles and listEvidenceArtifacts', async () => {
      const bRes = await handleListEvidenceBundles(trustedEvent, {
        projectId: testProjectId,
      });
      assert.equal(bRes.ok, true);

      const aRes = await handleListEvidenceArtifacts(trustedEvent, {
        projectId: testProjectId,
      });
      assert.equal(aRes.ok, true);
    });

    it('delegates getEvidenceArtifactMetadata to domain service', async () => {
      const res = await handleGetEvidenceArtifactMetadata(trustedEvent, {
        projectId: testProjectId,
        artifactId: testArtifactId,
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.data.id, testArtifactId);
      }
    });

    it('rejects unauthorized sender on getEvidenceArtifactContent', async () => {
      const res = await handleGetEvidenceArtifactContent(untrustedEvent, {
        projectId: testProjectId,
        artifactId: testArtifactId,
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('delegates verifyEvidenceIntegrity to domain service', async () => {
      const res = await handleVerifyEvidenceIntegrity(trustedEvent, {
        projectId: testProjectId,
        artifactId: testArtifactId,
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.data.isValid, true);
      }
    });
  });
});
