/**
 * @file packages/core/src/patch/validation/validation-evidence-collector.ts
 * Evidence collector and sanitizer for BEFORE and AFTER validation executions.
 * Enforces strict credential redaction, length truncation, and deterministic failure signatures.
 */

import crypto from 'node:crypto';
import type { ValidationExecutionEvidenceDto } from '@ai-quality/contracts';
import { VALIDATION_BOUNDS, type ValidationStepExecutionResult } from './validation-types.js';

const SENSITIVE_PATTERNS = [
  /bearer\s+[a-zA-Z0-9_\-.=]+/gi,
  /password["']?\s*[:=]\s*["']?[^"'&\s]+/gi,
  /authorization["']?\s*[:=]\s*["']?[^"'&\s]+/gi,
  /api[_-]?key["']?\s*[:=]\s*["']?[^"'&\s]+/gi,
  /secret["']?\s*[:=]\s*["']?[^"'&\s]+/gi,
  /token["']?\s*[:=]\s*["']?[^"'&\s]+/gi,
  /BEGIN\s+PRIVATE\s+KEY/gi,
];

export class ValidationEvidenceCollector {
  /**
   * Redacts sensitive strings (tokens, keys, passwords).
   */
  public static redactString(input?: string | null): string | null {
    if (!input) return input ?? null;
    let redacted = input;
    for (const pattern of SENSITIVE_PATTERNS) {
      redacted = redacted.replace(pattern, '[REDACTED_SECRET]');
    }
    return redacted;
  }

  /**
   * Bounds string length within safe limits.
   */
  public static truncateString(
    input?: string | null,
    maxLength: number = VALIDATION_BOUNDS.MAX_EVIDENCE_SNIPPET_LENGTH,
  ): string | null {
    if (!input) return input ?? null;
    if (input.length <= maxLength) return input;
    const half = Math.floor(maxLength / 2) - 20;
    return `${input.slice(0, half)}\n...[TRUNCATED ${input.length - maxLength} CHARS]...\n${input.slice(-half)}`;
  }

  /**
   * Computes a deterministic failure signature from the failure payload.
   */
  public static computeFailureSignature(
    failedStepIndex?: number | null,
    failedStepAction?: string | null,
    actualResult?: string | null,
  ): string {
    const raw = `${failedStepIndex ?? 'na'}:${failedStepAction ?? 'unknown'}:${actualResult ?? 'failed'}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  }

  /**
   * Sanitizes an array of console log messages.
   */
  public static sanitizeLogs(logs: readonly string[] = []): string[] {
    return logs
      .slice(-VALIDATION_BOUNDS.MAX_LOG_ENTRIES)
      .map(log => this.truncateString(this.redactString(log), 1000) ?? '');
  }

  /**
   * Sanitizes an array of network calls.
   */
  public static sanitizeNetworkCalls(
    calls: readonly Record<string, unknown>[] = [],
  ): Record<string, unknown>[] {
    return calls.slice(-50).map(call => {
      const sanitized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(call)) {
        if (typeof v === 'string') {
          sanitized[k] = this.truncateString(this.redactString(v), 500);
        } else if (v && typeof v === 'object') {
          sanitized[k] = JSON.parse(this.redactString(JSON.stringify(v)) || '{}');
        } else {
          sanitized[k] = v;
        }
      }
      return sanitized;
    });
  }

  /**
   * Normalizes and packages execution result into a certified immutable evidence DTO.
   */
  public static createEvidenceDto(
    result: ValidationStepExecutionResult,
  ): ValidationExecutionEvidenceDto {
    const failureSig =
      result.failureSignature ||
      (result.status !== 'PASS'
        ? this.computeFailureSignature(
            result.failedStepIndex,
            result.failedStepAction,
            result.actualResult,
          )
        : null);

    return {
      status: result.status,
      failedStepIndex: result.failedStepIndex ?? null,
      failedStepAction: this.redactString(result.failedStepAction),
      expectedResult: this.truncateString(this.redactString(result.expectedResult)),
      actualResult: this.truncateString(this.redactString(result.actualResult)),
      failureSignature: failureSig,
      screenshotPath: result.screenshotPath ?? null,
      consoleLogs: this.sanitizeLogs(result.consoleLogs),
      networkCalls: this.sanitizeNetworkCalls(result.networkCalls),
      domSnapshot: this.truncateString(this.redactString(result.domSnapshot)),
      tracePath: result.tracePath ?? null,
      durationMs: result.durationMs,
      executedAt: result.executedAt.toISOString(),
    };
  }
}
