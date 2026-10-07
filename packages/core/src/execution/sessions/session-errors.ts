/**
 * @file packages/core/src/execution/sessions/session-errors.ts
 * Domain errors for browser context, session lifecycle, and authentication management.
 */

import { ExecutionDomainError } from '../execution-errors.js';
import type { DesktopErrorCode } from '@ai-quality/contracts';

export class AuthProfileNotFoundError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'AUTH_PROFILE_NOT_FOUND';
  constructor(profileId: string, projectId: string) {
    super(`Authentication profile '${profileId}' not found in project '${projectId}'`, 404, {
      profileId,
      projectId,
    });
  }
}

export class AuthProfileProjectMismatchError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'AUTH_PROFILE_PROJECT_MISMATCH';
  constructor(profileId: string, requestedProjectId: string, actualProjectId: string) {
    super(
      `Authentication profile '${profileId}' belongs to project '${actualProjectId}', not requested project '${requestedProjectId}'`,
      403,
      { profileId, requestedProjectId, actualProjectId },
    );
  }
}

export class AuthProfileDuplicateNameError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'AUTH_PROFILE_DUPLICATE_NAME';
  constructor(name: string, projectId: string) {
    super(
      `An authentication profile named '${name}' already exists in project '${projectId}'`,
      409,
      {
        name,
        projectId,
      },
    );
  }
}

export class AuthProfileValidationError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'AUTH_PROFILE_VALIDATION_ERROR';
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 400, context);
  }
}

export class AuthStrategyUnsupportedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'AUTH_STRATEGY_UNSUPPORTED';
  constructor(strategy: string) {
    super(
      `Authentication strategy '${strategy}' is currently unsupported or requires manual configuration.`,
      400,
      {
        strategy,
      },
    );
  }
}

export class AuthenticationRejectedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'AUTHENTICATION_REJECTED';
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 401, context);
  }
}

export class AuthenticationTimeoutError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'AUTHENTICATION_TIMEOUT';
  constructor(timeoutMs: number, operation = 'authentication') {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, 408, {
      timeoutMs,
      operation,
    });
  }
}

export class SessionValidationFailedError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'SESSION_VALIDATION_FAILED';
  constructor(reason: string, context?: Record<string, unknown>) {
    super(`Authentication session validation failed: ${reason}`, 400, {
      reason,
      ...context,
    });
  }
}

export class StorageStateInvalidError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'STORAGE_STATE_INVALID';
  constructor(reason: string, context?: Record<string, unknown>) {
    super(`Storage state is invalid or corrupted: ${reason}`, 400, {
      reason,
      ...context,
    });
  }
}

export class StorageStateNotFoundError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'STORAGE_STATE_NOT_FOUND';
  constructor(key: string) {
    super(`Storage state file for key '${key}' was not found.`, 404, { key });
  }
}

export class BrowserSessionNotFoundError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'BROWSER_SESSION_NOT_FOUND';
  constructor(sessionId: string) {
    super(`Browser execution session '${sessionId}' was not found or has already closed.`, 404, {
      sessionId,
    });
  }
}

export class BrowserSessionInvalidStateError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'BROWSER_SESSION_INVALID_STATE';
  constructor(sessionId: string, currentStatus: string, expectedStatus: string) {
    super(
      `Browser session '${sessionId}' is in state '${currentStatus}' (expected '${expectedStatus}')`,
      409,
      { sessionId, currentStatus, expectedStatus },
    );
  }
}

export class CredentialReferenceNotFoundError extends ExecutionDomainError {
  public readonly code: DesktopErrorCode = 'CREDENTIAL_REFERENCE_NOT_FOUND';
  constructor(credentialReference: string) {
    super(`Secret credential reference '${credentialReference}' could not be resolved.`, 404, {
      credentialReference,
    });
  }
}
