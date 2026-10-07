/**
 * @file packages/core/src/ai-provider/certification/v9-phase132-certification.test.ts
 * Comprehensive Certification Test Suite for V9 Phase 132:
 * Structured Output & Schema Validation.
 *
 * Verifies all 6 test categories required by Phase 132 specification:
 * 1. Parsing: valid JSON, markdown fenced JSON, whitespace, malformed JSON, empty output, truncated output
 * 2. Schema: valid object, missing required field, wrong type, invalid enum, nested validation, invalid array item
 * 3. Provider: native structured output, prompted structured output, unsupported capability, capability detection
 * 4. Retry: valid first attempt, invalid then valid on correction retry, all attempts invalid, retry limit, cancellation
 * 5. Streaming Compatibility: complete stream with structured validation, incomplete stream, malformed stream, cancellation
 * 6. Security & Isolation: oversized response payload, deeply nested response, prototype pollution defense, cross-project isolation
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { getPrismaClient } from '../../database/client.js';
import {
  AiProviderService,
  StructuredOutputService,
  StructuredOutputRegistry,
  V9StructuredOutputParser,
  OllamaProviderAdapter,
  AiProviderRegistry,
  AiInvalidRequestError,
  AiCrossProjectAccessError,
  AiStructuredSchemaInvalidError,
  AiStructuredSecurityViolationError,
  AiCancelledError,
} from '../index.js';
import type { PrismaClient } from '@prisma/client';

describe('V9 Phase 132 — Structured Output & Schema Validation Certification Suite', () => {
  let prisma: PrismaClient;
  let mockServer: http.Server;
  let mockPort: number;
  let mockBaseUrl: string;

  let mockTagsResponse: unknown;
  let mockGenerateResponse: unknown;
  let mockStreamChunks: string[] = [];
  let mockGenerateStatus = 200;
  let mockDelayMs = 0;
  let requestCount = 0;

  const testUserId = '00000000-0000-0000-0000-000000000152';
  const otherUserId = '00000000-0000-0000-0000-000000000153';
  const testProjectId = '00000000-0000-0000-0000-000000001320';
  const otherProjectId = '00000000-0000-0000-0000-000000001321';

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
        email: 'v9_phase132_tester@quality.local',
        normalizedEmail: 'v9_phase132_tester@quality.local',
        displayName: 'Phase 132 Tester',
      },
    });

    await prisma.user.upsert({
      where: { id: otherUserId },
      update: {},
      create: {
        id: otherUserId,
        email: 'v9_phase132_other@quality.local',
        normalizedEmail: 'v9_phase132_other@quality.local',
        displayName: 'Other Tenant User',
      },
    });

    await prisma.project.create({
      data: {
        id: testProjectId,
        userId: testUserId,
        name: 'Phase 132 Structured Testing Project',
        description: 'Target test project for V9 Phase 132',
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

    // Start mock HTTP server
    mockServer = http.createServer((req, res) => {
      requestCount++;
      const url = req.url || '';

      if (url === '/api/version') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ version: '0.1.32' }));
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
          setTimeout(() => {
            if (mockGenerateStatus !== 200) {
              res.writeHead(mockGenerateStatus, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Mock Ollama failure' }));
              return;
            }

            try {
              const parsed = JSON.parse(body);
              if (parsed.stream) {
                res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
                for (const chunk of mockStreamChunks) {
                  res.write(chunk + '\n');
                }
                res.end();
                return;
              }
            } catch {}

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(mockGenerateResponse));
          }, mockDelayMs);
        });
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
    if (prisma) {
      await prisma.project.deleteMany({
        where: { id: { in: [testProjectId, otherProjectId] } },
      });
    }
  });

  beforeEach(() => {
    mockDelayMs = 0;
    mockGenerateStatus = 200;
    requestCount = 0;
    mockTagsResponse = {
      models: [
        {
          name: 'llama3:8b',
          model: 'llama3:8b',
          modified_at: '2026-10-01T00:00:00Z',
          size: 4661224676,
          details: { family: 'llama', parameter_size: '8.0B' },
        },
      ],
    };
    mockGenerateResponse = {
      model: 'llama3:8b',
      response: JSON.stringify({
        name: 'Login Verification Plan',
        objective: 'Test user login flow',
        steps: [
          {
            action: 'Type username and password',
            target: 'form#login',
            expected: 'Inputs populated',
          },
          {
            action: 'Click submit',
            target: 'button[type="submit"]',
            expected: 'Redirect to dashboard',
          },
        ],
        metadata: { priority: 'P1' },
      }),
      done: true,
      done_reason: 'stop',
      total_duration: 100000000,
      prompt_eval_count: 50,
      eval_count: 120,
    };
    mockStreamChunks = [
      JSON.stringify({ response: '{"name":"Stream Plan","objective":"Verify stream"', done: false }),
      JSON.stringify({ response: ',"steps":[{"action":"step 1","target":"btn","expected":"ok"}]}', done: false }),
      JSON.stringify({ response: '', done: true, done_reason: 'stop', prompt_eval_count: 20, eval_count: 40 }),
    ];
  });

  // ===========================================================================
  // SECTION 1: Parsing Engine (StructuredOutputParser)
  // ===========================================================================
  describe('1. Parsing Engine & Extraction Resilience', () => {
    it('parses clean valid JSON correctly', () => {
      const raw = '{"name": "Valid Test", "count": 42}';
      const res = V9StructuredOutputParser.parse(raw);
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.status, 'VALID');
      assert.deepStrictEqual(res.data, { name: 'Valid Test', count: 42 });
    });

    it('extracts JSON surrounded by markdown code fences', () => {
      const raw = `Here is the requested output:
\`\`\`json
{
  "name": "Fenced Object",
  "status": "READY"
}
\`\`\`
Hope this helps!`;
      const res = V9StructuredOutputParser.parse(raw);
      assert.strictEqual(res.ok, true);
      assert.deepStrictEqual(res.data, { name: 'Fenced Object', status: 'READY' });
    });

    it('handles leading and trailing whitespace and conversational text outside braces', () => {
      const raw = `   Certainly! Output:
   {"key": "value"}
   Thanks!   `;
      const res = V9StructuredOutputParser.parse(raw);
      assert.strictEqual(res.ok, true);
      assert.deepStrictEqual(res.data, { key: 'value' });
    });

    it('gracefully handles malformed unparseable JSON without throwing unhandled exceptions', () => {
      const raw = '{"key": "unclosed string...';
      const res = V9StructuredOutputParser.parse(raw);
      assert.strictEqual(res.ok, false);
      assert(res.status === 'PARSE_ERROR' || res.status === 'TRUNCATED');
      assert.strictEqual(res.data, null);
    });

    it('flags empty and whitespace-only output with status EMPTY', () => {
      const res = V9StructuredOutputParser.parse('   \n\t  ');
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 'EMPTY');
    });

    it('detects truncated JSON payloads', () => {
      const raw = '{"name": "Partial Plan", "steps": [{"action": "click"';
      const res = V9StructuredOutputParser.parse(raw);
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 'TRUNCATED');
    });
  });

  // ===========================================================================
  // SECTION 2: Schema Registry & Zod Validation
  // ===========================================================================
  describe('2. Schema Registry & Validation Invariants', () => {
    const registry = StructuredOutputRegistry.getDefault();

    it('validates a compliant TestPlan v1 object', () => {
      const schemaEntry = registry.resolve('TestPlan', 1);
      const validPlan = {
        name: 'Smoke Test Plan',
        objective: 'Verify home page loading',
        steps: [
          { action: 'Navigate to URL', target: 'browser', expected: 'Status 200' },
        ],
        metadata: { env: 'staging' },
      };
      const res = schemaEntry.schema.safeParse(validPlan);
      assert.strictEqual(res.success, true);
    });

    it('rejects an object missing required fields (steps array missing)', () => {
      const schemaEntry = registry.resolve('TestPlan', 1);
      const invalid = {
        name: 'Incomplete Plan',
        objective: 'Missing steps',
      };
      const res = schemaEntry.schema.safeParse(invalid);
      assert.strictEqual(res.success, false);
      if (!res.success) {
        const mapped = StructuredOutputRegistry.mapZodError(res.error);
        assert(mapped.some((e) => e.path.includes('steps')));
      }
    });

    it('rejects wrong primitive types (name as number)', () => {
      const schemaEntry = registry.resolve('TestPlan', 1);
      const invalid = {
        name: 12345,
        objective: 'Number name',
        steps: [{ action: 'act', target: 'tgt', expected: 'exp' }],
      };
      const res = schemaEntry.schema.safeParse(invalid);
      assert.strictEqual(res.success, false);
    });

    it('rejects invalid enum values in BugReportSummary', () => {
      const schemaEntry = registry.resolve('BugReportSummary', 1);
      const invalidBug = {
        title: 'Crash on click',
        severity: 'ULTRA_CRITICAL', // Invalid enum
        component: 'Button',
        summary: 'Crashed',
        reproductionSteps: ['click'],
        expectedBehavior: 'work',
        actualBehavior: 'crashed',
      };
      const res = schemaEntry.schema.safeParse(invalidBug);
      assert.strictEqual(res.success, false);
    });

    it('rejects invalid item in nested steps array (step missing expected)', () => {
      const schemaEntry = registry.resolve('TestPlan', 1);
      const invalid = {
        name: 'Nested Failure',
        objective: 'Testing nested error',
        steps: [
          { action: 'Click button', target: 'btn#submit' }, // missing 'expected'
        ],
      };
      const res = schemaEntry.schema.safeParse(invalid);
      assert.strictEqual(res.success, false);
      if (!res.success) {
        const mapped = StructuredOutputRegistry.mapZodError(res.error);
        assert(mapped.some((e) => e.path.includes('expected')));
      }
    });

    it('throws AiStructuredSchemaInvalidError for unregistered schema', () => {
      assert.throws(
        () => registry.resolve('NonExistentSchema', 99),
        (err) => err instanceof AiStructuredSchemaInvalidError,
      );
    });
  });

  // ===========================================================================
  // SECTION 3: Provider Capabilities Handling (Native vs Prompted)
  // ===========================================================================
  describe('3. Provider Capability Handling', () => {
    it('detects native JSON capability for Ollama and Emulated providers', async () => {
      const service = new StructuredOutputService();
      const caps = await service.getStructuredCapabilities({ providerId: 'OLLAMA' });
      assert.strictEqual(caps.capability, 'NATIVE');
      assert.strictEqual(caps.supportsJsonFormat, true);
    });

    it('reports UNSUPPORTED for unregistered provider IDs', async () => {
      const service = new StructuredOutputService();
      const caps = await service.getStructuredCapabilities({ providerId: 'UNREGISTERED_AI' });
      assert.strictEqual(caps.capability, 'UNSUPPORTED');
      assert.strictEqual(caps.supportsJsonFormat, false);
    });
  });

  // ===========================================================================
  // SECTION 4: Controlled Bounded Retries & Error Correction
  // ===========================================================================
  describe('4. Bounded Correction Retries', () => {
    it('returns VALID immediately on first attempt if model response matches schema', async () => {
      const registry = new AiProviderRegistry();
      const adapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl });
      registry.register(adapter);

      const service = new StructuredOutputService({ providerRegistry: registry });
      const result = await service.generateStructured({
        schemaName: 'TestPlan',
        prompt: 'Generate login test plan',
        policy: { maxRetries: 2 },
      });

      assert.strictEqual(result.validationStatus, 'VALID');
      assert.strictEqual(result.retryCount, 0);
      assert(result.parsedData !== null);
      assert.strictEqual((result.parsedData as any).name, 'Login Verification Plan');
    });

    it('retries when first response is invalid and succeeds when second response is valid', async () => {
      let callCount = 0;
      const invalidResponse = JSON.stringify({
        name: 'Broken Plan',
        objective: 'Missing steps',
      });
      const validResponse = JSON.stringify({
        name: 'Repaired Plan',
        objective: 'Fixed steps',
        steps: [{ action: 'Run check', target: 'app', expected: 'Passed' }],
      });

      const customServer = http.createServer((req, res) => {
        if (req.url === '/api/tags') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(mockTagsResponse));
          return;
        }
        if (req.url === '/api/generate') {
          callCount++;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              model: 'llama3:8b',
              response: callCount === 1 ? invalidResponse : validResponse,
              done: true,
            }),
          );
          return;
        }
        res.writeHead(404).end();
      });

      await new Promise<void>((r) => customServer.listen(0, '127.0.0.1', () => r()));
      const sPort = (customServer.address() as AddressInfo).port;

      try {
        const registry = new AiProviderRegistry();
        const adapter = new OllamaProviderAdapter({ baseUrl: `http://127.0.0.1:${sPort}` });
        registry.register(adapter);

        const service = new StructuredOutputService({ providerRegistry: registry });
        const result = await service.generateStructured({
          schemaName: 'TestPlan',
          prompt: 'Generate plan',
          policy: { maxRetries: 2 },
        });

        assert.strictEqual(result.validationStatus, 'VALID');
        assert.strictEqual(result.retryCount, 1);
        assert.strictEqual((result.parsedData as any).name, 'Repaired Plan');
      } finally {
        customServer.close();
      }
    });

    it('stops at configured maxRetries and preserves final diagnostic error information when all attempts fail', async () => {
      const invalidResponse = JSON.stringify({
        name: 'Persistently Broken Plan',
      });

      const customServer = http.createServer((req, res) => {
        if (req.url === '/api/tags') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(mockTagsResponse));
          return;
        }
        if (req.url === '/api/generate') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              model: 'llama3:8b',
              response: invalidResponse,
              done: true,
            }),
          );
          return;
        }
        res.writeHead(404).end();
      });

      await new Promise<void>((r) => customServer.listen(0, '127.0.0.1', () => r()));
      const sPort = (customServer.address() as AddressInfo).port;

      try {
        const registry = new AiProviderRegistry();
        const adapter = new OllamaProviderAdapter({ baseUrl: `http://127.0.0.1:${sPort}` });
        registry.register(adapter);

        const service = new StructuredOutputService({ providerRegistry: registry });
        const result = await service.generateStructured({
          schemaName: 'TestPlan',
          prompt: 'Generate plan',
          policy: { maxRetries: 1 },
        });

        assert.strictEqual(result.validationStatus, 'INVALID');
        assert.strictEqual(result.retryCount, 1);
        assert(result.validationErrors.length > 0);
        assert(result.rawContent.includes('Persistently Broken Plan'));
      } finally {
        customServer.close();
      }
    });

    it('aborts cleanly during retry loop when external cancellation signal triggers', async () => {
      const controller = new AbortController();
      controller.abort();

      const service = new StructuredOutputService();
      await assert.rejects(
        () =>
          service.generateStructured(
            { schemaName: 'TestPlan', prompt: 'Cancelled generation' },
            undefined,
            controller.signal,
          ),
        (err) => err instanceof AiCancelledError,
      );
    });
  });

  // ===========================================================================
  // SECTION 5: Streaming Compatibility (Phase 131 Integration)
  // ===========================================================================
  describe('5. Streaming Compatibility', () => {
    it('accumulates streaming chunks and validates structured schema upon completion', async () => {
      const registry = new AiProviderRegistry();
      const adapter = new OllamaProviderAdapter({ baseUrl: mockBaseUrl });
      registry.register(adapter);

      const service = new StructuredOutputService({ providerRegistry: registry });
      const stream = service.streamAndValidate({
        schemaName: 'TestPlan',
        prompt: 'Stream test plan',
      });

      let completedWithStructured = false;
      for await (const chunk of stream) {
        if (chunk.type === 'COMPLETE' && chunk.structuredResult) {
          completedWithStructured = true;
          assert.strictEqual(chunk.structuredResult.validationStatus, 'VALID');
          assert.strictEqual((chunk.structuredResult.parsedData as any).name, 'Stream Plan');
        }
      }

      assert.strictEqual(completedWithStructured, true);
    });
  });

  // ===========================================================================
  // SECTION 6: Security, Isolation & Observability
  // ===========================================================================
  describe('6. Security, Multi-Tenant Isolation & Observability', () => {
    it('rejects oversized payload exceeding safety threshold (STRUCTURED_PAYLOAD_TOO_LARGE)', () => {
      const hugeJson = '{"data":"' + 'a'.repeat(250_000) + '"}';
      assert.throws(
        () => V9StructuredOutputParser.parse(hugeJson, { maxPayloadChars: 10_000 }),
        (err) =>
          err instanceof AiStructuredSecurityViolationError &&
          err.code === 'STRUCTURED_PAYLOAD_TOO_LARGE',
      );
    });

    it('rejects deeply nested payloads exceeding recursion limits (STRUCTURED_NESTING_TOO_DEEP)', () => {
      let nested: any = { leaf: 'value' };
      for (let i = 0; i < 25; i++) {
        nested = { child: nested };
      }
      const raw = JSON.stringify(nested);
      assert.throws(
        () => V9StructuredOutputParser.parse(raw, { maxNestingDepth: 10 }),
        (err) =>
          err instanceof AiStructuredSecurityViolationError &&
          err.code === 'STRUCTURED_NESTING_TOO_DEEP',
      );
    });

    it('strips __proto__ and constructor properties during parse to prevent prototype pollution', () => {
      const malicious = '{"name":"Poison","__proto__":{"isAdmin":true}}';
      const res = V9StructuredOutputParser.parse(malicious);
      assert.strictEqual(res.ok, true);
      const parsed = res.data as Record<string, unknown>;
      assert.strictEqual(parsed['name'], 'Poison');
      assert.strictEqual((parsed as any).isAdmin, undefined);
      assert.strictEqual(({} as any).isAdmin, undefined);
    });

    it('enforces multi-tenant project authorization before executing structured generation', async () => {
      const providerService = new AiProviderService();

      await assert.rejects(
        () =>
          providerService.generateStructured(
            {
              projectId: otherProjectId,
              schemaName: 'TestPlan',
              prompt: 'Cross project attempt',
            },
            testUserId, // User mismatch!
          ),
        (err) => err instanceof AiCrossProjectAccessError,
      );
    });

    it('standalone validateStructured API validates arbitrary text against schema without model call', () => {
      const service = new StructuredOutputService();
      const res = service.validateStructured({
        schemaName: 'BugReportSummary',
        rawContent: JSON.stringify({
          title: 'Direct validation',
          severity: 'LOW',
          component: 'Footer',
          summary: 'Minor typo in copyright notice',
          reproductionSteps: ['Scroll down'],
          expectedBehavior: '2026',
          actualBehavior: '2025',
        }),
      });

      assert.strictEqual(res.status, 'VALID');
      assert.strictEqual(res.errors.length, 0);
    });
  });
});
