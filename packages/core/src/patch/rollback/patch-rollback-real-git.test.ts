/**
 * @file packages/core/src/patch/rollback/patch-rollback-real-git.test.ts
 * Real Git repository certification test for V7 Phase 105 Patch Rollback & Recovery.
 * Certifies:
 * 1. S0 (baseline) -> S1 (applied patch) -> S2 (post-rollback)
 * 2. S2 == S0 for patch-owned lines
 * 3. Independent user changes in other files and independent lines in the same file are 100% preserved
 * 4. Zero destructive resets (no git reset --hard, no git clean -fd)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PatchApplicator } from '../approval/patch-applicator.js';
import { PatchRollbackService } from './patch-rollback-service.js';

const execFileAsync = promisify(execFile);

describe('Real Git Repository Patch Rollback Certification', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const failureCaseId = '22222222-2222-2222-2222-222222222222';
  const patchProposalId = '33333333-3333-3333-3333-333333333333';
  const repositoryId = '55555555-5555-5555-5555-555555555555';
  const approvalId = '66666666-6666-6666-6666-666666666666';

  let tempDir: string;
  let repoDir: string;
  let initialCommitSha: string;

  const s0CalcContent = [
    'export function computeFactorial(n: number): number {',
    '  if (n <= 1) return 1;',
    '  return n + computeFactorial(n - 1); // BUG: should be *',
    '}',
  ].join('\n') + '\n';

  const s0ReadmeContent = '# Math Engine\n\nA lightweight arithmetic engine.\n';

  const structuredEdits = [
    {
      filePath: 'src/math.ts',
      startLine: 3,
      endLine: 3,
      originalContent: '  return n + computeFactorial(n - 1); // BUG: should be *',
      replacementContent: '  return n * computeFactorial(n - 1); // FIXED',
      explanation: 'Fix factorial multiplication formula',
    },
  ];

  before(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'real-git-rollback-')));
    repoDir = path.join(tempDir, 'repo');
    fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });

    await execFileAsync('git', ['init', '-b', 'main'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.name', 'Quality Robot'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.email', 'bot@ai-quality.org'], { cwd: repoDir });

    fs.writeFileSync(path.join(repoDir, 'src', 'math.ts'), s0CalcContent, 'utf8');
    fs.writeFileSync(path.join(repoDir, 'README.md'), s0ReadmeContent, 'utf8');

    await execFileAsync('git', ['add', '.'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-m', 'S0 baseline with defect in factorial'], {
      cwd: repoDir,
    });

    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoDir });
    initialCommitSha = stdout.trim();
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('certifies S0 -> S1 (apply patch) -> user independent edits -> S2 (rollback) where S2 == S0 for patch lines and user edits preserved', async () => {
    const s0MathHash = crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(repoDir, 'src', 'math.ts'), 'utf8'), 'utf8')
      .digest('hex');

    // Step 1: Apply Patch (Phase 104) to reach S1
    PatchApplicator.applyPatchToWorkspace({
      workspaceRoot: repoDir,
      structuredEdits,
      targetFiles: ['src/math.ts'],
      allowedFiles: ['src/math.ts'],
    });

    const s1MathContent = fs.readFileSync(path.join(repoDir, 'src', 'math.ts'), 'utf8');
    assert.ok(s1MathContent.includes('return n * computeFactorial(n - 1); // FIXED'));

    // Step 2: Simulate User making legitimate independent changes:
    // (A) In the same file: adds a comment and a new function at the bottom
    const userModifiedMath =
      s1MathContent + '\nexport function power(b: number, e: number): number {\n  return b ** e;\n}\n';
    fs.writeFileSync(path.join(repoDir, 'src', 'math.ts'), userModifiedMath, 'utf8');

    // (B) In another file: edits README.md
    fs.writeFileSync(
      path.join(repoDir, 'README.md'),
      s0ReadmeContent + '\n## Features\n- Factorial\n- Power\n',
      'utf8',
    );

    // (C) Adds a completely new file: src/constants.ts
    fs.writeFileSync(
      path.join(repoDir, 'src', 'constants.ts'),
      'export const PI = 3.14159;\n',
      'utf8',
    );

    // Step 3: Run Rollback via PatchRollbackService (Phase 105)
    const mockApproval = {
      id: approvalId,
      projectId,
      failureCaseId,
      patchProposalId,
      repositoryId,
      status: 'APPLIED',
      appliedAt: new Date(),
      reviewedPatchHash: 'patchhash_real',
      baseRevision: initialCommitSha,
      appliedRevision: initialCommitSha,
      affectedFiles: ['src/math.ts'],
      auditTrailJson: [],
    };

    let savedRollback: any = null;
    let savedApproval: any = { ...mockApproval };

    const mockPrisma: any = {
      defectPatchApproval: {
        findUnique: async () => ({
          ...savedApproval,
          patchProposal: {
            id: patchProposalId,
            projectId,
            failureCaseId,
            repositoryId,
            targetFiles: ['src/math.ts'],
            structuredEditsJson: structuredEdits,
          },
          failureCase: {
            id: failureCaseId,
            projectId,
            testCaseId: 'test-fact-1',
            testCaseVersionNumber: 1,
            testRunId: 'run-fact-1',
          },
          repository: {
            id: repositoryId,
            projectId,
            rootPath: repoDir,
          },
        }),
        findMany: async () => [savedApproval],
        update: async (args: any) => {
          savedApproval = { ...savedApproval, ...args.data };
          return savedApproval;
        },
      },
      defectPatchRollback: {
        findUnique: async () => savedRollback,
        findFirst: async () => savedRollback,
        findMany: async () => [savedRollback],
        create: async (args: any) => {
          savedRollback = { id: crypto.randomUUID(), ...args.data };
          return savedRollback;
        },
        update: async (args: any) => {
          savedRollback = { ...savedRollback, ...args.data };
          return savedRollback;
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

    const service = new PatchRollbackService(mockPrisma);

    // Plan rollback
    const plan = await service.planRollback({ projectId, approvalId });
    assert.equal(plan.canRollback, true);
    assert.equal(plan.conflicts.length, 0);

    // Execute rollback
    const rollbackResult = await service.executeRollback({
      projectId,
      approvalId,
      rollbackReason: 'Rollback verified for quality regression',
    });

    assert.equal(rollbackResult.status, 'COMPLETED');
    assert.equal(rollbackResult.integrityVerified, true);
    assert.equal(savedApproval.status, 'ROLLED_BACK');

    // Step 4: Verify Repository State S2
    const s2MathContent = fs.readFileSync(path.join(repoDir, 'src', 'math.ts'), 'utf8');

    // 1. Patch line MUST be reverted to S0 baseline bug
    assert.ok(
      s2MathContent.includes('return n + computeFactorial(n - 1); // BUG: should be *'),
      'Expected factorial formula to be restored to S0 bug',
    );
    assert.ok(
      !s2MathContent.includes('// FIXED'),
      'Expected patch fix to no longer be present in file',
    );

    // 2. User independent function MUST be preserved
    assert.ok(
      s2MathContent.includes('export function power(b: number, e: number): number'),
      'Expected user added power function to remain intact',
    );

    // 3. User independent edits to README.md MUST be preserved
    const s2ReadmeContent = fs.readFileSync(path.join(repoDir, 'README.md'), 'utf8');
    assert.ok(
      s2ReadmeContent.includes('## Features'),
      'Expected user additions to README.md to remain intact',
    );

    // 4. User independent new file src/constants.ts MUST be preserved
    const s2ConstantsContent = fs.readFileSync(path.join(repoDir, 'src', 'constants.ts'), 'utf8');
    assert.equal(s2ConstantsContent, 'export const PI = 3.14159;\n');

    // Check Git working copy status using real git command:
    // git diff on math.ts should ONLY show the user added power() function!
    const { stdout: gitDiffMath } = await execFileAsync('git', ['diff', 'src/math.ts'], {
      cwd: repoDir,
    });

    const diffChanges = gitDiffMath
      .split('\n')
      .filter(line => (line.startsWith('+') && !line.startsWith('+++')) || (line.startsWith('-') && !line.startsWith('---')));

    // None of the added or removed lines should modify computeFactorial
    assert.ok(
      !diffChanges.some(l => l.includes('computeFactorial')),
      'Git diff relative to S0 baseline must NOT contain computeFactorial modifications in changed lines',
    );
    assert.ok(
      diffChanges.some(l => l.includes('export function power')),
      'Git diff must contain user power function addition',
    );

    // 6. Certify that zero destructive git resets were performed
    // git status should show modified src/math.ts, modified README.md, and untracked src/constants.ts
    const { stdout: gitStatus } = await execFileAsync('git', ['status', '--short'], {
      cwd: repoDir,
    });
    assert.ok(gitStatus.includes('M README.md'), 'README.md must show as modified in git');
    assert.ok(gitStatus.includes('M src/math.ts'), 'src/math.ts must show as modified in git');
    assert.ok(gitStatus.includes('?? src/constants.ts'), 'src/constants.ts must show as untracked in git');
  });
});
