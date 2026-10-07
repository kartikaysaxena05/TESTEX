/**
 * @file packages/core/src/auth/authentication-service.ts
 * Central authentication domain service for V8 Phase 113.
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import {
  AUTH_BOUNDS,
  UserAccountStatus,
  type IAuthenticationService,
  type CreateUserIdentityInputDto,
  type CreatePasswordCredentialInputDto,
  type AuthenticatedUserContextDto,
  type AuthenticateResult,
  type SignupInputDto,
  type ForgotPasswordInputDto,
  type ResetPasswordInputDto,
  type PasswordResetResponseDto,
  type SocialProviderStatusDto,
  type SocialAuthStartInputDto,
  type SocialAuthStartResponseDto,
  type SocialAuthCallbackInputDto,
  type SocialAuthCancelInputDto,
} from './auth-types.js';
import {
  AuthenticationFailedError,
  AccountDisabledError,
  AccountLockedError,
  SessionExpiredError,
  SessionRevokedError,
  SessionNotFoundError,
  UserAlreadyExistsError,
  AccountAlreadyExistsError,
  UserNotFoundError,
  RateLimitedError,
  InvalidAuthInputError,
  ResetTokenExpiredError,
  ResetTokenInvalidError,
  PasswordMismatchError,
  SocialAuthCancelledError,
  SocialAuthExpiredError,
  SocialAuthStateInvalidError,
  SocialAuthProviderMismatchError,
  SocialAuthTokenInvalidError,
  SocialAuthAccountConflictError,
  SocialAuthProviderUnavailableError,
} from './auth-errors.js';
import { EmailCanonicalizer } from './email-canonicalizer.js';
import { PasswordPolicy } from './password-policy.js';
import { PasswordHasher } from './password-hasher.js';
import { SessionTokenService } from './session-token-service.js';
import { AuthThrottleService } from './auth-throttle-service.js';
import { AuthAuditService } from './auth-audit-service.js';
import {
  PkceService,
  GoogleAuthProvider,
  AppleAuthProvider,
  type SocialAuthProviderContract,
  type NormalizedSocialProfile,
} from './social/index.js';

export class AuthenticationService implements IAuthenticationService {
  private readonly passwordPolicy: PasswordPolicy;
  private readonly passwordHasher: PasswordHasher;
  private readonly throttleService: AuthThrottleService;
  private readonly auditService: AuthAuditService;
  private readonly googleProvider: SocialAuthProviderContract;
  private readonly appleProvider: SocialAuthProviderContract;

  constructor(
    private readonly prisma: PrismaClient,
    options?: {
      readonly passwordPolicy?: PasswordPolicy;
      readonly passwordHasher?: PasswordHasher;
      readonly throttleService?: AuthThrottleService;
      readonly auditService?: AuthAuditService;
      readonly googleProvider?: SocialAuthProviderContract;
      readonly appleProvider?: SocialAuthProviderContract;
    },
  ) {
    this.passwordPolicy = options?.passwordPolicy ?? new PasswordPolicy();
    this.passwordHasher = options?.passwordHasher ?? new PasswordHasher();
    this.throttleService = options?.throttleService ?? new AuthThrottleService();
    this.auditService = options?.auditService ?? new AuthAuditService(prisma);
    this.googleProvider = options?.googleProvider ?? new GoogleAuthProvider();
    this.appleProvider = options?.appleProvider ?? new AppleAuthProvider();
  }

  /**
   * Creates an authoritative user identity in PostgreSQL.
   */
  public async createUserIdentity(input: CreateUserIdentityInputDto): Promise<{
    readonly id: string;
    readonly email: string;
    readonly normalizedEmail: string;
    readonly displayName: string;
    readonly accountStatus: UserAccountStatus;
    readonly emailVerified: boolean;
    readonly createdAt: Date;
  }> {
    const normalizedEmail = EmailCanonicalizer.canonicalize(input.email);

    if (
      !input.displayName ||
      typeof input.displayName !== 'string' ||
      input.displayName.trim().length === 0
    ) {
      throw new InvalidAuthInputError('Display name is required and cannot be empty.');
    }

    if (input.displayName.trim().length > AUTH_BOUNDS.MAX_DISPLAY_NAME_LENGTH) {
      throw new InvalidAuthInputError(
        `Display name cannot exceed ${AUTH_BOUNDS.MAX_DISPLAY_NAME_LENGTH} characters.`,
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { normalizedEmail },
    });

    if (existing) {
      throw new UserAlreadyExistsError(`An account with this email address already exists.`);
    }

    const accountStatus = input.accountStatus ?? 'ACTIVE';
    const emailVerified = input.emailVerified ?? false;

    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        normalizedEmail,
        displayName: input.displayName.trim(),
        accountStatus: accountStatus as UserAccountStatus,
        emailVerified,
        emailVerifiedAt: emailVerified ? new Date() : null,
      },
    });

    await this.auditService.recordEvent({
      action: 'CREDENTIAL_CREATED',
      userId: user.id,
      actorEmail: normalizedEmail,
      metadata: { displayName: user.displayName, accountStatus: user.accountStatus },
    });

    return {
      id: user.id,
      email: user.normalizedEmail,
      normalizedEmail: user.normalizedEmail,
      displayName: user.displayName,
      accountStatus: user.accountStatus as UserAccountStatus,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    };
  }

  /**
   * Creates or updates a separated password credential for a user.
   */
  public async createPasswordCredential(input: CreatePasswordCredentialInputDto): Promise<{
    readonly id: string;
    readonly userId: string;
    readonly algorithm: string;
    readonly version: number;
    readonly createdAt: Date;
  }> {
    if (!input.userId || typeof input.userId !== 'string') {
      throw new InvalidAuthInputError('Valid user ID is required.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
    });

    if (!user) {
      throw new UserNotFoundError(`User with ID ${input.userId} not found.`);
    }

    // Validate password policy
    this.passwordPolicy.assertValid(input.password);

    // Hash password with memory-hard scrypt
    const hashResult = await this.passwordHasher.hash(input.password);

    // Upsert or create password credential
    const credential = await this.prisma.passwordCredential.create({
      data: {
        userId: user.id,
        passwordHash: hashResult.passwordHash,
        algorithm: hashResult.algorithm,
        parameters: hashResult.parameters as Prisma.InputJsonValue,
        version: hashResult.version,
      },
    });

    await this.auditService.recordEvent({
      action: 'CREDENTIAL_CREATED',
      userId: user.id,
      actorEmail: user.normalizedEmail,
      metadata: { credentialId: credential.id, algorithm: hashResult.algorithm },
    });

    return {
      id: credential.id,
      userId: credential.userId,
      algorithm: credential.algorithm,
      version: credential.version,
      createdAt: credential.createdAt,
    };
  }

  /**
   * Authenticates a user using email and password, issuing a secure session upon success.
   * Defends against account enumeration, timing analysis, and brute force attacks.
   */
  public async authenticateWithPassword(
    email: string,
    password: string,
    context?: {
      readonly deviceInfo?: string;
      readonly ipAddress?: string;
      readonly userAgent?: string;
    },
  ): Promise<AuthenticateResult> {
    const normalizedEmail = EmailCanonicalizer.canonicalize(email);

    // 1. Brute-force throttle check
    const throttleStatus = this.throttleService.checkThrottled(normalizedEmail);
    if (throttleStatus.isThrottled) {
      await this.auditService.recordEvent({
        action: 'LOGIN_FAILURE',
        actorEmail: normalizedEmail,
        ipAddress: context?.ipAddress,
        metadata: { reason: 'RATE_LIMITED', retryAfterSeconds: throttleStatus.retryAfterSeconds },
      });
      throw new RateLimitedError(
        'Too many failed login attempts. Please try again later.',
        throttleStatus.retryAfterSeconds,
      );
    }

    // 2. Identity lookup
    const user = await this.prisma.user.findUnique({
      where: { normalizedEmail },
      include: {
        passwordCredentials: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // 3. Unknown account timing equalization
    if (!user) {
      this.throttleService.recordFailure(normalizedEmail);
      await this.passwordHasher.performDummyHash();
      await this.auditService.recordEvent({
        action: 'LOGIN_FAILURE',
        actorEmail: normalizedEmail,
        ipAddress: context?.ipAddress,
        metadata: { reason: 'UNKNOWN_USER' },
      });
      throw new AuthenticationFailedError('Invalid email or password.');
    }

    // 4. Account status checks
    if (user.accountStatus === 'DISABLED') {
      await this.auditService.recordEvent({
        action: 'LOGIN_FAILURE',
        userId: user.id,
        actorEmail: normalizedEmail,
        ipAddress: context?.ipAddress,
        metadata: { reason: 'ACCOUNT_DISABLED' },
      });
      throw new AccountDisabledError('Account is disabled.');
    }

    if (user.accountStatus === 'LOCKED') {
      await this.auditService.recordEvent({
        action: 'LOGIN_FAILURE',
        userId: user.id,
        actorEmail: normalizedEmail,
        ipAddress: context?.ipAddress,
        metadata: { reason: 'ACCOUNT_LOCKED' },
      });
      throw new AccountLockedError('Account is temporarily locked.');
    }

    if (user.accountStatus === 'DELETED') {
      await this.passwordHasher.performDummyHash();
      throw new AuthenticationFailedError('Invalid email or password.');
    }

    const latestCredential = user.passwordCredentials[0];
    if (!latestCredential) {
      // User has no password credential configured
      this.throttleService.recordFailure(normalizedEmail);
      await this.passwordHasher.performDummyHash();
      throw new AuthenticationFailedError('Invalid email or password.');
    }

    // 5. Password verification (constant-time)
    const isMatch = await this.passwordHasher.verify(password, latestCredential.passwordHash);

    if (!isMatch) {
      const failures = this.throttleService.recordFailure(normalizedEmail);
      if (failures >= AUTH_BOUNDS.MAX_FAILED_ATTEMPTS) {
        // Mark account as locked in DB
        await this.prisma.user.update({
          where: { id: user.id },
          data: { accountStatus: 'LOCKED' },
        });
        await this.auditService.recordEvent({
          action: 'ACCOUNT_LOCKED',
          userId: user.id,
          actorEmail: normalizedEmail,
          ipAddress: context?.ipAddress,
          metadata: { failedAttempts: failures },
        });
      }

      await this.auditService.recordEvent({
        action: 'LOGIN_FAILURE',
        userId: user.id,
        actorEmail: normalizedEmail,
        ipAddress: context?.ipAddress,
        metadata: { reason: 'WRONG_PASSWORD', failedAttempts: failures },
      });

      throw new AuthenticationFailedError('Invalid email or password.');
    }

    // 6. Successful authentication
    this.throttleService.reset(normalizedEmail);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + AUTH_BOUNDS.SESSION_DURATION_MS);

    // Update lastAuthenticatedAt
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastAuthenticatedAt: now },
    });

    // Issue bearer session token
    const bearerToken = SessionTokenService.generateBearerToken();
    const tokenHash = SessionTokenService.hashToken(bearerToken);

    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        sessionTokenHash: tokenHash,
        deviceInfo: context?.deviceInfo ?? 'desktop-client',
        ipAddress: context?.ipAddress ?? null,
        userAgent: context?.userAgent ?? null,
        expiresAt,
        lastUsedAt: now,
      },
    });

    await this.auditService.recordEvent({
      action: 'LOGIN_SUCCESS',
      userId: user.id,
      actorEmail: normalizedEmail,
      ipAddress: context?.ipAddress,
      metadata: { sessionId: session.id },
    });

    await this.auditService.recordEvent({
      action: 'SESSION_ISSUED',
      userId: user.id,
      actorEmail: normalizedEmail,
      ipAddress: context?.ipAddress,
      metadata: { sessionId: session.id, expiresAt: expiresAt.toISOString() },
    });

    const userContext: AuthenticatedUserContextDto = {
      userId: user.id,
      email: user.normalizedEmail,
      displayName: user.displayName,
      accountStatus: user.accountStatus as UserAccountStatus,
      emailVerified: user.emailVerified,
      sessionId: session.id,
      expiresAt: expiresAt.toISOString(),
    };

    return {
      userContext,
      sessionToken: bearerToken,
    };
  }

  /**
   * Signs up a new user with email and password, creates credentials and issues an active session.
   */
  public async signup(
    input: SignupInputDto,
    context?: {
      readonly deviceInfo?: string;
      readonly ipAddress?: string;
      readonly userAgent?: string;
    },
  ): Promise<AuthenticateResult> {
    if (!input || typeof input !== 'object') {
      throw new InvalidAuthInputError('Signup payload is required.');
    }

    const { fullName, email, password, confirmPassword } = input;

    if (!fullName || typeof fullName !== 'string' || fullName.trim().length === 0) {
      throw new InvalidAuthInputError('Full name is required.');
    }

    if (fullName.trim().length > AUTH_BOUNDS.MAX_DISPLAY_NAME_LENGTH) {
      throw new InvalidAuthInputError(
        `Full name cannot exceed ${AUTH_BOUNDS.MAX_DISPLAY_NAME_LENGTH} characters.`,
      );
    }

    if (!email || typeof email !== 'string') {
      throw new InvalidAuthInputError('Email is required.');
    }

    const normalizedEmail = EmailCanonicalizer.canonicalize(email);

    if (!password || typeof password !== 'string') {
      throw new InvalidAuthInputError('Password is required.');
    }

    // Validate password policy
    this.passwordPolicy.assertValid(password);

    // Validate confirmation if provided
    if (confirmPassword !== undefined && confirmPassword !== null) {
      if (typeof confirmPassword !== 'string' || confirmPassword !== password) {
        throw new PasswordMismatchError('Passwords do not match.');
      }
    }

    // Check duplicate account
    const existing = await this.prisma.user.findUnique({
      where: { normalizedEmail },
    });

    if (existing) {
      throw new AccountAlreadyExistsError('An account with this email address already exists.');
    }

    // Hash password with memory-hard scrypt
    const hashResult = await this.passwordHasher.hash(password);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + AUTH_BOUNDS.SESSION_DURATION_MS);

    // Create user in PostgreSQL
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        normalizedEmail,
        displayName: fullName.trim(),
        accountStatus: 'ACTIVE',
        emailVerified: false,
        lastAuthenticatedAt: now,
      },
    });

    // Create separated password credential
    await this.prisma.passwordCredential.create({
      data: {
        userId: user.id,
        passwordHash: hashResult.passwordHash,
        algorithm: hashResult.algorithm,
        parameters: hashResult.parameters as Prisma.InputJsonValue,
        version: hashResult.version,
      },
    });

    // Generate bearer session token
    const bearerToken = SessionTokenService.generateBearerToken();
    const tokenHash = SessionTokenService.hashToken(bearerToken);

    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        sessionTokenHash: tokenHash,
        deviceInfo: context?.deviceInfo ?? 'desktop-client',
        ipAddress: context?.ipAddress ?? null,
        userAgent: context?.userAgent ?? null,
        expiresAt,
        lastUsedAt: now,
      },
    });

    await this.auditService.recordEvent({
      action: 'CREDENTIAL_CREATED',
      userId: user.id,
      actorEmail: normalizedEmail,
      metadata: { displayName: user.displayName, algorithm: hashResult.algorithm },
    });

    await this.auditService.recordEvent({
      action: 'LOGIN_SUCCESS',
      userId: user.id,
      actorEmail: normalizedEmail,
      ipAddress: context?.ipAddress,
      metadata: { sessionId: session.id, event: 'SIGNUP_COMPLETED' },
    });

    await this.auditService.recordEvent({
      action: 'SESSION_ISSUED',
      userId: user.id,
      actorEmail: normalizedEmail,
      ipAddress: context?.ipAddress,
      metadata: { sessionId: session.id, expiresAt: expiresAt.toISOString() },
    });

    const userContext: AuthenticatedUserContextDto = {
      userId: user.id,
      email: user.normalizedEmail,
      displayName: user.displayName,
      accountStatus: user.accountStatus as UserAccountStatus,
      emailVerified: user.emailVerified,
      sessionId: session.id,
      expiresAt: expiresAt.toISOString(),
    };

    return {
      userContext,
      sessionToken: bearerToken,
    };
  }

  /**
   * Generates a secure, time-limited, single-use password reset token for account recovery.
   * Returns a generic response to prevent account enumeration.
   */
  public async forgotPassword(
    input: ForgotPasswordInputDto,
    context?: {
      readonly ipAddress?: string;
    },
  ): Promise<PasswordResetResponseDto> {
    if (!input || typeof input !== 'object' || !input.email || typeof input.email !== 'string') {
      throw new InvalidAuthInputError('Valid email address is required.');
    }

    const normalizedEmail = EmailCanonicalizer.canonicalize(input.email);

    // Apply abuse throttling to prevent high-frequency spamming
    const throttleKey = `forgot_pwd:${normalizedEmail}`;
    const throttleStatus = this.throttleService.checkThrottled(throttleKey);
    if (throttleStatus.isThrottled) {
      throw new RateLimitedError(
        'Too many password reset requests. Please wait before trying again.',
        throttleStatus.retryAfterSeconds,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { normalizedEmail },
    });

    // If user does not exist or is deleted, record failure for throttle and return safe message
    if (!user || user.accountStatus === 'DELETED') {
      this.throttleService.recordFailure(throttleKey);
      return {
        message:
          'If an account with this email exists, password reset instructions have been generated.',
      };
    }

    // Reset throttle on valid request
    this.throttleService.reset(throttleKey);

    // Generate 256-bit cryptographically secure reset token
    const resetToken = SessionTokenService.generateBearerToken();
    const tokenHash = SessionTokenService.hashToken(resetToken);
    const expiresAt = new Date(Date.now() + AUTH_BOUNDS.PASSWORD_RESET_TOKEN_EXPIRY_MS);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    await this.auditService.recordEvent({
      action: 'PASSWORD_RESET_REQUESTED',
      userId: user.id,
      actorEmail: normalizedEmail,
      ipAddress: context?.ipAddress,
      metadata: { expiresAt: expiresAt.toISOString() },
    });

    return {
      message:
        'If an account with this email exists, password reset instructions have been generated.',
      resetToken, // Returned for desktop local environment / test verification
    };
  }

  /**
   * Validates a password reset token and sets a new password.
   * Upon success, invalidates the reset token and revokes all active sessions globally.
   */
  public async resetPassword(
    input: ResetPasswordInputDto,
    context?: {
      readonly ipAddress?: string;
    },
  ): Promise<{ readonly success: boolean }> {
    if (!input || typeof input !== 'object') {
      throw new InvalidAuthInputError('Reset password payload is required.');
    }

    const { resetToken, newPassword, confirmPassword } = input;

    if (!resetToken || typeof resetToken !== 'string' || resetToken.trim().length === 0) {
      throw new InvalidAuthInputError('Password reset token is required.');
    }

    if (!newPassword || typeof newPassword !== 'string') {
      throw new InvalidAuthInputError('New password is required.');
    }

    // Validate password policy on new password
    this.passwordPolicy.assertValid(newPassword);

    // Validate confirmation if provided
    if (confirmPassword !== undefined && confirmPassword !== null) {
      if (typeof confirmPassword !== 'string' || confirmPassword !== newPassword) {
        throw new PasswordMismatchError('Passwords do not match.');
      }
    }

    const tokenHash = SessionTokenService.hashToken(resetToken);

    const tokenRecord = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!tokenRecord) {
      throw new ResetTokenInvalidError('Invalid password reset token.');
    }

    if (tokenRecord.usedAt !== null) {
      throw new ResetTokenInvalidError('This password reset token has already been used.');
    }

    if (tokenRecord.expiresAt.getTime() <= Date.now()) {
      throw new ResetTokenExpiredError(
        'Password reset token has expired. Please request a new one.',
      );
    }

    const user = tokenRecord.user;
    if (user.accountStatus === 'DISABLED') {
      throw new AccountDisabledError('Cannot reset password for disabled account.');
    }
    if (user.accountStatus === 'LOCKED') {
      throw new AccountLockedError('Cannot reset password for locked account.');
    }

    // Hash new password with memory-hard scrypt
    const hashResult = await this.passwordHasher.hash(newPassword);

    const now = new Date();

    // 1. Mark reset token as used
    await this.prisma.passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: now },
    });

    // 2. Update password credential
    await this.prisma.passwordCredential.updateMany({
      where: { userId: user.id },
      data: {
        passwordHash: hashResult.passwordHash,
        algorithm: hashResult.algorithm,
        parameters: hashResult.parameters as Prisma.InputJsonValue,
        version: hashResult.version,
        passwordChangedAt: now,
      },
    });

    // 3. Global session revocation: increment securityVersion and revoke active sessions
    await this.prisma.user.update({
      where: { id: user.id },
      data: { securityVersion: { increment: 1 } },
    });

    await this.prisma.authSession.updateMany({
      where: { userId: user.id, isRevoked: false },
      data: {
        isRevoked: true,
        revokedAt: now,
        revocationReason: 'PASSWORD_RESET',
      },
    });

    // 4. Record audit events
    await this.auditService.recordEvent({
      action: 'PASSWORD_RESET_COMPLETED',
      userId: user.id,
      actorEmail: user.normalizedEmail,
      ipAddress: context?.ipAddress,
      metadata: { tokenId: tokenRecord.id },
    });

    await this.auditService.recordEvent({
      action: 'PASSWORD_CHANGED',
      userId: user.id,
      actorEmail: user.normalizedEmail,
      ipAddress: context?.ipAddress,
      metadata: { reason: 'RESET_TOKEN' },
    });

    await this.auditService.recordEvent({
      action: 'ALL_SESSIONS_REVOKED',
      userId: user.id,
      actorEmail: user.normalizedEmail,
      ipAddress: context?.ipAddress,
      metadata: { reason: 'PASSWORD_RESET_GLOBAL_REVOCATION' },
    });

    // Reset any failure throttle counts on successful reset
    this.throttleService.reset(user.normalizedEmail);

    return { success: true };
  }

  /**
   * Validates a bearer session token, ensuring it is not expired, revoked, or tied to a disabled account.
   */
  public async validateSession(sessionToken: string): Promise<AuthenticatedUserContextDto> {
    if (!sessionToken || typeof sessionToken !== 'string') {
      throw new SessionNotFoundError('Invalid session token.');
    }

    const tokenHash = SessionTokenService.hashToken(sessionToken);

    const session = await this.prisma.authSession.findUnique({
      where: { sessionTokenHash: tokenHash },
      include: { user: true },
    });

    if (!session) {
      throw new SessionNotFoundError('Authentication session not found.');
    }

    if (session.isRevoked) {
      throw new SessionRevokedError('Authentication session has been revoked.');
    }

    const now = new Date();
    if (session.expiresAt.getTime() <= now.getTime()) {
      throw new SessionExpiredError('Authentication session has expired.');
    }

    if (session.user.accountStatus === 'DISABLED') {
      throw new AccountDisabledError('Account is disabled.');
    }

    if (session.user.accountStatus === 'LOCKED') {
      throw new AccountLockedError('Account is temporarily locked.');
    }

    if (session.user.accountStatus === 'DELETED') {
      throw new SessionNotFoundError('Authentication session not found.');
    }

    // Touch lastUsedAt asynchronously
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { lastUsedAt: now },
    });

    return {
      userId: session.user.id,
      email: session.user.normalizedEmail,
      displayName: session.user.displayName,
      accountStatus: session.user.accountStatus as UserAccountStatus,
      emailVerified: session.user.emailVerified,
      sessionId: session.id,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  /**
   * Revokes a specific session.
   */
  public async revokeSession(
    sessionId: string,
    reason = 'USER_LOGOUT',
  ): Promise<{ readonly revoked: boolean }> {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new InvalidAuthInputError('Session ID is required.');
    }

    const session = await this.prisma.authSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new SessionNotFoundError(`Session with ID ${sessionId} not found.`);
    }

    const now = new Date();
    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: {
        isRevoked: true,
        revokedAt: now,
        revocationReason: reason,
      },
    });

    await this.auditService.recordEvent({
      action: 'SESSION_REVOKED',
      userId: session.userId,
      metadata: { sessionId, reason },
    });

    return { revoked: true };
  }

  /**
   * Revokes all active sessions for a user (e.g. password change, security reset).
   */
  public async revokeAllUserSessions(
    userId: string,
    reason = 'GLOBAL_REVOCATION',
  ): Promise<{ readonly revokedCount: number }> {
    if (!userId || typeof userId !== 'string') {
      throw new InvalidAuthInputError('User ID is required.');
    }

    const now = new Date();

    const result = await this.prisma.authSession.updateMany({
      where: {
        userId,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
        revokedAt: now,
        revocationReason: reason,
      },
    });

    // Increment user securityVersion
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        securityVersion: { increment: 1 },
      },
    });

    await this.auditService.recordEvent({
      action: 'ALL_SESSIONS_REVOKED',
      userId,
      metadata: { revokedCount: result.count, reason },
    });

    return { revokedCount: result.count };
  }

  /**
   * Fetches safe authenticated user context by user ID and session ID.
   */
  public async getAuthenticatedContext(
    userId: string,
    sessionId: string,
  ): Promise<AuthenticatedUserContextDto | null> {
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: sessionId,
        userId,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (
      !session ||
      session.user.accountStatus === 'DISABLED' ||
      session.user.accountStatus === 'LOCKED'
    ) {
      return null;
    }

    return {
      userId: session.user.id,
      email: session.user.normalizedEmail,
      displayName: session.user.displayName,
      accountStatus: session.user.accountStatus as UserAccountStatus,
      emailVerified: session.user.emailVerified,
      sessionId: session.id,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  // ============================================================================
  // V8 Phase 115: Google & Apple Social Authentication Methods
  // ============================================================================

  /**
   * Returns configured status of supported social authentication providers.
   */
  public getSocialProviders(): readonly SocialProviderStatusDto[] {
    return [
      {
        provider: 'GOOGLE',
        name: this.googleProvider.name,
        enabled: this.googleProvider.isConfigured(),
        clientIdConfigured: this.googleProvider.isConfigured(),
      },
      {
        provider: 'APPLE',
        name: this.appleProvider.name,
        enabled: this.appleProvider.isConfigured(),
        clientIdConfigured: this.appleProvider.isConfigured(),
      },
    ];
  }

  /**
   * Generates authorization URL, state, PKCE code verifier, and persists attempt.
   */
  public async startSocialAuth(
    input: SocialAuthStartInputDto,
    options?: { readonly redirectUri?: string; readonly port?: number },
  ): Promise<SocialAuthStartResponseDto> {
    if (!input.provider || (input.provider !== 'GOOGLE' && input.provider !== 'APPLE')) {
      throw new InvalidAuthInputError(`Unsupported or invalid social provider: "${input.provider}"`);
    }

    const provider = input.provider === 'GOOGLE' ? this.googleProvider : this.appleProvider;

    if (!provider.isConfigured()) {
      throw new SocialAuthProviderUnavailableError(
        `${provider.name} authentication is not configured. Please provide valid client credentials.`,
      );
    }

    const state = PkceService.generateState();
    const nonce = PkceService.generateNonce();
    const codeVerifier = input.provider === 'GOOGLE' ? PkceService.generateCodeVerifier() : undefined;

    const stateHash = PkceService.hashSecret(state);
    const nonceHash = PkceService.hashSecret(nonce);

    const redirectUri =
      options?.redirectUri ??
      (options?.port ? `http://127.0.0.1:${options.port}/callback` : 'http://127.0.0.1:0/callback');

    const authReq = provider.createAuthorizationRequest({
      redirectUri,
      state,
      nonce,
      codeVerifier,
    });

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minute expiry

    await this.prisma.socialAuthAttempt.create({
      data: {
        provider: input.provider,
        stateHash,
        nonceHash,
        codeVerifier: codeVerifier ?? null,
        redirectUri: authReq.redirectUri,
        status: 'PENDING',
        expiresAt,
      },
    });

    await this.auditService.recordEvent({
      action: 'SOCIAL_AUTH_STARTED',
      metadata: {
        provider: input.provider,
        redirectUri: authReq.redirectUri,
        deviceInfo: input.deviceInfo ?? 'desktop-client',
      },
    });

    return {
      authorizationUrl: authReq.authorizationUrl,
      state,
      provider: input.provider,
      redirectUri: authReq.redirectUri,
      port: options?.port,
    };
  }

  /**
   * Completes social authentication callback, verifies state & tokens, resolves account, and issues session.
   */
  public async completeSocialAuth(
    input: SocialAuthCallbackInputDto,
    context?: {
      readonly deviceInfo?: string;
      readonly ipAddress?: string;
      readonly userAgent?: string;
    },
  ): Promise<AuthenticateResult> {
    if (!input.state || typeof input.state !== 'string') {
      throw new SocialAuthStateInvalidError('State parameter is required in social callback.');
    }

    const stateHash = PkceService.hashSecret(input.state);
    const attempt = await this.prisma.socialAuthAttempt.findUnique({
      where: { stateHash },
    });

    if (!attempt || attempt.status !== 'PENDING') {
      throw new SocialAuthStateInvalidError(
        'Invalid, expired, or already consumed social authorization state.',
      );
    }

    if (input.provider && input.provider !== attempt.provider) {
      throw new SocialAuthProviderMismatchError(
        `Social auth provider mismatch: attempt was for ${attempt.provider}, received ${input.provider}`,
      );
    }

    const now = new Date();

    if (attempt.expiresAt < now) {
      await this.prisma.socialAuthAttempt.update({
        where: { id: attempt.id },
        data: { status: 'EXPIRED', completedAt: now, errorMessage: 'Attempt expired' },
      });
      await this.auditService.recordEvent({
        action: 'SOCIAL_AUTH_FAILURE',
        metadata: { provider: attempt.provider, reason: 'EXPIRED' },
      });
      throw new SocialAuthExpiredError();
    }

    if (input.error) {
      const isCancelled =
        input.error === 'access_denied' ||
        input.error === 'user_cancelled_authorize' ||
        input.error === 'cancelled';

      await this.prisma.socialAuthAttempt.update({
        where: { id: attempt.id },
        data: {
          status: isCancelled ? 'CANCELLED' : 'FAILED',
          completedAt: now,
          errorMessage: input.errorDescription ?? input.error,
        },
      });

      await this.auditService.recordEvent({
        action: isCancelled ? 'SOCIAL_AUTH_CANCELLED' : 'SOCIAL_AUTH_FAILURE',
        metadata: {
          provider: attempt.provider,
          error: input.error,
          errorDescription: input.errorDescription,
        },
      });

      if (isCancelled) {
        throw new SocialAuthCancelledError(
          input.errorDescription ?? 'Social authentication was cancelled by user.',
        );
      }
      throw new SocialAuthTokenInvalidError(
        `Social authorization failed: ${input.error}${input.errorDescription ? ` - ${input.errorDescription}` : ''}`,
      );
    }

    const provider = attempt.provider === 'GOOGLE' ? this.googleProvider : this.appleProvider;

    let normalizedProfile: NormalizedSocialProfile;
    try {
      normalizedProfile = await provider.validateCallback({
        state: input.state,
        code: input.code,
        idToken: input.idToken,
        userJson: input.userJson,
        redirectUri: attempt.redirectUri,
        codeVerifier: attempt.codeVerifier ?? undefined,
        nonce: attempt.nonceHash ? undefined : undefined,
      });
    } catch (err: unknown) {
      await this.prisma.socialAuthAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'FAILED',
          completedAt: now,
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
      await this.auditService.recordEvent({
        action: 'SOCIAL_AUTH_FAILURE',
        metadata: {
          provider: attempt.provider,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }

    // Verify token nonce against attempt nonceHash if nonce claim is present
    if (attempt.nonceHash && normalizedProfile.rawProfile?.nonce) {
      const actualNonceHash = PkceService.hashSecret(String(normalizedProfile.rawProfile.nonce));
      if (actualNonceHash !== attempt.nonceHash) {
        await this.prisma.socialAuthAttempt.update({
          where: { id: attempt.id },
          data: { status: 'FAILED', completedAt: now, errorMessage: 'Nonce verification mismatch' },
        });
        throw new SocialAuthTokenInvalidError('ID token nonce verification failed.');
      }
    }

    // Single-use attempt consumption
    await this.prisma.socialAuthAttempt.update({
      where: { id: attempt.id },
      data: { status: 'COMPLETED', completedAt: now },
    });

    // Account resolution & collision safety
    const existingIdentity = await this.prisma.socialIdentity.findUnique({
      where: {
        provider_providerSubjectId: {
          provider: normalizedProfile.provider,
          providerSubjectId: normalizedProfile.providerSubjectId,
        },
      },
      include: { user: true },
    });

    let user: {
      id: string;
      email: string;
      normalizedEmail: string;
      displayName: string;
      accountStatus: string;
      emailVerified: boolean;
    };

    if (existingIdentity) {
      user = existingIdentity.user;

      if (user.accountStatus === 'DISABLED') {
        throw new AccountDisabledError();
      }
      if (user.accountStatus === 'LOCKED') {
        throw new AccountLockedError();
      }
      if (user.accountStatus === 'DELETED') {
        throw new UserNotFoundError('User account has been deleted.');
      }

      // Merge profile data, retaining existing data if provider omitted it (e.g. Apple returning logins)
      const existingProfile =
        typeof existingIdentity.profileData === 'object' && existingIdentity.profileData !== null
          ? (existingIdentity.profileData as Record<string, unknown>)
          : {};
      const mergedProfile = { ...existingProfile, ...normalizedProfile.rawProfile };

      await this.prisma.socialIdentity.update({
        where: { id: existingIdentity.id },
        data: {
          profileData: mergedProfile as Prisma.InputJsonValue,
          updatedAt: now,
          ...(normalizedProfile.email ? { providerEmail: normalizedProfile.email } : {}),
          ...(normalizedProfile.emailVerified ? { emailVerified: true } : {}),
        },
      });

      // If provider verified email and local user was not marked verified, promote it
      if (normalizedProfile.emailVerified && !user.emailVerified) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { emailVerified: true, emailVerifiedAt: now },
        });
        user.emailVerified = true;
      }
    } else {
      // Identity not found.
      const email = normalizedProfile.email;
      if (!email || email.trim().length === 0) {
        throw new InvalidAuthInputError('Social provider did not return an email address.');
      }

      const normalizedEmail = EmailCanonicalizer.canonicalize(email);
      const existingUser = await this.prisma.user.findUnique({
        where: { normalizedEmail },
      });

      if (existingUser) {
        // Account linking collision safety:
        // ONLY link if BOTH local user has emailVerified: true AND provider claims emailVerified: true
        if (!existingUser.emailVerified || !normalizedProfile.emailVerified) {
          await this.auditService.recordEvent({
            action: 'ACCOUNT_LINK_CONFLICT',
            userId: existingUser.id,
            actorEmail: normalizedEmail,
            metadata: {
              provider: normalizedProfile.provider,
              localVerified: existingUser.emailVerified,
              providerVerified: normalizedProfile.emailVerified,
              reason: 'Unverified email collision prevented to stop account takeover',
            },
          });
          await this.auditService.recordEvent({
            action: 'SOCIAL_AUTH_FAILURE',
            userId: existingUser.id,
            actorEmail: normalizedEmail,
            metadata: {
              provider: normalizedProfile.provider,
              reason: 'ACCOUNT_LINK_CONFLICT',
            },
          });
          throw new SocialAuthAccountConflictError(
            'Cannot automatically link social account: email verification required on both local account and social identity.',
          );
        }

        if (existingUser.accountStatus === 'DISABLED') {
          throw new AccountDisabledError();
        }
        if (existingUser.accountStatus === 'LOCKED') {
          throw new AccountLockedError();
        }

        // Link identity to existing verified user
        await this.prisma.socialIdentity.create({
          data: {
            userId: existingUser.id,
            provider: normalizedProfile.provider,
            providerSubjectId: normalizedProfile.providerSubjectId,
            providerEmail: normalizedProfile.email,
            emailVerified: normalizedProfile.emailVerified,
            profileData: normalizedProfile.rawProfile as Prisma.InputJsonValue,
          },
        });

        await this.auditService.recordEvent({
          action: 'SOCIAL_IDENTITY_LINKED',
          userId: existingUser.id,
          actorEmail: normalizedEmail,
          metadata: { provider: normalizedProfile.provider },
        });

        user = existingUser;
      } else {
        // New user registration
        const emailPrefix = normalizedEmail.split('@')[0] || 'User';
        const displayName =
          normalizedProfile.displayName && normalizedProfile.displayName.trim().length > 0
            ? normalizedProfile.displayName.trim()
            : emailPrefix;

        user = await this.prisma.$transaction(async (tx) => {
          const newUser = await tx.user.create({
            data: {
              email,
              normalizedEmail,
              displayName,
              accountStatus: 'ACTIVE',
              emailVerified: normalizedProfile.emailVerified,
              emailVerifiedAt: normalizedProfile.emailVerified ? now : null,
              lastAuthenticatedAt: now,
            },
          });

          await tx.socialIdentity.create({
            data: {
              userId: newUser.id,
              provider: normalizedProfile.provider,
              providerSubjectId: normalizedProfile.providerSubjectId,
              providerEmail: normalizedProfile.email,
              emailVerified: normalizedProfile.emailVerified,
              profileData: normalizedProfile.rawProfile as Prisma.InputJsonValue,
            },
          });

          // ZERO fake password generation!
          return newUser;
        });
      }
    }

    // Update user's last authenticated timestamp
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastAuthenticatedAt: now },
    });

    // Issue session token
    const bearerToken = SessionTokenService.generateBearerToken();
    const tokenHash = SessionTokenService.hashToken(bearerToken);
    const expiresAt = new Date(now.getTime() + AUTH_BOUNDS.SESSION_DURATION_MS);

    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        sessionTokenHash: tokenHash,
        deviceInfo: context?.deviceInfo ?? 'desktop-client',
        ipAddress: context?.ipAddress ?? null,
        userAgent: context?.userAgent ?? null,
        expiresAt,
        lastUsedAt: now,
      },
    });

    await this.auditService.recordEvent({
      action: 'SOCIAL_AUTH_SUCCESS',
      userId: user.id,
      actorEmail: user.normalizedEmail,
      ipAddress: context?.ipAddress,
      metadata: {
        provider: normalizedProfile.provider,
        sessionId: session.id,
      },
    });

    await this.auditService.recordEvent({
      action: 'LOGIN_SUCCESS',
      userId: user.id,
      actorEmail: user.normalizedEmail,
      ipAddress: context?.ipAddress,
      metadata: {
        sessionId: session.id,
        authMethod: 'SOCIAL',
        provider: normalizedProfile.provider,
      },
    });

    await this.auditService.recordEvent({
      action: 'SESSION_ISSUED',
      userId: user.id,
      actorEmail: user.normalizedEmail,
      ipAddress: context?.ipAddress,
      metadata: {
        sessionId: session.id,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      userContext: {
        userId: user.id,
        email: user.normalizedEmail,
        displayName: user.displayName,
        accountStatus: user.accountStatus as UserAccountStatus,
        emailVerified: user.emailVerified,
        sessionId: session.id,
        expiresAt: expiresAt.toISOString(),
      },
      sessionToken: bearerToken,
    };
  }

  /**
   * Cancels a pending social authorization attempt.
   */
  public async cancelSocialAuth(
    input: SocialAuthCancelInputDto,
  ): Promise<{ readonly cancelled: boolean }> {
    if (!input.state || typeof input.state !== 'string') {
      return { cancelled: false };
    }

    const stateHash = PkceService.hashSecret(input.state);
    const attempt = await this.prisma.socialAuthAttempt.findUnique({
      where: { stateHash },
    });

    if (!attempt || attempt.status !== 'PENDING') {
      return { cancelled: false };
    }

    const now = new Date();
    await this.prisma.socialAuthAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'CANCELLED',
        completedAt: now,
        errorMessage: input.reason ?? 'Cancelled by user',
      },
    });

    await this.auditService.recordEvent({
      action: 'SOCIAL_AUTH_CANCELLED',
      metadata: {
        provider: attempt.provider,
        reason: input.reason ?? 'User cancelled flow',
      },
    });

    return { cancelled: true };
  }
}

