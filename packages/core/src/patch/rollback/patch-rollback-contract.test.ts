/**
 * @file packages/core/src/patch/rollback/patch-rollback-contract.test.ts
 * Contract, schema, and error hierarchy tests for V7 Phase 105 Patch Rollback & Recovery.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_CHANNELS,
  patchRollbackStatusSchema,
  patchRollbackConflictTypeSchema,
  rollbackConflictItemSchema,
  rollbackAuditEntryDtoSchema,
  defectPatchRollbackDtoSchema,
  planPatchRollbackInputSchema,
  patchRollbackPlanResultDtoSchema,
  executePatchRollbackInputSchema,
  getPatchRollbackInputSchema,
  listPatchRollbacksInputSchema,
  resumePatchRollbackRecoveryInputSchema,
} from '@ai-quality/contracts';
import {
  PatchRollbackError,
  PatchRollbackNotFoundError,
  PatchRollbackCrossProjectError,
  PatchRollbackInvalidStateError,
  PatchRollbackNotAppliedError,
  PatchRollbackAlreadyAppliedError,
  PatchRollbackConflictError,
  PatchRollbackDriftDetectedError,
  PatchRollbackRecoveryFailedError,
  PatchRollbackIntegrityFailedError,
  PatchRollbackConcurrentMutationError,
  PatchRollbackRecoveryRequiredError,
} from './rollback-errors.js';

describe('V7 Phase 105 Patch Rollback Contracts & Schemas', () => {
  const validUuid1 = '11111111-1111-1111-1111-111111111111';
  const validUuid2 = '22222222-2222-2222-2222-222222222222';
  const validUuid3 = '33333333-3333-3333-3333-333333333333';
  const validUuid4 = '44444444-4444-4444-4444-444444444444';

  it('validates DESKTOP_CHANNELS for patch rollback', () => {
    assert.equal(DESKTOP_CHANNELS.PATCH_ROLLBACK_PLAN, 'desktop:patch-rollbacks:plan');
    assert.equal(DESKTOP_CHANNELS.PATCH_ROLLBACK_EXECUTE, 'desktop:patch-rollbacks:execute');
    assert.equal(DESKTOP_CHANNELS.PATCH_ROLLBACK_GET, 'desktop:patch-rollbacks:get');
    assert.equal(DESKTOP_CHANNELS.PATCH_ROLLBACK_LIST, 'desktop:patch-rollbacks:list');
    assert.equal(
      DESKTOP_CHANNELS.PATCH_ROLLBACK_RESUME_RECOVERY,
      'desktop:patch-rollbacks:resume-recovery',
    );
  });

  it('validates patchRollbackStatusSchema enum values', () => {
    const validStatuses = [
      'PENDING',
      'PLANNING',
      'RECOVERY_POINT_CREATED',
      'APPLYING',
      'COMPLETED',
      'FAILED',
      'CONFLICT_BLOCKED',
      'RECOVERY_REQUIRED',
    ];

    for (const status of validStatuses) {
      assert.equal(patchRollbackStatusSchema.parse(status), status);
    }

    assert.throws(() => patchRollbackStatusSchema.parse('INVALID_STATUS'));
  });

  it('validates patchRollbackConflictTypeSchema enum values', () => {
    const validTypes = [
      'OVERLAPPING_USER_CHANGES',
      'SAME_FILE_CONFLICT',
      'FILE_DELETED',
      'FILE_MOVED',
      'NEWER_PATCH_CONFLICT',
      'DRIFT_DETECTED',
    ];

    for (const type of validTypes) {
      assert.equal(patchRollbackConflictTypeSchema.parse(type), type);
    }

    assert.throws(() => patchRollbackConflictTypeSchema.parse('RANDOM_CONFLICT'));
  });

  it('validates rollbackConflictItemSchema', () => {
    const valid = {
      type: 'OVERLAPPING_USER_CHANGES',
      filePath: 'src/calc.ts',
      startLine: 10,
      endLine: 15,
      details: 'Subsequent user modifications conflict with patch hunk.',
      conflictingContent: 'const a = 10;',
    };

    const parsed = rollbackConflictItemSchema.parse(valid);
    assert.equal(parsed.type, 'OVERLAPPING_USER_CHANGES');
    assert.equal(parsed.filePath, 'src/calc.ts');
  });

  it('validates rollbackAuditEntryDtoSchema', () => {
    const valid = {
      id: 'audit-1',
      eventType: 'ROLLBACK_STARTED',
      timestamp: new Date().toISOString(),
      actor: 'HUMAN_OPERATOR',
      details: { foo: 'bar' },
    };

    const parsed = rollbackAuditEntryDtoSchema.parse(valid);
    assert.equal(parsed.id, 'audit-1');
    assert.equal(parsed.eventType, 'ROLLBACK_STARTED');
  });

  it('validates defectPatchRollbackDtoSchema', () => {
    const dto = {
      id: validUuid1,
      projectId: validUuid2,
      failureCaseId: validUuid3,
      patchProposalId: validUuid4,
      patchApprovalId: validUuid1,
      rollbackRequestedBy: 'HUMAN_OPERATOR',
      status: 'COMPLETED',
      targetPrePatchHashes: { 'src/app.ts': 'hash0' },
      preRollbackHashes: { 'src/app.ts': 'hash1' },
      postRollbackHashes: { 'src/app.ts': 'hash0' },
      targetFiles: ['src/app.ts'],
      restoredFiles: ['src/app.ts'],
      preservedUnrelatedFiles: ['src/utils.ts'],
      dryRunOnly: false,
      integrityVerified: true,
      auditTrail: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = defectPatchRollbackDtoSchema.parse(dto);
    assert.equal(parsed.status, 'COMPLETED');
    assert.equal(parsed.integrityVerified, true);
    assert.equal(parsed.targetFiles.length, 1);
  });

  it('validates planPatchRollbackInputSchema', () => {
    const valid = {
      projectId: validUuid1,
      approvalId: validUuid2,
    };

    const parsed = planPatchRollbackInputSchema.parse(valid);
    assert.equal(parsed.projectId, validUuid1);
    assert.equal(parsed.approvalId, validUuid2);
    assert.equal(parsed.actor, 'HUMAN_OPERATOR');
  });

  it('validates patchRollbackPlanResultDtoSchema', () => {
    const plan = {
      approvalId: validUuid1,
      canRollback: true,
      conflicts: [],
      targetFiles: ['src/index.ts'],
      reverseDiff: '--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,1 +1,1 @@\n-new\n+old\n',
      structuredReverseEdits: [],
      preRollbackHashes: { 'src/index.ts': 'abc' },
      expectedPostRollbackHashes: { 'src/index.ts': 'def' },
      preservedFiles: ['src/other.ts'],
    };

    const parsed = patchRollbackPlanResultDtoSchema.parse(plan);
    assert.equal(parsed.canRollback, true);
    assert.equal(parsed.preservedFiles.length, 1);
  });

  it('validates executePatchRollbackInputSchema with defaults', () => {
    const input = {
      projectId: validUuid1,
      approvalId: validUuid2,
    };

    const parsed = executePatchRollbackInputSchema.parse(input);
    assert.equal(parsed.rollbackRequestedBy, 'HUMAN_OPERATOR');
    assert.equal(parsed.dryRun, false);
  });

  it('validates getPatchRollbackInputSchema and listPatchRollbacksInputSchema', () => {
    const getInput = {
      projectId: validUuid1,
      rollbackId: validUuid2,
    };
    assert.ok(getPatchRollbackInputSchema.parse(getInput));

    const listInput = {
      projectId: validUuid1,
      status: 'COMPLETED',
    };
    assert.ok(listPatchRollbacksInputSchema.parse(listInput));
  });

  it('validates resumePatchRollbackRecoveryInputSchema', () => {
    const input = {
      projectId: validUuid1,
      rollbackId: validUuid2,
    };
    const parsed = resumePatchRollbackRecoveryInputSchema.parse(input);
    assert.equal(parsed.actor, 'HUMAN_OPERATOR');
  });

  it('verifies error hierarchy and codes', () => {
    const notFound = new PatchRollbackNotFoundError();
    assert.equal(notFound.code, 'PATCH_ROLLBACK_NOT_FOUND');
    assert.ok(notFound instanceof PatchRollbackError);

    const crossProj = new PatchRollbackCrossProjectError();
    assert.equal(crossProj.code, 'PATCH_ROLLBACK_CROSS_PROJECT');

    const notApplied = new PatchRollbackNotAppliedError();
    assert.equal(notApplied.code, 'PATCH_ROLLBACK_NOT_APPLIED');

    const conflict = new PatchRollbackConflictError(
      'Hunk overlap conflict',
      'OVERLAPPING_USER_CHANGES',
      [{ type: 'OVERLAPPING_USER_CHANGES', filePath: 'a.ts', details: 'overlap' }],
    );
    assert.equal(conflict.code, 'PATCH_ROLLBACK_CONFLICT');
    assert.equal(conflict.conflictType, 'OVERLAPPING_USER_CHANGES');
    assert.equal(conflict.conflicts.length, 1);

    const drift = new PatchRollbackDriftDetectedError();
    assert.equal(drift.code, 'PATCH_ROLLBACK_DRIFT_DETECTED');

    const recoveryFailed = new PatchRollbackRecoveryFailedError();
    assert.equal(recoveryFailed.code, 'PATCH_ROLLBACK_RECOVERY_FAILED');

    const integrityFailed = new PatchRollbackIntegrityFailedError();
    assert.equal(integrityFailed.code, 'PATCH_ROLLBACK_INTEGRITY_FAILED');

    const concurrent = new PatchRollbackConcurrentMutationError();
    assert.equal(concurrent.code, 'PATCH_ROLLBACK_CONCURRENT_MUTATION');

    const recoveryReq = new PatchRollbackRecoveryRequiredError();
    assert.equal(recoveryReq.code, 'PATCH_ROLLBACK_RECOVERY_REQUIRED');
  });
});
