/**
 * @file apps/desktop/src/main/ipc/failure-evidence-handlers.test.ts
 * Unit and security tests for Failure Evidence IPC handlers (V6 Phase 75).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleIngestFailureEvidence,
  handleGetFailureEvidencePackage,
  handleVerifyEvidenceIntegrity,
  handleGetEvidenceArtifactContent,
  setSharedFailureEvidenceService,
} from './failure-handlers.js';
import type { FailureEvidenceIngestionService } from '@ai-quality/core';

describe('Failure Evidence IPC Handlers & Security Tests (V6 Phase 75)', () => {
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
  const testReferenceId = crypto.randomUUID();

  let mockService: Partial<FailureEvidenceIngestionService>;

  beforeEach(() => {
    mockService = {
      ingestEvidence: async (input: any) => ({
        packageVersion: '1.0.0',
        failureCaseId: input.failureCaseId,
        projectId: input.projectId,
        executionId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        testCaseId: crypto.randomUUID(),
        testCaseVersionNumber: 1,
        failureSignature: 'sig_abc1234567890abcdef',
        triggeringStatus: 'FAILED',
        screenshots: [],
        consoleMessages: [],
        consoleAvailability: 'NOT_CAPTURED',
        networkRecords: [],
        networkAvailability: 'NOT_CAPTURED',
        traceReference: null,
        traceAvailability: 'NOT_CAPTURED',
        domEvidence: null,
        domAvailability: 'NOT_CAPTURED',
        retryHistory: [],
        healingRecords: [],
        environment: {
          browserEngine: 'chromium',
        },
        completeness: 'COMPLETE',
        integrityStatus: 'VERIFIED',
        integrityDetails: null,
        generatedAt: new Date().toISOString(),
      }),
      getEvidencePackage: async (input: any) => ({
        packageVersion: '1.0.0',
        failureCaseId: input.failureCaseId,
        projectId: input.projectId,
        executionId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        testCaseId: crypto.randomUUID(),
        testCaseVersionNumber: 1,
        failureSignature: 'sig_abc1234567890abcdef',
        triggeringStatus: 'FAILED',
        screenshots: [],
        consoleMessages: [],
        consoleAvailability: 'NOT_CAPTURED',
        networkRecords: [],
        networkAvailability: 'NOT_CAPTURED',
        traceReference: null,
        traceAvailability: 'NOT_CAPTURED',
        domEvidence: null,
        domAvailability: 'NOT_CAPTURED',
        retryHistory: [],
        healingRecords: [],
        environment: {
          browserEngine: 'chromium',
        },
        completeness: 'COMPLETE',
        integrityStatus: 'VERIFIED',
        integrityDetails: null,
        generatedAt: new Date().toISOString(),
      }),
      verifyEvidenceIntegrity: async (input: any) => ({
        failureCaseId: input.failureCaseId,
        projectId: input.projectId,
        overallIntegrity: 'VERIFIED',
        itemsVerified: 3,
        itemsMissing: 0,
        itemsCorrupt: 0,
        itemsUnavailable: 0,
        verifiedAt: new Date().toISOString(),
        itemReports: [],
      }),
      getEvidenceArtifactContent: async (input: any) => ({
        referenceId: input.referenceId,
        artifactType: 'SCREENSHOT',
        mimeType: 'image/png',
        byteSize: 1024,
        sha256: 'sha256mock',
        contentBase64:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        contentText: null,
        logicalName: 'screenshot.png',
      }),
    };

    setSharedFailureEvidenceService(mockService as FailureEvidenceIngestionService);
  });

  it('rejects unauthorized IPC sender frame for ingest evidence', async () => {
    const result = await handleIngestFailureEvidence(untrustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('rejects invalid payload schemas for get evidence package', async () => {
    const result = await handleGetFailureEvidencePackage(trustedEvent, {
      projectId: 'invalid-uuid',
      failureCaseId: 'also-invalid',
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'VALIDATION_ERROR');
    }
  });

  it('successfully executes ingestEvidence for trusted sender', async () => {
    const result = await handleIngestFailureEvidence(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
      revalidateIntegrity: true,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.failureCaseId, testFailureCaseId);
      assert.equal(result.data.failureSignature, 'sig_abc1234567890abcdef');
    }
  });

  it('successfully executes verifyEvidenceIntegrity for trusted sender', async () => {
    const result = await handleVerifyEvidenceIntegrity(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.overallIntegrity, 'VERIFIED');
      assert.equal(result.data.itemsVerified, 3);
    }
  });

  it('successfully executes getEvidenceArtifactContent for trusted sender', async () => {
    const result = await handleGetEvidenceArtifactContent(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
      referenceId: testReferenceId,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.referenceId, testReferenceId);
      assert.equal(result.data.mimeType, 'image/png');
      assert.ok(result.data.contentBase64);
    }
  });
});
