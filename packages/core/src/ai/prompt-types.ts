/**
 * @file packages/core/src/ai/prompt-types.ts
 * Type definitions and contracts for prompt templates, versioning, and variables.
 */

import type { z } from 'zod';
import type { AiMessageDto, AiGenerationConfigDto } from '@ai-quality/contracts';

/**
 * Universal interface for a versioned prompt definition.
 * Couples input contract, output contract, default configuration, and message builder.
 */
export interface PromptDefinition<TInput = unknown, TOutput = unknown> {
  /** Stable machine identifier (e.g. 'fixture.test.contract') */
  readonly id: string;
  /** Monotonically increasing version number (e.g. 1, 2) */
  readonly version: number;
  /** Human-readable description of the prompt purpose and contract */
  readonly description: string;
  /** Zod runtime validation schema for input variables */
  readonly inputSchema: z.ZodType<TInput>;
  /** Zod runtime validation schema for structured output payload */
  readonly outputSchema: z.ZodType<TOutput>;
  /** Static default generation configuration for this prompt */
  readonly defaultConfig?: Partial<AiGenerationConfigDto>;
  /**
   * Deterministically renders standard message array from typed, validated input.
   */
  buildMessages(input: TInput): readonly AiMessageDto[];
}

export interface PromptLookupKey {
  readonly id: string;
  readonly version?: number;
}
