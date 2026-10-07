/**
 * @file packages/core/src/execution/parallel/resource-lock-service.ts
 * Atomic resource locking service preventing state contention across concurrent test runs.
 */

import type { PrismaClient } from '@prisma/client';
import { PARALLEL_BOUNDS, type IResourceLockService } from './parallel-types.js';
import type { ILogger } from '../../logging/index.js';

export class ResourceLockService implements IResourceLockService {
  private readonly prisma: PrismaClient;
  private readonly logger?: ILogger;

  constructor(prisma: PrismaClient, logger?: ILogger) {
    this.prisma = prisma;
    this.logger = logger;
  }

  /**
   * Attempts atomic acquisition of an exclusive resource lock.
   * Returns true if lock was successfully acquired, false if held by another active run.
   */
  public async acquireLock(params: {
    projectId: string;
    resourceKey: string;
    testRunId: string;
    workerId: string;
    lockTimeoutMs?: number;
  }): Promise<boolean> {
    const timeout = Math.min(
      Math.max(
        params.lockTimeoutMs ?? PARALLEL_BOUNDS.DEFAULT_LOCK_TIMEOUT_MS,
        PARALLEL_BOUNDS.MIN_LOCK_TIMEOUT_MS,
      ),
      PARALLEL_BOUNDS.MAX_LOCK_TIMEOUT_MS,
    );
    const now = new Date();
    const expiresAt = new Date(now.getTime() + timeout);

    try {
      // 1. Clean expired lock for this resource key if any
      await this.prisma.executionResourceLock.deleteMany({
        where: {
          projectId: params.projectId,
          resourceKey: params.resourceKey,
          expiresAt: { lt: now },
        },
      });

      // 2. Try to create new lock record
      await this.prisma.executionResourceLock.create({
        data: {
          projectId: params.projectId,
          resourceKey: params.resourceKey,
          testRunId: params.testRunId,
          workerId: params.workerId,
          acquiredAt: now,
          expiresAt,
        },
      });

      this.logger?.info('resource_lock.acquired', {
        projectId: params.projectId,
        resourceKey: params.resourceKey,
        testRunId: params.testRunId,
        expiresAt: expiresAt.toISOString(),
      });

      return true;
    } catch {
      // Check if already held by this same test run (re-entrant / extension)
      const existing = await this.prisma.executionResourceLock.findUnique({
        where: {
          projectId_resourceKey: {
            projectId: params.projectId,
            resourceKey: params.resourceKey,
          },
        },
      });

      if (existing && existing.testRunId === params.testRunId) {
        await this.prisma.executionResourceLock.update({
          where: { id: existing.id },
          data: { expiresAt },
        });
        return true;
      }

      this.logger?.warn('resource_lock.contention', {
        projectId: params.projectId,
        resourceKey: params.resourceKey,
        heldByRunId: existing?.testRunId,
      });

      return false;
    }
  }

  /**
   * Releases a specific resource lock held by a test run.
   */
  public async releaseLock(params: {
    projectId: string;
    resourceKey: string;
    testRunId: string;
  }): Promise<boolean> {
    try {
      const res = await this.prisma.executionResourceLock.deleteMany({
        where: {
          projectId: params.projectId,
          resourceKey: params.resourceKey,
          testRunId: params.testRunId,
        },
      });

      this.logger?.info('resource_lock.released', {
        projectId: params.projectId,
        resourceKey: params.resourceKey,
        testRunId: params.testRunId,
        released: res.count > 0,
      });

      return res.count > 0;
    } catch {
      return false;
    }
  }

  /**
   * Releases all resource locks held by a given test run upon completion, crash, or cancellation.
   */
  public async releaseAllLocksForRun(testRunId: string): Promise<number> {
    try {
      const res = await this.prisma.executionResourceLock.deleteMany({
        where: { testRunId },
      });

      if (res.count > 0) {
        this.logger?.info('resource_lock.all_released', {
          testRunId,
          count: res.count,
        });
      }

      return res.count;
    } catch {
      return 0;
    }
  }

  /**
   * Cleans any expired locks across all projects.
   */
  public async cleanExpiredLocks(): Promise<number> {
    const now = new Date();
    const res = await this.prisma.executionResourceLock.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    });

    return res.count;
  }
}
