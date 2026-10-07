/**
 * @file apps/desktop/src/main/ipc/patch-sandbox-handlers.test.ts
 * Main process IPC handler tests for Secure Patch Sandbox & Change Isolation (V7 Phase 102).
 * Verifies untrusted sender rejection, Zod schema validation, service delegation, and domain error sanitization.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleCreatePatchSandbox,
  handleApplyPatchToSandbox,
  handleGetPatchSandbox,
  handleListPatchSandboxes,
  handleDestroyPatchSandbox,
  setPatchSandboxService,
} from './patch-sandbox-handlers.js';
import {
  PatchSandboxConflictError,
  PatchSandboxNotFoundError,
  PatchSandboxRevisionMismatchError,
} from '@ai-quality/core';
import type { DefectPatchSandboxDto } from '@ai-quality/contracts';

describe('Patch Sandbox IPC Handlers (Phase 102)', () => {
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
  const validSandboxId = '44444444-4444-4444-4444-444444444444';

  const mockSandboxDto: DefectPatchSandboxDto = {
    id: validSandboxId,
    projectId: validProjectId,
    failureCaseId: validFailureCaseId,
    repositoryId: '55555555-5555-5555-5555-555555555555',
    patchProposalId: validProposalId,
    sandboxStatus: 'READY',
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
    patchApplied: false,
    claimedFilesCount: 1,
    claimedLinesAdded: 1,
    claimedLinesRemoved: 1,
    actualFilesModified: [],
    actualFilesCreated: [],
    actualFilesDeleted: [],
    actualFilesRenamed: [],
    actualLinesAdded: 0,
    actualLinesRemoved: 0,
    actualTotalChangedLines: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    setPatchSandboxService(null);
  });

  it('rejects untrusted sender across all sandbox handlers', async () => {
    const resCreate = await handleCreatePatchSandbox(fakeUntrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
      patchProposalId: validProposalId,
    });
    assert.equal(resCreate.ok, false);
    if (!resCreate.ok) assert.equal(resCreate.error.code, 'UNAUTHORIZED_SENDER');

    const resApply = await handleApplyPatchToSandbox(fakeUntrustedEvent, {
      projectId: validProjectId,
      sandboxId: validSandboxId,
    });
    assert.equal(resApply.ok, false);
    if (!resApply.ok) assert.equal(resApply.error.code, 'UNAUTHORIZED_SENDER');

    const resGet = await handleGetPatchSandbox(fakeUntrustedEvent, {
      projectId: validProjectId,
      sandboxId: validSandboxId,
    });
    assert.equal(resGet.ok, false);
    if (!resGet.ok) assert.equal(resGet.error.code, 'UNAUTHORIZED_SENDER');

    const resList = await handleListPatchSandboxes(fakeUntrustedEvent, {
      projectId: validProjectId,
    });
    assert.equal(resList.ok, false);
    if (!resList.ok) assert.equal(resList.error.code, 'UNAUTHORIZED_SENDER');

    const resDestroy = await handleDestroyPatchSandbox(fakeUntrustedEvent, {
      projectId: validProjectId,
      sandboxId: validSandboxId,
    });
    assert.equal(resDestroy.ok, false);
    if (!resDestroy.ok) assert.equal(resDestroy.error.code, 'UNAUTHORIZED_SENDER');
  });

  it('validates schema inputs and returns VALIDATION_ERROR on malformed input', async () => {
    const res = await handleCreatePatchSandbox(fakeTrustedEvent, {
      projectId: 'invalid',
      failureCaseId: 'not-uuid',
      patchProposalId: 'also-not-uuid',
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'VALIDATION_ERROR');
    }
  });

  it('delegates to service and returns DTO on valid create, apply, get, list, destroy', async () => {
    const mockService = {
      createSandbox: async () => mockSandboxDto,
      applyPatch: async () => ({
        ...mockSandboxDto,
        sandboxStatus: 'PATCH_APPLIED' as const,
        patchApplied: true,
      }),
      getSandbox: async () => mockSandboxDto,
      listSandboxes: async () => [mockSandboxDto],
      destroySandbox: async () => ({
        ...mockSandboxDto,
        sandboxStatus: 'DESTROYED' as const,
      }),
    };

    setPatchSandboxService(mockService as any);

    // Create
    const createRes = await handleCreatePatchSandbox(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
      patchProposalId: validProposalId,
    });
    assert.equal(createRes.ok, true);
    if (createRes.ok) assert.equal(createRes.data.id, validSandboxId);

    // Apply
    const applyRes = await handleApplyPatchToSandbox(fakeTrustedEvent, {
      projectId: validProjectId,
      sandboxId: validSandboxId,
    });
    assert.equal(applyRes.ok, true);
    if (applyRes.ok) assert.equal(applyRes.data.sandboxStatus, 'PATCH_APPLIED');

    // Get
    const getRes = await handleGetPatchSandbox(fakeTrustedEvent, {
      projectId: validProjectId,
      sandboxId: validSandboxId,
    });
    assert.equal(getRes.ok, true);
    if (getRes.ok) assert.equal(getRes.data?.id, validSandboxId);

    // List
    const listRes = await handleListPatchSandboxes(fakeTrustedEvent, {
      projectId: validProjectId,
    });
    assert.equal(listRes.ok, true);
    if (listRes.ok) assert.equal(listRes.data.length, 1);

    // Destroy
    const destroyRes = await handleDestroyPatchSandbox(fakeTrustedEvent, {
      projectId: validProjectId,
      sandboxId: validSandboxId,
    });
    assert.equal(destroyRes.ok, true);
    if (destroyRes.ok) assert.equal(destroyRes.data.sandboxStatus, 'DESTROYED');
  });

  it('sanitizes domain errors properly into DesktopError', async () => {
    const mockService = {
      applyPatch: async () => {
        throw new PatchSandboxConflictError('Conflict at line 10');
      },
      createSandbox: async () => {
        throw new PatchSandboxRevisionMismatchError('Revision drift');
      },
      getSandbox: async () => {
        throw new PatchSandboxNotFoundError('Sandbox not found');
      },
    };

    setPatchSandboxService(mockService as any);

    const conflictRes = await handleApplyPatchToSandbox(fakeTrustedEvent, {
      projectId: validProjectId,
      sandboxId: validSandboxId,
    });
    assert.equal(conflictRes.ok, false);
    if (!conflictRes.ok) assert.equal(conflictRes.error.code, 'PATCH_SANDBOX_CONFLICT');

    const driftRes = await handleCreatePatchSandbox(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
      patchProposalId: validProposalId,
    });
    assert.equal(driftRes.ok, false);
    if (!driftRes.ok) assert.equal(driftRes.error.code, 'PATCH_SANDBOX_REVISION_MISMATCH');

    const notFoundRes = await handleGetPatchSandbox(fakeTrustedEvent, {
      projectId: validProjectId,
      sandboxId: validSandboxId,
    });
    assert.equal(notFoundRes.ok, false);
    if (!notFoundRes.ok) assert.equal(notFoundRes.error.code, 'PATCH_SANDBOX_NOT_FOUND');
  });
});
