/**
 * @file packages/core/src/patch/validation/patch-validation-service.test.ts
 * Core domain service tests for PatchValidationService (V7 Phase 103).
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
import { PatchValidationService } from './patch-validation-service.js';
import {
  PatchValidationCrossProjectError,
  PatchValidationInProgressError,
} from './validation-errors.js';
import type {
  ITestExecutionEngine,
  TestExecutionOptions,
  ValidationStepExecutionResult,
} from './validation-types.js';

const execFileAsync = promisify(execFile);

describe('PatchValidationService', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const otherProjectId = '99999999-9999-9999-9999-999999999999';
  const failureCaseId = '22222222-2222-2222-2222-222222222222';
  const patchProposalId = '33333333-3333-3333-3333-333333333333';
  const sandboxId = '44444444-4444-4444-4444-444444444444';
  const testCaseId = '55555555-5555-5555-5555-555555555555';
  const repositoryId = '66666666-6666-6666-6666-666666666666';

  let tempDir: string;
  let repoDir: string;
  let sandboxDir: string;

  before(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'val-service-test-')));
    repoDir = path.join(tempDir, 'repo');
    sandboxDir = path.join(tempDir, 'sandbox');

    fs.mkdirSync(repoDir, { recursive: true });
    fs.mkdirSync(sandboxDir, { recursive: true });

    // Initialize mock git repo
    await execFileAsync('git', ['init', '-b', 'main'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.name', 'Test Engineer'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, 'index.ts'), 'export const val = 1;\n', 'utf8');
    await execFileAsync('git', ['add', '.'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-m', 'init'], { cwd: repoDir });

    // Setup sandbox dir
    fs.writeFileSync(
      path.join(sandboxDir, 'package.json'),
      JSON.stringify({ name: 'sandbox-pkg', scripts: {} }),
      'utf8',
    );
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createMockPrisma(validationRecords: any[] = []) {
    return {
      defectPatchProposal: {
        findUnique: async (args: any) => {
          if (args.where.id === patchProposalId) {
            return {
              id: patchProposalId,
              projectId,
              failureCaseId,
              repositoryRevision: 'abc1234',
              patchFingerprint: 'hash-fingerprint-123',
              targetFiles: ['src/calc.ts'],
              requirementIds: ['REQ-01'],
            };
          }
          return null;
        },
      },
      failureCase: {
        findUnique: async (args: any) => {
          if (args.where.id === failureCaseId) {
            return {
              id: failureCaseId,
              projectId,
              testCaseId,
              testCaseVersionNumber: 1,
              errorMessage: 'Assertion failed: expected 4 but got 5',
              failureSignature: 'sig-calc-error',
              stepIndex: 2,
            };
          }
          return null;
        },
        findFirst: async () => ({
          id: failureCaseId,
          stepIndex: 2,
          errorMessage: 'Assertion failed: expected 4 but got 5',
          failureSignature: 'sig-calc-error',
        }),
      },
      defectPatchSandbox: {
        findUnique: async () => ({
          id: sandboxId,
          projectId,
          failureCaseId,
          patchProposalId,
          sandboxRoot: sandboxDir,
          sourceRevision: 'abc1234',
          sandboxStatus: 'READY',
          repositoryId,
          actualFilesModified: ['src/calc.ts'],
        }),
        findFirst: async () => ({
          id: sandboxId,
          projectId,
          failureCaseId,
          patchProposalId,
          sandboxRoot: sandboxDir,
          sourceRevision: 'abc1234',
          sandboxStatus: 'READY',
          repositoryId,
          actualFilesModified: ['src/calc.ts'],
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
      testCase: {
        findUnique: async () => ({
          id: testCaseId,
          testCaseKey: 'TC-001',
          title: 'Calc addition test',
          steps: [{ stepNumber: 1, action: 'add(2, 2)', expectedResult: '4' }],
        }),
        findMany: async () => [],
      },
      requirementTestTrace: {
        findMany: async () => [],
      },
      defectPatchValidation: {
        create: async (args: any) => {
          const rec = {
            id: crypto.randomUUID(),
            ...args.data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          validationRecords.push(rec);
          return rec;
        },
        update: async (args: any) => {
          const idx = validationRecords.findIndex(r => r.id === args.where.id);
          if (idx !== -1) {
            validationRecords[idx] = { ...validationRecords[idx], ...args.data };
            return validationRecords[idx];
          }
          return { id: args.where.id, ...args.data, createdAt: new Date(), updatedAt: new Date() };
        },
        findUnique: async (args: any) => {
          return validationRecords.find(r => r.id === args.where.id) ?? null;
        },
        findFirst: async (args: any) => {
          return validationRecords.find(r => r.projectId === args.where.projectId) ?? null;
        },
        findMany: async (args: any) => {
          return validationRecords.filter(r => r.projectId === args.where.projectId);
        },
      },
    } as unknown as PrismaClient;
  }

  it('rejects cross-project validation requests', async () => {
    const mockPrisma = createMockPrisma();
    const service = new PatchValidationService({ prisma: mockPrisma });

    await assert.rejects(
      () =>
        service.executeValidation({
          projectId: otherProjectId,
          failureCaseId,
          patchProposalId,
        }),
      PatchValidationCrossProjectError,
    );
  });

  it('executes full successful validation flow yielding VALID outcome', async () => {
    const validationRecords: any[] = [];
    const mockPrisma = createMockPrisma(validationRecords);

    // Custom test engine: fails on unpatched BEFORE, passes on patched AFTER
    const customTestEngine: ITestExecutionEngine = {
      executeTest: async (
        options: TestExecutionOptions,
      ): Promise<ValidationStepExecutionResult> => {
        if (options.isTargetTest) {
          if (!options.isPatched) {
            return {
              status: 'FAIL',
              failedStepIndex: 2,
              failedStepAction: 'ASSERT',
              expectedResult: '4',
              actualResult: '5',
              failureSignature: 'sig-calc-error',
              screenshotPath: null,
              consoleLogs: ['[ERROR] mismatch'],
              networkCalls: [],
              domSnapshot: null,
              tracePath: null,
              durationMs: 15,
              executedAt: new Date(),
            };
          } else {
            return {
              status: 'PASS',
              failedStepIndex: null,
              failedStepAction: null,
              expectedResult: '4',
              actualResult: '4',
              failureSignature: null,
              screenshotPath: null,
              consoleLogs: ['[INFO] pass'],
              networkCalls: [],
              domSnapshot: null,
              tracePath: null,
              durationMs: 12,
              executedAt: new Date(),
            };
          }
        }
        // Regression test
        return {
          status: 'PASS',
          failedStepIndex: null,
          failedStepAction: null,
          expectedResult: 'ok',
          actualResult: 'ok',
          failureSignature: null,
          screenshotPath: null,
          consoleLogs: [],
          networkCalls: [],
          domSnapshot: null,
          tracePath: null,
          durationMs: 10,
          executedAt: new Date(),
        };
      },
    };

    const mockPatchSandboxService = {
      applyPatchToSandbox: async () => ({ id: sandboxId, sandboxStatus: 'PATCH_APPLIED' }),
    } as any;

    const service = new PatchValidationService({
      prisma: mockPrisma,
      testEngine: customTestEngine,
      patchSandboxService: mockPatchSandboxService,
    });

    const result = await service.executeValidation({
      projectId,
      failureCaseId,
      patchProposalId,
      sandboxId,
      skipQualityGates: true,
    });

    assert.equal(result.validationOutcome, 'VALID');
    assert.equal(result.targetFailureFixed, true);
    assert.equal(result.beforeStatus, 'FAIL');
    assert.equal(result.afterStatus, 'PASS');
    assert.equal(result.regressionDetected, false);
    assert.equal(result.originalRepoClean, true);
    assert.equal(result.originalRepoModifiedCount, 0);
  });

  it('yields INCONCLUSIVE outcome when target defect unexpectedly passes in baseline', async () => {
    const validationRecords: any[] = [];
    const mockPrisma = createMockPrisma(validationRecords);

    // Custom test engine: passes BEFORE patch!
    const passingBaselineEngine: ITestExecutionEngine = {
      executeTest: async (): Promise<ValidationStepExecutionResult> => ({
        status: 'PASS',
        failedStepIndex: null,
        failedStepAction: null,
        expectedResult: '4',
        actualResult: '4',
        failureSignature: null,
        screenshotPath: null,
        consoleLogs: [],
        networkCalls: [],
        domSnapshot: null,
        tracePath: null,
        durationMs: 10,
        executedAt: new Date(),
      }),
    };

    const service = new PatchValidationService({
      prisma: mockPrisma,
      testEngine: passingBaselineEngine,
    });

    const result = await service.executeValidation({
      projectId,
      failureCaseId,
      patchProposalId,
      sandboxId,
    });

    assert.equal(result.validationOutcome, 'INCONCLUSIVE');
    assert.equal(result.beforeStatus, 'PASS');
    assert.ok(
      result.validationReason?.includes('Target defect did not reproduce in pre-patch baseline'),
    );
  });

  it('yields INVALID outcome when target test still fails after patch', async () => {
    const validationRecords: any[] = [];
    const mockPrisma = createMockPrisma(validationRecords);

    // Custom test engine: fails both BEFORE and AFTER patch
    const failingEngine: ITestExecutionEngine = {
      executeTest: async (): Promise<ValidationStepExecutionResult> => ({
        status: 'FAIL',
        failedStepIndex: 1,
        failedStepAction: 'ASSERT',
        expectedResult: 'ok',
        actualResult: 'error',
        failureSignature: 'sig-still-failing',
        screenshotPath: null,
        consoleLogs: [],
        networkCalls: [],
        domSnapshot: null,
        tracePath: null,
        durationMs: 10,
        executedAt: new Date(),
      }),
    };

    const mockPatchSandboxService = {
      applyPatchToSandbox: async () => ({ id: sandboxId, sandboxStatus: 'PATCH_APPLIED' }),
    } as any;

    const service = new PatchValidationService({
      prisma: mockPrisma,
      testEngine: failingEngine,
      patchSandboxService: mockPatchSandboxService,
    });

    const result = await service.executeValidation({
      projectId,
      failureCaseId,
      patchProposalId,
      sandboxId,
      skipQualityGates: true,
    });

    assert.equal(result.validationOutcome, 'INVALID');
    assert.equal(result.targetFailureFixed, false);
    assert.equal(result.afterStatus, 'FAIL');
  });

  it('enforces concurrency mutex on the same failure case', async () => {
    const validationRecords: any[] = [];
    const mockPrisma = createMockPrisma(validationRecords);

    let resolveExecution: () => void = () => {};
    let startedSignal: () => void = () => {};
    const startedPromise = new Promise<void>(resolve => {
      startedSignal = resolve;
    });

    const slowEngine: ITestExecutionEngine = {
      executeTest: async options => {
        if (!options.isPatched) {
          startedSignal();
          await new Promise<void>(resolve => {
            resolveExecution = resolve;
          });
        }
        return {
          status: 'FAIL',
          consoleLogs: [],
          networkCalls: [],
          durationMs: 10,
          executedAt: new Date(),
        };
      },
    };

    const mockPatchSandboxService = {
      applyPatchToSandbox: async () => ({ id: sandboxId, sandboxStatus: 'PATCH_APPLIED' }),
    } as any;

    const service = new PatchValidationService({
      prisma: mockPrisma,
      testEngine: slowEngine,
      patchSandboxService: mockPatchSandboxService,
    });

    // Start first execution
    const firstRunPromise = service.executeValidation({
      projectId,
      failureCaseId,
      patchProposalId,
      sandboxId,
      skipQualityGates: true,
    });

    // Wait until first execution is actively running inside slowEngine
    await startedPromise;

    // Attempt second execution concurrently on same failureCaseId
    await assert.rejects(
      () =>
        service.executeValidation({
          projectId,
          failureCaseId,
          patchProposalId,
          sandboxId,
        }),
      PatchValidationInProgressError,
    );

    // Unblock first execution
    resolveExecution();
    try {
      await firstRunPromise;
    } catch {
      // Ignored
    }
  });

  it('cancels an active validation cleanly and persists CANCELLED state', async () => {
    const validationRecords: any[] = [];
    const mockPrisma = createMockPrisma(validationRecords);

    const service = new PatchValidationService({
      prisma: mockPrisma,
    });

    // Seed record
    const seeded = await mockPrisma.defectPatchValidation.create({
      data: {
        projectId,
        failureCaseId,
        patchProposalId,
        sandboxId,
        testCaseId,
        testCaseVersionNumber: 1,
        status: 'RUNNING_BEFORE',
        validationOutcome: 'INCONCLUSIVE',
        baseRevision: 'abc1234',
        patchHash: 'hash-fingerprint-123',
      },
    });

    const cancelled = await service.cancelValidation({
      projectId,
      validationId: seeded.id,
      reason: 'User cancelled manually',
    });

    assert.equal(cancelled.status, 'CANCELLED');
    assert.equal(cancelled.validationOutcome, 'CANCELLED');
    assert.equal(cancelled.validationReason, 'User cancelled manually');
  });
});
