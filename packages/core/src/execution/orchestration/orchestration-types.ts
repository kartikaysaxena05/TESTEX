/**
 * @file packages/core/src/execution/orchestration/orchestration-types.ts
 * Types, bounds, and interfaces for test run orchestration, queue, and state machine.
 */

import type {
  ExecutionStatus,
  TestRunDto,
  TestRunQueueStateDto,
  TestRunStatus,
} from '@ai-quality/contracts';

export { ExecutionStatus, TestRunDto, TestRunQueueStateDto, TestRunStatus };

export const ORCHESTRATION_BOUNDS = {
  DEFAULT_MAX_CONCURRENT_RUNS: 1,
  MAX_CONCURRENT_RUNS_LIMIT: 10,
  DEFAULT_MAX_QUEUE_DEPTH: 100,
  MAX_QUEUE_DEPTH_LIMIT: 1000,
  DEFAULT_LEASE_TIMEOUT_MS: 60000,
  DEFAULT_HEARTBEAT_INTERVAL_MS: 10000,
  DEFAULT_RUN_TIMEOUT_MS: 60000,
  ORPHANED_RUN_RECOVERY_BUFFER_MS: 30000,
} as const;

export interface RunClaimLease {
  readonly runId: string;
  readonly workerId: string;
  readonly leaseExpiresAt: Date;
}

export interface ExecutionWorkerResult {
  readonly outcome: 'PASSED' | 'FAILED' | 'BLOCKED' | 'AUTOMATION_ERROR' | 'CANCELLED';
  readonly terminalReason?: string;
  readonly errorMessage?: string;
  readonly errorCode?: string;
  readonly diagnostics?: readonly unknown[];
  readonly durationMs: number;
}

export interface IExecutionWorker {
  readonly workerId: string;
  execute(run: TestRunDto, abortSignal: AbortSignal): Promise<ExecutionWorkerResult>;
}

export interface RunOrchestratorConfig {
  readonly maxConcurrentRuns?: number;
  readonly maxQueueDepth?: number;
  readonly leaseTimeoutMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly workerId?: string;
}
