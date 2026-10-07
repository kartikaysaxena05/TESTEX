/**
 * @file packages/core/src/execution/orchestration/run-queue.ts
 * Bounded FIFO execution queue with atomic lease claim semantics, concurrency limits, and state inspection.
 */

import type { PrismaClient, TestRun } from '@prisma/client';
import type { TestRunQueueStateDto } from '@ai-quality/contracts';
import { ORCHESTRATION_BOUNDS } from './orchestration-types.js';
import { TestRunQueueFullError } from './orchestration-errors.js';
import type { ILogger } from '../../logging/index.js';

export interface RunQueueOptions {
  readonly maxConcurrentRuns?: number;
  readonly maxQueueDepth?: number;
  readonly leaseTimeoutMs?: number;
}

export class RunQueue {
  private readonly prisma: PrismaClient;
  private readonly logger?: ILogger;
  public readonly maxConcurrentRuns: number;
  public readonly maxQueueDepth: number;
  public readonly defaultLeaseTimeoutMs: number;

  constructor(prisma: PrismaClient, options?: RunQueueOptions, logger?: ILogger) {
    this.prisma = prisma;
    this.logger = logger;
    this.maxConcurrentRuns = Math.min(
      Math.max(1, options?.maxConcurrentRuns ?? ORCHESTRATION_BOUNDS.DEFAULT_MAX_CONCURRENT_RUNS),
      ORCHESTRATION_BOUNDS.MAX_CONCURRENT_RUNS_LIMIT,
    );
    this.maxQueueDepth = Math.min(
      Math.max(1, options?.maxQueueDepth ?? ORCHESTRATION_BOUNDS.DEFAULT_MAX_QUEUE_DEPTH),
      ORCHESTRATION_BOUNDS.MAX_QUEUE_DEPTH_LIMIT,
    );
    this.defaultLeaseTimeoutMs =
      options?.leaseTimeoutMs ?? ORCHESTRATION_BOUNDS.DEFAULT_LEASE_TIMEOUT_MS;
  }

  /**
   * Asserts that the project queue has remaining capacity.
   * Throws `TestRunQueueFullError` if the queue is full.
   */
  public async assertCapacity(projectId: string): Promise<void> {
    const activeAndQueuedCount = await this.prisma.testRun.count({
      where: {
        projectId,
        status: { in: ['QUEUED', 'PREPARING', 'RUNNING'] },
      },
    });

    if (activeAndQueuedCount >= this.maxQueueDepth) {
      throw new TestRunQueueFullError(projectId, activeAndQueuedCount, this.maxQueueDepth);
    }
  }

  /**
   * Checks if active executions for a project or globally have reached the concurrency limit.
   */
  public async hasAvailableExecutionSlot(projectId?: string): Promise<boolean> {
    const whereClause: any = {
      status: { in: ['PREPARING', 'RUNNING'] },
    };
    if (projectId) {
      whereClause.projectId = projectId;
    }

    const activeCount = await this.prisma.testRun.count({ where: whereClause });
    return activeCount < this.maxConcurrentRuns;
  }

  /**
   * Atomically claims the next queued test run for the given worker.
   * Enforces FIFO deterministic ordering and transactional single-claim guarantee.
   */
  public async claimNextRun(
    workerId: string,
    projectId?: string,
    leaseTimeoutMs?: number,
  ): Promise<TestRun | null> {
    const hasSlot = await this.hasAvailableExecutionSlot(projectId);
    if (!hasSlot) {
      return null;
    }

    const whereClause: any = {
      status: 'QUEUED',
    };
    if (projectId) {
      whereClause.projectId = projectId;
    }

    // 1. Find candidate queued runs in deterministic FIFO order
    const candidates = await this.prisma.testRun.findMany({
      where: whereClause,
      orderBy: [{ queuedAt: 'asc' }, { id: 'asc' }],
      take: 10,
    });

    if (candidates.length === 0) {
      return null;
    }

    const now = new Date();
    const leaseDuration = leaseTimeoutMs ?? this.defaultLeaseTimeoutMs;
    const leaseExpiresAt = new Date(now.getTime() + leaseDuration);

    // 2. Attempt atomic claim on candidates one-by-one via conditional update
    for (const candidate of candidates) {
      const claimResult = await this.prisma.testRun.updateMany({
        where: {
          id: candidate.id,
          status: 'QUEUED',
        },
        data: {
          status: 'PREPARING',
          workerId,
          leaseExpiresAt,
          heartbeatAt: now,
        },
      });

      if (claimResult.count === 1) {
        // Successfully and exclusively claimed
        const claimedRecord = await this.prisma.testRun.findUnique({
          where: { id: candidate.id },
        });

        this.logger?.info('run_queue.claimed', {
          runId: candidate.id,
          projectId: candidate.projectId,
          testCaseId: candidate.testCaseId,
          workerId,
          leaseExpiresAt: leaseExpiresAt.toISOString(),
        });

        return claimedRecord;
      }
      // Otherwise, another worker claimed or cancelled it concurrently. Continue to next candidate.
    }

    return null;
  }

  /**
   * Updates worker heartbeat and extends the lease expiration for an active run.
   */
  public async heartbeat(
    runId: string,
    workerId: string,
    leaseTimeoutMs?: number,
  ): Promise<boolean> {
    const now = new Date();
    const leaseDuration = leaseTimeoutMs ?? this.defaultLeaseTimeoutMs;
    const leaseExpiresAt = new Date(now.getTime() + leaseDuration);

    const updateResult = await this.prisma.testRun.updateMany({
      where: {
        id: runId,
        workerId,
        status: { in: ['PREPARING', 'RUNNING'] },
      },
      data: {
        heartbeatAt: now,
        leaseExpiresAt,
      },
    });

    return updateResult.count === 1;
  }

  /**
   * Retrieves the current queue metrics and state for a project.
   */
  public async getQueueState(projectId: string): Promise<TestRunQueueStateDto> {
    const [queuedCount, preparingCount, runningCount, activeWorkers] = await Promise.all([
      this.prisma.testRun.count({ where: { projectId, status: 'QUEUED' } }),
      this.prisma.testRun.count({ where: { projectId, status: 'PREPARING' } }),
      this.prisma.testRun.count({ where: { projectId, status: 'RUNNING' } }),
      this.prisma.testRun.findMany({
        where: {
          projectId,
          status: { in: ['PREPARING', 'RUNNING'] },
          workerId: { not: null },
        },
        select: { workerId: true },
        distinct: ['workerId'],
      }),
    ]);

    const totalActive = queuedCount + preparingCount + runningCount;
    const isQueueFull = totalActive >= this.maxQueueDepth;
    const activeWorkerIds = activeWorkers
      .map(w => w.workerId)
      .filter((id): id is string => id !== null);

    return {
      queuedCount,
      preparingCount,
      runningCount,
      maxConcurrentRuns: this.maxConcurrentRuns,
      maxQueueDepth: this.maxQueueDepth,
      isQueueFull,
      activeWorkerIds,
    };
  }
}
