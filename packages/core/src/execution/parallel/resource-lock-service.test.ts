/**
 * @file packages/core/src/execution/parallel/resource-lock-service.test.ts
 * Unit tests for atomic resource locking and deadlock safety.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ResourceLockService } from './resource-lock-service.js';

describe('ResourceLockService', () => {
  // In-memory mock prisma for fast unit testing
  const locks: any[] = [];

  const mockPrisma: any = {
    executionResourceLock: {
      deleteMany: async (args: any) => {
        let count = 0;
        for (let i = locks.length - 1; i >= 0; i--) {
          const l = locks[i];
          const matchProject = !args.where.projectId || l.projectId === args.where.projectId;
          const matchKey = !args.where.resourceKey || l.resourceKey === args.where.resourceKey;
          const matchRun = !args.where.testRunId || l.testRunId === args.where.testRunId;
          const matchExp = !args.where.expiresAt?.lt || l.expiresAt < args.where.expiresAt.lt;

          if (matchProject && matchKey && matchRun && matchExp) {
            locks.splice(i, 1);
            count++;
          }
        }
        return { count };
      },
      create: async (args: any) => {
        const exists = locks.find(
          l => l.projectId === args.data.projectId && l.resourceKey === args.data.resourceKey,
        );
        if (exists) {
          throw new Error('Unique constraint violation');
        }
        const created = { id: `lock-${Date.now()}`, ...args.data };
        locks.push(created);
        return created;
      },
      findUnique: async (args: any) => {
        const { projectId, resourceKey } = args.where.projectId_resourceKey;
        return locks.find(l => l.projectId === projectId && l.resourceKey === resourceKey) || null;
      },
      update: async (args: any) => {
        const l = locks.find(item => item.id === args.where.id);
        if (l) {
          Object.assign(l, args.data);
          return l;
        }
        throw new Error('Lock not found');
      },
    },
  };

  const service = new ResourceLockService(mockPrisma);

  const projectId = '00000000-0000-0000-0000-000000000001';
  const resourceKey = 'settings-page-lock';
  const runA = '00000000-0000-0000-0000-00000000000a';
  const runB = '00000000-0000-0000-0000-00000000000b';

  it('acquires lock exclusively when not held', async () => {
    const acquired = await service.acquireLock({
      projectId,
      resourceKey,
      testRunId: runA,
      workerId: 'worker-1',
    });

    assert.equal(acquired, true);
  });

  it('rejects acquisition when lock is actively held by another run', async () => {
    const acquired = await service.acquireLock({
      projectId,
      resourceKey,
      testRunId: runB,
      workerId: 'worker-2',
    });

    assert.equal(acquired, false);
  });

  it('allows re-entrant acquisition / extension by the same run', async () => {
    const extended = await service.acquireLock({
      projectId,
      resourceKey,
      testRunId: runA,
      workerId: 'worker-1',
    });

    assert.equal(extended, true);
  });

  it('releases lock cleanly and allows subsequent acquisition by another run', async () => {
    const released = await service.releaseLock({
      projectId,
      resourceKey,
      testRunId: runA,
    });
    assert.equal(released, true);

    const acquiredByB = await service.acquireLock({
      projectId,
      resourceKey,
      testRunId: runB,
      workerId: 'worker-2',
    });
    assert.equal(acquiredByB, true);
  });

  it('releases all locks for a test run upon cleanup', async () => {
    await service.acquireLock({
      projectId,
      resourceKey: 'extra-resource-1',
      testRunId: runB,
      workerId: 'worker-2',
    });

    const releasedCount = await service.releaseAllLocksForRun(runB);
    assert.ok(releasedCount >= 2, `Should release at least 2 locks (got ${releasedCount})`);
  });
});
