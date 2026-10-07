/**
 * @file packages/core/src/patch/approval/patch-approval-adversarial.test.ts
 * Adversarial, security boundary, drift, tampering, and race condition tests for PatchApprovalService (V7 Phase 104).
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
import { PatchApplicator } from './patch-applicator.js';
import {
  PatchApprovalCrossProjectError,
  PatchApprovalValidationNotValidError,
  PatchApprovalHashMismatchError,
  PatchApprovalRepositoryDriftError,
  PatchApprovalScopeViolationError,
  PatchApprovalConcurrentMutationError,
} from './approval-errors.js';

const execFileAsync = promisify(execFile);

describe('Patch Approval Adversarial & Security Boundary Tests', () => {
  const tenantA = '11111111-1111-1111-1111-111111111111';
  const attackerTenantB = '99999999-9999-9999-9999-999999999999';
  const failureCaseId = '22222222-2222-2222-2222-222222222222';
  const patchProposalId = '33333333-3333-3333-3333-333333333333';
  const validationId = '44444444-4444-4444-4444-444444444444';
  const repositoryId = '55555555-5555-5555-5555-555555555555';
  const approvalId = '66666666-6666-6666-6666-666666666666';

  let tempDir: string;
  let repoDir: string;
  let initialCommitSha: string;

  before(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'approval-adv-test-')));
    repoDir = path.join(tempDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    await execFileAsync('git', ['init', '-b', 'main'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.name', 'Adversarial Tester'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.email', 'adv@example.com'], { cwd: repoDir });

    fs.writeFileSync(
      path.join(repoDir, 'service.ts'),
      'export function processData() {\n  return "v1";\n}\n',
      'utf8',
    );
    await execFileAsync('git', ['add', '.'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-m', 'initial commit'], { cwd: repoDir });

    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoDir });
    initialCommitSha = stdout.trim();
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const structuredEdits = [
    {
      filePath: 'service.ts',
      startLine: 2,
      endLine: 2,
      originalContent: '  return "v1";',
      replacementContent: '  return "v2";',
      explanation: 'Upgrade to v2',
    },
  ];

  const patchFingerprint = crypto.createHash('sha256').update('service.ts:diff:LOW').digest('hex');

  function createMockPrisma(approvalRecord: any, extraOverrides: Partial<any> = {}) {
    return {
      defectPatchValidation: {
        findUnique: async () => ({
          id: validationId,
          projectId: tenantA,
          failureCaseId,
          patchProposalId,
          validationOutcome: 'VALID',
          baseRevision: initialCommitSha,
          patchHash: patchFingerprint,
          ...extraOverrides.validation,
        }),
      },
      defectPatchProposal: {
        findUnique: async () => ({
          id: patchProposalId,
          projectId: tenantA,
          failureCaseId,
          repositoryId,
          repositoryRevision: initialCommitSha,
          patchFingerprint,
          targetFiles: ['service.ts'],
          structuredEditsJson: structuredEdits,
          ...extraOverrides.patchProposal,
        }),
      },
      projectSource: {
        findUnique: async () => ({
          id: repositoryId,
          projectId: tenantA,
          rootPath: repoDir,
        }),
        findFirst: async () => ({
          id: repositoryId,
          projectId: tenantA,
          rootPath: repoDir,
        }),
      },
      defectPatchApproval: {
        findUnique: async (args: any) => {
          if (args.where.id !== approvalRecord.id) return null;
          return {
            ...approvalRecord,
            validation: {
              validationOutcome: 'VALID',
              ...extraOverrides.validation,
            },
            patchProposal: {
              id: patchProposalId,
              projectId: tenantA,
              failureCaseId,
              repositoryId,
              repositoryRevision: initialCommitSha,
              patchFingerprint,
              targetFiles: ['service.ts'],
              structuredEditsJson: structuredEdits,
              ...extraOverrides.patchProposal,
            },
          };
        },
        update: async (args: any) => ({
          ...approvalRecord,
          ...args.data,
          validation: {
            validationOutcome: 'VALID',
            ...extraOverrides.validation,
          },
          patchProposal: {
            id: patchProposalId,
            projectId: tenantA,
            failureCaseId,
            repositoryId,
            repositoryRevision: initialCommitSha,
            patchFingerprint,
            targetFiles: ['service.ts'],
            structuredEditsJson: structuredEdits,
            ...extraOverrides.patchProposal,
          },
        }),
      },
    } as unknown as PrismaClient;
  }

  it('thwarts cross-project forgery attack on approval', async () => {
    const approval = {
      id: approvalId,
      projectId: tenantA,
      failureCaseId,
      patchProposalId,
      validationId,
      repositoryId,
      status: 'PENDING_REVIEW',
      baseRevision: initialCommitSha,
      reviewedPatchHash: patchFingerprint,
      auditTrailJson: [],
    };

    const prisma = createMockPrisma(approval);
    const service = new PatchApprovalService(prisma);

    await assert.rejects(
      () =>
        service.approvePatch({
          projectId: attackerTenantB,
          approvalId,
        }),
      (err: any) => {
        assert(err instanceof PatchApprovalCrossProjectError);
        assert(err.message.includes('Cross-project forbidden'));
        return true;
      },
    );
  });

  it('thwarts cross-project forgery attack on rejection', async () => {
    const approval = {
      id: approvalId,
      projectId: tenantA,
      failureCaseId,
      patchProposalId,
      validationId,
      repositoryId,
      status: 'PENDING_REVIEW',
      baseRevision: initialCommitSha,
      reviewedPatchHash: patchFingerprint,
      auditTrailJson: [],
    };

    const prisma = createMockPrisma(approval);
    const service = new PatchApprovalService(prisma);

    await assert.rejects(
      () =>
        service.rejectPatch({
          projectId: attackerTenantB,
          approvalId,
          rejectionReason: 'OTHER',
        }),
      (err: any) => {
        assert(err instanceof PatchApprovalCrossProjectError);
        return true;
      },
    );
  });

  it('thwarts cross-project forgery attack on apply', async () => {
    const approval = {
      id: approvalId,
      projectId: tenantA,
      failureCaseId,
      patchProposalId,
      validationId,
      repositoryId,
      status: 'APPROVED',
      baseRevision: initialCommitSha,
      reviewedPatchHash: patchFingerprint,
      auditTrailJson: [],
    };

    const prisma = createMockPrisma(approval);
    const service = new PatchApprovalService(prisma);

    await assert.rejects(
      () =>
        service.applyPatch({
          projectId: attackerTenantB,
          approvalId,
        }),
      (err: any) => {
        assert(err instanceof PatchApprovalCrossProjectError);
        return true;
      },
    );
  });

  it('thwarts patch tampering attack (hash mismatch between reviewed and current patch)', async () => {
    const approval = {
      id: approvalId,
      projectId: tenantA,
      failureCaseId,
      patchProposalId,
      validationId,
      repositoryId,
      status: 'APPROVED',
      baseRevision: initialCommitSha,
      reviewedPatchHash: patchFingerprint, // Approved for hash A
      auditTrailJson: [],
    };

    // Proposal was tampered with in DB after approval!
    const tamperedFingerprint = 'tampered-evil-hash-999';
    const prisma = createMockPrisma(approval, {
      patchProposal: {
        patchFingerprint: tamperedFingerprint,
      },
    });
    const service = new PatchApprovalService(prisma);

    await assert.rejects(
      () =>
        service.applyPatch({
          projectId: tenantA,
          approvalId,
        }),
      (err: any) => {
        assert(err instanceof PatchApprovalHashMismatchError);
        assert(err.message.includes('Patch immutability violation'));
        return true;
      },
    );
  });

  it('thwarts repository base drift attack (Git HEAD advanced after review)', async () => {
    const staleRevision = 'stale-older-commit-sha-000';
    const approval = {
      id: approvalId,
      projectId: tenantA,
      failureCaseId,
      patchProposalId,
      validationId,
      repositoryId,
      status: 'APPROVED',
      baseRevision: staleRevision, // reviewed against stale revision
      reviewedPatchHash: patchFingerprint,
      auditTrailJson: [],
    };

    const prisma = createMockPrisma(approval);
    const service = new PatchApprovalService(prisma);

    await assert.rejects(
      () =>
        service.applyPatch({
          projectId: tenantA,
          approvalId,
        }),
      (err: any) => {
        assert(err instanceof PatchApprovalRepositoryDriftError);
        assert(err.message.includes('drifted'));
        return true;
      },
    );
  });

  it('thwarts approving non-VALID validation outcomes (INVALID or REGRESSED)', async () => {
    const approval = {
      id: approvalId,
      projectId: tenantA,
      failureCaseId,
      patchProposalId,
      validationId,
      repositoryId,
      status: 'PENDING_REVIEW',
      baseRevision: initialCommitSha,
      reviewedPatchHash: patchFingerprint,
      auditTrailJson: [],
    };

    const prisma = createMockPrisma(approval, {
      validation: { validationOutcome: 'REGRESSED' },
    });
    const service = new PatchApprovalService(prisma);

    await assert.rejects(
      () =>
        service.approvePatch({
          projectId: tenantA,
          approvalId,
        }),
      (err: any) => {
        assert(err instanceof PatchApprovalValidationNotValidError);
        assert(err.message.includes('REGRESSED'));
        return true;
      },
    );
  });

  it('thwarts path traversal attack in targetFiles via PatchApplicator', () => {
    assert.throws(
      () =>
        PatchApplicator.applyPatchToWorkspace({
          workspaceRoot: repoDir,
          structuredEdits: [
            {
              filePath: '../../etc/passwd',
              startLine: 1,
              endLine: 1,
              originalContent: 'root:x:0:0',
              replacementContent: 'root:x:0:0:hacked',
            },
          ],
          targetFiles: ['../../etc/passwd'],
          allowedFiles: ['../../etc/passwd'],
        }),
      (err: any) => {
        assert(
          err.message.includes('traversal') ||
            err.message.includes('outside') ||
            err.message.includes('scope'),
        );
        return true;
      },
    );
  });

  it('thwarts unauthorized scope expansion via PatchApplicator', () => {
    assert.throws(
      () =>
        PatchApplicator.applyPatchToWorkspace({
          workspaceRoot: repoDir,
          structuredEdits: [
            {
              filePath: 'unapproved_secret.ts',
              startLine: 1,
              endLine: 1,
              originalContent: 'secret',
              replacementContent: 'public',
            },
          ],
          targetFiles: ['unapproved_secret.ts'],
          allowedFiles: ['service.ts'], // unapproved_secret.ts is NOT in allowedFiles
        }),
      (err: any) => {
        assert(err instanceof PatchApprovalScopeViolationError);
        return true;
      },
    );
  });

  it('thwarts symlink escape attack via PatchApplicator', () => {
    const outsideTarget = path.join(tempDir, 'outside.txt');
    fs.writeFileSync(outsideTarget, 'outside content', 'utf8');

    const symlinkInRepo = path.join(repoDir, 'symlink_escape.ts');
    try {
      fs.symlinkSync(outsideTarget, symlinkInRepo);
    } catch {
      // Ignore if symlink not supported on environment
      return;
    }

    assert.throws(
      () =>
        PatchApplicator.applyPatchToWorkspace({
          workspaceRoot: repoDir,
          structuredEdits: [
            {
              filePath: 'symlink_escape.ts',
              startLine: 1,
              endLine: 1,
              originalContent: 'outside content',
              replacementContent: 'corrupted',
            },
          ],
          targetFiles: ['symlink_escape.ts'],
          allowedFiles: ['symlink_escape.ts'],
        }),
      (err: any) => {
        assert(
          err.message.includes('Symlink') ||
            err.message.includes('escape') ||
            err.message.includes('sandbox'),
        );
        return true;
      },
    );
  });

  it('thwarts concurrent mutation race conditions on applyPatch', async () => {
    const approval = {
      id: approvalId,
      projectId: tenantA,
      failureCaseId,
      patchProposalId,
      validationId,
      repositoryId,
      status: 'APPROVED',
      baseRevision: initialCommitSha,
      reviewedPatchHash: patchFingerprint,
      auditTrailJson: [],
    };

    let delayResolve: () => void;
    const delayPromise = new Promise<void>(r => {
      delayResolve = r;
    });

    const prisma = {
      ...createMockPrisma(approval),
      defectPatchApproval: {
        findUnique: async () => {
          await delayPromise;
          return {
            ...approval,
            validation: { validationOutcome: 'VALID' },
            patchProposal: {
              id: patchProposalId,
              projectId: tenantA,
              failureCaseId,
              repositoryId,
              repositoryRevision: initialCommitSha,
              patchFingerprint,
              targetFiles: ['service.ts'],
              structuredEditsJson: structuredEdits,
            },
          };
        },
      },
    } as unknown as PrismaClient;

    const service = new PatchApprovalService(prisma);

    // Launch first apply (which suspends on delayPromise)
    const firstApply = service.applyPatch({ projectId: tenantA, approvalId });

    // Launch second apply concurrently
    const secondApply = service.applyPatch({ projectId: tenantA, approvalId });

    await assert.rejects(secondApply, (err: any) => {
      assert(err instanceof PatchApprovalConcurrentMutationError);
      return true;
    });

    delayResolve!();
    try {
      await firstApply;
    } catch {
      // Ignored for race test
    }
  });
});
