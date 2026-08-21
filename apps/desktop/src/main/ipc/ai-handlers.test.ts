/**
 * @file apps/desktop/src/main/ipc/ai-handlers.test.ts
 * Unit tests for AI IPC handlers and validation boundary.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleGetAiProviderStatus,
  handleAiHealthCheck,
  handleAiGenerate,
  handleGetAiConfigDefaults,
  handleAiExecutePrompt,
  setAiProviderGatewayForTest,
  setAiPromptExecutionServiceForTest,
} from './ai-handlers.js';
import {
  AiProviderGateway,
  AiProviderRegistry,
  FakeAiProvider,
  AiPromptExecutionService,
  PromptRegistry,
  AiInvalidRequestError,
} from '@ai-quality/core';

describe('AI IPC Handlers Unit Tests', () => {
  let fakeProvider: FakeAiProvider;
  let gateway: AiProviderGateway;

  beforeEach(() => {
    fakeProvider = new FakeAiProvider({
      defaultResponse: 'IPC fake AI completion.',
    });
    const registry = new AiProviderRegistry([fakeProvider]);
    gateway = new AiProviderGateway({ registry });
    setAiProviderGatewayForTest(gateway);
  });

  afterEach(() => {
    setAiProviderGatewayForTest(null);
    setAiPromptExecutionServiceForTest(null);
  });

  describe('handleGetAiProviderStatus', () => {
    it('returns all provider statuses when no input is given', async () => {
      const statuses = await handleGetAiProviderStatus(undefined, gateway);
      assert.equal(statuses.length, 1);
      assert.equal(statuses[0]?.providerId, 'FAKE');
      assert.equal(statuses[0]?.status, 'READY');
    });

    it('returns specific provider status when providerId is supplied', async () => {
      const statuses = await handleGetAiProviderStatus({ providerId: 'FAKE' }, gateway);
      assert.equal(statuses.length, 1);
      assert.equal(statuses[0]?.providerId, 'FAKE');
    });
  });

  describe('handleAiHealthCheck', () => {
    it('executes health check for valid providerId', async () => {
      const status = await handleAiHealthCheck({ providerId: 'FAKE' }, gateway);
      assert.equal(status.providerId, 'FAKE');
      assert.equal(status.status, 'READY');
    });

    it('rejects invalid health check payload', async () => {
      await assert.rejects(
        () => handleAiHealthCheck({ providerId: '' }, gateway),
        AiInvalidRequestError,
      );
    });
  });

  describe('handleAiGenerate', () => {
    it('processes valid generation requests and returns structured result', async () => {
      const result = await handleAiGenerate(
        {
          providerId: 'FAKE',
          model: 'fake-model-v1',
          messages: [{ role: 'USER', content: 'Generate test scenario.' }],
        },
        gateway,
      );

      assert.equal(result.providerId, 'FAKE');
      assert.equal(result.text, 'IPC fake AI completion.');
      assert(result.usage.totalTokens !== null && result.usage.totalTokens > 0);
    });

    it('rejects generation requests with empty messages', async () => {
      await assert.rejects(
        () =>
          handleAiGenerate(
            {
              providerId: 'FAKE',
              model: 'fake-model-v1',
              messages: [],
            },
            gateway,
          ),
        AiInvalidRequestError,
      );
    });
  });

  describe('handleGetAiConfigDefaults', () => {
    it('returns default generation configuration', async () => {
      const defaults = await handleGetAiConfigDefaults();
      assert.equal(defaults.providerId, 'OPENAI');
      assert.equal(defaults.model, 'gpt-4o-mini');
      assert.equal(defaults.temperature, 0.2);
      assert.equal(defaults.maxOutputTokens, 4096);
    });
  });

  describe('handleAiExecutePrompt', () => {
    it('executes prompt through IPC handler and returns typed structured result', async () => {
      const healthPayload = JSON.stringify({
        status: 'HEALTHY',
        latencyMs: 30,
        notes: 'IPC prompt execution OK',
      });
      fakeProvider.setOptions({ defaultResponse: healthPayload });

      const service = new AiPromptExecutionService({
        registry: PromptRegistry.createDefault(),
        gateway,
      });
      setAiPromptExecutionServiceForTest(service);

      const result = await handleAiExecutePrompt(
        {
          promptId: 'fixture.system.health',
          version: 1,
          input: { checkTarget: 'ipc-service' },
          configOverride: { providerId: 'FAKE' },
        },
        service,
      );

      assert.equal(result.promptId, 'fixture.system.health');
      assert.equal(result.promptVersion, 1);
      assert.equal((result.data as any).status, 'HEALTHY');
      assert.equal((result.data as any).latencyMs, 30);
    });

    it('rejects invalid prompt execution input payload via Zod validation', async () => {
      await assert.rejects(() => handleAiExecutePrompt({ promptId: '' }), AiInvalidRequestError);
    });
  });
});
