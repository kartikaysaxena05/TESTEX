import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'crypto';
import { JwksClient } from './jwks-client.js';
import {
  SocialAuthTokenInvalidError,
  SocialAuthNetworkError,
} from '../auth-errors.js';
import type { JwksKey } from './social-types.js';

describe('JwksClient', () => {
  const jwksUrl = 'https://auth.example.com/.well-known/jwks.json';
  let client: JwksClient;
  let testKeyId: string;
  let privateKeyPem: string;
  let publicJwk: JwksKey;

  beforeEach(() => {
    client = new JwksClient();
    testKeyId = 'test-key-1';

    const keypair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKeyPem = keypair.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const jwk = keypair.publicKey.export({ format: 'jwk' }) as Record<string, unknown>;

    publicJwk = {
      kty: 'RSA',
      kid: testKeyId,
      use: 'sig',
      alg: 'RS256',
      n: jwk.n as string,
      e: jwk.e as string,
    };

    client.injectTestKeys(jwksUrl, [publicJwk]);
  });

  function createSignedToken(payload: Record<string, unknown>, kid = testKeyId): string {
    const header = { alg: 'RS256', kid, typ: 'JWT' };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sign = createSign('RSA-SHA256');
    sign.update(`${headerB64}.${payloadB64}`, 'utf8');
    const signatureB64 = sign.sign(privateKeyPem).toString('base64url');

    return `${headerB64}.${payloadB64}.${signatureB64}`;
  }

  it('successfully verifies a valid signed ID token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedToken({
      iss: 'https://auth.example.com',
      sub: 'user-123',
      aud: 'client-abc',
      exp: now + 3600,
      iat: now,
      email: 'jane@example.com',
      email_verified: true,
      nonce: 'nonce-xyz',
    });

    const result = await client.verifyIdToken({
      idToken: token,
      jwksUrl,
      expectedIssuer: 'https://auth.example.com',
      expectedAudience: 'client-abc',
      expectedNonce: 'nonce-xyz',
    });

    assert.equal(result.payload.sub, 'user-123');
    assert.equal(result.payload.email, 'jane@example.com');
  });

  it('rejects tampered token signature', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedToken({
      iss: 'https://auth.example.com',
      sub: 'user-123',
      aud: 'client-abc',
      exp: now + 3600,
      iat: now,
    });

    const tampered = token.slice(0, -4) + 'AAAA';
    await assert.rejects(
      () =>
        client.verifyIdToken({
          idToken: tampered,
          jwksUrl,
          expectedIssuer: 'https://auth.example.com',
          expectedAudience: 'client-abc',
        }),
      SocialAuthTokenInvalidError,
    );
  });

  it('rejects expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 500;
    const token = createSignedToken({
      iss: 'https://auth.example.com',
      sub: 'user-123',
      aud: 'client-abc',
      exp: past,
      iat: past - 3600,
    });

    await assert.rejects(
      () =>
        client.verifyIdToken({
          idToken: token,
          jwksUrl,
          expectedIssuer: 'https://auth.example.com',
          expectedAudience: 'client-abc',
        }),
      SocialAuthTokenInvalidError,
    );
  });

  it('rejects issuer mismatch', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedToken({
      iss: 'https://malicious.issuer.com',
      sub: 'user-123',
      aud: 'client-abc',
      exp: now + 3600,
      iat: now,
    });

    await assert.rejects(
      () =>
        client.verifyIdToken({
          idToken: token,
          jwksUrl,
          expectedIssuer: 'https://auth.example.com',
          expectedAudience: 'client-abc',
        }),
      SocialAuthTokenInvalidError,
    );
  });

  it('rejects audience mismatch', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedToken({
      iss: 'https://auth.example.com',
      sub: 'user-123',
      aud: 'other-client',
      exp: now + 3600,
      iat: now,
    });

    await assert.rejects(
      () =>
        client.verifyIdToken({
          idToken: token,
          jwksUrl,
          expectedIssuer: 'https://auth.example.com',
          expectedAudience: 'client-abc',
        }),
      SocialAuthTokenInvalidError,
    );
  });

  it('rejects nonce mismatch', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedToken({
      iss: 'https://auth.example.com',
      sub: 'user-123',
      aud: 'client-abc',
      exp: now + 3600,
      iat: now,
      nonce: 'wrong-nonce',
    });

    await assert.rejects(
      () =>
        client.verifyIdToken({
          idToken: token,
          jwksUrl,
          expectedIssuer: 'https://auth.example.com',
          expectedAudience: 'client-abc',
          expectedNonce: 'expected-nonce',
        }),
      SocialAuthTokenInvalidError,
    );
  });

  it('rejects token with unknown kid not present in JWKS', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedToken(
      {
        iss: 'https://auth.example.com',
        sub: 'user-123',
        aud: 'client-abc',
        exp: now + 3600,
        iat: now,
      },
      'unknown-key-id',
    );

    await assert.rejects(
      () =>
        client.verifyIdToken({
          idToken: token,
          jwksUrl,
          expectedIssuer: 'https://auth.example.com',
          expectedAudience: 'client-abc',
        }),
      SocialAuthTokenInvalidError,
    );
  });

  it('throws SocialAuthNetworkError when JWKS fetch fails', async () => {
    const failingClient = new JwksClient({
      customFetch: async () => {
        throw new Error('Network unreachable');
      },
    });

    await assert.rejects(
      () => failingClient.getSigningKeys('https://failing.url/jwks'),
      SocialAuthNetworkError,
    );
  });
});
