/**
 * @file packages/core/src/ai/ai-security.test.ts
 * Security and secret confidentiality tests for the AI Provider Gateway.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AiProviderGateway } from './ai-provider-gateway.js';
import { AiProviderRegistry } from './ai-provider-registry.js';
import { OpenAiProviderAdapter } from './openai-provider-adapter.js';
import { FakeAiProvider } from './fake-ai-provider.js';
import { AiInvalidRequestError } from './ai-errors.js';

describe('AI Security Boundaries', () => {
  it('never leaks secret API keys in health check status or metadata', async () => {
    const sensitiveKey = 'sk-proj-SUPER_SECRET_KEY_12345_NEVER_LEAK';
    const adapter = new OpenAiProviderAdapter({ apiKey: sensitiveKey });
    const registry = new AiProviderRegistry([adapter]);
    const gateway = new AiProviderGateway({ registry });

    const statuses = await gateway.getProviderStatus();
    const statusJson = JSON.stringify(statuses);

    assert(!statusJson.includes('SUPER_SECRET_KEY'), 'API key leaked in provider status JSON');
    assert(!statusJson.includes('sk-proj'), 'API key prefix leaked in provider status JSON');
  });

  it('never leaks secret API keys in error messages', async () => {
    const sensitiveKey = 'sk-proj-SUPER_SECRET_KEY_ERROR_LEAK_TEST';
    const adapter = new OpenAiProviderAdapter({ apiKey: sensitiveKey });
    const registry = new AiProviderRegistry([adapter]);
    const gateway = new AiProviderGateway({ registry });

    try {
      // Intentionally request with invalid model to trigger error
      await gateway.generate({
        providerId: 'OPENAI',
        model: '',
        messages: [{ role: 'USER', content: 'test' }],
      });
      assert.fail('Expected error');
    } catch (err: unknown) {
      const errString = String(err);
      const errJson = JSON.stringify(err);
      assert(!errString.includes('SUPER_SECRET_KEY'), 'API key leaked in Error.toString()');
      assert(!errJson.includes('SUPER_SECRET_KEY'), 'API key leaked in JSON.stringify(Error)');
    }
  });

  it('rejects prototype pollution attempts in request payloads', async () => {
    const gateway = new AiProviderGateway({
      registry: new AiProviderRegistry([new FakeAiProvider()]),
    });

    const maliciousPayload = JSON.parse(
      '{"providerId":"FAKE","model":"fake-model-v1","messages":[{"role":"USER","content":"safe"}],"__proto__":{"polluted":true}}',
    );

    const result = await gateway.generate(maliciousPayload);
    assert.equal(result.providerId, 'FAKE');
    assert.equal((Object.prototype as Record<string, unknown>)['polluted'], undefined);
  });

  it('enforces hard boundary on total payload size to prevent resource exhaustion', async () => {
    const gateway = new AiProviderGateway({
      registry: new AiProviderRegistry([new FakeAiProvider()]),
    });

    // 10 messages of 60,000 characters = 600,000 characters > 500,000 max
    const oversizedMessages = Array.from({ length: 10 }, () => ({
      role: 'USER' as const,
      content: 'x'.repeat(60_000),
    }));

    await assert.rejects(
      () =>
        gateway.generate({
          providerId: 'FAKE',
          model: 'fake-model-v1',
          messages: oversizedMessages,
        }),
      (err: unknown) => {
        assert(err instanceof AiInvalidRequestError);
        assert(err.message.includes('Total prompt character count'));
        return true;
      },
    );
  });
});
