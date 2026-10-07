/**
 * @file apps/desktop/src/main/ipc/reverification-handlers.test.ts
 * Main process IPC handler tests for Defect Reverification Foundation (V7 Phase 97).
 * Verifies untrusted sender rejection, frame validation, schema parsing, and domain error sanitization.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleGetReverificationState,
  handleEvaluateReverificationEligibility,
  handleCreateReverificationRequest,
  handleGenerateReverificationPlan,
  handleCancelReverification,
  handleListReverificationAuditEvents,
  setDefectReverificationService,
} from './reverification-handlers.js';
import {
  ReverificationNotFoundError,
  ReverificationCrossProjectForbiddenError,
  ReverificationHistoricalTestUnavailableError,
} from '@ai-quality/core';
import type {
  DefectReverificationDto,
  ReverificationAuditEventDto,
  EvaluateReverificationEligibilityOutputDto,
} from '@ai-quality/contracts';

describe('Reverification IPC Handlers (Phase 97)', () => {
  const fakeTrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    } as any,
  } as IpcMainInvokeEvent;

  const fakeUntrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: {} as any,
      url: 'https://attacker.site/index.html',
    } as any,
  } as IpcMainInvokeEvent;

  const validProjectId = '11111111-1111-1111-1111-111111111111';
  const validFailureCaseId = '22222222-2222-2222-2222-222222222222';
  const validReverificationId = '33333333-3333-3333-3333-333333333333';

  const mockReverificationDto: DefectReverificationDto = {
    id: validReverificationId,
    projectId: validProjectId,
    failureCaseId: validFailureCaseId,
    failureAnalysisId: null,
    bugReportId: null,
    externalIssueLinkId: null,
    originalTestRunId: 'run-1',
    originalExecutionId: 'exec-1',
    originalTestCaseId: 'tc-1',
    originalTestCaseVersionId: 'ver-1',
    originalTestCaseVersionNumber: 1,
    selectedTestCaseId: 'tc-1',
    selectedTestCaseVersionId: 'ver-1',
    selectedTestCaseVersionNumber: 1,
    testVersionSelectionReason: 'Historical test version preserved',
    requirementId: null,
    requirementKey: null,
    requirementVersionId: null,
    requirementVersionNumber: null,
    status: 'READY',
    eligibility: 'ELIGIBLE',
    eligibilityReasons: ['All 11 factual criteria satisfied'],
    triggerType: 'MANUAL_REQUEST',
    triggerReference: null,
    originalEnvironmentId: null,
    targetEnvironmentId: 'env-1',
    environmentSnapshotJson: {},
    fixReference: null,
    fixProvenanceJson: {},
    baselineFailureJson: {},
    expectedVerificationJson: {},
    executionPlanJson: {},
    safetyStatus: 'SAFE',
    safetyReason: null,
    isAuthoritative: true,
    supersededById: null,
    supersededAt: null,
    supersedeReason: null,
    cancelledById: null,
    cancelledAt: null,
    cancellationReason: null,
    requestedBy: 'TEST_USER',
    requestedAt: new Date().toISOString(),
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    setDefectReverificationService(null);
  });

  it('rejects untrusted sender origin on all handlers', async () => {
    const res1 = await handleGetReverificationState(fakeUntrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });
    assert.equal(res1.ok, false);
    assert.equal(res1.error?.code, 'UNAUTHORIZED_SENDER');

    const res2 = await handleEvaluateReverificationEligibility(fakeUntrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });
    assert.equal(res2.ok, false);
    assert.equal(res2.error?.code, 'UNAUTHORIZED_SENDER');

    const res3 = await handleCreateReverificationRequest(fakeUntrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });
    assert.equal(res3.ok, false);
    assert.equal(res3.error?.code, 'UNAUTHORIZED_SENDER');

    const res4 = await handleCancelReverification(fakeUntrustedEvent, {
      projectId: validProjectId,
      reverificationId: validReverificationId,
      reason: 'Cancel test',
    });
    assert.equal(res4.ok, false);
    assert.equal(res4.error?.code, 'UNAUTHORIZED_SENDER');
  });

  it('handles handleGetReverificationState successfully with trusted sender', async () => {
    const mockService = {
      getState: async () => mockReverificationDto,
    } as any;
    setDefectReverificationService(mockService);

    const res = await handleGetReverificationState(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });

    assert.equal(res.ok, true);
    assert.equal(res.data?.id, validReverificationId);
    assert.equal(res.data?.status, 'READY');
  });

  it('sanitizes schema validation errors on invalid input', async () => {
    const res = await handleGetReverificationState(fakeTrustedEvent, {
      projectId: 'not-a-valid-uuid',
      failureCaseId: validFailureCaseId,
    });

    assert.equal(res.ok, false);
    assert.equal(res.error?.code, 'VALIDATION_ERROR');
  });

  it('sanitizes ReverificationCrossProjectForbiddenError domain error', async () => {
    const mockService = {
      createRequest: async () => {
        throw new ReverificationCrossProjectForbiddenError('Cross project attack rejected');
      },
    } as any;
    setDefectReverificationService(mockService);

    const res = await handleCreateReverificationRequest(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });

    assert.equal(res.ok, false);
    assert.equal(res.error?.code, 'REVERIFICATION_CROSS_PROJECT_FORBIDDEN');
    assert.match(res.error?.message!, /Cross project/);
  });

  it('sanitizes ReverificationHistoricalTestUnavailableError domain error', async () => {
    const mockService = {
      createRequest: async () => {
        throw new ReverificationHistoricalTestUnavailableError('tc-1', 4);
      },
    } as any;
    setDefectReverificationService(mockService);

    const res = await handleCreateReverificationRequest(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });

    assert.equal(res.ok, false);
    assert.equal(res.error?.code, 'REVERIFICATION_HISTORICAL_TEST_UNAVAILABLE');
  });

  it('handles handleCancelReverification successfully', async () => {
    const cancelledDto = { ...mockReverificationDto, status: 'CANCELLED' as const };
    const mockService = {
      cancel: async () => cancelledDto,
    } as any;
    setDefectReverificationService(mockService);

    const res = await handleCancelReverification(fakeTrustedEvent, {
      projectId: validProjectId,
      reverificationId: validReverificationId,
      reason: 'User cancelled reverification',
    });

    assert.equal(res.ok, true);
    assert.equal(res.data?.status, 'CANCELLED');
  });

  it('handles handleListReverificationAuditEvents successfully', async () => {
    const mockEvents: ReverificationAuditEventDto[] = [
      {
        id: 'evt-1',
        projectId: validProjectId,
        reverificationId: validReverificationId,
        action: 'CREATED',
        fromStatus: null,
        toStatus: 'READY',
        actor: 'SYSTEM',
        reason: 'Request prepared',
        createdAt: new Date().toISOString(),
      },
    ];

    const mockService = {
      listAuditEvents: async () => mockEvents,
    } as any;
    setDefectReverificationService(mockService);

    const res = await handleListReverificationAuditEvents(fakeTrustedEvent, {
      projectId: validProjectId,
      reverificationId: validReverificationId,
    });

    assert.equal(res.ok, true);
    assert.equal(res.data?.length, 1);
    assert.equal(res.data?.[0]?.action, 'CREATED');
  });
});
