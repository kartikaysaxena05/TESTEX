/**
 * @file apps/desktop/src/main/ipc/failure-localization-handlers.test.ts
 * Unit and security tests for Failure Technical Cause Localization IPC handlers (V6 Phase 81).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleLocalizeTechnicalCause,
  handleGetTechnicalLocalization,
  handleRelocalizeTechnicalCause,
  handleListLocalizationHistory,
  setSharedFailureEvidenceCorrelationService,
} from './failure-handlers.js';
import type { FailureEvidenceCorrelationService } from '@ai-quality/core';
import type { FailureTechnicalLocalizationDto } from '@ai-quality/contracts';

describe('Failure Technical Cause Localization IPC Handlers (V6 Phase 81)', () => {
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

  const mockDto: FailureTechnicalLocalizationDto = {
    id: crypto.randomUUID(),
    projectId: testProjectId,
    failureCaseId: testFailureCaseId,
    testCaseId: testTestCaseId,
    failureAnalysisRunId: null,
    domainSeparationId: null,
    primaryLayer: 'BACKEND_API',
    secondaryLayers: ['FRONTEND_NETWORK_CLIENT'],
    primaryTargetType: 'API_ENDPOINT',
    primaryTargetIdentifier: 'POST /api/v1/checkout/process',
    secondaryTargets: [],
    repositoryFileId: null,
    repositorySymbolId: null,
    matchedFilePath: 'src/controllers/checkout.controller.ts',
    matchedSymbolName: 'processCheckout',
    matchedLineNumber: 25,
    httpEndpoint: '/api/v1/checkout/process',
    httpMethod: 'POST',
    httpStatusCode: 500,
    domSelector: null,
    uiComponentName: null,
    routePath: null,
    timelineSummary: [],
    correlationSignals: [
      {
        signalId: 'sig_001',
        signalType: 'HTTP_5XX_SERVER_ERROR',
        technicalLayer: 'BACKEND_API',
        targetType: 'API_ENDPOINT',
        targetIdentity: 'POST /api/v1/checkout/process',
        sourceEvidenceKey: 'ev-1',
        strength: 'DIRECT',
        explanation: 'Server returned HTTP 500',
      },
    ],
    conflictingSignals: [],
    localizationRationale: 'Server returned HTTP 500 on process checkout endpoint.',
    evidenceReferences: ['ev-1'],
    localizationFingerprint:
      'sha256:1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
    isAuthoritative: true,
    isStale: false,
    stalenessReason: null,
    relocalizationCount: 0,
    lastRelocalizedAt: null,
    relocalizationReason: null,
    localizedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockService: FailureEvidenceCorrelationService = {
    localizeTechnicalCause: async () => mockDto,
    getTechnicalLocalization: async () => mockDto,
    relocalizeTechnicalCause: async () => ({ ...mockDto, relocalizationCount: 1 }),
    listLocalizationHistory: async () => [mockDto],
  } as unknown as FailureEvidenceCorrelationService;

  beforeEach(() => {
    setSharedFailureEvidenceCorrelationService(mockService);
  });

  it('rejects untrusted sender on handleLocalizeTechnicalCause', async () => {
    const result = await handleLocalizeTechnicalCause(untrustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('rejects invalid payload on handleLocalizeTechnicalCause', async () => {
    const result = await handleLocalizeTechnicalCause(trustedEvent, {
      projectId: 'not-a-uuid',
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'VALIDATION_ERROR');
    }
  });

  it('executes handleLocalizeTechnicalCause successfully with trusted sender', async () => {
    const result = await handleLocalizeTechnicalCause(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data.primaryLayer, 'BACKEND_API');
      assert.strictEqual(result.data.primaryTargetIdentifier, 'POST /api/v1/checkout/process');
    }
  });

  it('executes handleGetTechnicalLocalization successfully', async () => {
    const result = await handleGetTechnicalLocalization(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data?.primaryLayer, 'BACKEND_API');
    }
  });

  it('executes handleRelocalizeTechnicalCause successfully', async () => {
    const result = await handleRelocalizeTechnicalCause(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
      relocalizationReason: 'New network trace captured',
    });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data.relocalizationCount, 1);
    }
  });

  it('executes handleListLocalizationHistory successfully', async () => {
    const result = await handleListLocalizationHistory(trustedEvent, {
      projectId: testProjectId,
      failureCaseId: testFailureCaseId,
    });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data.length, 1);
    }
  });
});
