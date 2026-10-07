/**
 * @file packages/core/src/failures/evidence/failure-signature-generator.ts
 * Deterministic technical failure signature generator (V6 Phase 75).
 */

import * as crypto from 'node:crypto';

export interface FailureSignatureInput {
  readonly actionType?: string | null;
  readonly targetSummary?: string | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly assertionType?: string | null;
  readonly statusCode?: number | null;
  readonly browserEngine?: string | null;
}

export class FailureSignatureGenerator {
  /**
   * Generates a stable, deterministic technical failure signature hash.
   * Strips volatile values (UUIDs, timestamps, session tokens, randomized IDs)
   * before computing the cryptographic SHA-256 digest.
   */
  public generateSignature(input: FailureSignatureInput): string {
    const normalizedAction = (input.actionType || 'UNKNOWN_ACTION').trim().toUpperCase();
    const normalizedTarget = this.normalizeVolatileTokens(input.targetSummary || '');
    const normalizedErrorCode = (input.errorCode || 'UNKNOWN_ERROR').trim().toUpperCase();
    const normalizedMessage = this.normalizeVolatileTokens(input.errorMessage || '');
    const normalizedAssertion = (input.assertionType || '').trim().toUpperCase();
    const normalizedStatus = input.statusCode ? String(input.statusCode) : '';
    const normalizedEngine = (input.browserEngine || 'chromium').trim().toLowerCase();

    const signatureTuple = [
      normalizedEngine,
      normalizedAction,
      normalizedTarget,
      normalizedErrorCode,
      normalizedMessage,
      normalizedAssertion,
      normalizedStatus,
    ];

    const payload = JSON.stringify(signatureTuple);
    const hash = crypto.createHash('sha256').update(payload, 'utf8').digest('hex');

    return `sig_${hash.slice(0, 32)}`;
  }

  /**
   * Normalizes volatile tokens such as UUIDs, timestamps, hex hashes, and memory addresses.
   */
  public normalizeVolatileTokens(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }

    return (
      text
        // Replace UUIDs: e.g. 123e4567-e89b-12d3-a456-426614174000
        .replace(
          /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
          '<UUID>',
        )
        // Replace ISO Timestamps: e.g. 2026-08-23T14:15:00.000Z
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, '<TIMESTAMP>')
        // Replace long hex tokens (SHA hashes, random IDs): 16-64 chars
        .replace(/\b[0-9a-fA-F]{16,64}\b/g, '<HEX>')
        // Replace memory addresses / pointers: e.g. 0x7ffee4b2a
        .replace(/0x[0-9a-fA-F]+/g, '<ADDR>')
        // Replace ephemeral port numbers in localhost URLs: e.g. localhost:54321
        .replace(/(localhost|127\.0\.0\.1):\d{4,5}/g, '$1:<PORT>')
        // Replace line numbers in stack references: e.g. at file.ts:123:45
        .replace(/:\d+:\d+\)?/g, ':<LINE>:<COL>')
        // Normalize multiple whitespaces
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
    );
  }
}
