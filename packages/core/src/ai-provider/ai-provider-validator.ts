/**
 * @file packages/core/src/ai-provider/ai-provider-validator.ts
 * Security validator and parameter boundary enforcement for AI Provider Abstraction (Phase 126).
 */

import {
  AiInvalidRequestError,
  AiConfigInvalidError,
} from './ai-provider-errors.js';
import type { AiGenerationParametersDto } from '@ai-quality/contracts';

export class AiProviderValidator {
  private static readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  private static readonly PROVIDER_ID_REGEX = /^[A-Z0-9_-]{1,64}$/i;

  // Strict safe pattern for model identifiers: alphanumeric start, allowed separators (: . - _)
  // Prevents path traversal (../), shell command injections (; | & $ `), and script tags
  private static readonly MODEL_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;

  // Link-local cloud metadata IPv4 addresses (AWS, GCP, Azure, OpenStack)
  private static readonly BLOCKED_METADATA_HOSTS = new Set([
    '169.254.169.254',
    'metadata.google.internal',
    '169.254.169.253',
  ]);

  public static readonly BOUNDS = {
    MAX_PROMPT_CHARS: 500_000,
    MAX_SYSTEM_PROMPT_CHARS: 100_000,
    MIN_PROMPT_CHARS: 1,
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 2.0,
    MIN_TOP_P: 0.0,
    MAX_TOP_P: 1.0,
    MIN_MAX_TOKENS: 1,
    MAX_MAX_TOKENS: 131_072,
    MIN_TIMEOUT_MS: 1_000,
    MAX_TIMEOUT_MS: 600_000,
    DEFAULT_TIMEOUT_MS: 60_000,
  } as const;

  /**
   * Validates a UUID string (project ID or request ID).
   */
  public static validateUuid(id: string, fieldName = 'ID'): string {
    if (!id || typeof id !== 'string' || !this.UUID_REGEX.test(id.trim())) {
      throw new AiInvalidRequestError(`Invalid ${fieldName}: must be a valid UUID.`);
    }
    return id.trim();
  }

  /**
   * Validates and normalizes an AI provider identifier (e.g. 'OLLAMA').
   */
  public static validateProviderId(providerId: string): string {
    if (!providerId || typeof providerId !== 'string') {
      throw new AiInvalidRequestError('Provider ID must be a non-empty string.');
    }
    const trimmed = providerId.trim();
    if (!this.PROVIDER_ID_REGEX.test(trimmed)) {
      throw new AiInvalidRequestError(
        `Invalid Provider ID '${providerId}'. Must be 1-64 characters alphanumeric, underscores, or hyphens.`,
      );
    }
    return trimmed.toUpperCase();
  }

  /**
   * Validates a model identifier and rejects malicious payloads (path traversal, shell injection).
   */
  public static validateModelIdentifier(model: string, providerId?: string): string {
    if (!model || typeof model !== 'string') {
      throw new AiInvalidRequestError('Model identifier must be a non-empty string.', providerId);
    }
    const trimmed = model.trim();

    // Check for suspicious characters before regex
    if (
      trimmed.includes('..') ||
      trimmed.includes('/') ||
      trimmed.includes('\\') ||
      trimmed.includes(';') ||
      trimmed.includes('|') ||
      trimmed.includes('&') ||
      trimmed.includes('$') ||
      trimmed.includes('`') ||
      trimmed.includes('<') ||
      trimmed.includes('>')
    ) {
      throw new AiInvalidRequestError(
        `Malicious or invalid model identifier '${model}'. Path traversal and command separators are strictly rejected.`,
        providerId,
      );
    }

    if (!this.MODEL_ID_REGEX.test(trimmed)) {
      throw new AiInvalidRequestError(
        `Invalid model identifier '${model}'. Allowed format: alphanumeric characters, dots, colons, hyphens, underscores (max 128 chars).`,
        providerId,
      );
    }

    return trimmed;
  }

  /**
   * Validates an AI provider base URL, blocking SSRF, cloud metadata, and embedded credentials.
   */
  public static validateBaseUrl(rawUrl: string, providerId?: string): string {
    if (!rawUrl || typeof rawUrl !== 'string') {
      throw new AiConfigInvalidError('Base URL must be a non-empty string.', providerId);
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl.trim());
    } catch {
      throw new AiConfigInvalidError(`Malformed base URL '${rawUrl}'.`, providerId);
    }

    // Protocol allowlist
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new AiConfigInvalidError(
        `Disallowed URL protocol '${parsed.protocol}'. Only http: and https: are permitted.`,
        providerId,
      );
    }

    // No embedded credentials
    if (parsed.username || parsed.password) {
      throw new AiConfigInvalidError(
        'Base URL must not contain embedded username or password credentials.',
        providerId,
      );
    }

    const hostname = parsed.hostname.toLowerCase();

    // Cloud metadata link-local inspection
    if (this.BLOCKED_METADATA_HOSTS.has(hostname) || hostname.startsWith('169.254.')) {
      throw new AiConfigInvalidError(
        `SSRF violation: Access to cloud metadata IP '${hostname}' is prohibited.`,
        providerId,
      );
    }

    // IPv6 link-local and cloud metadata (AWS IMDSv2 IPv6 is fd00:ec2::254)
    const cleanHost = hostname.replace(/^\[|\]$/g, '');
    if (cleanHost.startsWith('fe80:') || cleanHost.startsWith('fd00:ec2:')) {
      throw new AiConfigInvalidError(
        `SSRF violation: IPv6 link-local address '${hostname}' is prohibited.`,
        providerId,
      );
    }

    // Return normalized URL (trim trailing slash from root)
    const normalized = parsed.toString();
    return normalized.endsWith('/') && parsed.pathname === '/'
      ? normalized.slice(0, -1)
      : normalized;
  }

  /**
   * Enforces prompt length boundaries.
   */
  public static validatePrompt(prompt: string, providerId?: string): string {
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new AiInvalidRequestError('User prompt must be a non-empty string.', providerId);
    }

    if (prompt.length > this.BOUNDS.MAX_PROMPT_CHARS) {
      throw new AiInvalidRequestError(
        `Prompt exceeds maximum allowed length of ${this.BOUNDS.MAX_PROMPT_CHARS.toLocaleString()} characters (received ${prompt.length.toLocaleString()}).`,
        providerId,
      );
    }

    return prompt;
  }

  /**
   * Enforces system prompt length boundaries.
   */
  public static validateSystemPrompt(systemPrompt?: string, providerId?: string): string | undefined {
    if (!systemPrompt) return undefined;

    if (typeof systemPrompt !== 'string') {
      throw new AiInvalidRequestError('System prompt must be a string.', providerId);
    }

    if (systemPrompt.length > this.BOUNDS.MAX_SYSTEM_PROMPT_CHARS) {
      throw new AiInvalidRequestError(
        `System prompt exceeds maximum allowed length of ${this.BOUNDS.MAX_SYSTEM_PROMPT_CHARS.toLocaleString()} characters.`,
        providerId,
      );
    }

    return systemPrompt;
  }

  /**
   * Validates and bounds generation parameters.
   */
  public static validateParameters(
    params?: AiGenerationParametersDto,
    providerId?: string,
  ): AiGenerationParametersDto | undefined {
    if (!params) return undefined;

    if (params.temperature !== undefined) {
      if (
        typeof params.temperature !== 'number' ||
        Number.isNaN(params.temperature) ||
        params.temperature < this.BOUNDS.MIN_TEMPERATURE ||
        params.temperature > this.BOUNDS.MAX_TEMPERATURE
      ) {
        throw new AiInvalidRequestError(
          `Temperature must be a number between ${this.BOUNDS.MIN_TEMPERATURE} and ${this.BOUNDS.MAX_TEMPERATURE}.`,
          providerId,
        );
      }
    }

    if (params.topP !== undefined) {
      if (
        typeof params.topP !== 'number' ||
        Number.isNaN(params.topP) ||
        params.topP < this.BOUNDS.MIN_TOP_P ||
        params.topP > this.BOUNDS.MAX_TOP_P
      ) {
        throw new AiInvalidRequestError(
          `topP must be a number between ${this.BOUNDS.MIN_TOP_P} and ${this.BOUNDS.MAX_TOP_P}.`,
          providerId,
        );
      }
    }

    if (params.maxTokens !== undefined) {
      if (
        typeof params.maxTokens !== 'number' ||
        !Number.isInteger(params.maxTokens) ||
        params.maxTokens < this.BOUNDS.MIN_MAX_TOKENS ||
        params.maxTokens > this.BOUNDS.MAX_MAX_TOKENS
      ) {
        throw new AiInvalidRequestError(
          `maxTokens must be an integer between ${this.BOUNDS.MIN_MAX_TOKENS} and ${this.BOUNDS.MAX_MAX_TOKENS}.`,
          providerId,
        );
      }
    }

    if (params.timeoutMs !== undefined) {
      if (
        typeof params.timeoutMs !== 'number' ||
        !Number.isInteger(params.timeoutMs) ||
        params.timeoutMs < this.BOUNDS.MIN_TIMEOUT_MS ||
        params.timeoutMs > this.BOUNDS.MAX_TIMEOUT_MS
      ) {
        throw new AiInvalidRequestError(
          `timeoutMs must be an integer between ${this.BOUNDS.MIN_TIMEOUT_MS} and ${this.BOUNDS.MAX_TIMEOUT_MS}.`,
          providerId,
        );
      }
    }

    if (params.stopSequences !== undefined) {
      if (!Array.isArray(params.stopSequences)) {
        throw new AiInvalidRequestError('stopSequences must be an array of strings.', providerId);
      }
      if (params.stopSequences.length > 16) {
        throw new AiInvalidRequestError('stopSequences may not contain more than 16 items.', providerId);
      }
    }

    return params;
  }
}
