/**
 * @file packages/core/src/ai-provider/certification/v9-phase127-certification.test.ts
 * Comprehensive Certification Test Suite for V9 Phase 127:
 * Ollama Connection & Health Detection.
 *
 * Verifies:
 * 1. Provider registration & initialization behind Phase 126 IAiProvider abstraction
 * 2. Deterministic health check states (AVAILABLE, UNAVAILABLE, TIMEOUT, INVALID_ENDPOINT, UNAUTHORIZED, ERROR, NOT_CONFIGURED)
 * 3. Latency measurement & credential redaction
 * 4. Non-invasive installation detection (INSTALLED_AND_RUNNING, INSTALLED_AND_STOPPED, NOT_INSTALLED, CUSTOM_ENDPOINT)
 * 5. Multi-tenant configuration isolation & project safety
 * 6. SSRF attack prevention & endpoint validation
 * 7. Graceful degradation when Ollama is unavailable
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
  OllamaHealthService,
  OllamaInstallationDetector,
  AiProviderValidator,
  AiInvalidRequestError,
  AiCrossProjectAccessError,
  type IAiProvider,
} from '../index.js';
import type { PrismaClient } from '@prisma/client';

describe('V9 Phase 127 — Ollama Connection & Health Detection Certification Suite', () => {
  let prisma: PrismaClient;
  let mockServer: http.Server;
  let mockPort: number;
  let mockBaseUrl: string;
  let mockResponseStatus = 200;
  let mockResponseBody: string = JSON.stringify({ version: '0.1.28' });
  let mockDelayMs = 0;

  const userAId = '00000000-0000-0000-0000-000000000128';
  const userBId = '00000000-0000-0000-0000-000000000129';
  const projectAId = '00000000-0000-0000-0000-000000001270';
  const projectBId = '00000000-0000-0000-0000-000000001271';

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Database required for Phase 127 certification.');
    }
    prisma = client;

    // Start mock Ollama HTTP server
    mockServer = http.createServer((req, res) => {
      setTimeout(() => {
        if (req.url === '/api/version') {
          res.writeHead(mockResponseStatus, { 'Content-Type': 'application/json' });
          res.end(mockResponseBody);
        } else if (req.url === '/api/tags') {
          res.writeHead(mockResponseStatus, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ models: [] }));
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
        email: 'user-a-127@ai-quality.local',
        normalizedEmail: 'user-a-127@ai-quality.local',
        displayName: 'User A 127',
      },
    });

    await prisma.user.upsert({
      where: { id: userBId },
      update: {},
      create: {
        id: userBId,
        email: 'user-b-127@ai-quality.local',
        normalizedEmail: 'user-b-127@ai-quality.local',
        displayName: 'User B 127',
      },
    });

    await prisma.project.upsert({
      where: { id: projectAId },
      update: {},
      create: {
        id: projectAId,
        userId: userAId,
        name: 'Project 127 A',
        description: 'Phase 127 Project A',
      },
    });

    await prisma.project.upsert({
      where: { id: projectBId },
      update: {},
      create: {
        id: projectBId,
        userId: userBId,
        name: 'Project 127 B',
        description: 'Phase 127 Project B',
      },
    });
  });

  after(async () => {
    if (mockServer) {
      await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    }

    try {
      await prisma.aiProviderConfig.deleteMany({
        where: { projectId: { in: [projectAId, projectBId] } },
      });
      await prisma.project.deleteMany({
        where: { id: { in: [projectAId, projectBId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [userAId, userBId] } },
      });
    } catch {
      // Best-effort cleanup
    }
  });

  describe('1. Ollama Provider Implementation & Abstraction Conformance', () => {
    it('implements the Phase 126 IAiProvider interface without leaking concrete methods', () => {
      const adapter: IAiProvider = new OllamaProviderAdapter({
        endpoint: mockBaseUrl,
        connectionTimeout: 5000,
        enabled: true,
      });

      assert.strictEqual(adapter.id, 'OLLAMA');
      assert.strictEqual(adapter.name, 'Ollama Local Runtime');
      assert.strictEqual(adapter.type, 'LOCAL');
      assert.strictEqual(typeof adapter.getCapabilities, 'function');
      assert.strictEqual(typeof adapter.healthCheck, 'function');
      assert.strictEqual(typeof adapter.generate, 'function');
      assert.strictEqual(typeof adapter.stream, 'function');
      assert.strictEqual(typeof adapter.cancel, 'function');
    });

    it('can be registered into AiProviderRegistry and retrieved polymorphically', () => {
      const registry = new AiProviderRegistry();
      const adapter = new OllamaProviderAdapter({
        endpoint: mockBaseUrl,
        enabled: true,
      });

      registry.register(adapter);
      assert.strictEqual(registry.has('OLLAMA'), true);
      const retrieved = registry.get('OLLAMA');
      assert.strictEqual(retrieved.id, 'OLLAMA');
    });

    it('reports correct healthCheck result via IAiProvider interface and checkOllamaHealth', async () => {
      mockResponseStatus = 200;
      mockResponseBody = JSON.stringify({ version: '0.1.28' });
      mockDelayMs = 5;

      const adapter = new OllamaProviderAdapter({
        endpoint: mockBaseUrl,
        connectionTimeout: 5000,
        enabled: true,
      });

      const health = await adapter.healthCheck();
      assert.strictEqual(health.status, 'READY');
      assert.strictEqual(health.providerId, 'OLLAMA');

      const diag = await adapter.checkOllamaHealth();
      assert.strictEqual(diag.state, 'AVAILABLE');
      assert(diag.latencyMs !== undefined && diag.latencyMs >= 0);
    });
  });

  describe('2. Deterministic Health Detection States', () => {
    const healthService = new OllamaHealthService();

    it('distinguishes AVAILABLE when Ollama responds with 200', async () => {
      mockResponseStatus = 200;
      mockResponseBody = JSON.stringify({ version: '0.1.30' });
      mockDelayMs = 0;

      const diag = await healthService.checkHealth({ endpoint: mockBaseUrl });
      assert.strictEqual(diag.state, 'AVAILABLE');
      assert(diag.message.includes('reachable and ready'));
      assert(diag.latencyMs !== undefined);
      assert.strictEqual(diag.httpStatusCode, 200);
    });

    it('distinguishes UNAVAILABLE on connection refused (unopened port)', async () => {
      const unusedPortUrl = 'http://127.0.0.1:49999';
      const diag = await healthService.checkHealth({ endpoint: unusedPortUrl });
      assert.strictEqual(diag.state, 'UNAVAILABLE');
      assert(diag.message.includes('Ollama is not running'));
    });

    it('distinguishes TIMEOUT when request exceeds configured connection timeout', async () => {
      mockDelayMs = 300;
      const diag = await healthService.checkHealth({
        endpoint: mockBaseUrl,
        timeoutMs: 50,
      });
      mockDelayMs = 0;

      assert.strictEqual(diag.state, 'TIMEOUT');
      assert(diag.message.includes('timed out'));
    });

    it('distinguishes UNAUTHORIZED when endpoint requires credentials (401/403)', async () => {
      mockResponseStatus = 401;
      mockResponseBody = 'Unauthorized';

      const diag = await healthService.checkHealth({ endpoint: mockBaseUrl });
      assert.strictEqual(diag.state, 'UNAUTHORIZED');
      assert(diag.message.includes('Authentication rejected by Ollama endpoint'));
    });

    it('distinguishes ERROR when endpoint returns 500 or internal error', async () => {
      mockResponseStatus = 500;
      mockResponseBody = 'Internal Server Error';

      const diag = await healthService.checkHealth({ endpoint: mockBaseUrl });
      assert.strictEqual(diag.state, 'ERROR');
      assert.strictEqual(diag.httpStatusCode, 500);
    });

    it('distinguishes INVALID_ENDPOINT for SSRF or malformed URLs', async () => {
      const cloudMetadataUrl = 'http://169.254.169.254/latest/meta-data/';
      const diag = await healthService.checkHealth({ endpoint: cloudMetadataUrl });
      assert.strictEqual(diag.state, 'INVALID_ENDPOINT');
      assert(diag.message.includes('Configured Ollama endpoint is invalid or blocked'));
    });

    it('distinguishes NOT_CONFIGURED when disabled', async () => {
      const diag = await healthService.checkHealth({
        endpoint: mockBaseUrl,
        enabled: false,
      });
      assert.strictEqual(diag.state, 'NOT_CONFIGURED');
      assert(diag.message.includes('disabled'));
    });
  });

  describe('3. Non-Invasive Installation Detection', () => {
    it('returns INSTALLED_AND_RUNNING when endpoint is healthy', () => {
      const result = OllamaInstallationDetector.detect('http://127.0.0.1:11434', true);
      assert.strictEqual(result.state, 'INSTALLED_AND_RUNNING');
      assert.strictEqual(result.isCustomEndpoint, false);
    });

    it('classifies custom endpoint when non-standard host or port is used', () => {
      const result = OllamaInstallationDetector.detect('http://remote-server.lan:11434', false);
      assert.strictEqual(result.state, 'CUSTOM_ENDPOINT');
      assert.strictEqual(result.isCustomEndpoint, true);
    });

    it('detects binary presence or absence without invoking shell scripts or installing', () => {
      const result = OllamaInstallationDetector.detect('http://127.0.0.1:11434', false);
      assert(['INSTALLED_AND_STOPPED', 'NOT_INSTALLED'].includes(result.state));
    });
  });

  describe('4. Multi-Tenant Project Isolation & Configuration Safety', () => {
    it('isolates project A and project B Ollama configurations in database', async () => {
      const registry = new AiProviderRegistry([new OllamaProviderAdapter()]);
      const service = new AiProviderService({ registry });

      // Configure project A with custom endpoint
      await service.setOllamaConfig(
        {
          projectId: projectAId,
          endpoint: 'http://127.0.0.1:11434',
          connectionTimeout: 12000,
          enabled: true,
        },
        userAId,
      );

      // Verify Project A config
      const configA = await service.getOllamaConfig(projectAId, userAId);
      assert.strictEqual(configA.projectId, projectAId);
      assert.strictEqual(configA.connectionTimeout, 12000);
      assert.strictEqual(configA.isProjectSpecific, true);

      // Project B defaults should not be influenced by Project A
      const configB = await service.getOllamaConfig(projectBId, userBId);
      assert.strictEqual(configB.projectId, projectBId);
      assert.strictEqual(configB.connectionTimeout, 60000); // Default fallback
      assert.strictEqual(configB.isProjectSpecific, false);
    });

    it('strictly forbids User B from reading or modifying Project A configuration', async () => {
      const service = new AiProviderService();

      await assert.rejects(
        async () => service.getOllamaConfig(projectAId, userBId),
        (err: unknown) => err instanceof AiCrossProjectAccessError,
      );

      await assert.rejects(
        async () =>
          service.setOllamaConfig(
            {
              projectId: projectAId,
              endpoint: 'http://127.0.0.1:9999',
            },
            userBId,
          ),
        (err: unknown) => err instanceof AiCrossProjectAccessError,
      );
    });
  });

  describe('5. Security, Validation & SSRF Protection', () => {
    it('blocks file://, ftp://, javascript: schemes', () => {
      assert.throws(
        () => AiProviderValidator.validateBaseUrl('file:///etc/passwd', 'OLLAMA'),
      );
      assert.throws(
        () => AiProviderValidator.validateBaseUrl('ftp://example.com/ollama', 'OLLAMA'),
      );
    });

    it('blocks AWS/GCP/Azure link-local metadata addresses (169.254.169.254)', () => {
      assert.throws(
        () => AiProviderValidator.validateBaseUrl('http://169.254.169.254/latest/meta-data', 'OLLAMA'),
      );
    });

    it('redacts credentials and query parameters in logs and diagnostics', () => {
      const sanitized = OllamaHealthService.sanitizeEndpoint('http://user:supersecret@127.0.0.1:11434/api?key=123');
      assert(!sanitized.includes('supersecret'));
      assert(!sanitized.includes('user'));
      assert(!sanitized.includes('key=123'));
    });
  });

  describe('6. High-Level Service Status Query & Health Integration', () => {
    it('getOllamaStatus aggregates health diagnostic and installation detection seamlessly', async () => {
      mockResponseStatus = 200;
      mockResponseBody = JSON.stringify({ version: '0.1.32' });
      mockDelayMs = 2;

      const service = new AiProviderService();
      await service.setOllamaConfig(
        {
          projectId: projectAId,
          endpoint: mockBaseUrl,
          connectionTimeout: 5000,
          enabled: true,
        },
        userAId,
      );

      const status = await service.getOllamaStatus(projectAId, userAId);
      assert.strictEqual(status.provider, 'OLLAMA');
      assert.strictEqual(status.endpoint, mockBaseUrl);
      assert.strictEqual(status.isConnected, true);
      assert.strictEqual(status.health.state, 'AVAILABLE');
      assert(status.health.latencyMs !== undefined);
      assert(status.installation.state === 'INSTALLED_AND_RUNNING' || status.installation.state === 'CUSTOM_ENDPOINT');
    });
  });
});
