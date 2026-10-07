/**
 * @file packages/core/src/auth/auth-errors.ts
 * Domain error classes for V8 Phase 113 User Authentication Foundation.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export abstract class AuthDomainError extends Error {
  public abstract readonly code: DesktopErrorCode;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthenticationFailedError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'AUTHENTICATION_FAILED';
  constructor(message = 'Invalid email or password.') {
    super(message);
  }
}

export class AccountDisabledError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'ACCOUNT_DISABLED';
  constructor(message = 'Account is disabled.') {
    super(message);
  }
}

export class AccountLockedError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'ACCOUNT_LOCKED';
  constructor(message = 'Account is temporarily locked due to excessive failed attempts.') {
    super(message);
  }
}

export class SessionExpiredError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'SESSION_EXPIRED';
  constructor(message = 'Authentication session has expired.') {
    super(message);
  }
}

export class SessionRevokedError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'SESSION_REVOKED';
  constructor(message = 'Authentication session has been revoked.') {
    super(message);
  }
}

export class SessionNotFoundError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'SESSION_NOT_FOUND';
  constructor(message = 'Authentication session not found.') {
    super(message);
  }
}

export class InvalidAuthInputError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'INVALID_AUTH_INPUT';
  constructor(message: string) {
    super(message);
  }
}

export class RateLimitedError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'RATE_LIMITED';
  public readonly retryAfterSeconds: number;

  constructor(message = 'Too many attempts. Please try again later.', retryAfterSeconds = 900) {
    super(message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class AuthenticationUnavailableError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'AUTHENTICATION_UNAVAILABLE';
  constructor(message = 'Authentication service is currently unavailable.') {
    super(message);
  }
}

export class PasswordPolicyViolationError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'PASSWORD_POLICY_VIOLATION';
  public readonly violations: readonly string[];

  constructor(violations: readonly string[]) {
    super(`Password policy violation: ${violations.join(', ')}`);
    this.violations = violations;
  }
}

export class UserAlreadyExistsError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'USER_ALREADY_EXISTS';
  constructor(message = 'User already exists.') {
    super(message);
  }
}

export class AccountAlreadyExistsError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'ACCOUNT_ALREADY_EXISTS';
  constructor(message = 'An account with this email address already exists.') {
    super(message);
  }
}

export class UserNotFoundError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'USER_NOT_FOUND';
  constructor(message = 'User not found.') {
    super(message);
  }
}

export class ResetTokenExpiredError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'RESET_TOKEN_EXPIRED';
  constructor(message = 'Password reset token has expired. Please request a new one.') {
    super(message);
  }
}

export class ResetTokenInvalidError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'RESET_TOKEN_INVALID';
  constructor(message = 'Invalid or already used password reset token.') {
    super(message);
  }
}

export class PasswordMismatchError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'PASSWORD_MISMATCH';
  constructor(message = 'Passwords do not match.') {
    super(message);
  }
}

export class UnauthorizedError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'UNAUTHORIZED';
  constructor(message = 'Unauthorized: An authenticated session is required to perform this action.') {
    super(message);
  }
}

// ============================================================================
// V8 Phase 115: Social Authentication Error Classes
// ============================================================================

export class SocialAuthCancelledError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'SOCIAL_AUTH_CANCELLED';
  constructor(message = 'Social authentication was cancelled by user.') {
    super(message);
  }
}

export class SocialAuthExpiredError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'SOCIAL_AUTH_EXPIRED';
  constructor(message = 'Social authentication attempt has expired. Please try again.') {
    super(message);
  }
}

export class SocialAuthStateInvalidError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'SOCIAL_AUTH_STATE_INVALID';
  constructor(message = 'Invalid or unrecognized state parameter in OAuth callback.') {
    super(message);
  }
}

export class SocialAuthProviderMismatchError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'SOCIAL_AUTH_PROVIDER_MISMATCH';
  constructor(message = 'Callback provider does not match initial authorization request.') {
    super(message);
  }
}

export class SocialAuthTokenInvalidError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'SOCIAL_AUTH_TOKEN_INVALID';
  constructor(message = 'Identity token validation failed.') {
    super(message);
  }
}

export class SocialAuthAccountConflictError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'SOCIAL_AUTH_ACCOUNT_CONFLICT';
  constructor(message = 'An account with this email exists but cannot be linked automatically.') {
    super(message);
  }
}

export class SocialAuthProviderUnavailableError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'SOCIAL_AUTH_PROVIDER_UNAVAILABLE';
  constructor(message = 'Social authentication provider is currently unavailable or unconfigured.') {
    super(message);
  }
}

export class SocialAuthNetworkError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'SOCIAL_AUTH_NETWORK_ERROR';
  constructor(message = 'Network error communicating with authentication provider.') {
    super(message);
  }
}

export class SocialAuthDuplicateIdentityError extends AuthDomainError {
  public readonly code: DesktopErrorCode = 'SOCIAL_AUTH_DUPLICATE_IDENTITY';
  constructor(message = 'This social identity is already linked to another user account.') {
    super(message);
  }
}


