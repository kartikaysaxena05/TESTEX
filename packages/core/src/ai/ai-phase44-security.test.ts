/**
 * @file packages/core/src/ai/ai-phase44-security.test.ts
 * Security and adversarial test suite for Phase 44: AI configuration, prompt architecture, and output contracts.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { AiConfigurationResolver } from './ai-configuration.js';
import { PromptRegistry } from './prompt-registry.js';
import { PromptRenderer } from './prompt-renderer.js';
import { StructuredOutputParser } from './structured-output.js';
import { AiPromptExecutionService } from './ai-prompt-execution-service.js';
import { FakeAiProvider } from './fake-ai-provider.js';
import { AiProviderGateway } from './ai-provider-gateway.js';
import { AiProviderRegistry } from './ai-provider-registry.js';
import {
  AiConfigurationInvalidError,
  AiStructuredOutputParseError,
  AiPromptRenderFailedError,
} from './ai-errors.js';

describe('Phase 44 Security & Invariants', () => {
  describe('Zero API Key Leakage Invariant', () => {
    it('ensures configuration snapshots NEVER contain API keys or secret fields', () => {
      const configWithSecrets = {
        providerId: 'OPENAI',
        model: 'gpt-4o',
        temperature: 0.2,
        maxOutputTokens: 2048,
        timeoutMs: 30000,
        apiKey: 'sk-secret-token-12345',
        authorization: 'Bearer secret',
        secretHeaders: { Authorization: 'Bearer xxx' },
      };

      const snapshot = AiConfigurationResolver.toSnapshot(configWithSecrets as any);

      assert.strictEqual((snapshot as any).apiKey, undefined);
      assert.strictEqual((snapshot as any).authorization, undefined);
      assert.strictEqual((snapshot as any).secretHeaders, undefined);

      const jsonString = JSON.stringify(snapshot);
      assert.ok(!jsonString.includes('sk-secret'));
      assert.ok(!jsonString.includes('secret-token'));
    });

    it('ensures prompt execution result envelopes never leak sensitive internal parameters', async () => {
      const fakeProvider = new FakeAiProvider({
        defaultResponse: JSON.stringify({ status: 'HEALTHY', latencyMs: 10 }),
      });
      const gateway = new AiProviderGateway({
        registry: new AiProviderRegistry([fakeProvider]),
      });
      const service = new AiPromptExecutionService({
        registry: PromptRegistry.createDefault(),
        gateway,
      });

      const result = await service.executePrompt({
        promptId: 'fixture.system.health',
        version: 1,
        input: { checkTarget: 'security-service' },
        configOverride: {
          providerId: 'FAKE',
          // Malicious attempt to inject credentials into override
          ...({ apiKey: 'sk-leaked-key' } as any),
        },
      });

      assert.strictEqual((result as any).apiKey, undefined);
      assert.strictEqual((result.configSnapshot as any).apiKey, undefined);

      const resultStr = JSON.stringify(result);
      assert.ok(!resultStr.includes('sk-leaked-key'));
    });
  });

  describe('Prototype Pollution Defense', () => {
    it('rejects prototype pollution via configuration object layers', () => {
      const maliciousPayload = JSON.parse('{"__proto__": {"isAdmin": true}, "temperature": 0.5}');

      assert.throws(
        () => AiConfigurationResolver.resolve({ callOverride: maliciousPayload }),
        (err: unknown) => err instanceof AiConfigurationInvalidError,
      );

      // Verify Object prototype was not polluted
      assert.strictEqual(({} as any).isAdmin, undefined);
    });

    it('rejects prototype pollution in parsed structured LLM responses', () => {
      const maliciousResponse =
        '{"status": "HEALTHY", "latencyMs": 10, "__proto__": {"polluted": true}}';
      const schema = z.object({ status: z.string(), latencyMs: z.number() });

      assert.throws(
        () => StructuredOutputParser.parseAndValidate(maliciousResponse, schema),
        (err: unknown) => err instanceof AiStructuredOutputParseError,
      );

      assert.strictEqual(({} as any).polluted, undefined);
    });

    it('rejects prototype pollution in prompt template interpolation variables', () => {
      const maliciousVars = JSON.parse('{"constructor": {"name": "Exploit"}, "target": "DB"}');

      assert.throws(
        () => PromptRenderer.interpolate('Scanning {{target}}', maliciousVars),
        (err: unknown) => err instanceof AiPromptRenderFailedError,
      );
    });
  });

  describe('Template Injection & Dynamic Code Execution Safety', () => {
    it('does NOT execute arbitrary JavaScript expressions in template variables', () => {
      const maliciousExpression = '{{process.exit(1)}}';
      const rendered = PromptRenderer.interpolate('Output: {{expr}}', {
        expr: maliciousExpression,
      });

      // It must be treated as a literal string value, not evaluated
      assert.equal(rendered, 'Output: {{process.exit(1)}}');
    });
  });

  describe('Mass Assignment Protection', () => {
    it('ignores or rejects unknown protected properties passed in configuration resolution', () => {
      const untrustedInput = {
        providerId: 'FAKE',
        model: 'fake-model-v1',
        temperature: 0.5,
        maxOutputTokens: 1000,
        timeoutMs: 10000,
        // Protected fields
        id: 'protected-uuid',
        projectId: 'project-uuid',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        isSuperUser: true,
      };

      const resolved = AiConfigurationResolver.resolve({
        callOverride: untrustedInput as any,
      });

      assert.strictEqual((resolved as any).id, undefined);
      assert.strictEqual((resolved as any).projectId, undefined);
      assert.strictEqual((resolved as any).createdAt, undefined);
      assert.strictEqual((resolved as any).isSuperUser, undefined);
    });
  });
});
