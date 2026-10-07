/**
 * @file packages/core/src/execution/parallel/parallel-worker-pool.ts
 * Bounded parallel worker pool orchestrating concurrent isolated test runs with backpressure.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  ParallelWorkerPoolConfigDto,
  ParallelWorkerPoolStateDto,
  ParallelWorkerPoolActiveRunDto,
} from '@ai-quality/contracts';
import {
  PARALLEL_BOUNDS,
  type IParallelWorkerPool,
  type IResourceLockService,
} from './parallel-types.js';
import { ResourceLockService } from './resource-lock-service.js';
import { RunQueue } from '../orchestration/run-queue.js';
import { RunOrchestrator } from '../orchestration/run-orchestrator.js';
import type { ILogger } from '../../logging/index.js';

export interface ParallelWorkerPoolOptions {
  readonly config?: Partial<ParallelWorkerPoolConfigDto>;
  readonly runQueue?: RunQueue;
  readonly orchestratorFactory?: (workerId: string) => RunOrchestrator;
  readonly lockService?: IResourceLockService;
  readonly logger?: ILogger;
}

export class ParallelWorkerPool implements IParallelWorkerPool {
  private readonly prisma: PrismaClient;
  private readonly logger?: ILogger;
  private readonly runQueue: RunQueue;
  private readonly lockService: IResourceLockService;
  private readonly orchestratorFactory: (workerId: string) => RunOrchestrator;

  private maxParallelRuns: number;
  private maxQueueDepth: number;
  private workerIdleTimeoutMs: number;

  private isRunning: boolean = false;
  private activeWorkers: Map<string, { runId: string; projectId: string; startedAt: string }> =
    new Map();
  private workerLoops: Promise<void>[] = [];

  constructor(prisma: PrismaClient, options?: ParallelWorkerPoolOptions) {
    this.prisma = prisma;
    this.logger = options?.logger;
    this.maxParallelRuns = Math.min(
      Math.max(
        options?.config?.maxParallelRuns ?? PARALLEL_BOUNDS.DEFAULT_MAX_PARALLEL_RUNS,
        PARALLEL_BOUNDS.MIN_PARALLEL_RUNS,
      ),
      PARALLEL_BOUNDS.MAX_PARALLEL_RUNS_LIMIT,
    );
    this.maxQueueDepth = Math.min(
      Math.max(options?.config?.maxQueueDepth ?? PARALLEL_BOUNDS.DEFAULT_MAX_QUEUE_DEPTH, 1),
      PARALLEL_BOUNDS.MAX_QUEUE_DEPTH_LIMIT,
    );
    this.workerIdleTimeoutMs =
      options?.config?.workerIdleTimeoutMs ?? PARALLEL_BOUNDS.DEFAULT_WORKER_IDLE_TIMEOUT_MS;

    this.runQueue =
      options?.runQueue ??
      new RunQueue(
        prisma,
        {
          maxConcurrentRuns: this.maxParallelRuns,
          maxQueueDepth: this.maxQueueDepth,
        },
        options?.logger,
      );

    this.lockService = options?.lockService ?? new ResourceLockService(prisma, options?.logger);

    this.orchestratorFactory =
      options?.orchestratorFactory ??
      ((workerId: string) => new RunOrchestrator(prisma, { workerId }, undefined, options?.logger));
  }

  /**
   * Starts the parallel execution worker loops up to maxParallelRuns.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    this.logger?.info('parallel_worker_pool.started', {
      maxParallelRuns: this.maxParallelRuns,
      maxQueueDepth: this.maxQueueDepth,
    });

    // Spawn concurrent worker loops
    this.workerLoops = [];
    for (let i = 0; i < this.maxParallelRuns; i++) {
      const workerId = `pool-worker-${process.pid}-${i + 1}`;
      this.workerLoops.push(this.runWorkerLoop(workerId));
    }
  }

  /**
   * Gracefully stops the worker pool loops.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    this.logger?.info('parallel_worker_pool.stopping', {
      activeWorkers: this.activeWorkers.size,
    });

    await Promise.allSettled(this.workerLoops);
    this.workerLoops = [];
  }

  /**
   * Updates configuration dynamically.
   */
  public configure(config: Partial<ParallelWorkerPoolConfigDto>): void {
    if (config.maxParallelRuns !== undefined) {
      this.maxParallelRuns = Math.min(
        Math.max(config.maxParallelRuns, PARALLEL_BOUNDS.MIN_PARALLEL_RUNS),
        PARALLEL_BOUNDS.MAX_PARALLEL_RUNS_LIMIT,
      );
    }
    if (config.maxQueueDepth !== undefined) {
      this.maxQueueDepth = Math.min(
        Math.max(config.maxQueueDepth, 1),
        PARALLEL_BOUNDS.MAX_QUEUE_DEPTH_LIMIT,
      );
    }
    if (config.workerIdleTimeoutMs !== undefined) {
      this.workerIdleTimeoutMs = config.workerIdleTimeoutMs;
    }
  }

  /**
   * Dispatches a single step/iteration of queue claiming and execution for a worker.
   * Exposed for testing and fine-grained scheduling.
   */
  public async processNextRun(workerId: string, projectId?: string): Promise<boolean> {
    const claimedRun = await this.runQueue.claimNextRun(workerId, projectId);
    if (!claimedRun) {
      return false;
    }

    const startedAt = new Date().toISOString();
    this.activeWorkers.set(workerId, {
      runId: claimedRun.id,
      projectId: claimedRun.projectId,
      startedAt,
    });

    try {
      const orchestrator = this.orchestratorFactory(workerId);
      await orchestrator.executeClaimedRun(claimedRun);
      return true;
    } catch (err) {
      this.logger?.error('parallel_worker_pool.run_failed', {
        runId: claimedRun.id,
        workerId,
        error: String(err),
      });
      return false;
    } finally {
      this.activeWorkers.delete(workerId);
      await this.lockService.releaseAllLocksForRun(claimedRun.id);
    }
  }

  /**
   * Retrieves current pool metrics and active run details.
   */
  public async getState(projectId?: string): Promise<ParallelWorkerPoolStateDto> {
    const queueState = await this.runQueue.getQueueState(projectId ?? '');

    const activeRuns: ParallelWorkerPoolActiveRunDto[] = Array.from(
      this.activeWorkers.entries(),
    ).map(([workerId, data]) => ({
      workerId,
      runId: data.runId,
      projectId: data.projectId,
      startedAt: data.startedAt,
    }));

    return {
      activeWorkers: this.activeWorkers.size,
      maxParallelRuns: this.maxParallelRuns,
      activeRuns,
      queuedCount: queueState.queuedCount,
      preparingCount: queueState.preparingCount,
      runningCount: queueState.runningCount,
    };
  }

  private async runWorkerLoop(workerId: string): Promise<void> {
    while (this.isRunning) {
      try {
        const executed = await this.processNextRun(workerId);
        if (!executed) {
          // No job available, back off for a brief period
          await this.delay(200);
        }
      } catch (err) {
        this.logger?.warn('parallel_worker_loop.error', { workerId, error: String(err) });
        await this.delay(500);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
