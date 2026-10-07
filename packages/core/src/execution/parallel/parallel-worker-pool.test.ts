/**
 * @file packages/core/src/execution/parallel/parallel-worker-pool.test.ts
 * Unit tests for ParallelWorkerPool orchestration, bounds, and concurrency control.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ParallelWorkerPool } from './parallel-worker-pool.js';

describe('ParallelWorkerPool', () => {
  const queuedRuns: any[] = [];
  const activeRuns: any[] = [];

  const mockPrisma: any = {
    testRun: {
      count: async () => queuedRuns.length,
      findMany: async () => queuedRuns,
      updateMany: async () => ({ count: 1 }),
      findUnique: async (args: any) => queuedRuns.find(r => r.id === args.where.id) || null,
      update: async () => ({}),
    },
    executionResourceLock: {
      deleteMany: async () => ({ count: 0 }),
      create: async () => ({}),
      findUnique: async () => null,
      update: async () => ({}),
    },
  };

  const mockRunQueue: any = {
    claimNextRun: async (workerId: string) => {
      const run = queuedRuns.shift();
      if (!run) return null;
      run.workerId = workerId;
      return run;
    },
    getQueueState: async () => ({
      queuedCount: queuedRuns.length,
      preparingCount: 0,
      runningCount: activeRuns.length,
      maxConcurrentRuns: 4,
      maxQueueDepth: 100,
      isQueueFull: false,
      activeWorkerIds: [],
    }),
  };

  it('initializes with bounded default configuration', async () => {
    const pool = new ParallelWorkerPool(mockPrisma, {
      runQueue: mockRunQueue,
      config: { maxParallelRuns: 4 },
    });

    const state = await pool.getState();
    assert.equal(state.maxParallelRuns, 4);
    assert.equal(state.activeWorkers, 0);
  });

  it('clamps maxParallelRuns within [1, 16] bounds', async () => {
    const poolOver = new ParallelWorkerPool(mockPrisma, {
      runQueue: mockRunQueue,
      config: { maxParallelRuns: 99 },
    });
    const stateOver = await poolOver.getState();
    assert.equal(stateOver.maxParallelRuns, 16);

    const poolUnder = new ParallelWorkerPool(mockPrisma, {
      runQueue: mockRunQueue,
      config: { maxParallelRuns: 0 },
    });
    const stateUnder = await poolUnder.getState();
    assert.equal(stateUnder.maxParallelRuns, 1);
  });

  it('processes claimed run through orchestrator and updates active state', async () => {
    let executedRunId: string | null = null;
    const mockOrchestrator: any = {
      executeClaimedRun: async (run: any) => {
        executedRunId = run.id;
        return run;
      },
    };

    const pool = new ParallelWorkerPool(mockPrisma, {
      runQueue: mockRunQueue,
      orchestratorFactory: () => mockOrchestrator,
    });

    queuedRuns.push({
      id: '00000000-0000-0000-0000-000000000001',
      projectId: '00000000-0000-0000-0000-000000000002',
    });

    const processed = await pool.processNextRun('test-worker-1');
    assert.equal(processed, true);
    assert.equal(executedRunId, '00000000-0000-0000-0000-000000000001');
  });

  it('dynamically reconfigures pool bounds', async () => {
    const pool = new ParallelWorkerPool(mockPrisma, {
      runQueue: mockRunQueue,
      config: { maxParallelRuns: 2 },
    });

    pool.configure({ maxParallelRuns: 8 });
    const state = await pool.getState();
    assert.equal(state.maxParallelRuns, 8);
  });
});
