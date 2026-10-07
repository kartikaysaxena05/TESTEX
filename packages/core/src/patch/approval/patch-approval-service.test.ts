/**
 * @file packages/core/src/patch/approval/patch-approval-service.test.ts
 * Core domain service unit tests for PatchApprovalService (V7 Phase 104).
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
  PatchApprovalValidationNotValidError,
  PatchApprovalNotApprovedError,
  PatchApprovalAlreadyAppliedError,
  PatchApprovalApplyFailedError,
} from './approval-errors.js';

const execFileAsync = promisify(execFile);

describe('PatchApprovalService Unit Tests', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const failureCaseId = '22222222-2222-2222-2222-222222222222';
  const patchProposalId = '33333333-3333-3333-3333-333333333333';
  const validationId = '44444444-4444-4444-4444-444444444444';
  const repositoryId = '55555555-5555-5555-5555-555555555555';
  const approvalId = '66666666-6666-6666-6666-666666666666';

  let tempDir: string;
  let repoDir: string;
  let initialCommitSha: string;

  before(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'approval-service-test-')));
    repoDir = path.join(tempDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    await execFileAsync('git', ['init', '-b', 'main'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.name', 'Test Engineer'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });

    fs.writeFileSync(
      path.join(repoDir, 'calc.ts'),
      'export function add(a: number, b: number): number {\n  return a - b;\n}\n',
      'utf8',
    );
    await execFileAsync('git', ['add', '.'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-m', 'initial commit with bug'], { cwd: repoDir });

    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoDir });
    initialCommitSha = stdout.trim();
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const structuredEdits = [
    {
      filePath: 'calc.ts',
      startLine: 2,
      endLine: 2,
      originalContent: '  return a - b;',
      replacementContent: '  return a + b;',
      explanation: 'Fix subtraction bug to addition',
    },
  ];

  const patchFingerprint = crypto
    .createHash('sha256')
    .update('calc.ts:unifiedDiff:LOW')
    .digest('hex');

  function createMockPrisma(approvalRecords: any[] = [], extraOverrides: Partial<any> = {}) {
    return {
      defectPatchValidation: {
        findUnique: async (args: any) => {
          if (args.where.id === validationId) {
            return {
              id: validationId,
              projectId,
              failureCaseId,
              patchProposalId,
              validationOutcome: 'VALID',
              baseRevision: initialCommitSha,
              patchHash: patchFingerprint,
              ...extraOverrides.validation,
            };
          }
          return null;
        },
      },
      defectPatchProposal: {
        findUnique: async (args: any) => {
          if (args.where.id === patchProposalId) {
            return {
              id: patchProposalId,
              projectId,
              failureCaseId,
              repositoryId,
              repositoryRevision: initialCommitSha,
              patchFingerprint,
              targetFiles: ['calc.ts'],
              structuredEditsJson: structuredEdits,
              ...extraOverrides.patchProposal,
            };
          }
          return null;
        },
      },
      projectSource: {
        findUnique: async (args: any) => {
          if (args.where.id === repositoryId) {
            return {
              id: repositoryId,
              projectId,
              rootPath: repoDir,
            };
          }
          return null;
        },
        findFirst: async () => ({
          id: repositoryId,
          projectId,
          rootPath: repoDir,
        }),
      },
      defectPatchApproval: {
        findFirst: async (args: any) => {
          const rec = approvalRecords.find(
            r =>
              r.projectId === args.where.projectId &&
              r.patchProposalId === args.where.patchProposalId,
          );
          return rec ?? null;
        },
        findUnique: async (args: any) => {
          const rec = approvalRecords.find(r => r.id === args.where.id);
          if (!rec) return null;
          return {
            ...rec,
            validation: {
              validationOutcome: 'VALID',
              ...extraOverrides.validation,
            },
            patchProposal: {
              id: patchProposalId,
              projectId,
              failureCaseId,
              repositoryId,
              repositoryRevision: initialCommitSha,
              patchFingerprint,
              targetFiles: ['calc.ts'],
              structuredEditsJson: structuredEdits,
              ...extraOverrides.patchProposal,
            },
          };
        },
        findMany: async () => approvalRecords,
        create: async (args: any) => {
          const created = {
            id: args.data.id ?? approvalId,
            ...args.data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          approvalRecords.push(created);
          return created;
        },
        updateMany: async () => ({ count: 0 }),
        update: async (args: any) => {
          const idx = approvalRecords.findIndex(r => r.id === args.where.id);
          if (idx >= 0) {
            approvalRecords[idx] = {
              ...approvalRecords[idx],
              ...args.data,
              updatedAt: new Date(),
            };
            return {
              ...approvalRecords[idx],
              validation: {
                validationOutcome: 'VALID',
                ...extraOverrides.validation,
              },
              patchProposal: {
                id: patchProposalId,
                projectId,
                failureCaseId,
                repositoryId,
                repositoryRevision: initialCommitSha,
                patchFingerprint,
                targetFiles: ['calc.ts'],
                structuredEditsJson: structuredEdits,
                ...extraOverrides.patchProposal,
              },
            };
          }
          throw new Error('Record not found in mock');
        },
      },
    } as unknown as PrismaClient;
  }

  it('creates an approval record in PENDING_REVIEW status for a VALID patch', async () => {
    const approvals: any[] = [];
    const prisma = createMockPrisma(approvals);
    const service = new PatchApprovalService(prisma);

    const result = await service.getOrCreateApproval({
      projectId,
      failureCaseId,
      patchProposalId,
      validationId,
      repositoryId,
    });

    assert.equal(result.status, 'PENDING_REVIEW');
    assert.equal(result.baseRevision, initialCommitSha);
    assert.equal(result.reviewedPatchHash, patchFingerprint);
    assert.equal(result.auditTrail.length, 1);
    assert.equal(result.auditTrail[0]?.eventType, 'REVIEW_OPENED');

    // Idempotent retrieval
    const second = await service.getOrCreateApproval({
      projectId,
      failureCaseId,
      patchProposalId,
      validationId,
      repositoryId,
    });
    assert.equal(second.id, result.id);
  });

  it('rejects approval creation if validation outcome is not VALID', async () => {
    const approvals: any[] = [];
    const prisma = createMockPrisma(approvals, {
      validation: { validationOutcome: 'REGRESSED' },
    });
    const service = new PatchApprovalService(prisma);

    await assert.rejects(
      () =>
        service.getOrCreateApproval({
          projectId,
          failureCaseId,
          patchProposalId,
          validationId,
        }),
      (err: any) => {
        assert(err instanceof PatchApprovalValidationNotValidError);
        assert(err.message.includes('REGRESSED'));
        return true;
      },
    );
  });

  it('approves a patch explicitly from PENDING_REVIEW to APPROVED', async () => {
    const approvals: any[] = [
      {
        id: approvalId,
        projectId,
        failureCaseId,
        patchProposalId,
        validationId,
        repositoryId,
        status: 'PENDING_REVIEW',
        baseRevision: initialCommitSha,
        reviewedPatchHash: patchFingerprint,
        auditTrailJson: [],
      },
    ];
    const prisma = createMockPrisma(approvals);
    const service = new PatchApprovalService(prisma);

    const approved = await service.approvePatch({
      projectId,
      approvalId,
      reviewComment: 'Verified diff and safety gates pass',
      reviewedBy: 'Alice QA',
    });

    assert.equal(approved.status, 'APPROVED');
    assert.equal(approved.reviewedBy, 'Alice QA');
    assert.equal(approved.reviewComment, 'Verified diff and safety gates pass');
    assert.equal(approved.auditTrail[0]?.eventType, 'APPROVED');
  });

  it('rejects patch and confirms 0 repository mutations occur', async () => {
    const originalFileContent = fs.readFileSync(path.join(repoDir, 'calc.ts'), 'utf8');
    const { stdout: commitCountBefore } = await execFileAsync(
      'git',
      ['rev-list', '--count', 'HEAD'],
      {
        cwd: repoDir,
      },
    );

    const approvals: any[] = [
      {
        id: approvalId,
        projectId,
        failureCaseId,
        patchProposalId,
        validationId,
        repositoryId,
        status: 'PENDING_REVIEW',
        baseRevision: initialCommitSha,
        reviewedPatchHash: patchFingerprint,
        auditTrailJson: [],
      },
    ];
    const prisma = createMockPrisma(approvals);
    const service = new PatchApprovalService(prisma);

    const rejected = await service.rejectPatch({
      projectId,
      approvalId,
      rejectionReason: 'INCORRECT_FIX',
      rejectionDetails: 'Wrong mathematical operation',
      reviewedBy: 'Senior Architect',
    });

    assert.equal(rejected.status, 'REJECTED');
    assert.equal(rejected.rejectionReason, 'INCORRECT_FIX');
    assert.equal(rejected.rejectionDetails, 'Wrong mathematical operation');

    // VERIFY ZERO REPOSITORY MUTATIONS
    const afterFileContent = fs.readFileSync(path.join(repoDir, 'calc.ts'), 'utf8');
    assert.equal(
      afterFileContent,
      originalFileContent,
      'File content must remain completely identical',
    );

    const { stdout: commitCountAfter } = await execFileAsync(
      'git',
      ['rev-list', '--count', 'HEAD'],
      {
        cwd: repoDir,
      },
    );
    assert.equal(
      commitCountAfter.trim(),
      commitCountBefore.trim(),
      'Git commits must remain unchanged',
    );
  });

  it('refuses to apply patch if status is not APPROVED (unapproved gate enforcement)', async () => {
    const approvals: any[] = [
      {
        id: approvalId,
        projectId,
        failureCaseId,
        patchProposalId,
        validationId,
        repositoryId,
        status: 'PENDING_REVIEW',
        baseRevision: initialCommitSha,
        reviewedPatchHash: patchFingerprint,
        auditTrailJson: [],
      },
    ];
    const prisma = createMockPrisma(approvals);
    const service = new PatchApprovalService(prisma);

    await assert.rejects(
      () =>
        service.applyPatch({
          projectId,
          approvalId,
        }),
      (err: any) => {
        assert(err instanceof PatchApprovalNotApprovedError);
        assert(err.message.includes('PENDING_REVIEW'));
        return true;
      },
    );
  });

  it('applies an APPROVED patch atomically to the workspace files and records zero git commits', async () => {
    // Reset file to original buggy state
    fs.writeFileSync(
      path.join(repoDir, 'calc.ts'),
      'export function add(a: number, b: number): number {\n  return a - b;\n}\n',
      'utf8',
    );

    const { stdout: gitLogBefore } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: repoDir,
    });

    const approvals: any[] = [
      {
        id: approvalId,
        projectId,
        failureCaseId,
        patchProposalId,
        validationId,
        repositoryId,
        status: 'APPROVED',
        baseRevision: initialCommitSha,
        reviewedPatchHash: patchFingerprint,
        auditTrailJson: [
          { id: '1', eventType: 'APPROVED', timestamp: new Date().toISOString(), actor: 'tester' },
        ],
      },
    ];
    const prisma = createMockPrisma(approvals);
    const service = new PatchApprovalService(prisma);

    const applied = await service.applyPatch({
      projectId,
      approvalId,
      appliedBy: 'Release Manager',
    });

    assert.equal(applied.status, 'APPLIED');
    assert.equal(applied.appliedPatchHash, patchFingerprint);
    assert.equal(applied.filesModifiedCount, 1);
    assert.deepEqual(applied.affectedFiles, ['calc.ts']);

    // Check disk content: must be patched to `return a + b;`
    const patchedContent = fs.readFileSync(path.join(repoDir, 'calc.ts'), 'utf8');
    assert(
      patchedContent.includes('return a + b;'),
      'File on disk must have the patched content applied',
    );

    // Check git commits: strictly 0 new commits made
    const { stdout: gitLogAfter } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: repoDir,
    });
    assert.equal(
      gitLogAfter.trim(),
      gitLogBefore.trim(),
      'Strictly ZERO git commits or pushes must be made during apply',
    );
  });

  it('blocks double apply if patch was already applied', async () => {
    const approvals: any[] = [
      {
        id: approvalId,
        projectId,
        failureCaseId,
        patchProposalId,
        validationId,
        repositoryId,
        status: 'APPLIED',
        baseRevision: initialCommitSha,
        reviewedPatchHash: patchFingerprint,
        auditTrailJson: [],
      },
    ];
    const prisma = createMockPrisma(approvals);
    const service = new PatchApprovalService(prisma);

    await assert.rejects(
      () =>
        service.applyPatch({
          projectId,
          approvalId,
        }),
      (err: any) => {
        assert(err instanceof PatchApprovalAlreadyAppliedError);
        return true;
      },
    );
  });

  it('blocks apply and rolls back in-memory changes if a file edit conflicts with disk', async () => {
    // Write unexpected content to file
    fs.writeFileSync(
      path.join(repoDir, 'calc.ts'),
      'export function add(a: number, b: number): number {\n  return a * b;\n}\n',
      'utf8',
    );

    const approvals: any[] = [
      {
        id: approvalId,
        projectId,
        failureCaseId,
        patchProposalId,
        validationId,
        repositoryId,
        status: 'APPROVED',
        baseRevision: initialCommitSha,
        reviewedPatchHash: patchFingerprint,
        auditTrailJson: [],
      },
    ];
    const prisma = createMockPrisma(approvals);
    const service = new PatchApprovalService(prisma);

    await assert.rejects(
      () =>
        service.applyPatch({
          projectId,
          approvalId,
        }),
      (err: any) => {
        assert(err instanceof PatchApprovalApplyFailedError);
        assert(err.message.includes('Patch conflict'));
        return true;
      },
    );

    // Verify file content was untouched/preserved
    const preservedContent = fs.readFileSync(path.join(repoDir, 'calc.ts'), 'utf8');
    assert(preservedContent.includes('return a * b;'));
  });
});
