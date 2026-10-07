/**
 * @file apps/desktop/src/main/ipc/patch-approval-handlers.test.ts
 * IPC handler tests for Human Approval, Reject & Apply Workflow (V7 Phase 104).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleGetPatchApproval,
  handleListPatchApprovals,
  handleApprovePatch,
  handleRejectPatch,
  handleApplyPatch,
  setPatchApprovalService,
} from './patch-approval-handlers.js';
import { PatchApprovalNotFoundError, PatchApprovalNotApprovedError } from '@ai-quality/core';
import type { DefectPatchApprovalDto } from '@ai-quality/contracts';

describe('Patch Approval IPC Handlers (Phase 104)', () => {
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
  const validFailureCaseId = '22222222-2222-2222-2222-222222222222';
  const validProposalId = '33333333-3333-3333-3333-333333333333';
  const validValidationId = '44444444-4444-4444-4444-444444444444';
  const validApprovalId = '55555555-5555-5555-5555-555555555555';

  const mockApprovalDto: DefectPatchApprovalDto = {
    id: validApprovalId,
    projectId: validProjectId,
    failureCaseId: validFailureCaseId,
    patchProposalId: validProposalId,
    validationId: validValidationId,
    repositoryId: null,
    status: 'PENDING_REVIEW',
    reviewedPatchHash: 'hash-abc-123',
    appliedPatchHash: null,
    baseRevision: 'abc1234',
    appliedRevision: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewComment: null,
    rejectionReason: null,
    rejectionDetails: null,
    applyRequestedAt: null,
    applyStartedAt: null,
    appliedAt: null,
    appliedBy: null,
    applyError: null,
    applyErrorCategory: null,
    affectedFiles: ['src/math.ts'],
    filesModifiedCount: 1,
    linesAdded: 2,
    linesRemoved: 1,
    appliedUnifiedDiff: null,
    auditTrail: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    setPatchApprovalService(null);
  });

  it('rejects untrusted sender frame for all handlers', async () => {
    const input = { projectId: validProjectId, approvalId: validApprovalId };

    const getRes = await handleGetPatchApproval(fakeUntrustedEvent, input);
    assert.equal(getRes.ok, false);
    if (!getRes.ok) assert.equal(getRes.error.code, 'UNAUTHORIZED_SENDER');

    const listRes = await handleListPatchApprovals(fakeUntrustedEvent, {
      projectId: validProjectId,
    });
    assert.equal(listRes.ok, false);
    if (!listRes.ok) assert.equal(listRes.error.code, 'UNAUTHORIZED_SENDER');

    const approveRes = await handleApprovePatch(fakeUntrustedEvent, {
      projectId: validProjectId,
      approvalId: validApprovalId,
    });
    assert.equal(approveRes.ok, false);
    if (!approveRes.ok) assert.equal(approveRes.error.code, 'UNAUTHORIZED_SENDER');

    const rejectRes = await handleRejectPatch(fakeUntrustedEvent, {
      projectId: validProjectId,
      approvalId: validApprovalId,
      rejectionReason: 'INCORRECT_FIX',
    });
    assert.equal(rejectRes.ok, false);
    if (!rejectRes.ok) assert.equal(rejectRes.error.code, 'UNAUTHORIZED_SENDER');

    const applyRes = await handleApplyPatch(fakeUntrustedEvent, {
      projectId: validProjectId,
      approvalId: validApprovalId,
    });
    assert.equal(applyRes.ok, false);
    if (!applyRes.ok) assert.equal(applyRes.error.code, 'UNAUTHORIZED_SENDER');
  });

  it('validates schema input rejecting invalid parameters', async () => {
    const invalidInput = { projectId: 'not-a-uuid' };
    const res = await handleGetPatchApproval(fakeTrustedEvent, invalidInput);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'VALIDATION_ERROR');
    }
  });

  it('returns approval DTO from service on getApproval', async () => {
    const mockService = {
      getApproval: async () => mockApprovalDto,
    } as any;
    setPatchApprovalService(mockService);

    const res = await handleGetPatchApproval(fakeTrustedEvent, {
      projectId: validProjectId,
      approvalId: validApprovalId,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.data, mockApprovalDto);
    }
  });

  it('handles PatchApprovalNotFoundError gracefully', async () => {
    const mockService = {
      getApproval: async () => {
        throw new PatchApprovalNotFoundError(validApprovalId);
      },
    } as any;
    setPatchApprovalService(mockService);

    const res = await handleGetPatchApproval(fakeTrustedEvent, {
      projectId: validProjectId,
      approvalId: validApprovalId,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'PATCH_APPROVAL_NOT_FOUND');
    }
  });

  it('returns approvals list on listApprovals', async () => {
    const mockService = {
      listApprovals: async () => [mockApprovalDto],
    } as any;
    setPatchApprovalService(mockService);

    const res = await handleListPatchApprovals(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.ok(res.data);
      assert.equal(res.data.length, 1);
      assert.equal(res.data[0]?.id, validApprovalId);
    }
  });

  it('handles approvePatch successfully', async () => {
    const approvedDto: DefectPatchApprovalDto = {
      ...mockApprovalDto,
      status: 'APPROVED',
      reviewedBy: 'test-user',
      reviewedAt: new Date().toISOString(),
      reviewComment: 'Looks solid',
    };
    const mockService = {
      approvePatch: async () => approvedDto,
    } as any;
    setPatchApprovalService(mockService);

    const res = await handleApprovePatch(fakeTrustedEvent, {
      projectId: validProjectId,
      approvalId: validApprovalId,
      reviewedBy: 'test-user',
      reviewComment: 'Looks solid',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.status, 'APPROVED');
      assert.equal(res.data.reviewedBy, 'test-user');
    }
  });

  it('handles rejectPatch successfully', async () => {
    const rejectedDto: DefectPatchApprovalDto = {
      ...mockApprovalDto,
      status: 'REJECTED',
      rejectionReason: 'INCORRECT_FIX',
      reviewedBy: 'qa-engineer',
      reviewedAt: new Date().toISOString(),
      reviewComment: 'Introduces a bug',
    };
    const mockService = {
      rejectPatch: async () => rejectedDto,
    } as any;
    setPatchApprovalService(mockService);

    const res = await handleRejectPatch(fakeTrustedEvent, {
      projectId: validProjectId,
      approvalId: validApprovalId,
      rejectionReason: 'INCORRECT_FIX',
      reviewedBy: 'qa-engineer',
      reviewComment: 'Introduces a bug',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.status, 'REJECTED');
      assert.equal(res.data.rejectionReason, 'INCORRECT_FIX');
    }
  });

  it('handles applyPatch and maps domain errors', async () => {
    const appliedDto: DefectPatchApprovalDto = {
      ...mockApprovalDto,
      status: 'APPLIED',
      appliedBy: 'qa-engineer',
      appliedAt: new Date().toISOString(),
      appliedPatchHash: 'hash-abc-123',
    };
    const mockService = {
      applyPatch: async () => appliedDto,
    } as any;
    setPatchApprovalService(mockService);

    const res = await handleApplyPatch(fakeTrustedEvent, {
      projectId: validProjectId,
      approvalId: validApprovalId,
      appliedBy: 'qa-engineer',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.status, 'APPLIED');
      assert.equal(res.data.appliedPatchHash, 'hash-abc-123');
    }

    // Test domain error mapping
    const errorService = {
      applyPatch: async () => {
        throw new PatchApprovalNotApprovedError('PENDING_REVIEW');
      },
    } as any;
    setPatchApprovalService(errorService);

    const errRes = await handleApplyPatch(fakeTrustedEvent, {
      projectId: validProjectId,
      approvalId: validApprovalId,
    });

    assert.equal(errRes.ok, false);
    if (!errRes.ok) {
      assert.equal(errRes.error.code, 'PATCH_APPROVAL_NOT_APPROVED');
    }
  });
});
