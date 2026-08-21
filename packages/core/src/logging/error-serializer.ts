/**
 * @file packages/core/src/logging/error-serializer.ts
 * Safe error serialization and sanitization for structured logs.
 */

import type { SerializedError } from './logger-types.js';
import { sanitizeStringCredentials, redactValue } from './redaction.js';

export function serializeError(err: unknown): SerializedError {
  if (!err) {
    return {
      name: 'Error',
      message: 'Unknown error occurred.',
    };
  }

  if (err instanceof Error) {
    const errorObj = err as Error & { code?: unknown };
    const code =
      typeof errorObj.code === 'string'
        ? errorObj.code
        : typeof errorObj.code === 'number'
          ? String(errorObj.code)
          : undefined;

    return {
      name: err.name || 'Error',
      message: sanitizeStringCredentials(err.message || 'Error occurred.'),
      stack: err.stack ? sanitizeStringCredentials(err.stack) : undefined,
      code,
    };
  }

  if (typeof err === 'string') {
    return {
      name: 'Error',
      message: sanitizeStringCredentials(err),
    };
  }

  if (typeof err === 'object') {
    try {
      const redacted = redactValue(err);
      return {
        name: 'ObjectError',
        message: JSON.stringify(redacted),
      };
    } catch {
      return {
        name: 'ObjectError',
        message: '[Unserializable object]',
      };
    }
  }

  return {
    name: 'PrimitiveError',
    message: sanitizeStringCredentials(String(err)),
  };
}
