import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'crypto';
import { GoogleAuthProvider } from './google-auth-provider.js';
import { JwksClient } from './jwks-client.js';
import {
  SocialAuthCancelledError,
  SocialAuthProviderUnavailableError,
} from '../auth-errors.js';
import type { JwksKey } from './social-types.js';

describe('GoogleAuthProvider', () => {
  const clientId = 'google-client-id-123.apps.googleusercontent.com';
  const jwksUrl = 'https://www.googleapis.com/oauth2/v3/certs';
  let jwksClient: JwksClient;
  let testKeyId: string;
  let privateKeyPem: string;

  beforeEach(() => {
    jwksClient = new JwksClient();
    testKeyId = 'google-key-1';

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
    const unconfigured = new GoogleAuthProvider({ clientId: '' });
    assert.equal(unconfigured.isConfigured(), false);

    const configured = new GoogleAuthProvider({ clientId });
    assert.equal(configured.isConfigured(), true);
  });

  it('generates authorization request with PKCE and state parameters', () => {
    const provider = new GoogleAuthProvider({ clientId });
    const req = provider.createAuthorizationRequest({
      redirectUri: 'http://127.0.0.1:4567/callback',
      state: 'random-state-123',
      nonce: 'random-nonce-456',
      codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    });

    const parsed = new URL(req.authorizationUrl);
    assert.equal(parsed.searchParams.get('client_id'), clientId);
    assert.equal(parsed.searchParams.get('response_type'), 'code');
    assert.equal(parsed.searchParams.get('state'), 'random-state-123');
    assert.equal(parsed.searchParams.get('nonce'), 'random-nonce-456');
    assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(
      parsed.searchParams.get('code_challenge'),
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
    assert.equal(parsed.searchParams.get('redirect_uri'), 'http://127.0.0.1:4567/callback');
  });

  it('throws SocialAuthProviderUnavailableError when creating auth request unconfigured', () => {
    const provider = new GoogleAuthProvider({ clientId: '' });
    assert.throws(
      () =>
        provider.createAuthorizationRequest({
          redirectUri: 'http://127.0.0.1:4567/callback',
          state: 'state',
        }),
      SocialAuthProviderUnavailableError,
    );
  });

  it('handles user cancellation in callback', async () => {
    const provider = new GoogleAuthProvider({ clientId }, jwksClient);
    await assert.rejects(
      () =>
        provider.validateCallback({
          state: 'state',
          redirectUri: 'http://127.0.0.1:4567/callback',
          error: 'access_denied',
          errorDescription: 'User cancelled Google sign in',
        }),
      SocialAuthCancelledError,
    );
  });

  it('validates idToken and returns normalized Google profile', async () => {
    const provider = new GoogleAuthProvider({ clientId, jwksUrl }, jwksClient);
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedToken({
      iss: 'https://accounts.google.com',
      sub: 'google-sub-999',
      aud: clientId,
      exp: now + 3600,
      iat: now,
      email: 'engineer@google.com',
      email_verified: true,
      name: 'Google Engineer',
    });

    const profile = await provider.validateCallback({
      state: 'state',
      redirectUri: 'http://127.0.0.1:4567/callback',
      idToken: token,
    });

    assert.equal(profile.provider, 'GOOGLE');
    assert.equal(profile.providerSubjectId, 'google-sub-999');
    assert.equal(profile.email, 'engineer@google.com');
    assert.equal(profile.emailVerified, true);
    assert.equal(profile.displayName, 'Google Engineer');
  });
});
