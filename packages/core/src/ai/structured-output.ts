/**
 * @file packages/core/src/ai/structured-output.ts
 * Robust JSON extraction, prototype pollution defense, and runtime schema validation.
 */

import type { z } from 'zod';
import { AiStructuredOutputParseError, AiStructuredOutputSchemaError } from './ai-errors.js';

export interface StructuredParseOptions {
  readonly providerId?: string;
  readonly promptId?: string;
  readonly promptVersion?: number;
}

export class StructuredOutputParser {
  /**
   * Extracts, safely parses, and schema-validates a structured payload from provider text completion.
   * Throws `AiStructuredOutputParseError` on syntax/extraction failure.
   * Throws `AiStructuredOutputSchemaError` on schema contract failure.
   */
  public static parseAndValidate<T>(
    text: string,
    schema: z.ZodType<T>,
    options: StructuredParseOptions = {},
  ): T {
    const rawJson = this.extractJsonString(text, options.providerId);
    const parsedObject = this.safeJsonParse(rawJson, options.providerId);

    const validationResult = schema.safeParse(parsedObject);

    if (!validationResult.success) {
      const issueSummary = validationResult.error.issues
        .map(issue => `[${issue.path.join('.') || 'root'}]: ${issue.message}`)
        .join('; ');

      throw new AiStructuredOutputSchemaError(
        `Structured response failed schema validation: ${issueSummary}`,
        validationResult.error.issues,
        options.providerId,
      );
    }

    return validationResult.data;
  }

  /**
   * Extracts clean JSON string from raw model text.
   * Supports clean raw JSON and bounded markdown fences (```json ... ```).
   */
  public static extractJsonString(rawText: string, providerId?: string): string {
    if (typeof rawText !== 'string' || rawText.trim().length === 0) {
      throw new AiStructuredOutputParseError(
        'Cannot parse structured output from empty or non-string response.',
        rawText,
        providerId,
      );
    }

    const trimmed = rawText.trim();

    // Check for markdown code fences
    const fenceMatch = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
    if (fenceMatch && fenceMatch[1]) {
      return fenceMatch[1].trim();
    }

    // Direct JSON object or array check
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      return trimmed;
    }

    // Check for embedded fenced block
    const embeddedMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/i);
    if (embeddedMatch && embeddedMatch[1]) {
      return embeddedMatch[1].trim();
    }

    throw new AiStructuredOutputParseError(
      'Model response does not contain a valid JSON payload or markdown code block.',
      trimmed.length > 500 ? trimmed.slice(0, 500) + '...' : trimmed,
      providerId,
    );
  }

  /**
   * Parses JSON string while preventing prototype pollution.
   */
  public static safeJsonParse(jsonString: string, providerId?: string): unknown {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AiStructuredOutputParseError(
        `Failed to parse JSON response: ${message}`,
        jsonString.length > 500 ? jsonString.slice(0, 500) + '...' : jsonString,
        providerId,
      );
    }

    // Reject non-object/non-array JSON primitives if top-level structure is required
    if (parsed === null || typeof parsed !== 'object') {
      throw new AiStructuredOutputParseError(
        `Expected structured JSON object or array, received ${String(parsed)}.`,
        jsonString,
        providerId,
      );
    }

    this.sanitizePrototypePollution(parsed);

    return parsed;
  }

  /**
   * Recursively asserts that object contains no __proto__, constructor, or prototype pollution keys.
   */
  private static sanitizePrototypePollution(target: unknown): void {
    if (!target || typeof target !== 'object') {
      return;
    }

    if (Array.isArray(target)) {
      for (const item of target) {
        this.sanitizePrototypePollution(item);
      }
      return;
    }

    const obj = target as Record<string, unknown>;
    const keys = Object.getOwnPropertyNames(obj);

    for (const key of keys) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        delete obj[key];
        throw new AiStructuredOutputParseError(
          `Prototype pollution attempt detected and rejected on key '${key}'.`,
        );
      }
      this.sanitizePrototypePollution(obj[key]);
    }
  }
}
