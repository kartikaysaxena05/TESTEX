/**
 * @file packages/core/src/agent-loop/agent-concurrency-manager.ts
 * In-process concurrency lock, control signaling & cancellation registry for V10 Phase 153 & Phase 157.
 *
 * Guarantees that no task can be concurrently executed by multiple agent loops,
 * and provides safe pause, stop, and cancel signaling without state corruption.
 */

import { AgentLoopConcurrentExecutionError } from './agent-loop-errors.js';
import type { AgentState } from './agent-state.js';

interface ActiveExecutionInfo {
  readonly projectId: string;
  readonly startedAt: Date;
  readonly abortController: AbortController;
  readonly state?: AgentState;
}

export class AgentConcurrencyManager {
  private static readonly activeExecutions = new Map<string, ActiveExecutionInfo>();

  /**
   * Acquires an execution lock for the given task.
   * Throws AgentLoopConcurrentExecutionError if already running.
   */
  public static acquireLock(
    taskId: string,
    projectId: string,
    state?: AgentState,
  ): AbortController {
    if (this.activeExecutions.has(taskId)) {
      throw new AgentLoopConcurrentExecutionError(taskId);
    }

    const abortController = new AbortController();
    this.activeExecutions.set(taskId, {
      projectId,
      startedAt: new Date(),
      abortController,
      state,
    });

    return abortController;
  }

  /**
   * Associates an active AgentState instance with a running lock.
   */
  public static registerState(taskId: string, state: AgentState): void {
    const existing = this.activeExecutions.get(taskId);
    if (existing) {
      this.activeExecutions.set(taskId, {
        ...existing,
        state,
      });
    }
  }

  /**
   * Releases the execution lock for the given task.
   */
  public static releaseLock(taskId: string): void {
    this.activeExecutions.delete(taskId);
  }

  /**
   * Checks if an execution is active for the given task.
   */
  public static isExecuting(taskId: string): boolean {
    return this.activeExecutions.has(taskId);
  }

  /**
   * Signals cancellation for an active execution.
   */
  public static cancelExecution(taskId: string, reason?: string): boolean {
    const active = this.activeExecutions.get(taskId);
    if (!active) {
      return false;
    }
    if (active.state) {
      active.state.requestCancellation(reason);
    }
    active.abortController.abort(reason ?? 'Execution cancelled');
    return true;
  }

  /**
   * Signals graceful pause for an active execution.
   */
  public static pauseExecution(taskId: string, reason?: string): boolean {
    const active = this.activeExecutions.get(taskId);
    if (!active) {
      return false;
    }
    if (active.state) {
      active.state.requestPause(reason);
    }
    return true;
  }

  /**
   * Signals graceful stop for an active execution.
   */
  public static stopExecution(taskId: string, reason?: string): boolean {
    const active = this.activeExecutions.get(taskId);
    if (!active) {
      return false;
    }
    if (active.state) {
      active.state.requestStop(reason);
    }
    return true;
  }

  /**
   * Cleans all active locks (useful for test environments).
   */
  public static clearAllForTest(): void {
    this.activeExecutions.clear();
  }
}
