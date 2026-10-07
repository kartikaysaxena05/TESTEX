import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'crypto';
import { AppleAuthProvider } from './apple-auth-provider.js';
import { JwksClient } from './jwks-client.js';
import {
  SocialAuthCancelledError,
  SocialAuthProviderUnavailableError,
} from '../auth-errors.js';
import type { JwksKey } from './social-types.js';

describe('AppleAuthProvider', () => {
  const clientId = 'com.aiquality.platform.service';
  const jwksUrl = 'https://appleid.apple.com/auth/keys';
  let jwksClient: JwksClient;
  let testKeyId: string;
  let privateKeyPem: string;

  beforeEach(() => {
    jwksClient = new JwksClient();
    testKeyId = 'apple-key-1';

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

    jwksClient.injectTestKeys(jwksUrl, [publicJwk]);
  });

  function createSignedToken(payload: Record<string, unknown>): string {
    const header = { alg: 'RS256', kid: testKeyId, typ: 'JWT' };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sign = createSign('RSA-SHA256');
    sign.update(`${headerB64}.${payloadB64}`, 'utf8');
    const signatureB64 = sign.sign(privateKeyPem).toString('base64url');

    return `${headerB64}.${payloadB64}.${signatureB64}`;
  }

  it('reports configuration status correctly', () => {
    const unconfigured = new AppleAuthProvider({ clientId: '' });
    assert.equal(unconfigured.isConfigured(), false);

    const configured = new AppleAuthProvider({ clientId });
    assert.equal(configured.isConfigured(), true);
  });

  it('generates authorization request with form_post response mode', () => {
    const provider = new AppleAuthProvider({ clientId });
    const req = provider.createAuthorizationRequest({
      redirectUri: 'http://127.0.0.1:4567/callback',
      state: 'apple-state-123',
      nonce: 'apple-nonce-456',
    });

    const parsed = new URL(req.authorizationUrl);
    assert.equal(parsed.searchParams.get('client_id'), clientId);
    assert.equal(parsed.searchParams.get('response_type'), 'code id_token');
    assert.equal(parsed.searchParams.get('response_mode'), 'form_post');
    assert.equal(parsed.searchParams.get('state'), 'apple-state-123');
    assert.equal(parsed.searchParams.get('nonce'), 'apple-nonce-456');
    assert.equal(parsed.searchParams.get('scope'), 'name email');
  });

  it('throws SocialAuthProviderUnavailableError when unconfigured', () => {
    const provider = new AppleAuthProvider({ clientId: '' });
    assert.throws(
      () =>
        provider.createAuthorizationRequest({
          redirectUri: 'http://127.0.0.1:4567/callback',
          state: 'state',
        }),
      SocialAuthProviderUnavailableError,
    );
  });

  it('handles user cancellation in Apple callback', async () => {
    const provider = new AppleAuthProvider({ clientId }, jwksClient);
    await assert.rejects(
      () =>
        provider.validateCallback({
          state: 'state',
          redirectUri: 'http://127.0.0.1:4567/callback',
          error: 'user_cancelled_authorize',
          errorDescription: 'User clicked cancel on Apple sheet',
        }),
      SocialAuthCancelledError,
    );
  });

  it('validates Apple ID token and parses initial user JSON profile', async () => {
    const provider = new AppleAuthProvider({ clientId, jwksUrl }, jwksClient);
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedToken({
      iss: 'https://appleid.apple.com',
      sub: 'apple-sub-888',
      aud: clientId,
      exp: now + 3600,
      iat: now,
      email: 'alex@privaterelay.appleid.com',
      email_verified: 'true',
      is_private_email: 'true',
    });

    const profile = await provider.validateCallback({
      state: 'state',
      redirectUri: 'http://127.0.0.1:4567/callback',
      idToken: token,
      userJson: JSON.stringify({
        name: { firstName: 'Alex', lastName: 'Developer' },
        email: 'alex@privaterelay.appleid.com',
      }),
    });

    assert.equal(profile.provider, 'APPLE');
    assert.equal(profile.providerSubjectId, 'apple-sub-888');
    assert.equal(profile.email, 'alex@privaterelay.appleid.com');
    assert.equal(profile.emailVerified, true);
    assert.equal(profile.displayName, 'Alex Developer');
    assert.equal(profile.isPrivateEmail, true);
  });

  it('validates returning user login where Apple omits user JSON', async () => {
    const provider = new AppleAuthProvider({ clientId, jwksUrl }, jwksClient);
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedToken({
      iss: 'https://appleid.apple.com',
      sub: 'apple-sub-888',
      aud: clientId,
      exp: now + 3600,
      iat: now,
      email: 'alex@privaterelay.appleid.com',
      email_verified: 'true',
    });

    const profile = await provider.validateCallback({
      state: 'state',
      redirectUri: 'http://127.0.0.1:4567/callback',
      idToken: token,
      // userJson omitted on subsequent logins by Apple!
    });

    assert.equal(profile.provider, 'APPLE');
    assert.equal(profile.providerSubjectId, 'apple-sub-888');
    assert.equal(profile.email, 'alex@privaterelay.appleid.com');
    assert.equal(profile.displayName, null);
  });
});
