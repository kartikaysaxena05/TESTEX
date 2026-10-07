/**
 * @file packages/core/src/auth/auth-types.ts
 * Domain bounds, constants, and service interfaces for V8 Phase 113 User Authentication Foundation.
 */

import type {
  UserAccountStatus,
  AuthAuditAction,
  AuthenticatedUserContextDto,
  AuthStateDto,
  LoginInputDto,
  RevokeSessionInputDto,
  RevokeAllSessionsInputDto,
  CreateUserIdentityInputDto,
  CreatePasswordCredentialInputDto,
  SignupInputDto,
  ForgotPasswordInputDto,
  ResetPasswordInputDto,
  PasswordResetResponseDto,
  SocialAuthProvider,
  SocialProviderStatusDto,
  SocialAuthStartInputDto,
  SocialAuthStartResponseDto,
  SocialAuthCallbackInputDto,
  SocialAuthCancelInputDto,
  SocialIdentityDto,
} from '@ai-quality/contracts';

export {
  UserAccountStatus,
  AuthAuditAction,
  AuthenticatedUserContextDto,
  AuthStateDto,
  LoginInputDto,
  RevokeSessionInputDto,
  RevokeAllSessionsInputDto,
  CreateUserIdentityInputDto,
  CreatePasswordCredentialInputDto,
  SignupInputDto,
  ForgotPasswordInputDto,
  ResetPasswordInputDto,
  PasswordResetResponseDto,
  SocialAuthProvider,
  SocialProviderStatusDto,
  SocialAuthStartInputDto,
  SocialAuthStartResponseDto,
  SocialAuthCallbackInputDto,
  SocialAuthCancelInputDto,
  SocialIdentityDto,
};

export const AUTH_BOUNDS = {
  MIN_PASSWORD_LENGTH: 12,
  MAX_PASSWORD_LENGTH: 128,
  MAX_EMAIL_LENGTH: 255,
  MAX_DISPLAY_NAME_LENGTH: 128,
  SESSION_DURATION_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
  PASSWORD_RESET_TOKEN_EXPIRY_MS: 60 * 60 * 1000, // 1 hour
  MAX_FAILED_ATTEMPTS: 5,
  THROTTLE_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  LOCKOUT_DURATION_MS: 15 * 60 * 1000, // 15 minutes
  SCRYPT_N: 16384,
  SCRYPT_R: 8,
  SCRYPT_P: 1,
  SCRYPT_KEYLEN: 64,
  SALT_BYTES: 32,
} as const;

export interface PasswordHashResult {
  readonly passwordHash: string;
  readonly algorithm: string;
  readonly parameters: Record<string, unknown>;
  readonly version: number;
}

export interface PasswordPolicyValidationResult {
  readonly isValid: boolean;
  readonly violations: readonly string[];
}

export interface AuthenticateResult {
  readonly userContext: AuthenticatedUserContextDto;
  readonly sessionToken: string;
}

export interface IPasswordHasher {
  hash(password: string): Promise<PasswordHashResult>;
  verify(password: string, serializedHash: string): Promise<boolean>;
  performDummyHash(): Promise<void>;
}

export interface IPasswordPolicy {
  validate(password: string): PasswordPolicyValidationResult;
}

export interface IAuthThrottleService {
  checkThrottled(key: string): {
    readonly isThrottled: boolean;
    readonly retryAfterSeconds: number;
  };
  recordFailure(key: string): number;
  reset(key: string): void;
}

export interface IAuthAuditService {
  recordEvent(params: {
    readonly action: AuthAuditAction;
    readonly userId?: string | null;
    readonly actorEmail?: string | null;
    readonly metadata?: Record<string, unknown>;
    readonly ipAddress?: string | null;
  }): Promise<void>;
}

export interface IAuthenticationService {
  createUserIdentity(input: CreateUserIdentityInputDto): Promise<{
    readonly id: string;
    readonly email: string;
    readonly normalizedEmail: string;
    readonly displayName: string;
    readonly accountStatus: UserAccountStatus;
    readonly emailVerified: boolean;
    readonly createdAt: Date;
  }>;

  createPasswordCredential(input: CreatePasswordCredentialInputDto): Promise<{
    readonly id: string;
    readonly userId: string;
    readonly algorithm: string;
    readonly version: number;
    readonly createdAt: Date;
  }>;

  authenticateWithPassword(
    email: string,
    password: string,
    context?: {
      readonly deviceInfo?: string;
      readonly ipAddress?: string;
      readonly userAgent?: string;
    },
  ): Promise<AuthenticateResult>;

  signup(
    input: SignupInputDto,
    context?: {
      readonly deviceInfo?: string;
      readonly ipAddress?: string;
      readonly userAgent?: string;
    },
  ): Promise<AuthenticateResult>;

  forgotPassword(
    input: ForgotPasswordInputDto,
    context?: {
      readonly ipAddress?: string;
    },
  ): Promise<PasswordResetResponseDto>;

  resetPassword(
    input: ResetPasswordInputDto,
    context?: {
      readonly ipAddress?: string;
    },
  ): Promise<{ readonly success: boolean }>;

  validateSession(sessionToken: string): Promise<AuthenticatedUserContextDto>;

  revokeSession(sessionId: string, reason?: string): Promise<{ readonly revoked: boolean }>;

  revokeAllUserSessions(
    userId: string,
    reason?: string,
  ): Promise<{ readonly revokedCount: number }>;

  getAuthenticatedContext(
    userId: string,
    sessionId: string,
  ): Promise<AuthenticatedUserContextDto | null>;

  startSocialAuth(
    input: SocialAuthStartInputDto,
    options?: { readonly redirectUri?: string; readonly port?: number },
  ): Promise<SocialAuthStartResponseDto>;

  completeSocialAuth(
    input: SocialAuthCallbackInputDto,
    context?: {
      readonly deviceInfo?: string;
      readonly ipAddress?: string;
      readonly userAgent?: string;
    },
  ): Promise<AuthenticateResult>;

  cancelSocialAuth(
    input: SocialAuthCancelInputDto,
  ): Promise<{ readonly cancelled: boolean }>;

  getSocialProviders(): readonly SocialProviderStatusDto[];
}
