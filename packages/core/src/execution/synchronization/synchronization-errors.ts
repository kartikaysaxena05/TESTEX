/**
 * @file packages/core/src/execution/synchronization/synchronization-errors.ts
 * Strongly typed domain errors for Phase 66 Synchronization Engine.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';
import { ExecutionDomainError } from '../execution-errors.js';

export class SynchronizationTimeoutError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'SYNCHRONIZATION_TIMEOUT';
  constructor(strategy: string, timeoutMs: number, reason?: string) {
    super(
      `Synchronization timeout after ${timeoutMs}ms using strategy '${strategy}'${reason ? `: ${reason}` : ''}`,
      408,
      { strategy, timeoutMs, reason },
    );
  }
}

export class NavigationTimeoutError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'NAVIGATION_TIMEOUT';
  constructor(urlPattern: string | undefined, timeoutMs: number, currentUrl?: string) {
    super(
      `Navigation timeout after ${timeoutMs}ms waiting for ${urlPattern ? `URL pattern '${urlPattern}'` : 'page navigation'}${currentUrl ? ` (current URL: ${currentUrl})` : ''}`,
      408,
      { urlPattern, timeoutMs, currentUrl },
    );
  }
}

export class ElementReadinessTimeoutError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'ELEMENT_READINESS_TIMEOUT';
  constructor(targetSummary: string, expectedState: string, timeoutMs: number) {
    super(
      `Element '${targetSummary}' failed to reach state '${expectedState}' within ${timeoutMs}ms`,
      408,
      { targetSummary, expectedState, timeoutMs },
    );
  }
}

export class ResponseWaitTimeoutError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'RESPONSE_WAIT_TIMEOUT';
  constructor(urlPattern: string | undefined, method: string | undefined, timeoutMs: number) {
    super(
      `Network response timeout after ${timeoutMs}ms waiting for ${method ?? 'ANY'} ${urlPattern ?? 'request'}`,
      408,
      { urlPattern, method, timeoutMs },
    );
  }
}

export class PopupTimeoutError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'POPUP_TIMEOUT';
  constructor(timeoutMs: number) {
    super(`Popup / new window was not opened within ${timeoutMs}ms`, 408, { timeoutMs });
  }
}

export class LoadingStateTimeoutError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'LOADING_STATE_TIMEOUT';
  constructor(selector: string, timeoutMs: number) {
    super(`Loading indicator '${selector}' did not disappear within ${timeoutMs}ms`, 408, {
      selector,
      timeoutMs,
    });
  }
}

export class CustomConditionTimeoutError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'CUSTOM_CONDITION_TIMEOUT';
  constructor(conditionKind: string, timeoutMs: number, details?: string) {
    super(
      `Custom condition '${conditionKind}' was not satisfied within ${timeoutMs}ms${details ? `: ${details}` : ''}`,
      408,
      { conditionKind, timeoutMs, details },
    );
  }
}

export class InvalidSynchronizationConfigError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'VALIDATION_ERROR';
  constructor(message: string, context?: Record<string, unknown>) {
    super(`Invalid synchronization configuration: ${message}`, 400, context);
  }
}
