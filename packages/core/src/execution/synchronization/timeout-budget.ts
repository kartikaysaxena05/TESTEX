/**
 * @file packages/core/src/execution/synchronization/timeout-budget.ts
 * Budgeted monotonic deadline tracker for multi-phase step synchronization.
 */

import { SYNCHRONIZATION_BOUNDS, type ITimeoutBudgetTracker } from './synchronization-types.js';
import { SynchronizationTimeoutError } from './synchronization-errors.js';

export class TimeoutBudgetTracker implements ITimeoutBudgetTracker {
  private readonly startTime: number;
  private readonly totalBudgetMs: number;

  constructor(totalBudgetMs: number) {
    // Bound budget to valid range
    const bounded =
      Number.isFinite(totalBudgetMs) && totalBudgetMs > 0
        ? Math.min(
            Math.max(totalBudgetMs, SYNCHRONIZATION_BOUNDS.MIN_TIMEOUT_MS),
            SYNCHRONIZATION_BOUNDS.MAX_TIMEOUT_MS,
          )
        : SYNCHRONIZATION_BOUNDS.DEFAULT_TIMEOUT_MS;

    this.totalBudgetMs = bounded;
    this.startTime = performance.now();
  }

  public getElapsedMs(): number {
    return Math.max(0, Math.round(performance.now() - this.startTime));
  }

  public getRemainingTimeoutMs(allocatedTimeoutMs?: number): number {
    const elapsed = this.getElapsedMs();
    const remainingBudget = Math.max(0, this.totalBudgetMs - elapsed);

    if (
      allocatedTimeoutMs !== undefined &&
      Number.isFinite(allocatedTimeoutMs) &&
      allocatedTimeoutMs > 0
    ) {
      return Math.min(allocatedTimeoutMs, remainingBudget);
    }

    return remainingBudget;
  }

  public isExpired(): boolean {
    return this.getElapsedMs() >= this.totalBudgetMs;
  }

  public assertNotExpired(contextMessage?: string): void {
    if (this.isExpired()) {
      throw new SynchronizationTimeoutError(
        'BUDGET_EXCEEDED',
        this.totalBudgetMs,
        contextMessage ?? 'Step timeout budget exhausted during multi-phase synchronization',
      );
    }
  }
}
