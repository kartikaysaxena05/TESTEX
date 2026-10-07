/**
 * @file packages/core/src/settings/user-settings-service.test.ts
 * Unit test suite for UserSettingsService (V8 Phase 116).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../database/index.js';
import { UserSettingsService } from './user-settings-service.js';
import {
  InvalidDisplayNameError,
  CurrentPasswordIncorrectError,
  CannotChangeOAuthPasswordError,
  PreferenceUpdateError,
  AccountDeletionError,
} from './settings-errors.js';
import { PasswordHasher } from '../auth/password-hasher.js';
import type { PrismaClient } from '@prisma/client';

describe('UserSettingsService Unit Tests', () => {
  let prisma: PrismaClient;
  let service: UserSettingsService;
  const hasher = new PasswordHasher();
  const testRunId = `p116-test-${Date.now()}`;

  before(async () => {
    prisma = getPrismaClient()!;
    service = new UserSettingsService(prisma);
  });

  after(async () => {
    // Clean up test users
    await prisma.authAuditEvent.deleteMany({
      where: { actorEmail: { contains: testRunId } },
    });
    await prisma.userPreference.deleteMany({
      where: { user: { email: { contains: testRunId } } },
    });
    await prisma.authSession.deleteMany({
      where: { user: { email: { contains: testRunId } } },
    });
    await prisma.passwordCredential.deleteMany({
      where: { user: { email: { contains: testRunId } } },
    });
    await prisma.socialIdentity.deleteMany({
      where: { user: { email: { contains: testRunId } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: testRunId } },
    });
  });

  // --------------------------------------------------------------------------
  // 1. Profile Retrieval
  // --------------------------------------------------------------------------
  it('1. retrieves user profile without exposing sensitive credentials or hashes', async () => {
    const user = await prisma.user.create({
      data: {
        email: `profile.${testRunId}@platform.test`,
        normalizedEmail: `profile.${testRunId}@platform.test`,
        displayName: 'Alice Engineer',
        emailVerified: true,
      },
    });

    const profile = await service.getProfile(user.id);
    assert.equal(profile.userId, user.id);
    assert.equal(profile.email, `profile.${testRunId}@platform.test`);
    assert.equal(profile.displayName, 'Alice Engineer');
    assert.equal(profile.emailVerified, true);
    assert.equal(profile.accountStatus, 'ACTIVE');
    assert.ok(profile.createdAt);
    assert.ok(profile.updatedAt);

    // Verify zero secret leakage in DTO
    assert.equal((profile as any).passwordHash, undefined);
    assert.equal((profile as any).sessionToken, undefined);
  });

  // --------------------------------------------------------------------------
  // 2. Display Name Validation & Updates
  // --------------------------------------------------------------------------
  it('2. validates and updates display name with trimming and Unicode support', async () => {
    const user = await prisma.user.create({
      data: {
        email: `name.${testRunId}@platform.test`,
        normalizedEmail: `name.${testRunId}@platform.test`,
        displayName: 'Old Name',
      },
    });

    // Valid Unicode display name with whitespace
    const updated = await service.updateProfile(user.id, {
      displayName: '  Dr. René Müller-Théâtre  ',
    });
    assert.equal(updated.displayName, 'Dr. René Müller-Théâtre');

    // Verify persisted in DB
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(dbUser?.displayName, 'Dr. René Müller-Théâtre');

    // Verify audit event
    const audit = await prisma.authAuditEvent.findFirst({
      where: { userId: user.id, action: 'PROFILE_UPDATED' },
    });
    assert.ok(audit);
  });

  it('3. rejects empty, oversized, or control-character display names', async () => {
    const user = await prisma.user.create({
      data: {
        email: `bounds.${testRunId}@platform.test`,
        normalizedEmail: `bounds.${testRunId}@platform.test`,
        displayName: 'Bounds User',
      },
    });

    // Empty / whitespace-only
    await assert.rejects(
      () => service.updateProfile(user.id, { displayName: '   ' }),
      InvalidDisplayNameError,
    );

    // Oversized (> 100 chars)
    const longName = 'A'.repeat(101);
    await assert.rejects(
      () => service.updateProfile(user.id, { displayName: longName }),
      InvalidDisplayNameError,
    );

    // Control characters (e.g. null byte or ASCII escape)
    await assert.rejects(
      () => service.updateProfile(user.id, { displayName: 'Evil\x00Name' }),
      InvalidDisplayNameError,
    );
    await assert.rejects(
      () => service.updateProfile(user.id, { displayName: 'Bad\x1BName' }),
      InvalidDisplayNameError,
    );
  });

  // --------------------------------------------------------------------------
  // 3. Password Management & Scrypt Security
  // --------------------------------------------------------------------------
  it('4. changes password with scrypt verification, increments securityVersion, and logs audit', async () => {
    const originalPassword = 'InitialSecurePassword123!';
    const newPassword = 'UpdatedSecurePassword456!';
    const hashed = await hasher.hash(originalPassword);

    const user = await prisma.user.create({
      data: {
        email: `pass.${testRunId}@platform.test`,
        normalizedEmail: `pass.${testRunId}@platform.test`,
        displayName: 'Password User',
        securityVersion: 1,
        passwordCredentials: {
          create: {
            passwordHash: hashed.passwordHash,
            algorithm: hashed.algorithm,
            parameters: hashed.parameters as any,
          },
        },
      },
    });

    // Attempt with incorrect current password
    await assert.rejects(
      () =>
        service.changePassword(user.id, {
          currentPassword: 'WrongPassword999!',
          newPassword,
        }),
      CurrentPasswordIncorrectError,
    );

    // Successful password change
    const res = await service.changePassword(user.id, {
      currentPassword: originalPassword,
      newPassword,
      confirmPassword: newPassword,
    });
    assert.equal(res.success, true);

    // Verify DB update: new hash verifies, old hash fails
    const updatedCred = await prisma.passwordCredential.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(updatedCred);
    const oldVerifies = await hasher.verify(originalPassword, updatedCred.passwordHash);
    const newVerifies = await hasher.verify(newPassword, updatedCred.passwordHash);
    assert.equal(oldVerifies, false);
    assert.equal(newVerifies, true);

    // Verify securityVersion incremented
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(updatedUser?.securityVersion, 2);

    // Verify audit event
    const audit = await prisma.authAuditEvent.findFirst({
      where: { userId: user.id, action: 'PASSWORD_CHANGED' },
    });
    assert.ok(audit);
  });

  it('5. rejects password change for OAuth-only accounts', async () => {
    const user = await prisma.user.create({
      data: {
        email: `oauth-only.${testRunId}@platform.test`,
        normalizedEmail: `oauth-only.${testRunId}@platform.test`,
        displayName: 'Google Social User',
        socialIdentities: {
          create: {
            provider: 'GOOGLE',
            providerSubjectId: `goog-${testRunId}`,
            providerEmail: `oauth-only.${testRunId}@platform.test`,
            emailVerified: true,
          },
        },
      },
    });

    await assert.rejects(
      () =>
        service.changePassword(user.id, {
          currentPassword: 'SomePassword123!',
          newPassword: 'NewPassword123!',
        }),
      CannotChangeOAuthPasswordError,
    );
  });

  // --------------------------------------------------------------------------
  // 4. Connected Authentication Methods
  // --------------------------------------------------------------------------
  it('6. correctly detects connected authentication methods and provider emails', async () => {
    const hashed = await hasher.hash('MultiProviderPass123!');
    const user = await prisma.user.create({
      data: {
        email: `multi.${testRunId}@platform.test`,
        normalizedEmail: `multi.${testRunId}@platform.test`,
        displayName: 'Multi Provider User',
        passwordCredentials: {
          create: {
            passwordHash: hashed.passwordHash,
            algorithm: hashed.algorithm,
            parameters: hashed.parameters as any,
          },
        },
        socialIdentities: {
          create: {
            provider: 'GOOGLE',
            providerSubjectId: `sub-google-${testRunId}`,
            providerEmail: `google.${testRunId}@gmail.com`,
            emailVerified: true,
          },
        },
      },
    });

    const methods = await service.getAuthMethods(user.id);
    assert.equal(methods.hasPassword, true);
    assert.equal(methods.googleConnected, true);
    assert.equal(methods.googleEmail, `google.${testRunId}@gmail.com`);
    assert.equal(methods.appleConnected, false);
    assert.equal(methods.appleEmail, null);
  });

  // --------------------------------------------------------------------------
  // 5. Active Sessions Listing
  // --------------------------------------------------------------------------
  it('7. lists active sessions safely without exposing session tokens or token hashes', async () => {
    const user = await prisma.user.create({
      data: {
        email: `sessions.${testRunId}@platform.test`,
        normalizedEmail: `sessions.${testRunId}@platform.test`,
        displayName: 'Sessions User',
      },
    });

    const now = new Date();
    const session1 = await prisma.authSession.create({
      data: {
        userId: user.id,
        sessionTokenHash: `hash1-${testRunId}`,
        deviceInfo: 'MacBook Pro (macOS 15.2)',
        expiresAt: new Date(now.getTime() + 86400000),
      },
    });

    const session2 = await prisma.authSession.create({
      data: {
        userId: user.id,
        sessionTokenHash: `hash2-${testRunId}`,
        deviceInfo: 'Linux Desktop (Ubuntu 24.04)',
        expiresAt: new Date(now.getTime() + 86400000),
      },
    });

    const sessions = await service.getActiveSessions(user.id, session1.id);
    assert.equal(sessions.length, 2);

    const s1 = sessions.find(s => s.sessionId === session1.id);
    const s2 = sessions.find(s => s.sessionId === session2.id);

    assert.ok(s1);
    assert.ok(s2);
    assert.equal(s1?.isCurrentSession, true);
    assert.equal(s2?.isCurrentSession, false);
    assert.equal(s1?.deviceInfo, 'MacBook Pro (macOS 15.2)');

    // Invariant: zero token hash leakage
    assert.equal((s1 as any).sessionTokenHash, undefined);
    assert.equal((s1 as any).sessionToken, undefined);
  });

  // --------------------------------------------------------------------------
  // 6. Preferences & Read Idempotency
  // --------------------------------------------------------------------------
  it('8. initializes default preferences and supports idempotent reads', async () => {
    const user = await prisma.user.create({
      data: {
        email: `pref-default.${testRunId}@platform.test`,
        normalizedEmail: `pref-default.${testRunId}@platform.test`,
        displayName: 'Pref User',
      },
    });

    // First read initializes default
    const pref1 = await service.getPreferences(user.id);
    assert.equal(pref1.theme, 'system');
    assert.equal(pref1.density, 'comfortable');
    assert.equal(pref1.productionSafeMode, true);
    assert.equal(pref1.defaultBrowser, 'chromium');
    assert.equal(pref1.desktopNotifications, true);
    assert.equal(pref1.telemetryEnabled, false);

    // Second read returns identical state without duplicate entries
    const pref2 = await service.getPreferences(user.id);
    assert.equal(pref2.theme, 'system');
    assert.equal(pref2.createdAt, pref1.createdAt);

    const count = await prisma.userPreference.count({ where: { userId: user.id } });
    assert.equal(count, 1);
  });

  it('9. updates preferences with strict enum validation and rejects attacks', async () => {
    const user = await prisma.user.create({
      data: {
        email: `pref-update.${testRunId}@platform.test`,
        normalizedEmail: `pref-update.${testRunId}@platform.test`,
        displayName: 'Update Pref User',
      },
    });

    // Valid update
    const updated = await service.updatePreferences(user.id, {
      theme: 'dark',
      density: 'compact',
      defaultBrowser: 'firefox',
      productionSafeMode: true,
      desktopNotifications: false,
    });

    assert.equal(updated.theme, 'dark');
    assert.equal(updated.density, 'compact');
    assert.equal(updated.defaultBrowser, 'firefox');
    assert.equal(updated.desktopNotifications, false);

    // Reject unknown theme enum
    await assert.rejects(
      () =>
        service.updatePreferences(user.id, {
          theme: 'SUPER_ADMIN_MODE' as any,
        }),
      PreferenceUpdateError,
    );

    // Reject non-boolean for boolean preference
    await assert.rejects(
      () =>
        service.updatePreferences(user.id, {
          productionSafeMode: 'disabled' as any,
        }),
      PreferenceUpdateError,
    );
  });

  // --------------------------------------------------------------------------
  // 7. Protected Account Deletion
  // --------------------------------------------------------------------------
  it('10. performs protected account deletion with password verification and revokes sessions', async () => {
    const password = 'DeleteMeSecurely123!';
    const hashed = await hasher.hash(password);
    const user = await prisma.user.create({
      data: {
        email: `delete.${testRunId}@platform.test`,
        normalizedEmail: `delete.${testRunId}@platform.test`,
        displayName: 'Delete User',
        passwordCredentials: {
          create: {
            passwordHash: hashed.passwordHash,
            algorithm: hashed.algorithm,
            parameters: hashed.parameters as any,
          },
        },
        sessions: {
          create: {
            sessionTokenHash: `del-sess-${testRunId}`,
            expiresAt: new Date(Date.now() + 86400000),
          },
        },
      },
    });

    // Rejects if confirmationText doesn't match 'DELETE'
    await assert.rejects(
      () =>
        service.deleteAccount(user.id, {
          confirmationText: 'CANCEL',
          currentPassword: password,
        }),
      AccountDeletionError,
    );

    // Rejects if password is wrong
    await assert.rejects(
      () =>
        service.deleteAccount(user.id, {
          confirmationText: 'DELETE',
          currentPassword: 'WrongPassword999!',
        }),
      AccountDeletionError,
    );

    // Succeeds with correct text and password
    const res = await service.deleteAccount(user.id, {
      confirmationText: 'DELETE',
      currentPassword: password,
    });
    assert.equal(res.success, true);

    // Verify user marked DELETED
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(dbUser?.accountStatus, 'DELETED');

    // Verify sessions revoked
    const sessions = await prisma.authSession.findMany({ where: { userId: user.id } });
    assert.ok(sessions.every(s => s.isRevoked === true));
  });
});
