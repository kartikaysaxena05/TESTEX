/**
 * @file packages/core/src/execution/orchestration/run-orchestrator.test.ts
 * Integration tests for RunOrchestrator execution lifecycle, cooperative cancellation, terminal states, and orphan crash recovery.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../../database/index.js';
import { RunOrchestrator } from './run-orchestrator.js';
import { TestRunAlreadyTerminalError, TestRunNotFoundError } from './orchestration-errors.js';
import type { IExecutionWorker, ExecutionWorkerResult } from './orchestration-types.js';

describe('RunOrchestrator Integration Tests', () => {
  const prisma = getPrismaClient()!;
  let projectId: string;
  let otherProjectId: string;
  let testCaseId: string;
  let planId: string;
  let invalidPlanId: string;

  before(async () => {
    const project = await prisma.project.create({
      data: { name: 'Orchestrator Integration Project', status: 'ACTIVE' },
    });
    projectId = project.id;

    const otherProject = await prisma.project.create({
      data: { name: 'Other Orchestrator Project', status: 'ACTIVE' },
    });
    otherProjectId = otherProject.id;

    const testCase = await prisma.testCase.create({
      data: {
        projectId,
        testCaseKey: 'TC-ORCH-001',
        title: 'Orchestrator Test Case',
        objective: 'Test orchestrator lifecycle',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
      },
    });
    testCaseId = testCase.id;

    const validPlan = await prisma.executableTestPlan.create({
      data: {
        projectId,
        testCaseId,
        testCaseVersionNumber: 1,
        planFingerprint: 'dummy-fp-orch',
        compilerVersion: '1.0.0',
        planSchemaVersion: 1,
        status: 'VALID',
        isExecutable: true,
      },
    });
    planId = validPlan.id;

    const invalidPlan = await prisma.executableTestPlan.create({
      data: {
        projectId,
        testCaseId,
        testCaseVersionNumber: 1,
        planFingerprint: 'dummy-fp-invalid',
        compilerVersion: '1.0.0',
        planSchemaVersion: 1,
        status: 'INVALID',
        isExecutable: false,
      },
    });
    invalidPlanId = invalidPlan.id;
  });

  after(async () => {
    if (projectId) {
      await prisma.project.delete({ where: { id: projectId } });
    }
    if (otherProjectId) {
      await prisma.project.delete({ where: { id: otherProjectId } });
    }
  });

  it('successfully executes a claimed run to terminal PASSED state', async () => {
    const orchestrator = new RunOrchestrator(prisma);

    const testRun = await prisma.testRun.create({
      data: {
        projectId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: planId,
        status: 'PREPARING',
        workerId: orchestrator.workerId,
        planFingerprint: 'dummy-fp-orch',
        testCaseTitle: 'Orchestrator Test Case',
      },
    });

    const result = await orchestrator.executeClaimedRun(testRun);
    assert.equal(result.status, 'PASSED');
    assert.equal(result.terminalReason, 'Orchestration execution completed successfully.');
    assert(result.startedAt !== null);
    assert(result.completedAt !== null);
    assert(typeof result.executionDurationMs === 'number');

    // Verify DB state
    const dbRecord = await prisma.testRun.findUnique({ where: { id: testRun.id } });
    assert.equal(dbRecord?.status, 'PASSED');
  });

  it('marks run as BLOCKED if executable plan is invalid or missing', async () => {
    const orchestrator = new RunOrchestrator(prisma);

    const testRun = await prisma.testRun.create({
      data: {
        projectId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: invalidPlanId,
        status: 'PREPARING',
        workerId: orchestrator.workerId,
        planFingerprint: 'dummy-fp-invalid',
        testCaseTitle: 'Invalid Plan Run',
      },
    });

    const result = await orchestrator.executeClaimedRun(testRun);
    assert.equal(result.status, 'BLOCKED');
    assert(result.terminalReason?.includes('not executable'));
    assert(result.completedAt !== null);
  });

  it('handles worker exception and cleanly transitions to AUTOMATION_ERROR', async () => {
    const customWorker: IExecutionWorker = {
      workerId: 'mock-failing-worker',
      execute: async () => {
        throw new Error('Simulated browser crash exception');
      },
    };

    const orchestrator = new RunOrchestrator(prisma, undefined, customWorker);

    const testRun = await prisma.testRun.create({
      data: {
        projectId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: planId,
        status: 'PREPARING',
        workerId: orchestrator.workerId,
        planFingerprint: 'dummy-fp-orch',
        testCaseTitle: 'Failing Worker Run',
      },
    });

    const result = await orchestrator.executeClaimedRun(testRun);
    assert.equal(result.status, 'AUTOMATION_ERROR');
    assert.equal(result.terminalReason, 'Unexpected internal error during test execution.');
    assert(result.errorMessage?.includes('Simulated browser crash exception'));
  });

  it('cancels a QUEUED run immediately', async () => {
    const orchestrator = new RunOrchestrator(prisma);

    const testRun = await prisma.testRun.create({
      data: {
        projectId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: planId,
        status: 'QUEUED',
        planFingerprint: 'dummy-fp-orch',
        testCaseTitle: 'Queued Cancel Test',
      },
    });

    const cancelled = await orchestrator.cancelRun(testRun.id, projectId, 'User cancelled');
    assert.equal(cancelled.status, 'CANCELLED');
    assert.equal(cancelled.terminalReason, 'User cancelled');
    assert(cancelled.cancelledAt !== null);
  });

  it('cooperatively cancels an active running execution via AbortController', async () => {
    let observedAbort = false;

    const longRunningWorker: IExecutionWorker = {
      workerId: 'long-worker',
      execute: async (_run, signal) => {
        return new Promise<ExecutionWorkerResult>(resolve => {
          signal.addEventListener('abort', () => {
            observedAbort = true;
            resolve({
              outcome: 'CANCELLED',
              terminalReason: 'Worker received abort signal.',
              durationMs: 50,
            });
          });
        });
      },
    };

    const orchestrator = new RunOrchestrator(prisma, undefined, longRunningWorker);

    const testRun = await prisma.testRun.create({
      data: {
        projectId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: planId,
        status: 'PREPARING',
        workerId: orchestrator.workerId,
        planFingerprint: 'dummy-fp-orch',
        testCaseTitle: 'Long Running Abort Test',
      },
    });

    // Start execution in background
    const execPromise = orchestrator.executeClaimedRun(testRun);

    // Give it a brief moment to transition to RUNNING and register controller
    await new Promise(r => setTimeout(r, 20));

    // Request cancellation
    const cancelRes = await orchestrator.cancelRun(testRun.id, projectId, 'Stop execution');
    assert.equal(cancelRes.status, 'CANCELLED');

    const finalRun = await execPromise;
    assert.equal(finalRun.status, 'CANCELLED');
    assert.equal(observedAbort, true);
  });

  it('rejects cancellation on already terminal runs', async () => {
    const orchestrator = new RunOrchestrator(prisma);

    const terminalRun = await prisma.testRun.create({
      data: {
        projectId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: planId,
        status: 'PASSED',
        planFingerprint: 'dummy-fp-orch',
        testCaseTitle: 'Terminal Run',
        completedAt: new Date(),
      },
    });

    await assert.rejects(
      async () => {
        await orchestrator.cancelRun(terminalRun.id, projectId);
      },
      (err: unknown) => {
        assert(err instanceof TestRunAlreadyTerminalError);
        assert.equal(err.code, 'TEST_RUN_ALREADY_TERMINAL');
        return true;
      },
    );
  });

  it('recovers orphaned runs on startup with AUTOMATION_ERROR', async () => {
    // Create an orphaned run left in RUNNING status
    const orphan = await prisma.testRun.create({
      data: {
        projectId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: planId,
        status: 'RUNNING',
        workerId: 'crashed-worker-999',
        planFingerprint: 'dummy-fp-orch',
        testCaseTitle: 'Orphaned Crash Run',
      },
    });

    const orchestrator = new RunOrchestrator(prisma);
    const recoveredCount = await orchestrator.recoverOrphanedRuns();
    assert(recoveredCount >= 1);

    const updated = await prisma.testRun.findUnique({ where: { id: orphan.id } });
    assert.equal(updated?.status, 'AUTOMATION_ERROR');
    assert(updated?.terminalReason?.includes('PROCESS_INTERRUPTED'));
    assert(updated?.completedAt !== null);
  });

  it('enforces multi-tenant project isolation during cancellation', async () => {
    const orchestrator = new RunOrchestrator(prisma);

    const runInOtherProject = await prisma.testRun.create({
      data: {
        projectId: otherProjectId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: planId,
        status: 'QUEUED',
        planFingerprint: 'dummy-fp-orch',
        testCaseTitle: 'Other Project Run',
      },
    });

    await assert.rejects(
      async () => {
        // Attempt to cancel with wrong projectId
        await orchestrator.cancelRun(runInOtherProject.id, projectId);
      },
      (err: unknown) => {
        assert(err instanceof TestRunNotFoundError);
        assert.equal(err.code, 'TEST_RUN_NOT_FOUND');
        return true;
      },
    );
  });
});
