/**
 * @file packages/core/src/execution/locators/locator-errors.ts
 * Strongly typed error hierarchy for the UI Element Resolution & Locator Intelligence Engine (V5 Phase 64).
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';
import { ExecutionDomainError } from '../execution-errors.js';

export class LocatorInvalidTargetError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'LOCATOR_INVALID_TARGET';
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 400, context);
  }
}

export class LocatorNotFoundError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'LOCATOR_NOT_FOUND';
  constructor(targetDescription: string, timeoutMs?: number) {
    const timeoutMsg = timeoutMs ? ` within ${timeoutMs}ms timeout` : '';
    super(`Target element '${targetDescription}' was not found in the DOM${timeoutMsg}.`, 404, {
      targetDescription,
      timeoutMs,
    });
  }
}

export class LocatorAmbiguousError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'LOCATOR_AMBIGUOUS';
  constructor(targetDescription: string, matchCount: number) {
    super(
      `Target descriptor '${targetDescription}' is ambiguous: resolved ${matchCount} matching elements. Strict resolution requires exactly 1 match or an explicit valid ordinal.`,
      422,
      { targetDescription, matchCount },
    );
  }
}

export class LocatorTimeoutError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'LOCATOR_TIMEOUT';
  constructor(targetDescription: string, timeoutMs: number) {
    super(`Locator resolution for '${targetDescription}' timed out after ${timeoutMs}ms.`, 408, {
      targetDescription,
      timeoutMs,
    });
  }
}

export class LocatorUnsupportedStrategyError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'LOCATOR_UNSUPPORTED_STRATEGY';
  constructor(strategy: string) {
    super(`Locator strategy '${strategy}' is unsupported or invalid.`, 400, { strategy });
  }
}

export class LocatorScopeNotFoundError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'LOCATOR_SCOPE_NOT_FOUND';
  constructor(scopeType: string, scopeName?: string) {
    const nameMsg = scopeName ? ` '${scopeName}'` : '';
    super(`Enclosing scope ${scopeType}${nameMsg} was not found on the page.`, 404, {
      scopeType,
      scopeName,
    });
  }
}

export class LocatorFrameNotFoundError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'LOCATOR_FRAME_NOT_FOUND';
  constructor(frameDescription: string) {
    super(`Target iframe/frame '${frameDescription}' was not found in the page document.`, 404, {
      frameDescription,
    });
  }
}

export class LocatorFrameAmbiguousError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'LOCATOR_FRAME_AMBIGUOUS';
  constructor(frameDescription: string, matchCount: number) {
    super(
      `Target iframe/frame descriptor '${frameDescription}' is ambiguous: matched ${matchCount} frames.`,
      422,
      { frameDescription, matchCount },
    );
  }
}

export class LocatorCancelledError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'LOCATOR_CANCELLED';
  constructor(message = 'Locator resolution was cancelled.') {
    super(message, 499);
  }
}

export class LocatorPageClosedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'LOCATOR_PAGE_CLOSED';
  constructor(message = 'Browser page was closed during locator resolution.') {
    super(message, 400);
  }
}

export class LocatorContextClosedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'LOCATOR_CONTEXT_CLOSED';
  constructor(message = 'Browser context was closed during locator resolution.') {
    super(message, 400);
  }
}
