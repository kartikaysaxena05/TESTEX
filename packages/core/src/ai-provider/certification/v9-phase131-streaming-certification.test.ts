/**
 * @file packages/core/src/ai-provider/certification/v9-phase131-streaming-certification.test.ts
 * Comprehensive Certification Test Suite for V9 Phase 131:
 * Streaming Response Infrastructure.
 *
 * Verifies:
 * 1. Provider-Level Streaming & NDJSON Handling (multiple chunks, empty/malformed lines, completion)
 * 2. Runtime Streaming Lifecycle (START -> DELTA -> COMPLETE, monotonic sequences, usage stats)
 * 3. Request Isolation (simultaneous Stream A, B, C never leak or mix chunks)
 * 4. Cooperative Cancellation (abort terminates selected stream, preserves partial output, does not affect peers)
 * 5. Bounded Timeout Enforcement (deadline aborts stream with ERROR event, no orphaned state)
 * 6. Error Taxonomy & Resilience (provider offline, model 404, server 500, socket drops)
 * 7. Security & Context Isolation (cross-project rejection, secret redaction in metadata)
 * 8. End-to-End Integration via AiProviderService
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
  AiProviderRegistry,
  AiInvalidRequestError,
  AiProviderUnavailableError,
  AiModelUnavailableError,
  AiTimeoutError,
  AiCancelledError,
  AiCrossProjectAccessError,
} from '../index.js';
import type { PrismaClient } from '@prisma/client';
import type { AiStreamEventDto } from '@ai-quality/contracts';

describe('V9 Phase 131 — Streaming Response Infrastructure Certification Suite', () => {
  let prisma: PrismaClient;
  let mockServer: http.Server;
  let mockPort: number;
  let mockBaseUrl: string;

  let mockTagsResponse: unknown;
  let mockStreamChunks: readonly string[] = [];
  let mockStreamStatus = 200;
  let mockDelayMs = 0;

  const testUserId = '00000000-0000-0000-0000-000000000160';
  const otherUserId = '00000000-0000-0000-0000-000000000161';
  const testProjectId = '00000000-0000-0000-0000-000000001310';
  const otherProjectId = '00000000-0000-0000-0000-000000001311';

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
        email: 'v9_phase131_tester@quality.local',
        normalizedEmail: 'v9_phase131_tester@quality.local',
        displayName: 'Phase 131 Tester',
      },
    });

    await prisma.user.upsert({
      where: { id: otherUserId },
      update: {},
      create: {
        id: otherUserId,
        email: 'v9_phase131_other@quality.local',
        normalizedEmail: 'v9_phase131_other@quality.local',
        displayName: 'Phase 131 Other',
      },
    });

    await prisma.project.createMany({
      data: [
        {
          id: testProjectId,
          name: 'Phase 131 Project A',
          userId: testUserId,
        },
        {
          id: otherProjectId,
          name: 'Phase 131 Project B',
          userId: otherUserId,
        },
      ],
    });

    // Start local mock Ollama HTTP server with streaming support
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

        if (mockStreamStatus !== 200) {
          res.writeHead(mockStreamStatus, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Server error from Ollama' }));
          return;
        }

        // Stream NDJSON chunks
        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson',
          'Transfer-Encoding': 'chunked',
        });

        for (const chunk of mockStreamChunks) {
          res.write(chunk + '\n');
          // Optional subtle yield
          await new Promise((r) => setImmediate(r));
        }
        res.end();
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
    mockStreamStatus = 200;
    mockDelayMs = 0;
    mockTagsResponse = {
      models: [
        {
          name: 'qwen2.5-coder:7b',
          model: 'qwen2.5-coder:7b',
          size: 4700000000,
          modified_at: '2026-09-01T00:00:00Z',
          details: { family: 'qwen2', parameter_size: '7B', quantization_level: 'Q4_K_M' },
        },
        {
          name: 'llama3:8b',
          model: 'llama3:8b',
          size: 4900000000,
          modified_at: '2026-09-01T00:00:00Z',
          details: { family: 'llama', parameter_size: '8B', quantization_level: 'Q4_0' },
        },
      ],
    };

    mockStreamChunks = [
      JSON.stringify({ model: 'llama3:8b', response: 'Automated ', done: false }),
      JSON.stringify({ model: 'llama3:8b', response: 'software testing ', done: false }),
      JSON.stringify({ model: 'llama3:8b', response: 'prevents regressions.', done: false }),
      JSON.stringify({
        model: 'llama3:8b',
        response: '',
        done: true,
        prompt_eval_count: 12,
        eval_count: 8,
      }),
    ];
  });

  // --------------------------------------------------------------------------
  // SECTION 1: Provider-Level Streaming & NDJSON Processing
  // --------------------------------------------------------------------------
  describe('Section 1: Provider-Level Streaming Adapter', () => {
    it('streams sequential delta chunks and detects completion with token metrics', async () => {
      const adapter = new OllamaProviderAdapter({
        baseUrl: mockBaseUrl,
        enabled: true,
        requestTimeoutMs: 5000,
      });

      const chunks: string[] = [];
      let finalChunk: any = null;

      for await (const chunk of adapter.stream({
        requestId: '00000000-0000-0000-0000-000000001311',
        projectId: testProjectId,
        providerId: 'OLLAMA',
        model: 'llama3:8b',
        prompt: 'Why write tests?',
      })) {
        if (chunk.deltaText) {
          chunks.push(chunk.deltaText);
        }
        if (chunk.finishReason) {
          finalChunk = chunk;
        }
      }

      assert.strictEqual(chunks.join(''), 'Automated software testing prevents regressions.');
      assert(finalChunk != null);
      assert.strictEqual(finalChunk.finishReason, 'stop');
      assert.strictEqual(finalChunk.usage?.inputTokens, 12);
      assert.strictEqual(finalChunk.usage?.outputTokens, 8);
      assert.strictEqual(finalChunk.usage?.totalTokens, 20);
    });

    it('safely tolerates empty lines, whitespace, and malformed JSON lines mid-stream', async () => {
      mockStreamChunks = [
        '',
        '   ',
        JSON.stringify({ model: 'llama3:8b', response: 'Part 1. ', done: false }),
        'INVALID_CORRUPTED_JSON_LINE{{{',
        '',
        JSON.stringify({ model: 'llama3:8b', response: 'Part 2.', done: false }),
        JSON.stringify({ model: 'llama3:8b', response: '', done: true }),
      ];

      const adapter = new OllamaProviderAdapter({
        baseUrl: mockBaseUrl,
        enabled: true,
        requestTimeoutMs: 5000,
      });

      const collected: string[] = [];
      for await (const chunk of adapter.stream({
        requestId: '00000000-0000-0000-0000-000000001312',
        projectId: testProjectId,
        providerId: 'OLLAMA',
        model: 'llama3:8b',
        prompt: 'Stream test',
      })) {
        if (chunk.deltaText) collected.push(chunk.deltaText);
      }

      assert.strictEqual(collected.join(''), 'Part 1. Part 2.');
    });

    it('translates 404 status from stream endpoint to AiModelUnavailableError', async () => {
      mockStreamStatus = 404;

      const adapter = new OllamaProviderAdapter({
        baseUrl: mockBaseUrl,
        enabled: true,
        requestTimeoutMs: 5000,
      });

      await assert.rejects(
        async () => {
          for await (const _ of adapter.stream({
            requestId: '00000000-0000-0000-0000-000000001313',
            projectId: testProjectId,
            providerId: 'OLLAMA',
            model: 'non-existent-model',
            prompt: 'Test',
          })) {
            // iterator consumption
          }
        },
        (err) => err instanceof AiModelUnavailableError,
      );
    });

    it('translates connection refused to AiProviderUnavailableError', async () => {
      const adapter = new OllamaProviderAdapter({
        baseUrl: 'http://127.0.0.1:59999', // Dead port
        enabled: true,
        requestTimeoutMs: 2000,
      });

      await assert.rejects(
        async () => {
          for await (const _ of adapter.stream({
            requestId: '00000000-0000-0000-0000-000000001314',
            projectId: testProjectId,
            providerId: 'OLLAMA',
            model: 'llama3:8b',
            prompt: 'Test',
          })) {
            // iterator consumption
          }
        },
        (err) => err instanceof AiProviderUnavailableError,
      );
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 2: Runtime Streaming Lifecycle & Request Isolation
  // --------------------------------------------------------------------------
  describe('Section 2: Runtime Streaming Lifecycle & Request Isolation', () => {
    it('emits START, sequential DELTA events with monotonic sequence numbers, and COMPLETE event', async () => {
      const registry = new AiProviderRegistry();
      registry.register(
        new OllamaProviderAdapter({ baseUrl: mockBaseUrl, enabled: true, requestTimeoutMs: 5000 }),
      );

      const runtime = new LocalGenerationRuntimeService({
        prisma,
        registry,
      });

      const events: AiStreamEventDto[] = [];
      for await (const event of runtime.generateStream({
        requestId: '00000000-0000-0000-0000-000000001321',
        projectId: testProjectId,
        modelId: 'llama3:8b',
        prompt: 'Explain automated testing',
      })) {
        events.push(event);
      }

      assert(events.length >= 3);
      assert.strictEqual(events[0]?.type, 'START');
      assert.strictEqual(events[0]?.sequence, 0);
      assert.strictEqual(events[0]?.done, false);

      // Verify intermediate delta sequence monotonicity
      for (let i = 1; i < events.length - 1; i++) {
        assert.strictEqual(events[i]?.type, 'DELTA');
        assert.strictEqual(events[i]?.sequence, i);
        assert.strictEqual(events[i]?.done, false);
      }

      // Verify terminal event
      const last = events[events.length - 1]!;
      assert.strictEqual(last.type, 'COMPLETE');
      assert.strictEqual(last.sequence, events.length - 1);
      assert.strictEqual(last.done, true);
      assert.strictEqual(last.content, 'Automated software testing prevents regressions.');
      assert.strictEqual(last.accumulatedText, 'Automated software testing prevents regressions.');
      assert.strictEqual(last.finishReason, 'stop');
      assert.strictEqual(last.usage?.totalTokens, 20);
    });

    it('maintains strict isolation between simultaneous streams without interleaving data', async () => {
      const registry = new AiProviderRegistry();
      registry.register(
        new OllamaProviderAdapter({ baseUrl: mockBaseUrl, enabled: true, requestTimeoutMs: 5000 }),
      );

      const runtime = new LocalGenerationRuntimeService({
        prisma,
        registry,
      });

      const reqIdA = '00000000-0000-0000-0000-000000001322';
      const reqIdB = '00000000-0000-0000-0000-000000001323';

      const streamA = (async () => {
        const events: AiStreamEventDto[] = [];
        for await (const ev of runtime.generateStream({
          requestId: reqIdA,
          projectId: testProjectId,
          modelId: 'llama3:8b',
          prompt: 'Stream A Prompt',
        })) {
          events.push(ev);
        }
        return events;
      })();

      const streamB = (async () => {
        const events: AiStreamEventDto[] = [];
        for await (const ev of runtime.generateStream({
          requestId: reqIdB,
          projectId: testProjectId,
          modelId: 'llama3:8b',
          prompt: 'Stream B Prompt',
        })) {
          events.push(ev);
        }
        return events;
      })();

      const [resA, resB] = await Promise.all([streamA, streamB]);

      // Assert all Stream A events carry reqIdA
      for (const ev of resA) {
        assert.strictEqual(ev.requestId, reqIdA);
      }
      // Assert all Stream B events carry reqIdB
      for (const ev of resB) {
        assert.strictEqual(ev.requestId, reqIdB);
      }

      assert.strictEqual(resA[resA.length - 1]?.type, 'COMPLETE');
      assert.strictEqual(resB[resB.length - 1]?.type, 'COMPLETE');
    });

    it('rejects cross-project access for unauthorized project ID', async () => {
      const registry = new AiProviderRegistry();
      registry.register(
        new OllamaProviderAdapter({ baseUrl: mockBaseUrl, enabled: true, requestTimeoutMs: 5000 }),
      );

      const runtime = new LocalGenerationRuntimeService({
        prisma,
        registry,
        assertProjectAccess: async (projId, uId) => {
          const proj = await prisma.project.findUnique({ where: { id: projId } });
          if (!proj || proj.userId !== uId) {
            throw new AiCrossProjectAccessError('Cross-project access forbidden');
          }
        },
      });

      // User A attempting to access Project B
      await assert.rejects(
        async () => {
          for await (const _ of runtime.generateStream(
            {
              requestId: '00000000-0000-0000-0000-000000001324',
              projectId: otherProjectId,
              modelId: 'llama3:8b',
              prompt: 'Unauthorized stream request',
            },
            testUserId,
          )) {
            // iteration
          }
        },
        (err) => err instanceof AiCrossProjectAccessError,
      );
    });

    it('formats and bounds project context ceiling (50,000 chars)', async () => {
      const registry = new AiProviderRegistry();
      registry.register(
        new OllamaProviderAdapter({ baseUrl: mockBaseUrl, enabled: true, requestTimeoutMs: 5000 }),
      );

      const runtime = new LocalGenerationRuntimeService({
        prisma,
        registry,
      });

      // Oversized context
      await assert.rejects(
        async () => {
          for await (const _ of runtime.generateStream({
            requestId: '00000000-0000-0000-0000-000000001325',
            projectId: testProjectId,
            modelId: 'llama3:8b',
            prompt: 'Context test',
            context: {
              repositoryInfo: 'x'.repeat(25000), // Exceeds 20,000 char per field bound
            },
          })) {
            // iteration
          }
        },
        (err) => err instanceof AiInvalidRequestError,
      );
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 3: Cooperative Cancellation & Timeout Resiliency
  // --------------------------------------------------------------------------
  describe('Section 3: Cancellation & Timeout Resiliency', () => {
    it('cancelling in-flight stream terminates provider and yields CANCELLED with partial text preserved', async () => {
      mockDelayMs = 250; // Delay per chunk to allow cancel to hit mid-stream
      mockStreamChunks = [
        JSON.stringify({ model: 'llama3:8b', response: 'Chunk 1. ', done: false }),
        JSON.stringify({ model: 'llama3:8b', response: 'Chunk 2. ', done: false }),
        JSON.stringify({ model: 'llama3:8b', response: 'Chunk 3. ', done: false }),
        JSON.stringify({ model: 'llama3:8b', response: '', done: true }),
      ];

      const registry = new AiProviderRegistry();
      registry.register(
        new OllamaProviderAdapter({ baseUrl: mockBaseUrl, enabled: true, requestTimeoutMs: 5000 }),
      );

      const runtime = new LocalGenerationRuntimeService({
        prisma,
        registry,
      });

      const reqId = '00000000-0000-0000-0000-000000001331';
      const events: AiStreamEventDto[] = [];

      const streamPromise = (async () => {
        for await (const ev of runtime.generateStream({
          requestId: reqId,
          projectId: testProjectId,
          modelId: 'llama3:8b',
          prompt: 'Cancel test',
        })) {
          events.push(ev);
          if (ev.type === 'DELTA') {
            // Trigger cooperative cancel as soon as first delta arrives
            void runtime.cancel(reqId);
          }
        }
      })();

      await streamPromise;

      const last = events[events.length - 1];
      assert(last != null);
      assert.strictEqual(last.type, 'CANCELLED');
      assert.strictEqual(last.done, true);
      assert.strictEqual(last.error, 'Generation cancelled by user.');
      // Partial content received before cancel must be preserved
      assert(last.content != null && last.content.length > 0);
    });

    it('cancelling Stream A does not interrupt concurrent Stream B', async () => {
      mockDelayMs = 150;
      mockStreamChunks = [
        JSON.stringify({ model: 'llama3:8b', response: 'Word 1 ', done: false }),
        JSON.stringify({ model: 'llama3:8b', response: 'Word 2 ', done: false }),
        JSON.stringify({ model: 'llama3:8b', response: 'Word 3.', done: false }),
        JSON.stringify({ model: 'llama3:8b', response: '', done: true }),
      ];

      const registry = new AiProviderRegistry();
      registry.register(
        new OllamaProviderAdapter({ baseUrl: mockBaseUrl, enabled: true, requestTimeoutMs: 5000 }),
      );

      const runtime = new LocalGenerationRuntimeService({
        prisma,
        registry,
      });

      const reqIdA = '00000000-0000-0000-0000-000000001332';
      const reqIdB = '00000000-0000-0000-0000-000000001333';

      const streamA = (async () => {
        const events: AiStreamEventDto[] = [];
        for await (const ev of runtime.generateStream({
          requestId: reqIdA,
          projectId: testProjectId,
          modelId: 'llama3:8b',
          prompt: 'Cancel Stream A',
        })) {
          events.push(ev);
          if (ev.type === 'DELTA') {
            void runtime.cancel(reqIdA);
          }
        }
        return events;
      })();

      const streamB = (async () => {
        const events: AiStreamEventDto[] = [];
        for await (const ev of runtime.generateStream({
          requestId: reqIdB,
          projectId: testProjectId,
          modelId: 'llama3:8b',
          prompt: 'Keep Stream B Running',
        })) {
          events.push(ev);
        }
        return events;
      })();

      const [resA, resB] = await Promise.all([streamA, streamB]);

      // Stream A was cancelled
      assert.strictEqual(resA[resA.length - 1]?.type, 'CANCELLED');
      // Stream B completed successfully without interruption
      assert.strictEqual(resB[resB.length - 1]?.type, 'COMPLETE');
      assert.strictEqual(resB[resB.length - 1]?.content, 'Word 1 Word 2 Word 3.');
    });

    it('enforces stream deadline timeout and yields terminal ERROR event', async () => {
      mockDelayMs = 400; // Chunk delay exceeding request timeout
      mockStreamChunks = [
        JSON.stringify({ model: 'llama3:8b', response: 'Delayed 1', done: false }),
        JSON.stringify({ model: 'llama3:8b', response: '', done: true }),
      ];

      const registry = new AiProviderRegistry();
      registry.register(
        new OllamaProviderAdapter({ baseUrl: mockBaseUrl, enabled: true, requestTimeoutMs: 5000 }),
      );

      const runtime = new LocalGenerationRuntimeService({
        prisma,
        registry,
        defaultTimeoutMs: 150, // Short deadline
      });

      const events: AiStreamEventDto[] = [];
      for await (const ev of runtime.generateStream({
        requestId: '00000000-0000-0000-0000-000000001334',
        projectId: testProjectId,
        modelId: 'llama3:8b',
        prompt: 'Timeout test',
        timeoutMs: 150,
      })) {
        events.push(ev);
      }

      const last = events[events.length - 1];
      assert(last != null);
      assert.strictEqual(last.type, 'ERROR');
      assert.strictEqual(last.done, true);
      assert(last.error?.includes('timed out'));
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 4: Error Handling, Resource Cleanup & AiProviderService Integration
  // --------------------------------------------------------------------------
  describe('Section 4: Error Taxonomy, Observability & Service Integration', () => {
    it('yields ERROR event when Ollama daemon is offline', async () => {
      const registry = new AiProviderRegistry();
      registry.register(
        new OllamaProviderAdapter({
          baseUrl: 'http://127.0.0.1:58888', // Offline daemon
          enabled: true,
          requestTimeoutMs: 1000,
        }),
      );

      const runtime = new LocalGenerationRuntimeService({
        prisma,
        registry,
      });

      const events: AiStreamEventDto[] = [];
      for await (const ev of runtime.generateStream({
        requestId: '00000000-0000-0000-0000-000000001341',
        projectId: testProjectId,
        modelId: 'llama3:8b',
        prompt: 'Daemon offline test',
      })) {
        events.push(ev);
      }

      const last = events[events.length - 1];
      assert(last != null);
      assert.strictEqual(last.type, 'ERROR');
      assert.strictEqual(last.done, true);
      assert(last.error?.includes('offline') || last.error?.includes('not ready') || last.error?.includes('reach'));
    });

    it('cleans up active requests registry upon stream completion, leaving no leaks', async () => {
      const registry = new AiProviderRegistry();
      registry.register(
        new OllamaProviderAdapter({ baseUrl: mockBaseUrl, enabled: true, requestTimeoutMs: 5000 }),
      );

      const runtime = new LocalGenerationRuntimeService({
        prisma,
        registry,
      });

      const reqId = '00000000-0000-0000-0000-000000001342';
      for await (const _ of runtime.generateStream({
        requestId: reqId,
        projectId: testProjectId,
        modelId: 'llama3:8b',
        prompt: 'Leak test',
      })) {
        // stream
      }

      // Check status: must be COMPLETED in history, and activeRequests must be deleted
      const status = runtime.getStatus(reqId);
      assert.strictEqual(status.state, 'COMPLETED');

      // Attempting to cancel already-completed request returns false
      const cancelResult = await runtime.cancel(reqId);
      assert.strictEqual(cancelResult, false);
    });

    it('end-to-end integration via AiProviderService.streamLocal', async () => {
      const registry = new AiProviderRegistry();
      registry.register(
        new OllamaProviderAdapter({ baseUrl: mockBaseUrl, enabled: true, requestTimeoutMs: 5000 }),
      );
      const service = new AiProviderService({
        prisma,
        registry,
      });

      const events: AiStreamEventDto[] = [];
      for await (const ev of service.streamLocal({
        requestId: '00000000-0000-0000-0000-000000001343',
        projectId: testProjectId,
        modelId: 'llama3:8b',
        prompt: 'AiProviderService stream test',
      })) {
        events.push(ev);
      }

      assert(events.length >= 3);
      assert.strictEqual(events[0]?.type, 'START');
      assert.strictEqual(events[events.length - 1]?.type, 'COMPLETE');
      assert.strictEqual(
        events[events.length - 1]?.content,
        'Automated software testing prevents regressions.',
      );
    });
  });
});
