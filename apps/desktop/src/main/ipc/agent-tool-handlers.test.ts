/**
 * @file apps/desktop/src/main/ipc/agent-tool-handlers.test.ts
 * Security, authentication, validation and delegation unit tests for V10 Phase 143 Tool Registry IPC handlers.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleListAgentTools,
  handleGetAgentTool,
  handleInvokeAgentTool,
} from './agent-tool-handlers.js';
import { setAuthServiceForTest, setSecureStorageForTest } from './auth-handlers.js';
import {
  ToolRegistryService,
  AgentToolNotFoundError,
  AgentToolDisabledError,
  AgentToolValidationError,
  AgentToolOutputInvalidError,
  AiCrossProjectAccessError,
  type AuthenticationService,
} from '@ai-quality/core';
import type {
  AgentToolDefinitionDto,
  AgentToolInvocationResultDto,
  InvokeAgentToolInputDto,
} from '@ai-quality/contracts';
import type { IDesktopSecureStorage } from '../secure-storage/desktop-secure-storage.js';

class MockSecureStorage implements IDesktopSecureStorage {
  public token: string | null = 'mock-valid-session-token';
  public async storeSessionToken(token: string): Promise<void> {
    this.token = token;
  }
  public async retrieveSessionToken(): Promise<string | null> {
    return this.token;
  }
  public async clearSessionToken(): Promise<void> {
    this.token = null;
  }
}

describe('V10 Phase 143 Agent Tool IPC Handlers', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testUserId = 'user-uuid-1111-2222';
  const testToolId = 'echo_tool';

  const mockToolDto: AgentToolDefinitionDto = {
    toolId: testToolId,
    name: 'echo_tool',
    description: 'Echoes back input payload',
    version: '1.0.0',
    category: 'UTILITY',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    outputSchema: {
      type: 'object',
      properties: { echoed: { type: 'string' } },
    },
    permissionLevel: 'READ',
    enabled: true,
  };

  const mockInvocationResultDto: AgentToolInvocationResultDto = {
    success: true,
    toolId: testToolId,
    executionId: '33333333-3333-3333-3333-333333333333',
    output: { echoed: 'hello world' },
    durationMs: 42,
    timestamp: new Date().toISOString(),
  };

  let mockSecureStorage: MockSecureStorage;
  let mockAuthService: AuthenticationService;
  let mockToolRegistryService: ToolRegistryService;

  const trustedEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    },
  } as unknown as IpcMainInvokeEvent;

  const untrustedEvent = {
    senderFrame: {
      url: 'https://malicious.evil.com/exploit',
    },
  } as unknown as IpcMainInvokeEvent;

  beforeEach(() => {
    mockSecureStorage = new MockSecureStorage();
    setSecureStorageForTest(mockSecureStorage);

    mockAuthService = {
      validateSession: async () => ({
        userId: testUserId,
        email: 'test@example.com',
        displayName: 'Test User',
        accountStatus: 'ACTIVE',
        emailVerified: true,
        sessionId: 'sess-1',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
    } as unknown as AuthenticationService;
    setAuthServiceForTest(mockAuthService);

    mockToolRegistryService = {
      listTools: async () => [mockToolDto],
      getTool: async () => mockToolDto,
      invoke: async () => mockInvocationResultDto,
    } as unknown as ToolRegistryService;
  });

  describe('Security & Authentication Gates', () => {
    it('rejects untrusted sender frame for listing tools', async () => {
      const res = await handleListAgentTools(
        untrustedEvent,
        { projectId: testProjectId },
        mockToolRegistryService,
      );
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects unauthenticated caller when token is missing', async () => {
      mockSecureStorage.token = null;
      const res = await handleListAgentTools(
        trustedEvent,
        { projectId: testProjectId },
        mockToolRegistryService,
      );
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'AUTHENTICATION_FAILED');
      }
    });

    it('rejects untrusted sender frame for invoking a tool', async () => {
      const res = await handleInvokeAgentTool(
        untrustedEvent,
        {
          projectId: testProjectId,
          toolId: testToolId,
          input: { text: 'hello' },
        },
        mockToolRegistryService,
      );
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });
  });

  describe('Schema Validation & Delegation', () => {
    it('validates schema and successfully lists tools', async () => {
      let passedUserId: string | undefined = '';
      mockToolRegistryService.listTools = async (_input, userId) => {
        passedUserId = userId;
        return [mockToolDto];
      };

      const res = await handleListAgentTools(
        trustedEvent,
        { projectId: testProjectId, category: 'UTILITY' },
        mockToolRegistryService,
      );

      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.length, 1);
        assert.strictEqual(res.data[0]?.toolId, testToolId);
        assert.strictEqual(passedUserId, testUserId);
      }
    });

    it('validates schema and successfully gets a tool definition', async () => {
      const res = await handleGetAgentTool(
        trustedEvent,
        { projectId: testProjectId, toolId: testToolId },
        mockToolRegistryService,
      );

      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data?.toolId, testToolId);
      }
    });

    it('validates schema and delegates invocation', async () => {
      let passedInputPayload: InvokeAgentToolInputDto | null = null;
      let passedContext: unknown = null;

      mockToolRegistryService.invoke = async (input, ctx) => {
        passedInputPayload = input;
        passedContext = ctx;
        return mockInvocationResultDto;
      };

      const res = await handleInvokeAgentTool(
        trustedEvent,
        {
          projectId: testProjectId,
          toolId: testToolId,
          input: { text: 'ping' },
        },
        mockToolRegistryService,
      );

      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.success, true);
        assert(passedInputPayload !== null);
        assert.strictEqual((passedInputPayload as InvokeAgentToolInputDto).toolId, testToolId);
        assert.deepStrictEqual((passedInputPayload as InvokeAgentToolInputDto).input, {
          text: 'ping',
        });
        assert.strictEqual((passedContext as any).projectId, testProjectId);
        assert.strictEqual((passedContext as any).userId, testUserId);
      }
    });

    it('rejects invalid payload violating schema', async () => {
      const res = await handleInvokeAgentTool(
        trustedEvent,
        {
          projectId: 'not-a-uuid',
          toolId: '',
        },
        mockToolRegistryService,
      );

      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'VALIDATION_ERROR');
      }
    });
  });

  describe('Domain Error Mapping', () => {
    it('maps AgentToolNotFoundError to TOOL_REGISTRY_NOT_FOUND', async () => {
      mockToolRegistryService.getTool = async () => {
        throw new AgentToolNotFoundError(testToolId);
      };

      const res = await handleGetAgentTool(
        trustedEvent,
        { projectId: testProjectId, toolId: testToolId },
        mockToolRegistryService,
      );

      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'TOOL_REGISTRY_NOT_FOUND');
      }
    });

    it('maps AgentToolDisabledError to TOOL_REGISTRY_DISABLED', async () => {
      mockToolRegistryService.invoke = async () => {
        throw new AgentToolDisabledError(testToolId);
      };

      const res = await handleInvokeAgentTool(
        trustedEvent,
        {
          projectId: testProjectId,
          toolId: testToolId,
          input: { text: 'test' },
        },
        mockToolRegistryService,
      );

      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'TOOL_REGISTRY_DISABLED');
      }
    });

    it('maps AgentToolValidationError to TOOL_REGISTRY_VALIDATION_ERROR', async () => {
      mockToolRegistryService.invoke = async () => {
        throw new AgentToolValidationError('Input text is required');
      };

      const res = await handleInvokeAgentTool(
        trustedEvent,
        {
          projectId: testProjectId,
          toolId: testToolId,
          input: {},
        },
        mockToolRegistryService,
      );

      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'TOOL_REGISTRY_VALIDATION_ERROR');
      }
    });

    it('maps AgentToolOutputInvalidError to TOOL_REGISTRY_OUTPUT_INVALID', async () => {
      mockToolRegistryService.invoke = async () => {
        throw new AgentToolOutputInvalidError(testToolId, 'Output did not match schema');
      };

      const res = await handleInvokeAgentTool(
        trustedEvent,
        {
          projectId: testProjectId,
          toolId: testToolId,
          input: { text: 'foo' },
        },
        mockToolRegistryService,
      );

      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'TOOL_REGISTRY_OUTPUT_INVALID');
      }
    });

    it('maps AiCrossProjectAccessError to AI_CROSS_PROJECT_ACCESS', async () => {
      mockToolRegistryService.listTools = async () => {
        throw new AiCrossProjectAccessError('Tenant violation');
      };

      const res = await handleListAgentTools(
        trustedEvent,
        { projectId: testProjectId },
        mockToolRegistryService,
      );

      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'AI_CROSS_PROJECT_ACCESS');
      }
    });
  });
});
