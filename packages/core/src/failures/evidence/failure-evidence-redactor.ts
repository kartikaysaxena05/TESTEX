/**
 * @file packages/core/src/failures/evidence/failure-evidence-redactor.ts
 * Defensive secret redaction for Failure Evidence Normalization (V6 Phase 75).
 */

export class FailureEvidenceRedactor {
  private static readonly SENSITIVE_KEY_PATTERNS: RegExp[] = [
    /pass(word)?/i,
    /secret/i,
    /token/i,
    /api[_-]?key/i,
    /auth(orization)?/i,
    /bearer/i,
    /cookie/i,
    /session/i,
    /credit[_-]?card/i,
    /private[_-]?key/i,
    /client[_-]?secret/i,
  ];

  private static readonly INLINE_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
    // Bearer / Basic tokens
    { regex: /Bearer\s+([A-Za-z0-9_\-.~+/=]+)/gi, replacement: 'Bearer [REDACTED]' },
    { regex: /Basic\s+([A-Za-z0-9_\-.~+/=]+)/gi, replacement: 'Basic [REDACTED]' },

    // Sensitive URL query params
    {
      regex: /([?&](?:token|access_token|apiKey|api_key|key|password|secret|session)=)[^&#\s]*/gi,
      replacement: '$1[REDACTED]',
    },

    // Sensitive assignment patterns (e.g. password=xyz, apiKey: 'xyz')
    {
      regex:
        /(password|secret|api_key|apiKey|token|access_token|session)\s*[:=]\s*['"]?[^'"\s,;]+['"]?/gi,
      replacement: '$1: "[REDACTED]"',
    },

    // Database connection strings with passwords: postgres://user:pass@host:5432/db
    {
      regex: /([a-z]+:\/\/[^:]+:)[^@]+(@[^/\s]+)/gi,
      replacement: '$1[REDACTED]$2',
    },

    // Cookie headers
    {
      regex: /(?:cookie|set-cookie):\s*([^;\r\n]+)/gi,
      replacement: 'cookie: [REDACTED]',
    },
  ];

  /**
   * Redacts sensitive inline tokens and strings from raw text.
   */
  public redactText(text: string): { redacted: string; isRedacted: boolean } {
    if (!text || typeof text !== 'string') {
      return { redacted: text, isRedacted: false };
    }

    let result = text;
    let modified = false;

    for (const pattern of FailureEvidenceRedactor.INLINE_PATTERNS) {
      const replaced = result.replace(pattern.regex, pattern.replacement);
      if (replaced !== result) {
        result = replaced;
        modified = true;
      }
    }

    return { redacted: result, isRedacted: modified };
  }

  /**
   * Redacts sensitive URL query parameters while keeping path and safe query parameters intact.
   */
  public redactUrl(urlStr: string): { redacted: string; isRedacted: boolean } {
    if (!urlStr || typeof urlStr !== 'string') {
      return { redacted: urlStr, isRedacted: false };
    }

    try {
      // Check if it has a scheme
      const parsed = new URL(
        urlStr.startsWith('http') ? urlStr : `http://localhost/${urlStr.replace(/^\//, '')}`,
      );
      let isRedacted = false;

      for (const [key] of parsed.searchParams.entries()) {
        if (this.isSensitiveKey(key)) {
          parsed.searchParams.set(key, '[REDACTED]');
          isRedacted = true;
        }
      }

      if (urlStr.startsWith('http')) {
        return { redacted: parsed.toString(), isRedacted };
      }
      return {
        redacted: `${parsed.pathname}${parsed.search}${parsed.hash}`,
        isRedacted,
      };
    } catch {
      // Fallback regex if URL parse fails
      return this.redactText(urlStr);
    }
  }

  /**
   * Redacts headers map, replacing sensitive values with '[REDACTED]'.
   */
  public redactHeaders(headers?: Record<string, string>): {
    redacted: Record<string, string>;
    isRedacted: boolean;
  } {
    if (!headers || typeof headers !== 'object') {
      return { redacted: {}, isRedacted: false };
    }

    let isRedacted = false;
    const result: Record<string, string> = {};

    for (const [k, v] of Object.entries(headers)) {
      if (this.isSensitiveKey(k)) {
        result[k] = '[REDACTED]';
        isRedacted = true;
      } else if (typeof v === 'string') {
        const textRes = this.redactText(v);
        result[k] = textRes.redacted;
        if (textRes.isRedacted) isRedacted = true;
      } else {
        result[k] = String(v);
      }
    }

    return { redacted: result, isRedacted };
  }

  /**
   * Recursively redacts an arbitrary JSON object.
   */
  public redactObject(obj: unknown): { redacted: unknown; isRedacted: boolean } {
    if (obj === null || obj === undefined) {
      return { redacted: obj, isRedacted: false };
    }

    if (typeof obj === 'string') {
      return this.redactText(obj);
    }

    if (Array.isArray(obj)) {
      let isRedacted = false;
      const arr = obj.map(item => {
        const res = this.redactObject(item);
        if (res.isRedacted) isRedacted = true;
        return res.redacted;
      });
      return { redacted: arr, isRedacted };
    }

    if (typeof obj === 'object') {
      let isRedacted = false;
      const res: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (this.isSensitiveKey(k)) {
          res[k] = '[REDACTED]';
          isRedacted = true;
        } else {
          const childRes = this.redactObject(v);
          if (childRes.isRedacted) isRedacted = true;
          res[k] = childRes.redacted;
        }
      }
      return { redacted: res, isRedacted };
    }

    return { redacted: obj, isRedacted: false };
  }

  /**
   * Checks if a key name matches any known sensitive pattern.
   */
  public isSensitiveKey(key: string): boolean {
    return FailureEvidenceRedactor.SENSITIVE_KEY_PATTERNS.some(p => p.test(key));
  }
}
