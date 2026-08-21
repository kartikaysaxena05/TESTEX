/**
 * @file packages/core/src/ai/ai-provider-registry.test.ts
 * Unit tests for the AI Provider Registry.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AiProviderRegistry } from './ai-provider-registry.js';
import { FakeAiProvider } from './fake-ai-provider.js';
import { AiInvalidRequestError } from './ai-errors.js';

describe('AiProviderRegistry', () => {
  it('registers and resolves providers case-insensitively', () => {
    const registry = new AiProviderRegistry();
    const fakeProvider = new FakeAiProvider();
    registry.register(fakeProvider);

    assert.equal(registry.has('FAKE'), true);
    assert.equal(registry.has('fake'), true);
    assert.equal(registry.get('FAKE'), fakeProvider);
    assert.equal(registry.get('fake'), fakeProvider);
    assert.deepEqual(registry.listProviders(), ['FAKE']);
  });

  it('unregisters providers correctly', () => {
    const registry = new AiProviderRegistry();
    const fakeProvider = new FakeAiProvider();
    registry.register(fakeProvider);

    assert.equal(registry.has('FAKE'), true);
    const deleted = registry.unregister('FAKE');
    assert.equal(deleted, true);
    assert.equal(registry.has('FAKE'), false);
    assert.equal(registry.listProviders().length, 0);
  });

  it('throws AiInvalidRequestError when requesting an unknown provider', () => {
    const registry = new AiProviderRegistry();
    assert.throws(
      () => registry.get('UNKNOWN_PROVIDER'),
      (err: unknown) => {
        assert(err instanceof AiInvalidRequestError);
        assert.equal(err.code, 'INVALID_REQUEST');
        assert(err.message.includes('Unknown AI provider'));
        return true;
      },
    );
  });

  it('retrieves statuses for all registered providers concurrently', async () => {
    const fake1 = new FakeAiProvider({ isConfigured: true });
    const fake2 = new FakeAiProvider({ isConfigured: false });
    // Override id for testing multiple
    Object.defineProperty(fake2, 'id', { value: 'FAKE_SECONDARY' });

    const registry = new AiProviderRegistry([fake1, fake2]);
    const statuses = await registry.getAllStatuses();

    assert.equal(statuses.length, 2);
    assert.equal(statuses[0]?.providerId, 'FAKE');
    assert.equal(statuses[0]?.status, 'READY');
    assert.equal(statuses[1]?.providerId, 'FAKE_SECONDARY');
    assert.equal(statuses[1]?.status, 'NOT_CONFIGURED');
  });

  it('creates default registry with OPENAI and FAKE providers', () => {
    const registry = AiProviderRegistry.createDefault();
    assert.equal(registry.has('OPENAI'), true);
    assert.equal(registry.has('FAKE'), true);
  });
});
