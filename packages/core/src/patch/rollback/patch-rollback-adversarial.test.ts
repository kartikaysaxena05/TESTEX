/**
 * @file packages/core/src/patch/rollback/patch-rollback-adversarial.test.ts
 * Adversarial, conflict, and edge-case tests for PatchRollbackService (V7 Phase 105).
 */

import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PatchRollbackService } from './patch-rollback-service.js';
import {
  PatchRollbackConflictError,
  PatchRollbackConcurrentMutationError,
  PatchRollbackRecoveryFailedError,
} from './rollback-errors.js';
import { RollbackConflictDetector } from './rollback-conflict-detector.js';
import { RollbackRecoveryManager } from './rollback-recovery-manager.js';

const execFileAsync = promisify(execFile);

describe('PatchRollbackService Adversarial & Conflict Tests', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const failureCaseId = '22222222-2222-2222-2222-222222222222';
  const patchProposalId = '33333333-3333-3333-3333-333333333333';
  const repositoryId = '55555555-5555-5555-5555-555555555555';
  const approvalId = '66666666-6666-6666-6666-666666666666';

  let tempDir: string;
  let repoDir: string;
  let initialCommitSha: string;

  const s0Content = 'export function add(a: number, b: number): number {\n  return a - b;\n}\n';
  const s1Content = 'export function add(a: number, b: number): number {\n  return a + b;\n}\n';

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

  before(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-adversarial-test-')));
    repoDir = path.join(tempDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    await execFileAsync('git', ['init', '-b', 'main'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.name', 'Test Engineer'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });

    fs.writeFileSync(path.join(repoDir, 'calc.ts'), s0Content, 'utf8');
    await execFileAsync('git', ['add', '.'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-m', 'initial commit with bug'], { cwd: repoDir });

    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoDir });
    initialCommitSha = stdout.trim();
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    fs.writeFileSync(path.join(repoDir, 'calc.ts'), s1Content, 'utf8');
  });

  function createMockPrisma(
    approvalRecords: any[] = [],
    rollbackRecords: any[] = [],
    extraApprovals: any[] = [],
  ) {
    const rollbacks = [...rollbackRecords];
    const approvals = [...approvalRecords];

    return {
      defectPatchApproval: {
        findUnique: async (args: any) => {
          const rec = approvals.find(r => r.id === args.where.id);
          if (!rec) return null;
          return {
            ...rec,
            patchProposal: {
              id: patchProposalId,
              projectId,
              failureCaseId,
              repositoryId,
              targetFiles: ['calc.ts'],
              structuredEditsJson: structuredEdits,
            },
            failureCase: {
              id: failureCaseId,
              projectId,
              testCaseId: 'test-1',
              testCaseVersionNumber: 1,
              testRunId: 'run-1',
            },
            repository: {
              id: repositoryId,
              projectId,
              rootPath: repoDir,
            },
          };
        },
        findMany: async (args: any) => {
          if (extraApprovals.length > 0) {
            return extraApprovals;
          }
          if (args.where?.appliedAt?.gt) {
            return approvals.filter(
              a => a.status === 'APPLIED' && a.appliedAt > args.where.appliedAt.gt,
            );
          }
          return approvals;
        },
        update: async (args: any) => {
          const idx = approvals.findIndex(r => r.id === args.where.id);
          if (idx !== -1) {
            approvals[idx] = { ...approvals[idx], ...args.data };
            return approvals[idx];
          }
          return args.data;
        },
      },
      defectPatchRollback: {
        findUnique: async (args: any) => {
          const rec = rollbacks.find(r => r.id === args.where.id);
          if (!rec) return null;
          return {
            ...rec,
            patchApproval: {
              id: approvalId,
              projectId,
              repository: { rootPath: repoDir },
            },
          };
        },
        findFirst: async (args: any) => {
          return rollbacks[0] ?? null;
        },
        findMany: async () => rollbacks,
        create: async (args: any) => {
          const created = {
            id: args.data.id ?? crypto.randomUUID(),
            ...args.data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          rollbacks.push(created);
          return created;
        },
        update: async (args: any) => {
          const idx = rollbacks.findIndex(r => r.id === args.where.id);
          if (idx !== -1) {
            rollbacks[idx] = { ...rollbacks[idx], ...args.data };
            return rollbacks[idx];
          }
          return args.data;
        },
      },
      projectSource: {
        findUnique: async () => ({ id: repositoryId, projectId, rootPath: repoDir }),
        findFirst: async () => ({ id: repositoryId, projectId, rootPath: repoDir }),
      },
      testRun: {
        findUnique: async () => null,
        create: async (args: any) => ({ id: crypto.randomUUID(), ...args.data }),
      },
    };
  }

  it('detects OVERLAPPING_USER_CHANGES when user edits lines modified by the patch and blocks rollback', async () => {
    // Overwrite the patch line with conflicting user content
    const conflictingContent =
      'export function add(a: number, b: number): number {\n  return a * b + 42; // USER OVERLAP\n}\n';
    fs.writeFileSync(path.join(repoDir, 'calc.ts'), conflictingContent, 'utf8');

    const mockApproval = {
      id: approvalId,
      projectId,
      failureCaseId,
      patchProposalId,
      status: 'APPLIED',
      appliedAt: new Date(),
      reviewedPatchHash: 'hash1',
      affectedFiles: ['calc.ts'],
    };

    const mockPrisma = createMockPrisma([mockApproval]);
    const service = new PatchRollbackService(mockPrisma as any);

    // 1. Dry run returns canRollback: false with conflict
    const plan = await service.planRollback({ projectId, approvalId });
    assert.equal(plan.canRollback, false);
    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.conflicts[0]?.type, 'OVERLAPPING_USER_CHANGES');

    // 2. Execute throws PatchRollbackConflictError and creates CONFLICT_BLOCKED record
    await assert.rejects(
      () => service.executeRollback({ projectId, approvalId }),
      (err: any) => {
        assert.ok(err instanceof PatchRollbackConflictError);
        assert.equal(err.conflictType, 'OVERLAPPING_USER_CHANGES');
        return true;
      },
    );

    // Verify file on disk was NOT corrupted or overwritten
    const currentOnDisk = fs.readFileSync(path.join(repoDir, 'calc.ts'), 'utf8');
    assert.equal(currentOnDisk, conflictingContent);
  });

  it('detects FILE_DELETED when target file is missing and blocks rollback', async () => {
    // Delete target file
    fs.rmSync(path.join(repoDir, 'calc.ts'), { force: true });

    const mockApproval = {
      id: approvalId,
      projectId,
      failureCaseId,
      patchProposalId,
      status: 'APPLIED',
      appliedAt: new Date(),
      reviewedPatchHash: 'hash1',
      affectedFiles: ['calc.ts'],
    };

    const mockPrisma = createMockPrisma([mockApproval]);
    const service = new PatchRollbackService(mockPrisma as any);

    const plan = await service.planRollback({ projectId, approvalId });
    assert.equal(plan.canRollback, false);
    assert.equal(plan.conflicts[0]?.type, 'FILE_DELETED');

    await assert.rejects(
      () => service.executeRollback({ projectId, approvalId }),
      PatchRollbackConflictError,
    );
  });

  it('detects NEWER_PATCH_CONFLICT when a newer patch modified the same file', async () => {
    const mockApproval = {
      id: approvalId,
      projectId,
      failureCaseId,
      patchProposalId,
      status: 'APPLIED',
      appliedAt: new Date('2026-09-10T10:00:00Z'),
      reviewedPatchHash: 'hash1',
      affectedFiles: ['calc.ts'],
    };

    const newerApproval = {
      id: '88888888-8888-8888-8888-888888888888',
      affectedFiles: ['calc.ts'],
      appliedAt: new Date('2026-09-11T12:00:00Z'),
    };

    const mockPrisma = createMockPrisma([mockApproval], [], [newerApproval]);
    const service = new PatchRollbackService(mockPrisma as any);

    // Even if edits look like they match on disk, newer patch conflict blocks it
    const plan = RollbackConflictDetector.detectConflicts({
      workspaceRoot: repoDir,
      targetFiles: ['calc.ts'],
      structuredEdits,
      newerAppliedApprovals: [newerApproval],
    });

    assert.equal(plan.canRollback, false);
    assert.equal(plan.conflicts[0]?.type, 'NEWER_PATCH_CONFLICT');
  });

  it('recovers files from recovery point when interrupted rollback status is RECOVERY_REQUIRED', async () => {
    // 1. Create a recovery point with pre-rollback snapshot
    const snapshot = RollbackRecoveryManager.createRecoveryPoint(repoDir, ['calc.ts']);

    // 2. Corrupt or modify calc.ts to simulate interrupted state
    fs.writeFileSync(path.join(repoDir, 'calc.ts'), '// CORRUPTED HALF-WRITTEN FILE\n', 'utf8');

    const validRollbackId = '88888888-8888-8888-8888-888888888888';
    const rollbackRecord = {
      id: validRollbackId,
      projectId,
      patchApprovalId: approvalId,
      status: 'RECOVERY_REQUIRED',
      recoveryPointSnapshot: snapshot,
      auditTrailJson: [],
    };

    const mockPrisma = createMockPrisma([], [rollbackRecord]);
    const service = new PatchRollbackService(mockPrisma as any);

    const recovered = await service.resumeRecovery({
      projectId,
      rollbackId: validRollbackId,
      actor: 'SAFETY_DAEMON',
    });

    assert.equal(recovered.status, 'COMPLETED');

    // Verify file on disk was restored back from the snapshot!
    const restoredDisk = fs.readFileSync(path.join(repoDir, 'calc.ts'), 'utf8');
    assert.equal(restoredDisk, s1Content);
  });
});
