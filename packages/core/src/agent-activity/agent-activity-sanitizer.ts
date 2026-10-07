/**
 * @file packages/core/src/agent-activity/agent-activity-sanitizer.ts
 * Secret redaction and output sanitization for V10 Phase 154 activity events.
 */

import { SecretRedactor } from '../execution/sessions/secret-redactor.js';
import { redactValue, sanitizeStringCredentials } from '../logging/redaction.js';

export class AgentActivitySanitizer {
  private static readonly MAX_STRING_LENGTH = 1000;
  private static readonly MAX_SUMMARY_KEYS = 30;

  /**
   * Redacts all sensitive keys and registered secrets from an arbitrary object.
   */
  public static redact<T>(input: T): T {
    if (input === null || input === undefined) {
      return input;
    }

    if (typeof input === 'string') {
      const urlSanitized = sanitizeStringCredentials(input);
      return SecretRedactor.redactText(urlSanitized) as unknown as T;
    }

    // Apply recursive structural redaction
    const structurallyRedacted = redactValue(input);

    // Apply plaintext string redaction over JSON if needed
    if (typeof structurallyRedacted === 'object' && structurallyRedacted !== null) {
      try {
        const json = JSON.stringify(structurallyRedacted);
        const textRedacted = SecretRedactor.redactText(sanitizeStringCredentials(json));
        return JSON.parse(textRedacted) as T;
      } catch {
        return structurallyRedacted as T;
      }
    }

    return structurallyRedacted as T;
  }

  /**
   * Summarizes tool input payloads safely for UI presentation,
   * enforcing field limits and complete redaction.
   */
  public static summarizeInput(input: unknown): Record<string, unknown> | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }

    const sanitized = this.redact(input) as Record<string, unknown>;
    const summary: Record<string, unknown> = {};
    const entries = Object.entries(sanitized);

    for (let i = 0; i < Math.min(entries.length, this.MAX_SUMMARY_KEYS); i++) {
      const entry = entries[i];
      if (!entry) continue;
      const [key, val] = entry;
      summary[key] = this.truncateValue(val);
    }

    return summary;
  }

  /**
   * Summarizes tool results or observations into safe compact representations.
   */
  public static summarizeResult(result: unknown): unknown {
    if (result === null || result === undefined) {
      return null;
    }

    const sanitized = this.redact(result);
    return this.truncateValue(sanitized);
  }

  /**
   * Sanitizes error message strings, masking credentials and bounding length.
   */
  public static sanitizeError(error: unknown): string | null {
    if (!error) return null;

    let message = '';
    if (typeof error === 'string') {
      message = error;
    } else if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'object') {
      try {
        message = JSON.stringify(error);
      } catch {
        message = String(error);
      }
    } else {
      message = String(error);
    }

    const urlSanitized = sanitizeStringCredentials(message);
    const redacted = SecretRedactor.redactText(urlSanitized);
    if (redacted.length > this.MAX_STRING_LENGTH) {
      return redacted.slice(0, this.MAX_STRING_LENGTH) + '... [truncated]';
    }
    return redacted;
  }

  private static truncateValue(val: unknown, depth = 0): unknown {
    if (depth > 4) return '[Nested Object]';

    if (typeof val === 'string') {
      if (val.length > this.MAX_STRING_LENGTH) {
        return val.slice(0, this.MAX_STRING_LENGTH) + '... [truncated]';
      }
      return val;
    }

    if (Array.isArray(val)) {
      if (val.length > 20) {
        return [
          ...val.slice(0, 20).map(i => this.truncateValue(i, depth + 1)),
          `... (${val.length - 20} more items)`,
        ];
      }
      return val.map(i => this.truncateValue(i, depth + 1));
    }

    if (typeof val === 'object' && val !== null) {
      const res: Record<string, unknown> = {};
      const entries = Object.entries(val);
      for (let i = 0; i < Math.min(entries.length, 25); i++) {
        const entry = entries[i];
        if (!entry) continue;
        const [k, v] = entry;
        res[k] = this.truncateValue(v, depth + 1);
      }
      if (entries.length > 25) {
        res['_truncated'] = `${entries.length - 25} more keys`;
      }
      return res;
    }

    return val;
  }
}

export const sanitizeActivityPayload = (input: unknown): unknown =>
  AgentActivitySanitizer.redact(input);

export const sanitizeErrorMessage = (error: unknown): string =>
  AgentActivitySanitizer.sanitizeError(error) ?? '';
