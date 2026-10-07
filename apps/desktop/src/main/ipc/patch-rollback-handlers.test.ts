/**
 * @file apps/desktop/src/main/ipc/patch-rollback-handlers.test.ts
 * IPC handler tests for Patch Rollback & Recovery (V7 Phase 105).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handlePlanPatchRollback,
  handleExecutePatchRollback,
  handleGetPatchRollback,
  handleListPatchRollbacks,
  handleResumePatchRollbackRecovery,
  setPatchRollbackService,
} from './patch-rollback-handlers.js';
import {
  PatchRollbackNotFoundError,
  PatchRollbackConflictError,
} from '@ai-quality/core';
import type {
  DefectPatchRollbackDto,
  PatchRollbackPlanResultDto,
} from '@ai-quality/contracts';

describe('Patch Rollback IPC Handlers (Phase 105)', () => {
  const fakeTrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    } as any,
  } as IpcMainInvokeEvent;

  const fakeUntrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: {} as any,
      url: 'https://malicious.origin/attack.html',
    } as any,
  } as IpcMainInvokeEvent;

  const validProjectId = '11111111-1111-1111-1111-111111111111';
  const validApprovalId = '22222222-2222-2222-2222-222222222222';
  const validRollbackId = '33333333-3333-3333-3333-333333333333';
  const validFailureCaseId = '44444444-4444-4444-4444-444444444444';
  const validProposalId = '55555555-5555-5555-5555-555555555555';

  const mockPlanDto: PatchRollbackPlanResultDto = {
    approvalId: validApprovalId,
    canRollback: true,
    conflicts: [],
    targetFiles: ['src/calc.ts'],
    reverseDiff: '@@ -1,1 +1,1 @@\n',
    structuredReverseEdits: [],
    preRollbackHashes: { 'src/calc.ts': 's1hash' },
    expectedPostRollbackHashes: { 'src/calc.ts': 's0hash' },
    preservedFiles: ['src/index.ts'],
  };

  const mockRollbackDto: DefectPatchRollbackDto = {
    id: validRollbackId,
    projectId: validProjectId,
    failureCaseId: validFailureCaseId,
    patchProposalId: validProposalId,
    patchApprovalId: validApprovalId,
    repositoryId: null,
    rollbackRequestedBy: 'HUMAN_OPERATOR',
    rollbackReason: 'Reverting patch',
    status: 'COMPLETED',
    conflictType: null,
    conflictDetails: null,
    targetPrePatchHashes: { 'src/calc.ts': 's0hash' },
    preRollbackHashes: { 'src/calc.ts': 's1hash' },
    postRollbackHashes: { 'src/calc.ts': 's0hash' },
    targetFiles: ['src/calc.ts'],
    restoredFiles: ['src/calc.ts'],
    preservedUnrelatedFiles: ['src/index.ts'],
    recoveryPointId: 'rp-123',
    recoveryPointSnapshot: null,
    reverseDiff: '@@ -1,1 +1,1 @@\n',
    structuredReverseEdits: null,
    dryRunOnly: false,
    dryRunSuccess: null,
    dryRunConflicts: null,
    integrityVerified: true,
    integrityDetails: { filesChecked: 1 },
    postRollbackTestRunId: null,
    postRollbackTestPassed: false,
    originalFailureReoccurred: true,
    auditTrail: [],
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    errorMessage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    setPatchRollbackService(null);
  });

  it('rejects untrusted sender frame for all handlers', async () => {
    const planRes = await handlePlanPatchRollback(fakeUntrustedEvent, {
      projectId: validProjectId,
      approvalId: validApprovalId,
    });
    assert.equal(planRes.ok, false);
    if (!planRes.ok) assert.equal(planRes.error.code, 'UNAUTHORIZED_SENDER');

    const execRes = await handleExecutePatchRollback(fakeUntrustedEvent, {
      projectId: validProjectId,
      approvalId: validApprovalId,
    });
    assert.equal(execRes.ok, false);
    if (!execRes.ok) assert.equal(execRes.error.code, 'UNAUTHORIZED_SENDER');

    const getRes = await handleGetPatchRollback(fakeUntrustedEvent, {
      projectId: validProjectId,
      rollbackId: validRollbackId,
    });
    assert.equal(getRes.ok, false);
    if (!getRes.ok) assert.equal(getRes.error.code, 'UNAUTHORIZED_SENDER');

    const listRes = await handleListPatchRollbacks(fakeUntrustedEvent, {
      projectId: validProjectId,
    });
    assert.equal(listRes.ok, false);
    if (!listRes.ok) assert.equal(listRes.error.code, 'UNAUTHORIZED_SENDER');

    const resumeRes = await handleResumePatchRollbackRecovery(fakeUntrustedEvent, {
      projectId: validProjectId,
      rollbackId: validRollbackId,
    });
    assert.equal(resumeRes.ok, false);
    if (!resumeRes.ok) assert.equal(resumeRes.error.code, 'UNAUTHORIZED_SENDER');
  });

  it('handles plan rollback successfully with trusted sender', async () => {
    const mockService = {
      planRollback: async () => mockPlanDto,
    } as any;
    setPatchRollbackService(mockService);

    const res = await handlePlanPatchRollback(fakeTrustedEvent, {
      projectId: validProjectId,
      approvalId: validApprovalId,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.canRollback, true);
      assert.equal(res.data.targetFiles.length, 1);
    }
  });

  it('handles execute rollback successfully with trusted sender', async () => {
    const mockService = {
      executeRollback: async () => mockRollbackDto,
    } as any;
    setPatchRollbackService(mockService);

    const res = await handleExecutePatchRollback(fakeTrustedEvent, {
      projectId: validProjectId,
      approvalId: validApprovalId,
      rollbackReason: 'Test rollback',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.status, 'COMPLETED');
      assert.equal(res.data.originalFailureReoccurred, true);
    }
  });

  it('sanitizes domain conflict errors properly', async () => {
    const mockService = {
      executeRollback: async () => {
        throw new PatchRollbackConflictError(
          'User edits overlap patch hunk.',
          'OVERLAPPING_USER_CHANGES',
        );
      },
    } as any;
    setPatchRollbackService(mockService);

    const res = await handleExecutePatchRollback(fakeTrustedEvent, {
      projectId: validProjectId,
      approvalId: validApprovalId,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'PATCH_ROLLBACK_CONFLICT');
      assert.ok(res.error.message.includes('User edits overlap'));
    }
  });

  it('sanitizes schema validation errors properly', async () => {
    const res = await handlePlanPatchRollback(fakeTrustedEvent, {
      projectId: 'not-a-uuid',
      approvalId: validApprovalId,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'VALIDATION_ERROR');
    }
  });

  it('handles get, list, and resumeRecovery successfully', async () => {
    const mockService = {
      getRollback: async () => mockRollbackDto,
      listRollbacks: async () => [mockRollbackDto],
      resumeRecovery: async () => mockRollbackDto,
    } as any;
    setPatchRollbackService(mockService);

    const getRes = await handleGetPatchRollback(fakeTrustedEvent, {
      projectId: validProjectId,
      rollbackId: validRollbackId,
    });
    assert.equal(getRes.ok, true);

    const listRes = await handleListPatchRollbacks(fakeTrustedEvent, {
      projectId: validProjectId,
    });
    assert.equal(listRes.ok, true);
    if (listRes.ok) assert.equal(listRes.data.length, 1);

    const resumeRes = await handleResumePatchRollbackRecovery(fakeTrustedEvent, {
      projectId: validProjectId,
      rollbackId: validRollbackId,
    });
    assert.equal(resumeRes.ok, true);
  });
});
