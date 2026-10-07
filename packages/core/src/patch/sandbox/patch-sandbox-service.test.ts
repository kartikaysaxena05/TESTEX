/**
 * @file packages/core/src/patch/sandbox/patch-sandbox-service.test.ts
 * Lifecycle and integration tests for PatchSandboxService: provisioning,
 * revision pinning, patch application, isolation invariant, and teardown.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PrismaClient } from '@prisma/client';
import { PatchSandboxService } from './patch-sandbox-service.js';
import {
  PatchSandboxCreationFailedError,
  PatchSandboxCrossProjectError,
  PatchSandboxNotFoundError,
  PatchSandboxValidationError,
} from './sandbox-errors.js';

const execFileAsync = promisify(execFile);

describe('PatchSandboxService', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const failureCaseId = '22222222-2222-2222-2222-222222222222';
  const repositoryId = '33333333-3333-3333-3333-333333333333';
  const patchProposalId = '44444444-4444-4444-4444-444444444444';
  const sandboxId = '55555555-5555-5555-5555-555555555555';

  let tempDir: string;
  let repoDir: string;
  let sandboxStorageDir: string;
  let headCommitSha: string;

  before(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'service-test-')));
    repoDir = path.join(tempDir, 'authoritative-repo');
    sandboxStorageDir = path.join(tempDir, 'sandboxes');

    fs.mkdirSync(repoDir, { recursive: true });
    fs.mkdirSync(sandboxStorageDir, { recursive: true });

    // Initialize git repo with one commit
    await execFileAsync('git', ['init', '-b', 'main'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.name', 'Test Engineer'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });

    const srcDir = path.join(repoDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'calc.ts'),
      'export function add(a: number, b: number): number {\n  return a - b;\n}\n',
      'utf8',
    );

    await execFileAsync('git', ['add', '.'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-m', 'Initial commit'], { cwd: repoDir });

    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoDir });
    headCommitSha = stdout.trim();
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('validates mandatory inputs for createSandbox', async () => {
    const service = new PatchSandboxService({
      prisma: {} as unknown as PrismaClient,
      sandboxStorageBaseDir: sandboxStorageDir,
    });

    await assert.rejects(
      async () =>
        service.createSandbox({
          projectId: '',
          failureCaseId: '',
          patchProposalId: '',
        }),
      PatchSandboxValidationError,
    );
  });

  it('rejects creation when patch proposal is not found', async () => {
    const mockPrisma = {
      defectPatchProposal: {
        findUnique: async () => null,
      },
    } as unknown as PrismaClient;

    const service = new PatchSandboxService({
      prisma: mockPrisma,
      sandboxStorageBaseDir: sandboxStorageDir,
    });

    await assert.rejects(
      async () =>
        service.createSandbox({
          projectId,
          failureCaseId,
          patchProposalId,
        }),
      PatchSandboxNotFoundError,
    );
  });

  it('rejects creation when patch proposal belongs to a different project', async () => {
    const mockPrisma = {
      defectPatchProposal: {
        findUnique: async () => ({
          id: patchProposalId,
          projectId: '99999999-9999-9999-9999-999999999999', // mismatch
          failureCaseId,
          status: 'PROPOSED',
        }),
      },
    } as unknown as PrismaClient;

    const service = new PatchSandboxService({
      prisma: mockPrisma,
      sandboxStorageBaseDir: sandboxStorageDir,
    });

    await assert.rejects(
      async () =>
        service.createSandbox({
          projectId,
          failureCaseId,
          patchProposalId,
        }),
      PatchSandboxCrossProjectError,
    );
  });

  it('rejects creation when patch proposal is WITHDRAWN', async () => {
    const mockPrisma = {
      defectPatchProposal: {
        findUnique: async () => ({
          id: patchProposalId,
          projectId,
          failureCaseId,
          status: 'WITHDRAWN',
        }),
      },
    } as unknown as PrismaClient;

    const service = new PatchSandboxService({
      prisma: mockPrisma,
      sandboxStorageBaseDir: sandboxStorageDir,
    });

    await assert.rejects(
      async () =>
        service.createSandbox({
          projectId,
          failureCaseId,
          patchProposalId,
        }),
      PatchSandboxCreationFailedError,
    );
  });

  it('provisions isolated sandbox, pins revision, applies patch, and verifies author repo immutability', async () => {
    let savedSandbox: any = null;

    const mockProposal = {
      id: patchProposalId,
      projectId,
      failureCaseId,
      repositoryRevision: headCommitSha,
      status: 'PROPOSED',
      proposalVersion: 1,
      targetFiles: ['src/calc.ts'],
      filesChangedCount: 1,
      linesAddedCount: 1,
      linesRemovedCount: 1,
      totalChangedLinesCount: 2,
      linesAdded: 1,
      linesRemoved: 1,
      totalChangedLines: 2,
      unifiedDiff:
        '--- a/src/calc.ts\n+++ b/src/calc.ts\n@@ -2,1 +2,1 @@\n-  return a - b;\n+  return a + b;\n',
      structuredEditsJson: [
        {
          filePath: 'src/calc.ts',
          startLine: 2,
          endLine: 2,
          originalContent: '  return a - b;',
          replacementContent: '  return a + b;',
        },
      ],
      failureCase: {
        id: failureCaseId,
        projectId,
        defectLocalizations: [
          {
            id: 'loc-1',
            status: 'COMPLETED',
            candidateFilesJson: ['src/calc.ts'],
            source: {
              id: repositoryId,
              rootPath: repoDir,
            },
          },
        ],
      },
    };

    const mockPrisma = {
      defectPatchProposal: {
        findUnique: async () => mockProposal,
      },
      defectPatchSandbox: {
        create: async ({ data }: any) => {
          savedSandbox = {
            id: sandboxId,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          return savedSandbox;
        },
        findUnique: async () => savedSandbox,
        findFirst: async () => savedSandbox,
        findMany: async () => [savedSandbox],
        update: async ({ data }: any) => {
          savedSandbox = {
            ...savedSandbox,
            ...data,
            updatedAt: new Date(),
          };
          return savedSandbox;
        },
      },
      $transaction: async (fn: any) => fn(mockPrisma),
    } as unknown as PrismaClient;

    const service = new PatchSandboxService({
      prisma: mockPrisma,
      sandboxStorageBaseDir: sandboxStorageDir,
    });

    // 1. Create Sandbox
    const createdDto = await service.createSandbox({
      projectId,
      failureCaseId,
      patchProposalId,
    });

    assert.equal(createdDto.sandboxStatus, 'READY');
    assert.equal(createdDto.sourceRevision, headCommitSha);
    assert.ok(createdDto.sanitizedSandboxLocation.startsWith('[SANDBOX_ISOLATED_DIR]/sandbox-'));
    assert.equal(createdDto.originalRepoModifiedCount, 0);
    assert.equal(createdDto.originalRepoIntegrityVerified, true);

    // 2. Apply Patch inside Sandbox
    const appliedDto = await service.applyPatchToSandbox({
      projectId,
      sandboxId,
    });

    assert.equal(appliedDto.sandboxStatus, 'PATCH_APPLIED');
    assert.equal(appliedDto.patchApplied, true);
    assert.equal(appliedDto.originalRepoModifiedCount, 0);
    assert.equal(appliedDto.originalRepoIntegrityVerified, true);
    assert.ok(appliedDto.actualUnifiedDiff);
    assert.ok(appliedDto.actualUnifiedDiff.includes('src/calc.ts'));
    assert.equal(appliedDto.claimedVsActualDiffMatch, true);

    // 3. Confirm Authoritative Repo is completely untouched!
    const authorCalcContent = fs.readFileSync(path.join(repoDir, 'src', 'calc.ts'), 'utf8');
    assert.ok(
      authorCalcContent.includes('return a - b;'),
      'Authoritative repo retains original bug and was NOT modified!',
    );

    const { stdout: authorStatus } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd: repoDir,
    });
    assert.equal(authorStatus.trim(), '', 'Authoritative repo git status is completely clean!');

    // 4. Destroy Sandbox
    const destroyedDto = await service.destroySandbox({
      projectId,
      sandboxId,
    });

    assert.equal(destroyedDto.sandboxStatus, 'DESTROYED');
  });
});
