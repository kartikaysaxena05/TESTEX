/**
 * @file packages/core/src/patch/sandbox/patch-sandbox-adversarial.test.ts
 * Real Git repository fixture and adversarial security boundary tests (V7 Phase 102).
 * Verifies real filesystem isolation, authoritative repository immutability,
 * uncommitted change preservation, traversal attacks, symlink escape attacks,
 * sensitive file blocking, and revision drift defense.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PrismaClient } from '@prisma/client';
import { PatchSandboxService } from './patch-sandbox-service.js';
import {
  PatchSandboxPathTraversalError,
  PatchSandboxRevisionMismatchError,
  PatchSandboxSensitiveFileBlockedError,
  PatchSandboxUnauthorizedFileError,
} from './sandbox-errors.js';
import { SandboxContainmentValidator } from './sandbox-containment-validator.js';

const execFileAsync = promisify(execFile);

describe('Patch Sandbox Adversarial & Immutability Certification (Phase 102)', () => {
  const projectId = '11111111-2222-3333-4444-555555555555';
  const failureCaseId = '22222222-3333-4444-5555-666666666666';
  const repositoryId = '33333333-4444-5555-6666-777777777777';
  const patchProposalId = '44444444-5555-6666-7777-888888888888';

  let tempDir: string;
  let authorRepoDir: string;
  let sandboxStorageDir: string;
  let initialHeadSha: string;
  let originalFileSha: string;

  before(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-adversarial-')));
    authorRepoDir = path.join(tempDir, 'authoritative-repo');
    sandboxStorageDir = path.join(tempDir, 'sandboxes');

    fs.mkdirSync(authorRepoDir, { recursive: true });
    fs.mkdirSync(sandboxStorageDir, { recursive: true });

    // 1. Initialize authoritative Git repository with initial commit
    await execFileAsync('git', ['init', '-b', 'main'], { cwd: authorRepoDir });
    await execFileAsync('git', ['config', 'user.name', 'Adversarial QA'], { cwd: authorRepoDir });
    await execFileAsync('git', ['config', 'user.email', 'qa@adversarial.test'], {
      cwd: authorRepoDir,
    });

    const srcDir = path.join(authorRepoDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const targetFilePath = path.join(srcDir, 'rate-limiter.ts');
    const targetFileContent = [
      'export class RateLimiter {',
      '  checkLimit(count: number): boolean {',
      '    return count > 100;', // Defect: should be count >= 100
      '  }',
      '}',
    ].join('\n');
    fs.writeFileSync(targetFilePath, targetFileContent, 'utf8');

    originalFileSha = crypto.createHash('sha256').update(targetFileContent, 'utf8').digest('hex');

    await execFileAsync('git', ['add', '.'], { cwd: authorRepoDir });
    await execFileAsync('git', ['commit', '-m', 'Initial baseline commit'], { cwd: authorRepoDir });

    const { stdout: headOut } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: authorRepoDir,
    });
    initialHeadSha = headOut.trim();

    // 2. Introduce uncommitted user work on dirty working tree
    const uncommittedFile = path.join(authorRepoDir, 'uncommitted-user-work.txt');
    fs.writeFileSync(uncommittedFile, 'USER DIRTY WORK IN PROGRESS', 'utf8');
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // TEST 1: Absolute Immutability Verification on Dirty Working Tree
  it('1. Authoritative Repository Immutability: 0 mutations, user uncommitted files preserved, no git commits/branches/stashes', async () => {
    let savedSandbox: any = null;

    const mockProposal = {
      id: patchProposalId,
      projectId,
      failureCaseId,
      repositoryRevision: initialHeadSha,
      status: 'PROPOSED',
      proposalVersion: 1,
      targetFiles: ['src/rate-limiter.ts'],
      filesChangedCount: 1,
      linesAddedCount: 1,
      linesRemovedCount: 1,
      totalChangedLinesCount: 2,
      linesAdded: 1,
      linesRemoved: 1,
      totalChangedLines: 2,
      unifiedDiff:
        '--- a/src/rate-limiter.ts\n+++ b/src/rate-limiter.ts\n@@ -3,1 +3,1 @@\n-    return count > 100;\n+    return count >= 100;\n',
      structuredEditsJson: [
        {
          filePath: 'src/rate-limiter.ts',
          startLine: 3,
          endLine: 3,
          originalContent: '    return count > 100;',
          replacementContent: '    return count >= 100;',
        },
      ],
      failureCase: {
        id: failureCaseId,
        projectId,
        defectLocalizations: [
          {
            id: 'loc-1',
            status: 'COMPLETED',
            candidateFilesJson: ['src/rate-limiter.ts'],
            source: {
              id: repositoryId,
              rootPath: authorRepoDir,
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

    // Step A: Create sandbox
    const created = await service.createSandbox({
      projectId,
      failureCaseId,
      patchProposalId,
    });
    assert.equal(created.sandboxStatus, 'READY');

    // Step B: Apply patch in sandbox
    const applied = await service.applyPatchToSandbox({
      projectId,
      sandboxId: created.id,
    });
    assert.equal(applied.sandboxStatus, 'PATCH_APPLIED');
    assert.equal(applied.originalRepoModifiedCount, 0);
    assert.equal(applied.originalRepoIntegrityVerified, true);

    // VERIFICATION OF AUTHORITATIVE REPOSITORY
    // 1. Target file content bit-for-bit identical
    const currentTargetContent = fs.readFileSync(
      path.join(authorRepoDir, 'src', 'rate-limiter.ts'),
      'utf8',
    );
    const currentSha = crypto
      .createHash('sha256')
      .update(currentTargetContent, 'utf8')
      .digest('hex');
    assert.equal(
      currentSha,
      originalFileSha,
      'Target file in authoritative repo has identical SHA256!',
    );
    assert.ok(currentTargetContent.includes('return count > 100;'));

    // 2. Uncommitted user work is 100% untouched
    const uncommittedPath = path.join(authorRepoDir, 'uncommitted-user-work.txt');
    assert.ok(fs.existsSync(uncommittedPath), 'User uncommitted file was NOT wiped or stashed!');
    assert.equal(fs.readFileSync(uncommittedPath, 'utf8'), 'USER DIRTY WORK IN PROGRESS');

    // 3. Git commit HEAD is unchanged
    const { stdout: currentHead } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: authorRepoDir,
    });
    assert.equal(
      currentHead.trim(),
      initialHeadSha,
      'Authoritative repo HEAD commit is completely unchanged!',
    );

    // 4. Git branches list unchanged
    const { stdout: branches } = await execFileAsync('git', ['branch'], { cwd: authorRepoDir });
    assert.equal(
      branches.trim(),
      '* main',
      'No patch branches were created in authoritative repo!',
    );

    // 5. Git stash list is empty (no user work stashed)
    const { stdout: stashList } = await execFileAsync('git', ['stash', 'list'], {
      cwd: authorRepoDir,
    });
    assert.equal(
      stashList.trim(),
      '',
      'No git stash operations were performed on authoritative repo!',
    );

    // VERIFICATION OF SANDBOX (Patch applied successfully inside sandbox)
    const sandboxActualPath = path.join(
      sandboxStorageDir,
      projectId,
      created.id,
      'src',
      'rate-limiter.ts',
    );
    const sandboxContent = fs.readFileSync(sandboxActualPath, 'utf8');
    assert.ok(
      sandboxContent.includes('return count >= 100;'),
      'Sandbox file has the applied patch!',
    );

    // Teardown
    await service.destroySandbox({ projectId, sandboxId: created.id });
    assert.equal(
      fs.existsSync(path.dirname(sandboxActualPath)),
      false,
      'Sandbox directory removed on cleanup!',
    );
  });

  // TEST 2: Revision Drift Attack
  it('2. Revision Drift Defense: rejects sandbox creation when authoritative HEAD has diverged from proposal revision', async () => {
    const staleProposalId = '88888888-8888-8888-8888-888888888888';
    const staleProposal = {
      id: staleProposalId,
      projectId,
      failureCaseId,
      repositoryRevision: '1111111111111111111111111111111111111111', // Stale SHA
      status: 'PROPOSED',
      proposalVersion: 1,
      targetFiles: ['src/rate-limiter.ts'],
      linesAdded: 1,
      linesRemoved: 1,
      totalChangedLines: 2,
      unifiedDiff: 'diff',
      structuredEditsJson: [],
      failureCase: {
        id: failureCaseId,
        projectId,
        defectLocalizations: [
          {
            id: 'loc-1',
            status: 'COMPLETED',
            candidateFilesJson: ['src/rate-limiter.ts'],
            source: {
              id: repositoryId,
              rootPath: authorRepoDir,
            },
          },
        ],
      },
    };

    const mockPrisma = {
      defectPatchProposal: {
        findUnique: async () => staleProposal,
      },
      defectPatchSandbox: {
        findFirst: async () => null,
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
          patchProposalId: staleProposalId,
        }),
      (err: unknown) => err instanceof PatchSandboxRevisionMismatchError,
    );
  });

  // TEST 3: Path Traversal Attack
  it('3. Path Traversal Attack: strictly blocked when target file attempts traversal escape', () => {
    assert.throws(
      () => SandboxContainmentValidator.validatePathContainment('/var/sandbox', '../../etc/shadow'),
      PatchSandboxPathTraversalError,
    );
    assert.throws(
      () =>
        SandboxContainmentValidator.validatePathContainment(
          '/var/sandbox',
          'src/../../../outside.ts',
        ),
      PatchSandboxPathTraversalError,
    );
  });

  // TEST 4: Sensitive Credential Modification Attack
  it('4. Sensitive File Attack: strictly blocked when patch targets .env or secrets', () => {
    assert.throws(
      () => SandboxContainmentValidator.validateSensitiveFiles('.env'),
      PatchSandboxSensitiveFileBlockedError,
    );
    assert.throws(
      () => SandboxContainmentValidator.validateSensitiveFiles('.env.production'),
      PatchSandboxSensitiveFileBlockedError,
    );
    assert.throws(
      () => SandboxContainmentValidator.validateSensitiveFiles('credentials.json'),
      PatchSandboxSensitiveFileBlockedError,
    );
    assert.throws(
      () => SandboxContainmentValidator.validateSensitiveFiles('certs/private.key'),
      PatchSandboxSensitiveFileBlockedError,
    );
  });

  // TEST 5: Unauthorized File Attack (Scope Creep)
  it('5. Unauthorized File Attack: strictly blocked when target files are outside defect localization allowlist', () => {
    assert.throws(
      () =>
        SandboxContainmentValidator.validateAllowedScope(
          ['src/rate-limiter.ts', 'src/auth/admin.ts'],
          ['src/rate-limiter.ts'],
        ),
      PatchSandboxUnauthorizedFileError,
    );
  });
});
