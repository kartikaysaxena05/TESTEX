/**
 * @file packages/core/src/logging/redaction.ts
 * Deep recursive secret and credential redaction for structured logging.
 */

const SENSITIVE_KEY_PATTERNS = [
  'password',
  'passwd',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'api_key',
  'authorization',
  'auth',
  'cookie',
  'set-cookie',
  'databaseurl',
  'database_url',
  'credentials',
  'privatekey',
  'private_key',
];

const REDACTED_MARKER = '[REDACTED]';

/**
 * Redacts embedded credentials in URL strings (e.g. postgresql://user:pass@host:5432/db -> postgresql://[REDACTED]@host:5432/db).
 */
export function sanitizeStringCredentials(str: string): string {
  // 1. Redact URL user:pass credentials
  let sanitized = str.replace(
    /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^@/\s:]+):([^@/\s]+)@/g,
    `$1${REDACTED_MARKER}@`,
  );

  // 2. Redact Authorization Bearer tokens
  sanitized = sanitized.replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, `$1${REDACTED_MARKER}`);

  return sanitized;
}

/**
 * Checks if an object property key is sensitive.
 */
export function isSensitiveKey(key: string): boolean {
  const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
  return SENSITIVE_KEY_PATTERNS.some(pattern => {
    const normalizedPattern = pattern.toLowerCase().replace(/[-_]/g, '');
    return normalizedKey === normalizedPattern || normalizedKey.includes(normalizedPattern);
  });
}

/**
 * Deeply and recursively redacts sensitive information from arbitrary values.
 */
export function redactValue(val: unknown, depth = 0): unknown {
  if (depth > 8) {
    return '[TRUNCATED_NESTING]';
  }

  if (val === null || val === undefined) {
    return val;
  }

  if (typeof val === 'string') {
    return sanitizeStringCredentials(val);
  }

  if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'symbol') {
    return val;
  }

  if (Array.isArray(val)) {
    return val.map(item => redactValue(item, depth + 1));
  }

  if (typeof val === 'object') {
    // Avoid dumping process.env or huge global objects
    if ('NODE_ENV' in val && 'PATH' in val) {
      return '[REDACTED_PROCESS_ENV]';
    }

    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      if (isSensitiveKey(k)) {
        result[k] = REDACTED_MARKER;
      } else {
        result[k] = redactValue(v, depth + 1);
      }
    }
    return result;
  }

  return String(val);
}
