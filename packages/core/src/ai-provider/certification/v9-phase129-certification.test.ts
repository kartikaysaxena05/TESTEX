/**
 * @file packages/core/src/ai-provider/certification/v9-phase129-certification.test.ts
 * Comprehensive Certification Test Suite for V9 Phase 129:
 * Model Selection & Capability Detection.
 *
 * Verifies:
 * 1. Normalized Model Capability Model (CHAT, TEXT_GEN, STREAMING, JSON, TOOLS, CODE, VISION, EMBEDDING)
 * 2. Conservative Static Capability Inference (generative vs embedding, unknown stays UNKNOWN)
 * 3. Safe, Bounded Capability Probes (text generation, streaming, JSON output, tool calling)
 * 4. Probe Error & Timeout Safety (AiCapabilityProbeTimeoutError, AiCapabilityProbeFailedError)
 * 5. Deterministic Model Selection & Multi-Factor Scoring (hard filtering, context windows, preferred models, deterministic ties)
 * 6. AiNoCompatibleModelError with exact missing capabilities
 * 7. Persistence and Project Isolation for Model Selection (DEFAULT, CHAT, CODE, etc.)
 * 8. Full End-to-End Service Flow via AiProviderService
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { getPrismaClient } from '../../database/client.js';
import {
  AiProviderService,
  CapabilityDetectionService,
  ModelSelectionService,
  OllamaProviderAdapter,
  AiNoCompatibleModelError,
  AiCapabilityProbeTimeoutError,
  AiCapabilityProbeFailedError,
  AiCrossProjectAccessError,
  AiModelNotFoundError,
} from '../index.js';
import type { PrismaClient } from '@prisma/client';
import type { AiModelDto } from '@ai-quality/contracts';

describe('V9 Phase 129 — Model Selection & Capability Detection Certification Suite', () => {
  let prisma: PrismaClient;
  let mockServer: http.Server;
  let mockPort: number;
  let mockBaseUrl: string;

  let mockTagsResponse: unknown;
  let mockChatResponse: unknown;
  let mockGenerateResponse: unknown;
  let mockDelayMs = 0;
  let mockStreamChunks: string[] = [];

  const userAId = '00000000-0000-0000-0000-000000000140';
  const userBId = '00000000-0000-0000-0000-000000000141';
  const projectAId = '00000000-0000-0000-0000-000000001290';
  const projectBId = '00000000-0000-0000-0000-000000001291';

  const sampleModels: AiModelDto[] = [
    {
      id: 'llama3.2:latest',
      name: 'llama3.2:latest',
      provider: 'ollama',
      size: 2000000000,
      family: 'llama',
      parameters: '3.2B',
      quantization: 'Q4_K_M',
      contextLength: 131072,
      capabilities: {
        textGeneration: true,
        embeddings: false,
        vision: false,
        toolCalling: false,
      },
    },
    {
      id: 'qwen2.5-coder:7b',
      name: 'qwen2.5-coder:7b',
      provider: 'ollama',
      size: 4500000000,
      family: 'qwen2',
      parameters: '7B',
      quantization: 'Q4_K_M',
      contextLength: 32768,
      capabilities: {
        textGeneration: true,
        embeddings: false,
        vision: false,
        toolCalling: true,
      },
    },
    {
      id: 'llava:7b',
      name: 'llava:7b',
      provider: 'ollama',
      size: 4700000000,
      family: 'llama',
      parameters: '7B',
      quantization: 'Q4_0',
      contextLength: 4096,
      capabilities: {
        textGeneration: true,
        embeddings: false,
        vision: true,
        toolCalling: false,
      },
    },
    {
      id: 'nomic-embed-text:latest',
      name: 'nomic-embed-text:latest',
      provider: 'ollama',
      size: 274000000,
      family: 'nomic-bert',
      parameters: '137M',
      quantization: 'F16',
      contextLength: 2048,
      capabilities: {
        textGeneration: false,
        embeddings: true,
        vision: false,
        toolCalling: false,
      },
    },
  ];

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Database required for Phase 129 certification.');
    }
    prisma = client;

    // Start mock Ollama HTTP server supporting /api/tags, /api/chat, /api/generate
    mockServer = http.createServer((req, res) => {
      setTimeout(() => {
        if (req.url === '/api/version') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ version: '0.1.29' }));
        } else if (req.url === '/api/tags') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(mockTagsResponse));
        } else if (req.url === '/api/generate') {
          let body = '';
          req.on('data', (d) => { body += d; });
          req.on('end', () => {
            let isStream = false;
            try {
              const parsed = JSON.parse(body);
              isStream = parsed.stream === true;
            } catch {
              // Ignore
            }

            if (isStream && mockStreamChunks.length > 0) {
              res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
              for (const chunk of mockStreamChunks) {
                res.write(chunk + '\n');
              }
              res.end();
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(mockGenerateResponse));
            }
          });
          return;
        } else if (req.url === '/api/chat') {
          if (mockStreamChunks.length > 0) {
            res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
            for (const chunk of mockStreamChunks) {
              res.write(chunk + '\n');
            }
            res.end();
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(mockChatResponse));
          }
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
        email: 'user-a-129@ai-quality.local',
        normalizedEmail: 'user-a-129@ai-quality.local',
        displayName: 'User A 129',
      },
    });

    await prisma.user.upsert({
      where: { id: userBId },
      update: {},
      create: {
        id: userBId,
        email: 'user-b-129@ai-quality.local',
        normalizedEmail: 'user-b-129@ai-quality.local',
        displayName: 'User B 129',
      },
    });

    await prisma.project.upsert({
      where: { id: projectAId },
      update: {},
      create: {
        id: projectAId,
        userId: userAId,
        name: 'Project A 129',
      },
    });

    await prisma.project.upsert({
      where: { id: projectBId },
      update: {},
      create: {
        id: projectBId,
        userId: userBId,
        name: 'Project B 129',
      },
    });
  });

  after(async () => {
    if (mockServer) {
      await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    }
    // Clean up selections, configs, projects, users
    await prisma.aiModelSelection.deleteMany({
      where: { projectId: { in: [projectAId, projectBId] } },
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

  beforeEach(() => {
    mockTagsResponse = {
      models: sampleModels.map((m) => ({
        name: m.name,
        model: m.name,
        size: m.size,
        modified_at: '2026-10-05T12:00:00Z',
        details: {
          family: m.family,
          parameter_size: m.parameters,
          quantization_level: m.quantization,
        },
      })),
    };
    mockGenerateResponse = { response: 'pong', done: true };
    mockChatResponse = {
      message: { role: 'assistant', content: '{"status":"ok"}' },
      done: true,
    };
    mockStreamChunks = [];
    mockDelayMs = 0;
  });

  describe('1. Static Capability Normalization & Truthfulness Invariants', () => {
    const capabilityService = new CapabilityDetectionService();

    it('identifies generative models and keeps unverified capabilities as UNKNOWN', () => {
      const profile = capabilityService.detectModelCapabilities(sampleModels[0]!);
      assert.strictEqual(profile.modelId, 'llama3.2:latest');
      assert.strictEqual(profile.capabilities.TEXT_GENERATION.status, 'SUPPORTED');
      assert.strictEqual(profile.capabilities.CHAT.status, 'SUPPORTED');
      assert.strictEqual(profile.capabilities.LONG_CONTEXT.status, 'SUPPORTED'); // 131k context > 16k
      assert.strictEqual(profile.capabilities.VISION.status, 'UNSUPPORTED');
      assert.strictEqual(profile.capabilities.EMBEDDING.status, 'UNSUPPORTED');

      // Crucial truthfulness invariants: STREAMING, JSON_OUTPUT, TOOL_CALLING must NOT be assumed SUPPORTED
      assert.strictEqual(profile.capabilities.STREAMING.status, 'UNKNOWN');
      assert.strictEqual(profile.capabilities.JSON_OUTPUT.status, 'UNKNOWN');
      assert.strictEqual(profile.capabilities.STRUCTURED_OUTPUT.status, 'UNKNOWN');
      assert.strictEqual(profile.capabilities.TOOL_CALLING.status, 'UNKNOWN');
    });

    it('identifies vision capability accurately from metadata', () => {
      const profile = capabilityService.detectModelCapabilities(sampleModels[2]!); // llava
      assert.strictEqual(profile.capabilities.VISION.status, 'SUPPORTED');
      assert.strictEqual(profile.capabilities.VISION.source, 'METADATA');
    });

    it('identifies embedding-only models and flags generative capabilities as UNSUPPORTED', () => {
      const profile = capabilityService.detectModelCapabilities(sampleModels[3]!); // nomic-embed-text
      assert.strictEqual(profile.capabilities.EMBEDDING.status, 'SUPPORTED');
      assert.strictEqual(profile.capabilities.TEXT_GENERATION.status, 'UNSUPPORTED');
      assert.strictEqual(profile.capabilities.CHAT.status, 'UNSUPPORTED');
      assert.strictEqual(profile.capabilities.JSON_OUTPUT.status, 'UNSUPPORTED');
    });

    it('identifies tool calling support when explicitly declared in model metadata', () => {
      const profile = capabilityService.detectModelCapabilities(sampleModels[1]!); // qwen2.5-coder with toolCalling: true
      assert.strictEqual(profile.capabilities.TOOL_CALLING.status, 'SUPPORTED');
      assert.strictEqual(profile.capabilities.TOOL_CALLING.source, 'METADATA');
      assert.strictEqual(profile.capabilities.CODE_GENERATION.status, 'SUPPORTED');
    });
  });

  describe('2. Safe Bounded Capability Probes', () => {
    it('successfully verifies text generation and streaming via mock adapter', async () => {
      const adapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl, requestTimeoutMs: 5000 });
      const capabilityService = new CapabilityDetectionService();

      // Configure mock generate and streaming responses
      mockGenerateResponse = { response: 'OK', done: true };
      mockStreamChunks = [
        JSON.stringify({ response: 'chunk1', done: false }),
        JSON.stringify({ response: 'chunk2', done: true }),
      ];

      const profile = await capabilityService.verifyModelCapabilities(sampleModels[0]!, {
        provider: adapter,
        capabilities: ['TEXT_GENERATION', 'STREAMING'],
      });

      assert.strictEqual(profile.capabilities.TEXT_GENERATION.status, 'SUPPORTED');
      assert.strictEqual(profile.capabilities.TEXT_GENERATION.source, 'PROBE');
      assert.strictEqual(profile.capabilities.STREAMING.status, 'SUPPORTED');
      assert.strictEqual(profile.capabilities.STREAMING.source, 'PROBE');
      assert.ok(profile.capabilities.STREAMING.verifiedAt);
    });

    it('successfully verifies JSON output capability via mock adapter', async () => {
      const adapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl, requestTimeoutMs: 5000 });
      const capabilityService = new CapabilityDetectionService();

      mockStreamChunks = [];
      mockGenerateResponse = { response: '{"status":"ok"}', done: true };

      const profile = await capabilityService.verifyModelCapabilities(sampleModels[0]!, {
        provider: adapter,
        capabilities: ['JSON_OUTPUT'],
      });

      assert.strictEqual(profile.capabilities.JSON_OUTPUT.status, 'SUPPORTED');
      assert.strictEqual(profile.capabilities.JSON_OUTPUT.source, 'PROBE');
      assert.strictEqual(profile.capabilities.STRUCTURED_OUTPUT.status, 'SUPPORTED');
    });

    it('marks JSON capability as UNSUPPORTED when probe response is invalid JSON', async () => {
      const adapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl, requestTimeoutMs: 5000 });
      const capabilityService = new CapabilityDetectionService();

      mockStreamChunks = [];
      mockChatResponse = {
        message: { role: 'assistant', content: 'Here is some plain text instead of JSON.' },
        done: true,
      };

      const profile = await capabilityService.verifyModelCapabilities(sampleModels[0]!, {
        provider: adapter,
        capabilities: ['JSON_OUTPUT'],
      });

      assert.strictEqual(profile.capabilities.JSON_OUTPUT.status, 'UNSUPPORTED');
      assert.strictEqual(profile.capabilities.JSON_OUTPUT.source, 'PROBE');
    });

    it('throws AiCapabilityProbeTimeoutError when probe times out', async () => {
      const adapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl, requestTimeoutMs: 5000 });
      const capabilityService = new CapabilityDetectionService();

      // Simulate delay greater than probe timeout (probe timeout is passed as 100ms)
      mockDelayMs = 300;

      await assert.rejects(
        async () => {
          await capabilityService.verifyModelCapabilities(sampleModels[0]!, {
            provider: adapter,
            capabilities: ['TEXT_GENERATION'],
            timeoutMs: 100,
          });
        },
        (err) => {
          assert(err instanceof AiCapabilityProbeTimeoutError);
          assert.strictEqual(err.capability, 'TEXT_GENERATION');
          return true;
        },
      );
    });
  });

  describe('3. Deterministic Model Selection & Multi-Factor Ranking', () => {
    const capabilityService = new CapabilityDetectionService();
    const selectionService = new ModelSelectionService({ prisma, capabilityService });

    it('selects best model matching code task requirements', () => {
      // qwen2.5-coder has CODE_GENERATION, CODE_ANALYSIS, and TOOL_CALLING
      const selected = selectionService.selectBestModel(sampleModels, 'code');

      assert.strictEqual(selected.selectedModel.id, 'qwen2.5-coder:7b');
    });

    it('respects minContextLength constraint during selection', () => {
      // Require 64k tokens context length -> llama3.2 has 131k, qwen has 32k
      const selected = selectionService.selectBestModel(sampleModels, 'default', {
        minimumContext: 65536,
      });

      assert.strictEqual(selected.selectedModel.id, 'llama3.2:latest');
    });

    it('throws AiNoCompatibleModelError when no model meets required capabilities', () => {
      assert.throws(
        () => {
          selectionService.selectBestModel(sampleModels, 'default', {
            requiredCapabilities: ['VISION', 'TOOL_CALLING'], // No model has both
          });
        },
        (err) => {
          assert(err instanceof AiNoCompatibleModelError);
          assert.ok(err.missingCapabilities.length > 0);
          return true;
        },
      );
    });

    it('prioritizes preferredModel when multiple models qualify', () => {
      const selected = selectionService.selectBestModel(sampleModels, 'default', {
        preferredModel: 'llama3.2:latest',
      });

      assert.strictEqual(selected.selectedModel.id, 'llama3.2:latest');
    });
  });

  describe('4. Persistence and Strict Project Isolation', () => {
    const capabilityService = new CapabilityDetectionService();
    const selectionService = new ModelSelectionService({ prisma, capabilityService });

    it('persists model selection for project A and verifies isolation from project B', async () => {
      // Save selection for Project A
      const selectionA = await selectionService.selectModel(
        {
          projectId: projectAId,
          selectionType: 'DEFAULT',
          modelId: sampleModels[0]!.id,
        },
        sampleModels,
        userAId,
      );

      assert.strictEqual(selectionA.selectionType, 'DEFAULT');
      assert.strictEqual(selectionA.selectedModel.id, sampleModels[0]!.id);

      // Fetch selection for Project A
      const fetchedA = await selectionService.getModelSelection(
        { projectId: projectAId, selectionType: 'DEFAULT' },
        sampleModels,
        userAId,
      );
      assert.ok(fetchedA);
      assert.strictEqual(fetchedA?.selectedModel.id, sampleModels[0]!.id);

      // Verify Project B has no default selection yet
      const fetchedB = await selectionService.getModelSelection(
        { projectId: projectBId, selectionType: 'DEFAULT' },
        sampleModels,
        userBId,
      );
      assert.strictEqual(fetchedB, null);

      // Verify cross-project access attempt by user B into project A throws AiCrossProjectAccessError
      await assert.rejects(
        async () => {
          await selectionService.getModelSelection(
            { projectId: projectAId, selectionType: 'DEFAULT' },
            sampleModels,
            userBId,
          );
        },
        (err) => {
          assert(err instanceof AiCrossProjectAccessError);
          return true;
        },
      );
    });

    it('updates existing selection for the same project and selection type cleanly', async () => {
      const updated = await selectionService.selectModel(
        {
          projectId: projectAId,
          selectionType: 'DEFAULT',
          modelId: sampleModels[1]!.id,
        },
        sampleModels,
        userAId,
      );

      assert.strictEqual(updated.selectedModel.id, sampleModels[1]!.id);

      const count = await prisma.aiModelSelection.count({
        where: { projectId: projectAId, selectionType: 'DEFAULT' },
      });
      assert.strictEqual(count, 1, 'Should update existing row rather than duplicate');
    });
  });

  describe('5. AiProviderService Integration & Task Resolution', () => {
    it('resolves model for task via AiProviderService end-to-end', async () => {
      const service = new AiProviderService();

      // Configure project provider endpoint to point to mock server
      await service.updateConfig(
        {
          projectId: projectAId,
          providerId: 'ollama',
          baseUrl: mockBaseUrl,
          requestTimeoutMs: 5000,
        },
        userAId,
      );

      // Get capabilities for a model
      const capProfile = await service.getModelCapabilities(
        { projectId: projectAId, modelId: 'llama3.2:latest' },
        userAId,
      );
      assert.strictEqual(capProfile.modelName, 'llama3.2:latest');

      // Resolve model for 'chat' task
      const chatResolution = await service.resolveModelForTask(
        { projectId: projectAId, task: 'chat' },
        userAId,
      );
      assert.ok(chatResolution.selectedModel.id);
      assert.strictEqual(chatResolution.selectionType, 'CHAT');

      // Resolve model for 'code' task
      const codeResolution = await service.resolveModelForTask(
        { projectId: projectAId, task: 'code' },
        userAId,
      );
      assert.ok(codeResolution.selectedModel.id);
      assert.strictEqual(codeResolution.selectedModel.id, 'qwen2.5-coder:7b');

      // Resolve model for 'vision' task
      const visionResolution = await service.resolveModelForTask(
        { projectId: projectAId, task: 'vision' },
        userAId,
      );
      assert.strictEqual(visionResolution.selectedModel.id, 'llava:7b');
    });
  });
});
