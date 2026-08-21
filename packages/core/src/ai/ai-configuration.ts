/**
 * @file packages/core/src/ai/ai-configuration.ts
 * Central authoritative configuration resolution, runtime validation, and snapshot management.
 */

import type {
  AiProviderId,
  AiGenerationConfigDto,
  AiConfigSnapshot,
  AiStructuredOutputMode,
} from '@ai-quality/contracts';
import { AiConfigurationInvalidError } from './ai-errors.js';
import { DEFAULT_OPENAI_MODEL, AI_LIMITS } from './ai-types.js';

export const DEFAULT_AI_PROVIDER: AiProviderId = 'OPENAI';
export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_MAX_OUTPUT_TOKENS = 4_096;
export const DEFAULT_TIMEOUT_MS = AI_LIMITS.DEFAULT_TIMEOUT_MS;
export const DEFAULT_STRUCTURED_OUTPUT_MODE: AiStructuredOutputMode = 'AUTO';

export const AI_CONFIG_LIMITS = {
  MIN_TEMPERATURE: 0.0,
  MAX_TEMPERATURE: 2.0,
  MIN_TOP_P: 0.0,
  MAX_TOP_P: 1.0,
  MIN_MAX_OUTPUT_TOKENS: 1,
  MAX_MAX_OUTPUT_TOKENS: 32_768,
  MIN_TIMEOUT_MS: AI_LIMITS.MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS: AI_LIMITS.MAX_TIMEOUT_MS,
} as const;

export const DEFAULT_AI_CONFIG: Readonly<AiGenerationConfigDto> = Object.freeze({
  providerId: DEFAULT_AI_PROVIDER,
  model: DEFAULT_OPENAI_MODEL,
  temperature: DEFAULT_TEMPERATURE,
  maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  structuredOutputMode: DEFAULT_STRUCTURED_OUTPUT_MODE,
});

export interface ConfigurationResolutionLayers {
  /** Task-specific caller override provided at runtime execution */
  readonly callOverride?: Partial<AiGenerationConfigDto> | null;
  /** Task definition / Prompt definition static defaults */
  readonly taskDefinitionConfig?: Partial<AiGenerationConfigDto> | null;
  /** Project-scoped AI configuration (if active) */
  readonly projectConfig?: Partial<AiGenerationConfigDto> | null;
  /** Global application defaults */
  readonly applicationDefaults?: Partial<AiGenerationConfigDto> | null;
}

export class AiConfigurationResolver {
  /**
   * Deterministically resolves AI Generation Configuration across precedence layers:
   * 1. Call-time Override (Highest priority)
   * 2. Task / Prompt Definition Defaults
   * 3. Project Configuration
   * 4. Application Defaults (Lowest priority)
   *
   * CRITICAL: Uses deliberate nullish coalescing (`??`) so valid `0` or empty values are not wiped out.
   */
  public static resolve(layers: ConfigurationResolutionLayers = {}): AiGenerationConfigDto {
    const {
      callOverride = null,
      taskDefinitionConfig = null,
      projectConfig = null,
      applicationDefaults = null,
    } = layers;

    // Check for prototype pollution on input layers
    this.assertSafeObject(callOverride);
    this.assertSafeObject(taskDefinitionConfig);
    this.assertSafeObject(projectConfig);
    this.assertSafeObject(applicationDefaults);

    const providerId =
      callOverride?.providerId ??
      taskDefinitionConfig?.providerId ??
      projectConfig?.providerId ??
      applicationDefaults?.providerId ??
      DEFAULT_AI_CONFIG.providerId;

    const model =
      callOverride?.model ??
      taskDefinitionConfig?.model ??
      projectConfig?.model ??
      applicationDefaults?.model ??
      DEFAULT_AI_CONFIG.model;

    const temperature =
      callOverride?.temperature ??
      taskDefinitionConfig?.temperature ??
      projectConfig?.temperature ??
      applicationDefaults?.temperature ??
      DEFAULT_AI_CONFIG.temperature;

    const topP =
      callOverride?.topP ??
      taskDefinitionConfig?.topP ??
      projectConfig?.topP ??
      applicationDefaults?.topP ??
      undefined;

    const maxOutputTokens =
      callOverride?.maxOutputTokens ??
      taskDefinitionConfig?.maxOutputTokens ??
      projectConfig?.maxOutputTokens ??
      applicationDefaults?.maxOutputTokens ??
      DEFAULT_AI_CONFIG.maxOutputTokens;

    const timeoutMs =
      callOverride?.timeoutMs ??
      taskDefinitionConfig?.timeoutMs ??
      projectConfig?.timeoutMs ??
      applicationDefaults?.timeoutMs ??
      DEFAULT_AI_CONFIG.timeoutMs;

    const structuredOutputMode =
      callOverride?.structuredOutputMode ??
      taskDefinitionConfig?.structuredOutputMode ??
      projectConfig?.structuredOutputMode ??
      applicationDefaults?.structuredOutputMode ??
      DEFAULT_AI_CONFIG.structuredOutputMode;

    const providerOptions =
      callOverride?.providerOptions ??
      taskDefinitionConfig?.providerOptions ??
      projectConfig?.providerOptions ??
      applicationDefaults?.providerOptions ??
      undefined;

    const resolved: AiGenerationConfigDto = {
      providerId,
      model,
      temperature,
      ...(topP !== undefined ? { topP } : {}),
      maxOutputTokens,
      timeoutMs,
      ...(structuredOutputMode ? { structuredOutputMode } : {}),
      ...(providerOptions ? { providerOptions: Object.freeze({ ...providerOptions }) } : {}),
    };

    this.validate(resolved);

    return Object.freeze(resolved);
  }

  /**
   * Validates a resolved or partial AI configuration object.
   * Throws `AiConfigurationInvalidError` on any semantic or mathematical violation.
   */
  public static validate(config: AiGenerationConfigDto): void {
    if (!config || typeof config !== 'object') {
      throw new AiConfigurationInvalidError('Configuration payload must be a non-null object.');
    }

    this.assertSafeObject(config);

    // Provider ID validation
    if (typeof config.providerId !== 'string' || config.providerId.trim().length === 0) {
      throw new AiConfigurationInvalidError('Provider ID must be a non-empty string.');
    }
    if (config.providerId.length > 64) {
      throw new AiConfigurationInvalidError('Provider ID must not exceed 64 characters.');
    }

    // Model validation
    if (typeof config.model !== 'string' || config.model.trim().length === 0) {
      throw new AiConfigurationInvalidError('Model identifier must be a non-empty string.');
    }
    if (config.model.length > 128) {
      throw new AiConfigurationInvalidError('Model identifier must not exceed 128 characters.');
    }

    // Temperature validation
    if (
      typeof config.temperature !== 'number' ||
      Number.isNaN(config.temperature) ||
      !Number.isFinite(config.temperature) ||
      config.temperature < AI_CONFIG_LIMITS.MIN_TEMPERATURE ||
      config.temperature > AI_CONFIG_LIMITS.MAX_TEMPERATURE
    ) {
      throw new AiConfigurationInvalidError(
        `Temperature (${config.temperature}) must be a finite number between ${AI_CONFIG_LIMITS.MIN_TEMPERATURE} and ${AI_CONFIG_LIMITS.MAX_TEMPERATURE}.`,
        config.providerId,
      );
    }

    // TopP validation (optional)
    if (config.topP !== undefined) {
      if (
        typeof config.topP !== 'number' ||
        Number.isNaN(config.topP) ||
        !Number.isFinite(config.topP) ||
        config.topP < AI_CONFIG_LIMITS.MIN_TOP_P ||
        config.topP > AI_CONFIG_LIMITS.MAX_TOP_P
      ) {
        throw new AiConfigurationInvalidError(
          `topP (${config.topP}) must be a finite number between ${AI_CONFIG_LIMITS.MIN_TOP_P} and ${AI_CONFIG_LIMITS.MAX_TOP_P}.`,
          config.providerId,
        );
      }
    }

    // Max Output Tokens validation
    if (
      typeof config.maxOutputTokens !== 'number' ||
      !Number.isInteger(config.maxOutputTokens) ||
      config.maxOutputTokens < AI_CONFIG_LIMITS.MIN_MAX_OUTPUT_TOKENS ||
      config.maxOutputTokens > AI_CONFIG_LIMITS.MAX_MAX_OUTPUT_TOKENS
    ) {
      throw new AiConfigurationInvalidError(
        `maxOutputTokens (${config.maxOutputTokens}) must be an integer between ${AI_CONFIG_LIMITS.MIN_MAX_OUTPUT_TOKENS} and ${AI_CONFIG_LIMITS.MAX_MAX_OUTPUT_TOKENS}.`,
        config.providerId,
      );
    }

    // Timeout validation
    if (
      typeof config.timeoutMs !== 'number' ||
      !Number.isInteger(config.timeoutMs) ||
      config.timeoutMs < AI_CONFIG_LIMITS.MIN_TIMEOUT_MS ||
      config.timeoutMs > AI_CONFIG_LIMITS.MAX_TIMEOUT_MS
    ) {
      throw new AiConfigurationInvalidError(
        `timeoutMs (${config.timeoutMs}) must be an integer between ${AI_CONFIG_LIMITS.MIN_TIMEOUT_MS} and ${AI_CONFIG_LIMITS.MAX_TIMEOUT_MS}ms.`,
        config.providerId,
      );
    }

    // Structured Output Mode validation
    if (
      config.structuredOutputMode !== undefined &&
      !['NATIVE_JSON', 'JSON_PROMPT', 'AUTO'].includes(config.structuredOutputMode)
    ) {
      throw new AiConfigurationInvalidError(
        `Invalid structured output mode: '${String(config.structuredOutputMode)}'. Must be 'NATIVE_JSON', 'JSON_PROMPT', or 'AUTO'.`,
        config.providerId,
      );
    }
  }

  /**
   * Creates an immutable, non-secret snapshot of the effective configuration.
   * Guaranteed to contain zero credentials, API keys, or secret headers.
   */
  public static toSnapshot(config: AiGenerationConfigDto): AiConfigSnapshot {
    return Object.freeze({
      providerId: config.providerId,
      model: config.model,
      temperature: config.temperature,
      ...(config.topP !== undefined ? { topP: config.topP } : {}),
      maxOutputTokens: config.maxOutputTokens,
      timeoutMs: config.timeoutMs,
      structuredOutputMode: config.structuredOutputMode ?? DEFAULT_STRUCTURED_OUTPUT_MODE,
    });
  }

  /**
   * Protects against prototype pollution and forbidden internal properties.
   */
  private static assertSafeObject(obj: unknown): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }
    const keys = Object.getOwnPropertyNames(obj);
    for (const key of keys) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new AiConfigurationInvalidError(
          `Forbidden property '${key}' detected in configuration.`,
        );
      }
    }
  }
}
