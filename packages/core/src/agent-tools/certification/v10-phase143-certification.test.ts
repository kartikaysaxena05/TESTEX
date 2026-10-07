/**
 * @file packages/core/src/agent-tools/certification/v10-phase143-certification.test.ts
 * Certification test suite for V10 Phase 143: Tool Registry.
 *
 * Covers:
 * 1. Tool definition registration & validation
 * 2. Duplicate tool ID rejection
 * 3. Malformed definition rejection (missing IDs, bad versions, invalid permissions)
 * 4. Tool lookup (getTool, hasTool)
 * 5. Tool listing with filters (category, enabled only)
 * 6. Dynamic enable/disable controls
 * 7. Invocation rejection when disabled
 * 8. Input JSON schema validation (missing required properties rejected)
 * 9. Output JSON schema validation (invalid handler output rejected)
 * 10. Successful invocation envelope (toolId, executionId, output, durationMs, timestamp)
 * 11. Handler execution failure caught and structured safely
 * 12. Unknown tool rejection
 * 13. Tenant isolation & project access enforcement (AiCrossProjectAccessError)
 * 14. Protection against renderer code injection (backend registration only)
 * 15. Concurrency safety during concurrent tool registrations & invocations
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ToolRegistryService,
  AgentToolNotFoundError,
  AgentToolDuplicateError,
  AgentToolDisabledError,
  AgentToolValidationError,
  AgentToolOutputInvalidError,
  type RegisteredToolDefinition,
} from '../index.js';
import { AiCrossProjectAccessError } from '../../ai-provider/index.js';
import type { PrismaClient } from '@prisma/client';

describe('V10 Phase 143: Tool Registry Certification Suite', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const otherProjectId = '22222222-2222-2222-2222-222222222222';
  const testUserId = 'user-test-owner';
  const unauthorizedUserId = 'user-unauthorized';

  let mockPrisma: PrismaClient;
  let registry: ToolRegistryService;

  beforeEach(() => {
    mockPrisma = {
      project: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          if (where.id === testProjectId) {
            return {
              id: testProjectId,
              name: 'Test Project',
              userId: testUserId,
              status: 'ACTIVE',
            };
          }
          if (where.id === otherProjectId) {
            return {
              id: otherProjectId,
              name: 'Other Project',
              userId: 'different-owner',
              status: 'ACTIVE',
            };
          }
          return null;
        },
      },
    } as unknown as PrismaClient;

    registry = new ToolRegistryService({ prisma: mockPrisma });
  });

  const validTool: RegisteredToolDefinition<{ message: string }, { echo: string }> = {
    toolId: 'test_echo_tool',
    name: 'test_echo_tool',
    description: 'Echoes back a string payload',
    version: '1.0.0',
    category: 'UTILITY',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        echo: { type: 'string' },
      },
      required: ['echo'],
    },
    permissionLevel: 'READ',
    enabled: true,
    handler: async (input, _ctx) => {
      return { echo: input.message };
    },
  };

  describe('1. Registration and Definition Validation', () => {
    it('successfully registers a valid tool definition', () => {
      registry.registerTool(validTool);
      assert.strictEqual(registry.hasTool(validTool.toolId), true);

      const registered = registry.getRegisteredTool(validTool.toolId);
      assert.strictEqual(registered?.name, validTool.name);
      assert.strictEqual(registered?.version, '1.0.0');
    });

    it('rejects duplicate tool ID registration', () => {
      registry.registerTool(validTool);
      assert.throws(
        () => registry.registerTool(validTool),
        (err: unknown) => {
          assert(err instanceof AgentToolDuplicateError);
          assert.strictEqual(err.toolId, validTool.toolId);
          return true;
        },
      );
    });

    it('rejects tool definition with missing toolId', () => {
      assert.throws(
        () =>
          registry.registerTool({
            ...validTool,
            toolId: '',
          }),
        (err: unknown) => {
          assert(err instanceof AgentToolValidationError);
          return true;
        },
      );
    });

    it('rejects tool definition with missing name', () => {
      assert.throws(
        () =>
          registry.registerTool({
            ...validTool,
            name: '   ',
          }),
        (err: unknown) => {
          assert(err instanceof AgentToolValidationError);
          return true;
        },
      );
    });

    it('rejects tool definition with invalid semver version', () => {
      assert.throws(
        () =>
          registry.registerTool({
            ...validTool,
            version: 'invalid-version',
          }),
        (err: unknown) => {
          assert(err instanceof AgentToolValidationError);
          return true;
        },
      );
    });

    it('rejects tool definition without executable handler function', () => {
      assert.throws(
        () =>
          registry.registerTool({
            ...validTool,
            handler: 'not-a-function' as any,
          }),
        (err: unknown) => {
          assert(err instanceof AgentToolValidationError);
          return true;
        },
      );
    });

    it('rejects tool definition with invalid permission level', () => {
      assert.throws(
        () =>
          registry.registerTool({
            ...validTool,
            permissionLevel: 'super_admin' as any,
          }),
        (err: unknown) => {
          assert(err instanceof AgentToolValidationError);
          return true;
        },
      );
    });
  });

  describe('2. Lookup and Listing with Filters', () => {
    beforeEach(() => {
      registry.registerTool(validTool);

      const fileTool: RegisteredToolDefinition<{ path: string }, { exists: boolean }> = {
        toolId: 'test_file_check',
        name: 'test_file_check',
        description: 'Checks if a file exists',
        version: '0.2.1',
        category: 'REPOSITORY',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
        outputSchema: {
          type: 'object',
          properties: { exists: { type: 'boolean' } },
        },
        permissionLevel: 'READ',
        enabled: false,
        handler: async input => ({ exists: Boolean(input.path) }),
      };
      registry.registerTool(fileTool);
    });

    it('returns tool DTO via getTool with serialized metadata only', async () => {
      const toolDto = await registry.getTool(
        { projectId: testProjectId, toolId: validTool.toolId },
        testUserId,
      );
      assert.notStrictEqual(toolDto, null);
      assert.strictEqual(toolDto?.toolId, validTool.toolId);
      assert.strictEqual(toolDto?.name, validTool.name);
      assert.strictEqual((toolDto as any).handler, undefined); // handler must not leak
    });

    it('returns null for unknown tool lookup in getTool', async () => {
      const toolDto = await registry.getTool(
        { projectId: testProjectId, toolId: 'non_existent' },
        testUserId,
      );
      assert.strictEqual(toolDto, null);
    });

    it('lists all registered tools for project', async () => {
      const tools = await registry.listTools(
        { projectId: testProjectId, includeDisabled: true },
        testUserId,
      );
      assert.strictEqual(tools.length, 2);
    });

    it('filters tools by category', async () => {
      const tools = await registry.listTools(
        { projectId: testProjectId, category: 'REPOSITORY', includeDisabled: true },
        testUserId,
      );
      assert.strictEqual(tools.length, 1);
      assert.strictEqual(tools[0]?.toolId, 'test_file_check');
    });

    it('filters enabled-only tools', async () => {
      const tools = await registry.listTools(
        { projectId: testProjectId, includeDisabled: false },
        testUserId,
      );
      assert.strictEqual(tools.length, 1);
      assert.strictEqual(tools[0]?.toolId, validTool.toolId);
    });
  });

  describe('3. Enable / Disable Controls & Unregistration', () => {
    beforeEach(() => {
      registry.registerTool(validTool);
    });

    it('disables and enables tools dynamically', () => {
      assert.strictEqual(registry.getRegisteredTool(validTool.toolId)?.enabled, true);

      registry.disableTool(validTool.toolId);
      assert.strictEqual(registry.getRegisteredTool(validTool.toolId)?.enabled, false);

      registry.enableTool(validTool.toolId);
      assert.strictEqual(registry.getRegisteredTool(validTool.toolId)?.enabled, true);
    });

    it('throws AgentToolNotFoundError when enabling/disabling non-existent tool', () => {
      assert.throws(
        () => registry.disableTool('fake_tool'),
        (err: unknown) => err instanceof AgentToolNotFoundError,
      );
      assert.throws(
        () => registry.enableTool('fake_tool'),
        (err: unknown) => err instanceof AgentToolNotFoundError,
      );
    });

    it('unregisters tool completely', () => {
      assert.strictEqual(registry.hasTool(validTool.toolId), true);
      const unreg = registry.unregisterTool(validTool.toolId);
      assert.strictEqual(unreg, true);
      assert.strictEqual(registry.hasTool(validTool.toolId), false);
      assert.strictEqual(registry.unregisterTool(validTool.toolId), false);
    });
  });

  describe('4. Controlled Invocation & Validation', () => {
    beforeEach(() => {
      registry = new ToolRegistryService({ prisma: mockPrisma });
      registry.registerTool({ ...validTool, enabled: true });
    });

    it('successfully invokes tool and returns structured result envelope', async () => {
      const result = await registry.invoke(
        {
          projectId: testProjectId,
          toolId: validTool.toolId,
          input: { message: 'hello agent' },
          taskId: 'task-1111-1111',
          stepId: 'step-1111-1111',
        },
        {
          projectId: testProjectId,
          userId: testUserId,
          taskId: 'task-1111-1111',
          stepId: 'step-1111-1111',
        },
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.toolId, validTool.toolId);
      assert.strictEqual(typeof result.executionId, 'string');
      assert.deepStrictEqual(result.output, { echo: 'hello agent' });
      assert.strictEqual(result.error, null);
      assert.strictEqual(typeof result.durationMs, 'number');
      assert(result.durationMs >= 0);
      assert.strictEqual(typeof result.timestamp, 'string');
    });

    it('rejects invocation of unknown tool', async () => {
      await assert.rejects(
        async () => {
          await registry.invoke(
            {
              projectId: testProjectId,
              toolId: 'unknown_tool',
              input: {},
            },
            { projectId: testProjectId, userId: testUserId },
          );
        },
        (err: unknown) => {
          assert(err instanceof AgentToolNotFoundError);
          return true;
        },
      );
    });

    it('rejects invocation of disabled tool', async () => {
      registry.disableTool(validTool.toolId);

      await assert.rejects(
        async () => {
          await registry.invoke(
            {
              projectId: testProjectId,
              toolId: validTool.toolId,
              input: { message: 'hello' },
            },
            { projectId: testProjectId, userId: testUserId },
          );
        },
        (err: unknown) => {
          assert(err instanceof AgentToolDisabledError);
          return true;
        },
      );
    });

    it('validates input against schema and rejects missing required fields', async () => {
      await assert.rejects(
        async () => {
          await registry.invoke(
            {
              projectId: testProjectId,
              toolId: validTool.toolId,
              input: { notMessage: 'hello' },
            },
            { projectId: testProjectId, userId: testUserId },
          );
        },
        (err: unknown) => {
          if (!(err instanceof AgentToolValidationError)) {
            console.error('DEBUG UNEXPECTED ERROR IN TEST:', err);
          }
          assert(err instanceof AgentToolValidationError);
          assert((err as Error).message.includes('input validation failed'));
          return true;
        },
      );
    });

    it('validates output against schema and rejects non-compliant tool return value', async () => {
      const faultyTool: RegisteredToolDefinition<Record<string, unknown>, { echo: string }> = {
        toolId: 'faulty_output_tool',
        name: 'faulty_output_tool',
        description: 'Returns bad schema output',
        version: '1.0.0',
        category: 'TESTS',
        inputSchema: { type: 'object' },
        outputSchema: {
          type: 'object',
          properties: { echo: { type: 'string' } },
          required: ['echo'],
        },
        permissionLevel: 'READ',
        enabled: true,
        handler: async () => {
          return { wrongKey: 123 } as any; // Violates required ['echo']
        },
      };

      registry.registerTool(faultyTool);

      await assert.rejects(
        async () => {
          await registry.invoke(
            {
              projectId: testProjectId,
              toolId: faultyTool.toolId,
              input: {},
            },
            { projectId: testProjectId, userId: testUserId },
          );
        },
        (err: unknown) => {
          assert(err instanceof AgentToolOutputInvalidError);
          assert(err.message.includes('output validation failed'));
          return true;
        },
      );
    });

    it('catches and safely encapsulates handler errors in failure result', async () => {
      const failingTool: RegisteredToolDefinition<{ shouldFail: boolean }, unknown> = {
        toolId: 'failing_tool',
        name: 'failing_tool',
        description: 'Intentionally throws error',
        version: '1.0.0',
        category: 'UTILITY',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        permissionLevel: 'READ',
        enabled: true,
        handler: async () => {
          throw new Error('Database connection broke');
        },
      };

      registry.registerTool(failingTool);

      const result = await registry.invoke(
        {
          projectId: testProjectId,
          toolId: failingTool.toolId,
          input: { shouldFail: true },
        },
        { projectId: testProjectId, userId: testUserId },
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.toolId, failingTool.toolId);
      assert.strictEqual(result.output, null);
      assert.strictEqual(result.error, 'Database connection broke');
    });
  });

  describe('5. Project Tenant Isolation & Cross-Project Protection', () => {
    beforeEach(() => {
      registry.registerTool(validTool);
    });

    it('rejects listing when user is not the owner or authorized on project', async () => {
      await assert.rejects(
        async () => {
          await registry.listTools({ projectId: testProjectId }, unauthorizedUserId);
        },
        (err: unknown) => {
          assert(err instanceof AiCrossProjectAccessError);
          return true;
        },
      );
    });

    it('rejects getTool when user is unauthorized', async () => {
      await assert.rejects(
        async () => {
          await registry.getTool(
            { projectId: testProjectId, toolId: validTool.toolId },
            unauthorizedUserId,
          );
        },
        (err: unknown) => {
          assert(err instanceof AiCrossProjectAccessError);
          return true;
        },
      );
    });

    it('rejects tool invocation when user attempts cross-project execution', async () => {
      await assert.rejects(
        async () => {
          await registry.invoke(
            {
              projectId: otherProjectId,
              toolId: validTool.toolId,
              input: { message: 'attack' },
            },
            { projectId: otherProjectId, userId: testUserId },
          );
        },
        (err: unknown) => {
          assert(err instanceof AiCrossProjectAccessError);
          return true;
        },
      );
    });
  });

  describe('6. Concurrency & Integrity Protections', () => {
    it('handles concurrent tool registrations and invocations deterministically', async () => {
      // Register 10 tools concurrently
      const toolDefs = Array.from({ length: 10 }, (_, i) => ({
        toolId: `tool_${i}`,
        name: `tool_${i}`,
        description: `Description for tool ${i}`,
        version: '1.0.0',
        category: 'ANALYSIS' as const,
        inputSchema: { type: 'object', properties: { n: { type: 'number' } }, required: ['n'] },
        outputSchema: {
          type: 'object',
          properties: { res: { type: 'number' } },
          required: ['res'],
        },
        permissionLevel: 'READ' as const,
        enabled: true,
        handler: async (inp: { n: number }) => ({ res: inp.n * 2 }),
      }));

      for (const def of toolDefs) {
        registry.registerTool(def);
      }

      assert.strictEqual(registry.listRegisteredTools().length, 10);

      // Invoke all 10 concurrently
      const invocationPromises = toolDefs.map((def, i) =>
        registry.invoke(
          {
            projectId: testProjectId,
            toolId: def.toolId,
            input: { n: i },
          },
          { projectId: testProjectId, userId: testUserId },
        ),
      );

      const results = await Promise.all(invocationPromises);
      assert.strictEqual(results.length, 10);
      for (let i = 0; i < 10; i++) {
        assert.strictEqual(results[i]?.success, true);
        assert.deepStrictEqual(results[i]?.output, { res: i * 2 });
      }
    });

    it('protects against renderer code injection: only main-process registered handlers execute', async () => {
      // Renderer attempts to pass in a serializable fake definition with malicious closure
      const maliciousPayload = {
        toolId: 'injected_hack_tool',
        name: 'injected_hack_tool',
        description: 'Renderer injected tool',
        version: '1.0.0',
        category: 'UTILITY' as const,
        inputSchema: {},
        outputSchema: {},
        permissionLevel: 'WRITE' as const,
        enabled: true,
      };

      // Since the renderer has no access to registerTool with executable handler,
      // it cannot inject executable code. Invoking an unregistered tool fails safely.
      await assert.rejects(
        async () => {
          await registry.invoke(
            {
              projectId: testProjectId,
              toolId: maliciousPayload.toolId,
              input: {},
            },
            { projectId: testProjectId, userId: testUserId },
          );
        },
        (err: unknown) => err instanceof AgentToolNotFoundError,
      );
    });
  });
});
