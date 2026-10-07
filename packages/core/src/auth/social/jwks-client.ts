/**
 * @file packages/core/src/auth/social/jwks-client.ts
 * Dynamic JWKS client and JWS ID Token validator using native Node.js crypto.
 */

import { createPublicKey, createVerify, createHash, type KeyObject, type JsonWebKey } from 'crypto';
import { SocialAuthTokenInvalidError, SocialAuthNetworkError } from '../auth-errors.js';
import type { JwksKey, JwksResponse } from './social-types.js';

export interface VerifyIdTokenOptions {
  readonly idToken: string;
  readonly jwksUrl: string;
  readonly expectedIssuer: string | readonly string[];
  readonly expectedAudience: string;
  readonly expectedNonce?: string;
  readonly expectedNonceHash?: string;
  readonly clockSkewSeconds?: number;
}

export interface DecodedIdToken<TClaims = Record<string, unknown>> {
  readonly header: {
    readonly alg: string;
    readonly kid?: string;
    readonly typ?: string;
    [key: string]: unknown;
  };
  readonly payload: {
    readonly iss: string;
    readonly sub: string;
    readonly aud: string | readonly string[];
    readonly exp: number;
    readonly iat: number;
    readonly nonce?: string;
    readonly email?: string;
    readonly email_verified?: boolean | string;
    readonly name?: string;
    readonly given_name?: string;
    readonly family_name?: string;
    readonly is_private_email?: boolean | string;
    [key: string]: unknown;
  } & TClaims;
}

interface CacheEntry {
  readonly keys: readonly JwksKey[];
  readonly expiresAt: number;
}

export class JwksClient {
  private static instance?: JwksClient;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly testKeys = new Map<string, readonly JwksKey[]>();
  private readonly ttlMs: number;
  private customFetch?: typeof fetch;

  constructor(options?: { ttlMs?: number; customFetch?: typeof fetch }) {
    this.ttlMs = options?.ttlMs ?? 60 * 60 * 1000; // 1 hour default
    this.customFetch = options?.customFetch;
  }

  public static getInstance(): JwksClient {
    if (!JwksClient.instance) {
      JwksClient.instance = new JwksClient();
    }
    return JwksClient.instance;
  }

  /**
   * Allows tests to inject test JWKS without triggering real network requests.
   */
  public injectTestKeys(jwksUrl: string, keys: readonly JwksKey[]): void {
    this.testKeys.set(jwksUrl, keys);
  }

  public clearTestKeys(): void {
    this.testKeys.clear();
    this.cache.clear();
  }

  public setCustomFetch(customFetch?: typeof fetch): void {
    this.customFetch = customFetch;
  }

  /**
   * Fetches the JWKS keys from the given URL with caching.
   */
  public async getSigningKeys(jwksUrl: string, forceRefresh = false): Promise<readonly JwksKey[]> {
    if (this.testKeys.has(jwksUrl)) {
      return this.testKeys.get(jwksUrl)!;
    }

    const now = Date.now();
    const cached = this.cache.get(jwksUrl);
    if (!forceRefresh && cached && cached.expiresAt > now) {
      return cached.keys;
    }

    try {
      const fetchFn = this.customFetch ?? globalThis.fetch;
      const response = await fetchFn(jwksUrl, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new SocialAuthNetworkError(
          `Failed to fetch JWKS from ${jwksUrl}: HTTP ${response.status}`,
        );
      }

      const body = (await response.json()) as JwksResponse;
      if (!body || !Array.isArray(body.keys)) {
        throw new SocialAuthNetworkError(`Invalid JWKS response structure from ${jwksUrl}`);
      }

      this.cache.set(jwksUrl, {
        keys: body.keys,
        expiresAt: now + this.ttlMs,
      });

      return body.keys;
    } catch (err: unknown) {
      if (err instanceof SocialAuthNetworkError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new SocialAuthNetworkError(`Network failure fetching JWKS from ${jwksUrl}: ${message}`);
    }
  }

  /**
   * Converts a JWK into a Node.js KeyObject.
   */
  public jwkToPublicKey(jwk: JwksKey): KeyObject {
    try {
      return createPublicKey({
        key: jwk as unknown as JsonWebKey,
        format: 'jwk',
      });
    } catch (err) {
      throw new SocialAuthTokenInvalidError(
        `Failed to import JWK key ${jwk.kid}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Verifies and decodes an OIDC JWS Identity Token.
   */
  public async verifyIdToken<TClaims = Record<string, unknown>>(
    options: VerifyIdTokenOptions,
  ): Promise<DecodedIdToken<TClaims>> {
    const { idToken, jwksUrl, expectedIssuer, expectedAudience, expectedNonce, clockSkewSeconds = 60 } =
      options;

    if (!idToken || typeof idToken !== 'string') {
      throw new SocialAuthTokenInvalidError('ID token must be a non-empty string');
    }

    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new SocialAuthTokenInvalidError(
        `Malformed ID token: expected 3 parts, got ${parts.length}`,
      );
    }

    const headerB64 = parts[0]!;
    const payloadB64 = parts[1]!;
    const signatureB64 = parts[2]!;

    let header: DecodedIdToken['header'];
    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    } catch {
      throw new SocialAuthTokenInvalidError('Failed to parse ID token header JSON');
    }

    if (!header.alg) {
      throw new SocialAuthTokenInvalidError('Missing "alg" algorithm in ID token header');
    }

    // Phase 115 specifies RS256 for Google & Apple OIDC
    if (header.alg !== 'RS256') {
      throw new SocialAuthTokenInvalidError(
        `Unsupported ID token algorithm: ${header.alg}. Expected RS256.`,
      );
    }

    if (!header.kid) {
      throw new SocialAuthTokenInvalidError('Missing "kid" key identifier in ID token header');
    }

    // Retrieve signing key
    let keys = await this.getSigningKeys(jwksUrl, false);
    let matchedKey = keys.find((k) => k.kid === header.kid);

    // If key not found in cache, attempt one refresh
    if (!matchedKey && !this.testKeys.has(jwksUrl)) {
      keys = await this.getSigningKeys(jwksUrl, true);
      matchedKey = keys.find((k) => k.kid === header.kid);
    }

    if (!matchedKey) {
      throw new SocialAuthTokenInvalidError(
        `No matching key found in JWKS for kid "${header.kid}"`,
      );
    }

    const publicKey = this.jwkToPublicKey(matchedKey);

    // Cryptographic signature verification
    const signedData = `${headerB64}.${payloadB64}`;
    const verifier = createVerify('RSA-SHA256');
    verifier.update(signedData, 'utf8');

    const signatureBuffer = Buffer.from(signatureB64, 'base64url');
    const isSignatureValid = verifier.verify(publicKey, signatureBuffer);

    if (!isSignatureValid) {
      throw new SocialAuthTokenInvalidError('ID token signature verification failed');
    }

    // Decode and validate payload claims
    let payload: DecodedIdToken<TClaims>['payload'];
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      throw new SocialAuthTokenInvalidError('Failed to parse ID token payload JSON');
    }

    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new SocialAuthTokenInvalidError('Missing or empty "sub" subject claim in ID token');
    }

    // Validate expiration
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp + clockSkewSeconds < nowSeconds) {
      throw new SocialAuthTokenInvalidError(
        `ID token has expired (exp: ${payload.exp}, current: ${nowSeconds})`,
      );
    }

    // Validate issuer
    const allowedIssuers = Array.isArray(expectedIssuer) ? expectedIssuer : [expectedIssuer];
    if (!allowedIssuers.includes(payload.iss)) {
      throw new SocialAuthTokenInvalidError(
        `ID token issuer mismatch: got "${payload.iss}", expected one of [${allowedIssuers.join(', ')}]`,
      );
    }

    // Validate audience
    const audArray = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audArray.includes(expectedAudience)) {
      throw new SocialAuthTokenInvalidError(
        `ID token audience mismatch: got "${JSON.stringify(payload.aud)}", expected "${expectedAudience}"`,
      );
    }

    // Validate nonce if required
    if (expectedNonce !== undefined) {
      if (payload.nonce !== expectedNonce) {
        throw new SocialAuthTokenInvalidError(
          `ID token nonce mismatch: got "${payload.nonce ?? ''}", expected "${expectedNonce}"`,
        );
      }
    }

    if (options.expectedNonceHash !== undefined) {
      const actualNonceHash = payload.nonce
        ? createHash('sha256').update(payload.nonce, 'utf8').digest('hex')
        : '';
      if (actualNonceHash !== options.expectedNonceHash) {
        throw new SocialAuthTokenInvalidError(
          `ID token nonce hash mismatch: got "${actualNonceHash}", expected "${options.expectedNonceHash}"`,
        );
      }
    }

    return {
      header,
      payload,
    };
  }
}
