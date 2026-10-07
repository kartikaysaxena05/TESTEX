/**
 * @file packages/core/src/auth/session-token-service.ts
 * Cryptographic session token generation, hashing, and redacting for V8 Phase 113.
 */

import crypto from 'node:crypto';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';
import { InvalidAuthInputError } from './auth-errors.js';

export class SessionTokenService {
  /**
   * Generates a cryptographically strong 256-bit bearer session token.
   * Immediately registers the token with SecretRedactor so it never appears in logs.
   */
  public static generateBearerToken(): string {
    const rawToken = crypto.randomBytes(32).toString('hex');
    SecretRedactor.registerSecret(rawToken);
    return rawToken;
  }

  /**
   * Computes the SHA-256 hash of a bearer session token for database persistence.
   * Raw bearer tokens are NEVER stored in the database.
   */
  public static hashToken(bearerToken: string): string {
    if (!bearerToken || typeof bearerToken !== 'string') {
      throw new InvalidAuthInputError('Session bearer token must be a non-empty string.');
    }

    // Register token in case caller passed in an unregistered token
    SecretRedactor.registerSecret(bearerToken);

    return crypto.createHash('sha256').update(bearerToken, 'utf8').digest('hex');
  }

  /**
   * Constant-time comparison between a candidate token and a stored token hash.
   */
  public static verifyToken(bearerToken: string, storedTokenHash: string): boolean {
    if (!bearerToken || !storedTokenHash) {
      return false;
    }

    const candidateHash = this.hashToken(bearerToken);
    const candidateBuffer = Buffer.from(candidateHash, 'utf8');
    const storedBuffer = Buffer.from(storedTokenHash, 'utf8');

    if (candidateBuffer.length !== storedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(candidateBuffer, storedBuffer);
  }
}
