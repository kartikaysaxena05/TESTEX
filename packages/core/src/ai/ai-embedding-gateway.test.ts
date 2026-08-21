/**
 * @file packages/core/src/ai/ai-embedding-gateway.test.ts
 * Unit & integration tests for embedding capabilities on the AI Provider Gateway.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AiProviderGateway } from './ai-provider-gateway.js';
import { AiProviderRegistry } from './ai-provider-registry.js';
import { FakeAiProvider } from './fake-ai-provider.js';
import { AiEmbeddingInvalidInputError, AiCancelledError, AiRateLimitError } from './ai-errors.js';

describe('AiProviderGateway Embedding Capability', () => {
  let fakeProvider: FakeAiProvider;
  let registry: AiProviderRegistry;
  let gateway: AiProviderGateway;

  beforeEach(() => {
    fakeProvider = new FakeAiProvider();
    registry = new AiProviderRegistry([fakeProvider]);
    gateway = new AiProviderGateway({ registry });
  });

  it('generates deterministic vector embeddings via FakeAiProvider', async () => {
    const result = await gateway.embed({
      inputs: ['First requirement test', 'Second requirement test'],
      providerId: 'FAKE',
      model: 'fake-embedding-v1',
      dimensions: 1536,
    });

    assert.strictEqual(result.providerId, 'FAKE');
    assert.strictEqual(result.modelReported, 'fake-embedding-v1');
    assert.strictEqual(result.embeddings.length, 2);
    assert.strictEqual(result.embeddings[0]!.length, 1536);
    assert.strictEqual(result.embeddings[1]!.length, 1536);

    // Verify determinism: same input generates identical vector
    const secondCall = await gateway.embed({
      inputs: ['First requirement test'],
      providerId: 'FAKE',
      model: 'fake-embedding-v1',
      dimensions: 1536,
    });

    assert.deepStrictEqual(secondCall.embeddings[0], result.embeddings[0]);
  });

  it('rejects empty input list', async () => {
    await assert.rejects(
      async () =>
        gateway.embed({
          inputs: [],
          providerId: 'FAKE',
        }),
      AiEmbeddingInvalidInputError,
    );
  });

  it('rejects empty or whitespace input strings', async () => {
    await assert.rejects(
      async () =>
        gateway.embed({
          inputs: ['valid text', '   '],
          providerId: 'FAKE',
        }),
      AiEmbeddingInvalidInputError,
    );
  });

  it('rejects batch size exceeding limit', async () => {
    const hugeInputs = new Array(101).fill('Sample input text');
    await assert.rejects(
      async () =>
        gateway.embed({
          inputs: hugeInputs,
          providerId: 'FAKE',
        }),
      AiEmbeddingInvalidInputError,
    );
  });

  it('handles cancellation correctly', async () => {
    const controller = new AbortController();
    fakeProvider.setOptions({ delayMs: 100 });
    controller.abort();

    await assert.rejects(
      async () =>
        gateway.embed(
          {
            inputs: ['Should be aborted'],
            providerId: 'FAKE',
          },
          controller.signal,
        ),
      AiCancelledError,
    );
  });

  it('retries transient embedding failures up to max retries', async () => {
    fakeProvider.setOptions({
      transientFailureCount: 2,
    });

    const result = await gateway.embed({
      inputs: ['Transient failure retry test'],
      providerId: 'FAKE',
    });

    assert.strictEqual(result.embeddings.length, 1);
  });

  it('fails when permanent rate limit error is simulated', async () => {
    fakeProvider.setOptions({
      simulateError: 'RATE_LIMITED',
    });

    await assert.rejects(
      async () =>
        gateway.embed({
          inputs: ['Permanent error test'],
          providerId: 'FAKE',
        }),
      AiRateLimitError,
    );
  });
});
