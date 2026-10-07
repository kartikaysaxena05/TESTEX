/**
 * @file packages/core/src/auth/social/pkce-service.ts
 * Cryptographic helpers for PKCE (RFC 7636), state, nonce, and hash generation.
 */

import { randomBytes, createHash } from 'crypto';

export class PkceService {
  /**
   * Generates a cryptographically secure random state string.
   */
  public static generateState(byteLength = 32): string {
    return randomBytes(byteLength).toString('hex');
  }

  /**
   * Generates a cryptographically secure random nonce string.
   */
  public static generateNonce(byteLength = 32): string {
    return randomBytes(byteLength).toString('hex');
  }

  /**
   * Generates a PKCE code verifier (43 to 128 characters, base64url encoded).
   */
  public static generateCodeVerifier(byteLength = 64): string {
    return randomBytes(byteLength)
      .toString('base64url')
      .replace(/[^A-Za-z0-9\-_.~]/g, '')
      .slice(0, 128);
  }

  /**
   * Generates an RFC 7636 S256 code challenge from a code verifier.
   * SHA-256 hash followed by base64url encoding.
   */
  public static deriveCodeChallenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier, 'utf8').digest('base64url');
  }

  /**
   * Computes a SHA-256 hex digest for storage/lookup (e.g. stateHash, nonceHash).
   */
  public static hashSecret(secret: string): string {
    return createHash('sha256').update(secret, 'utf8').digest('hex');
  }
}
