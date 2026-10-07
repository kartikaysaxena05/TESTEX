/**
 * @file apps/desktop/src/main/v8-phase116-settings-certification.test.tsx
 * Authoritative Certification Test Suite for:
 * V8 Phase 116: "User Profile, Account Settings & Application Preferences".
 *
 * Verifies:
 * 1. User Profile Retrieval: Authoritative fields retrieved from PostgreSQL.
 * 2. Profile Display Name Update: Valid updates persisted with PROFILE_UPDATED audit entry.
 * 3. Profile Display Name Validation: Rejects invalid lengths (< 2, > 100) and whitespace.
 * 4. Email Immutability: Prevents mutation of email address via profile APIs.
 * 5. Local Password Change: Valid current password + compliant new password changes hash.
 * 6. Current Password Rejection: Rejects incorrect current password with CURRENT_PASSWORD_INCORRECT.
 * 7. Password Policy Enforcement: Rejects weak new passwords violating complexity policy.
 * 8. Social-Only Password Change Rejection: Rejects CANNOT_CHANGE_OAUTH_PASSWORD for OAuth users.
 * 9. Authentication Methods Enumeration: Accurately reflects password and social provider links.
 * 10. Active Sessions Enumeration: Lists active sessions and accurately tags current session.
 * 11. Session Revocation from Settings: Revokes selected session and invalidates access.
 * 12. Default Preferences Provisioning: Default safe mode ON, theme system, density comfortable.
 * 13. Preferences Update Persistence: Persists mutations and logs PREFERENCE_UPDATED audit entry.
 * 14. Production Safe Mode Guard: Verifies default ON guard and mutation persistence.
 * 15. Protected Account Deletion (Success): Verifies DELETE confirmation + password verification cascades.
 * 16. Protected Account Deletion (Invalid Text): Rejects invalid confirmation tokens.
 * 17. Protected Account Deletion (Invalid Password): Rejects deletion on incorrect password.
 * 18. Multi-User Isolation Invariant: Strict user boundary enforced via session token context.
 * 19. IPC Security & Sender Validation: Untrusted senders blocked on all 8 settings channels.
 * 20. UI Component Certification: Full render of SettingsScreen tabs, PreferencesContext, and HeaderBar.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { IpcMainInvokeEvent } from 'electron';

import {
  getPrismaClient,
  AuthenticationService,
  UserSettingsService,
  InvalidDisplayNameError,
  CurrentPasswordIncorrectError,
  CannotChangeOAuthPasswordError,
  PasswordPolicyViolationError,
  AccountDeletionError,
} from '@ai-quality/core';

import { DesktopSecureStorage } from './secure-storage/desktop-secure-storage.js';
import {
  handleGetProfile,
  handleUpdateProfile,
  handleChangePassword,
  handleGetAuthMethods,
  handleGetSessions,
  handleGetPreferences,
  handleUpdatePreferences,
  handleDeleteAccount,
  setSettingsServiceForTest,
  resetSettingsServiceForTest,
} from './ipc/settings-handlers.js';
import {
  setAuthServiceForTest,
  setSecureStorageForTest,
  resetAuthStoreForTest,
} from './ipc/auth-handlers.js';
import { createSafeIpcHandler } from './ipc/register-ipc.js';
import { DESKTOP_CHANNELS } from '@ai-quality/contracts';
import { SettingsScreen } from '../renderer/screens/SettingsScreen.js';
import { PreferencesProvider } from '../renderer/context/PreferencesContext.js';
import { AuthProvider } from '../renderer/context/AuthContext.js';
import { ProjectProvider } from '../renderer/context/ProjectContext.js';
import { WorkspaceProvider } from '../renderer/context/WorkspaceContext.js';
import { ProjectHeaderBar } from '../renderer/features/shell/ProjectHeaderBar.js';

describe('V8 Phase 116 — User Profile, Account Settings & Preferences Certification', () => {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Real PostgreSQL database client is required for Phase 116 certification.');
  }

  const testRunId = crypto.randomUUID().substring(0, 8);
  let authService: AuthenticationService;
  let settingsService: UserSettingsService;
  let inMemoryStorage: DesktopSecureStorage;

  const createdUserIds: string[] = [];

  before(() => {
    authService = new AuthenticationService(prisma);
    settingsService = new UserSettingsService(prisma);
    inMemoryStorage = new DesktopSecureStorage();

    setAuthServiceForTest(authService);
    setSettingsServiceForTest(settingsService);
    setSecureStorageForTest(inMemoryStorage);
  });

  after(async () => {
    resetAuthStoreForTest();
    resetSettingsServiceForTest();

    // Clean up created test users
    for (const uid of createdUserIds) {
      try {
        await prisma.userPreference.deleteMany({ where: { userId: uid } });
        await prisma.authSession.deleteMany({ where: { userId: uid } });
        await prisma.socialIdentity.deleteMany({ where: { userId: uid } });
        await prisma.passwordCredential.deleteMany({ where: { userId: uid } });
        await prisma.user.deleteMany({ where: { id: uid } });
      } catch {
        // Ignored in cleanup
      }
    }
  });

  const createTestUserWithPassword = async (suffix: string, pass = 'ValidPass123!@#') => {
    const email = `settings.${suffix}.${testRunId}@platform.test`;
    const signup = await authService.signup({
      email,
      password: pass,
      confirmPassword: pass,
      fullName: `User ${suffix}`,
    });
    createdUserIds.push(signup.userContext.userId);
    return { ...signup, plainPassword: pass, email };
  };

  const createTestSocialUser = async (suffix: string) => {
    const email = `social.${suffix}.${testRunId}@platform.test`;
    const user = await prisma.user.create({
      data: {
        email,
        normalizedEmail: email.toLowerCase(),
        displayName: `Social User ${suffix}`,
        emailVerified: true,
      },
    });
    createdUserIds.push(user.id);
    await prisma.socialIdentity.create({
      data: {
        userId: user.id,
        provider: 'GOOGLE',
        providerSubjectId: `google-sub-${suffix}-${testRunId}`,
        providerEmail: email,
        emailVerified: true,
      },
    });
    return user;
  };

  // --------------------------------------------------------------------------
  // 1. User Profile Retrieval
  // --------------------------------------------------------------------------
  it('1. Profile Retrieval: retrieves authoritative user profile with accurate timestamps and status', async () => {
    const user = await createTestUserWithPassword('p1');
    const profile = await settingsService.getProfile(user.userContext.userId);

    assert.equal(profile.userId, user.userContext.userId);
    assert.equal(profile.email, user.email);
    assert.equal(profile.displayName, 'User p1');
    assert.equal(profile.accountStatus, 'ACTIVE');
    assert.ok(profile.createdAt);
    assert.ok(profile.updatedAt);
  });

  // --------------------------------------------------------------------------
  // 2. Profile Display Name Update
  // --------------------------------------------------------------------------
  it('2. Display Name Update: successfully updates display name and logs PROFILE_UPDATED audit entry', async () => {
    const user = await createTestUserWithPassword('p2');
    const updated = await settingsService.updateProfile(user.userContext.userId, {
      displayName: 'Alice Engineer',
    });

    assert.equal(updated.displayName, 'Alice Engineer');

    // Verify DB persistence
    const dbUser = await prisma.user.findUnique({ where: { id: user.userContext.userId } });
    assert.equal(dbUser?.displayName, 'Alice Engineer');

    // Verify Audit Log
    const audit = await prisma.authAuditEvent.findFirst({
      where: {
        userId: user.userContext.userId,
        action: 'PROFILE_UPDATED',
      },
      orderBy: { timestamp: 'desc' },
    });
    assert.ok(audit, 'PROFILE_UPDATED audit event must be logged');
  });

  // --------------------------------------------------------------------------
  // 3. Profile Display Name Validation
  // --------------------------------------------------------------------------
  it('3. Display Name Validation: rejects empty, whitespace-only, or oversized names', async () => {
    const user = await createTestUserWithPassword('p3');

    await assert.rejects(
      () => settingsService.updateProfile(user.userContext.userId, { displayName: '' }),
      InvalidDisplayNameError,
    );

    await assert.rejects(
      () => settingsService.updateProfile(user.userContext.userId, { displayName: '   ' }),
      InvalidDisplayNameError,
    );

    await assert.rejects(
      () => settingsService.updateProfile(user.userContext.userId, { displayName: 'X'.repeat(101) }),
      InvalidDisplayNameError,
    );
  });

  // --------------------------------------------------------------------------
  // 4. Email Immutability
  // --------------------------------------------------------------------------
  it('4. Email Immutability: email cannot be mutated via profile update input', async () => {
    const user = await createTestUserWithPassword('p4');
    const input = { displayName: 'Updated Name', email: 'hacked@platform.test' } as any;

    const updated = await settingsService.updateProfile(user.userContext.userId, input);
    assert.equal(updated.email, user.email, 'Email must remain unchanged');

    const dbUser = await prisma.user.findUnique({ where: { id: user.userContext.userId } });
    assert.equal(dbUser?.email, user.email);
  });

  // --------------------------------------------------------------------------
  // 5. Local Password Change
  // --------------------------------------------------------------------------
  it('5. Password Change: changes password when current password matches and new meets policy', async () => {
    const user = await createTestUserWithPassword('p5', 'OldPassword123!@#');
    const result = await settingsService.changePassword(user.userContext.userId, {
      currentPassword: 'OldPassword123!@#',
      newPassword: 'NewPassword987$#@',
      confirmPassword: 'NewPassword987$#@',
    });

    assert.equal(result.success, true);

    // Verify login with new password succeeds
    const newLogin = await authService.authenticateWithPassword(
      user.email,
      'NewPassword987$#@',
    );
    assert.equal(newLogin.userContext.userId, user.userContext.userId);

    // Verify old password fails
    await assert.rejects(() =>
      authService.authenticateWithPassword(
        user.email,
        'OldPassword123!@#',
      ),
    );
  });

  // --------------------------------------------------------------------------
  // 6. Current Password Rejection
  // --------------------------------------------------------------------------
  it('6. Current Password Check: rejects password change if current password is incorrect', async () => {
    const user = await createTestUserWithPassword('p6', 'CorrectPassword123!@#');

    await assert.rejects(
      () =>
        settingsService.changePassword(user.userContext.userId, {
          currentPassword: 'WrongPassword999!@#',
          newPassword: 'ValidNewPassword123!@#',
        }),
      CurrentPasswordIncorrectError,
    );
  });

  // --------------------------------------------------------------------------
  // 7. Password Policy Enforcement on Settings
  // --------------------------------------------------------------------------
  it('7. Password Policy: rejects weak new passwords that fail complexity rules', async () => {
    const user = await createTestUserWithPassword('p7', 'CorrectPassword123!@#');

    // Too short (< 8 chars)
    await assert.rejects(
      () =>
        settingsService.changePassword(user.userContext.userId, {
          currentPassword: 'CorrectPassword123!@#',
          newPassword: 'Weak1!',
        }),
      PasswordPolicyViolationError,
    );

    // No numbers or specials
    await assert.rejects(
      () =>
        settingsService.changePassword(user.userContext.userId, {
          currentPassword: 'CorrectPassword123!@#',
          newPassword: 'alllettersonlylongenough',
        }),
      PasswordPolicyViolationError,
    );
  });

  // --------------------------------------------------------------------------
  // 8. Social-Only Account Password Change Rejection
  // --------------------------------------------------------------------------
  it('8. Social-Only Guard: rejects password change for accounts authenticated via OAuth only', async () => {
    const socialUser = await createTestSocialUser('p8');

    await assert.rejects(
      () =>
        settingsService.changePassword(socialUser.id, {
          currentPassword: 'AnyPassword123!@#',
          newPassword: 'BrandNewPassword123!@#',
        }),
      CannotChangeOAuthPasswordError,
    );
  });

  // --------------------------------------------------------------------------
  // 9. Authentication Methods Enumeration
  // --------------------------------------------------------------------------
  it('9. Auth Methods: enumerates local password and connected social providers', async () => {
    const user = await createTestUserWithPassword('p9');
    const methods = await settingsService.getAuthMethods(user.userContext.userId);

    assert.equal(methods.hasPassword, true);
    assert.equal(methods.googleConnected, false);
    assert.equal(methods.appleConnected, false);

    const socialUser = await createTestSocialUser('p9b');
    const socialMethods = await settingsService.getAuthMethods(socialUser.id);
    assert.equal(socialMethods.hasPassword, false);
    assert.equal(socialMethods.googleConnected, true);
  });

  // --------------------------------------------------------------------------
  // 10. Active Sessions Enumeration & Current Session Detection
  // --------------------------------------------------------------------------
  it('10. Sessions Enumeration: lists active sessions and correctly tags current session', async () => {
    const user = await createTestUserWithPassword('p10');
    // Create a second session
    const session2 = await prisma.authSession.create({
      data: {
        userId: user.userContext.userId,
        sessionTokenHash: crypto.randomBytes(32).toString('hex'),
        deviceInfo: 'Second Workstation',
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const sessions = await settingsService.getActiveSessions(
      user.userContext.userId,
      user.userContext.sessionId,
    );

    assert.equal(sessions.length, 2);
    const current = sessions.find(s => s.sessionId === user.userContext.sessionId);
    const other = sessions.find(s => s.sessionId === session2.id);

    assert.ok(current);
    assert.equal(current?.isCurrentSession, true);
    assert.ok(other);
    assert.equal(other?.isCurrentSession, false);
  });

  // --------------------------------------------------------------------------
  // 11. Session Revocation from Settings
  // --------------------------------------------------------------------------
  it('11. Session Revocation: revokes specified active session and removes it from active list', async () => {
    const user = await createTestUserWithPassword('p11');
    const sessionToRevoke = await prisma.authSession.create({
      data: {
        userId: user.userContext.userId,
        sessionTokenHash: crypto.randomBytes(32).toString('hex'),
        deviceInfo: 'Revocable Tablet',
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    await authService.revokeSession(sessionToRevoke.id);

    const sessions = await settingsService.getActiveSessions(
      user.userContext.userId,
      user.userContext.sessionId,
    );
    assert.equal(sessions.some(s => s.sessionId === sessionToRevoke.id), false);
  });

  // --------------------------------------------------------------------------
  // 12. Default Application Preferences Provisioning
  // --------------------------------------------------------------------------
  it('12. Default Preferences: provisions defaults with productionSafeMode: true and theme: system', async () => {
    const user = await createTestUserWithPassword('p12');
    const prefs = await settingsService.getPreferences(user.userContext.userId);

    assert.equal(prefs.productionSafeMode, true, 'Default production safe mode must be TRUE');
    assert.equal(prefs.theme, 'system');
    assert.equal(prefs.density, 'comfortable');
    assert.equal(prefs.defaultBrowser, 'chromium');
    assert.equal(prefs.desktopNotifications, true);
    assert.equal(prefs.telemetryEnabled, false);
  });

  // --------------------------------------------------------------------------
  // 13. Preferences Update Persistence
  // --------------------------------------------------------------------------
  it('13. Preferences Update: persists user preferences mutations and logs PREFERENCE_UPDATED audit', async () => {
    const user = await createTestUserWithPassword('p13');
    const updated = await settingsService.updatePreferences(user.userContext.userId, {
      theme: 'dark',
      density: 'compact',
      defaultBrowser: 'firefox',
    });

    assert.equal(updated.theme, 'dark');
    assert.equal(updated.density, 'compact');
    assert.equal(updated.defaultBrowser, 'firefox');

    // Verify DB
    const dbPrefs = await prisma.userPreference.findUnique({
      where: { userId: user.userContext.userId },
    });
    assert.equal(dbPrefs?.theme, 'dark');
    assert.equal(dbPrefs?.density, 'compact');

    // Verify audit
    const audit = await prisma.authAuditEvent.findFirst({
      where: {
        userId: user.userContext.userId,
        action: 'PREFERENCE_UPDATED',
      },
      orderBy: { timestamp: 'desc' },
    });
    assert.ok(audit);
  });

  // --------------------------------------------------------------------------
  // 14. Production Safe Mode Guard & Persistence
  // --------------------------------------------------------------------------
  it('14. Safe Mode Guard: toggles productionSafeMode and persists state accurately', async () => {
    const user = await createTestUserWithPassword('p14');
    const initial = await settingsService.getPreferences(user.userContext.userId);
    assert.equal(initial.productionSafeMode, true);

    // Disable safe mode
    const disabled = await settingsService.updatePreferences(user.userContext.userId, {
      productionSafeMode: false,
    });
    assert.equal(disabled.productionSafeMode, false);

    // Re-enable safe mode
    const reenabled = await settingsService.updatePreferences(user.userContext.userId, {
      productionSafeMode: true,
    });
    assert.equal(reenabled.productionSafeMode, true);
  });

  // --------------------------------------------------------------------------
  // 15. Protected Account Deletion — Valid Confirmation & Password
  // --------------------------------------------------------------------------
  it('15. Account Deletion: successfully deletes account when confirmation is DELETE and password is valid', async () => {
    const user = await createTestUserWithPassword('p15', 'DeleteMePass123!@#');
    // Create preferences row
    await settingsService.getPreferences(user.userContext.userId);

    const result = await settingsService.deleteAccount(user.userContext.userId, {
      confirmationText: 'DELETE',
      currentPassword: 'DeleteMePass123!@#',
    });
    assert.equal(result.success, true);

    // Verify user marked as DELETED in DB
    const dbUser = await prisma.user.findUnique({ where: { id: user.userContext.userId } });
    assert.equal(dbUser?.accountStatus, 'DELETED');

    // Verify active sessions revoked
    const activeSessions = await prisma.authSession.findMany({
      where: { userId: user.userContext.userId, isRevoked: false },
    });
    assert.equal(activeSessions.length, 0);

    // Verify audit event
    const audit = await prisma.authAuditEvent.findFirst({
      where: {
        actorEmail: user.email.toLowerCase(),
        action: 'ACCOUNT_DELETED',
      },
    });
    assert.ok(audit);
  });

  // --------------------------------------------------------------------------
  // 16. Protected Account Deletion — Invalid Confirmation
  // --------------------------------------------------------------------------
  it('16. Deletion Guard (Confirmation): rejects deletion when confirmation text is not exact DELETE', async () => {
    const user = await createTestUserWithPassword('p16', 'DeleteMePass123!@#');

    await assert.rejects(
      () =>
        settingsService.deleteAccount(user.userContext.userId, {
          confirmationText: 'delete', // lowercase
          currentPassword: 'DeleteMePass123!@#',
        }),
      AccountDeletionError,
    );

    await assert.rejects(
      () =>
        settingsService.deleteAccount(user.userContext.userId, {
          confirmationText: 'CONFIRM',
          currentPassword: 'DeleteMePass123!@#',
        }),
      AccountDeletionError,
    );
  });

  // --------------------------------------------------------------------------
  // 17. Protected Account Deletion — Invalid Password
  // --------------------------------------------------------------------------
  it('17. Deletion Guard (Password): rejects deletion when provided password does not match', async () => {
    const user = await createTestUserWithPassword('p17', 'CorrectPassword123!@#');

    await assert.rejects(
      () =>
        settingsService.deleteAccount(user.userContext.userId, {
          confirmationText: 'DELETE',
          currentPassword: 'WrongPassword999!@#',
        }),
      AccountDeletionError,
    );
  });

  // --------------------------------------------------------------------------
  // 18. Multi-User Isolation Invariant
  // --------------------------------------------------------------------------
  it('18. Multi-User Isolation: User A cannot access or mutate User B data via IPC', async () => {
    const userA = await createTestUserWithPassword('p18a');
    const userB = await createTestUserWithPassword('p18b');

    // Simulate authenticated IPC context for User A
    await inMemoryStorage.storeSessionToken(userA.sessionToken);

    const mockEvent = {
      sender: { getURL: () => 'file:///app/dist/index.html' },
      senderFrame: null,
    } as unknown as IpcMainInvokeEvent;

    // Call handleGetProfile as User A
    const profileA = await handleGetProfile(mockEvent);
    assert.equal(profileA.userId, userA.userContext.userId);
    assert.notEqual(profileA.userId, userB.userContext.userId);

    // Call handleUpdatePreferences as User A; ensure User B is unaffected
    await handleUpdatePreferences(mockEvent, { theme: 'light' });

    const prefsB = await settingsService.getPreferences(userB.userContext.userId);
    assert.equal(prefsB.theme, 'system', 'User B preferences must remain untouched');
  });

  // --------------------------------------------------------------------------
  // 19. IPC Security & Sender Validation
  // --------------------------------------------------------------------------
  it('19. IPC Security: rejects untrusted senders and nested frames across all 8 settings channels', async () => {
    const untrustedEvent = {
      sender: { getURL: () => 'https://malicious-site.org' },
      senderFrame: { parent: {} },
    } as unknown as IpcMainInvokeEvent;

    const channels: Array<{
      name: string;
      handler: (event: IpcMainInvokeEvent, payload: any) => Promise<any>;
    }> = [
      { name: DESKTOP_CHANNELS.SETTINGS_GET_PROFILE, handler: handleGetProfile },
      { name: DESKTOP_CHANNELS.SETTINGS_UPDATE_PROFILE, handler: handleUpdateProfile },
      { name: DESKTOP_CHANNELS.SETTINGS_CHANGE_PASSWORD, handler: handleChangePassword },
      { name: DESKTOP_CHANNELS.SETTINGS_GET_AUTH_METHODS, handler: handleGetAuthMethods },
      { name: DESKTOP_CHANNELS.SETTINGS_GET_SESSIONS, handler: handleGetSessions },
      { name: DESKTOP_CHANNELS.SETTINGS_GET_PREFERENCES, handler: handleGetPreferences },
      { name: DESKTOP_CHANNELS.SETTINGS_UPDATE_PREFERENCES, handler: handleUpdatePreferences },
      { name: DESKTOP_CHANNELS.SETTINGS_DELETE_ACCOUNT, handler: handleDeleteAccount },
    ];

    for (const ch of channels) {
      const safeHandler = createSafeIpcHandler(ch.name, (ev: IpcMainInvokeEvent) =>
        ch.handler(ev, {} as any),
      );
      const res = await safeHandler(untrustedEvent);
      assert.equal(res.ok, false, `Untrusted sender must be rejected on ${ch.name}`);
      if (!res.ok) {
        assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    }
  });

  // --------------------------------------------------------------------------
  // 20. UI Component Certification
  // --------------------------------------------------------------------------
  it('20. Desktop UI: renders SettingsScreen tabs, PreferencesContext, and HeaderBar buttons', () => {
    const html = renderToString(
      <MemoryRouter>
        <AuthProvider initialStatus="authenticated">
          <PreferencesProvider>
            <ProjectProvider>
              <WorkspaceProvider>
                <ProjectHeaderBar bridgeState="ready" />
                <SettingsScreen initialTab="profile" />
              </WorkspaceProvider>
            </ProjectProvider>
          </PreferencesProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    // Settings screen and tabs
    assert.ok(html.includes('data-screen="settings"'), 'Must render settings screen');
    assert.ok(html.includes('data-testid="tab-profile"'), 'Must render Profile tab');
    assert.ok(html.includes('data-testid="tab-security"'), 'Must render Security tab');
    assert.ok(html.includes('data-testid="tab-appearance"'), 'Must render Appearance tab');
    assert.ok(html.includes('data-testid="tab-preferences"'), 'Must render Preferences tab');
    assert.ok(html.includes('data-testid="tab-notifications"'), 'Must render Notifications tab');
    assert.ok(html.includes('data-testid="tab-privacy"'), 'Must render Privacy tab');
    assert.ok(html.includes('data-testid="tab-infrastructure"'), 'Must render Infrastructure tab');
    assert.ok(html.includes('data-testid="tab-about"'), 'Must render About tab');

    // Header bar button
    assert.ok(html.includes('data-testid="codex-settings-btn"'), 'Must render settings button in HeaderBar');
    assert.ok(html.includes('data-testid="codex-signout-btn"'), 'Must render signout button in HeaderBar');
  });
});
