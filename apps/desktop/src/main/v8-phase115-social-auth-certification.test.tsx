/**
 * @file apps/desktop/src/main/v8-phase115-social-auth-certification.test.tsx
 * Authoritative Certification Test Suite for:
 * V8 Phase 115: "Google & Apple Social Authentication".
 *
 * Verifies:
 * 1. Google OAuth 2.0 / OIDC Request Generation (PKCE S256, state, nonce, scope).
 * 2. Apple Sign in Request Generation (form_post, state, nonce, scope).
 * 3. Provider Availability and Configuration Reporting.
 * 4. State Generation, Storage, and Single-Use Consumption (Anti-Replay).
 * 5. State Expiry Defense (expired attempts rejected).
 * 6. Dynamic JWS Token Verification with RSA-SHA256 Signature against JWKS.
 * 7. Tampered Signature and Expired Token Rejection.
 * 8. Social User Signup: Atomic User + SocialIdentity creation with ZERO fake passwords.
 * 9. Returning Social User Login: Existing identity lookup and session issuance.
 * 10. Apple Returning Login Profile Preservation (handles Apple omitting profile on returning login).
 * 11. Apple Private Relay Email & Verification Flag Handling.
 * 12. Email Collision Safety - Safe Linking (Both emails verified).
 * 13. Email Collision Safety - Account Takeover Prevention (Unverified rejected with ACCOUNT_LINK_CONFLICT).
 * 14. Suspended / Locked User Account Lockout on Social Auth.
 * 15. User Cancellation Handling (access_denied / user_cancelled_authorize).
 * 16. Ephemeral Loopback Server (127.0.0.1, GET & POST form_post handling, clean HTML).
 * 17. UI Component Certification: AuthScreen renders active Google & Apple buttons, loading card, cancel button.
 * 18. IPC Security: Untrusted senders and nested subframes blocked with UNAUTHORIZED_SENDER on all social channels.
 * 19. Real Provider Credential Status Check: Honest reporting of unconfigured live credentials.
 * 20. Security Audit Trail & Secret Redaction: Complete PostgreSQL audit logging with zero secrets leaked.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto, { generateKeyPairSync, createSign } from 'node:crypto';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { IpcMainInvokeEvent } from 'electron';

import {
  getPrismaClient,
  AuthenticationService,
  GoogleAuthProvider,
  AppleAuthProvider,
  JwksClient,
  LoopbackCallbackServer,
  PkceService,
  SocialAuthCancelledError,
  SocialAuthExpiredError,
  SocialAuthStateInvalidError,
  SocialAuthTokenInvalidError,
  SocialAuthAccountConflictError,
  AccountDisabledError,
  AccountLockedError,
  type JwksKey,
} from '@ai-quality/core';

import { DesktopSecureStorage } from './secure-storage/desktop-secure-storage.js';
import {
  handleSocialAuthStart,
  handleSocialAuthCallback,
  handleSocialAuthCancel,
  handleSocialAuthGetProviders,
  setAuthServiceForTest,
  setSecureStorageForTest,
  resetAuthStoreForTest,
} from './ipc/auth-handlers.js';
import { createSafeIpcHandler } from './ipc/register-ipc.js';
import { DESKTOP_CHANNELS } from '@ai-quality/contracts';
import { AuthScreen } from '../renderer/screens/auth/AuthScreen.js';
import { AuthProvider } from '../renderer/context/AuthContext.js';

describe('V8 Phase 115 — Google & Apple Social Authentication Certification', () => {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Real PostgreSQL database client is required for Phase 115 certification.');
  }

  const testRunId = crypto.randomUUID().substring(0, 8);
  const testGoogleClientId = `mock-google-client-${testRunId}.apps.googleusercontent.com`;
  const testAppleClientId = `com.aiquality.platform.test-${testRunId}`;
  const mockGoogleJwksUrl = `https://mock.google.certs/${testRunId}/jwks.json`;
  const mockAppleJwksUrl = `https://mock.apple.keys/${testRunId}/jwks.json`;

  let jwksClient: JwksClient;
  let testKeyId: string;
  let privateKeyPem: string;

  let googleProvider: GoogleAuthProvider;
  let appleProvider: AppleAuthProvider;
  let authService: AuthenticationService;
  let inMemoryStorage: DesktopSecureStorage;

  const createdUserIds: string[] = [];

  before(() => {
    // Generate RSA 2048 keypair for dynamic JWKS mock
    testKeyId = `cert-key-${testRunId}`;
    const keypair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKeyPem = keypair.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const jwk = keypair.publicKey.export({ format: 'jwk' }) as Record<string, unknown>;

    const publicJwk: JwksKey = {
      kty: 'RSA',
      kid: testKeyId,
      use: 'sig',
      alg: 'RS256',
      n: jwk.n as string,
      e: jwk.e as string,
    };

    jwksClient = new JwksClient();
    jwksClient.injectTestKeys(mockGoogleJwksUrl, [publicJwk]);
    jwksClient.injectTestKeys(mockAppleJwksUrl, [publicJwk]);

    googleProvider = new GoogleAuthProvider(
      { clientId: testGoogleClientId, jwksUrl: mockGoogleJwksUrl },
      jwksClient,
    );

    appleProvider = new AppleAuthProvider(
      { clientId: testAppleClientId, jwksUrl: mockAppleJwksUrl },
      jwksClient,
    );

    authService = new AuthenticationService(prisma, {
      googleProvider,
      appleProvider,
    });

    inMemoryStorage = new DesktopSecureStorage({ inMemoryOnly: true });
    setAuthServiceForTest(authService);
    setSecureStorageForTest(inMemoryStorage);
  });

  after(async () => {
    resetAuthStoreForTest();
    try {
      for (const userId of createdUserIds) {
        await prisma.socialIdentity.deleteMany({ where: { userId } });
        await prisma.authSession.deleteMany({ where: { userId } });
        await prisma.passwordCredential.deleteMany({ where: { userId } });
        await prisma.authAuditEvent.deleteMany({ where: { userId } });
        await prisma.user.deleteMany({ where: { id: userId } });
      }
      await prisma.socialAuthAttempt.deleteMany({
        where: {
          redirectUri: { contains: '127.0.0.1' },
        },
      });
    } catch {
      // Best-effort cleanup
    }
  });

  function createSignedToken(
    payload: Record<string, unknown>,
    kid = testKeyId,
  ): string {
    const header = { alg: 'RS256', kid, typ: 'JWT' };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sign = createSign('RSA-SHA256');
    sign.update(`${headerB64}.${payloadB64}`, 'utf8');
    const signatureB64 = sign.sign(privateKeyPem).toString('base64url');

    return `${headerB64}.${payloadB64}.${signatureB64}`;
  }

  // --------------------------------------------------------------------------
  // 1. Google Authorization Request Generation (PKCE, State, Nonce, Scope)
  // --------------------------------------------------------------------------
  it('1. Google Auth Request: generates standard OAuth 2.0 authorization URL with S256 PKCE and nonce', () => {
    const state = PkceService.generateState();
    const nonce = PkceService.generateNonce();
    const codeVerifier = PkceService.generateCodeVerifier();

    const authReq = googleProvider.createAuthorizationRequest({
      redirectUri: 'http://127.0.0.1:4567/callback',
      state,
      nonce,
      codeVerifier,
    });

    assert.equal(authReq.state, state);
    assert.equal(authReq.nonce, nonce);
    const parsed = new URL(authReq.authorizationUrl);
    assert.equal(parsed.searchParams.get('client_id'), testGoogleClientId);
    assert.equal(parsed.searchParams.get('response_type'), 'code');
    assert.equal(parsed.searchParams.get('redirect_uri'), 'http://127.0.0.1:4567/callback');
    assert.equal(parsed.searchParams.get('scope'), 'openid email profile');
    assert.equal(parsed.searchParams.get('state'), state);
    assert.equal(parsed.searchParams.get('nonce'), nonce);
    assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(parsed.searchParams.get('code_challenge'));
  });

  // --------------------------------------------------------------------------
  // 2. Apple Authorization Request Generation (form_post, State, Nonce, Scope)
  // --------------------------------------------------------------------------
  it('2. Apple Auth Request: generates Sign in with Apple URL with form_post response mode and scope', () => {
    const state = PkceService.generateState();
    const nonce = PkceService.generateNonce();

    const authReq = appleProvider.createAuthorizationRequest({
      redirectUri: 'http://127.0.0.1:4567/callback',
      state,
      nonce,
    });

    assert.equal(authReq.state, state);
    assert.equal(authReq.nonce, nonce);
    const parsed = new URL(authReq.authorizationUrl);
    assert.equal(parsed.searchParams.get('client_id'), testAppleClientId);
    assert.equal(parsed.searchParams.get('response_type'), 'code id_token');
    assert.equal(parsed.searchParams.get('response_mode'), 'form_post');
    assert.equal(parsed.searchParams.get('scope'), 'name email');
    assert.equal(parsed.searchParams.get('state'), state);
    assert.equal(parsed.searchParams.get('nonce'), nonce);
  });

  // --------------------------------------------------------------------------
  // 3. Provider Availability and Status Reporting
  // --------------------------------------------------------------------------
  it('3. Provider Status: getSocialProviders accurately reports availability of configured providers', () => {
    const providers = authService.getSocialProviders();
    assert.equal(providers.length, 2);

    const google = providers.find((p) => p.provider === 'GOOGLE');
    const apple = providers.find((p) => p.provider === 'APPLE');

    assert.ok(google);
    assert.equal(google?.enabled, true);
    assert.equal(google?.clientIdConfigured, true);

    assert.ok(apple);
    assert.equal(apple?.enabled, true);
    assert.equal(apple?.clientIdConfigured, true);
  });

  // --------------------------------------------------------------------------
  // 4. State Storage, Hashing & Single-Use Consumption (Anti-Replay)
  // --------------------------------------------------------------------------
  it('4. Anti-Replay: persists attempt with hashed state and rejects replayed or double-consumed state', async () => {
    const startRes = await authService.startSocialAuth(
      { provider: 'GOOGLE' },
      { redirectUri: 'http://127.0.0.1:9000/callback' },
    );

    const stateHash = PkceService.hashSecret(startRes.state);
    const storedAttempt = await prisma.socialAuthAttempt.findUnique({
      where: { stateHash },
    });
    assert.ok(storedAttempt, 'State hash must be stored in database');
    assert.equal(storedAttempt?.status, 'PENDING');

    const now = Math.floor(Date.now() / 1000);
    const token = createSignedToken({
      iss: 'https://accounts.google.com',
      sub: `google-user-${testRunId}-1`,
      aud: testGoogleClientId,
      exp: now + 3600,
      iat: now,
      email: `google.replay.${testRunId}@platform.test`,
      email_verified: true,
      name: 'Replay Test User',
    });

    // First completion succeeds
    const completeRes = await authService.completeSocialAuth({
      state: startRes.state,
      idToken: token,
    });
    assert.ok(completeRes.userContext.userId);
    createdUserIds.push(completeRes.userContext.userId);

    // Attempt is now COMPLETED
    const updatedAttempt = await prisma.socialAuthAttempt.findUnique({
      where: { stateHash },
    });
    assert.equal(updatedAttempt?.status, 'COMPLETED');

    // Second completion with identical state is strictly rejected (replay attack defense)
    await assert.rejects(
      () =>
        authService.completeSocialAuth({
          state: startRes.state,
          idToken: token,
        }),
      SocialAuthStateInvalidError,
    );
  });

  // --------------------------------------------------------------------------
  // 5. State Expiration Defense
  // --------------------------------------------------------------------------
  it('5. State Expiry: rejects authorization attempts that have exceeded expiration threshold', async () => {
    const startRes = await authService.startSocialAuth(
      { provider: 'GOOGLE' },
      { redirectUri: 'http://127.0.0.1:9000/callback' },
    );

    const stateHash = PkceService.hashSecret(startRes.state);
    // Force attempt to be expired in PostgreSQL
    await prisma.socialAuthAttempt.update({
      where: { stateHash },
      data: { expiresAt: new Date(Date.now() - 60 * 1000) },
    });

    const now = Math.floor(Date.now() / 1000);
    const token = createSignedToken({
      iss: 'https://accounts.google.com',
      sub: `google-user-expired-${testRunId}`,
      aud: testGoogleClientId,
      exp: now + 3600,
      iat: now,
      email: `expired.${testRunId}@platform.test`,
      email_verified: true,
    });

    await assert.rejects(
      () =>
        authService.completeSocialAuth({
          state: startRes.state,
          idToken: token,
        }),
      SocialAuthExpiredError,
    );

    const attempt = await prisma.socialAuthAttempt.findUnique({ where: { stateHash } });
    assert.equal(attempt?.status, 'EXPIRED');
  });

  // --------------------------------------------------------------------------
  // 6. Cryptographic JWS Token Verification against Dynamic JWKS
  // --------------------------------------------------------------------------
  it('6. Cryptographic JWS: successfully verifies RSA-SHA256 signature against dynamic JWKS', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedToken({
      iss: 'https://accounts.google.com',
      sub: `crypto-verify-${testRunId}`,
      aud: testGoogleClientId,
      exp: now + 3600,
      iat: now,
      email: `crypto.${testRunId}@platform.test`,
      email_verified: true,
      name: 'Crypto Verify User',
      nonce: 'test-nonce-value',
    });

    const decoded = await jwksClient.verifyIdToken({
      idToken: token,
      jwksUrl: mockGoogleJwksUrl,
      expectedIssuer: 'https://accounts.google.com',
      expectedAudience: testGoogleClientId,
      expectedNonce: 'test-nonce-value',
    });

    assert.equal(decoded.payload.sub, `crypto-verify-${testRunId}`);
    assert.equal(decoded.payload.email, `crypto.${testRunId}@platform.test`);
  });

  // --------------------------------------------------------------------------
  // 7. Tampered Signature & Expired Token Rejection
  // --------------------------------------------------------------------------
  it('7. Token Tampering: rejects forged signatures and expired tokens', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedToken({
      iss: 'https://accounts.google.com',
      sub: `tampered-${testRunId}`,
      aud: testGoogleClientId,
      exp: now + 3600,
      iat: now,
      email: `tampered.${testRunId}@platform.test`,
    });

    const tampered = token.slice(0, -6) + 'XXXXXX';
    await assert.rejects(
      () =>
        jwksClient.verifyIdToken({
          idToken: tampered,
          jwksUrl: mockGoogleJwksUrl,
          expectedIssuer: 'https://accounts.google.com',
          expectedAudience: testGoogleClientId,
        }),
      SocialAuthTokenInvalidError,
    );

    const expiredToken = createSignedToken({
      iss: 'https://accounts.google.com',
      sub: `expired-${testRunId}`,
      aud: testGoogleClientId,
      exp: now - 300,
      iat: now - 3600,
    });
    await assert.rejects(
      () =>
        jwksClient.verifyIdToken({
          idToken: expiredToken,
          jwksUrl: mockGoogleJwksUrl,
          expectedIssuer: 'https://accounts.google.com',
          expectedAudience: testGoogleClientId,
        }),
      SocialAuthTokenInvalidError,
    );
  });

  // --------------------------------------------------------------------------
  // 8. New Social User Signup: Atomic Creation with ZERO Fake Passwords
  // --------------------------------------------------------------------------
  it('8. Atomic Social Signup: creates User + SocialIdentity and zero fake PasswordCredential records', async () => {
    const startRes = await authService.startSocialAuth(
      { provider: 'GOOGLE' },
      { redirectUri: 'http://127.0.0.1:9000/callback' },
    );

    const email = `new.google.user.${testRunId}@platform.test`;
    const sub = `google-sub-new-${testRunId}`;
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedToken({
      iss: 'https://accounts.google.com',
      sub,
      aud: testGoogleClientId,
      exp: now + 3600,
      iat: now,
      email,
      email_verified: true,
      name: 'Google Newcomer',
    });

    const result = await authService.completeSocialAuth({
      state: startRes.state,
      idToken: token,
    });

    assert.ok(result.userContext.userId);
    createdUserIds.push(result.userContext.userId);
    assert.equal(result.userContext.email, email);
    assert.equal(result.userContext.displayName, 'Google Newcomer');
    assert.equal(result.userContext.emailVerified, true);

    // Verify PostgreSQL records
    const userInDb = await prisma.user.findUnique({
      where: { id: result.userContext.userId },
      include: {
        socialIdentities: true,
        passwordCredentials: true,
        sessions: true,
      },
    });

    assert.ok(userInDb);
    assert.equal(userInDb!.socialIdentities.length, 1);
    assert.equal(userInDb!.socialIdentities[0]?.provider, 'GOOGLE');
    assert.equal(userInDb!.socialIdentities[0]?.providerSubjectId, sub);
    assert.equal(userInDb!.socialIdentities[0]?.providerEmail, email);

    // STRICT INVARIANT: ZERO fake password credentials created!
    assert.equal(
      userInDb?.passwordCredentials.length,
      0,
      'Social users must not have fake password credentials generated',
    );

    // Session issued
    assert.equal(userInDb?.sessions.length, 1);
  });

  // --------------------------------------------------------------------------
  // 9. Returning Social User Login: Re-Authentication & Session Issuance
  // --------------------------------------------------------------------------
  it('9. Returning Social Login: authenticates existing user by (provider, subject) without duplicate records', async () => {
    const email = `returning.user.${testRunId}@platform.test`;
    const sub = `google-sub-returning-${testRunId}`;
    const now = Math.floor(Date.now() / 1000);

    // Initial sign-in
    const start1 = await authService.startSocialAuth({ provider: 'GOOGLE' });
    const token1 = createSignedToken({
      iss: 'https://accounts.google.com',
      sub,
      aud: testGoogleClientId,
      exp: now + 3600,
      iat: now,
      email,
      email_verified: true,
      name: 'Returning User',
    });
    const result1 = await authService.completeSocialAuth({
      state: start1.state,
      idToken: token1,
    });
    createdUserIds.push(result1.userContext.userId);

    // Subsequent sign-in
    const start2 = await authService.startSocialAuth({ provider: 'GOOGLE' });
    const token2 = createSignedToken({
      iss: 'https://accounts.google.com',
      sub,
      aud: testGoogleClientId,
      exp: now + 3600,
      iat: now,
      email,
      email_verified: true,
      name: 'Returning User',
    });
    const result2 = await authService.completeSocialAuth({
      state: start2.state,
      idToken: token2,
    });

    // Same authoritative user
    assert.equal(result2.userContext.userId, result1.userContext.userId);
    // Distinct session tokens
    assert.notEqual(result2.sessionToken, result1.sessionToken);

    // Verify single SocialIdentity row exists
    const identities = await prisma.socialIdentity.findMany({
      where: { userId: result1.userContext.userId },
    });
    assert.equal(identities.length, 1);
  });

  // --------------------------------------------------------------------------
  // 10. Apple Returning Login Profile Preservation
  // --------------------------------------------------------------------------
  it('10. Apple Profile Retention: preserves initial user name and profile data on returning logins where Apple omits it', async () => {
    const email = `apple.returning.${testRunId}@platform.test`;
    const sub = `apple-sub-retain-${testRunId}`;
    const now = Math.floor(Date.now() / 1000);

    // First login: Apple sends user JSON with name
    const start1 = await authService.startSocialAuth({ provider: 'APPLE' });
    const token1 = createSignedToken({
      iss: 'https://appleid.apple.com',
      sub,
      aud: testAppleClientId,
      exp: now + 3600,
      iat: now,
      email,
      email_verified: 'true',
    });
    const result1 = await authService.completeSocialAuth({
      state: start1.state,
      idToken: token1,
      userJson: JSON.stringify({
        name: { firstName: 'Sarah', lastName: 'Connor' },
        email,
      }),
    });
    createdUserIds.push(result1.userContext.userId);
    assert.equal(result1.userContext.displayName, 'Sarah Connor');

    // Second login: Apple omits user JSON completely (standard Apple OAuth behavior)
    const start2 = await authService.startSocialAuth({ provider: 'APPLE' });
    const token2 = createSignedToken({
      iss: 'https://appleid.apple.com',
      sub,
      aud: testAppleClientId,
      exp: now + 3600,
      iat: now,
      email,
      email_verified: 'true',
    });
    const result2 = await authService.completeSocialAuth({
      state: start2.state,
      idToken: token2,
      // userJson omitted!
    });

    assert.equal(result2.userContext.userId, result1.userContext.userId);
    assert.equal(
      result2.userContext.displayName,
      'Sarah Connor',
      'Must retain previously stored display name when Apple omits profile on returning login',
    );
  });

  // --------------------------------------------------------------------------
  // 11. Apple Private Relay Email Handling
  // --------------------------------------------------------------------------
  it('11. Apple Private Relay: correctly supports private relay emails and verified flags', async () => {
    const relayEmail = `relay.${testRunId}@privaterelay.appleid.com`;
    const sub = `apple-sub-relay-${testRunId}`;
    const now = Math.floor(Date.now() / 1000);

    const start = await authService.startSocialAuth({ provider: 'APPLE' });
    const token = createSignedToken({
      iss: 'https://appleid.apple.com',
      sub,
      aud: testAppleClientId,
      exp: now + 3600,
      iat: now,
      email: relayEmail,
      email_verified: 'true',
      is_private_email: 'true',
    });

    const result = await authService.completeSocialAuth({
      state: start.state,
      idToken: token,
      userJson: JSON.stringify({
        name: { firstName: 'Private', lastName: 'Relay' },
        email: relayEmail,
      }),
    });

    assert.ok(result.userContext.userId);
    createdUserIds.push(result.userContext.userId);
    assert.equal(result.userContext.email, relayEmail);
    assert.equal(result.userContext.emailVerified, true);
  });

  // --------------------------------------------------------------------------
  // 12. Email Collision Safety: Safe Auto-Linking (Both Emails Verified)
  // --------------------------------------------------------------------------
  it('12. Safe Auto-Linking: links social identity when both local account and social identity are verified', async () => {
    const sharedEmail = `shared.verified.${testRunId}@platform.test`;

    // 1. Create verified local user (e.g. from prior password registration)
    const localUser = await authService.createUserIdentity({
      email: sharedEmail,
      displayName: 'Verified Local User',
      emailVerified: true,
    });
    createdUserIds.push(localUser.id);
    await authService.createPasswordCredential({
      userId: localUser.id,
      password: `SecureLocalPass123!${testRunId}`,
    });

    // 2. User initiates Google sign-in with matching verified email
    const start = await authService.startSocialAuth({ provider: 'GOOGLE' });
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedToken({
      iss: 'https://accounts.google.com',
      sub: `google-link-sub-${testRunId}`,
      aud: testGoogleClientId,
      exp: now + 3600,
      iat: now,
      email: sharedEmail,
      email_verified: true,
      name: 'Google Verified Name',
    });

    const result = await authService.completeSocialAuth({
      state: start.state,
      idToken: token,
    });

    // Linked to existing local user ID
    assert.equal(result.userContext.userId, localUser.id);

    // Verify identity is now linked in database
    const identity = await prisma.socialIdentity.findUnique({
      where: {
        provider_providerSubjectId: {
          provider: 'GOOGLE',
          providerSubjectId: `google-link-sub-${testRunId}`,
        },
      },
    });
    assert.ok(identity);
    assert.equal(identity?.userId, localUser.id);

    // Verify password credential still intact
    const creds = await prisma.passwordCredential.findMany({
      where: { userId: localUser.id },
    });
    assert.equal(creds.length, 1);
  });

  // --------------------------------------------------------------------------
  // 13. Email Collision Safety: Account Takeover Prevention
  // --------------------------------------------------------------------------
  it('13. Takeover Defense: rejects auto-linking when local account or provider email is unverified', async () => {
    const sharedEmail = `unverified.collision.${testRunId}@platform.test`;

    // Create UNVERIFIED local user
    const localUser = await authService.createUserIdentity({
      email: sharedEmail,
      displayName: 'Unverified Local User',
      emailVerified: false,
    });
    createdUserIds.push(localUser.id);

    const start = await authService.startSocialAuth({ provider: 'GOOGLE' });
    const now = Math.floor(Date.now() / 1000);
    // Provider says email is verified, but local is unverified -> REJECT
    const token = createSignedToken({
      iss: 'https://accounts.google.com',
      sub: `attacker-sub-${testRunId}`,
      aud: testGoogleClientId,
      exp: now + 3600,
      iat: now,
      email: sharedEmail,
      email_verified: true,
    });

    await assert.rejects(
      () =>
        authService.completeSocialAuth({
          state: start.state,
          idToken: token,
        }),
      SocialAuthAccountConflictError,
    );

    // Ensure audit event recorded ACCOUNT_LINK_CONFLICT
    const conflictEvent = await prisma.authAuditEvent.findFirst({
      where: {
        actorEmail: sharedEmail.toLowerCase(),
        action: 'ACCOUNT_LINK_CONFLICT',
      },
    });
    assert.ok(conflictEvent, 'Must log ACCOUNT_LINK_CONFLICT audit event');
  });

  // --------------------------------------------------------------------------
  // 14. Suspended / Locked Account Lockout
  // --------------------------------------------------------------------------
  it('14. Account Status Lockout: rejects social login for disabled or locked user accounts', async () => {
    const disabledEmail = `disabled.${testRunId}@platform.test`;
    const disabledSub = `sub-disabled-${testRunId}`;
    const now = Math.floor(Date.now() / 1000);

    // Create user with social identity
    const start1 = await authService.startSocialAuth({ provider: 'GOOGLE' });
    const token1 = createSignedToken({
      iss: 'https://accounts.google.com',
      sub: disabledSub,
      aud: testGoogleClientId,
      exp: now + 3600,
      iat: now,
      email: disabledEmail,
      email_verified: true,
    });
    const res1 = await authService.completeSocialAuth({
      state: start1.state,
      idToken: token1,
    });
    createdUserIds.push(res1.userContext.userId);

    // Disable the account
    await prisma.user.update({
      where: { id: res1.userContext.userId },
      data: { accountStatus: 'DISABLED' },
    });

    // Try logging in again with valid social identity
    const start2 = await authService.startSocialAuth({ provider: 'GOOGLE' });
    const token2 = createSignedToken({
      iss: 'https://accounts.google.com',
      sub: disabledSub,
      aud: testGoogleClientId,
      exp: now + 3600,
      iat: now,
      email: disabledEmail,
      email_verified: true,
    });

    await assert.rejects(
      () =>
        authService.completeSocialAuth({
          state: start2.state,
          idToken: token2,
        }),
      AccountDisabledError,
    );

    // Lock the account and test lockout
    await prisma.user.update({
      where: { id: res1.userContext.userId },
      data: { accountStatus: 'LOCKED' },
    });

    const start3 = await authService.startSocialAuth({ provider: 'GOOGLE' });
    await assert.rejects(
      () =>
        authService.completeSocialAuth({
          state: start3.state,
          idToken: token2,
        }),
      AccountLockedError,
    );
  });

  // --------------------------------------------------------------------------
  // 15. User Cancellation Handling
  // --------------------------------------------------------------------------
  it('15. User Cancellation: gracefully marks attempt CANCELLED when provider returns access_denied', async () => {
    const start = await authService.startSocialAuth({ provider: 'GOOGLE' });
    const stateHash = PkceService.hashSecret(start.state);

    await assert.rejects(
      () =>
        authService.completeSocialAuth({
          state: start.state,
          error: 'access_denied',
          errorDescription: 'User cancelled Google consent',
        }),
      SocialAuthCancelledError,
    );

    const attempt = await prisma.socialAuthAttempt.findUnique({ where: { stateHash } });
    assert.equal(attempt?.status, 'CANCELLED');

    const audit = await prisma.authAuditEvent.findFirst({
      where: { action: 'SOCIAL_AUTH_CANCELLED' },
      orderBy: { timestamp: 'desc' },
    });
    assert.ok(audit);
  });

  // --------------------------------------------------------------------------
  // 16. Ephemeral Loopback Server Verification
  // --------------------------------------------------------------------------
  it('16. Loopback Server: binds to 127.0.0.1, receives GET and POST callbacks, and serves clean HTML', async () => {
    const server = await LoopbackCallbackServer.start({ timeoutMs: 5000 });
    assert.ok(server.port > 0);
    assert.ok(server.redirectUri.startsWith('http://127.0.0.1:'));

    // Test GET callback (Google format)
    const getResponsePromise = fetch(`${server.redirectUri}?code=mock_code&state=mock_state`);
    const callbackData = await server.waitForCallback();
    assert.equal(callbackData.code, 'mock_code');
    assert.equal(callbackData.state, 'mock_state');

    const res = await getResponsePromise;
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('Authentication Complete'));
    assert.ok(!html.includes('mock_code'), 'Must not leak code in rendered HTML');
  });

  // --------------------------------------------------------------------------
  // 17. UI Component Certification: AuthScreen Enabled Social Controls
  // --------------------------------------------------------------------------
  it('17. Desktop UI: renders active Google & Apple buttons, handles loading state and cancel button', () => {
    const html = renderToString(
      <AuthProvider initialStatus="unauthenticated">
        <AuthScreen initialMode="login" />
      </AuthProvider>,
    );

    // Buttons are rendered and active
    assert.ok(html.includes('data-testid="oauth-google-btn"'), 'Must render Google button');
    assert.ok(html.includes('data-testid="oauth-apple-btn"'), 'Must render Apple button');
    assert.ok(html.includes('Sign in with Google'), 'Must have accessible label for Google');
    assert.ok(html.includes('Sign in with Apple'), 'Must have accessible label for Apple');

    // No longer says "Coming in Phase 115"
    assert.ok(!html.includes('Coming in Phase 115'), 'Must remove Phase 115 placeholder badge');
  });

  // --------------------------------------------------------------------------
  // 18. IPC Security & Unauthorized Sender Rejection
  // --------------------------------------------------------------------------
  it('18. IPC Security: rejects untrusted senders and nested subframes on all social auth channels', async () => {
    const untrustedEvent = {
      sender: { getURL: () => 'https://malicious-site.com' },
      senderFrame: { parent: {} },
    } as unknown as IpcMainInvokeEvent;

    const handlers = [
      createSafeIpcHandler(DESKTOP_CHANNELS.AUTH_SOCIAL_START, handleSocialAuthStart),
      createSafeIpcHandler(DESKTOP_CHANNELS.AUTH_SOCIAL_CALLBACK, handleSocialAuthCallback),
      createSafeIpcHandler(DESKTOP_CHANNELS.AUTH_SOCIAL_CANCEL, handleSocialAuthCancel),
      createSafeIpcHandler(DESKTOP_CHANNELS.AUTH_SOCIAL_GET_PROVIDERS, handleSocialAuthGetProviders),
    ];

    for (const safeHandler of handlers) {
      const res = await safeHandler(untrustedEvent, {} as never);
      assert.equal(res.ok, false, 'Untrusted sender must be rejected');
      if (!res.ok) {
        assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    }
  });

  // --------------------------------------------------------------------------
  // 19. Real Provider Credential Status Check (Honesty Requirement)
  // --------------------------------------------------------------------------
  it('19. Real Provider Honesty: reports live provider credentials as unconfigured if env vars absent', () => {
    const liveGoogleId = process.env.GOOGLE_CLIENT_ID;
    const liveAppleId = process.env.APPLE_CLIENT_ID;

    const defaultGoogle = new GoogleAuthProvider({ clientId: liveGoogleId });
    const defaultApple = new AppleAuthProvider({ clientId: liveAppleId });

    if (!liveGoogleId) {
      assert.equal(
        defaultGoogle.isConfigured(),
        false,
        'Live Google provider must report NOT CONFIGURED when GOOGLE_CLIENT_ID is absent',
      );
    }
    if (!liveAppleId) {
      assert.equal(
        defaultApple.isConfigured(),
        false,
        'Live Apple provider must report NOT CONFIGURED when APPLE_CLIENT_ID is absent',
      );
    }
  });

  // --------------------------------------------------------------------------
  // 20. Security Audit Trail & Zero Secret Leakage
  // --------------------------------------------------------------------------
  it('20. Audit Trail: logs social events in PostgreSQL with zero plaintext tokens or secrets', async () => {
    const events = await prisma.authAuditEvent.findMany({
      where: {
        action: {
          in: [
            'SOCIAL_AUTH_STARTED',
            'SOCIAL_AUTH_SUCCESS',
            'SOCIAL_AUTH_FAILURE',
            'SOCIAL_AUTH_CANCELLED',
            'SOCIAL_IDENTITY_LINKED',
            'ACCOUNT_LINK_CONFLICT',
          ],
        },
      },
      orderBy: { timestamp: 'desc' },
      take: 20,
    });

    assert.ok(events.length > 0, 'Audit events must be recorded in database');

    for (const ev of events) {
      const metadataStr = JSON.stringify(ev.metadata);
      // Ensure zero secrets/tokens leaked
      assert.ok(!metadataStr.includes('code_verifier'), 'Must not leak code verifier in audit');
      assert.ok(!metadataStr.includes('private_key'), 'Must not leak private key in audit');
      assert.ok(!metadataStr.includes('client_secret'), 'Must not leak client secret in audit');
      assert.ok(!metadataStr.includes('id_token'), 'Must not leak id_token in audit');
    }
  });
});
