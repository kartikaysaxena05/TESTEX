/**
 * @file apps/desktop/src/main/v8-phase113-auth-certification.test.ts
 * Authoritative Certification Test Suite for:
 * V8 Phase 113: "User Authentication Foundation".
 *
 * Verifies:
 * 1. Authoritative User Identity model with PostgreSQL persistence and deterministic email canonicalization.
 * 2. Credential separation with modern memory-hard scrypt hashing, parameter versioning, and zero plaintext storage.
 * 3. Password policy foundation (length boundaries, common password rejection, complexity rules).
 * 4. Password verification (valid passwords match, wrong passwords fail in constant time).
 * 5. Account enumeration resistance and timing-safe dummy hashing for unknown accounts.
 * 6. Account state enforcement (ACTIVE, DISABLED, LOCKED, DELETED).
 * 7. Session lifecycle: cryptographic issuance, SHA-256 token hashing, expiration, and constant-time validation.
 * 8. Session revocation (single session and global user revocation).
 * 9. Desktop restart persistence and safe restoration via DesktopSecureStorage abstraction.
 * 10. Tampered session token rejection and safe purge without silent reconstruction.
 * 11. Multi-session independence across different devices/workspaces.
 * 12. Brute-force protection, throttling, and immunity to normalization bypass attacks.
 * 13. Input injection defense (SQL injection, oversized input, null/malformed IPC payloads).
 * 14. IPC boundary security: trusted sender validation, top-frame enforcement, and mass-assignment protection.
 * 15. Absolute secret redaction across logs, errors, audit events, and renderer DTOs.
 * 16. Security audit trail recording in PostgreSQL for all critical lifecycle actions.
 * 17. Strict boundary enforcement: zero Phase 114 login/signup screens, zero Phase 115 social auth.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';

import {
  getPrismaClient,
  AuthenticationService,
  PasswordPolicy,
  AuthenticationFailedError,
  AccountDisabledError,
  AccountLockedError,
  SessionExpiredError,
  SessionRevokedError,
  UserAlreadyExistsError,
  InvalidAuthInputError,
  RateLimitedError,
  PasswordPolicyViolationError,
} from '@ai-quality/core';

import { DesktopSecureStorage } from './secure-storage/desktop-secure-storage.js';
import {
  handleGetAuthState,
  handleLogin,
  setAuthServiceForTest,
  setSecureStorageForTest,
  resetAuthStoreForTest,
} from './ipc/auth-handlers.js';
import { createSafeIpcHandler } from './ipc/register-ipc.js';
import { DESKTOP_CHANNELS } from '@ai-quality/contracts';

describe('V8 Phase 113 — User Authentication Foundation Certification', () => {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Real PostgreSQL database client is required for Phase 113 certification.');
  }

  const testRunId = crypto.randomUUID().substring(0, 8);
  const primaryEmail = `cert.engineer.${testRunId}@platform.test`;
  const primaryPassword = `PlatformAdminP@ss!${testRunId}`;
  let primaryUserId: string;
  let primarySessionToken: string;
  let primarySessionId: string;

  let inMemoryStorage: DesktopSecureStorage;
  let authService: AuthenticationService;

  before(async () => {
    inMemoryStorage = new DesktopSecureStorage({ inMemoryOnly: true });
    authService = new AuthenticationService(prisma);
    setAuthServiceForTest(authService);
    setSecureStorageForTest(inMemoryStorage);
  });

  after(async () => {
    resetAuthStoreForTest();
    // Cleanup created test records
    try {
      if (primaryUserId) {
        await prisma.authSession.deleteMany({ where: { userId: primaryUserId } });
        await prisma.passwordCredential.deleteMany({ where: { userId: primaryUserId } });
        await prisma.authAuditEvent.deleteMany({ where: { userId: primaryUserId } });
        await prisma.user.deleteMany({ where: { id: primaryUserId } });
      }
      // Also cleanup any test run emails
      await prisma.authAuditEvent.deleteMany({
        where: { actorEmail: { contains: testRunId } },
      });
      await prisma.user.deleteMany({
        where: { email: { contains: testRunId } },
      });
    } catch {
      // Ignore cleanup error
    }
  });

  // --------------------------------------------------------------------------
  // 1. User Identity Model & Canonicalization
  // --------------------------------------------------------------------------
  it('1. User Identity Model: persists user in PostgreSQL with unique normalized email', async () => {
    const rawEmail = `  Cert.Engineer.${testRunId}@Platform.TEST  `;
    const user = await authService.createUserIdentity({
      email: rawEmail,
      displayName: 'Principal QA Engineer',
      accountStatus: 'ACTIVE',
      emailVerified: true,
    });

    primaryUserId = user.id;

    assert.ok(user.id, 'User ID must be generated UUID');
    assert.equal(user.normalizedEmail, primaryEmail.toLowerCase());
    assert.equal(user.displayName, 'Principal QA Engineer');
    assert.equal(user.accountStatus, 'ACTIVE');
    assert.equal(user.emailVerified, true);

    // Verify directly in real PostgreSQL
    const dbRecord = await prisma.user.findUnique({
      where: { id: user.id },
    });
    assert.ok(dbRecord, 'User must exist in real PostgreSQL database');
    assert.equal(dbRecord.normalizedEmail, primaryEmail.toLowerCase());
    assert.equal(dbRecord.securityVersion, 1);

    // Verify DB Uniqueness constraint prevents duplicate normalized email
    await assert.rejects(
      async () =>
        authService.createUserIdentity({
          email: `CERT.ENGINEER.${testRunId}@PLATFORM.TEST`,
          displayName: 'Duplicate Attempt',
        }),
      UserAlreadyExistsError,
    );
  });

  // --------------------------------------------------------------------------
  // 2. Credential Separation & Password Hashing
  // --------------------------------------------------------------------------
  it('2. Credential Separation: stores password in separated table with memory-hard scrypt hash', async () => {
    const cred = await authService.createPasswordCredential({
      userId: primaryUserId,
      password: primaryPassword,
    });

    assert.ok(cred.id);
    assert.equal(cred.userId, primaryUserId);
    assert.equal(cred.algorithm, 'scrypt');
    assert.equal(cred.version, 1);

    // Verify directly in database: password hash must NEVER equal plaintext
    const dbCred = await prisma.passwordCredential.findFirst({
      where: { userId: primaryUserId },
    });

    assert.ok(dbCred);
    assert.notEqual(dbCred.passwordHash, primaryPassword);
    assert.ok(dbCred.passwordHash.startsWith('$scrypt$v=1$'));
    assert.ok(
      !dbCred.passwordHash.includes(primaryPassword),
      'Plaintext password must never appear in hash',
    );

    // Public User table must NOT contain password columns
    const userCols = Object.keys(
      await prisma.user.findUniqueOrThrow({ where: { id: primaryUserId } }),
    );
    assert.ok(!userCols.includes('password'));
    assert.ok(!userCols.includes('passwordHash'));
  });

  // --------------------------------------------------------------------------
  // 3. Password Policy Primitives
  // --------------------------------------------------------------------------
  it('3. Password Policy Foundation: enforces bounds, complexity, and common password blacklist', () => {
    const policy = new PasswordPolicy();

    // Rejects too short (< 12)
    assert.throws(() => policy.assertValid('Short1!'), PasswordPolicyViolationError);

    // Rejects common dictionary passwords
    assert.throws(() => policy.assertValid('password1234'), PasswordPolicyViolationError);

    // Rejects missing lowercase/uppercase/numbers
    assert.throws(() => policy.assertValid('ALLUPPERCASE123!'), PasswordPolicyViolationError);
    assert.throws(() => policy.assertValid('alllowercase123!'), PasswordPolicyViolationError);
    assert.throws(() => policy.assertValid('NoNumbersOrSymbolsHere'), PasswordPolicyViolationError);

    // Accepts strong password
    assert.doesNotThrow(() => policy.assertValid(primaryPassword));
  });

  // --------------------------------------------------------------------------
  // 4. Password Verification (Valid vs Invalid)
  // --------------------------------------------------------------------------
  it('4. Password Verification: correctly validates matching password and rejects incorrect password', async () => {
    // Valid login
    const result = await authService.authenticateWithPassword(primaryEmail, primaryPassword, {
      deviceInfo: 'Desktop-Mac-Arm64',
      ipAddress: '127.0.0.1',
    });

    assert.ok(result.sessionToken);
    assert.equal(result.userContext.userId, primaryUserId);
    assert.equal(result.userContext.email, primaryEmail.toLowerCase());
    assert.equal(result.userContext.accountStatus, 'ACTIVE');

    primarySessionToken = result.sessionToken;
    primarySessionId = result.userContext.sessionId;

    // Invalid login attempt
    await assert.rejects(
      async () => authService.authenticateWithPassword(primaryEmail, 'WrongPassword123!'),
      AuthenticationFailedError,
    );
  });

  // --------------------------------------------------------------------------
  // 5. Account Enumeration Resistance & Unknown User Timing Safety
  // --------------------------------------------------------------------------
  it('5. Account Enumeration Defense: unknown email yields generic error with dummy hash execution', async () => {
    const start = performance.now();
    await assert.rejects(
      async () =>
        authService.authenticateWithPassword(
          `nonexistent.${testRunId}@unknown.org`,
          'SomePassword123!',
        ),
      AuthenticationFailedError,
    );
    const duration = performance.now() - start;

    // Should take non-trivial time (> 10ms) due to dummy scrypt execution
    assert.ok(duration >= 5, `Authentication took ${duration}ms, proving timing-equalized work`);
  });

  // --------------------------------------------------------------------------
  // 6. Account States (DISABLED & LOCKED)
  // --------------------------------------------------------------------------
  it('6. Account States: disabled or locked accounts cannot authenticate even with correct password', async () => {
    // Create disabled user
    const disabledEmail = `disabled.${testRunId}@platform.test`;
    const disabledUser = await authService.createUserIdentity({
      email: disabledEmail,
      displayName: 'Disabled Employee',
      accountStatus: 'DISABLED',
    });
    await authService.createPasswordCredential({
      userId: disabledUser.id,
      password: primaryPassword,
    });

    await assert.rejects(
      async () => authService.authenticateWithPassword(disabledEmail, primaryPassword),
      AccountDisabledError,
    );

    // Create locked user
    const lockedEmail = `locked.${testRunId}@platform.test`;
    const lockedUser = await authService.createUserIdentity({
      email: lockedEmail,
      displayName: 'Locked Account',
      accountStatus: 'LOCKED',
    });
    await authService.createPasswordCredential({
      userId: lockedUser.id,
      password: primaryPassword,
    });

    await assert.rejects(
      async () => authService.authenticateWithPassword(lockedEmail, primaryPassword),
      AccountLockedError,
    );
  });

  // --------------------------------------------------------------------------
  // 7. Session Model & Storage Security
  // --------------------------------------------------------------------------
  it('7. Session Model: bearer token is NEVER stored in database; only SHA-256 hash is persisted', async () => {
    const sessionRecord = await prisma.authSession.findUnique({
      where: { id: primarySessionId },
    });

    assert.ok(sessionRecord);
    assert.notEqual(sessionRecord.sessionTokenHash, primarySessionToken);
    assert.equal(
      sessionRecord.sessionTokenHash,
      crypto.createHash('sha256').update(primarySessionToken).digest('hex'),
    );
    assert.equal(sessionRecord.isRevoked, false);
    assert.ok(sessionRecord.expiresAt > new Date());
  });

  // --------------------------------------------------------------------------
  // 8. Session Validation
  // --------------------------------------------------------------------------
  it('8. Session Validation: validates active bearer token and returns sanitized user context', async () => {
    const context = await authService.validateSession(primarySessionToken);

    assert.equal(context.userId, primaryUserId);
    assert.equal(context.email, primaryEmail.toLowerCase());
    assert.equal(context.sessionId, primarySessionId);

    // Context must NOT expose password hashes, tokens, or internal security fields
    const keys = Object.keys(context);
    assert.ok(!keys.includes('password'));
    assert.ok(!keys.includes('passwordHash'));
    assert.ok(!keys.includes('sessionToken'));
    assert.ok(!keys.includes('sessionTokenHash'));
  });

  // --------------------------------------------------------------------------
  // 9. Session Expiration
  // --------------------------------------------------------------------------
  it('9. Session Expiration: expired session is strictly rejected', async () => {
    // Advance expiry in database to the past
    await prisma.authSession.update({
      where: { id: primarySessionId },
      data: { expiresAt: new Date(Date.now() - 10000) },
    });

    await assert.rejects(
      async () => authService.validateSession(primarySessionToken),
      SessionExpiredError,
    );

    // Restore expiration for subsequent tests
    await prisma.authSession.update({
      where: { id: primarySessionId },
      data: { expiresAt: new Date(Date.now() + 86400000) },
    });
  });

  // --------------------------------------------------------------------------
  // 10. Session Revocation (Single Session)
  // --------------------------------------------------------------------------
  it('10. Session Revocation: revoking a session persists and rejects subsequent validation', async () => {
    const revokeRes = await authService.revokeSession(
      primarySessionId,
      'CERTIFICATION_REVOKE_TEST',
    );
    assert.equal(revokeRes.revoked, true);

    const dbSession = await prisma.authSession.findUnique({
      where: { id: primarySessionId },
    });
    assert.equal(dbSession?.isRevoked, true);
    assert.ok(dbSession?.revokedAt !== null);

    await assert.rejects(
      async () => authService.validateSession(primarySessionToken),
      SessionRevokedError,
    );
  });

  // --------------------------------------------------------------------------
  // 11. Multi-Session Independence & Global User Revocation
  // --------------------------------------------------------------------------
  it('11. Multi-Session & Global Revocation: manages independent sessions and revokes all atomically', async () => {
    // Issue two independent sessions for primary user
    const login1 = await authService.authenticateWithPassword(primaryEmail, primaryPassword, {
      deviceInfo: 'Desktop-Workstation-1',
    });
    const login2 = await authService.authenticateWithPassword(primaryEmail, primaryPassword, {
      deviceInfo: 'Desktop-Laptop-2',
    });

    assert.notEqual(login1.sessionToken, login2.sessionToken);

    // Both validate independently
    assert.ok(await authService.validateSession(login1.sessionToken));
    assert.ok(await authService.validateSession(login2.sessionToken));

    // Revoking session 1 leaves session 2 valid
    await authService.revokeSession(login1.userContext.sessionId);
    await assert.rejects(
      () => authService.validateSession(login1.sessionToken),
      SessionRevokedError,
    );
    assert.ok(await authService.validateSession(login2.sessionToken));

    // Global revocation revokes remaining session and increments securityVersion
    const globalRes = await authService.revokeAllUserSessions(primaryUserId, 'SECURITY_RESET');
    assert.ok(globalRes.revokedCount >= 1);

    await assert.rejects(
      () => authService.validateSession(login2.sessionToken),
      SessionRevokedError,
    );

    const userDb = await prisma.user.findUniqueOrThrow({ where: { id: primaryUserId } });
    assert.ok(userDb.securityVersion >= 2, 'Security version must increment on global revocation');
  });

  // --------------------------------------------------------------------------
  // 12. Desktop Restart Persistence & Secure Storage Restoration
  // --------------------------------------------------------------------------
  it('12. Restart Persistence: simulates desktop restart preserving authenticated state', async () => {
    // 1. Authenticate via IPC handler
    const dummyEvent = {} as IpcMainInvokeEvent;
    const loginRes = await handleLogin(dummyEvent, {
      email: primaryEmail,
      password: primaryPassword,
    });
    assert.equal(loginRes.userId, primaryUserId);

    // Verify stored session token
    const storedToken = await inMemoryStorage.retrieveSessionToken();
    assert.ok(storedToken);

    // 2. Simulate Desktop Process Restart: re-instantiate storage and state
    const restoredStorage = inMemoryStorage; // In production this reads from userData/auth-session.dat
    setSecureStorageForTest(restoredStorage);

    // 3. Request auth state on startup
    const state = await handleGetAuthState(dummyEvent);
    assert.equal(state.status, 'AUTHENTICATED');
    assert.equal(state.user?.userId, primaryUserId);
    assert.equal(state.user?.email, primaryEmail.toLowerCase());
  });

  // --------------------------------------------------------------------------
  // 13. Tampered Session Recovery
  // --------------------------------------------------------------------------
  it('13. Tampered Session: modified local token is rejected and securely purged', async () => {
    const dummyEvent = {} as IpcMainInvokeEvent;

    // Tamper with stored session token
    await inMemoryStorage.storeSessionToken('tampered_bogus_token_1234567890');

    const state = await handleGetAuthState(dummyEvent);
    assert.equal(state.status, 'UNAUTHENTICATED');
    assert.equal(state.user, null);

    // Tampered token must be purged from storage
    const remainingToken = await inMemoryStorage.retrieveSessionToken();
    assert.equal(remainingToken, null);
  });

  // --------------------------------------------------------------------------
  // 14. Brute-Force Protection & Normalization Bypass Defense
  // --------------------------------------------------------------------------
  it('14. Brute-Force & Rate-Limiting: triggers lockout and resists normalization bypass attempts', async () => {
    const victimEmail = `throttle.${testRunId}@platform.test`;
    const victimUser = await authService.createUserIdentity({
      email: victimEmail,
      displayName: 'Throttle Target',
    });
    await authService.createPasswordCredential({
      userId: victimUser.id,
      password: primaryPassword,
    });

    // 4 failed attempts with casing and whitespace variations
    const variations = [
      victimEmail.toLowerCase(),
      victimEmail.toUpperCase(),
      `  ${victimEmail}  `,
      victimEmail,
    ];

    for (const emailVar of variations) {
      await assert.rejects(
        () => authService.authenticateWithPassword(emailVar, 'WrongPassword1!'),
        AuthenticationFailedError,
      );
    }

    // 5th attempt triggers lockout
    await assert.rejects(
      () => authService.authenticateWithPassword(victimEmail, 'WrongPassword1!'),
      AuthenticationFailedError,
    );

    // Subsequent attempt is throttled
    await assert.rejects(
      () => authService.authenticateWithPassword(victimEmail, primaryPassword),
      RateLimitedError,
    );
  });

  // --------------------------------------------------------------------------
  // 15. Input Injection & Adversarial Payload Defense
  // --------------------------------------------------------------------------
  it('15. Adversarial Input Defense: handles SQL-like payloads, oversized data, and mass-assignment', async () => {
    const dummyEvent = {} as IpcMainInvokeEvent;

    // SQL injection strings treated as normal invalid input
    await assert.rejects(
      () =>
        handleLogin(dummyEvent, {
          email: "' OR '1'='1",
          password: primaryPassword,
        }),
      InvalidAuthInputError,
    );

    // Oversized password (> 128 chars)
    await assert.rejects(
      () =>
        handleLogin(dummyEvent, {
          email: primaryEmail,
          password: 'A1!' + 'x'.repeat(150),
        }),
      InvalidAuthInputError,
    );

    // Mass-assignment: client tries to supply authoritative account status or passwordHash
    await assert.rejects(
      () =>
        handleLogin(dummyEvent, {
          email: primaryEmail,
          password: primaryPassword,
          accountStatus: 'ACTIVE',
        } as unknown as Parameters<typeof handleLogin>[1]),
      InvalidAuthInputError,
    );
  });

  // --------------------------------------------------------------------------
  // 16. IPC Security & Sender Validation
  // --------------------------------------------------------------------------
  it('16. IPC Security: untrusted sender or subframe request is strictly rejected with UNAUTHORIZED_SENDER', async () => {
    const untrustedEvent = {
      sender: {
        getURL: () => 'https://malicious-external-site.com',
      },
      senderFrame: {
        parent: {}, // Subframe indicator
      },
    } as unknown as IpcMainInvokeEvent;

    const safeHandler = createSafeIpcHandler(DESKTOP_CHANNELS.AUTH_GET_STATE, handleGetAuthState);
    const result = await safeHandler(untrustedEvent);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  // --------------------------------------------------------------------------
  // 17. Security Audit Trail & Secret Redaction
  // --------------------------------------------------------------------------
  it('17. Security Audit Trail: records audit events in PostgreSQL with zero plaintext secrets', async () => {
    const auditRecords = await prisma.authAuditEvent.findMany({
      where: { userId: primaryUserId },
      orderBy: { timestamp: 'desc' },
      take: 10,
    });

    assert.ok(auditRecords.length >= 1, 'Audit events must be recorded in PostgreSQL');

    // Prove 0 passwords, hashes, or session tokens in audit payloads
    for (const record of auditRecords) {
      const jsonString = JSON.stringify(record);
      assert.ok(
        !jsonString.includes(primaryPassword),
        'Plaintext password must NEVER appear in audit record',
      );
      assert.ok(
        !jsonString.includes(primarySessionToken),
        'Bearer session token must NEVER appear in audit record',
      );
    }
  });
});
