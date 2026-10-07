/**
 * @file packages/core/src/patch/approval/patch-approval-contract.test.ts
 * Contract, schema, and error translation tests for V7 Phase 104 Human Approval, Reject & Apply Workflow.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_CHANNELS,
  patchApprovalStatusSchema,
  patchRejectionReasonSchema,
  patchApprovalAuditEntryDtoSchema,
  defectPatchApprovalDtoSchema,
  getPatchApprovalInputSchema,
  listPatchApprovalsInputSchema,
  approvePatchInputSchema,
  rejectPatchInputSchema,
  applyPatchInputSchema,
} from '@ai-quality/contracts';
import {
  PatchApprovalError,
  PatchApprovalNotFoundError,
  PatchApprovalCrossProjectError,
  PatchApprovalInvalidStateTransitionError,
  PatchApprovalValidationNotValidError,
  PatchApprovalStaleValidationError,
  PatchApprovalHashMismatchError,
  PatchApprovalRepositoryDriftError,
  PatchApprovalNotApprovedError,
  PatchApprovalAlreadyAppliedError,
  PatchApprovalApplyFailedError,
  PatchApprovalScopeViolationError,
  PatchApprovalConcurrentMutationError,
} from './approval-errors.js';

describe('Patch Approval Contracts & Schemas', () => {
  const validUuid1 = '11111111-1111-1111-1111-111111111111';
  const validUuid2 = '22222222-2222-2222-2222-222222222222';
  const validUuid3 = '33333333-3333-3333-3333-333333333333';

  it('validates DESKTOP_CHANNELS for patch approval', () => {
    assert.equal(DESKTOP_CHANNELS.PATCH_APPROVAL_GET, 'desktop:patch-approvals:get');
    assert.equal(DESKTOP_CHANNELS.PATCH_APPROVAL_LIST, 'desktop:patch-approvals:list');
    assert.equal(DESKTOP_CHANNELS.PATCH_APPROVAL_APPROVE, 'desktop:patch-approvals:approve');
    assert.equal(DESKTOP_CHANNELS.PATCH_APPROVAL_REJECT, 'desktop:patch-approvals:reject');
    assert.equal(DESKTOP_CHANNELS.PATCH_APPROVAL_APPLY, 'desktop:patch-approvals:apply');
  });

  it('validates patchApprovalStatusSchema values', () => {
    const validStatuses = [
      'PENDING_REVIEW',
      'APPROVED',
      'REJECTED',
      'APPLYING',
      'APPLIED',
      'APPLY_FAILED',
      'SUPERSEDED',
    ];
    for (const s of validStatuses) {
      assert.equal(patchApprovalStatusSchema.parse(s), s);
    }
    assert.throws(() => patchApprovalStatusSchema.parse('AUTO_APPLIED'));
    assert.throws(() => patchApprovalStatusSchema.parse('PENDING'));
  });

  it('validates patchRejectionReasonSchema values', () => {
    const validReasons = [
      'INCORRECT_FIX',
      'TOO_RISKY',
      'WRONG_ROOT_CAUSE',
      'UNNECESSARY_CHANGE',
      'NEEDS_MANUAL_REPAIR',
      'ARCHITECTURE_CONCERN',
      'OTHER',
    ];
    for (const r of validReasons) {
      assert.equal(patchRejectionReasonSchema.parse(r), r);
    }
    assert.throws(() => patchRejectionReasonSchema.parse('UNKNOWN'));
  });

  it('validates approvePatchInputSchema', () => {
    const parsed = approvePatchInputSchema.parse({
      projectId: validUuid1,
      approvalId: validUuid2,
      reviewComment: 'Looks solid, verified manually.',
    });
    assert.equal(parsed.projectId, validUuid1);
    assert.equal(parsed.approvalId, validUuid2);
    assert.equal(parsed.reviewedBy, 'HUMAN_REVIEWER');
    assert.equal(parsed.reviewComment, 'Looks solid, verified manually.');

    // Rejects non-UUID
    assert.throws(() =>
      approvePatchInputSchema.parse({
        projectId: 'invalid',
        approvalId: validUuid2,
      }),
    );
  });

  it('validates rejectPatchInputSchema', () => {
    const parsed = rejectPatchInputSchema.parse({
      projectId: validUuid1,
      approvalId: validUuid2,
      rejectionReason: 'INCORRECT_FIX',
      rejectionDetails: 'Breaks edge cases with null input.',
    });
    assert.equal(parsed.projectId, validUuid1);
    assert.equal(parsed.approvalId, validUuid2);
    assert.equal(parsed.rejectionReason, 'INCORRECT_FIX');
    assert.equal(parsed.reviewedBy, 'HUMAN_REVIEWER');
  });

  it('validates applyPatchInputSchema', () => {
    const parsed = applyPatchInputSchema.parse({
      projectId: validUuid1,
      approvalId: validUuid2,
      expectedBaseRevision: 'abc1234',
    });
    assert.equal(parsed.projectId, validUuid1);
    assert.equal(parsed.approvalId, validUuid2);
    assert.equal(parsed.appliedBy, 'HUMAN_REVIEWER');
    assert.equal(parsed.expectedBaseRevision, 'abc1234');
  });

  it('validates getPatchApprovalInputSchema and listPatchApprovalsInputSchema', () => {
    const getParsed = getPatchApprovalInputSchema.parse({
      projectId: validUuid1,
      approvalId: validUuid2,
    });
    assert.equal(getParsed.approvalId, validUuid2);

    const listParsed = listPatchApprovalsInputSchema.parse({
      projectId: validUuid1,
      status: 'APPROVED',
    });
    assert.equal(listParsed.projectId, validUuid1);
    assert.equal(listParsed.status, 'APPROVED');
  });

  it('validates patchApprovalAuditEntryDtoSchema', () => {
    const auditParsed = patchApprovalAuditEntryDtoSchema.parse({
      id: 'audit-1',
      eventType: 'APPROVED',
      timestamp: new Date().toISOString(),
      actor: 'HUMAN_REVIEWER',
      details: { reason: 'Verified' },
    });
    assert.equal(auditParsed.id, 'audit-1');
    assert.equal(auditParsed.eventType, 'APPROVED');
  });

  it('validates defectPatchApprovalDtoSchema', () => {
    const dto = {
      id: validUuid1,
      projectId: validUuid2,
      failureCaseId: validUuid3,
      patchProposalId: validUuid1,
      validationId: validUuid2,
      repositoryId: validUuid3,
      status: 'APPROVED' as const,
      baseRevision: 'git-commit-sha-001',
      reviewedPatchHash: 'hash-abc',
      appliedPatchHash: null,
      appliedRevision: null,
      reviewedBy: 'test-reviewer',
      reviewedAt: new Date().toISOString(),
      reviewComment: 'Verified',
      rejectionReason: null,
      rejectionDetails: null,
      appliedBy: null,
      appliedAt: null,
      affectedFiles: ['src/math.ts'],
      filesModifiedCount: 1,
      linesAdded: 2,
      linesRemoved: 1,
      appliedUnifiedDiff: null,
      auditTrail: [
        {
          id: validUuid1,
          eventType: 'CREATED',
          timestamp: new Date().toISOString(),
          actor: 'SYSTEM',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = defectPatchApprovalDtoSchema.parse(dto);
    assert.equal(parsed.id, validUuid1);
    assert.equal(parsed.status, 'APPROVED');
    assert.equal(parsed.auditTrail.length, 1);
  });

  it('validates specialized error classes and their DesktopErrorCodes', () => {
    const notFound = new PatchApprovalNotFoundError('not found');
    assert.equal(notFound.code, 'PATCH_APPROVAL_NOT_FOUND');
    assert(notFound instanceof PatchApprovalError);

    const crossProj = new PatchApprovalCrossProjectError('forbidden');
    assert.equal(crossProj.code, 'PATCH_APPROVAL_CROSS_PROJECT');

    const invState = new PatchApprovalInvalidStateTransitionError('invalid state');
    assert.equal(invState.code, 'PATCH_APPROVAL_INVALID_STATE_TRANSITION');

    const notVal = new PatchApprovalValidationNotValidError('not valid');
    assert.equal(notVal.code, 'PATCH_APPROVAL_VALIDATION_NOT_VALID');

    const staleVal = new PatchApprovalStaleValidationError('stale');
    assert.equal(staleVal.code, 'PATCH_APPROVAL_STALE_VALIDATION');

    const hashMismatch = new PatchApprovalHashMismatchError('hash mismatch');
    assert.equal(hashMismatch.code, 'PATCH_APPROVAL_HASH_MISMATCH');

    const repoDrift = new PatchApprovalRepositoryDriftError('drifted');
    assert.equal(repoDrift.code, 'PATCH_APPROVAL_REPOSITORY_DRIFT');

    const notApproved = new PatchApprovalNotApprovedError('not approved');
    assert.equal(notApproved.code, 'PATCH_APPROVAL_NOT_APPROVED');

    const alreadyApplied = new PatchApprovalAlreadyAppliedError('already applied');
    assert.equal(alreadyApplied.code, 'PATCH_APPROVAL_ALREADY_APPLIED');

    const applyFailed = new PatchApprovalApplyFailedError('apply failed');
    assert.equal(applyFailed.code, 'PATCH_APPROVAL_APPLY_FAILED');

    const scopeViol = new PatchApprovalScopeViolationError('scope violation');
    assert.equal(scopeViol.code, 'PATCH_APPROVAL_SCOPE_VIOLATION');

    const concurrent = new PatchApprovalConcurrentMutationError('concurrent');
    assert.equal(concurrent.code, 'PATCH_APPROVAL_CONCURRENT_MUTATION');
  });
});
