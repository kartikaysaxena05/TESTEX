/**
 * @file apps/desktop/src/main/ipc/patch-validation-handlers.test.ts
 * IPC handler tests for Patch Validation & Before/After Testing (V7 Phase 103).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleExecutePatchValidation,
  handleGetPatchValidation,
  handleListPatchValidations,
  handleCancelPatchValidation,
  setPatchValidationService,
} from './patch-validation-handlers.js';
import {
  PatchValidationNotFoundError,
  PatchValidationCrossProjectError,
  PatchValidationInProgressError,
} from '@ai-quality/core';
import type { DefectPatchValidationDto } from '@ai-quality/contracts';

describe('Patch Validation IPC Handlers (Phase 103)', () => {
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
  const validProposalId = '33333333-3333-3333-3333-333333333333';
  const validValidationId = '44444444-4444-4444-4444-444444444444';
  const validSandboxId = '55555555-5555-5555-5555-555555555555';

  const mockValidationDto: DefectPatchValidationDto = {
    id: validValidationId,
    projectId: validProjectId,
    failureCaseId: validFailureCaseId,
    patchProposalId: validProposalId,
    sandboxId: validSandboxId,
    repositoryId: null,
    testCaseId: '66666666-6666-6666-6666-666666666666',
    testCaseVersionId: null,
    testCaseVersionNumber: 1,
    requirementIds: ['REQ-01'],
    status: 'COMPLETED',
    validationOutcome: 'VALID',
    validationReason: 'Target failure resolved',
    baseRevision: 'abc1234',
    patchHash: 'hash-fingerprint-123',
    originalRepoModifiedCount: 0,
    originalRepoClean: true,
    targetFailureFixed: true,
    beforeStatus: 'FAIL',
    afterStatus: 'PASS',
    beforeFailureSignature: 'sig-before',
    afterFailureSignature: null,
    beforeExpected: 'Reject',
    beforeActual: 'Accepted',
    afterExpected: 'Reject',
    afterActual: 'Rejected',
    sameTestCaseVerified: true,
    sameTestVersionVerified: true,
    regressionDetected: false,
    targetedRegressionTotal: 1,
    targetedRegressionPassed: 1,
    targetedRegressionFailed: 0,
    newRegressionsCount: 0,
    newRegressions: [],
    preExistingFailuresCount: 0,
    preExistingFailures: [],
    unexpectedChangesDetected: false,
    unexpectedFiles: [],
    typecheckStatus: 'PASS',
    lintStatus: 'PASS',
    formatStatus: 'NOT_RUN',
    buildStatus: 'PASS',
    qualityGates: [],
    beforeExecutionIds: [],
    afterExecutionIds: [],
    beforeEvidence: null,
    afterEvidence: null,
    validatorVersion: '1.0.0',
    executedBy: 'SYSTEM',
    executionDurationMs: 500,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    setPatchValidationService(null);
  });

  it('rejects untrusted sender on handleExecutePatchValidation', async () => {
    const res = await handleExecutePatchValidation(fakeUntrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
      patchProposalId: validProposalId,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('rejects invalid schema input on handleExecutePatchValidation', async () => {
    const res = await handleExecutePatchValidation(fakeTrustedEvent, {
      projectId: 'not-a-valid-uuid',
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'VALIDATION_ERROR');
    }
  });

  it('delegates to service on handleExecutePatchValidation and returns success', async () => {
    const mockService = {
      executeValidation: async () => mockValidationDto,
    } as any;
    setPatchValidationService(mockService);

    const res = await handleExecutePatchValidation(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
      patchProposalId: validProposalId,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.id, validValidationId);
      assert.equal(res.data.validationOutcome, 'VALID');
    }
  });

  it('sanitizes domain errors properly', async () => {
    const mockService = {
      executeValidation: async () => {
        throw new PatchValidationCrossProjectError('Forbidden cross-project access');
      },
    } as any;
    setPatchValidationService(mockService);

    const res = await handleExecutePatchValidation(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
      patchProposalId: validProposalId,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'PATCH_VALIDATION_CROSS_PROJECT');
      assert.ok(res.error.message.includes('Forbidden cross-project access'));
    }
  });

  it('handles get and list operations cleanly', async () => {
    const mockService = {
      getValidation: async () => mockValidationDto,
      listValidations: async () => [mockValidationDto],
    } as any;
    setPatchValidationService(mockService);

    const getRes = await handleGetPatchValidation(fakeTrustedEvent, {
      projectId: validProjectId,
      validationId: validValidationId,
    });
    assert.equal(getRes.ok, true);
    if (getRes.ok) {
      assert.equal(getRes.data?.id, validValidationId);
    }

    const listRes = await handleListPatchValidations(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });
    assert.equal(listRes.ok, true);
    if (listRes.ok) {
      assert.equal(listRes.data.length, 1);
    }
  });

  it('handles cancel validation properly', async () => {
    const cancelledDto = {
      ...mockValidationDto,
      status: 'CANCELLED' as const,
      validationOutcome: 'CANCELLED' as const,
    };
    const mockService = {
      cancelValidation: async () => cancelledDto,
    } as any;
    setPatchValidationService(mockService);

    const cancelRes = await handleCancelPatchValidation(fakeTrustedEvent, {
      projectId: validProjectId,
      validationId: validValidationId,
      reason: 'User cancelled',
    });

    assert.equal(cancelRes.ok, true);
    if (cancelRes.ok) {
      assert.equal(cancelRes.data.status, 'CANCELLED');
      assert.equal(cancelRes.data.validationOutcome, 'CANCELLED');
    }
  });
});
