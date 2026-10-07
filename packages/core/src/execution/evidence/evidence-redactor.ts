/**
 * @file packages/core/src/execution/evidence/evidence-redactor.ts
 * Bounded defensive secret redaction utility for evidence metadata, headers, URLs, and text content.
 */

import { SecretRedactor } from '../sessions/secret-redactor.js';
import type { EvidenceRedactionStatus } from '@ai-quality/contracts';

export interface RedactionResult<T> {
  readonly data: T;
  readonly redactionStatus: EvidenceRedactionStatus;
  readonly redactionsPerformed: number;
}

export class EvidenceRedactor {
  private readonly secretRedactor: SecretRedactor;

  constructor(secretRedactor?: SecretRedactor) {
    this.secretRedactor = secretRedactor ?? new SecretRedactor();
  }

  /**
   * Redacts sensitive key-value pairs and strings in an arbitrary metadata object.
   */
  public redactMetadata(
    metadata: Record<string, unknown>,
  ): RedactionResult<Record<string, unknown>> {
    if (!metadata || typeof metadata !== 'object' || Object.keys(metadata).length === 0) {
      return { data: {}, redactionStatus: 'NONE', redactionsPerformed: 0 };
    }

    let redactionsPerformed = 0;

    const sanitize = (val: unknown): unknown => {
      if (val === null || val === undefined) return val;
      if (typeof val === 'string') {
        const cleaned = this.secretRedactor.redactText(val);
        if (cleaned !== val) {
          redactionsPerformed++;
        }
        return cleaned;
      }
      if (Array.isArray(val)) {
        return val.map(item => sanitize(item));
      }
      if (typeof val === 'object') {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
          if (this.isSensitiveKey(k)) {
            result[k] = '***';
            redactionsPerformed++;
          } else {
            result[k] = sanitize(v);
          }
        }
        return result;
      }
      return val;
    };

    const sanitized = sanitize(metadata) as Record<string, unknown>;
    const redactionStatus: EvidenceRedactionStatus = redactionsPerformed > 0 ? 'REDACTED' : 'NONE';

    return {
      data: sanitized,
      redactionStatus,
      redactionsPerformed,
    };
  }

  /**
   * Redacts sensitive HTTP header values.
   */
  public redactHeaders(
    headers: Record<string, string | string[]>,
  ): RedactionResult<Record<string, string | string[]>> {
    let redactionsPerformed = 0;
    const result: Record<string, string | string[]> = {};

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (this.isSensitiveKey(lowerKey)) {
        result[key] = '***';
        redactionsPerformed++;
      } else if (typeof value === 'string') {
        const cleaned = this.secretRedactor.redactText(value);
        if (cleaned !== value) {
          redactionsPerformed++;
        }
        result[key] = cleaned;
      } else if (Array.isArray(value)) {
        result[key] = value.map(v => {
          const cleaned = this.secretRedactor.redactText(v);
          if (cleaned !== v) {
            redactionsPerformed++;
          }
          return cleaned;
        });
      } else {
        result[key] = value;
      }
    }

    return {
      data: result,
      redactionStatus: redactionsPerformed > 0 ? 'REDACTED' : 'NONE',
      redactionsPerformed,
    };
  }

  /**
   * Redacts sensitive query parameters or basic auth in URL strings.
   */
  public redactUrl(urlString: string): RedactionResult<string> {
    if (!urlString || typeof urlString !== 'string') {
      return { data: urlString, redactionStatus: 'NONE', redactionsPerformed: 0 };
    }

    let redactionsPerformed = 0;

    try {
      const parsed = new URL(urlString);
      if (parsed.password) {
        parsed.password = '***';
        redactionsPerformed++;
      }
      if (parsed.username && this.isSensitiveKey(parsed.username)) {
        parsed.username = '***';
        redactionsPerformed++;
      }

      // Check query params
      const entries = Array.from(parsed.searchParams.entries());
      for (const [k] of entries) {
        if (this.isSensitiveKey(k)) {
          parsed.searchParams.set(k, '***');
          redactionsPerformed++;
        }
      }

      const result = parsed.toString();
      return {
        data: result,
        redactionStatus: redactionsPerformed > 0 ? 'REDACTED' : 'NONE',
        redactionsPerformed,
      };
    } catch {
      // Not a valid URL, fallback to text regex
      const textCleaned = this.secretRedactor.redactText(urlString);
      const performed = textCleaned !== urlString ? 1 : 0;
      return {
        data: textCleaned,
        redactionStatus: performed > 0 ? 'REDACTED' : 'NONE',
        redactionsPerformed: performed,
      };
    }
  }

  /**
   * Redacts textual log content (e.g. console logs, network error bodies).
   */
  public redactText(text: string): RedactionResult<string> {
    if (!text || typeof text !== 'string') {
      return { data: text, redactionStatus: 'NONE', redactionsPerformed: 0 };
    }

    let cleaned = this.secretRedactor.redactText(text);

    // Redact embedded URLs with sensitive query parameters
    cleaned = cleaned.replace(/https?:\/\/[^\s"'<>]+/gi, match => {
      return this.secretRedactor.redactUrl(match);
    });

    // Redact plaintext password phrases with quotes: password="xyz" or password='xyz'
    cleaned = cleaned.replace(
      /((?:password|passwd|pwd|secret|token|api[_-]?key)\s*(?:is|[:=])\s*["'])([^"'\r\n]+)(["'])/gi,
      '$1***$3',
    );

    // Redact plaintext password phrases without quotes: password: xyz or password=xyz
    cleaned = cleaned.replace(
      /((?:password|passwd|pwd|secret|token|api[_-]?key)\s*(?:is|[:=])\s*)([^"'\s,;)<>]+)/gi,
      '$1***',
    );

    // Redact remaining plaintext phrases
    cleaned = cleaned.replace(
      /((?:password|passwd|pwd|secret|token|api[_-]?key)\s+)([^"'\s,;)<>]+)/gi,
      (match, p1) => {
        const remainder = match.slice(p1.length);
        if (
          /^(?:is|was|for|in|on|to|field|input|button|element|locator|required|empty|null|undefined)$/i.test(
            remainder,
          )
        ) {
          return match;
        }
        return `${p1}***`;
      },
    );

    const performed = cleaned !== text ? 1 : 0;
    return {
      data: cleaned,
      redactionStatus: performed > 0 ? 'REDACTED' : 'NONE',
      redactionsPerformed: performed,
    };
  }

  private isSensitiveKey(key: string): boolean {
    const k = key.toLowerCase();
    return (
      k.includes('password') ||
      k.includes('passwd') ||
      k.includes('secret') ||
      k.includes('token') ||
      k.includes('auth') ||
      k.includes('key') ||
      k.includes('cookie') ||
      k.includes('credential') ||
      k.includes('bearer') ||
      k.includes('jwt') ||
      k.includes('session')
    );
  }
}
