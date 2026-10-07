/**
 * @file apps/desktop/src/main/ipc/generation-handlers.test.ts
 * IPC handler unit tests for V9 Phase 130 Local Model Chat & Generation Runtime.
 * Verifies sender validation, authentication, parameter validation, service delegation,
 * and deterministic error classification.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleLocalGenerate,
  handleCancelGeneration,
  handleGetGenerationStatus,
  handleStreamGeneration,
  handleGenerateStructured,
  handleValidateStructured,
  handleGetStructuredCapabilities,
  handleListAiTools,
  handleGetAiTool,
  handleParseAiToolCalls,
  handleValidateAiToolCall,
  handleGenerateAiToolCalls,
  handleGetAiToolCapabilities,
  handleEstimateTokens,
  handleCalculateContextBudget,
  handleOptimizeContextSelection,
  handleGetModelContextCapabilities,
  handleGetAiPrivacySettings,
  handleUpdateAiPrivacySettings,
  handleCheckAiContextFirewall,
  handleAssembleRequirementTestContext,
  setGenerationAiProviderServiceForTest,
} from './generation-handlers.js';
import {
  setAuthServiceForTest,
  setSecureStorageForTest,
} from './auth-handlers.js';
import {
  AiProviderService,
  AiProviderUnavailableError,
  AiModelUnavailableError,
  AiTimeoutError,
  AiCancelledError,
  AiConnectionError,
  AiGenerationError,
  AiCrossProjectAccessError,
  type AuthenticationService,
} from '@ai-quality/core';
import type {
  LocalGenerationResultDto,
  LocalGenerationStatusDto,
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

describe('V9 Phase 130 Local Generation IPC Handlers', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testUserId = 'user-uuid-1111-2222';
  const testRequestId = '22222222-2222-2222-2222-222222222222';

  const mockAuthService: Partial<AuthenticationService> = {
    validateSession: async (_token: string) => ({
      userId: testUserId,
      email: 'test@example.com',
      displayName: 'Test User',
      accountStatus: 'ACTIVE',
      emailVerified: true,
      role: 'ADMIN',
      sessionId: 'session-123',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }),
  };

  const validEvent: IpcMainInvokeEvent = {
    senderFrame: {
      url: 'app://renderer/index.html',
      parent: null,
    },
  } as unknown as IpcMainInvokeEvent;

  const untrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      url: 'https://attacker.evil.com',
      parent: null,
    },
  } as unknown as IpcMainInvokeEvent;

  const sampleResult: LocalGenerationResultDto = {
    requestId: testRequestId,
    provider: 'OLLAMA',
    model: 'llama3:8b',
    content: 'Generated response content',
    finishReason: 'stop',
    durationMs: 120,
    usage: {
      inputTokens: 10,
      outputTokens: 25,
      totalTokens: 35,
    },
    metadata: { loadDuration: 40 },
    state: 'COMPLETED',
  };

  beforeEach(() => {
    setAuthServiceForTest(mockAuthService as AuthenticationService);
    setSecureStorageForTest(new MockSecureStorage());
    setGenerationAiProviderServiceForTest(null);
  });

  // ==========================================================================
  // Section 1: Security & Sender Validation
  // ==========================================================================

  describe('1. Security & Sender Validation', () => {
    it('rejects untrusted sender frame for handleLocalGenerate', async () => {
      const result = await handleLocalGenerate(untrustedEvent, { prompt: 'Hello' });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects unauthenticated requests when session is invalid', async () => {
      const unauthService: Partial<AuthenticationService> = {
        validateSession: async () => {
          throw new Error('Session expired');
        },
      };
      setAuthServiceForTest(unauthService as AuthenticationService);

      const result = await handleLocalGenerate(validEvent, { prompt: 'Hello' });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'AUTHENTICATION_FAILED');
      }
    });

    it('rejects malformed generation request parameters with VALIDATION_ERROR', async () => {
      const result = await handleLocalGenerate(validEvent, {
        prompt: '', // empty prompt
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'VALIDATION_ERROR');
      }
    });
  });

  // ==========================================================================
  // Section 2: Generation Execution & Delegation
  // ==========================================================================

  describe('2. Generation Execution & Delegation', () => {
    it('successfully dispatches generation request to AiProviderService', async () => {
      let passedInput: unknown = null;
      let passedUser: string | undefined = undefined;

      const mockProviderService = {
        generateLocal: async (input: unknown, userId?: string) => {
          passedInput = input;
          passedUser = userId;
          return sampleResult;
        },
      } as unknown as AiProviderService;

      const result = await handleLocalGenerate(
        validEvent,
        {
          requestId: testRequestId,
          projectId: testProjectId,
          providerId: 'OLLAMA',
          modelId: 'llama3:8b',
          prompt: 'Hello model',
        },
        mockProviderService,
      );

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.requestId, testRequestId);
        assert.strictEqual(result.data.content, 'Generated response content');
        assert.strictEqual(result.data.state, 'COMPLETED');
      }
      assert.strictEqual(passedUser, testUserId);
      assert.deepStrictEqual(passedInput, {
        requestId: testRequestId,
        projectId: testProjectId,
        providerId: 'OLLAMA',
        modelId: 'llama3:8b',
        prompt: 'Hello model',
      });
    });

    it('successfully cancels in-flight generation request', async () => {
      let cancelledId = '';

      const mockProviderService = {
        cancelLocalGeneration: async (input: { requestId: string }) => {
          cancelledId = input.requestId;
          return { cancelled: true, requestId: input.requestId };
        },
      } as unknown as AiProviderService;

      const result = await handleCancelGeneration(
        validEvent,
        { requestId: testRequestId },
        mockProviderService,
      );

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.cancelled, true);
        assert.strictEqual(result.data.requestId, testRequestId);
      }
      assert.strictEqual(cancelledId, testRequestId);
    });

    it('retrieves lifecycle status for a request ID', async () => {
      const mockStatus: LocalGenerationStatusDto = {
        requestId: testRequestId,
        state: 'RUNNING',
        modelId: 'llama3:8b',
        startedAt: new Date().toISOString(),
      };

      const mockProviderService = {
        getLocalGenerationStatus: () => mockStatus,
      } as unknown as AiProviderService;

      const result = await handleGetGenerationStatus(
        validEvent,
        { requestId: testRequestId },
        mockProviderService,
      );

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.state, 'RUNNING');
        assert.strictEqual(result.data.requestId, testRequestId);
      }
    });
  });

  // ==========================================================================
  // Section 3: Error Classification & Translation
  // ==========================================================================

  describe('3. Error Classification & Translation', () => {
    it('translates AiConnectionError to CONNECTION_ERROR', async () => {
      const mockProviderService = {
        generateLocal: async () => {
          throw new AiConnectionError('OLLAMA', 'Socket disconnected mid-generation');
        },
      } as unknown as AiProviderService;

      const result = await handleLocalGenerate(
        validEvent,
        { prompt: 'Say hello' },
        mockProviderService,
      );

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'CONNECTION_ERROR');
        assert.match(result.error.message, /Socket disconnected/);
      }
    });

    it('translates AiTimeoutError to TIMEOUT', async () => {
      const mockProviderService = {
        generateLocal: async () => {
          throw new AiTimeoutError(5000, 'OLLAMA');
        },
      } as unknown as AiProviderService;

      const result = await handleLocalGenerate(
        validEvent,
        { prompt: 'Timeout test' },
        mockProviderService,
      );

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'TIMEOUT');
      }
    });

    it('translates AiCancelledError to CANCELLED', async () => {
      const mockProviderService = {
        generateLocal: async () => {
          throw new AiCancelledError('OLLAMA');
        },
      } as unknown as AiProviderService;

      const result = await handleLocalGenerate(
        validEvent,
        { prompt: 'Cancel test' },
        mockProviderService,
      );

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'CANCELLED');
      }
    });

    it('translates AiModelUnavailableError to MODEL_UNAVAILABLE', async () => {
      const mockProviderService = {
        generateLocal: async () => {
          throw new AiModelUnavailableError('missing-model:latest', 'OLLAMA');
        },
      } as unknown as AiProviderService;

      const result = await handleLocalGenerate(
        validEvent,
        { prompt: 'Model test' },
        mockProviderService,
      );

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'MODEL_UNAVAILABLE');
      }
    });

    it('translates AiProviderUnavailableError to PROVIDER_UNAVAILABLE', async () => {
      const mockProviderService = {
        generateLocal: async () => {
          throw new AiProviderUnavailableError('OLLAMA', 'Ollama offline');
        },
      } as unknown as AiProviderService;

      const result = await handleLocalGenerate(
        validEvent,
        { prompt: 'Provider test' },
        mockProviderService,
      );

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'PROVIDER_UNAVAILABLE');
      }
    });

    it('translates AiCrossProjectAccessError to PERMISSION_DENIED', async () => {
      const mockProviderService = {
        generateLocal: async () => {
          throw new AiCrossProjectAccessError('Unauthorized project');
        },
      } as unknown as AiProviderService;

      const result = await handleLocalGenerate(
        validEvent,
        { prompt: 'Project test' },
        mockProviderService,
      );

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'PERMISSION_DENIED');
      }
    });

    it('translates AiGenerationError to GENERATION_ERROR', async () => {
      const mockProviderService = {
        generateLocal: async () => {
          throw new AiGenerationError('General failure', 'OLLAMA');
        },
      } as unknown as AiProviderService;

      const result = await handleLocalGenerate(
        validEvent,
        { prompt: 'Failure test' },
        mockProviderService,
      );

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'GENERATION_ERROR');
      }
    });
  });

  describe('handleStreamGeneration (Phase 131)', () => {
    it('rejects untrusted sender frame', async () => {
      const result = await handleStreamGeneration(untrustedEvent, {
        prompt: 'Stream test',
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects unauthenticated request', async () => {
      const emptyStorage = new MockSecureStorage();
      emptyStorage.token = null;
      setSecureStorageForTest(emptyStorage);

      const result = await handleStreamGeneration(validEvent, {
        prompt: 'Stream test',
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'AUTHENTICATION_FAILED');
      }
    });

    it('validates request payload schema', async () => {
      const result = await handleStreamGeneration(validEvent, {
        prompt: '', // Invalid empty prompt
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'VALIDATION_ERROR');
      }
    });

    it('initiates stream and pushes events across IPC to sender', async () => {
      const sentEvents: Array<{ channel: string; data: unknown }> = [];
      const mockSender = {
        isDestroyed: () => false,
        send: (channel: string, data: unknown) => {
          sentEvents.push({ channel, data });
        },
      };

      const streamEventWithSender: IpcMainInvokeEvent = {
        senderFrame: {
          url: 'app://renderer/index.html',
          parent: null,
        },
        sender: mockSender,
      } as unknown as IpcMainInvokeEvent;

      const mockProviderService = {
        streamLocal: async function* () {
          yield {
            requestId: testRequestId,
            sequence: 0,
            type: 'START',
            content: '',
            deltaText: '',
            accumulatedText: '',
            done: false,
            model: 'llama3:8b',
            provider: 'OLLAMA',
          };
          yield {
            requestId: testRequestId,
            sequence: 1,
            type: 'DELTA',
            content: 'Hello',
            deltaText: 'Hello',
            accumulatedText: 'Hello',
            done: false,
            model: 'llama3:8b',
            provider: 'OLLAMA',
          };
          yield {
            requestId: testRequestId,
            sequence: 2,
            type: 'COMPLETE',
            content: 'Hello',
            deltaText: '',
            accumulatedText: 'Hello',
            done: true,
            model: 'llama3:8b',
            provider: 'OLLAMA',
            finishReason: 'stop',
          };
        },
        cancelLocalGeneration: async () => {},
      } as unknown as AiProviderService;

      const result = await handleStreamGeneration(
        streamEventWithSender,
        { prompt: 'Hello world', requestId: testRequestId },
        mockProviderService,
      );

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.requestId, testRequestId);
      }

      // Allow background async generator consumption to tick
      await new Promise((r) => setTimeout(r, 20));

      assert(sentEvents.length >= 3);
      const unifiedEvents = sentEvents.filter(
        (e) => e.channel === 'desktop:ai:stream:event',
      );
      assert.strictEqual(unifiedEvents.length, 3);
    });

    it('cancels stream if renderer is destroyed mid-stream', async () => {
      let isDestroyed = false;
      let cancelledRequestId: string | null = null;

      const mockSender = {
        isDestroyed: () => isDestroyed,
        send: () => {},
      };

      const streamEventWithSender: IpcMainInvokeEvent = {
        senderFrame: {
          url: 'app://renderer/index.html',
          parent: null,
        },
        sender: mockSender,
      } as unknown as IpcMainInvokeEvent;

      const mockProviderService = {
        streamLocal: async function* () {
          yield {
            requestId: testRequestId,
            sequence: 0,
            type: 'START',
            content: '',
            deltaText: '',
            accumulatedText: '',
            done: false,
            model: 'llama3:8b',
            provider: 'OLLAMA',
          };
          // Simulate window closing right after first event
          isDestroyed = true;
          yield {
            requestId: testRequestId,
            sequence: 1,
            type: 'DELTA',
            content: 'Chunk',
            deltaText: 'Chunk',
            accumulatedText: 'Chunk',
            done: false,
            model: 'llama3:8b',
            provider: 'OLLAMA',
          };
        },
        cancelLocalGeneration: async (input: { requestId: string }) => {
          cancelledRequestId = input.requestId;
        },
      } as unknown as AiProviderService;

      const result = await handleStreamGeneration(
        streamEventWithSender,
        { prompt: 'Disconnect test', requestId: testRequestId },
        mockProviderService,
      );

      assert.strictEqual(result.ok, true);

      // Allow background async generator consumption to tick
      await new Promise((r) => setTimeout(r, 20));

      assert.strictEqual(cancelledRequestId, testRequestId);
    });
  });

  describe('handleGenerateStructured & handleValidateStructured (Phase 132)', () => {
    it('rejects untrusted sender frame for structured generation', async () => {
      const result = await handleGenerateStructured(untrustedEvent, {
        schemaName: 'TestPlan',
        prompt: 'Generate plan',
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects unauthenticated structured request', async () => {
      const emptyStorage = new MockSecureStorage();
      emptyStorage.token = null;
      setSecureStorageForTest(emptyStorage);

      const result = await handleGenerateStructured(validEvent, {
        schemaName: 'TestPlan',
        prompt: 'Generate plan',
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'AUTHENTICATION_FAILED');
      }
    });

    it('rejects invalid payload without schemaName', async () => {
      const result = await handleGenerateStructured(validEvent, {
        prompt: 'No schema given',
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'VALIDATION_ERROR');
      }
    });

    it('delegates valid structured generation request to AiProviderService', async () => {
      const mockResult = {
        requestId: testRequestId,
        provider: 'OLLAMA',
        model: 'llama3:8b',
        schemaName: 'TestPlan',
        schemaVersion: 1,
        rawContent: '{"name":"Test","objective":"Verify","steps":[{"action":"click","target":"btn","expected":"done"}]}',
        parsedData: { name: 'Test', objective: 'Verify', steps: [{ action: 'click', target: 'btn', expected: 'done' }] },
        validationStatus: 'VALID' as const,
        validationErrors: [],
        retryCount: 0,
        capabilityUsed: 'NATIVE' as const,
        durationMs: 150,
        parseDurationMs: 2,
        validationDurationMs: 1,
      };

      const mockProviderService = {
        generateStructured: async () => mockResult,
      } as unknown as AiProviderService;

      const result = await handleGenerateStructured(
        validEvent,
        { schemaName: 'TestPlan', prompt: 'Build test plan' },
        mockProviderService,
      );

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.schemaName, 'TestPlan');
        assert.strictEqual(result.data.validationStatus, 'VALID');
      }
    });

    it('validates raw structured content via handleValidateStructured', async () => {
      const mockValidationResult = {
        schemaName: 'TestPlan',
        schemaVersion: 1,
        status: 'VALID' as const,
        parsedData: { name: 'Test', objective: 'Verify', steps: [{ action: 'click', target: 'btn', expected: 'done' }] },
        errors: [],
        parseDurationMs: 1,
        validationDurationMs: 1,
      };

      const mockProviderService = {
        validateStructured: () => mockValidationResult,
      } as unknown as AiProviderService;

      const result = await handleValidateStructured(
        validEvent,
        {
          schemaName: 'TestPlan',
          rawContent: '{"name":"Test","objective":"Verify","steps":[{"action":"click","target":"btn","expected":"done"}]}',
        },
        mockProviderService,
      );

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.status, 'VALID');
      }
    });

    it('retrieves structured capabilities via handleGetStructuredCapabilities', async () => {
      const mockCapabilities = {
        providerId: 'OLLAMA',
        modelId: 'llama3:8b',
        capability: 'NATIVE' as const,
        supportsJsonFormat: true,
        supportsJsonSchema: false,
        description: 'Native JSON mode supported by provider runtime.',
      };

      const mockProviderService = {
        getStructuredCapabilities: async () => mockCapabilities,
      } as unknown as AiProviderService;

      const result = await handleGetStructuredCapabilities(
        validEvent,
        { providerId: 'OLLAMA', modelId: 'llama3:8b' },
        mockProviderService,
      );

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.capability, 'NATIVE');
        assert.strictEqual(result.data.supportsJsonFormat, true);
      }
    });
  });

  describe('V9 Phase 133 Tool-Calling Compatibility Handlers', () => {
    it('lists registered tools via handleListAiTools', async () => {
      const mockTools = [
        {
          name: 'repository.search',
          description: 'Search repository',
          inputSchema: { type: 'object' },
          version: 1,
          category: 'REPOSITORY' as const,
          riskLevel: 'READ_ONLY' as const,
        },
      ];

      const mockProviderService = {
        listTools: async () => mockTools,
      } as unknown as AiProviderService;

      const result = await handleListAiTools(validEvent, {}, mockProviderService);

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.length, 1);
        assert.strictEqual(result.data[0]?.name, 'repository.search');
      }
    });

    it('retrieves a single tool via handleGetAiTool', async () => {
      const mockTool = {
        name: 'tests.list',
        description: 'List tests',
        inputSchema: { type: 'object' },
        version: 1,
        category: 'TESTS' as const,
        riskLevel: 'READ_ONLY' as const,
      };

      const mockProviderService = {
        getTool: async () => mockTool,
      } as unknown as AiProviderService;

      const result = await handleGetAiTool(validEvent, { name: 'tests.list' }, mockProviderService);

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data?.name, 'tests.list');
      }
    });

    it('parses raw model content into tool calls via handleParseAiToolCalls', async () => {
      const mockCalls = [
        {
          id: 'call_1',
          name: 'repository.search',
          arguments: { query: 'test' },
          schemaVersion: 1,
        },
      ];

      const mockProviderService = {
        parseToolCalls: () => mockCalls,
      } as unknown as AiProviderService;

      const result = await handleParseAiToolCalls(
        validEvent,
        { rawContent: '{"tool_calls":[{"name":"repository.search","arguments":{"query":"test"}}]}' },
        mockProviderService,
      );

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.length, 1);
        assert.strictEqual(result.data[0]?.name, 'repository.search');
      }
    });

    it('validates a tool call via handleValidateAiToolCall', async () => {
      const mockValidationResult = {
        toolCall: {
          id: 'call_1',
          name: 'repository.search',
          arguments: { query: 'login' },
          schemaVersion: 1,
        },
        status: 'VALID' as const,
        errors: [],
      };

      const mockProviderService = {
        validateToolCall: async () => mockValidationResult,
      } as unknown as AiProviderService;

      const result = await handleValidateAiToolCall(
        validEvent,
        {
          toolCall: {
            id: 'call_1',
            name: 'repository.search',
            arguments: { query: 'login' },
            schemaVersion: 1,
          },
        },
        mockProviderService,
      );

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.status, 'VALID');
      }
    });

    it('generates validated tool calls via handleGenerateAiToolCalls', async () => {
      const mockGenerateResult = {
        requestId: testRequestId,
        provider: 'OLLAMA',
        model: 'llama3:8b',
        rawContent: '{"tool_calls":[{"name":"repository.search","arguments":{"query":"auth"}}]}',
        validatedCalls: [
          {
            toolCall: {
              id: 'call_1',
              name: 'repository.search',
              arguments: { query: 'auth' },
              schemaVersion: 1,
            },
            status: 'VALID' as const,
            errors: [],
          },
        ],
        capabilityUsed: 'NATIVE' as const,
        durationMs: 120,
        parseDurationMs: 2,
        validationDurationMs: 1,
      };

      const mockProviderService = {
        generateToolCalls: async () => mockGenerateResult,
      } as unknown as AiProviderService;

      const result = await handleGenerateAiToolCalls(
        validEvent,
        { prompt: 'Find auth files' },
        mockProviderService,
      );

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.validatedCalls.length, 1);
        assert.strictEqual(result.data.validatedCalls[0]?.status, 'VALID');
      }
    });

    it('retrieves tool capabilities via handleGetAiToolCapabilities', async () => {
      const mockCaps = {
        providerId: 'OLLAMA',
        modelId: 'llama3:8b',
        capability: 'NATIVE' as const,
        supportsStreamingToolCalls: true,
        supportsMultiToolCalls: true,
        description: 'Native tool calling',
      };

      const mockProviderService = {
        getToolCapabilities: async () => mockCaps,
      } as unknown as AiProviderService;

      const result = await handleGetAiToolCapabilities(validEvent, {}, mockProviderService);

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.capability, 'NATIVE');
        assert.strictEqual(result.data.supportsStreamingToolCalls, true);
      }
    });
  });

  describe('Phase 134 Context Window & Token Management IPC Handlers', () => {
    it('estimates tokens via handleEstimateTokens', async () => {
      const mockEstimateResult = {
        totalTokens: 125,
        estimatedChars: 500,
        breakdown: {
          userPromptTokens: 50,
          systemPromptTokens: 75,
        },
        method: 'HEURISTIC' as const,
      };

      const mockProviderService = {
        estimateTokens: () => mockEstimateResult,
      } as unknown as AiProviderService;

      const result = await handleEstimateTokens(
        validEvent,
        { text: 'Hello world sample text' },
        mockProviderService,
      );

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.totalTokens, 125);
        assert.strictEqual(result.data.method, 'HEURISTIC');
      }
    });

    it('rejects untrusted sender in handleEstimateTokens', async () => {
      const result = await handleEstimateTokens(untrustedEvent, { text: 'test' });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('calculates context budget via handleCalculateContextBudget', async () => {
      const mockBudgetResult = {
        modelId: 'llama3:8b',
        provider: 'OLLAMA',
        contextWindow: 8192,
        maxInputTokens: 8192,
        reservedOutputTokens: 2048,
        safetyMarginTokens: 512,
        availableInputBudget: 5632,
        isEstimated: false,
      };

      const mockProviderService = {
        calculateContextBudget: async () => mockBudgetResult,
      } as unknown as AiProviderService;

      const result = await handleCalculateContextBudget(
        validEvent,
        { modelId: 'llama3:8b', reservationTier: 'MEDIUM' },
        mockProviderService,
      );

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.availableInputBudget, 5632);
        assert.strictEqual(result.data.contextWindow, 8192);
      }
    });

    it('optimizes context selection via handleOptimizeContextSelection', async () => {
      const mockOptimizeResult = {
        modelId: 'llama3:8b',
        provider: 'OLLAMA',
        budget: {
          modelId: 'llama3:8b',
          provider: 'OLLAMA',
          contextWindow: 8192,
          maxInputTokens: 8192,
          reservedOutputTokens: 2048,
          safetyMarginTokens: 512,
          availableInputBudget: 5632,
          isEstimated: false,
        },
        selectedItems: [
          {
            id: 'item-1',
            level: 'P1_USER_REQUEST' as const,
            priorityOrder: 1,
            category: 'USER_REQUEST',
            title: 'User query',
            content: 'User query',
            estimatedTokens: 100,
            isMandatory: true,
          },
        ],
        omittedItems: [],
        totalSelectedTokens: 100,
        totalOmittedTokens: 0,
        fitsWithinBudget: true,
        assembledPrompt: 'User query',
        assembledSystemPrompt: 'You are an assistant',
        reductionApplied: false,
      };

      const mockProviderService = {
        optimizeContextSelection: async () => mockOptimizeResult,
      } as unknown as AiProviderService;

      const result = await handleOptimizeContextSelection(
        validEvent,
        {
          modelId: 'llama3:8b',
          userPrompt: 'User query',
        },
        mockProviderService,
      );

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.totalSelectedTokens, 100);
        assert.strictEqual(result.data.selectedItems.length, 1);
      }
    });

    it('retrieves model context capabilities via handleGetModelContextCapabilities', async () => {
      const mockCapsResult = {
        modelId: 'llama3:8b',
        provider: 'OLLAMA',
        contextWindow: 8192,
        maxInputTokens: 8192,
        maxOutputTokens: 2048,
        supportsStreaming: true,
        supportsTools: true,
        supportsStructuredOutput: true,
        isEstimated: false,
      };

      const mockProviderService = {
        getModelContextCapabilities: async () => mockCapsResult,
      } as unknown as AiProviderService;

      const result = await handleGetModelContextCapabilities(
        validEvent,
        { modelId: 'llama3:8b' },
        mockProviderService,
      );

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.contextWindow, 8192);
        assert.strictEqual(result.data.isEstimated, false);
      }
    });
  });

  describe('Phase 137 — AI Privacy & Local-Only Mode Handlers', () => {
    it('retrieves privacy settings via handleGetAiPrivacySettings', async () => {
      const mockPrivacyResult = {
        id: 'settings-1',
        projectId: 'project-1',
        userId: 'test-user-id',
        privacyMode: 'LOCAL_ONLY' as const,
        allowCloudFallback: false,
        redactSecrets: true,
        stripCredentials: true,
        permittedLocalProvider: 'OLLAMA',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const mockProviderService = {
        getPrivacySettings: async () => mockPrivacyResult,
      } as unknown as AiProviderService;

      const result = await handleGetAiPrivacySettings(
        validEvent,
        { projectId: '00000000-0000-0000-0000-000000000001' },
        mockProviderService,
      );

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.privacyMode, 'LOCAL_ONLY');
        assert.strictEqual(result.data.allowCloudFallback, false);
      }
    });

    it('updates privacy settings via handleUpdateAiPrivacySettings', async () => {
      const mockUpdated = {
        id: 'settings-1',
        projectId: 'project-1',
        userId: 'test-user-id',
        privacyMode: 'LOCAL_ONLY' as const,
        allowCloudFallback: false,
        redactSecrets: true,
        stripCredentials: true,
        permittedLocalProvider: 'OLLAMA',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const mockProviderService = {
        updatePrivacySettings: async () => mockUpdated,
      } as unknown as AiProviderService;

      const result = await handleUpdateAiPrivacySettings(
        validEvent,
        {
          projectId: '00000000-0000-0000-0000-000000000001',
          privacyMode: 'LOCAL_ONLY',
          allowCloudFallback: false,
        },
        mockProviderService,
      );

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.privacyMode, 'LOCAL_ONLY');
      }
    });

    it('checks context firewall via handleCheckAiContextFirewall', async () => {
      const mockFirewallResult = {
        allowed: true,
        privacyMode: 'LOCAL_ONLY' as const,
        providerId: 'OLLAMA',
        providerType: 'LOCAL' as const,
        sanitizedPrompt: 'Clean prompt',
        sanitizedSystemPrompt: null,
        sanitizedContext: null,
        redactedSecretsCount: 1,
        dataClassifications: ['PROJECT_DATA' as const, 'SECRET' as const],
      };

      const mockProviderService = {
        checkContextFirewall: async () => mockFirewallResult,
      } as unknown as AiProviderService;

      const result = await handleCheckAiContextFirewall(
        validEvent,
        {
          providerId: 'OLLAMA',
          prompt: 'Clean prompt with api_key=sk-secret',
        },
        mockProviderService,
      );

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.allowed, true);
        assert.strictEqual(result.data.redactedSecretsCount, 1);
      }
    });
  });

  describe('Phase 136 — Requirement & Test Context Adapter Handlers', () => {
    it('assembles requirement and test context via handleAssembleRequirementTestContext', async () => {
      const mockResult = {
        projectId: '00000000-0000-0000-0000-000000000001',
        requirements: [
          {
            id: '00000000-0000-0000-0000-000000000010',
            requirementKey: 'REQ-101',
            title: 'User Login',
            description: 'User enters credentials',
            type: 'FUNCTIONAL',
            status: 'ACTIVE',
            priority: 'HIGH',
          },
        ],
        testCases: [
          {
            id: '00000000-0000-0000-0000-000000000020',
            testCaseKey: 'TC-101',
            title: 'Verify valid credentials',
            type: 'POSITIVE',
            priority: 'HIGH',
            status: 'APPROVED',
            reviewStatus: 'APPROVED',
          },
        ],
        traceability: [
          {
            id: '00000000-0000-0000-0000-000000000030',
            requirementId: '00000000-0000-0000-0000-000000000010',
            requirementKey: 'REQ-101',
            testCaseId: '00000000-0000-0000-0000-000000000020',
            testCaseKey: 'TC-101',
            status: 'CURRENT',
            origin: 'GENERATED',
          },
        ],
        executions: [],
        failures: [],
        formattedRequirementContext: 'Formatted REQ-101',
        formattedTestContext: 'Formatted TC-101',
        formattedUnifiedContext: 'Formatted REQ-101\n\nFormatted TC-101',
        estimatedTokens: 25,
        truncated: false,
      };

      const mockProviderService = {
        assembleRequirementTestContext: async () => mockResult,
      } as unknown as AiProviderService;

      const result = await handleAssembleRequirementTestContext(
        validEvent,
        {
          projectId: '00000000-0000-0000-0000-000000000001',
          requirementKeys: ['REQ-101'],
        },
        mockProviderService,
      );

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.requirements.length, 1);
        assert.strictEqual(result.data.testCases.length, 1);
        assert.strictEqual(result.data.traceability.length, 1);
        assert.strictEqual(result.data.estimatedTokens, 25);
      }
    });

    it('rejects untrusted sender in handleAssembleRequirementTestContext', async () => {
      const untrustedEvent = {
        senderFrame: {
          processId: 999,
          routingId: 999,
          url: 'http://malicious.evil.com',
        },
      } as unknown as IpcMainInvokeEvent;

      const result = await handleAssembleRequirementTestContext(untrustedEvent, {
        projectId: '00000000-0000-0000-0000-000000000001',
      });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
      }
    });
  });
});


