/**
 * @file packages/core/src/execution/parallel/parallel-errors.ts
 * Domain errors for Parallel Execution and Isolation Controls (V5 Phase 72).
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';
import { ExecutionDomainError } from '../execution-errors.js';

export class ParallelExecutionError extends ExecutionDomainError {
  public override readonly code: DesktopErrorCode = 'INTERNAL_ERROR';

  constructor(message: string, status = 500, context?: Record<string, unknown>) {
    super(message, status, context);
    this.name = 'ParallelExecutionError';
  }
}

export class ResourceLockContentionError extends ParallelExecutionError {
  public override readonly code: DesktopErrorCode = 'TEST_RUN_CONCURRENCY_ERROR';

  constructor(resourceKey: string, heldByRunId: string) {
    super(
      `Resource lock '${resourceKey}' is currently held by active test run '${heldByRunId}'. Execution serialized.`,
      409,
      { resourceKey, heldByRunId },
    );
    this.name = 'ResourceLockContentionError';
  }
}

export class ConcurrencyLimitExceededError extends ParallelExecutionError {
  public override readonly code: DesktopErrorCode = 'EXECUTION_CONCURRENCY_LIMIT';

  constructor(currentActive: number, maxAllowed: number) {
    super(
      `Parallel execution capacity reached: ${currentActive} active runs (max: ${maxAllowed}).`,
      429,
      { currentActive, maxAllowed },
    );
    this.name = 'ConcurrencyLimitExceededError';
  }
}
