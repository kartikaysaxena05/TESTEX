/**
 * @file packages/core/src/settings/user-settings-service.ts
 * Enterprise User Profile, Account Settings, and Application Preferences Service.
 * Implements V8 Phase 116.
 */

import type { PrismaClient } from '@prisma/client';
import {
  type IUserSettingsService,
  type UserProfileDto,
  type UpdateProfileInputDto,
  type ChangePasswordInputDto,
  type UserAuthMethodsDto,
  type SessionSummaryDto,
  type UserPreferencesDto,
  type UpdateUserPreferencesInputDto,
  type DeleteAccountInputDto,
  SETTINGS_BOUNDS,
} from './settings-types.js';
import {
  ProfileUpdateError,
  InvalidDisplayNameError,
  CurrentPasswordIncorrectError,
  CannotChangeOAuthPasswordError,
  PreferenceUpdateError,
  AccountDeletionError,
} from './settings-errors.js';
import {
  UserNotFoundError,
  PasswordMismatchError,
} from '../auth/auth-errors.js';
import { PasswordHasher } from '../auth/password-hasher.js';
import { PasswordPolicy } from '../auth/password-policy.js';
import { AuthAuditService } from '../auth/auth-audit-service.js';

export class UserSettingsService implements IUserSettingsService {
  private readonly prisma: PrismaClient;
  private readonly auditService: AuthAuditService;
  private readonly passwordHasher: PasswordHasher;
  private readonly passwordPolicy: PasswordPolicy;

  constructor(
    prisma: PrismaClient,
    auditService?: AuthAuditService,
    passwordHasher?: PasswordHasher,
    passwordPolicy?: PasswordPolicy,
  ) {
    this.prisma = prisma;
    this.auditService = auditService ?? new AuthAuditService(prisma);
    this.passwordHasher = passwordHasher ?? new PasswordHasher();
    this.passwordPolicy = passwordPolicy ?? new PasswordPolicy();
  }

  /**
   * Retrieves the authoritative profile for an authenticated user.
   */
  public async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        socialIdentities: true,
      },
    });

    if (!user) {
      throw new UserNotFoundError(`User with id '${userId}' not found.`);
    }

    // Extract remote avatar URL if provided by OAuth profile
    let avatarUrl: string | null = null;
    for (const identity of user.socialIdentities) {
      const data = identity.profileData as Record<string, unknown> | null;
      if (data && typeof data.picture === 'string') {
        avatarUrl = data.picture;
        break;
      }
      if (data && typeof data.avatar_url === 'string') {
        avatarUrl = data.avatar_url;
        break;
      }
    }

    return {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      accountStatus: user.accountStatus,
      emailVerified: user.emailVerified,
      emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      lastAuthenticatedAt: user.lastAuthenticatedAt ? user.lastAuthenticatedAt.toISOString() : null,
      avatarUrl,
    };
  }

  /**
   * Updates permitted profile information (display name).
   * Validates bounds, trims whitespace, and rejects control characters.
   */
  public async updateProfile(
    userId: string,
    input: UpdateProfileInputDto,
  ): Promise<UserProfileDto> {
    if (!input || typeof input !== 'object') {
      throw new ProfileUpdateError('Profile update input must be a non-null object.');
    }

    if (typeof input.displayName !== 'string') {
      throw new InvalidDisplayNameError('Display name must be a string.');
    }

    const trimmed = input.displayName.trim();

    if (
      trimmed.length < SETTINGS_BOUNDS.MIN_DISPLAY_NAME_LENGTH ||
      trimmed.length > SETTINGS_BOUNDS.MAX_DISPLAY_NAME_LENGTH
    ) {
      throw new InvalidDisplayNameError(
        `Display name must be between ${SETTINGS_BOUNDS.MIN_DISPLAY_NAME_LENGTH} and ${SETTINGS_BOUNDS.MAX_DISPLAY_NAME_LENGTH} characters.`,
      );
    }

    // Reject control characters [\x00-\x1F\x7F]
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
      throw new InvalidDisplayNameError('Display name cannot contain control characters.');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      throw new UserNotFoundError(`User with id '${userId}' not found.`);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: trimmed,
      },
      include: {
        socialIdentities: true,
      },
    });

    await this.auditService.recordEvent({
      action: 'PROFILE_UPDATED',
      userId: updatedUser.id,
      actorEmail: updatedUser.email,
      metadata: {
        previousDisplayName: existingUser.displayName,
        updatedDisplayName: trimmed,
      },
    });

    return this.getProfile(userId);
  }

  /**
   * Changes the password for a password-based user account.
   * Enforces scrypt verification, password policy, and global revocation.
   */
  public async changePassword(
    userId: string,
    input: ChangePasswordInputDto,
  ): Promise<{ success: boolean }> {
    if (!input || typeof input !== 'object') {
      throw new ProfileUpdateError('Password change payload must be a non-null object.');
    }

    if (typeof input.currentPassword !== 'string' || typeof input.newPassword !== 'string') {
      throw new ProfileUpdateError('Current password and new password are required.');
    }

    if (input.confirmPassword !== undefined && input.confirmPassword !== input.newPassword) {
      throw new PasswordMismatchError('New password and confirmation do not match.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        passwordCredentials: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new UserNotFoundError(`User with id '${userId}' not found.`);
    }

    // OAuth-only account check
    if (user.passwordCredentials.length === 0) {
      throw new CannotChangeOAuthPasswordError();
    }

    const activeCredential = user.passwordCredentials[0];
    if (!activeCredential) {
      throw new CannotChangeOAuthPasswordError();
    }

    // Verify current password against active hash
    const isValid = await this.passwordHasher.verify(
      input.currentPassword,
      activeCredential.passwordHash,
    );

    if (!isValid) {
      throw new CurrentPasswordIncorrectError();
    }

    // Validate new password against policy
    this.passwordPolicy.assertValid(input.newPassword);

    // Hash new password using scrypt
    const hashed = await this.passwordHasher.hash(input.newPassword);
    const now = new Date();

    await this.prisma.$transaction(async tx => {
      await tx.passwordCredential.update({
        where: { id: activeCredential.id },
        data: {
          passwordHash: hashed.passwordHash,
          algorithm: hashed.algorithm,
          parameters: hashed.parameters as any,
          version: hashed.version,
          updatedAt: now,
          passwordChangedAt: now,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          securityVersion: { increment: 1 },
          updatedAt: now,
        },
      });
    });

    await this.auditService.recordEvent({
      action: 'PASSWORD_CHANGED',
      userId: user.id,
      actorEmail: user.email,
      metadata: {
        algorithm: hashed.algorithm,
      },
    });

    return { success: true };
  }

  /**
   * Retrieves connected authentication methods (Password, Google, Apple) for the user.
   */
  public async getAuthMethods(userId: string): Promise<UserAuthMethodsDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        passwordCredentials: true,
        socialIdentities: true,
        auditEvents: {
          where: {
            action: {
              in: ['LOGIN_SUCCESS', 'SOCIAL_AUTH_SUCCESS'],
            },
          },
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new UserNotFoundError(`User with id '${userId}' not found.`);
    }

    const googleIdentity = user.socialIdentities.find(s => s.provider === 'GOOGLE');
    const appleIdentity = user.socialIdentities.find(s => s.provider === 'APPLE');

    let lastSignInMethod: string | null = null;
    const lastEvent = user.auditEvents[0];
    if (lastEvent) {
      if (lastEvent.action === 'SOCIAL_AUTH_SUCCESS') {
        const meta = lastEvent.metadata as Record<string, unknown> | null;
        lastSignInMethod = typeof meta?.provider === 'string' ? meta.provider : 'SOCIAL';
      } else {
        lastSignInMethod = 'PASSWORD';
      }
    }

    return {
      hasPassword: user.passwordCredentials.length > 0,
      googleConnected: Boolean(googleIdentity),
      googleEmail: googleIdentity?.providerEmail ?? null,
      appleConnected: Boolean(appleIdentity),
      appleEmail: appleIdentity?.providerEmail ?? null,
      lastSignInMethod,
    };
  }

  /**
   * Retrieves active, non-revoked sessions for the user.
   */
  public async getActiveSessions(
    userId: string,
    currentSessionId?: string,
  ): Promise<readonly SessionSummaryDto[]> {
    const now = new Date();
    const sessions = await this.prisma.authSession.findMany({
      where: {
        userId,
        isRevoked: false,
        expiresAt: { gt: now },
      },
      orderBy: { lastUsedAt: 'desc' },
    });

    return sessions.map(s => ({
      sessionId: s.id,
      deviceInfo: s.deviceInfo ?? 'Desktop Client',
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      isCurrentSession: s.id === currentSessionId,
    }));
  }

  /**
   * Retrieves user preferences, automatically initializing default values if not yet created.
   * Read is fully idempotent.
   */
  public async getPreferences(userId: string): Promise<UserPreferencesDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UserNotFoundError(`User with id '${userId}' not found.`);
    }

    let pref = await this.prisma.userPreference.findUnique({
      where: { userId },
    });

    if (!pref) {
      pref = await this.prisma.userPreference.create({
        data: {
          userId,
        },
      });
    }

    return {
      theme: pref.theme as UserPreferencesDto['theme'],
      density: pref.density as UserPreferencesDto['density'],
      timeFormat: pref.timeFormat as UserPreferencesDto['timeFormat'],
      productionSafeMode: pref.productionSafeMode,
      defaultBrowser: pref.defaultBrowser as UserPreferencesDto['defaultBrowser'],
      confirmDestructiveActions: pref.confirmDestructiveActions,
      openExternalLinksSafely: pref.openExternalLinksSafely,
      desktopNotifications: pref.desktopNotifications,
      notifyTestRunComplete: pref.notifyTestRunComplete,
      notifyCriticalDefect: pref.notifyCriticalDefect,
      notifyRepairApproval: pref.notifyRepairApproval,
      notifyReleaseReadiness: pref.notifyReleaseReadiness,
      emailNotifications: pref.emailNotifications,
      emailCriticalDefect: pref.emailCriticalDefect,
      emailReleaseReadiness: pref.emailReleaseReadiness,
      telemetryEnabled: pref.telemetryEnabled,
      crashReportsEnabled: pref.crashReportsEnabled,
      createdAt: pref.createdAt.toISOString(),
      updatedAt: pref.updatedAt.toISOString(),
    };
  }

  /**
   * Updates application preferences for the authenticated user.
   * Enforces strict allowlist validation and enum checks.
   */
  public async updatePreferences(
    userId: string,
    input: UpdateUserPreferencesInputDto,
  ): Promise<UserPreferencesDto> {
    if (!input || typeof input !== 'object') {
      throw new PreferenceUpdateError('Preferences input must be a non-null object.');
    }

    const data: Record<string, unknown> = {};

    if (input.theme !== undefined) {
      if (!(SETTINGS_BOUNDS.SUPPORTED_THEMES as readonly string[]).includes(input.theme)) {
        throw new PreferenceUpdateError(`Invalid theme option: '${input.theme}'.`);
      }
      data.theme = input.theme;
    }

    if (input.density !== undefined) {
      if (!(SETTINGS_BOUNDS.SUPPORTED_DENSITIES as readonly string[]).includes(input.density)) {
        throw new PreferenceUpdateError(`Invalid density option: '${input.density}'.`);
      }
      data.density = input.density;
    }

    if (input.timeFormat !== undefined) {
      if (!(SETTINGS_BOUNDS.SUPPORTED_TIME_FORMATS as readonly string[]).includes(input.timeFormat)) {
        throw new PreferenceUpdateError(`Invalid time format option: '${input.timeFormat}'.`);
      }
      data.timeFormat = input.timeFormat;
    }

    if (input.defaultBrowser !== undefined) {
      if (!(SETTINGS_BOUNDS.SUPPORTED_BROWSERS as readonly string[]).includes(input.defaultBrowser)) {
        throw new PreferenceUpdateError(`Invalid browser preference: '${input.defaultBrowser}'.`);
      }
      data.defaultBrowser = input.defaultBrowser;
    }

    const booleanFields: (keyof UpdateUserPreferencesInputDto)[] = [
      'productionSafeMode',
      'confirmDestructiveActions',
      'openExternalLinksSafely',
      'desktopNotifications',
      'notifyTestRunComplete',
      'notifyCriticalDefect',
      'notifyRepairApproval',
      'notifyReleaseReadiness',
      'emailNotifications',
      'emailCriticalDefect',
      'emailReleaseReadiness',
      'telemetryEnabled',
      'crashReportsEnabled',
    ];

    for (const field of booleanFields) {
      if (input[field] !== undefined) {
        if (typeof input[field] !== 'boolean') {
          throw new PreferenceUpdateError(`Preference field '${field}' must be a boolean.`);
        }
        data[field] = input[field];
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UserNotFoundError(`User with id '${userId}' not found.`);
    }

    await this.prisma.userPreference.upsert({
      where: { userId },
      create: {
        userId,
        ...data,
      },
      update: {
        ...data,
      },
    });

    await this.auditService.recordEvent({
      action: 'PREFERENCE_UPDATED',
      userId,
      actorEmail: user.email,
      metadata: {
        updatedFields: Object.keys(data),
      },
    });

    return this.getPreferences(userId);
  }

  /**
   * Performs protected account deletion.
   * Requires confirmation text ('DELETE') and password verification if user has a password.
   * Sets account status to DELETED and revokes all active sessions.
   */
  public async deleteAccount(
    userId: string,
    input: DeleteAccountInputDto,
  ): Promise<{ success: boolean }> {
    if (!input || typeof input !== 'object') {
      throw new AccountDeletionError('Delete account payload must be a non-null object.');
    }

    if (input.confirmationText !== SETTINGS_BOUNDS.ACCOUNT_DELETION_CONFIRM_TEXT) {
      throw new AccountDeletionError(
        `Confirmation text must match '${SETTINGS_BOUNDS.ACCOUNT_DELETION_CONFIRM_TEXT}'.`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        passwordCredentials: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new UserNotFoundError(`User with id '${userId}' not found.`);
    }

    // If account has a password, verify it before deletion
    if (user.passwordCredentials.length > 0) {
      const activeCredential = user.passwordCredentials[0];
      if (!activeCredential || !input.currentPassword || typeof input.currentPassword !== 'string') {
        throw new AccountDeletionError('Password verification is required for account deletion.');
      }
      const isValid = await this.passwordHasher.verify(
        input.currentPassword,
        activeCredential.passwordHash,
      );
      if (!isValid) {
        throw new AccountDeletionError('Password verification failed.');
      }
    }

    const now = new Date();

    await this.prisma.$transaction(async tx => {
      // Mark user as DELETED
      await tx.user.update({
        where: { id: userId },
        data: {
          accountStatus: 'DELETED',
          updatedAt: now,
        },
      });

      // Revoke all active sessions
      await tx.authSession.updateMany({
        where: {
          userId,
          isRevoked: false,
        },
        data: {
          isRevoked: true,
          revokedAt: now,
          revocationReason: 'ACCOUNT_DELETED',
        },
      });
    });

    await this.auditService.recordEvent({
      action: 'ACCOUNT_DELETED',
      userId,
      actorEmail: user.email,
    });

    return { success: true };
  }
}
