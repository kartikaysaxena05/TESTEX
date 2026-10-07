/**
 * @file packages/core/src/execution/orchestration/orchestration-errors.ts
 * Strongly typed domain errors for test run orchestration, queue, state machine, and cancellation.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';
import { ExecutionDomainError } from '../execution-errors.js';

export class TestRunNotFoundError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'TEST_RUN_NOT_FOUND';
  constructor(runId: string, projectId: string) {
    super(`Test run '${runId}' was not found in project '${projectId}'.`, 404, {
      runId,
      projectId,
    });
  }
}

export class TestRunAlreadyTerminalError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'TEST_RUN_ALREADY_TERMINAL';
  constructor(runId: string, currentStatus: string, attemptedAction: string) {
    super(
      `Cannot perform '${attemptedAction}' on test run '${runId}' because it is already in terminal state '${currentStatus}'.`,
      409,
      { runId, currentStatus, attemptedAction },
    );
  }
}

export class TestRunInvalidStateTransitionError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'TEST_RUN_INVALID_STATE_TRANSITION';
  constructor(runId: string, fromStatus: string, toStatus: string) {
    super(
      `Invalid state transition for test run '${runId}': cannot transition from '${fromStatus}' to '${toStatus}'.`,
      400,
      { runId, fromStatus, toStatus },
    );
  }
}

export class TestRunQueueFullError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'TEST_RUN_QUEUE_FULL';
  constructor(projectId: string, currentDepth: number, maxDepth: number) {
    super(
      `Execution queue for project '${projectId}' is full (${currentDepth}/${maxDepth} active/queued items). Please wait for active runs to complete.`,
      429,
      { projectId, currentDepth, maxDepth },
    );
  }
}

export class TestRunCancellationRejectedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'TEST_RUN_CANCELLATION_REJECTED';
  constructor(runId: string, status: string, reason: string) {
    super(
      `Cancellation for test run '${runId}' in status '${status}' was rejected: ${reason}`,
      400,
      { runId, status, reason },
    );
  }
}

export class TestRunConcurrencyError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'TEST_RUN_CONCURRENCY_ERROR';
  constructor(runId: string, reason: string) {
    super(`Concurrent execution conflict for test run '${runId}': ${reason}`, 409, {
      runId,
      reason,
    });
  }
}

export class TestRunValidationError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'TEST_RUN_VALIDATION_ERROR';
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 400, context);
  }
}

export class TestRunPlanNotFoundError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'TEST_RUN_PLAN_NOT_FOUND';
  constructor(testCaseId: string, versionNumber: number) {
    super(
      `No compiled executable test plan found for test case '${testCaseId}' version ${versionNumber}. Please compile the test plan first.`,
      404,
      { testCaseId, versionNumber },
    );
  }
}

export class TestRunPlanNotExecutableError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'TEST_RUN_PLAN_NOT_EXECUTABLE';
  constructor(planId: string, status: string, diagnosticsCount: number) {
    super(
      `Executable test plan '${planId}' is in '${status}' status with ${diagnosticsCount} diagnostic(s) and cannot be executed.`,
      400,
      { planId, status, diagnosticsCount },
    );
  }
}

export class TestRunStaleError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'TEST_RUN_STALE_ERROR';
  constructor(testCaseId: string, reason: string) {
    super(`Test case '${testCaseId}' is stale and cannot be executed: ${reason}`, 400, {
      testCaseId,
      reason,
    });
  }
}
