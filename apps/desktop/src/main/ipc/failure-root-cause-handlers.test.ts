/**
 * @file apps/desktop/src/main/ipc/failure-root-cause-handlers.test.ts
 * Unit and security tests for Root-Cause Analysis IPC handlers (V6 Phase 83).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleAnalyzeRootCause,
  handleGetRootCauseAnalysis,
  handleReanalyzeRootCause,
  handleListRootCauseHistory,
  setSharedFailureRootCauseService,
} from './failure-handlers.js';
import type { FailureRootCauseService } from '@ai-quality/core';
import type { FailureRootCauseAnalysisDto } from '@ai-quality/contracts';

describe('Root-Cause Analysis IPC Handlers (V6 Phase 83)', () => {
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

  const mockRcaDto: FailureRootCauseAnalysisDto = {
    id: crypto.randomUUID(),
    projectId: testProjectId,
    failureCaseId: testFailureCaseId,
    testCaseId: testTestCaseId,
    testCaseVersionNumber: 1,
    failureAnalysisRunId: null,
    deterministicClassificationId: null,
    technicalLocalizationId: null,
    domainSeparationId: null,
    aiAssessmentId: null,

    rootCauseStatus: 'SUPPORTED_HYPOTHESIS',
    probableLayer: 'API',
    probableComponent: 'AuthGateway',
    relatedEndpoint: '/api/v1/auth',

    probableCause: 'Null pointer dereference during session validation.',
    humanExplanation: 'The backend crashed because session credentials were missing.',
    affectedExecutionPath: ['POST /api/v1/auth', '500 Internal Error'],
    supportingEvidence: [
      {
        id: 'ev-rca-ipc-1',
        fact: 'HTTP 500 status returned from API',
        significance: 'CRITICAL',
        evidenceType: 'NETWORK_LOG',
      },
    ],
    contradictingEvidence: [],
    alternativeHypotheses: [],
    repositoryReferences: [
      {
        fileId: crypto.randomUUID(),
        filePath: 'src/api/auth.ts',
        symbolName: 'loginHandler',
        relevance: 'Primary auth controller',
      },
    ],
    repositoryContextAvailable: true,
    limitations: [],
    uncertainties: [],

    modelProvider: 'fake',
    modelName: 'mock-rca-v1',
    promptVersion: '1.0.0',
    schemaVersion: '1.0.0',
    rootCauseFingerprint: 'b'.repeat(64),

    isAuthoritative: true,
    isStale: false,
    stalenessReason: null,
    reanalysisCount: 0,
    lastReanalyzedAt: null,
    reanalysisReason: null,
    supersededById: null,

    analyzedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let mockService: FailureRootCauseService;

  beforeEach(() => {
    mockService = {
      analyzeRootCause: async () => mockRcaDto,
      getRootCauseAnalysis: async () => mockRcaDto,
      reanalyzeRootCause: async () => ({
        ...mockRcaDto,
        id: crypto.randomUUID(),
        reanalysisCount: 1,
        reanalysisReason: 'Re-analyzed upon request',
      }),
      listRootCauseHistory: async () => [mockRcaDto],
    } as unknown as FailureRootCauseService;

    setSharedFailureRootCauseService(mockService);
  });

  it('1. handleAnalyzeRootCause blocks untrusted IPC sender', async () => {
    const res = await handleAnalyzeRootCause(untrustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('2. handleAnalyzeRootCause rejects invalid payload with VALIDATION_ERROR', async () => {
    const res = await handleAnalyzeRootCause(trustedEvent, {
      projectId: 'invalid-uuid',
      failureCaseId: testFailureCaseId,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'VALIDATION_ERROR');
    }
  });

  it('3. handleAnalyzeRootCause succeeds with trusted sender and valid input', async () => {
    const res = await handleAnalyzeRootCause(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.id, mockRcaDto.id);
      assert.equal(res.data.probableLayer, 'API');
      assert.equal(res.data.rootCauseStatus, 'SUPPORTED_HYPOTHESIS');
    }
  });

  it('4. handleGetRootCauseAnalysis succeeds and returns data', async () => {
    const res = await handleGetRootCauseAnalysis(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data?.id, mockRcaDto.id);
      assert.equal(res.data?.isAuthoritative, true);
    }
  });

  it('5. handleReanalyzeRootCause requires reanalysisReason and returns revision', async () => {
    const invalidRes = await handleReanalyzeRootCause(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
      reanalysisReason: '', // Empty reason should fail validation
    });

    assert.equal(invalidRes.ok, false);
    if (!invalidRes.ok) {
      assert.equal(invalidRes.error.code, 'VALIDATION_ERROR');
    }

    const validRes = await handleReanalyzeRootCause(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
      reanalysisReason: 'Retest after bug fix',
    });

    assert.equal(validRes.ok, true);
    if (validRes.ok) {
      assert.equal(validRes.data.reanalysisCount, 1);
      assert.equal(validRes.data.reanalysisReason, 'Re-analyzed upon request');
    }
  });

  it('6. handleListRootCauseHistory returns historical analyses', async () => {
    const res = await handleListRootCauseHistory(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.length, 1);
      assert.equal(res.data[0]?.id, mockRcaDto.id);
    }
  });
});
