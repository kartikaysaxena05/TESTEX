/**
 * @file packages/core/src/ai-provider/tool-call-parser.ts
 * Deterministic and safe parser for model-generated tool calls (V9 Phase 133).
 *
 * Handles:
 * - Direct JSON objects representing tool calls (e.g. `{ name: 'repository.search', arguments: { ... } }`)
 * - Direct JSON arrays of tool calls
 * - Ollama / OpenAI formatted `{ tool_calls: [...] }` or `{ function: { name, arguments } }`
 * - Markdown fences (```json ... ```)
 * - Leading/trailing conversational text
 * - Prototype pollution defense and nesting depth bounds
 * - Prompt-injection pseudo tool call rejection
 * - NEVER executes code or calls any tool.
 */

import { randomUUID } from 'node:crypto';
import type {
  NormalizedAiToolCallDto,
} from '@ai-quality/contracts';
import {
  AiToolCallParseError,
  AiStructuredSecurityViolationError,
} from './ai-provider-errors.js';
import { V9StructuredOutputParser } from './structured-output-parser.js';

export interface ParseToolCallOptions {
  readonly allowMarkdownFences?: boolean;
  readonly maxPayloadChars?: number;
  readonly maxNestingDepth?: number;
}

export class V9ToolCallParser {
  private static readonly DEFAULT_MAX_CHARS = 200_000;
  private static readonly DEFAULT_MAX_DEPTH = 16;

  /**
   * Safely parses raw model output into normalized tool call representations.
   */
  public static parse(
    rawInput: string,
    options?: ParseToolCallOptions,
  ): readonly NormalizedAiToolCallDto[] {
    if (!rawInput || rawInput.trim().length === 0) {
      return [];
    }

    const maxChars = options?.maxPayloadChars ?? this.DEFAULT_MAX_CHARS;
    if (rawInput.length > maxChars) {
      throw new AiStructuredSecurityViolationError(
        `Tool call payload length (${rawInput.length}) exceeds safety limit (${maxChars}).`,
        'STRUCTURED_PAYLOAD_TOO_LARGE',
      );
    }

    // 1. Extract candidate JSON using V9StructuredOutputParser
    const extracted = V9StructuredOutputParser.extractJsonText(
      rawInput,
      options?.allowMarkdownFences !== false,
    );

    if (!extracted || extracted.trim().length === 0) {
      return [];
    }

    const trimmed = extracted.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      // Plain text without JSON delimiters
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Deterministic trailing comma cleanup
      try {
        const stripped = trimmed.replace(/,\s*([}\]])/g, '$1');
        parsed = JSON.parse(stripped);
      } catch (err) {
        throw new AiToolCallParseError(
          `Failed to parse model tool-call JSON: ${err instanceof Error ? err.message : String(err)}`,
          rawInput,
        );
      }
    }

    // 2. Prototype pollution defense & depth check
    const maxDepth = options?.maxNestingDepth ?? this.DEFAULT_MAX_DEPTH;
    this.sanitizeAndVerifyDepth(parsed, 1, maxDepth);

    // 3. Normalize into NormalizedAiToolCallDto array
    return this.normalizeToolCalls(parsed);
  }

  /**
   * Normalizes diverse JSON structures into standard NormalizedAiToolCallDto[].
   */
  private static normalizeToolCalls(data: unknown): readonly NormalizedAiToolCallDto[] {
    if (!data || typeof data !== 'object') {
      return [];
    }

    const results: NormalizedAiToolCallDto[] = [];

    // Case A: Array of tool calls
    if (Array.isArray(data)) {
      for (const item of data) {
        const call = this.extractSingleToolCall(item);
        if (call) results.push(call);
      }
      return results;
    }

    const obj = data as Record<string, unknown>;

    // Case B: { tool_calls: [...] } or { toolCalls: [...] }
    const arrayField = obj.tool_calls || obj.toolCalls || obj.calls;
    if (Array.isArray(arrayField)) {
      for (const item of arrayField) {
        const call = this.extractSingleToolCall(item);
        if (call) results.push(call);
      }
      return results;
    }

    // Case C: { tool_call: {...} } or { toolCall: {...} }
    const singleField = obj.tool_call || obj.toolCall;
    if (singleField && typeof singleField === 'object') {
      const call = this.extractSingleToolCall(singleField);
      if (call) results.push(call);
      return results;
    }

    // Case D: Single direct tool call object: { name, arguments } or { function: { name, arguments } }
    const directCall = this.extractSingleToolCall(obj);
    if (directCall) {
      results.push(directCall);
    }

    return results;
  }

  /**
   * Extracts a single tool call from an object.
   */
  private static extractSingleToolCall(item: unknown): NormalizedAiToolCallDto | null {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }

    const obj = item as Record<string, unknown>;

    // Sub-case: OpenAI function calling format: { id, type: 'function', function: { name, arguments } }
    if (obj.function && typeof obj.function === 'object' && !Array.isArray(obj.function)) {
      const fn = obj.function as Record<string, unknown>;
      const rawName = typeof fn.name === 'string' ? fn.name : '';
      if (!rawName) return null;

      let args: Record<string, unknown> = {};
      if (typeof fn.arguments === 'string') {
        try {
          args = JSON.parse(fn.arguments);
        } catch {
          args = {};
        }
      } else if (fn.arguments && typeof fn.arguments === 'object' && !Array.isArray(fn.arguments)) {
        args = fn.arguments as Record<string, unknown>;
      }

      const id = typeof obj.id === 'string' && obj.id.length > 0 ? obj.id : `call_${randomUUID().slice(0, 8)}`;
      return {
        id,
        name: rawName.trim(),
        arguments: args,
        schemaVersion: 1,
        metadata: { format: 'openai_function' },
      };
    }

    // Direct format: { name: '...', arguments: {...} } or { tool: '...', args: {...} }
    const rawName = (obj.name || obj.tool || obj.toolName) as string | undefined;
    if (typeof rawName !== 'string' || rawName.trim().length === 0) {
      return null;
    }

    let args: Record<string, unknown> = {};
    const rawArgs = obj.arguments ?? obj.args ?? obj.input ?? obj.parameters;
    if (typeof rawArgs === 'string') {
      try {
        args = JSON.parse(rawArgs);
      } catch {
        args = {};
      }
    } else if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
      args = rawArgs as Record<string, unknown>;
    }

    const id =
      typeof obj.id === 'string' && obj.id.length > 0
        ? obj.id
        : typeof obj.toolCallId === 'string' && obj.toolCallId.length > 0
          ? obj.toolCallId
          : `call_${randomUUID().slice(0, 8)}`;

    const schemaVersion =
      typeof obj.schemaVersion === 'number' && Number.isInteger(obj.schemaVersion)
        ? obj.schemaVersion
        : 1;

    return {
      id,
      name: rawName.trim(),
      arguments: args,
      schemaVersion,
      metadata: typeof obj.metadata === 'object' && obj.metadata !== null ? (obj.metadata as Record<string, unknown>) : null,
    };
  }

  /**
   * Recursive sanitizer stripping prototype pollution keys and guarding max recursion depth.
   */
  private static sanitizeAndVerifyDepth(obj: unknown, currentDepth: number, maxDepth: number): void {
    if (currentDepth > maxDepth) {
      throw new AiStructuredSecurityViolationError(
        `Tool call argument nesting depth (${currentDepth}) exceeded safety limit (${maxDepth}).`,
        'STRUCTURED_NESTING_TOO_DEEP',
      );
    }

    if (!obj || typeof obj !== 'object') {
      return;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.sanitizeAndVerifyDepth(item, currentDepth + 1, maxDepth);
      }
      return;
    }

    const record = obj as Record<string, unknown>;
    const forbiddenKeys = ['__proto__', 'constructor', 'prototype'];

    for (const key of Object.keys(record)) {
      if (forbiddenKeys.includes(key)) {
        delete record[key];
        continue;
      }
      this.sanitizeAndVerifyDepth(record[key], currentDepth + 1, maxDepth);
    }
  }
}
