/**
 * @file packages/core/src/ai/ai-configuration.test.ts
 * Unit tests for AI configuration resolution, precedence, validation, and snapshotting.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AiConfigurationResolver,
  DEFAULT_AI_CONFIG,
  DEFAULT_AI_PROVIDER,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_STRUCTURED_OUTPUT_MODE,
} from './ai-configuration.js';
import { AiConfigurationInvalidError } from './ai-errors.js';
import type { AiGenerationConfigDto } from '@ai-quality/contracts';

describe('AiConfigurationResolver', () => {
  describe('Default Configuration', () => {
    it('provides immutable, frozen default configuration matching domain specifications', () => {
      assert.equal(DEFAULT_AI_CONFIG.providerId, 'OPENAI');
      assert.equal(DEFAULT_AI_CONFIG.model, 'gpt-4o-mini');
      assert.equal(DEFAULT_AI_CONFIG.temperature, 0.2);
      assert.equal(DEFAULT_AI_CONFIG.maxOutputTokens, 4096);
      assert.equal(DEFAULT_AI_CONFIG.timeoutMs, 30000);
      assert.equal(DEFAULT_AI_CONFIG.structuredOutputMode, 'AUTO');
      assert.ok(Object.isFrozen(DEFAULT_AI_CONFIG));
    });

    it('resolves default configuration when no overrides are provided', () => {
      const resolved = AiConfigurationResolver.resolve({});
      assert.equal(resolved.providerId, DEFAULT_AI_PROVIDER);
      assert.equal(resolved.temperature, DEFAULT_TEMPERATURE);
      assert.equal(resolved.maxOutputTokens, DEFAULT_MAX_OUTPUT_TOKENS);
      assert.equal(resolved.timeoutMs, DEFAULT_TIMEOUT_MS);
      assert.equal(resolved.structuredOutputMode, DEFAULT_STRUCTURED_OUTPUT_MODE);
    });
  });

  describe('Configuration Precedence', () => {
    it('applies precedence: Call-time Override > Task Default > Project Config > App Default', () => {
      const appDefaults: Partial<AiGenerationConfigDto> = {
        providerId: 'OPENAI',
        model: 'app-default-model',
        temperature: 0.8,
        maxOutputTokens: 1000,
      };

      const projectConfig: Partial<AiGenerationConfigDto> = {
        model: 'project-model',
        temperature: 0.5,
        maxOutputTokens: 2000,
      };

      const taskDefinitionConfig: Partial<AiGenerationConfigDto> = {
        temperature: 0.3,
        maxOutputTokens: 3000,
      };

      const callOverride: Partial<AiGenerationConfigDto> = {
        temperature: 0.1,
      };

      const resolved = AiConfigurationResolver.resolve({
        callOverride,
        taskDefinitionConfig,
        projectConfig,
        applicationDefaults: appDefaults,
      });

      // temperature comes from callOverride
      assert.equal(resolved.temperature, 0.1);
      // maxOutputTokens comes from taskDefinitionConfig
      assert.equal(resolved.maxOutputTokens, 3000);
      // model comes from projectConfig
      assert.equal(resolved.model, 'project-model');
      // providerId comes from appDefaults
      assert.equal(resolved.providerId, 'OPENAI');
    });

    it('preserves valid zero (0) values for temperature using nullish coalescing', () => {
      const taskDefaults: Partial<AiGenerationConfigDto> = {
        temperature: 0.7,
      };

      const callOverride: Partial<AiGenerationConfigDto> = {
        temperature: 0, // Valid deterministic temperature
      };

      const resolved = AiConfigurationResolver.resolve({
        callOverride,
        taskDefinitionConfig: taskDefaults,
      });

      assert.strictEqual(resolved.temperature, 0);
    });

    it('preserves valid zero (0) for topP using nullish coalescing', () => {
      const resolved = AiConfigurationResolver.resolve({
        callOverride: { topP: 0 },
      });

      assert.strictEqual(resolved.topP, 0);
    });
  });

  describe('Validation Rules & Boundary Enforcement', () => {
    it('rejects empty or whitespace provider ID', () => {
      assert.throws(
        () => AiConfigurationResolver.resolve({ callOverride: { providerId: '   ' } }),
        (err: unknown) =>
          err instanceof AiConfigurationInvalidError && err.code === 'CONFIGURATION_INVALID',
      );
    });

    it('rejects empty or whitespace model name', () => {
      assert.throws(
        () => AiConfigurationResolver.resolve({ callOverride: { model: '' } }),
        (err: unknown) => err instanceof AiConfigurationInvalidError,
      );
    });

    it('rejects temperature below 0.0 or above 2.0', () => {
      assert.throws(
        () => AiConfigurationResolver.resolve({ callOverride: { temperature: -0.1 } }),
        (err: unknown) => err instanceof AiConfigurationInvalidError,
      );

      assert.throws(
        () => AiConfigurationResolver.resolve({ callOverride: { temperature: 2.1 } }),
        (err: unknown) => err instanceof AiConfigurationInvalidError,
      );
    });

    it('rejects NaN or Infinity temperature values', () => {
      assert.throws(
        () => AiConfigurationResolver.resolve({ callOverride: { temperature: NaN } }),
        (err: unknown) => err instanceof AiConfigurationInvalidError,
      );

      assert.throws(
        () => AiConfigurationResolver.resolve({ callOverride: { temperature: Infinity } }),
        (err: unknown) => err instanceof AiConfigurationInvalidError,
      );
    });

    it('rejects topP outside [0, 1] range', () => {
      assert.throws(
        () => AiConfigurationResolver.resolve({ callOverride: { topP: -0.01 } }),
        (err: unknown) => err instanceof AiConfigurationInvalidError,
      );

      assert.throws(
        () => AiConfigurationResolver.resolve({ callOverride: { topP: 1.05 } }),
        (err: unknown) => err instanceof AiConfigurationInvalidError,
      );
    });

    it('rejects non-integer or out-of-range maxOutputTokens', () => {
      assert.throws(
        () => AiConfigurationResolver.resolve({ callOverride: { maxOutputTokens: 0 } }),
        (err: unknown) => err instanceof AiConfigurationInvalidError,
      );

      assert.throws(
        () => AiConfigurationResolver.resolve({ callOverride: { maxOutputTokens: 50_000 } }),
        (err: unknown) => err instanceof AiConfigurationInvalidError,
      );

      assert.throws(
        () => AiConfigurationResolver.resolve({ callOverride: { maxOutputTokens: 100.5 } }),
        (err: unknown) => err instanceof AiConfigurationInvalidError,
      );
    });

    it('rejects timeout below min (1000ms) or above max (300000ms)', () => {
      assert.throws(
        () => AiConfigurationResolver.resolve({ callOverride: { timeoutMs: 500 } }),
        (err: unknown) => err instanceof AiConfigurationInvalidError,
      );

      assert.throws(
        () => AiConfigurationResolver.resolve({ callOverride: { timeoutMs: 400_000 } }),
        (err: unknown) => err instanceof AiConfigurationInvalidError,
      );
    });

    it('rejects invalid structured output mode', () => {
      assert.throws(
        () =>
          AiConfigurationResolver.resolve({
            callOverride: { structuredOutputMode: 'INVALID_MODE' as any },
          }),
        (err: unknown) => err instanceof AiConfigurationInvalidError,
      );
    });
  });

  describe('Snapshot Management', () => {
    it('produces an immutable snapshot without secret credentials or mutable state', () => {
      const config: AiGenerationConfigDto = {
        providerId: 'OPENAI',
        model: 'gpt-4o',
        temperature: 0.1,
        topP: 0.95,
        maxOutputTokens: 2048,
        timeoutMs: 15000,
        structuredOutputMode: 'NATIVE_JSON',
        providerOptions: { customHeader: 'test' },
      };

      const snapshot = AiConfigurationResolver.toSnapshot(config);

      assert.equal(snapshot.providerId, 'OPENAI');
      assert.equal(snapshot.model, 'gpt-4o');
      assert.equal(snapshot.temperature, 0.1);
      assert.equal(snapshot.topP, 0.95);
      assert.equal(snapshot.maxOutputTokens, 2048);
      assert.equal(snapshot.timeoutMs, 15000);
      assert.equal(snapshot.structuredOutputMode, 'NATIVE_JSON');
      assert.ok(Object.isFrozen(snapshot));

      // Ensure providerOptions or any potential secret headers are excluded from snapshot
      assert.strictEqual((snapshot as any).providerOptions, undefined);
      assert.strictEqual((snapshot as any).apiKey, undefined);
    });
  });

  describe('Prototype Pollution Protection', () => {
    it('detects and rejects __proto__ injection in configuration resolution', () => {
      const malicious = JSON.parse('{"__proto__": {"polluted": true}, "temperature": 0.5}');

      assert.throws(
        () => AiConfigurationResolver.resolve({ callOverride: malicious }),
        (err: unknown) => err instanceof AiConfigurationInvalidError,
      );
    });
  });
});
