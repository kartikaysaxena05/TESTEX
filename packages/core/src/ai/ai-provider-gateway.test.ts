/**
 * @file packages/core/src/ai/ai-provider-gateway.test.ts
 * Unit tests for the central AiProviderGateway.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AiProviderGateway } from './ai-provider-gateway.js';
import { AiProviderRegistry } from './ai-provider-registry.js';
import { FakeAiProvider } from './fake-ai-provider.js';
import {
  AiInvalidRequestError,
  AiTimeoutError,
  AiCancelledError,
  AiAuthenticationError,
  AiNetworkError,
} from './ai-errors.js';

describe('AiProviderGateway', () => {
  function createTestGateway(
    fakeOptions: ConstructorParameters<typeof FakeAiProvider>[0] = {},
    retryOptions = {},
  ) {
    const fakeProvider = new FakeAiProvider(fakeOptions);
    const registry = new AiProviderRegistry([fakeProvider]);
    const gateway = new AiProviderGateway({
      registry,
      retryPolicy: {
        maxRetries: 2,
        initialDelayMs: 10,
        backoffMultiplier: 1.5,
        retryableErrorCodes: ['NETWORK_ERROR', 'PROVIDER_UNAVAILABLE', 'RATE_LIMITED'],
        ...retryOptions,
      },
    });
    return { gateway, fakeProvider };
  }

  describe('Input Validation', () => {
    it('rejects empty provider ID', async () => {
      const { gateway } = createTestGateway();
      await assert.rejects(
        () =>
          gateway.generate({
            providerId: '' as unknown as 'FAKE',
            model: 'test-model',
            messages: [{ role: 'USER', content: 'test' }],
          }),
        AiInvalidRequestError,
      );
    });

    it('rejects empty model name', async () => {
      const { gateway } = createTestGateway();
      await assert.rejects(
        () =>
          gateway.generate({
            providerId: 'FAKE',
            model: '',
            messages: [{ role: 'USER', content: 'test' }],
          }),
        AiInvalidRequestError,
      );
    });

    it('rejects empty messages list', async () => {
      const { gateway } = createTestGateway();
      await assert.rejects(
        () =>
          gateway.generate({
            providerId: 'FAKE',
            model: 'test-model',
            messages: [],
          }),
        AiInvalidRequestError,
      );
    });

    it('rejects invalid message role', async () => {
      const { gateway } = createTestGateway();
      await assert.rejects(
        () =>
          gateway.generate({
            providerId: 'FAKE',
            model: 'test-model',
            messages: [{ role: 'INVALID_ROLE' as unknown as 'USER', content: 'test' }],
          }),
        AiInvalidRequestError,
      );
    });

    it('rejects message exceeding single-message character limit', async () => {
      const { gateway } = createTestGateway();
      const hugeMessage = 'a'.repeat(100_001);
      await assert.rejects(
        () =>
          gateway.generate({
            providerId: 'FAKE',
            model: 'test-model',
            messages: [{ role: 'USER', content: hugeMessage }],
          }),
        AiInvalidRequestError,
      );
    });

    it('rejects total prompt exceeding payload character limit', async () => {
      const { gateway } = createTestGateway();
      // 6 messages of 90,000 chars = 540,000 chars > 500,000 max
      const messages = Array.from({ length: 6 }, () => ({
        role: 'USER' as const,
        content: 'b'.repeat(90_000),
      }));
      await assert.rejects(
        () =>
          gateway.generate({
            providerId: 'FAKE',
            model: 'test-model',
            messages,
          }),
        AiInvalidRequestError,
      );
    });

    it('rejects invalid temperature or maxTokens', async () => {
      const { gateway } = createTestGateway();
      await assert.rejects(
        () =>
          gateway.generate({
            providerId: 'FAKE',
            model: 'test-model',
            temperature: 2.5,
            messages: [{ role: 'USER', content: 'test' }],
          }),
        AiInvalidRequestError,
      );

      await assert.rejects(
        () =>
          gateway.generate({
            providerId: 'FAKE',
            model: 'test-model',
            maxTokens: 50_000,
            messages: [{ role: 'USER', content: 'test' }],
          }),
        AiInvalidRequestError,
      );
    });
  });

  describe('Correlation and Execution', () => {
    it('assigns a unique requestId if none is provided', async () => {
      const { gateway } = createTestGateway();
      const result = await gateway.generate({
        providerId: 'FAKE',
        model: 'fake-model-v1',
        messages: [{ role: 'USER', content: 'hello' }],
      });

      assert(typeof result.requestId === 'string' && result.requestId.length > 0);
      assert.equal(result.providerId, 'FAKE');
      assert.equal(result.retryCount, 0);
    });

    it('preserves an existing requestId if provided', async () => {
      const { gateway } = createTestGateway();
      const customId = 'custom-req-id-12345';
      const result = await gateway.generate({
        requestId: customId,
        providerId: 'FAKE',
        model: 'fake-model-v1',
        messages: [{ role: 'USER', content: 'hello' }],
      });

      assert.equal(result.requestId, customId);
    });
  });

  describe('Timeouts and Cancellation', () => {
    it('aborts and throws AiTimeoutError when provider exceeds timeoutMs', async () => {
      const { gateway } = createTestGateway({ delayMs: 2000 });

      await assert.rejects(
        () =>
          gateway.generate({
            providerId: 'FAKE',
            model: 'fake-model-v1',
            timeoutMs: 1000,
            messages: [{ role: 'USER', content: 'slow request' }],
          }),
        (err: unknown) => {
          assert(err instanceof AiTimeoutError);
          assert.equal(err.code, 'TIMEOUT');
          return true;
        },
      );
    });

    it('propagates caller cancellation via external AbortSignal', async () => {
      const { gateway } = createTestGateway({ delayMs: 1000 });
      const controller = new AbortController();

      const promise = gateway.generate(
        {
          providerId: 'FAKE',
          model: 'fake-model-v1',
          messages: [{ role: 'USER', content: 'cancel me' }],
        },
        controller.signal,
      );

      setTimeout(() => controller.abort(), 20);

      await assert.rejects(
        () => promise,
        (err: unknown) => {
          assert(err instanceof AiCancelledError);
          assert.equal(err.code, 'CANCELLED');
          return true;
        },
      );
    });
  });

  describe('Bounded Retry Policy', () => {
    it('retries transient failures and returns success after transient error resolves', async () => {
      const { gateway, fakeProvider } = createTestGateway({
        transientFailureCount: 2,
        defaultResponse: 'Recovered after 2 retries',
      });

      const result = await gateway.generate({
        providerId: 'FAKE',
        model: 'fake-model-v1',
        messages: [{ role: 'USER', content: 'retry test' }],
      });

      assert.equal(result.text, 'Recovered after 2 retries');
      assert.equal(result.retryCount, 2);
      assert.equal(fakeProvider.callCount, 3); // initial attempt + 2 retries
    });

    it('does not retry permanent errors (e.g. AUTHENTICATION_FAILED)', async () => {
      const { gateway, fakeProvider } = createTestGateway({
        simulateError: 'AUTHENTICATION_FAILED',
      });

      await assert.rejects(
        () =>
          gateway.generate({
            providerId: 'FAKE',
            model: 'fake-model-v1',
            messages: [{ role: 'USER', content: 'auth fail' }],
          }),
        AiAuthenticationError,
      );

      assert.equal(fakeProvider.callCount, 1); // exactly 1 attempt, zero retries
    });

    it('throws the transient error when retry budget is exhausted', async () => {
      const { gateway, fakeProvider } = createTestGateway({
        transientFailureCount: 5, // exceeds maxRetries (2)
      });

      await assert.rejects(
        () =>
          gateway.generate({
            providerId: 'FAKE',
            model: 'fake-model-v1',
            messages: [{ role: 'USER', content: 'exhaust retries' }],
          }),
        AiNetworkError,
      );

      assert.equal(fakeProvider.callCount, 3); // initial attempt + 2 retries = 3 calls
    });
  });

  describe('Concurrency & Isolation', () => {
    it('handles multiple concurrent requests without race conditions', async () => {
      const { gateway } = createTestGateway({ delayMs: 10 });

      const promises = Array.from({ length: 10 }, (_, i) =>
        gateway.generate({
          requestId: `concurrent-req-${i}`,
          providerId: 'FAKE',
          model: 'fake-model-v1',
          messages: [{ role: 'USER', content: `Message ${i}` }],
        }),
      );

      const results = await Promise.all(promises);
      assert.equal(results.length, 10);
      for (let i = 0; i < 10; i++) {
        assert.equal(results[i]?.requestId, `concurrent-req-${i}`);
      }
    });
  });
});
