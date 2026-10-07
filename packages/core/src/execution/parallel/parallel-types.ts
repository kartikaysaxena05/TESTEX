/**
 * @file packages/core/src/execution/parallel/parallel-types.ts
 * Types and interfaces for Controlled Parallel Execution and Isolation Controls (V5 Phase 72).
 */

import type {
  ParallelWorkerPoolConfigDto,
  ParallelWorkerPoolStateDto,
} from '@ai-quality/contracts';

export const PARALLEL_BOUNDS = {
  DEFAULT_MAX_PARALLEL_RUNS: 4,
  MAX_PARALLEL_RUNS_LIMIT: 16,
  MIN_PARALLEL_RUNS: 1,
  DEFAULT_MAX_QUEUE_DEPTH: 100,
  MAX_QUEUE_DEPTH_LIMIT: 500,
  DEFAULT_WORKER_IDLE_TIMEOUT_MS: 10000,
  DEFAULT_LOCK_TIMEOUT_MS: 60000,
  MIN_LOCK_TIMEOUT_MS: 5000,
  MAX_LOCK_TIMEOUT_MS: 300000,
} as const;

export interface IResourceLockService {
  acquireLock(params: {
    projectId: string;
    resourceKey: string;
    testRunId: string;
    workerId: string;
    lockTimeoutMs?: number;
  }): Promise<boolean>;

  releaseLock(params: {
    projectId: string;
    resourceKey: string;
    testRunId: string;
  }): Promise<boolean>;

  releaseAllLocksForRun(testRunId: string): Promise<number>;

  cleanExpiredLocks(): Promise<number>;
}

export interface IParallelWorkerPool {
  start(): Promise<void>;
  stop(): Promise<void>;
  getState(projectId?: string): Promise<ParallelWorkerPoolStateDto>;
  configure(config: Partial<ParallelWorkerPoolConfigDto>): void;
}
