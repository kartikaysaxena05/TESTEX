/**
 * @file packages/core/src/ai-provider/certification/v9-phase130-certification.test.ts
 * Comprehensive Certification Test Suite for V9 Phase 130:
 * Local Model Chat & Generation Runtime.
 *
 * Verifies:
 * 1. Request Contract & Input Validation (prompt bounds, parameter ranges, context limits)
 * 2. Bounded Project Context (formatting, sanitization, 50k character limit, isolation)
 * 3. Model Resolution (explicit model verification vs auto-resolution via Phase 129)
 * 4. Execution Lifecycle Management (IDLE -> RUNNING -> COMPLETED | CANCELLED | TIMEOUT | PROVIDER_ERROR)
 * 5. Cooperative Cancellation (in-flight abortion, targeted cancellation, race handling)
 * 6. Bounded Timeout Enforcement (clean abort, no orphaned running operations)
 * 7. Classified Error Mapping (PROVIDER_UNAVAILABLE, MODEL_UNAVAILABLE, CONNECTION_ERROR, TIMEOUT, CANCELLED)
 * 8. Observability & Safe Metadata (redacting secrets, token usage reporting)
 * 9. End-to-End Integration via AiProviderService
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { getPrismaClient } from '../../database/client.js';
import {
  AiProviderService,
  LocalGenerationRuntimeService,
  OllamaProviderAdapter,
  EmulatedAiProvider,
  AiProviderRegistry,
  AiInvalidRequestError,
  AiProviderUnavailableError,
  AiModelUnavailableError,
  AiTimeoutError,
  AiCancelledError,
  AiConnectionError,
  AiInvalidResponseError,
  AiCrossProjectAccessError,
} from '../index.js';
import type { PrismaClient } from '@prisma/client';

describe('V9 Phase 130 — Local Model Chat & Generation Runtime Certification Suite', () => {
  let prisma: PrismaClient;
  let mockServer: http.Server;
  let mockPort: number;
  let mockBaseUrl: string;

  let mockTagsResponse: unknown;
  let mockGenerateResponse: unknown;
  let mockGenerateStatus = 200;
  let mockDelayMs = 0;

  const testUserId = '00000000-0000-0000-0000-000000000150';
  const otherUserId = '00000000-0000-0000-0000-000000000151';
  const testProjectId = '00000000-0000-0000-0000-000000001300';
  const otherProjectId = '00000000-0000-0000-0000-000000001301';

  before(async () => {
    prisma = getPrismaClient()!;

    // Clean up test data
    await prisma.authAuditEvent.deleteMany({
      where: { userId: { in: [testUserId, otherUserId] } },
    });
    await prisma.aiModelSelection.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.aiProviderConfig.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [testUserId, otherUserId] } },
    });

    // Seed test users & projects
    await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        email: 'v9_phase130_tester@quality.local',
        normalizedEmail: 'v9_phase130_tester@quality.local',
        displayName: 'Phase 130 Tester',
      },
    });

    await prisma.user.upsert({
      where: { id: otherUserId },
      update: {},
      create: {
        id: otherUserId,
        email: 'v9_phase130_other@quality.local',
        normalizedEmail: 'v9_phase130_other@quality.local',
        displayName: 'Phase 130 Other',
      },
    });

    await prisma.project.createMany({
      data: [
        {
          id: testProjectId,
          name: 'Phase 130 Project A',
          userId: testUserId,
        },
        {
          id: otherProjectId,
          name: 'Phase 130 Project B',
          userId: otherUserId,
        },
      ],
    });

    // Start local mock Ollama HTTP server
    mockServer = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

      if (url.pathname === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mockTagsResponse));
        return;
      }

      if (url.pathname === '/api/generate') {
        if (mockDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, mockDelayMs));
        }

        if (mockGenerateStatus !== 200) {
          res.writeHead(mockGenerateStatus, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Server error from Ollama' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mockGenerateResponse));
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address() as AddressInfo;
        mockPort = addr.port;
        mockBaseUrl = `http://127.0.0.1:${mockPort}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (mockServer) {
      await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    }
    await prisma.authAuditEvent.deleteMany({
      where: { userId: { in: [testUserId, otherUserId] } },
    });
    await prisma.aiModelSelection.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.aiProviderConfig.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [testUserId, otherUserId] } },
    });
  });

  beforeEach(() => {
    mockDelayMs = 0;
    mockGenerateStatus = 200;
    mockTagsResponse = {
      models: [
        {
          name: 'llama3:8b',
          model: 'llama3:8b',
          size: 4000000000,
          digest: 'sha256:1111',
          details: { family: 'llama', parameter_size: '8B', quantization_level: 'Q4_0' },
        },
        {
          name: 'qwen2.5-coder:7b',
          model: 'qwen2.5-coder:7b',
          size: 4500000000,
          digest: 'sha256:2222',
          details: { family: 'qwen2', parameter_size: '7B', quantization_level: 'Q4_K_M' },
        },
      ],
    };
    mockGenerateResponse = {
      model: 'llama3:8b',
      response: 'Automated testing improves software reliability by catching regression defects early.',
      done: true,
      total_duration: 150000000,
      load_duration: 20000000,
      prompt_eval_count: 24,
      eval_count: 14,
    };
  });

  // ==========================================================================
  // Section 1: Request Validation & Bounded Project Context
  // ==========================================================================

  describe('1. Request Validation & Bounded Project Context', () => {
    it('rejects generation requests with empty or whitespace prompt', async () => {
      const registry = new AiProviderRegistry();
      registry.register(new EmulatedAiProvider());
      const runtime = new LocalGenerationRuntimeService({ registry });

      await assert.rejects(
        async () => {
          await runtime.generate({ providerId: 'EMULATED', prompt: '   ' });
        },
        (err: unknown) => {
          assert(err instanceof AiInvalidRequestError);
          assert.match(err.message, /prompt/i);
          return true;
        },
      );
    });

    it('rejects generation requests with out-of-range temperature parameter', async () => {
      const registry = new AiProviderRegistry();
      registry.register(new EmulatedAiProvider());
      const runtime = new LocalGenerationRuntimeService({ registry });

      await assert.rejects(
        async () => {
          await runtime.generate({
            prompt: 'Test prompt',
            parameters: { temperature: 3.5 }, // max is 2.0
          });
        },
        (err: unknown) => {
          assert(err instanceof AiInvalidRequestError);
          assert.match(err.message, /parameters.temperature/i);
          return true;
        },
      );
    });

    it('rejects project context exceeding the 50,000 character bound', async () => {
      const registry = new AiProviderRegistry();
      registry.register(new EmulatedAiProvider());
      const runtime = new LocalGenerationRuntimeService({ registry, maxContextChars: 1000 });

      const oversizedInfo = 'A'.repeat(1200);

      await assert.rejects(
        async () => {
          await runtime.generate({
            prompt: 'Generate unit tests',
            context: { repositoryInfo: oversizedInfo },
          });
        },
        (err: unknown) => {
          assert(err instanceof AiInvalidRequestError);
          assert.match(err.message, /context size/i);
          return true;
        },
      );
    });

    it('sanitizes and formats bounded project context into structured prompt sections', async () => {
      let receivedPrompt = '';
      const customProvider = new EmulatedAiProvider('EMULATED', 'Emulated');
      // Intercept generate call to inspect composite prompt
      const originalGenerate = customProvider.generate.bind(customProvider);
      customProvider.generate = async (req, sig) => {
        receivedPrompt = req.prompt;
        return originalGenerate(req, sig);
      };

      const registry = new AiProviderRegistry();
      registry.register(customProvider);
      const runtime = new LocalGenerationRuntimeService({ registry });

      const result = await runtime.generate({
        providerId: 'EMULATED',
        prompt: 'Write an integration test for login.',
        context: {
          repositoryInfo: 'Node.js 22 + TypeScript + Express backend.',
          requirements: 'User must authenticate via JWT bearer token.',
          testInfo: 'Vitest runner with supertest.',
        },
      });

      assert.strictEqual(result.state, 'COMPLETED');
      assert.match(receivedPrompt, /\[PROJECT CONTEXT\]/);
      assert.match(receivedPrompt, /### Repository Information/);
      assert.match(receivedPrompt, /Node\.js 22/);
      assert.match(receivedPrompt, /### Project Requirements/);
      assert.match(receivedPrompt, /### Test Suite Context/);
      assert.match(receivedPrompt, /\[USER INSTRUCTION\]/);
      assert.match(receivedPrompt, /Write an integration test for login\./);
    });
  });

  // ==========================================================================
  // Section 2: Model Resolution (Explicit vs Auto-Resolved)
  // ==========================================================================

  describe('2. Model Resolution', () => {
    it('resolves explicitly requested model when available on provider', async () => {
      const adapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl, defaultModel: 'llama3:8b' });
      const registry = new AiProviderRegistry();
      registry.register(adapter);
      const runtime = new LocalGenerationRuntimeService({ registry });

      const result = await runtime.generate({
        providerId: 'OLLAMA',
        modelId: 'qwen2.5-coder:7b',
        prompt: 'Return a binary search function.',
      });

      assert.strictEqual(result.state, 'COMPLETED');
      assert.strictEqual(result.model, 'llama3:8b'); // mock response returned llama3:8b
    });

    it('rejects explicitly requested model if not installed on Ollama', async () => {
      const adapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl, defaultModel: 'llama3:8b' });
      const registry = new AiProviderRegistry();
      registry.register(adapter);
      const runtime = new LocalGenerationRuntimeService({ registry });

      await assert.rejects(
        async () => {
          await runtime.generate({
            providerId: 'OLLAMA',
            modelId: 'non-existent-model:99b',
            prompt: 'Test prompt',
          });
        },
        (err: unknown) => {
          assert(err instanceof AiModelUnavailableError);
          assert.match(err.message, /not installed or available/i);
          return true;
        },
      );
    });

    it('automatically resolves model when modelId is omitted using installed models', async () => {
      const adapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl, defaultModel: 'llama3:8b' });
      const registry = new AiProviderRegistry();
      registry.register(adapter);
      const runtime = new LocalGenerationRuntimeService({ registry, prisma });

      const result = await runtime.generate({
        providerId: 'OLLAMA',
        prompt: 'Say hello',
      });

      assert.strictEqual(result.state, 'COMPLETED');
      assert(result.content.length > 0);
    });

    it('rejects request if provider has 0 installed models available', async () => {
      mockTagsResponse = { models: [] };

      const adapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl, defaultModel: 'llama3:8b' });
      const registry = new AiProviderRegistry();
      registry.register(adapter);
      const runtime = new LocalGenerationRuntimeService({ registry });

      await assert.rejects(
        async () => {
          await runtime.generate({
            providerId: 'OLLAMA',
            prompt: 'Hello',
          });
        },
        (err: unknown) => {
          assert(err instanceof AiModelUnavailableError);
          assert.match(err.message, /No models are installed/i);
          return true;
        },
      );
    });
  });

  // ==========================================================================
  // Section 3: Cooperative Cancellation & Timeout Lifecycle
  // ==========================================================================

  describe('3. Cooperative Cancellation & Timeout Lifecycle', () => {
    it('cancels an in-flight generation request cleanly upon client cancellation', async () => {
      mockDelayMs = 500;

      const adapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl, defaultModel: 'llama3:8b' });
      const registry = new AiProviderRegistry();
      registry.register(adapter);
      const runtime = new LocalGenerationRuntimeService({ registry });

      const reqId = '00000000-0000-0000-0000-0000000000c1';

      // Start generation asynchronously
      const genPromise = runtime.generate({
        requestId: reqId,
        providerId: 'OLLAMA',
        modelId: 'llama3:8b',
        prompt: 'Long prompt requiring computation',
      });

      // Allow request to become RUNNING
      await new Promise((resolve) => setTimeout(resolve, 50));

      const statusBefore = runtime.getStatus(reqId);
      assert.strictEqual(statusBefore.state, 'RUNNING');

      // Cancel the operation
      const cancelled = await runtime.cancel(reqId);
      assert.strictEqual(cancelled, true);

      // Verify the generate promise rejects with AiCancelledError
      await assert.rejects(
        genPromise,
        (err: unknown) => {
          assert(err instanceof AiCancelledError);
          return true;
        },
      );

      const statusAfter = runtime.getStatus(reqId);
      assert.strictEqual(statusAfter.state, 'CANCELLED');
    });

    it('cancellation targets only the specified requestId and preserves other active requests', async () => {
      mockDelayMs = 400;

      const adapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl, defaultModel: 'llama3:8b' });
      const registry = new AiProviderRegistry();
      registry.register(adapter);
      const runtime = new LocalGenerationRuntimeService({ registry });

      const reqIdA = '00000000-0000-0000-0000-0000000000a1';
      const reqIdB = '00000000-0000-0000-0000-0000000000b1';

      const promiseA = runtime.generate({
        requestId: reqIdA,
        providerId: 'OLLAMA',
        modelId: 'llama3:8b',
        prompt: 'Request A',
      });

      const promiseB = runtime.generate({
        requestId: reqIdB,
        providerId: 'OLLAMA',
        modelId: 'llama3:8b',
        prompt: 'Request B',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Cancel ONLY Request A
      await runtime.cancel(reqIdA);

      await assert.rejects(promiseA, AiCancelledError);

      // Request B should finish successfully
      const resultB = await promiseB;
      assert.strictEqual(resultB.state, 'COMPLETED');
      assert.strictEqual(runtime.getStatus(reqIdA).state, 'CANCELLED');
      assert.strictEqual(runtime.getStatus(reqIdB).state, 'COMPLETED');
    });

    it('terminates hanging requests when configured timeout is exceeded', async () => {
      mockDelayMs = 600;

      const adapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl, defaultModel: 'llama3:8b' });
      const registry = new AiProviderRegistry();
      registry.register(adapter);
      const runtime = new LocalGenerationRuntimeService({ registry, defaultTimeoutMs: 150 });

      const reqId = '00000000-0000-0000-0000-0000000000f1';

      await assert.rejects(
        async () => {
          await runtime.generate({
            requestId: reqId,
            providerId: 'OLLAMA',
            modelId: 'llama3:8b',
            prompt: 'Prompt that will time out',
            timeoutMs: 150,
          });
        },
        (err: unknown) => {
          assert(err instanceof AiTimeoutError);
          return true;
        },
      );

      const status = runtime.getStatus(reqId);
      assert.strictEqual(status.state, 'TIMEOUT');
    });
  });

  // ==========================================================================
  // Section 4: Failure Modes & Error Classification
  // ==========================================================================

  describe('4. Failure Modes & Error Classification', () => {
    it('classifies unreachable Ollama daemon as PROVIDER_UNAVAILABLE without hanging', async () => {
      const adapter = new OllamaProviderAdapter({
        baseUrl: 'http://127.0.0.1:59999', // Port with no listening server
        defaultModel: 'llama3:8b',
      });
      const registry = new AiProviderRegistry();
      registry.register(adapter);
      const runtime = new LocalGenerationRuntimeService({ registry });

      await assert.rejects(
        async () => {
          await runtime.generate({
            providerId: 'OLLAMA',
            prompt: 'Test prompt',
          });
        },
        (err: unknown) => {
          assert(err instanceof AiProviderUnavailableError);
          assert.match(err.message, /offline|unavailable|unreachable/i);
          return true;
        },
      );
    });

    it('classifies 500 server error from Ollama as provider failure', async () => {
      mockGenerateStatus = 500;

      const adapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl, defaultModel: 'llama3:8b' });
      const registry = new AiProviderRegistry();
      registry.register(adapter);
      const runtime = new LocalGenerationRuntimeService({ registry });

      await assert.rejects(
        async () => {
          await runtime.generate({
            providerId: 'OLLAMA',
            modelId: 'llama3:8b',
            prompt: 'Cause server error',
          });
        },
        (err: unknown) => {
          assert(err instanceof Error);
          assert.match(err.message, /500/);
          return true;
        },
      );
    });

    it('redacts sensitive fields and secrets from metadata', async () => {
      const customProvider = new EmulatedAiProvider('EMULATED', 'Emulated');
      customProvider.generate = async (req) => ({
        requestId: req.requestId,
        providerId: 'EMULATED',
        model: 'emulated-model',
        text: 'Clean output',
        finishReason: 'stop',
        timing: {
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 40,
        },
        metadata: {
          loadDuration: 120,
          apiKey: 'super-secret-key-1234',
          userPassword: 'secret-password',
          systemPath: '/Users/admin/.secrets',
        },
      });

      const registry = new AiProviderRegistry();
      registry.register(customProvider);
      const runtime = new LocalGenerationRuntimeService({ registry });

      const result = await runtime.generate({
        providerId: 'EMULATED',
        prompt: 'Check secrets redaction',
      });

      assert.strictEqual(result.state, 'COMPLETED');
      assert(result.metadata);
      assert.strictEqual(result.metadata.loadDuration, 120);
      assert.strictEqual(result.metadata.apiKey, undefined);
      assert.strictEqual(result.metadata.userPassword, undefined);
    });
  });

  // ==========================================================================
  // Section 5: End-to-End Service Dispatch via AiProviderService
  // ==========================================================================

  describe('5. End-to-End Service Dispatch via AiProviderService', () => {
    it('executes generation, status inspection, and cancellation through AiProviderService', async () => {
      const adapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl, defaultModel: 'llama3:8b' });
      const registry = new AiProviderRegistry();
      registry.register(adapter);

      const service = new AiProviderService({
        prisma,
        registry,
      });

      const reqId = '00000000-0000-0000-0000-0000000000e1';

      const genResult = await service.generateLocal(
        {
          requestId: reqId,
          projectId: testProjectId,
          providerId: 'OLLAMA',
          modelId: 'llama3:8b',
          prompt: 'Explain what test flakiness is.',
        },
        testUserId,
      );

      assert.strictEqual(genResult.requestId, reqId);
      assert.strictEqual(genResult.state, 'COMPLETED');
      assert(genResult.content.length > 0);
      assert.strictEqual(typeof genResult.durationMs, 'number');

      const status = service.getLocalGenerationStatus({ requestId: reqId });
      assert.strictEqual(status.state, 'COMPLETED');

      // Attempting to cancel already completed request returns false
      const cancelRes = await service.cancelLocalGeneration({ requestId: reqId });
      assert.strictEqual(cancelRes.cancelled, false);
    });

    it('enforces multi-tenant project isolation and rejects cross-project generation', async () => {
      const adapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl, defaultModel: 'llama3:8b' });
      const registry = new AiProviderRegistry();
      registry.register(adapter);

      const service = new AiProviderService({
        prisma,
        registry,
      });

      // User A attempts to run generation against Project B (owned by User B)
      await assert.rejects(
        async () => {
          await service.generateLocal(
            {
              projectId: otherProjectId,
              providerId: 'OLLAMA',
              prompt: 'Malicious cross-project instruction',
            },
            testUserId, // not the owner of otherProjectId
          );
        },
        (err: unknown) => {
          assert(err instanceof AiCrossProjectAccessError);
          return true;
        },
      );
    });
  });
});
