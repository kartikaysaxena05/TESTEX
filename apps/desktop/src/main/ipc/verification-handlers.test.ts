/**
 * @file apps/desktop/src/main/ipc/verification-handlers.test.ts
 * Main process IPC handler tests for Defect Verification (V7 Phase 98).
 * Verifies untrusted sender rejection, frame validation, schema parsing, and domain error sanitization.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleExecuteVerification,
  handleGetVerificationAttempts,
  handleGetVerificationComparison,
  handleCancelVerification,
  setDefectVerificationService,
} from './verification-handlers.js';
import {
  VerificationNotFoundError,
  VerificationInProgressError,
  VerificationAttemptLimitExceededError,
  VerificationCrossProjectForbiddenError,
  VerificationBlockedError,
} from '@ai-quality/core';
import type { DefectVerificationAttemptDto, VerificationSummaryDto } from '@ai-quality/contracts';

describe('Verification IPC Handlers (Phase 98)', () => {
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
  const validAttemptId = '44444444-4444-4444-4444-444444444444';

  const mockAttemptDto: DefectVerificationAttemptDto = {
    id: validAttemptId,
    projectId: validProjectId,
    reverificationId: validReverificationId,
    failureCaseId: validFailureCaseId,
    originalExecutionId: 'exec-1',
    verificationExecutionId: 'exec-2',
    verificationMode: 'HISTORICAL',
    testCaseId: 'tc-1',
    originalTestCaseVersionNumber: 1,
    verificationTestCaseVersionNumber: 1,
    attemptNumber: 1,
    browserEngine: 'chromium',
    status: 'VERIFIED_FIXED',
    isSignatureMatch: false,
    environmentEquivalence: 'EXACT',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockSummaryDto: VerificationSummaryDto = {
    failureCaseId: validFailureCaseId,
    reverificationId: validReverificationId,
    projectId: validProjectId,
    totalAttempts: 1,
    latestAttemptNumber: 1,
    latestOutcome: 'VERIFIED_FIXED',
    isFixed: true,
    isStillFailing: false,
    isBlocked: false,
    isInconclusive: false,
    environmentEquivalence: 'EXACT',
    attempts: [mockAttemptDto],
    factualMetrics: {
      attemptsRequested: 1,
      attemptsStarted: 1,
      attemptsCompleted: 1,
      passes: 1,
      sameFailures: 0,
      differentFailures: 0,
      blocked: 0,
      cancelled: 0,
      executionErrors: 0,
      environmentDrift: false,
    },
  };

  beforeEach(() => {
    setDefectVerificationService(null);
  });

  it('rejects untrusted sender frame for all verification handlers', async () => {
    const res1 = await handleExecuteVerification(fakeUntrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });
    assert.equal(res1.ok, false);
    assert.equal(res1.error?.code, 'UNAUTHORIZED_SENDER');

    const res2 = await handleGetVerificationAttempts(fakeUntrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });
    assert.equal(res2.ok, false);
    assert.equal(res2.error?.code, 'UNAUTHORIZED_SENDER');

    const res3 = await handleGetVerificationComparison(fakeUntrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });
    assert.equal(res3.ok, false);
    assert.equal(res3.error?.code, 'UNAUTHORIZED_SENDER');

    const res4 = await handleCancelVerification(fakeUntrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
      reason: 'cancel',
    });
    assert.equal(res4.ok, false);
    assert.equal(res4.error?.code, 'UNAUTHORIZED_SENDER');
  });

  it('validates Zod input schemas and returns VALIDATION_ERROR on malformed payload', async () => {
    const res = await handleExecuteVerification(fakeTrustedEvent, {
      projectId: 'not-a-uuid',
      failureCaseId: validFailureCaseId,
    });
    assert.equal(res.ok, false);
    assert.equal(res.error?.code, 'VALIDATION_ERROR');
  });

  it('handles execute verification successfully', async () => {
    const mockService = {
      executeVerification: async () => mockSummaryDto,
    } as any;
    setDefectVerificationService(mockService);

    const res = await handleExecuteVerification(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
      mode: 'HISTORICAL',
      maxAttempts: 1,
    });

    assert.equal(res.ok, true);
    assert.equal(res.data?.latestOutcome, 'VERIFIED_FIXED');
    assert.equal(res.data?.isFixed, true);
  });

  it('sanitizes domain errors appropriately', async () => {
    const mockService = {
      executeVerification: async () => {
        throw new VerificationInProgressError(validFailureCaseId);
      },
    } as any;
    setDefectVerificationService(mockService);

    const res = await handleExecuteVerification(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });

    assert.equal(res.ok, false);
    assert.equal(res.error?.code, 'VERIFICATION_IN_PROGRESS');
    assert.match(res.error?.message || '', /already in progress/);
  });

  it('handles get attempts successfully', async () => {
    const mockService = {
      getAttempts: async () => [mockAttemptDto],
    } as any;
    setDefectVerificationService(mockService);

    const res = await handleGetVerificationAttempts(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });

    assert.equal(res.ok, true);
    assert.equal(res.data?.length, 1);
    assert.equal(res.data?.[0]?.status, 'VERIFIED_FIXED');
  });

  it('handles get comparison successfully', async () => {
    const mockService = {
      getComparison: async () => mockAttemptDto,
    } as any;
    setDefectVerificationService(mockService);

    const res = await handleGetVerificationComparison(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
      attemptId: validAttemptId,
    });

    assert.equal(res.ok, true);
    assert.equal(res.data?.id, validAttemptId);
  });

  it('handles cancel verification successfully', async () => {
    const mockService = {
      cancelVerification: async () => ({ cancelled: true }),
    } as any;
    setDefectVerificationService(mockService);

    const res = await handleCancelVerification(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
      reason: 'Cancelled by operator test',
    });

    assert.equal(res.ok, true);
    assert.equal(res.data?.cancelled, true);
  });
});
