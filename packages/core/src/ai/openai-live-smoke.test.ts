/**
 * @file packages/core/src/ai/openai-live-smoke.test.ts
 * Conditional live smoke test for OpenAI provider adapter.
 * Executes live API call if OPENAI_API_KEY is present in the environment;
 * otherwise gracefully asserts unconfigured behavior.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { OpenAiProviderAdapter } from './openai-provider-adapter.js';
import { AiProviderGateway } from './ai-provider-gateway.js';
import { AiProviderRegistry } from './ai-provider-registry.js';

// Load environment variables if available
dotenv.config();

describe('OpenAI Live Provider Smoke Verification', () => {
  const hasApiKey = Boolean(
    process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0,
  );

  it('evaluates live provider readiness or reports unconfigured state', async () => {
    const adapter = new OpenAiProviderAdapter();
    const status = await adapter.healthCheck();

    if (!hasApiKey) {
      console.log(
        'ℹ️ [LIVE PROVIDER SMOKE] BLOCKED / NOT_CONFIGURED (OPENAI_API_KEY not provided in environment)',
      );
      assert.equal(status.status, 'NOT_CONFIGURED');
      assert.equal(status.configured, false);
      return;
    }

    console.log('ℹ️ [LIVE PROVIDER SMOKE] Executing live health check with configured API key...');
    assert.equal(status.configured, true);
    assert.equal(status.status, 'READY');
  });

  it('executes live minimal completion if credentials are present', async () => {
    if (!hasApiKey) {
      console.log('ℹ️ [LIVE PROVIDER SMOKE] SKIPPED generation test (no credentials)');
      return;
    }

    console.log(
      'ℹ️ [LIVE PROVIDER SMOKE] Executing live prompt generation: "Respond with exactly: PHASE43_OK"...',
    );
    const adapter = new OpenAiProviderAdapter();
    const registry = new AiProviderRegistry([adapter]);
    const gateway = new AiProviderGateway({ registry });

    const startTime = performance.now();
    const result = await gateway.generate({
      providerId: 'OPENAI',
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'USER',
          content: 'Respond with exactly: PHASE43_OK',
        },
      ],
      maxTokens: 20,
      temperature: 0,
    });

    const elapsedMs = Math.round(performance.now() - startTime);
    console.log(
      `✅ [LIVE PROVIDER SMOKE] Response received in ${elapsedMs}ms: "${result.text.trim()}"`,
    );
    console.log(
      `ℹ️ [LIVE PROVIDER SMOKE] Tokens used: prompt=${result.usage.inputTokens}, completion=${result.usage.outputTokens}, total=${result.usage.totalTokens}`,
    );

    assert.equal(result.providerId, 'OPENAI');
    assert(result.text.length > 0);
    assert(result.usage.totalTokens !== null && result.usage.totalTokens > 0);
  });
});
