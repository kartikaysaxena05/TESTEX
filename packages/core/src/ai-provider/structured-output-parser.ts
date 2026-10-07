/**
 * @file packages/core/src/ai-provider/structured-output-parser.ts
 * Deterministic, bounded, and safe parser for raw model responses (Phase 132).
 * Handles markdown fences, whitespace, JSON boundaries, and prevents prototype pollution
 * without blindly executing or evaluating model output as code.
 */

import {
  AiStructuredParseError,
  AiStructuredSecurityViolationError,
} from './ai-provider-errors.js';

export interface ParseOptions {
  readonly allowMarkdownFences?: boolean;
  readonly stripTrailingCommas?: boolean;
  readonly maxPayloadChars?: number;
  readonly maxNestingDepth?: number;
}

export interface ParseResult {
  readonly ok: boolean;
  readonly data: unknown | null;
  readonly rawExtractedText: string;
  readonly error?: string;
  readonly status: 'VALID' | 'EMPTY' | 'TRUNCATED' | 'PARSE_ERROR';
}

const DEFAULT_MAX_PAYLOAD_CHARS = 200_000;
const DEFAULT_MAX_NESTING_DEPTH = 20;

export class V9StructuredOutputParser {
  /**
   * Safe JSON parse with prototype poisoning prevention and bounded recursion checks.
   */
  public static parse(rawInput: string, options?: ParseOptions): ParseResult {
    const maxChars = options?.maxPayloadChars ?? DEFAULT_MAX_PAYLOAD_CHARS;
    const maxDepth = options?.maxNestingDepth ?? DEFAULT_MAX_NESTING_DEPTH;

    if (!rawInput || rawInput.trim().length === 0) {
      return {
        ok: false,
        data: null,
        rawExtractedText: '',
        error: 'Model output is empty or whitespace only.',
        status: 'EMPTY',
      };
    }

    if (rawInput.length > maxChars) {
      throw new AiStructuredSecurityViolationError(
        `Structured output payload length (${rawInput.length}) exceeds safety limit (${maxChars}).`,
        'STRUCTURED_PAYLOAD_TOO_LARGE',
      );
    }

    const cleaned = this.extractJsonText(rawInput, options?.allowMarkdownFences !== false);

    if (!cleaned || cleaned.trim().length === 0) {
      return {
        ok: false,
        data: null,
        rawExtractedText: '',
        error: 'No JSON content could be extracted from model output.',
        status: 'PARSE_ERROR',
      };
    }

    // Check for obvious truncation (e.g. unclosed brackets at end of string)
    const isTruncated = this.detectTruncation(cleaned);

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (primaryErr: unknown) {
      // Deterministic, bounded recovery: if option enabled, attempt to strip trailing commas in simple objects/arrays
      if (options?.stripTrailingCommas) {
        try {
          const stripped = cleaned.replace(/,\s*([}\]])/g, '$1');
          parsed = JSON.parse(stripped);
        } catch {
          // If still failing, return structured failure
          return {
            ok: false,
            data: null,
            rawExtractedText: cleaned,
            error: primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
            status: isTruncated ? 'TRUNCATED' : 'PARSE_ERROR',
          };
        }
      } else {
        return {
          ok: false,
          data: null,
          rawExtractedText: cleaned,
          error: primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
          status: isTruncated ? 'TRUNCATED' : 'PARSE_ERROR',
        };
      }
    }

    // Security check: Prototype pollution & deep nesting guards
    this.sanitizeAndVerifyDepth(parsed, 1, maxDepth);

    return {
      ok: true,
      data: parsed,
      rawExtractedText: cleaned,
      status: 'VALID',
    };
  }

  /**
   * Safely strips markdown code blocks (```json ... ``` or ``` ... ```) and leading/trailing noise.
   */
  public static extractJsonText(raw: string, allowFences = true): string {
    let text = raw.trim();

    if (allowFences) {
      // 1. Check for fenced code block: ```json ... ``` or ``` ... ```
      const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/i);
      if (fenceMatch && fenceMatch[1]) {
        text = fenceMatch[1].trim();
      }
    }

    // 2. Locate first '{' or '[' and last '}' or ']'
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    let startIdx = -1;

    if (firstBrace !== -1 && firstBracket !== -1) {
      startIdx = Math.min(firstBrace, firstBracket);
    } else if (firstBrace !== -1) {
      startIdx = firstBrace;
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
    }

    if (startIdx !== -1) {
      const lastBrace = text.lastIndexOf('}');
      const lastBracket = text.lastIndexOf(']');
      const endIdx = Math.max(lastBrace, lastBracket);

      if (endIdx > startIdx) {
        text = text.substring(startIdx, endIdx + 1);
      }
    }

    return text.trim();
  }

  /**
   * Heuristic to identify cut-off or truncated JSON output.
   */
  private static detectTruncation(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed.length === 0) return false;

    // Check bracket balance
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') openBraces++;
        else if (char === '}') openBraces--;
        else if (char === '[') openBrackets++;
        else if (char === ']') openBrackets--;
      }
    }

    return openBraces > 0 || openBrackets > 0 || inString;
  }

  /**
   * Recursively verifies that object nesting does not exceed maxDepth and strips __proto__ keys.
   */
  private static sanitizeAndVerifyDepth(
    node: unknown,
    currentDepth: number,
    maxDepth: number,
  ): void {
    if (currentDepth > maxDepth) {
      throw new AiStructuredSecurityViolationError(
        `Structured payload nesting depth exceeded maximum permitted limit (${maxDepth}).`,
        'STRUCTURED_NESTING_TOO_DEEP',
      );
    }

    if (node === null || typeof node !== 'object') {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        this.sanitizeAndVerifyDepth(item, currentDepth + 1, maxDepth);
      }
      return;
    }

    const obj = node as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      // Prototype pollution prevention
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        delete obj[key];
        continue;
      }
      this.sanitizeAndVerifyDepth(obj[key], currentDepth + 1, maxDepth);
    }
  }
}
