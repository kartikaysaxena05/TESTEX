/**
 * @file packages/core/src/patch/sandbox/patch-sandbox-contract.test.ts
 * Contract and Zod schema tests for Secure Patch Sandbox & Change Isolation (V7 Phase 102).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  patchSandboxStatusSchema,
  patchSandboxSecurityChecksDtoSchema,
  defectPatchSandboxDtoSchema,
  createPatchSandboxInputSchema,
  applyPatchToSandboxInputSchema,
  getPatchSandboxInputSchema,
  listPatchSandboxesInputSchema,
  destroyPatchSandboxInputSchema,
  DESKTOP_CHANNELS,
} from '@ai-quality/contracts';

describe('Patch Sandbox Contracts & Schemas (Phase 102)', () => {
  it('validates all PatchSandboxStatus enum values', () => {
    const validStatuses = [
      'CREATING',
      'READY',
      'PATCH_APPLYING',
      'PATCH_APPLIED',
      'PATCH_REJECTED',
      'FAILED',
      'DESTROYING',
      'DESTROYED',
      'EXPIRED',
    ];

    for (const status of validStatuses) {
      assert.equal(patchSandboxStatusSchema.parse(status), status);
    }

    assert.throws(() => patchSandboxStatusSchema.parse('RUNNING_TESTS'));
    assert.throws(() => patchSandboxStatusSchema.parse('COMMITTED'));
  });

  it('validates createPatchSandboxInputSchema requires valid UUIDs', () => {
    const valid = {
      projectId: '11111111-1111-1111-1111-111111111111',
      failureCaseId: '22222222-2222-2222-2222-222222222222',
      patchProposalId: '33333333-3333-3333-3333-333333333333',
      actor: 'USER_1',
    };
    assert.doesNotThrow(() => createPatchSandboxInputSchema.parse(valid));

    assert.throws(() =>
      createPatchSandboxInputSchema.parse({
        ...valid,
        projectId: 'invalid-uuid',
      }),
    );
  });

  it('validates applyPatchToSandboxInputSchema', () => {
    const valid = {
      projectId: '11111111-1111-1111-1111-111111111111',
      sandboxId: '44444444-4444-4444-4444-444444444444',
    };
    assert.doesNotThrow(() => applyPatchToSandboxInputSchema.parse(valid));

    assert.throws(() =>
      applyPatchToSandboxInputSchema.parse({
        ...valid,
        sandboxId: 'not-a-uuid',
      }),
    );
  });

  it('validates patchSandboxSecurityChecksDtoSchema', () => {
    const validChecks = {
      pathContainmentPassed: true,
      symlinkEscapePassed: true,
      allowedFileScopePassed: true,
      sensitiveFilesProtected: true,
      gitMetadataProtected: true,
      arbitraryShellExecutionBlocked: true,
      binaryFilesBlocked: true,
      hardlinkIsolated: true,
      checkedAt: new Date().toISOString(),
    };
    assert.doesNotThrow(() => patchSandboxSecurityChecksDtoSchema.parse(validChecks));

    assert.throws(() =>
      patchSandboxSecurityChecksDtoSchema.parse({
        ...validChecks,
        pathContainmentPassed: 'true', // not boolean
      }),
    );
  });

  it('validates defectPatchSandboxDtoSchema with full fields', () => {
    const validSandboxDto = {
      id: '44444444-4444-4444-4444-444444444444',
      projectId: '11111111-1111-1111-1111-111111111111',
      failureCaseId: '22222222-2222-2222-2222-222222222222',
      repositoryId: '33333333-3333-3333-3333-333333333333',
      patchProposalId: '55555555-5555-5555-5555-555555555555',
      sandboxStatus: 'PATCH_APPLIED',
      sourceRevision: 'abcdef1234567890',
      sandboxRevision: 'abcdef1234567890',
      sanitizedSandboxLocation: '[SANDBOX_ISOLATED_DIR]/sandbox-44444444',
      isolationStrategy: 'ISOLATED_DIRECTORY_INODES',
      isolationVersion: 1,
      originalRepoHeadCommit: 'abcdef1234567890',
      originalRepoClean: true,
      originalRepoIntegrityVerified: true,
      originalRepoModifiedCount: 0,
      appliedPatchProposalVersion: 1,
      patchApplied: true,
      patchAppliedAt: new Date().toISOString(),
      claimedFilesCount: 1,
      claimedLinesAdded: 1,
      claimedLinesRemoved: 1,
      actualFilesModified: ['src/validator.ts'],
      actualFilesCreated: [],
      actualFilesDeleted: [],
      actualFilesRenamed: [],
      actualLinesAdded: 1,
      actualLinesRemoved: 1,
      actualTotalChangedLines: 2,
      actualUnifiedDiff:
        '--- a/src/validator.ts\n+++ b/src/validator.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n',
      changeSetHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      claimedVsActualDiffMatch: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    assert.doesNotThrow(() => defectPatchSandboxDtoSchema.parse(validSandboxDto));
  });

  it('verifies DESKTOP_CHANNELS constants for sandbox lifecycle', () => {
    assert.equal(DESKTOP_CHANNELS.PATCH_SANDBOX_CREATE, 'desktop:patch-sandboxes:create');
    assert.equal(DESKTOP_CHANNELS.PATCH_SANDBOX_APPLY, 'desktop:patch-sandboxes:apply');
    assert.equal(DESKTOP_CHANNELS.PATCH_SANDBOX_GET, 'desktop:patch-sandboxes:get');
    assert.equal(DESKTOP_CHANNELS.PATCH_SANDBOX_LIST, 'desktop:patch-sandboxes:list');
    assert.equal(DESKTOP_CHANNELS.PATCH_SANDBOX_DESTROY, 'desktop:patch-sandboxes:destroy');
  });

  it('validates input schemas for create, apply, get, list, destroy', () => {
    const validCreate = createPatchSandboxInputSchema.parse({
      projectId: '11111111-2222-3333-4444-555555555555',
      failureCaseId: '22222222-3333-4444-5555-666666666666',
      patchProposalId: '33333333-4444-5555-6666-777777777777',
    });
    assert.equal(validCreate.projectId, '11111111-2222-3333-4444-555555555555');

    const validApply = applyPatchToSandboxInputSchema.parse({
      projectId: '11111111-2222-3333-4444-555555555555',
      sandboxId: '44444444-5555-6666-7777-888888888888',
    });
    assert.equal(validApply.sandboxId, '44444444-5555-6666-7777-888888888888');

    const validGet = getPatchSandboxInputSchema.parse({
      projectId: '11111111-2222-3333-4444-555555555555',
      sandboxId: '44444444-5555-6666-7777-888888888888',
    });
    assert.equal(validGet.sandboxId, '44444444-5555-6666-7777-888888888888');

    const validList = listPatchSandboxesInputSchema.parse({
      projectId: '11111111-2222-3333-4444-555555555555',
      failureCaseId: '22222222-3333-4444-5555-666666666666',
    });
    assert.equal(validList.projectId, '11111111-2222-3333-4444-555555555555');

    const validDestroy = destroyPatchSandboxInputSchema.parse({
      projectId: '11111111-2222-3333-4444-555555555555',
      sandboxId: '44444444-5555-6666-7777-888888888888',
    });
    assert.equal(validDestroy.sandboxId, '44444444-5555-6666-7777-888888888888');
  });
});
