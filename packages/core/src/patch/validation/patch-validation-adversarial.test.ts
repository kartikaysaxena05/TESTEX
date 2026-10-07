/**
 * @file packages/core/src/patch/validation/patch-validation-adversarial.test.ts
 * Adversarial and security boundary attack tests for PatchValidationService (V7 Phase 103).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PrismaClient } from '@prisma/client';
import { executePatchValidationInputSchema } from '@ai-quality/contracts';
import { PatchValidationService } from './patch-validation-service.js';
import {
  PatchValidationCrossProjectError,
  PatchValidationSandboxUnavailableError,
} from './validation-errors.js';
import type {
  ITestExecutionEngine,
  TestExecutionOptions,
  ValidationStepExecutionResult,
} from './validation-types.js';

const execFileAsync = promisify(execFile);

describe('Patch Validation Adversarial & Boundary Attacks', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const victimProjectId = '22222222-2222-2222-2222-222222222222';
  const failureCaseId = '33333333-3333-3333-3333-333333333333';
  const patchProposalId = '44444444-4444-4444-4444-444444444444';
  const sandboxId = '55555555-5555-5555-5555-555555555555';
  const testCaseId = '66666666-6666-6666-6666-666666666666';

  let tempDir: string;
  let repoDir: string;
  let sandboxDir: string;

  before(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'val-adv-test-')));
    repoDir = path.join(tempDir, 'auth-repo');
    sandboxDir = path.join(tempDir, 'sandbox');

    fs.mkdirSync(repoDir, { recursive: true });
    fs.mkdirSync(sandboxDir, { recursive: true });

    await execFileAsync('git', ['init', '-b', 'main'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.name', 'Test Engineer'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, 'app.ts'), 'export const active = true;\n', 'utf8');
    await execFileAsync('git', ['add', '.'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-m', 'clean initial commit'], { cwd: repoDir });
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createMockPrisma(overrides: Partial<any> = {}) {
    return {
      defectPatchProposal: {
        findUnique: async () => ({
          id: patchProposalId,
          projectId,
          failureCaseId,
          repositoryRevision: 'rev-001',
          patchFingerprint: 'fingerprint-secure-999',
          targetFiles: ['src/allowed.ts'],
          ...overrides.patchProposal,
        }),
      },
      failureCase: {
        findUnique: async () => ({
          id: failureCaseId,
          projectId,
          testCaseId,
          testCaseVersionNumber: 1,
          errorMessage: 'Expected 10, got 20',
          failureSignature: 'sig-calc-fail',
          stepIndex: 1,
          ...overrides.failureCase,
        }),
      },
      defectPatchSandbox: {
        findUnique: async () => ({
          id: sandboxId,
          projectId,
          failureCaseId,
          patchProposalId,
          sandboxRoot: sandboxDir,
          sourceRevision: 'rev-001',
          sandboxStatus: 'READY',
          actualFilesModified: ['src/allowed.ts'],
          ...overrides.sandbox,
        }),
        findFirst: async () => ({
          id: sandboxId,
          projectId,
          failureCaseId,
          patchProposalId,
          sandboxRoot: sandboxDir,
          sourceRevision: 'rev-001',
          sandboxStatus: 'READY',
          actualFilesModified: ['src/allowed.ts'],
          ...overrides.sandbox,
        }),
      },
      projectSource: {
        findUnique: async () => ({
          id: 'src-1',
          projectId,
          rootPath: repoDir,
        }),
        findFirst: async () => ({
          id: 'src-1',
          projectId,
          rootPath: repoDir,
        }),
      },
      testCase: {
        findUnique: async () => ({
          id: testCaseId,
          testCaseKey: 'TC-01',
          title: 'Target test',
          steps: [],
        }),
        findMany: async () => [],
      },
      requirementTestTrace: {
        findMany: async () => [],
      },
      defectPatchValidation: {
        create: async (args: any) => ({
          id: 'val-adv-1',
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        update: async (args: any) => ({
          id: args.where.id,
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    } as unknown as PrismaClient;
  }

  it('attack: rejects forged cross-project failureCaseId or proposal', async () => {
    const mockPrisma = createMockPrisma({
      patchProposal: { projectId: victimProjectId },
    });

    const service = new PatchValidationService({ prisma: mockPrisma });

    await assert.rejects(
      () =>
        service.executeValidation({
          projectId,
          failureCaseId,
          patchProposalId,
        }),
      PatchValidationCrossProjectError,
    );
  });

  it('attack: detects unexpected out-of-scope files and yields BLOCKED outcome', async () => {
    // Sandbox reports modifications to unauthorized sensitive files
    const mockPrisma = createMockPrisma({
      sandbox: {
        actualFilesModified: ['src/allowed.ts', 'unauthorized-sensitive-config.json'],
      },
    });

    const engine: ITestExecutionEngine = {
      executeTest: async (opt: TestExecutionOptions): Promise<ValidationStepExecutionResult> => ({
        status: opt.isPatched ? 'PASS' : 'FAIL',
        consoleLogs: [],
        networkCalls: [],
        durationMs: 10,
        executedAt: new Date(),
      }),
    };

    const mockPatchSandboxService = {
      applyPatchToSandbox: async () => ({ id: sandboxId, sandboxStatus: 'PATCH_APPLIED' }),
    } as any;

    const service = new PatchValidationService({
      prisma: mockPrisma,
      testEngine: engine,
      patchSandboxService: mockPatchSandboxService,
    });

    const result = await service.executeValidation({
      projectId,
      failureCaseId,
      patchProposalId,
      sandboxId,
      skipQualityGates: true,
    });

    assert.equal(result.validationOutcome, 'BLOCKED');
    assert.equal(result.unexpectedChangesDetected, true);
    assert.ok(result.unexpectedFiles.includes('unauthorized-sensitive-config.json'));
    assert.ok(result.validationReason?.includes('Scope violation'));
  });

  it('attack: rejects validation if sandbox is in terminal DESTROYED or FAILED status', async () => {
    const mockPrisma = createMockPrisma({
      sandbox: { sandboxStatus: 'DESTROYED' },
    });

    const service = new PatchValidationService({ prisma: mockPrisma });

    await assert.rejects(
      () =>
        service.executeValidation({
          projectId,
          failureCaseId,
          patchProposalId,
          sandboxId,
        }),
      PatchValidationSandboxUnavailableError,
    );
  });

  it('attack: prevents mass-assignment injection of authoritative fields', () => {
    const maliciousPayload = {
      projectId,
      failureCaseId,
      patchProposalId,
      // Attempt to spoof outcomes directly
      validationOutcome: 'VALID',
      targetFailureFixed: true,
      originalRepoClean: true,
      originalRepoModifiedCount: 0,
      beforeStatus: 'FAIL',
      afterStatus: 'PASS',
    };

    const sanitized = executePatchValidationInputSchema.parse(maliciousPayload);
    assert.equal((sanitized as any).validationOutcome, undefined);
    assert.equal((sanitized as any).targetFailureFixed, undefined);
    assert.equal((sanitized as any).originalRepoClean, undefined);
  });
});
