/**
 * @file packages/core/src/patch/approval/patch-approval-real-certification.test.ts
 * Real file fixture, repository binding, and lifecycle certification tests for V7 Phase 104.
 * Exercises real Git repositories, real files on disk, real atomic writes,
 * and proves 0 automatic commits, zero mutations on rejection, and immutability.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PrismaClient } from '@prisma/client';
import { PatchApprovalService } from './patch-approval-service.js';
import {
  PatchApprovalNotApprovedError,
  PatchApprovalRepositoryDriftError,
} from './approval-errors.js';

const execFileAsync = promisify(execFile);

describe('Patch Approval Real Certification Test Suite', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const failureCaseId = '22222222-2222-2222-2222-222222222222';
  const patchProposalId = '33333333-3333-3333-3333-333333333333';
  const validationId = '44444444-4444-4444-4444-444444444444';
  const repositoryId = '55555555-5555-5555-5555-555555555555';
  const approvalId = '66666666-6666-6666-6666-666666666666';

  let tempDir: string;
  let repoDir: string;
  let commitC1: string;

  before(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'approval-cert-test-')));
    repoDir = path.join(tempDir, 'certified-repo');
    fs.mkdirSync(repoDir, { recursive: true });

    // Initialize real git repo
    await execFileAsync('git', ['init', '-b', 'main'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.name', 'Certification Lead'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.email', 'cert@example.com'], { cwd: repoDir });

    // Create real buggy file
    const buggyCode = [
      'export function calculateTotal(items: number[]): number {',
      '  return items.reduce((acc, val) => acc - val, 0);',
      '}',
      '',
    ].join('\n');

    fs.writeFileSync(path.join(repoDir, 'calc.ts'), buggyCode, 'utf8');
    await execFileAsync('git', ['add', '.'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-m', 'Add buggy calculateTotal function'], {
      cwd: repoDir,
    });

    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoDir });
    commitC1 = stdout.trim();
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const structuredEdits = [
    {
      filePath: 'calc.ts',
      startLine: 2,
      endLine: 2,
      originalContent: '  return items.reduce((acc, val) => acc - val, 0);',
      replacementContent: '  return items.reduce((acc, val) => acc + val, 0);',
      explanation: 'Fix subtraction bug to addition',
    },
  ];

  const patchFingerprint = crypto
    .createHash('sha256')
    .update('calc.ts:fix-subtraction:LOW')
    .digest('hex');

  function createMockPrisma(approvalRecord: any) {
    return {
      defectPatchValidation: {
        findUnique: async () => ({
          id: validationId,
          projectId,
          failureCaseId,
          patchProposalId,
          validationOutcome: 'VALID',
          baseRevision: commitC1,
          patchHash: patchFingerprint,
        }),
      },
      defectPatchProposal: {
        findUnique: async () => ({
          id: patchProposalId,
          projectId,
          failureCaseId,
          repositoryId,
          repositoryRevision: commitC1,
          patchFingerprint,
          targetFiles: ['calc.ts'],
          structuredEditsJson: structuredEdits,
        }),
      },
      projectSource: {
        findUnique: async () => ({
          id: repositoryId,
          projectId,
          rootPath: repoDir,
        }),
        findFirst: async () => ({
          id: repositoryId,
          projectId,
          rootPath: repoDir,
        }),
      },
      defectPatchApproval: {
        findFirst: async () => approvalRecord,
        findUnique: async () => ({
          ...approvalRecord,
          validation: {
            validationOutcome: 'VALID',
            baseRevision: commitC1,
            patchHash: patchFingerprint,
          },
          patchProposal: {
            id: patchProposalId,
            projectId,
            failureCaseId,
            repositoryId,
            repositoryRevision: commitC1,
            patchFingerprint,
            targetFiles: ['calc.ts'],
            structuredEditsJson: structuredEdits,
          },
        }),
        update: async (args: any) => {
          Object.assign(approvalRecord, args.data);
          return {
            ...approvalRecord,
            validation: {
              validationOutcome: 'VALID',
              baseRevision: commitC1,
              patchHash: patchFingerprint,
            },
            patchProposal: {
              id: patchProposalId,
              projectId,
              failureCaseId,
              repositoryId,
              repositoryRevision: commitC1,
              patchFingerprint,
              targetFiles: ['calc.ts'],
              structuredEditsJson: structuredEdits,
            },
          };
        },
      },
    } as unknown as PrismaClient;
  }

  it('certifies end-to-end Human Approval and Controlled Apply workflow with 0 git commits', async () => {
    const approval = {
      id: approvalId,
      projectId,
      failureCaseId,
      patchProposalId,
      validationId,
      repositoryId,
      status: 'PENDING_REVIEW',
      baseRevision: commitC1,
      reviewedPatchHash: patchFingerprint,
      auditTrailJson: [],
    };

    const prisma = createMockPrisma(approval);
    const service = new PatchApprovalService(prisma);

    // 1. Verify Unapproved Apply is strictly blocked
    await assert.rejects(
      () => service.applyPatch({ projectId, approvalId }),
      (err: any) => {
        assert(err instanceof PatchApprovalNotApprovedError);
        return true;
      },
    );

    // 2. Human explicitly approves patch
    const approved = await service.approvePatch({
      projectId,
      approvalId,
      reviewedBy: 'Certification Engineer',
      reviewComment: 'Verified diff: acc - val changed to acc + val',
    });
    assert.equal(approved.status, 'APPROVED');
    assert.equal(approved.reviewedBy, 'Certification Engineer');

    // 3. Human explicitly triggers controlled apply
    const applied = await service.applyPatch({
      projectId,
      approvalId,
      appliedBy: 'Certification Engineer',
    });

    assert.equal(applied.status, 'APPLIED');
    assert.equal(applied.filesModifiedCount, 1);
    assert.equal(applied.linesAdded, 1);
    assert.equal(applied.linesRemoved, 1);

    // 4. Verify Disk Changes: File is actually repaired on disk!
    const diskContent = fs.readFileSync(path.join(repoDir, 'calc.ts'), 'utf8');
    assert(
      diskContent.includes('return items.reduce((acc, val) => acc + val, 0);'),
      'The file on disk must reflect the approved repaired content',
    );
    assert(!diskContent.includes('acc - val'), 'The buggy subtraction must be gone');

    // 5. Verify Git Invariant: Strictly ZERO git commits or pushes made
    const { stdout: currentHead } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: repoDir,
    });
    assert.equal(
      currentHead.trim(),
      commitC1,
      'Git HEAD commit must remain completely unchanged (0 automatic commits)',
    );

    // 6. Verify Git Status: File is modified in working directory for human inspection
    const { stdout: gitStatus } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd: repoDir,
    });
    assert(
      gitStatus.includes('M calc.ts'),
      'Working directory must reflect uncommitted changes for review',
    );
  });

  it('certifies Human Rejection workflow leaves source code 100% untouched (0 mutations)', async () => {
    // Write new file to repo and commit
    fs.writeFileSync(
      path.join(repoDir, 'logic.ts'),
      'export function isReady() {\n  return false;\n}\n',
      'utf8',
    );
    await execFileAsync('git', ['add', 'logic.ts'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-m', 'Add logic.ts'], { cwd: repoDir });
    const { stdout: headAfterCommit } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: repoDir,
    });
    const logicCommitSha = headAfterCommit.trim();

    const originalLogicBytes = fs.readFileSync(path.join(repoDir, 'logic.ts'));

    const rejectionApprovalId = '77777777-7777-7777-7777-777777777777';
    const rejectionApproval = {
      id: rejectionApprovalId,
      projectId,
      failureCaseId,
      patchProposalId,
      validationId,
      repositoryId,
      status: 'PENDING_REVIEW',
      baseRevision: logicCommitSha,
      reviewedPatchHash: 'hash-for-rejection',
      auditTrailJson: [],
    };

    const prisma = createMockPrisma(rejectionApproval);
    const service = new PatchApprovalService(prisma);

    // Human Rejects
    const rejected = await service.rejectPatch({
      projectId,
      approvalId: rejectionApprovalId,
      rejectionReason: 'INCORRECT_FIX',
      rejectionDetails: 'We prefer to keep isReady returning false for now.',
      reviewedBy: 'Staff Engineer',
    });

    assert.equal(rejected.status, 'REJECTED');
    assert.equal(rejected.rejectionReason, 'INCORRECT_FIX');

    // VERIFY ZERO REPOSITORY MUTATIONS:
    const postRejectionBytes = fs.readFileSync(path.join(repoDir, 'logic.ts'));
    assert(
      originalLogicBytes.equals(postRejectionBytes),
      'File content must remain bit-for-bit identical after rejection',
    );

    // Verify apply is impossible on a rejected patch
    await assert.rejects(
      () => service.applyPatch({ projectId, approvalId: rejectionApprovalId }),
      (err: any) => {
        assert(err instanceof PatchApprovalNotApprovedError);
        assert(err.message.includes('REJECTED'));
        return true;
      },
    );
  });

  it('certifies Repository Base Drift defense blocks apply if repo moved forward', async () => {
    const driftApprovalId = '88888888-8888-8888-8888-888888888888';
    const driftApproval = {
      id: driftApprovalId,
      projectId,
      failureCaseId,
      patchProposalId,
      validationId,
      repositoryId,
      status: 'APPROVED',
      baseRevision: commitC1, // Approved against initial commit C1
      reviewedPatchHash: patchFingerprint,
      auditTrailJson: [],
    };

    // But git repo has since moved forward to new commits!
    const { stdout: currentHead } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: repoDir,
    });
    assert.notEqual(
      currentHead.trim(),
      commitC1,
      'Precondition: Repo has diverged from baseRevision C1',
    );

    const prisma = createMockPrisma(driftApproval);
    const service = new PatchApprovalService(prisma);

    await assert.rejects(
      () => service.applyPatch({ projectId, approvalId: driftApprovalId }),
      (err: any) => {
        assert(err instanceof PatchApprovalRepositoryDriftError);
        assert(err.message.includes('drifted'));
        return true;
      },
    );
  });
});
