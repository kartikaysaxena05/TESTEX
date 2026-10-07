/**
 * @file packages/core/src/execution/orchestration/run-queue.test.ts
 * Integration tests for RunQueue bounded capacity, atomic lease claims, FIFO determinism, and heartbeats.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../../database/index.js';
import { RunQueue } from './run-queue.js';
import { TestRunQueueFullError } from './orchestration-errors.js';

describe('RunQueue Integration Tests', () => {
  const prisma = getPrismaClient()!;
  let projectId: string;
  let testCaseId: string;
  let planId: string;

  before(async () => {
    const project = await prisma.project.create({
      data: { name: 'Run Queue Integration Project', status: 'ACTIVE' },
    });
    projectId = project.id;

    const testCase = await prisma.testCase.create({
      data: {
        projectId,
        testCaseKey: 'TC-QUEUE-001',
        title: 'Queue Test Case',
        objective: 'Test queue capacity and ordering',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
      },
    });
    testCaseId = testCase.id;

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId,
        testCaseId,
        testCaseVersionNumber: 1,
        planFingerprint: 'dummy-fingerprint-queue',
        compilerVersion: '1.0.0',
        planSchemaVersion: 1,
        status: 'VALID',
        isExecutable: true,
      },
    });
    planId = plan.id;
  });

  after(async () => {
    if (projectId) {
      await prisma.project.delete({ where: { id: projectId } });
    }
  });

  it('enforces bounded queue capacity and throws TestRunQueueFullError', async () => {
    const tinyQueue = new RunQueue(prisma, { maxQueueDepth: 2, maxConcurrentRuns: 1 });

    // Create 2 runs to fill capacity
    await prisma.testRun.create({
      data: {
        projectId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: planId,
        status: 'QUEUED',
        planFingerprint: 'dummy-fingerprint-queue',
        testCaseTitle: 'Queue Test 1',
        queuedAt: new Date(Date.now() - 2000),
      },
    });

    await prisma.testRun.create({
      data: {
        projectId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: planId,
        status: 'QUEUED',
        planFingerprint: 'dummy-fingerprint-queue',
        testCaseTitle: 'Queue Test 2',
        queuedAt: new Date(Date.now() - 1000),
      },
    });

    await assert.rejects(
      async () => {
        await tinyQueue.assertCapacity(projectId);
      },
      (err: unknown) => {
        assert(err instanceof TestRunQueueFullError);
        assert.equal(err.code, 'TEST_RUN_QUEUE_FULL');
        return true;
      },
    );
  });

  it('atomically claims runs in deterministic FIFO order', async () => {
    // Clean runs for clean test
    await prisma.testRun.deleteMany({ where: { projectId } });

    const runQueue = new RunQueue(prisma, { maxQueueDepth: 10, maxConcurrentRuns: 2 });

    const run1 = await prisma.testRun.create({
      data: {
        projectId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: planId,
        status: 'QUEUED',
        planFingerprint: 'fp-1',
        testCaseTitle: 'Test FIFO 1',
        queuedAt: new Date('2026-08-20T10:00:00Z'),
      },
    });

    const run2 = await prisma.testRun.create({
      data: {
        projectId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: planId,
        status: 'QUEUED',
        planFingerprint: 'fp-2',
        testCaseTitle: 'Test FIFO 2',
        queuedAt: new Date('2026-08-20T10:01:00Z'),
      },
    });

    // Claim first run
    const claimed1 = await runQueue.claimNextRun('worker-alpha', projectId, 30000);
    assert(claimed1 !== null);
    assert.equal(claimed1.id, run1.id);
    assert.equal(claimed1.status, 'PREPARING');
    assert.equal(claimed1.workerId, 'worker-alpha');
    assert(claimed1.leaseExpiresAt !== null);

    // Claim second run
    const claimed2 = await runQueue.claimNextRun('worker-beta', projectId, 30000);
    assert(claimed2 !== null);
    assert.equal(claimed2.id, run2.id);
    assert.equal(claimed2.status, 'PREPARING');
    assert.equal(claimed2.workerId, 'worker-beta');

    // Third claim attempt returns null because maxConcurrentRuns (2) is reached
    const claimed3 = await runQueue.claimNextRun('worker-gamma', projectId);
    assert.equal(claimed3, null);
  });

  it('updates heartbeat and extends lease expiration for active runs', async () => {
    const queue = new RunQueue(prisma);

    const testRun = await prisma.testRun.create({
      data: {
        projectId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: planId,
        status: 'PREPARING',
        workerId: 'worker-hb',
        planFingerprint: 'fp-hb',
        testCaseTitle: 'Test Heartbeat',
        leaseExpiresAt: new Date(Date.now() + 10000),
        heartbeatAt: new Date(Date.now() - 5000),
      },
    });

    const success = await queue.heartbeat(testRun.id, 'worker-hb', 60000);
    assert.equal(success, true);

    const updated = await prisma.testRun.findUnique({ where: { id: testRun.id } });
    assert(updated !== null);
    assert(updated.leaseExpiresAt!.getTime() > Date.now() + 30000);

    // Heartbeat from wrong worker returns false
    const fail = await queue.heartbeat(testRun.id, 'wrong-worker', 60000);
    assert.equal(fail, false);
  });

  it('retrieves accurate queue state metrics', async () => {
    await prisma.testRun.deleteMany({ where: { projectId } });

    const queue = new RunQueue(prisma, { maxQueueDepth: 50, maxConcurrentRuns: 1 });

    await prisma.testRun.create({
      data: {
        projectId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: planId,
        status: 'QUEUED',
        planFingerprint: 'fp-q',
        testCaseTitle: 'Queued item',
      },
    });

    await prisma.testRun.create({
      data: {
        projectId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: planId,
        status: 'RUNNING',
        workerId: 'worker-live',
        planFingerprint: 'fp-r',
        testCaseTitle: 'Running item',
      },
    });

    const state = await queue.getQueueState(projectId);
    assert.equal(state.queuedCount, 1);
    assert.equal(state.preparingCount, 0);
    assert.equal(state.runningCount, 1);
    assert.equal(state.maxConcurrentRuns, 1);
    assert.equal(state.maxQueueDepth, 50);
    assert.equal(state.isQueueFull, false);
    assert.deepEqual(state.activeWorkerIds, ['worker-live']);
  });
});
