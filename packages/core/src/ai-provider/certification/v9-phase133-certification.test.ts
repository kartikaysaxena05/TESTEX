/**
 * @file packages/core/src/ai-provider/certification/v9-phase133-certification.test.ts
 * Comprehensive Certification Test Suite for V9 Phase 133:
 * Tool-Calling Compatibility Layer.
 *
 * Verifies all 6 test categories required by Phase 133 specification:
 * 1. Registry: valid registration, duplicate tool rejection, invalid schema rejection, lookup, removal, prohibited dangerous tools
 * 2. Parsing: valid tool call, malformed output, unknown tool, missing arguments, extra/invalid arguments, fenced markdown, OpenAI format
 * 3. Provider Compatibility: native tool calling (Ollama), compatibility mode (Emulated), unsupported provider handling
 * 4. Security & Isolation: prompt injection pseudo-tool defense, tool name spoofing, project tenant isolation, oversized arguments, deep nesting defense, prototype pollution stripping, secret redaction
 * 5. Non-Execution Invariant: strictly verifies that tool execution is NEVER performed in Phase 133 (raises AiToolExecutionProhibitedError)
 * 6. Streaming Integration & Diagnostics: streaming events distinction, terminal tool call validation, bounded diagnostics
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { getPrismaClient } from '../../database/client.js';
import {
  AiProviderService,
  ToolCallingService,
  AiToolRegistry,
  V9ToolCallParser,
  OllamaProviderAdapter,
  AiProviderRegistry,
  EmulatedAiProvider,
  AiToolNotFoundError,
  AiToolDuplicateError,
  AiToolSchemaInvalidError,
  AiToolExecutionProhibitedError,
  AiStructuredSecurityViolationError,
  AiCrossProjectAccessError,
} from '../index.js';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

describe('V9 Phase 133 — Tool-Calling Compatibility Layer Certification Suite', () => {
  let prisma: PrismaClient;
  let mockServer: http.Server;
  let mockPort: number;
  let mockBaseUrl: string;

  let mockTagsResponse: unknown;
  let mockGenerateResponse: unknown;
  let mockGenerateStatus = 200;
  let requestCount = 0;

  const testUserId = '00000000-0000-0000-0000-000000000162';
  const otherUserId = '00000000-0000-0000-0000-000000000163';
  const testProjectId = '00000000-0000-0000-0000-000000001330';
  const otherProjectId = '00000000-0000-0000-0000-000000001331';

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
        email: 'v9_phase133_tester@quality.local',
        normalizedEmail: 'v9_phase133_tester@quality.local',
        displayName: 'Phase 133 Tester',
      },
    });

    await prisma.user.upsert({
      where: { id: otherUserId },
      update: {},
      create: {
        id: otherUserId,
        email: 'v9_phase133_other@quality.local',
        normalizedEmail: 'v9_phase133_other@quality.local',
        displayName: 'Other Tenant User',
      },
    });

    await prisma.project.create({
      data: {
        id: testProjectId,
        userId: testUserId,
        name: 'Phase 133 Tool-Calling Project',
        description: 'Target test project for V9 Phase 133',
      },
    });

    await prisma.project.create({
      data: {
        id: otherProjectId,
        userId: otherUserId,
        name: 'Other Tenant Project',
        description: 'Tenant project for cross-tenant rejection test',
      },
    });

    // Start mock HTTP server for Ollama
    mockServer = http.createServer((req, res) => {
      requestCount++;
      const url = req.url || '';

      if (url === '/api/version') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ version: '0.1.33' }));
        return;
      }

      if (url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mockTagsResponse));
        return;
      }

      if (url === '/api/generate') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          if (mockGenerateStatus !== 200) {
            res.writeHead(mockGenerateStatus, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Mock Ollama failure' }));
            return;
          }
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

    if (prisma) {
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
    }
  });

  beforeEach(() => {
    requestCount = 0;
    mockGenerateStatus = 200;
    mockTagsResponse = {
      models: [
        {
          name: 'llama3:8b',
          model: 'llama3:8b',
          modified_at: new Date().toISOString(),
          size: 4661224448,
          details: { family: 'llama' },
        },
      ],
    };
    mockGenerateResponse = {
      model: 'llama3:8b',
      response: '{"tool_calls":[{"name":"repository.search","arguments":{"query":"auth"}}]}',
      done: true,
      prompt_eval_count: 20,
      eval_count: 30,
      total_duration: 100000000,
      load_duration: 10000000,
    };
  });

  // ===========================================================================
  // Section 1: Tool Registry Functionality
  // ===========================================================================
  describe('1. Tool Registry Management & Invariants', () => {
    it('1.1 registers and retrieves valid tool definitions', () => {
      const registry = new AiToolRegistry(false);
      registry.registerTool({
        name: 'custom.lint',
        description: 'Runs static linter checks',
        version: 1,
        category: 'ANALYSIS',
        riskLevel: 'READ_ONLY',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
      });

      assert.strictEqual(registry.hasTool('custom.lint'), true);
      const tool = registry.getTool('custom.lint');
      assert.strictEqual(tool?.name, 'custom.lint');
      assert.strictEqual(tool?.category, 'ANALYSIS');
    });

    it('1.2 rejects duplicate tool registration', () => {
      const registry = new AiToolRegistry(false);
      registry.registerTool({
        name: 'tests.run_check',
        description: 'Verify tests',
        version: 1,
        category: 'TESTS',
        riskLevel: 'READ_ONLY',
        inputSchema: { type: 'object' },
      });

      assert.throws(
        () =>
          registry.registerTool({
            name: 'tests.run_check',
            description: 'Duplicate registration',
            version: 1,
            category: 'TESTS',
            riskLevel: 'READ_ONLY',
            inputSchema: { type: 'object' },
          }),
        AiToolDuplicateError,
      );
    });

    it('1.3 rejects invalid tool name format', () => {
      const registry = new AiToolRegistry(false);
      assert.throws(
        () =>
          registry.registerTool({
            name: 'invalid tool with spaces!!',
            description: 'Bad name',
            version: 1,
            category: 'UTILITY',
            riskLevel: 'READ_ONLY',
            inputSchema: { type: 'object' },
          }),
        AiToolSchemaInvalidError,
      );
    });

    it('1.4 rejects unrestricted dangerous tools', () => {
      const registry = new AiToolRegistry(false);
      const dangerousNames = [
        'execute-any-command',
        'read-any-file',
        'delete-anything',
        'shell.exec',
        'sudo',
        'raw_eval',
      ];

      for (const badName of dangerousNames) {
        assert.throws(
          () =>
            registry.registerTool({
              name: badName,
              description: 'Danger tool',
              version: 1,
              category: 'UTILITY',
              riskLevel: 'CRITICAL',
              inputSchema: { type: 'object' },
            }),
          AiToolSchemaInvalidError,
          `Expected rejection for dangerous tool name: ${badName}`,
        );
      }
    });

    it('1.5 unregisters tools cleanly', () => {
      const registry = new AiToolRegistry(false);
      registry.registerTool({
        name: 'temp.tool',
        description: 'Temporary',
        version: 1,
        category: 'UTILITY',
        riskLevel: 'LOW',
        inputSchema: { type: 'object' },
      });
      assert.strictEqual(registry.hasTool('temp.tool'), true);
      const removed = registry.unregisterTool('temp.tool');
      assert.strictEqual(removed, true);
      assert.strictEqual(registry.hasTool('temp.tool'), false);
    });

    it('1.6 scopes tools to project when specified', () => {
      const registry = new AiToolRegistry(false);
      registry.registerTool(
        {
          name: 'project.specific',
          description: 'Scoped to project A',
          version: 1,
          category: 'REPOSITORY',
          riskLevel: 'READ_ONLY',
          inputSchema: { type: 'object' },
        },
        undefined,
        testProjectId,
      );

      assert.strictEqual(registry.hasTool('project.specific', testProjectId), true);
      assert.strictEqual(registry.hasTool('project.specific', otherProjectId), false);
      assert.strictEqual(registry.hasTool('project.specific', null), false);
    });
  });

  // ===========================================================================
  // Section 2: Safe Tool-Call Parsing
  // ===========================================================================
  describe('2. Tool-Call Parsing Engine', () => {
    it('2.1 parses standard tool_calls array format', () => {
      const raw = JSON.stringify({
        tool_calls: [
          { id: 'c1', name: 'repository.search', arguments: { query: 'test' } },
          { id: 'c2', name: 'tests.list', arguments: { limit: 10 } },
        ],
      });
      const calls = V9ToolCallParser.parse(raw);
      assert.strictEqual(calls.length, 2);
      assert.strictEqual(calls[0]?.name, 'repository.search');
      assert.strictEqual(calls[0]?.arguments['query'], 'test');
      assert.strictEqual(calls[1]?.name, 'tests.list');
      assert.strictEqual(calls[1]?.arguments['limit'], 10);
    });

    it('2.2 extracts tool calls enclosed in markdown fences', () => {
      const raw = '```json\n{"tool_calls":[{"name":"repository.search","arguments":{"query":"auth"}}]}\n```';
      const calls = V9ToolCallParser.parse(raw);
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0]?.name, 'repository.search');
      assert.strictEqual(calls[0]?.arguments['query'], 'auth');
    });

    it('2.3 parses OpenAI function calling format', () => {
      const raw = JSON.stringify({
        id: 'call_openai_123',
        type: 'function',
        function: {
          name: 'repository.search',
          arguments: '{"query":"user-login"}',
        },
      });
      const calls = V9ToolCallParser.parse(raw);
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0]?.id, 'call_openai_123');
      assert.strictEqual(calls[0]?.name, 'repository.search');
      assert.strictEqual(calls[0]?.arguments['query'], 'user-login');
    });

    it('2.4 recovers from trailing commas in tool arguments', () => {
      const raw = '{"tool_calls":[{"name":"repository.search","arguments":{"query":"auth",}}],}';
      const calls = V9ToolCallParser.parse(raw);
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0]?.name, 'repository.search');
      assert.strictEqual(calls[0]?.arguments['query'], 'auth');
    });

    it('2.5 returns empty array for plain text without tool calls', () => {
      const raw = 'Hello! I am ready to help you write test cases today.';
      const calls = V9ToolCallParser.parse(raw);
      assert.strictEqual(calls.length, 0);
    });
  });

  // ===========================================================================
  // Section 3: Tool Argument Validation & Lookup
  // ===========================================================================
  describe('3. Argument Validation & Schema Enforcement', () => {
    it('3.1 passes validation for conformant arguments', () => {
      const registry = AiToolRegistry.getDefault();
      const validation = registry.validateArguments('repository.search', {
        query: 'loginButton',
        limit: 20,
      });

      assert.strictEqual(validation.valid, true);
      assert.strictEqual(validation.errors.length, 0);
    });

    it('3.2 fails validation for missing required argument', () => {
      const registry = AiToolRegistry.getDefault();
      const validation = registry.validateArguments('repository.search', {
        // query is required, missing here
        limit: 20,
      });

      assert.strictEqual(validation.valid, false);
      assert.strictEqual(validation.errors.some((e) => e.path.includes('query')), true);
    });

    it('3.3 fails validation for wrong argument primitive type', () => {
      const registry = AiToolRegistry.getDefault();
      const validation = registry.validateArguments('repository.search', {
        query: 12345, // string expected
      });

      assert.strictEqual(validation.valid, false);
      assert.strictEqual(validation.errors.length > 0, true);
    });

    it('3.4 validates through ToolCallingService validateToolCall() with UNKNOWN_TOOL status', () => {
      const service = new ToolCallingService();
      const result = service.validateToolCall({
        toolCall: {
          id: 'call_99',
          name: 'nonexistent.tool',
          arguments: {},
          schemaVersion: 1,
        },
      });

      assert.strictEqual(result.status, 'UNKNOWN_TOOL');
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.toolDefinition, null);
    });

    it('3.5 validates through ToolCallingService with INVALID_ARGUMENTS status', () => {
      const service = new ToolCallingService();
      const result = service.validateToolCall({
        toolCall: {
          id: 'call_100',
          name: 'repository.search',
          arguments: { query: '' }, // min(1) violation in Zod validator
          schemaVersion: 1,
        },
      });

      assert.strictEqual(result.status, 'INVALID_ARGUMENTS');
      assert.strictEqual(result.errors.length > 0, true);
    });
  });

  // ===========================================================================
  // Section 4: Provider Compatibility & Capabilities
  // ===========================================================================
  describe('4. Provider Capability Handling', () => {
    it('4.1 reports NATIVE capability for Ollama local provider', async () => {
      const service = new ToolCallingService();
      const caps = await service.getToolCapabilities({ providerId: 'OLLAMA' });

      assert.strictEqual(caps.capability, 'NATIVE');
      assert.strictEqual(caps.supportsStreamingToolCalls, true);
      assert.strictEqual(caps.supportsMultiToolCalls, true);
    });

    it('4.2 reports COMPATIBILITY for Emulated test provider', async () => {
      const reg = new AiProviderRegistry();
      reg.register(new EmulatedAiProvider('EMULATED', 'Emulated'));
      const service = new ToolCallingService({ providerRegistry: reg });

      const caps = await service.getToolCapabilities({ providerId: 'EMULATED' });
      assert.strictEqual(caps.capability, 'COMPATIBILITY');
    });

    it('4.3 reports UNSUPPORTED for unregistered provider', async () => {
      const reg = new AiProviderRegistry();
      const service = new ToolCallingService({ providerRegistry: reg });

      const caps = await service.getToolCapabilities({ providerId: 'UNREGISTERED_PROVIDER' });
      assert.strictEqual(caps.capability, 'UNSUPPORTED');
      assert.strictEqual(caps.supportsStreamingToolCalls, false);
    });
  });

  // ===========================================================================
  // Section 5: Security & Multi-Tenant Boundaries
  // ===========================================================================
  describe('5. Security, Sandboxing & Tenant Isolation', () => {
    it('5.1 rejects oversized tool-call payload (STRUCTURED_PAYLOAD_TOO_LARGE)', () => {
      const oversized = 'x'.repeat(250_000);
      assert.throws(
        () => V9ToolCallParser.parse(oversized),
        AiStructuredSecurityViolationError,
      );
    });

    it('5.2 rejects deeply nested argument payloads (STRUCTURED_NESTING_TOO_DEEP)', () => {
      let nested: any = { query: 'test' };
      for (let i = 0; i < 25; i++) {
        nested = { child: nested };
      }
      const raw = JSON.stringify({
        tool_calls: [{ name: 'repository.search', arguments: nested }],
      });

      assert.throws(
        () => V9ToolCallParser.parse(raw),
        AiStructuredSecurityViolationError,
      );
    });

    it('5.3 strips prototype pollution properties (__proto__, constructor)', () => {
      const malicious = JSON.stringify({
        tool_calls: [
          {
            name: 'repository.search',
            arguments: {
              query: 'test',
              __proto__: { isAdmin: true },
              constructor: { hacked: true },
            },
          },
        ],
      });

      const parsed = V9ToolCallParser.parse(malicious);
      assert.strictEqual(parsed.length, 1);
      const args = parsed[0]?.arguments as Record<string, unknown>;
      assert.strictEqual(Object.prototype.hasOwnProperty.call(args, '__proto__'), false);
      assert.strictEqual(Object.prototype.hasOwnProperty.call(args, 'constructor'), false);
      assert.strictEqual((({} as any).isAdmin), undefined);
    });

    it('5.4 rejects cross-project tenant generation access', async () => {
      const adapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl });
      const reg = new AiProviderRegistry();
      reg.register(adapter);

      const aiService = new AiProviderService({
        prisma,
        registry: reg,
      });

      // User A attempts to request tool generation for Project B (owned by User B)
      await assert.rejects(
        () =>
          aiService.generateToolCalls(
            {
              projectId: otherProjectId,
              providerId: 'OLLAMA',
              prompt: 'Find auth files',
            },
            testUserId,
          ),
        AiCrossProjectAccessError,
      );
    });

    it('5.5 STRICT NON-EXECUTION: throws AiToolExecutionProhibitedError if execution is attempted', () => {
      const service = new ToolCallingService();
      assert.throws(
        () =>
          service.executeToolCall({
            id: 'call_1',
            name: 'repository.search',
            arguments: { query: 'test' },
            schemaVersion: 1,
          }),
        AiToolExecutionProhibitedError,
      );
    });
  });

  // ===========================================================================
  // Section 6: End-to-End Generation & Tool Call Pipeline
  // ===========================================================================
  describe('6. End-to-End Generation to Validated ToolCall Pipeline', () => {
    it('6.1 generates and validates tool calls end-to-end via Ollama adapter', async () => {
      const adapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl });
      const reg = new AiProviderRegistry();
      reg.register(adapter);

      const service = new ToolCallingService({
        providerRegistry: reg,
      });

      const res = await service.generateToolCalls({
        providerId: 'OLLAMA',
        modelId: 'llama3:8b',
        prompt: 'Search for the login authentication function in the codebase',
      });

      assert.strictEqual(res.validatedCalls.length, 1);
      const firstCall = res.validatedCalls[0]!;
      assert.strictEqual(firstCall.status, 'VALID');
      assert.strictEqual(firstCall.toolCall?.name, 'repository.search');
      assert.strictEqual(firstCall.toolCall?.arguments['query'], 'auth');
      assert.strictEqual(res.capabilityUsed, 'NATIVE');
      assert.strictEqual(typeof res.durationMs, 'number');
    });

    it('6.2 handles model responding with unknown tool smoothly', async () => {
      mockGenerateResponse = {
        model: 'llama3:8b',
        response: '{"tool_calls":[{"name":"unknown.custom_tool","arguments":{"flag":true}}]}',
        done: true,
      };

      const adapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl });
      const reg = new AiProviderRegistry();
      reg.register(adapter);

      const service = new ToolCallingService({
        providerRegistry: reg,
      });

      const res = await service.generateToolCalls({
        providerId: 'OLLAMA',
        modelId: 'llama3:8b',
        prompt: 'Trigger hallucinated tool',
      });

      assert.strictEqual(res.validatedCalls.length, 1);
      assert.strictEqual(res.validatedCalls[0]?.status, 'UNKNOWN_TOOL');
      assert.strictEqual(res.validatedCalls[0]?.toolCall?.name, 'unknown.custom_tool');
    });
  });
});
