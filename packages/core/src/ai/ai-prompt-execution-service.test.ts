/**
 * @file packages/core/src/ai/ai-prompt-execution-service.test.ts
 * Integration and unit tests for the central AiPromptExecutionService pipeline.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AiPromptExecutionService } from './ai-prompt-execution-service.js';
import { PromptRegistry } from './prompt-registry.js';
import { AiProviderRegistry } from './ai-provider-registry.js';
import { AiProviderGateway } from './ai-provider-gateway.js';
import { FakeAiProvider } from './fake-ai-provider.js';
import {
  AiPromptInputInvalidError,
  AiStructuredOutputSchemaError,
  AiCancelledError,
  AiTimeoutError,
} from './ai-errors.js';
import type { AiProvider } from './ai-provider-contract.js';

describe('AiPromptExecutionService', () => {
  function createTestSetup(fakeResponse?: string) {
    const fakeProvider = new FakeAiProvider({
      defaultResponse:
        fakeResponse ??
        JSON.stringify({
          status: 'HEALTHY',
          latencyMs: 42,
          notes: 'All systems green',
        }),
    });

    const providerRegistry = new AiProviderRegistry([fakeProvider]);
    const gateway = new AiProviderGateway({ registry: providerRegistry });
    const promptRegistry = PromptRegistry.createDefault();

    const service = new AiPromptExecutionService({
      registry: promptRegistry,
      gateway,
    });

    return { service, fakeProvider, promptRegistry, gateway };
  }

  describe('End-to-End Prompt Execution', () => {
    it('executes foundation health check prompt and returns typed structured result', async () => {
      const { service } = createTestSetup();

      const result = await service.executePrompt<
        { checkTarget: string },
        { status: string; latencyMs: number }
      >({
        promptId: 'fixture.system.health',
        version: 1,
        input: { checkTarget: 'auth-service' },
        configOverride: { providerId: 'FAKE', model: 'fake-model-v1', temperature: 0 },
      });

      assert.equal(result.promptId, 'fixture.system.health');
      assert.equal(result.promptVersion, 1);
      assert.equal(result.providerId, 'FAKE');
      assert.equal(result.modelRequested, 'fake-model-v1');
      assert.equal(result.data.status, 'HEALTHY');
      assert.equal(result.data.latencyMs, 42);

      // Provenance snapshot verification
      assert.ok(result.configSnapshot);
      assert.equal(result.configSnapshot.temperature, 0);
      assert.equal(result.configSnapshot.providerId, 'FAKE');
      assert.ok(result.durationMs >= 0);
      assert.ok(result.usage.totalTokens! > 0);
      assert.ok(result.requestId);
    });

    it('rejects invalid input variables before invoking LLM gateway', async () => {
      const { service, fakeProvider } = createTestSetup();

      await assert.rejects(
        async () => {
          await service.executePrompt({
            promptId: 'fixture.system.health',
            version: 1,
            input: { checkTarget: '' }, // Min length is 1
            configOverride: { providerId: 'FAKE' },
          });
        },
        (err: unknown) =>
          err instanceof AiPromptInputInvalidError &&
          err.promptId === 'fixture.system.health' &&
          err.version === 1,
      );

      // Gateway was never called
      assert.equal(fakeProvider.callCount, 0);
    });

    it('propagates provider timeout correctly', async () => {
      const { service, fakeProvider } = createTestSetup();
      fakeProvider.setOptions({ simulateError: 'TIMEOUT' });

      await assert.rejects(
        async () => {
          await service.executePrompt({
            promptId: 'fixture.system.health',
            version: 1,
            input: { checkTarget: 'payment-service' },
            configOverride: { providerId: 'FAKE', timeoutMs: 1000 },
          });
        },
        (err: unknown) => err instanceof AiTimeoutError,
      );
    });

    it('propagates caller AbortSignal cancellation', async () => {
      const { service, fakeProvider } = createTestSetup();
      fakeProvider.setOptions({ delayMs: 500 });

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 20);

      await assert.rejects(
        async () => {
          await service.executePrompt({
            promptId: 'fixture.system.health',
            version: 1,
            input: { checkTarget: 'billing' },
            configOverride: { providerId: 'FAKE' },
            signal: controller.signal,
          });
        },
        (err: unknown) => err instanceof AiCancelledError,
      );
    });
  });

  describe('Bounded Structured Output Retries', () => {
    it('executes bounded retry when provider returns invalid schema and succeeds on second attempt', async () => {
      const invalidJson = JSON.stringify({ wrongField: 123 });
      const validJson = JSON.stringify({
        status: 'HEALTHY',
        latencyMs: 15,
      });

      const fakeProvider = new FakeAiProvider({ defaultResponse: invalidJson });
      const providerRegistry = new AiProviderRegistry([fakeProvider]);
      const gateway = new AiProviderGateway({ registry: providerRegistry });
      const promptRegistry = PromptRegistry.createDefault();

      const service = new AiPromptExecutionService({
        registry: promptRegistry,
        gateway,
        maxStructuredRetries: 1,
      });

      // After first call fails parsing, dynamically switch provider response to valid
      let calls = 0;
      const originalGenerate = fakeProvider.generate.bind(fakeProvider);
      fakeProvider.generate = async (req, signal) => {
        calls++;
        if (calls > 1) {
          fakeProvider.setOptions({ defaultResponse: validJson });
        }
        return originalGenerate(req, signal);
      };

      const result = await service.executePrompt<
        { checkTarget: string },
        { status: string; latencyMs: number }
      >({
        promptId: 'fixture.system.health',
        version: 1,
        input: { checkTarget: 'auth-service' },
        configOverride: { providerId: 'FAKE' },
      });

      assert.equal(result.data.status, 'HEALTHY');
      assert.equal(result.retryCount, 1);
      assert.equal(calls, 2);
    });

    it('throws AiStructuredOutputSchemaError when retry budget is exhausted', async () => {
      const invalidJson = JSON.stringify({ status: 'INVALID_STATUS' });
      const { service } = createTestSetup(invalidJson);

      await assert.rejects(
        async () => {
          await service.executePrompt({
            promptId: 'fixture.system.health',
            version: 1,
            input: { checkTarget: 'auth-service' },
            configOverride: { providerId: 'FAKE' },
          });
        },
        (err: unknown) => err instanceof AiStructuredOutputSchemaError,
      );
    });
  });

  describe('Provider Independence', () => {
    it('executes seamlessly with any adapter conforming to the AiProvider interface', async () => {
      const mockCustomProvider: AiProvider = {
        id: 'CUSTOM_ADAPTER' as any,
        getCapabilities: () => ({
          textGeneration: true,
          systemMessages: true,
          tokenUsageReporting: true,
          cancellation: true,
          defaultModel: 'custom-model-v1',
          supportedModels: ['custom-model-v1'],
        }),
        healthCheck: async () => ({
          providerId: 'CUSTOM_ADAPTER' as any,
          configured: true,
          status: 'READY',
          capabilities: {
            textGeneration: true,
            systemMessages: true,
            tokenUsageReporting: true,
            cancellation: true,
            defaultModel: 'custom-model-v1',
            supportedModels: ['custom-model-v1'],
          },
        }),
        generate: async request => ({
          requestId: request.requestId ?? 'custom-req',
          providerId: 'CUSTOM_ADAPTER' as any,
          modelRequested: request.model,
          modelReported: 'custom-model-v1',
          text: JSON.stringify({ status: 'HEALTHY', latencyMs: 5 }),
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          providerRequestId: 'custom-pid',
          durationMs: 10,
          retryCount: 0,
        }),
      };

      const providerRegistry = new AiProviderRegistry([mockCustomProvider]);
      const gateway = new AiProviderGateway({ registry: providerRegistry });
      const promptRegistry = PromptRegistry.createDefault();

      const service = new AiPromptExecutionService({
        registry: promptRegistry,
        gateway,
      });

      const result = await service.executePrompt<
        { checkTarget: string },
        { status: string; latencyMs: number }
      >({
        promptId: 'fixture.system.health',
        version: 1,
        input: { checkTarget: 'custom-system' },
        configOverride: { providerId: 'CUSTOM_ADAPTER' as any, model: 'custom-model-v1' },
      });

      assert.equal(result.providerId, 'CUSTOM_ADAPTER');
      assert.equal(result.data.status, 'HEALTHY');
      assert.equal(result.data.latencyMs, 5);
    });
  });

  describe('Concurrency & Isolation', () => {
    it('handles concurrent prompt executions with different overrides without state leakage', async () => {
      const { service } = createTestSetup();

      const tasks = Array.from({ length: 10 }, (_, i) =>
        service.executePrompt<{ checkTarget: string }, { status: string; latencyMs: number }>({
          promptId: 'fixture.system.health',
          version: 1,
          input: { checkTarget: `service-${i}` },
          configOverride: {
            providerId: 'FAKE',
            temperature: Number((0.1 * (i % 5)).toFixed(2)),
          },
        }),
      );

      const results = await Promise.all(tasks);

      assert.equal(results.length, 10);
      for (let i = 0; i < results.length; i++) {
        const expectedTemp = Number((0.1 * (i % 5)).toFixed(2));
        assert.equal(results[i]?.configSnapshot.temperature, expectedTemp);
      }
    });
  });
});
