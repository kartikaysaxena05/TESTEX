/**
 * @file packages/core/src/execution/actions/action-errors.ts
 * Strongly typed domain error hierarchy for the Action Execution Engine (V5 Phase 63).
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';
import { ExecutionDomainError } from '../execution-errors.js';

export class PageNotAvailableError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'PAGE_NOT_AVAILABLE';
  constructor(message = 'Target browser page is closed, crashed, or not available.') {
    super(message, 400);
  }
}

export class ContextClosedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'CONTEXT_CLOSED';
  constructor(message = 'Browser context has been closed or destroyed.') {
    super(message, 400);
  }
}

export class TargetNotFoundError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'TARGET_NOT_FOUND';
  constructor(targetDescription: string, timeoutMs?: number) {
    const timeoutMsg = timeoutMs ? ` within ${timeoutMs}ms timeout` : '';
    super(`Target element '${targetDescription}' was not found in the DOM${timeoutMsg}.`, 404, {
      targetDescription,
      timeoutMs,
    });
  }
}

export class TargetAmbiguousError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'TARGET_AMBIGUOUS';
  constructor(targetDescription: string, matchCount: number) {
    super(
      `Target descriptor '${targetDescription}' is ambiguous: resolved ${matchCount} matching elements. Strict resolution requires exactly 1 match.`,
      422,
      { targetDescription, matchCount },
    );
  }
}

export class TargetNotVisibleError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'TARGET_NOT_VISIBLE';
  constructor(targetDescription: string) {
    super(`Target element '${targetDescription}' is hidden or not visible for interaction.`, 422, {
      targetDescription,
    });
  }
}

export class TargetDisabledError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'TARGET_DISABLED';
  constructor(targetDescription: string) {
    super(
      `Target element '${targetDescription}' is disabled and cannot receive user events.`,
      422,
      { targetDescription },
    );
  }
}

export class ActionTimeoutError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'ACTION_TIMEOUT';
  constructor(actionType: string, timeoutMs: number, detail?: string) {
    const extra = detail ? `: ${detail}` : '';
    super(`Action '${actionType}' timed out after ${timeoutMs}ms${extra}.`, 408, {
      actionType,
      timeoutMs,
      detail,
    });
  }
}

export class NavigationRejectedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'NAVIGATION_REJECTED';
  constructor(url: string, reason: string) {
    super(`Navigation to '${url}' was rejected: ${reason}`, 403, { url, reason });
  }
}

export class InvalidActionError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'INVALID_ACTION';
  constructor(message: string) {
    super(message, 400);
  }
}

export class InvalidActionValueError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'INVALID_ACTION_VALUE';
  constructor(message: string) {
    super(message, 400);
  }
}

export class ActionExecutionUnsupportedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'UNSUPPORTED_ACTION';
  constructor(actionType: string) {
    super(
      `Action type '${actionType}' is not supported or not implemented by the Action Execution Engine.`,
      400,
      { actionType },
    );
  }
}

export class PlaywrightActionError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'PLAYWRIGHT_ERROR';
  constructor(message: string) {
    super(message, 500);
  }
}

export class ActionCancelledError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'ACTION_CANCELLED';
  constructor(message = 'Action execution was cancelled by user or run coordinator.') {
    super(message, 499);
  }
}

export class CrossRunExecutionError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'CROSS_RUN_EXECUTION_ERROR';
  constructor(message: string) {
    super(message, 403);
  }
}

export class DestructiveActionProhibitedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'DESTRUCTIVE_ACTION_PROHIBITED';
  constructor(actionType: string, environmentName?: string) {
    const envMsg = environmentName ? ` in environment '${environmentName}'` : '';
    super(`Destructive action '${actionType}' is prohibited${envMsg} by safety policy.`, 403, {
      actionType,
      environmentName,
    });
  }
}

export class FileNotAllowedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'FILE_NOT_ALLOWED';
  constructor(filePath: string, reason: string) {
    super(`File '${filePath}' is not permitted for upload: ${reason}`, 403, { filePath, reason });
  }
}

export class ElementNotActionableError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'ELEMENT_NOT_ACTIONABLE';
  constructor(targetDescription: string, reason: string) {
    super(`Element '${targetDescription}' is not actionable: ${reason}`, 422, {
      targetDescription,
      reason,
    });
  }
}

export class TargetNotResolvedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'TARGET_NOT_RESOLVED';
  constructor(targetDescription: string, reason: string) {
    super(`Target '${targetDescription}' could not be resolved: ${reason}`, 422, {
      targetDescription,
      reason,
    });
  }
}
