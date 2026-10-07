/**
 * @file packages/core/src/patch/rollback/patch-rollback-service.test.ts
 * Unit and integration tests for PatchRollbackService (V7 Phase 105).
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
  PatchRollbackNotFoundError,
  PatchRollbackCrossProjectError,
  PatchRollbackNotAppliedError,
  PatchRollbackConflictError,
} from './rollback-errors.js';

const execFileAsync = promisify(execFile);

describe('PatchRollbackService Unit Tests', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const failureCaseId = '22222222-2222-2222-2222-222222222222';
  const patchProposalId = '33333333-3333-3333-3333-333333333333';
  const validationId = '44444444-4444-4444-4444-444444444444';
  const repositoryId = '55555555-5555-5555-5555-555555555555';
  const approvalId = '66666666-6666-6666-6666-666666666666';
  const testRunId = '77777777-7777-7777-7777-777777777777';

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
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-service-test-')));
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
    // Reset calc.ts to S1 (applied patch state)
    fs.writeFileSync(path.join(repoDir, 'calc.ts'), s1Content, 'utf8');
  });

  function createMockPrisma(
    approvalRecords: any[] = [],
    rollbackRecords: any[] = [],
    extraOverrides: Partial<any> = {},
  ) {
    const rollbacks = [...rollbackRecords];
    const approvals = [...approvalRecords];
    const testRuns: any[] = [
      {
        id: testRunId,
        projectId,
        testCaseId: 'test-case-1',
        testCaseVersionNumber: 1,
        executableTestPlanId: 'plan-1',
        planFingerprint: 'fingerprint-1',
        testCaseTitle: 'Math addition test',
      },
    ];

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
              ...extraOverrides.patchProposal,
            },
            failureCase: {
              id: failureCaseId,
              projectId,
              testCaseId: 'test-case-1',
              testCaseVersionNumber: 1,
              testRunId,
              errorMessage: 'Assertion failed: expected 5 got -1',
            },
            repository: {
              id: repositoryId,
              projectId,
              rootPath: repoDir,
            },
          };
        },
        findMany: async (args: any) => {
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
          const rec = rollbacks.find(
            r =>
              r.projectId === args.where.projectId &&
              (!args.where.id || r.id === args.where.id) &&
              (!args.where.patchApprovalId || r.patchApprovalId === args.where.patchApprovalId),
          );
          return rec ?? null;
        },
        findMany: async (args: any) => {
          return rollbacks.filter(r => r.projectId === args.where.projectId);
        },
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
        findUnique: async (args: any) => testRuns.find(r => r.id === args.where.id) ?? null,
        create: async (args: any) => {
          const created = { id: crypto.randomUUID(), ...args.data };
          testRuns.push(created);
          return created;
        },
      },
    };
  }

  it('plans rollback with dry-run and detects zero conflicts for clean patch', async () => {
    const mockApproval = {
      id: approvalId,
      projectId,
      failureCaseId,
      patchProposalId,
      validationId,
      repositoryId,
      status: 'APPLIED',
      appliedAt: new Date(),
      reviewedPatchHash: 'patchhash123',
      baseRevision: initialCommitSha,
      appliedRevision: initialCommitSha,
      affectedFiles: ['calc.ts'],
    };

    const mockPrisma = createMockPrisma([mockApproval]);
    const service = new PatchRollbackService(mockPrisma as any);

    const plan = await service.planRollback({
      projectId,
      approvalId,
    });

    assert.equal(plan.approvalId, approvalId);
    assert.equal(plan.canRollback, true);
    assert.equal(plan.conflicts.length, 0);
    assert.deepEqual(plan.targetFiles, ['calc.ts']);
    assert.ok(plan.reverseDiff);
    assert.ok(plan.reverseDiff.includes('+  return a - b;'));
    assert.ok(plan.reverseDiff.includes('-  return a + b;'));

    // Check disk content was NOT modified during plan
    const diskContent = fs.readFileSync(path.join(repoDir, 'calc.ts'), 'utf8');
    assert.equal(diskContent, s1Content);
  });

  it('executes dry-run rollback and records COMPLETED dryRun record without modifying disk', async () => {
    const mockApproval = {
      id: approvalId,
      projectId,
      failureCaseId,
      patchProposalId,
      validationId,
      repositoryId,
      status: 'APPLIED',
      appliedAt: new Date(),
      reviewedPatchHash: 'patchhash123',
      baseRevision: initialCommitSha,
      appliedRevision: initialCommitSha,
      affectedFiles: ['calc.ts'],
    };

    const mockPrisma = createMockPrisma([mockApproval]);
    const service = new PatchRollbackService(mockPrisma as any);

    const result = await service.executeRollback({
      projectId,
      approvalId,
      dryRun: true,
      rollbackRequestedBy: 'TEST_USER',
    });

    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.dryRunOnly, true);
    assert.equal(result.dryRunSuccess, true);

    // Disk remains at S1
    const diskContent = fs.readFileSync(path.join(repoDir, 'calc.ts'), 'utf8');
    assert.equal(diskContent, s1Content);
  });

  it('executes full rollback: restores patch lines to S0 (S2 == S0), creates recovery point, and transitions approval to ROLLED_BACK', async () => {
    const mockApproval = {
      id: approvalId,
      projectId,
      failureCaseId,
      patchProposalId,
      validationId,
      repositoryId,
      status: 'APPLIED',
      appliedAt: new Date(),
      reviewedPatchHash: 'patchhash123',
      baseRevision: initialCommitSha,
      appliedRevision: initialCommitSha,
      affectedFiles: ['calc.ts'],
      auditTrailJson: [],
    };

    const mockPrisma = createMockPrisma([mockApproval]);
    const service = new PatchRollbackService(mockPrisma as any);

    const rollbackDto = await service.executeRollback({
      projectId,
      approvalId,
      rollbackReason: 'Reverting fix for testing',
      rollbackRequestedBy: 'HUMAN_OPERATOR',
    });

    assert.equal(rollbackDto.status, 'COMPLETED');
    assert.equal(rollbackDto.integrityVerified, true);
    assert.equal(rollbackDto.originalFailureReoccurred, true);
    assert.ok(rollbackDto.postRollbackTestRunId);

    // Verify S2 == S0 on disk!
    const diskContent = fs.readFileSync(path.join(repoDir, 'calc.ts'), 'utf8');
    assert.equal(diskContent, s0Content);

    // Verify approval transitioned to ROLLED_BACK
    const updatedApproval = await mockPrisma.defectPatchApproval.findUnique({
      where: { id: approvalId },
    });
    assert.equal(updatedApproval?.status, 'ROLLED_BACK');
  });

  it('preserves independent user edits in other files and in the same file', async () => {
    // 1. Add independent function at the bottom of calc.ts
    const userModifiedCalc =
      'export function add(a: number, b: number): number {\n  return a + b;\n}\n\nexport function multiply(a: number, b: number): number {\n  return a * b;\n}\n';
    fs.writeFileSync(path.join(repoDir, 'calc.ts'), userModifiedCalc, 'utf8');

    // 2. Add an entirely independent file
    fs.writeFileSync(
      path.join(repoDir, 'helper.ts'),
      'export const HELPER_CONST = 42;\n',
      'utf8',
    );

    const mockApproval = {
      id: approvalId,
      projectId,
      failureCaseId,
      patchProposalId,
      validationId,
      repositoryId,
      status: 'APPLIED',
      appliedAt: new Date(),
      reviewedPatchHash: 'patchhash123',
      baseRevision: initialCommitSha,
      appliedRevision: initialCommitSha,
      affectedFiles: ['calc.ts'],
      auditTrailJson: [],
    };

    const mockPrisma = createMockPrisma([mockApproval]);
    const service = new PatchRollbackService(mockPrisma as any);

    const rollbackDto = await service.executeRollback({
      projectId,
      approvalId,
    });

    assert.equal(rollbackDto.status, 'COMPLETED');
    assert.ok(rollbackDto.preservedUnrelatedFiles.includes('helper.ts'));

    // Check calc.ts on disk:
    // Patch lines restored to `return a - b;`
    // User multiply function MUST BE PRESERVED!
    const updatedCalc = fs.readFileSync(path.join(repoDir, 'calc.ts'), 'utf8');
    assert.ok(updatedCalc.includes('return a - b;'));
    assert.ok(updatedCalc.includes('export function multiply(a: number, b: number): number'));

    // Check helper.ts is untouched
    const helperContent = fs.readFileSync(path.join(repoDir, 'helper.ts'), 'utf8');
    assert.equal(helperContent, 'export const HELPER_CONST = 42;\n');

    // Clean up helper.ts
    fs.rmSync(path.join(repoDir, 'helper.ts'), { force: true });
  });

  it('rejects rollback if approval is not APPLIED', async () => {
    const mockApproval = {
      id: approvalId,
      projectId,
      failureCaseId,
      patchProposalId,
      validationId,
      repositoryId,
      status: 'APPROVED', // Not yet applied
      appliedAt: null,
      reviewedPatchHash: 'patchhash123',
      baseRevision: initialCommitSha,
    };

    const mockPrisma = createMockPrisma([mockApproval]);
    const service = new PatchRollbackService(mockPrisma as any);

    await assert.rejects(
      () => service.planRollback({ projectId, approvalId }),
      PatchRollbackNotAppliedError,
    );

    await assert.rejects(
      () => service.executeRollback({ projectId, approvalId }),
      PatchRollbackNotAppliedError,
    );
  });

  it('rejects cross-project rollback attempt', async () => {
    const mockApproval = {
      id: approvalId,
      projectId: '99999999-9999-9999-9999-999999999999', // Different project
      failureCaseId,
      patchProposalId,
      status: 'APPLIED',
    };

    const mockPrisma = createMockPrisma([mockApproval]);
    const service = new PatchRollbackService(mockPrisma as any);

    await assert.rejects(
      () => service.planRollback({ projectId, approvalId }),
      PatchRollbackCrossProjectError,
    );
  });
});
