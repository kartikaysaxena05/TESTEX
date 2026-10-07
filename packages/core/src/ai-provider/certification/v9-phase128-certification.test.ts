/**
 * @file packages/core/src/ai-provider/certification/v9-phase128-certification.test.ts
 * Comprehensive Certification Test Suite for V9 Phase 128:
 * Installed Model Discovery.
 *
 * Verifies:
 * 1. Discovery via OllamaProviderAdapter and ModelDiscoveryService (/api/tags)
 * 2. Normalization to stable AiModelDto structure (names, IDs, sizes, parameters, families)
 * 3. Safe handling of missing metadata, zero models, single model, and malformed data
 * 4. Controlled TTL caching (30s) and forced refresh behavior
 * 5. Error classification (unavailable, timeout, server error, model not found)
 * 6. Multi-tenant project security and SSRF protection
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { getPrismaClient } from '../../database/client.js';
import {
  AiProviderService,
  OllamaProviderAdapter,
  ModelDiscoveryService,
  AiProviderUnavailableError,
  AiTimeoutError,
  AiProviderError,
  AiInvalidResponseError,
  AiModelNotFoundError,
  AiCrossProjectAccessError,
  AiInvalidRequestError,
  AiConfigInvalidError,
} from '../index.js';
import type { PrismaClient } from '@prisma/client';

describe('V9 Phase 128 — Installed Model Discovery Certification Suite', () => {
  let prisma: PrismaClient;
  let mockServer: http.Server;
  let mockPort: number;
  let mockBaseUrl: string;
  let mockResponseStatus = 200;
  let mockResponseBody: string = '';
  let mockDelayMs = 0;

  const userAId = '00000000-0000-0000-0000-000000000138';
  const userBId = '00000000-0000-0000-0000-000000000139';
  const projectAId = '00000000-0000-0000-0000-000000001280';
  const projectBId = '00000000-0000-0000-0000-000000001281';

  const defaultModelsPayload = {
    models: [
      {
        name: 'llama3.2:latest',
        model: 'llama3.2:latest',
        modified_at: '2026-10-05T10:00:00Z',
        size: 2019393152,
        digest: 'a80c4f172edd55e0',
        details: {
          parent_model: '',
          format: 'gguf',
          family: 'llama',
          families: ['llama'],
          parameter_size: '3.2B',
          quantization_level: 'Q4_K_M',
        },
      },
      {
        name: 'nomic-embed-text:latest',
        model: 'nomic-embed-text:latest',
        modified_at: '2026-10-04T08:00:00Z',
        size: 274302464,
        digest: '0a10c88880c21345',
        details: {
          parent_model: '',
          format: 'gguf',
          family: 'nomic-bert',
          families: ['nomic-bert'],
          parameter_size: '137M',
          quantization_level: 'F16',
        },
      },
      {
        name: 'llava:latest',
        model: 'llava:latest',
        modified_at: '2026-10-03T15:30:00Z',
        size: 4700000000,
        digest: '8c91823719283712',
        details: {
          parent_model: '',
          format: 'gguf',
          family: 'llama',
          families: ['llama', 'clip'],
          parameter_size: '7B',
          quantization_level: 'Q4_0',
        },
      },
    ],
  };

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Database required for Phase 128 certification.');
    }
    prisma = client;

    // Start mock Ollama HTTP server
    mockResponseBody = JSON.stringify(defaultModelsPayload);
    mockServer = http.createServer((req, res) => {
      setTimeout(() => {
        if (req.url === '/api/tags') {
          res.writeHead(mockResponseStatus, { 'Content-Type': 'application/json' });
          res.end(mockResponseBody);
        } else if (req.url === '/api/version') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ version: '0.1.28' }));
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      }, mockDelayMs);
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const address = mockServer.address() as AddressInfo;
        mockPort = address.port;
        mockBaseUrl = `http://127.0.0.1:${mockPort}`;
        resolve();
      });
    });

    // Seed test users and projects
    await prisma.user.upsert({
      where: { id: userAId },
      update: {},
      create: {
        id: userAId,
        email: 'user-a-128@ai-quality.local',
        normalizedEmail: 'user-a-128@ai-quality.local',
        displayName: 'User A 128',
      },
    });

    await prisma.user.upsert({
      where: { id: userBId },
      update: {},
      create: {
        id: userBId,
        email: 'user-b-128@ai-quality.local',
        normalizedEmail: 'user-b-128@ai-quality.local',
        displayName: 'User B 128',
      },
    });

    await prisma.project.upsert({
      where: { id: projectAId },
      update: {},
      create: {
        id: projectAId,
        userId: userAId,
        name: 'Project A 128',
      },
    });

    await prisma.project.upsert({
      where: { id: projectBId },
      update: {},
      create: {
        id: projectBId,
        userId: userBId,
        name: 'Project B 128',
      },
    });
  });

  after(async () => {
    if (mockServer) {
      await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    }
    // Clean up seeded entities
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

  beforeEach(() => {
    mockResponseStatus = 200;
    mockResponseBody = JSON.stringify(defaultModelsPayload);
    mockDelayMs = 0;
  });

  describe('Model Discovery Wire Protocol & Normalization', () => {
    it('discovers multiple models and normalizes metadata accurately', async () => {
      const adapter = new OllamaProviderAdapter({
        endpoint: mockBaseUrl,
        connectionTimeout: 5000,
      });

      const models = await adapter.listModels();
      assert.strictEqual(models.length, 3);

      const llama = models.find((m) => m.name === 'llama3.2:latest');
      assert.ok(llama);
      assert.strictEqual(llama.id, 'llama3.2:latest');
      assert.strictEqual(llama.provider, 'OLLAMA');
      assert.strictEqual(llama.family, 'llama');
      assert.strictEqual(llama.parameters, '3.2B');
      assert.strictEqual(llama.quantization, 'Q4_K_M');
      assert.strictEqual(llama.size, 2019393152);
      assert.strictEqual(llama.capabilities.textGeneration, true);
      assert.strictEqual(llama.capabilities.embeddings, false);
      assert.strictEqual(llama.capabilities.vision, false);

      const nomic = models.find((m) => m.name === 'nomic-embed-text:latest');
      assert.ok(nomic);
      assert.strictEqual(nomic.capabilities.embeddings, true);
      assert.strictEqual(nomic.capabilities.textGeneration, false);

      const llava = models.find((m) => m.name === 'llava:latest');
      assert.ok(llava);
      assert.strictEqual(llava.capabilities.vision, true);
    });

    it('handles single model discovery correctly', async () => {
      mockResponseBody = JSON.stringify({
        models: [
          {
            name: 'phi3:mini',
            size: 1500000000,
            modified_at: '2026-10-05T09:00:00Z',
          },
        ],
      });

      const adapter = new OllamaProviderAdapter({
        endpoint: mockBaseUrl,
        connectionTimeout: 5000,
      });

      const models = await adapter.listModels();
      assert.strictEqual(models.length, 1);
      const first = models[0];
      assert.ok(first);
      assert.strictEqual(first.name, 'phi3:mini');
      assert.strictEqual(first.id, 'phi3:mini');
      assert.strictEqual(first.family, undefined);
      assert.strictEqual(first.parameters, undefined);
    });

    it('handles zero installed models safely (empty models array)', async () => {
      mockResponseBody = JSON.stringify({ models: [] });

      const adapter = new OllamaProviderAdapter({
        endpoint: mockBaseUrl,
        connectionTimeout: 5000,
      });

      const models = await adapter.listModels();
      assert.strictEqual(models.length, 0);
    });

    it('safely handles missing optional fields and partial metadata', async () => {
      mockResponseBody = JSON.stringify({
        models: [
          {
            name: 'mystery-model:latest',
            // No details, no size, no modified_at, no digest
          },
        ],
      });

      const adapter = new OllamaProviderAdapter({
        endpoint: mockBaseUrl,
        connectionTimeout: 5000,
      });

      const models = await adapter.listModels();
      assert.strictEqual(models.length, 1);
      const first = models[0];
      assert.ok(first);
      assert.strictEqual(first.name, 'mystery-model:latest');
      assert.strictEqual(first.id, 'mystery-model:latest');
      assert.strictEqual(first.size, undefined);
      assert.strictEqual(first.digest, undefined);
      assert.strictEqual(first.family, undefined);
      assert.strictEqual(first.quantization, undefined);
    });

    it('rejects malformed response payload that is not an object', async () => {
      mockResponseBody = JSON.stringify('not-an-object');

      const adapter = new OllamaProviderAdapter({
        endpoint: mockBaseUrl,
        connectionTimeout: 5000,
      });

      await assert.rejects(
        async () => adapter.listModels(),
        (err: unknown) => err instanceof AiInvalidResponseError,
      );
    });
  });

  describe('Caching & Invalidation Rules', () => {
    it('uses cached discovery results within TTL window', async () => {
      const discoveryService = new ModelDiscoveryService({
        ttlMs: 10_000,
      });

      // First call (fetches from wire)
      const res1 = await discoveryService.listModels(mockBaseUrl);
      assert.strictEqual(res1.fromCache, false);
      assert.strictEqual(res1.models.length, 3);

      // Modify mock server to return empty array
      mockResponseBody = JSON.stringify({ models: [] });

      // Second call (hits cache)
      const res2 = await discoveryService.listModels(mockBaseUrl);
      assert.strictEqual(res2.fromCache, true);
      assert.strictEqual(res2.models.length, 3); // Still 3 from cache

      // Third call with forceRefresh bypasses cache
      const res3 = await discoveryService.listModels(mockBaseUrl, {
        forceRefresh: true,
      });
      assert.strictEqual(res3.fromCache, false);
      assert.strictEqual(res3.models.length, 0); // Fresh from wire
    });

    it('invalidates cache correctly when requested', async () => {
      const discoveryService = new ModelDiscoveryService({
        ttlMs: 10_000,
      });

      await discoveryService.listModels(mockBaseUrl);

      // Invalidate
      discoveryService.invalidateCache(mockBaseUrl);

      // Wire now returns 1 model
      mockResponseBody = JSON.stringify({
        models: [{ name: 'single-model:latest' }],
      });

      const res = await discoveryService.listModels(mockBaseUrl);
      assert.strictEqual(res.fromCache, false);
      assert.strictEqual(res.models.length, 1);
    });
  });

  describe('Error Classification & Failure Handling', () => {
    it('throws AiProviderUnavailableError when endpoint is unreachable', async () => {
      const adapter = new OllamaProviderAdapter({
        endpoint: 'http://127.0.0.1:65530', // Dead port
        connectionTimeout: 1000,
      });

      await assert.rejects(
        async () => adapter.listModels(),
        (err: unknown) => err instanceof AiProviderUnavailableError,
      );
    });

    it('throws AiTimeoutError when discovery times out', async () => {
      mockDelayMs = 200;

      const adapter = new OllamaProviderAdapter({
        endpoint: mockBaseUrl,
        connectionTimeout: 50, // Shorter than delay
      });

      await assert.rejects(
        async () => adapter.listModels(),
        (err: unknown) => err instanceof AiTimeoutError,
      );
    });

    it('throws AiProviderError on HTTP 500 error', async () => {
      mockResponseStatus = 500;
      mockResponseBody = 'Internal Server Error';

      const adapter = new OllamaProviderAdapter({
        endpoint: mockBaseUrl,
        connectionTimeout: 5000,
      });

      await assert.rejects(
        async () => adapter.listModels(),
        (err: unknown) => err instanceof AiProviderError,
      );
    });
  });

  describe('AiProviderService Integration & Project Isolation', () => {
    it('lists and caches models through AiProviderService for configured project', async () => {
      const service = new AiProviderService();

      // Configure Ollama for Project A
      await service.setOllamaConfig(
        {
          projectId: projectAId,
          endpoint: mockBaseUrl,
          connectionTimeout: 5000,
          enabled: true,
        },
        userAId,
      );

      const result = await service.listAiModels({ projectId: projectAId }, userAId);
      assert.strictEqual(result.provider, 'OLLAMA');
      assert.strictEqual(result.models.length, 3);
      assert.strictEqual(result.fromCache, false);

      // Subsequent call returns cached models
      const cached = await service.listAiModels({ projectId: projectAId }, userAId);
      assert.strictEqual(cached.fromCache, true);

      // Force refresh returns live wire results
      const refreshed = await service.refreshAiModels({ projectId: projectAId }, userAId);
      assert.strictEqual(refreshed.fromCache, false);
      assert.strictEqual(refreshed.models.length, 3);
    });

    it('retrieves single model by ID via getAiModel', async () => {
      const service = new AiProviderService();

      const model = await service.getAiModel(
        {
          projectId: projectAId,
          modelId: 'ollama:llama3.2:latest',
        },
        userAId,
      );

      assert.strictEqual(model.name, 'llama3.2:latest');
      assert.strictEqual(model.id, 'llama3.2:latest');
    });

    it('throws AiModelNotFoundError when requesting nonexistent model ID', async () => {
      const service = new AiProviderService();

      await assert.rejects(
        async () =>
          service.getAiModel(
            {
              projectId: projectAId,
              modelId: 'ollama:nonexistent-model:999b',
            },
            userAId,
          ),
        (err: unknown) => err instanceof AiModelNotFoundError,
      );
    });

    it('enforces strict cross-project isolation (User B cannot list Project A models)', async () => {
      const service = new AiProviderService();

      await assert.rejects(
        async () => service.listAiModels({ projectId: projectAId }, userBId),
        (err: unknown) => err instanceof AiCrossProjectAccessError,
      );
    });

    it('rejects SSRF endpoint manipulation attempt via custom endpoint', async () => {
      const service = new AiProviderService();

      await assert.rejects(
        async () =>
          service.setOllamaConfig(
            {
              projectId: projectAId,
              endpoint: 'http://169.254.169.254/latest/meta-data',
              connectionTimeout: 5000,
              enabled: true,
            },
            userAId,
          ),
        (err: unknown) => err instanceof AiConfigInvalidError,
      );
    });
  });
});
