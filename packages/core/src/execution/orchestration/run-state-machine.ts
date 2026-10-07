/**
 * @file packages/core/src/execution/orchestration/run-state-machine.ts
 * Authoritative state machine governing test run lifecycle, valid state transitions, and terminal immutability.
 */

import type { ExecutionStatus, TestRunStatus } from '@ai-quality/contracts';
import {
  TestRunAlreadyTerminalError,
  TestRunInvalidStateTransitionError,
} from './orchestration-errors.js';

export const TERMINAL_TEST_RUN_STATUSES: ReadonlySet<TestRunStatus> = new Set<TestRunStatus>([
  'PASSED',
  'FAILED',
  'BLOCKED',
  'AUTOMATION_ERROR',
  'CANCELLED',
]);

export const ACTIVE_TEST_RUN_STATUSES: ReadonlySet<TestRunStatus> = new Set<TestRunStatus>([
  'QUEUED',
  'PREPARING',
  'RUNNING',
]);

const VALID_TRANSITIONS: ReadonlyMap<TestRunStatus, ReadonlySet<TestRunStatus>> = new Map<
  TestRunStatus,
  ReadonlySet<TestRunStatus>
>([
  ['QUEUED', new Set<TestRunStatus>(['PREPARING', 'CANCELLED'])],
  ['PREPARING', new Set<TestRunStatus>(['RUNNING', 'BLOCKED', 'AUTOMATION_ERROR', 'CANCELLED'])],
  [
    'RUNNING',
    new Set<TestRunStatus>(['PASSED', 'FAILED', 'BLOCKED', 'AUTOMATION_ERROR', 'CANCELLED']),
  ],
  ['PASSED', new Set<TestRunStatus>()],
  ['FAILED', new Set<TestRunStatus>()],
  ['BLOCKED', new Set<TestRunStatus>()],
  ['AUTOMATION_ERROR', new Set<TestRunStatus>()],
  ['CANCELLED', new Set<TestRunStatus>()],
]);

export class RunStateMachine {
  /**
   * Checks whether the given status is a terminal state.
   */
  public static isTerminal(status: TestRunStatus | ExecutionStatus): boolean {
    return TERMINAL_TEST_RUN_STATUSES.has(status as TestRunStatus);
  }

  /**
   * Checks whether the given status is an active (in-flight) state.
   */
  public static isActive(status: TestRunStatus | ExecutionStatus): boolean {
    return ACTIVE_TEST_RUN_STATUSES.has(status as TestRunStatus);
  }

  /**
   * Returns true if transitioning from `fromStatus` to `toStatus` is strictly permitted.
   */
  public static isValidTransition(
    fromStatus: TestRunStatus | ExecutionStatus,
    toStatus: TestRunStatus | ExecutionStatus,
  ): boolean {
    const allowed = VALID_TRANSITIONS.get(fromStatus as TestRunStatus);
    return allowed ? allowed.has(toStatus as TestRunStatus) : false;
  }

  /**
   * Asserts that a transition from `fromStatus` to `toStatus` is valid for `runId`.
   * Throws `TestRunAlreadyTerminalError` if the current state is terminal.
   * Throws `TestRunInvalidStateTransitionError` if the transition is not allowed.
   */
  public static assertValidTransition(
    runId: string,
    fromStatus: TestRunStatus | ExecutionStatus,
    toStatus: TestRunStatus | ExecutionStatus,
  ): void {
    if (this.isTerminal(fromStatus)) {
      throw new TestRunAlreadyTerminalError(runId, fromStatus, `transition to '${toStatus}'`);
    }

    if (!this.isValidTransition(fromStatus, toStatus)) {
      throw new TestRunInvalidStateTransitionError(runId, fromStatus, toStatus);
    }
  }

  /**
   * Returns the list of valid next statuses from a given current status.
   */
  public static getValidNextStatuses(
    currentStatus: TestRunStatus | ExecutionStatus,
  ): readonly TestRunStatus[] {
    const allowed = VALID_TRANSITIONS.get(currentStatus as TestRunStatus);
    return allowed ? Array.from(allowed) : [];
  }
}
