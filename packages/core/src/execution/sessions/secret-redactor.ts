/**
 * @file packages/core/src/execution/sessions/secret-redactor.ts
 * Centralized secret redaction utility to ensure passwords, tokens, API keys, and sensitive URLs
 * are never exposed in logs, error messages, diagnostics, or UI responses.
 */

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /bearer/i,
  /private[_-]?key/i,
  /session[_-]?id/i,
  /credentials?/i,
];

const SENSITIVE_QUERY_PARAMS = [
  'password',
  'pwd',
  'pass',
  'token',
  'access_token',
  'id_token',
  'refresh_token',
  'auth',
  'key',
  'apikey',
  'api_key',
  'secret',
  'code',
  'jwt',
  'sig',
  'signature',
];

export class SecretRedactor {
  private static registeredSecrets: Set<string> = new Set();

  /**
   * Registers a known plaintext secret value so that it is automatically masked wherever it appears in text.
   */
  public static registerSecret(secret: string): void {
    if (secret && secret.length >= 3) {
      this.registeredSecrets.add(secret);
    }
  }

  public registerSecret(secret: string): void {
    SecretRedactor.registerSecret(secret);
  }

  public registerSecrets(secrets: Record<string, string>): void {
    for (const val of Object.values(secrets)) {
      if (val) {
        SecretRedactor.registerSecret(val);
      }
    }
  }

  public redactString(text: string): string {
    return SecretRedactor.redactText(text);
  }

  public redactText(text: string): string {
    return SecretRedactor.redactText(text);
  }

  public redactUrl(urlStr: string): string {
    return SecretRedactor.redactUrl(urlStr);
  }

  public redactObject<T>(obj: T): T {
    return SecretRedactor.redactObject(obj);
  }

  /**
   * Clears registered secrets (e.g. at end of a session).
   */
  public static clearRegisteredSecrets(): void {
    this.registeredSecrets.clear();
  }

  public clearRegisteredSecrets(): void {
    SecretRedactor.clearRegisteredSecrets();
  }

  /**
   * Redacts sensitive parameters from a URL string.
   */
  public static redactUrl(urlStr: string): string {
    if (!urlStr || typeof urlStr !== 'string') {
      return urlStr;
    }

    try {
      const url = new URL(urlStr);

      // Redact basic auth username / password in URL authority
      if (url.password) {
        url.password = '***';
      }
      if (url.username && (url.username.includes('secret') || url.username.includes('token'))) {
        url.username = '***';
      }

      // Redact sensitive query parameters
      for (const param of SENSITIVE_QUERY_PARAMS) {
        if (url.searchParams.has(param)) {
          url.searchParams.set(param, '***');
        }
      }

      return url.toString();
    } catch {
      // Fallback regex masking for non-standard or partial URLs
      let result = urlStr;
      for (const param of SENSITIVE_QUERY_PARAMS) {
        const regex = new RegExp(`([?&]${param}=)[^&#\\s]*`, 'gi');
        result = result.replace(regex, '$1***');
      }
      return result;
    }
  }

  /**
   * Redacts known secrets and sensitive patterns from raw text or stringified logs.
   */
  public static redactText(text: string): string {
    if (!text || typeof text !== 'string') {
      return text;
    }

    let sanitized = text;

    // 1. Redact registered known secret tokens
    for (const secret of this.registeredSecrets) {
      if (secret && sanitized.includes(secret)) {
        sanitized = sanitized.replaceAll(secret, '***');
      }
    }

    // 2. Redact Authorization Bearer headers
    sanitized = sanitized.replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1***');

    // 3. Redact Basic Auth headers
    sanitized = sanitized.replace(/(Basic\s+)[A-Za-z0-9+/=]+/gi, '$1***');

    // 4. Redact password JSON fields: "password": "xyz"
    sanitized = sanitized.replace(
      /("(?:password|secret|token|apiKey|apiKeyToken)"\s*:\s*)"[^"]+"/gi,
      '$1"***"',
    );

    // 5. Redact GitHub personal access tokens
    sanitized = sanitized.replace(/(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}/g, '[REDACTED]');

    return sanitized;
  }

  /**
   * Recursively redacts sensitive keys and values in an object structure.
   */
  public static redactObject<T>(obj: T): T {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.redactText(this.redactUrl(obj)) as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.redactObject(item)) as unknown as T;
    }

    if (typeof obj === 'object') {
      const cloned: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key));
        if (isSensitiveKey && typeof value === 'string') {
          cloned[key] = '***';
        } else {
          cloned[key] = this.redactObject(value);
        }
      }
      return cloned as unknown as T;
    }

    return obj;
  }
}
