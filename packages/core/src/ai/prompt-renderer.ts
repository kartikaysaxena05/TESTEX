/**
 * @file packages/core/src/ai/prompt-renderer.ts
 * Deterministic prompt rendering engine with strict data boundaries and no dynamic code execution.
 */

import type { AiMessageDto } from '@ai-quality/contracts';
import { AiPromptRenderFailedError } from './ai-errors.js';
import { AI_LIMITS } from './ai-types.js';

export const PROMPT_RENDERER_LIMITS = {
  MAX_VARIABLE_CHARS: 100_000,
  MAX_TOTAL_CHARS: AI_LIMITS.MAX_PAYLOAD_CHARS,
  MAX_MESSAGES: AI_LIMITS.MAX_MESSAGES,
} as const;

export class PromptRenderer {
  /**
   * Wraps untrusted domain data (e.g. user text, requirements, repository content)
   * in XML-style boundary tags to ensure LLMs treat it strictly as data, not instruction.
   */
  public static wrapUntrustedData(tag: string, content: string): string {
    const sanitizedTag = tag.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeContent = content ?? '';
    return `<${sanitizedTag}>\n${safeContent}\n</${sanitizedTag}>`;
  }

  /**
   * Builds a standard 2-message array (SYSTEM instruction + USER data payload).
   */
  public static buildSystemUserMessages(options: {
    systemPrompt: string;
    userPrompt: string;
    promptId?: string;
    version?: number;
  }): readonly AiMessageDto[] {
    const { systemPrompt, userPrompt, promptId = 'anonymous', version = 1 } = options;

    if (!systemPrompt || typeof systemPrompt !== 'string' || systemPrompt.trim().length === 0) {
      throw new AiPromptRenderFailedError(promptId, version, 'System prompt cannot be empty.');
    }

    if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
      throw new AiPromptRenderFailedError(promptId, version, 'User prompt cannot be empty.');
    }

    const messages: AiMessageDto[] = [
      { role: 'SYSTEM', content: systemPrompt.trim() },
      { role: 'USER', content: userPrompt.trim() },
    ];

    this.validateMessages(messages, promptId, version);

    return Object.freeze(messages);
  }

  /**
   * Safely interpolates dictionary variables into a template string without `eval` or dynamic code evaluation.
   */
  public static interpolate(
    template: string,
    variables: Readonly<Record<string, unknown>>,
    promptId = 'anonymous',
    version = 1,
  ): string {
    if (typeof template !== 'string') {
      throw new AiPromptRenderFailedError(promptId, version, 'Template must be a string.');
    }

    // Check for prototype pollution in variables
    this.assertSafeVariables(variables, promptId, version);

    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
      const val = variables[key];
      if (val === undefined || val === null) {
        throw new AiPromptRenderFailedError(
          promptId,
          version,
          `Required template variable '${key}' was not provided.`,
        );
      }
      const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
      if (strVal.length > PROMPT_RENDERER_LIMITS.MAX_VARIABLE_CHARS) {
        throw new AiPromptRenderFailedError(
          promptId,
          version,
          `Variable '${key}' character count (${strVal.length}) exceeds maximum limit of ${PROMPT_RENDERER_LIMITS.MAX_VARIABLE_CHARS}.`,
        );
      }
      return strVal;
    });
  }

  /**
   * Validates rendered message array bounds and character counts.
   */
  public static validateMessages(
    messages: readonly AiMessageDto[],
    promptId = 'anonymous',
    version = 1,
  ): void {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new AiPromptRenderFailedError(
        promptId,
        version,
        'Rendered prompt message array must not be empty.',
      );
    }

    if (messages.length > PROMPT_RENDERER_LIMITS.MAX_MESSAGES) {
      throw new AiPromptRenderFailedError(
        promptId,
        version,
        `Message count (${messages.length}) exceeds maximum allowed (${PROMPT_RENDERER_LIMITS.MAX_MESSAGES}).`,
      );
    }

    let totalChars = 0;
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]!;
      if (!msg.role || !['SYSTEM', 'USER', 'ASSISTANT'].includes(msg.role)) {
        throw new AiPromptRenderFailedError(
          promptId,
          version,
          `Message at index ${i} has invalid role '${String(msg.role)}'.`,
        );
      }
      if (typeof msg.content !== 'string' || msg.content.length === 0) {
        throw new AiPromptRenderFailedError(
          promptId,
          version,
          `Message at index ${i} has empty or non-string content.`,
        );
      }
      if (msg.content.length > PROMPT_RENDERER_LIMITS.MAX_VARIABLE_CHARS) {
        throw new AiPromptRenderFailedError(
          promptId,
          version,
          `Message at index ${i} exceeds maximum character limit (${PROMPT_RENDERER_LIMITS.MAX_VARIABLE_CHARS}).`,
        );
      }
      totalChars += msg.content.length;
    }

    if (totalChars > PROMPT_RENDERER_LIMITS.MAX_TOTAL_CHARS) {
      throw new AiPromptRenderFailedError(
        promptId,
        version,
        `Total prompt size (${totalChars} chars) exceeds maximum allowed limit (${PROMPT_RENDERER_LIMITS.MAX_TOTAL_CHARS} chars).`,
      );
    }
  }

  private static assertSafeVariables(
    variables: Readonly<Record<string, unknown>>,
    promptId: string,
    version: number,
  ): void {
    if (!variables || typeof variables !== 'object') {
      return;
    }
    const keys = Object.getOwnPropertyNames(variables);
    for (const key of keys) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new AiPromptRenderFailedError(
          promptId,
          version,
          `Forbidden template variable name '${key}' detected.`,
        );
      }
    }
  }
}
