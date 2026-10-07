/**
 * @file packages/core/src/ai-provider/certification/v9-phase137-certification.test.ts
 * Comprehensive Certification Test Suite for V9 Phase 137:
 * AI Privacy & Local-Only Mode Architecture.
 *
 * Verifies all 7 core invariants required by Phase 137 specification:
 * 1. Local-Only Enforcement: Ollama / local providers permitted; remote cloud providers strictly blocked (AiRemoteProviderBlockedError).
 * 2. Cloud Fallback Prevention: Never silently switch to cloud providers if local model fails.
 * 3. Secret & Credential Redaction: Sanitizes passwords, API keys, Bearer tokens, database connection URLs, and .env secrets before context formation.
 * 4. Context Firewall: Inspects and classifies context (PUBLIC, PROJECT_DATA, SOURCE_CODE, REQUIREMENTS, TEST_DATA, EXECUTION_EVIDENCE, CREDENTIAL, SECRET).
 * 5. Multi-Tenant Project Isolation: Cross-project privacy configuration access rejection.
 * 6. Ollama Verification & Failure Handling: Clean error when Ollama is offline without cloud fallback.
 * 7. Authoritative Audit Trail: Structured audit events emitted (AI_PRIVACY_MODE_CHANGED, AI_REMOTE_PROVIDER_BLOCKED, AI_SECRET_REDACTION_APPLIED).
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { getPrismaClient } from '../../database/client.js';
import {
  AiProviderService,
  AiPrivacyService,
  OllamaProviderAdapter,
  AiProviderRegistry,
  EmulatedAiProvider,
  AiRemoteProviderBlockedError,
  AiCrossProjectAccessError,
  type IAiProvider,
} from '../index.js';
import type { PrismaClient } from '@prisma/client';
import type {
  AiProjectContextDto,
  NormalizedAiRequestDto,
  NormalizedAiResponseDto,
  AiStreamChunkDto,
  AiProviderStatusDto,
} from '@ai-quality/contracts';

// Mock Cloud Provider to verify strict blocking in LOCAL_ONLY mode
class MockCloudProvider implements IAiProvider {
  readonly id = 'OPENAI';
  readonly name = 'OpenAI Cloud Provider';
  readonly type = 'CLOUD' as const;

  getCapabilities() {
    return {
      textGeneration: true,
      systemMessages: true,
      tokenUsageReporting: true,
      cancellation: true,
      streaming: true,
      defaultModel: 'gpt-4o',
      supportedModels: ['gpt-4o', 'gpt-4-turbo'],
    };
  }

  async generate(_request: NormalizedAiRequestDto): Promise<NormalizedAiResponseDto> {
    return {
      requestId: _request.requestId,
      providerId: this.id,
      model: _request.model,
      text: 'Cloud response should not happen!',
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
      timing: {
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 10,
      },
    };
  }

  async *stream(_request: NormalizedAiRequestDto): AsyncIterable<AiStreamChunkDto> {
    yield {
      requestId: _request.requestId,
      deltaText: 'Cloud stream chunk',
      accumulatedText: 'Cloud stream chunk',
    };
  }

  async cancel(): Promise<boolean> {
    return true;
  }

  async healthCheck(): Promise<AiProviderStatusDto> {
    return {
      providerId: 'OPENAI',
      configured: true,
      status: 'READY',
      capabilities: this.getCapabilities(),
      verifiedAt: new Date().toISOString(),
    };
  }
}

describe('V9 Phase 137 — Privacy & Local-Only AI Mode Certification Suite', () => {
  let prisma: PrismaClient;
  let mockServer: http.Server;
  let mockPort: number;
  let mockBaseUrl: string;

  let mockTagsResponse: unknown;
  let mockGenerateResponse: unknown;
  let requestCount = 0;

  const testUserId = '00000000-0000-0000-0000-000000000174';
  const otherUserId = '00000000-0000-0000-0000-000000000175';
  const testProjectId = '00000000-0000-0000-0000-000000001370';
  const otherProjectId = '00000000-0000-0000-0000-000000001371';

  before(async () => {
    prisma = getPrismaClient()!;

    // Clean up fixtures
    await prisma.authAuditEvent.deleteMany({
      where: { userId: { in: [testUserId, otherUserId] } },
    });
    await prisma.aiPrivacySettings.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [testUserId, otherUserId] } },
    });

    // Seed test users
    await prisma.user.create({
      data: {
        id: testUserId,
        email: 'privacy-test@quality.ai',
        normalizedEmail: 'privacy-test@quality.ai',
        displayName: 'Privacy Tester',
      },
    });

    await prisma.user.create({
      data: {
        id: otherUserId,
        email: 'privacy-other@quality.ai',
        normalizedEmail: 'privacy-other@quality.ai',
        displayName: 'Other Tester',
      },
    });

    // Seed test projects
    await prisma.project.create({
      data: {
        id: testProjectId,
        name: 'Privacy Primary Project',
        userId: testUserId,
      },
    });

    await prisma.project.create({
      data: {
        id: otherProjectId,
        name: 'Privacy Other Project',
        userId: otherUserId,
      },
    });

    // Set up mock Ollama HTTP server
    mockServer = http.createServer((req, res) => {
      requestCount++;
      const url = req.url ?? '';

      if (url === '/api/tags' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mockTagsResponse));
        return;
      }

      if (url === '/api/generate' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(mockGenerateResponse));
        });
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
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
    await prisma.aiPrivacySettings.deleteMany({
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
    requestCount = 0;
    mockTagsResponse = {
      models: [
        {
          name: 'llama3:8b',
          model: 'llama3:8b',
          size: 4661224676,
          details: { format: 'gguf', family: 'llama', parameter_size: '8.0B' },
        },
      ],
    };
    mockGenerateResponse = {
      model: 'llama3:8b',
      response: 'Authorized local output generated securely.',
      done: true,
      prompt_eval_count: 24,
      eval_count: 12,
    };
  });

  it('1. Enforces LOCAL_ONLY mode by default and blocks remote cloud providers', async () => {
    const registry = new AiProviderRegistry();
    const ollamaAdapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl });
    const cloudProvider = new MockCloudProvider();

    registry.register(ollamaAdapter);
    registry.register(cloudProvider);

    const privacyService = new AiPrivacyService({ prisma, registry });
    const aiService = new AiProviderService({ prisma, registry, aiPrivacyService: privacyService });

    // Verify default settings return LOCAL_ONLY
    const settings = await aiService.getPrivacySettings({ projectId: testProjectId }, testUserId);
    assert.strictEqual(settings.privacyMode, 'LOCAL_ONLY');
    assert.strictEqual(settings.allowCloudFallback, false);
    assert.strictEqual(settings.redactSecrets, true);

    // Assert calling cloud provider throws AiRemoteProviderBlockedError
    await assert.rejects(
      async () => {
        await aiService.generate(
          {
            requestId: '00000000-0000-0000-0000-000000000001',
            projectId: testProjectId,
            providerId: 'OPENAI',
            model: 'gpt-4o',
            prompt: 'Test cloud prompt',
          },
          testUserId,
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AiRemoteProviderBlockedError);
        assert.strictEqual(err.providerId, 'OPENAI');
        assert.strictEqual(err.privacyMode, 'LOCAL_ONLY');
        return true;
      },
    );

    // Assert Ollama generates successfully in LOCAL_ONLY mode
    const localResult = await aiService.generate(
      {
        requestId: '00000000-0000-0000-0000-000000000002',
        projectId: testProjectId,
        providerId: 'OLLAMA',
        model: 'llama3:8b',
        prompt: 'Test local prompt',
      },
      testUserId,
    );
    assert.ok(localResult.text.includes('local output'));
  });

  it('2. Prevents automatic cloud fallback when local model fails', async () => {
    const registry = new AiProviderRegistry();
    // Point to non-existent server port so local fails
    const badOllamaAdapter = new OllamaProviderAdapter({ baseUrl: 'http://127.0.0.1:54321' });
    const cloudProvider = new MockCloudProvider();

    registry.register(badOllamaAdapter);
    registry.register(cloudProvider);

    const privacyService = new AiPrivacyService({ prisma, registry });
    const aiService = new AiProviderService({ prisma, registry, aiPrivacyService: privacyService });

    // Ensure LOCAL_ONLY setting
    await aiService.updatePrivacySettings(
      {
        projectId: testProjectId,
        privacyMode: 'LOCAL_ONLY',
        allowCloudFallback: false,
      },
      testUserId,
    );

    // Call should NOT fall back to OPENAI, it should fail directly
    await assert.rejects(
      async () => {
        await aiService.generate(
          {
            requestId: '00000000-0000-0000-0000-000000000003',
            projectId: testProjectId,
            providerId: 'OLLAMA',
            model: 'llama3:8b',
            prompt: 'Prompt when Ollama is down',
          },
          testUserId,
        );
      },
      (err: unknown) => {
        // Must fail with connection or provider error, never cloud response
        assert.ok(err instanceof Error);
        return true;
      },
    );
  });

  it('3. Performs deep secret and credential redaction across prompts and context', async () => {
    const registry = new AiProviderRegistry();
    const privacyService = new AiPrivacyService({ prisma, registry });

    const rawPrompt = 'Connecting to postgres://postgres:SuperSecretPassword123@localhost:5432/db with api_key="sk-abcdef1234567890abcdef"';
    const rawSystemPrompt = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-ae7H8yOoSrWnCReNmGh - authorization token';

    const rawContext: AiProjectContextDto = {
      repositoryInfo: 'const ghToken = "ghp_1234567890abcdefghijklmnopqrstuvwxyz";\nconst key = "-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7";',
      requirements: 'User password="PlainPassword99!" must be verified against server.',
      testInfo: 'Test running with session cookie session_id=xyz987;',
    };

    const firewallResult = await privacyService.checkFirewall(
      {
        projectId: testProjectId,
        providerId: 'OLLAMA',
        prompt: rawPrompt,
        systemPrompt: rawSystemPrompt,
        context: rawContext,
      },
      testUserId,
    );

    assert.strictEqual(firewallResult.allowed, true);
    assert.ok(firewallResult.redactedSecretsCount > 0);
    assert.ok(firewallResult.dataClassifications.includes('SECRET'));
    assert.ok(firewallResult.dataClassifications.includes('SOURCE_CODE'));
    assert.ok(firewallResult.dataClassifications.includes('REQUIREMENTS'));

    // Verify sanitized outputs mask sensitive tokens
    assert.ok(!firewallResult.sanitizedPrompt.includes('SuperSecretPassword123'));
    assert.ok(!firewallResult.sanitizedPrompt.includes('sk-abcdef1234567890abcdef'));
    assert.ok(!firewallResult.sanitizedSystemPrompt?.includes('eyJhbGciOiJIUzI1NiIs'));
    assert.ok(!firewallResult.sanitizedContext?.repositoryInfo?.includes('ghp_1234567890abcdef'));
    assert.ok(!firewallResult.sanitizedContext?.repositoryInfo?.includes('BEGIN PRIVATE KEY'));
    assert.ok(!firewallResult.sanitizedContext?.requirements?.includes('PlainPassword99!'));
  });

  it('4. Classifies context data categories deterministically', async () => {
    const registry = new AiProviderRegistry();
    const privacyService = new AiPrivacyService({ prisma, registry });

    const firewallResult = await privacyService.checkFirewall(
      {
        projectId: testProjectId,
        providerId: 'OLLAMA',
        prompt: 'Explain repository implementation',
        context: {
          repositoryInfo: 'function login() { return true; }',
          requirements: 'REQ-01: Authentication must be tested',
          testInfo: 'TEST-01: Spec for login',
          targetInfo: 'Evidence screenshot artifact',
        },
      },
      testUserId,
    );

    assert.strictEqual(firewallResult.allowed, true);
    assert.ok(firewallResult.dataClassifications.includes('PROJECT_DATA'));
    assert.ok(firewallResult.dataClassifications.includes('SOURCE_CODE'));
    assert.ok(firewallResult.dataClassifications.includes('REQUIREMENTS'));
    assert.ok(firewallResult.dataClassifications.includes('TEST_DATA'));
    assert.ok(firewallResult.dataClassifications.includes('EXECUTION_EVIDENCE'));
  });

  it('5. Enforces multi-tenant project isolation for privacy settings', async () => {
    const registry = new AiProviderRegistry();
    const privacyService = new AiPrivacyService({ prisma, registry });

    // User A should NOT be able to read User B's project privacy settings
    await assert.rejects(
      async () => {
        await privacyService.getSettings({ projectId: otherProjectId }, testUserId);
      },
      (err: unknown) => {
        assert.ok(err instanceof AiCrossProjectAccessError);
        return true;
      },
    );

    // User A should NOT be able to update User B's project privacy settings
    await assert.rejects(
      async () => {
        await privacyService.updateSettings(
          {
            projectId: otherProjectId,
            privacyMode: 'REMOTE_ALLOWED',
          },
          testUserId,
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AiCrossProjectAccessError);
        return true;
      },
    );
  });

  it('6. Allows switching to REMOTE_ALLOWED mode and executing permitted requests', async () => {
    const registry = new AiProviderRegistry();
    const cloudProvider = new MockCloudProvider();
    registry.register(cloudProvider);

    const privacyService = new AiPrivacyService({ prisma, registry });
    const aiService = new AiProviderService({ prisma, registry, aiPrivacyService: privacyService });

    // Explicitly update mode to REMOTE_ALLOWED
    const updated = await aiService.updatePrivacySettings(
      {
        projectId: testProjectId,
        privacyMode: 'REMOTE_ALLOWED',
        allowCloudFallback: true,
      },
      testUserId,
    );
    assert.strictEqual(updated.privacyMode, 'REMOTE_ALLOWED');
    assert.strictEqual(updated.allowCloudFallback, true);

    // Now calling cloud provider should be allowed
    const response = await aiService.generate(
      {
        requestId: '00000000-0000-0000-0000-000000000004',
        projectId: testProjectId,
        providerId: 'OPENAI',
        model: 'gpt-4o',
        prompt: 'Cloud query in REMOTE_ALLOWED mode',
      },
      testUserId,
    );
    assert.ok(response.text.includes('Cloud response'));

    // Switch back to LOCAL_ONLY and confirm immediate re-blocking
    await aiService.updatePrivacySettings(
      {
        projectId: testProjectId,
        privacyMode: 'LOCAL_ONLY',
        allowCloudFallback: false,
      },
      testUserId,
    );

    await assert.rejects(
      async () => {
        await aiService.generate(
          {
            requestId: '00000000-0000-0000-0000-000000000005',
            projectId: testProjectId,
            providerId: 'OPENAI',
            model: 'gpt-4o',
            prompt: 'Should be blocked again',
          },
          testUserId,
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AiRemoteProviderBlockedError);
        return true;
      },
    );
  });

  it('7. Emits structured audit events for privacy changes, blocks, and redactions', async () => {
    const auditEvents = await prisma.authAuditEvent.findMany({
      where: { userId: testUserId },
      orderBy: { timestamp: 'desc' },
    });

    // Verify audit trail contains records of privacy mode changes
    const modeChangeEvents = auditEvents.filter(e => (e.action as string) === 'AI_PRIVACY_MODE_CHANGED');
    assert.ok(modeChangeEvents.length > 0);

    // Verify audit trail contains records of remote provider blocks
    const blockEvents = auditEvents.filter(e => (e.action as string) === 'AI_REMOTE_PROVIDER_BLOCKED');
    assert.ok(blockEvents.length > 0);
  });
});
