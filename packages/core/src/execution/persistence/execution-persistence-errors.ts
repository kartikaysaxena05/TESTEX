/**
 * @file packages/core/src/execution/persistence/execution-persistence-errors.ts
 * Domain errors for execution persistence and step-level audit trail.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';
import { ExecutionDomainError } from '../execution-errors.js';

export class ExecutionNotFoundError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'EXECUTION_NOT_FOUND';
  constructor(executionId: string, projectId?: string) {
    super(
      `Execution '${executionId}' was not found${projectId ? ` in project '${projectId}'` : ''}.`,
      404,
      { executionId, projectId },
    );
  }
}

export class StepExecutionNotFoundError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'EXECUTION_STEP_NOT_FOUND';
  constructor(stepExecutionId: string, executionId?: string) {
    super(
      `Step execution '${stepExecutionId}' was not found${executionId ? ` in execution '${executionId}'` : ''}.`,
      404,
      { stepExecutionId, executionId },
    );
  }
}

export class ExecutionAlreadyTerminalError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'EXECUTION_ALREADY_TERMINAL';
  constructor(executionId: string, currentStatus: string, attemptedStatus: string) {
    super(
      `Cannot transition execution '${executionId}' from terminal status '${currentStatus}' to '${attemptedStatus}'.`,
      409,
      { executionId, currentStatus, attemptedStatus },
    );
  }
}

export class InvalidExecutionStateTransitionError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'INVALID_STATE_TRANSITION';
  constructor(fromStatus: string, toStatus: string, reason?: string) {
    super(
      `Invalid execution state transition from '${fromStatus}' to '${toStatus}'${reason ? `: ${reason}` : '.'}`,
      400,
      { fromStatus, toStatus, reason },
    );
  }
}

export class ExecutionPersistenceError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'EXECUTION_PERSISTENCE_ERROR';
  constructor(message: string, cause?: unknown) {
    super(message, 500, {
      cause: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

export class ExecutionOwnershipMismatchError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'EXECUTION_NOT_FOUND';
  constructor(
    entityType: string,
    entityId: string,
    expectedProjectId: string,
    actualProjectId: string,
  ) {
    super(
      `${entityType} '${entityId}' belongs to project '${actualProjectId}', not '${expectedProjectId}'.`,
      403,
      { entityType, entityId, expectedProjectId, actualProjectId },
    );
  }
}

export class ExecutionCorruptedHistoryError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'EXECUTION_CORRUPTED_HISTORY';
  constructor(message: string, details?: unknown) {
    super(message, 500, { details });
  }
}
