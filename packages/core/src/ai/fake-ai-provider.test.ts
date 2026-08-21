/**
 * @file packages/core/src/ai/fake-ai-provider.test.ts
 * Unit tests for the deterministic FakeAiProvider test harness.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FakeAiProvider } from './fake-ai-provider.js';
import {
  AiAuthenticationError,
  AiRateLimitError,
  AiTimeoutError,
  AiCancelledError,
  AiProviderUnavailableError,
  AiNetworkError,
  AiInvalidProviderResponseError,
} from './ai-errors.js';

describe('FakeAiProvider', () => {
  it('returns valid capabilities descriptor', () => {
    const provider = new FakeAiProvider();
    const caps = provider.getCapabilities();

    assert.equal(caps.textGeneration, true);
    assert.equal(caps.systemMessages, true);
    assert.equal(caps.tokenUsageReporting, true);
    assert.equal(caps.cancellation, true);
    assert.equal(caps.defaultModel, 'fake-model-v1');
    assert(caps.supportedModels.includes('fake-model-v1'));
  });

  it('reports READY health status when configured', async () => {
    const provider = new FakeAiProvider();
    const status = await provider.healthCheck();

    assert.equal(status.providerId, 'FAKE');
    assert.equal(status.configured, true);
    assert.equal(status.status, 'READY');
    assert(status.verifiedAt !== undefined);
  });

  it('reports NOT_CONFIGURED health status when unconfigured', async () => {
    const provider = new FakeAiProvider({ isConfigured: false });
    const status = await provider.healthCheck();

    assert.equal(status.providerId, 'FAKE');
    assert.equal(status.configured, false);
    assert.equal(status.status, 'NOT_CONFIGURED');
  });

  it('generates deterministic completions and calculates token usage', async () => {
    const provider = new FakeAiProvider({
      defaultResponse: 'Test generated response 123.',
    });

    const result = await provider.generate({
      providerId: 'FAKE',
      model: 'fake-model-v1',
      messages: [
        { role: 'SYSTEM', content: 'You are a test system.' },
        { role: 'USER', content: 'Hello fake AI!' },
      ],
    });

    assert.equal(result.providerId, 'FAKE');
    assert.equal(result.text, 'Test generated response 123.');
    assert.equal(result.finishReason, 'stop');
    assert(result.usage.inputTokens !== null && result.usage.inputTokens > 0);
    assert(result.usage.outputTokens !== null && result.usage.outputTokens > 0);
    assert.equal(result.usage.totalTokens, result.usage.inputTokens! + result.usage.outputTokens!);
    assert.equal(provider.callCount, 1);
  });

  it('simulates error conditions accurately', async () => {
    const errorConfigs = [
      { simulateError: 'AUTHENTICATION_FAILED' as const, expectedClass: AiAuthenticationError },
      { simulateError: 'RATE_LIMITED' as const, expectedClass: AiRateLimitError },
      { simulateError: 'TIMEOUT' as const, expectedClass: AiTimeoutError },
      { simulateError: 'CANCELLED' as const, expectedClass: AiCancelledError },
      { simulateError: 'PROVIDER_UNAVAILABLE' as const, expectedClass: AiProviderUnavailableError },
      { simulateError: 'NETWORK_ERROR' as const, expectedClass: AiNetworkError },
      {
        simulateError: 'INVALID_PROVIDER_RESPONSE' as const,
        expectedClass: AiInvalidProviderResponseError,
      },
    ];

    for (const { simulateError, expectedClass } of errorConfigs) {
      const provider = new FakeAiProvider({ simulateError });
      await assert.rejects(
        () =>
          provider.generate({
            providerId: 'FAKE',
            model: 'fake-model-v1',
            messages: [{ role: 'USER', content: 'test' }],
          }),
        expectedClass,
        `Expected ${simulateError} to throw ${expectedClass.name}`,
      );
    }
  });

  it('simulates transient failures and succeeds on subsequent attempts', async () => {
    const provider = new FakeAiProvider({
      transientFailureCount: 2,
      defaultResponse: 'Success after retries',
    });

    // Attempt 1 fails
    await assert.rejects(
      () =>
        provider.generate({
          providerId: 'FAKE',
          model: 'fake-model-v1',
          messages: [{ role: 'USER', content: 'attempt 1' }],
        }),
      AiNetworkError,
    );

    // Attempt 2 fails
    await assert.rejects(
      () =>
        provider.generate({
          providerId: 'FAKE',
          model: 'fake-model-v1',
          messages: [{ role: 'USER', content: 'attempt 2' }],
        }),
      AiNetworkError,
    );

    // Attempt 3 succeeds
    const result = await provider.generate({
      providerId: 'FAKE',
      model: 'fake-model-v1',
      messages: [{ role: 'USER', content: 'attempt 3' }],
    });

    assert.equal(result.text, 'Success after retries');
  });

  it('respects AbortSignal cancellation during simulated delay', async () => {
    const provider = new FakeAiProvider({ delayMs: 2000 });
    const controller = new AbortController();

    const generatePromise = provider.generate(
      {
        providerId: 'FAKE',
        model: 'fake-model-v1',
        messages: [{ role: 'USER', content: 'slow request' }],
      },
      controller.signal,
    );

    setTimeout(() => controller.abort(), 50);

    await assert.rejects(
      () => generatePromise,
      (err: unknown) => {
        assert(err instanceof AiCancelledError);
        return true;
      },
    );
  });
});
