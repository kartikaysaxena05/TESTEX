/**
 * @file packages/core/src/ai/ai-types.ts
 * Domain configuration constants, limits, and runtime models for the AI subsystem.
 */

export const AI_LIMITS = {
  MAX_MESSAGES: 100,
  MIN_MESSAGES: 1,
  MAX_MESSAGE_CHARS: 100_000,
  MAX_PAYLOAD_CHARS: 500_000,
  DEFAULT_TIMEOUT_MS: 30_000,
  MIN_TIMEOUT_MS: 1_000,
  MAX_TIMEOUT_MS: 300_000,
  MAX_RETRIES: 2,
  INITIAL_RETRY_DELAY_MS: 500,
  MAX_OUTPUT_TOKENS: 4_096,
} as const;

export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

export const SUPPORTED_OPENAI_MODELS: readonly string[] = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
] as const;

export const DEFAULT_FAKE_MODEL = 'fake-model-v1';

export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

export const SUPPORTED_OPENAI_EMBEDDING_MODELS: readonly string[] = [
  'text-embedding-3-small',
  'text-embedding-3-large',
] as const;

export const DEFAULT_FAKE_EMBEDDING_MODEL = 'fake-embedding-v1';

export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

export const DEFAULT_CANONICALIZATION_VERSION = 1;

export const EMBEDDING_LIMITS = {
  MAX_INPUTS: 100,
  MIN_INPUTS: 1,
  MAX_CHARS_PER_INPUT: 32_000,
  DEFAULT_DIMENSIONS: 1536,
  DEFAULT_TOP_K: 10,
  MAX_TOP_K: 100,
  MIN_TOP_K: 1,
} as const;

export interface RetryPolicy {
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly backoffMultiplier: number;
  readonly retryableErrorCodes: readonly string[];
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: AI_LIMITS.MAX_RETRIES,
  initialDelayMs: AI_LIMITS.INITIAL_RETRY_DELAY_MS,
  backoffMultiplier: 2,
  retryableErrorCodes: ['NETWORK_ERROR', 'PROVIDER_UNAVAILABLE', 'RATE_LIMITED'],
};
