/**
 * @file apps/desktop/src/main/ipc/ai-model-handlers.test.ts
 * Privileged IPC handler unit tests for V9 Phase 128: Installed Model Discovery.
 * Covers sender validation, authentication, Zod input validation, service delegation,
 * and deterministic error mapping.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleListAiModels,
  handleRefreshAiModels,
  handleGetAiModel,
  handleGetModelCapabilities,
  handleVerifyModelCapabilities,
  handleSelectModel,
  handleGetModelSelection,
  handleResolveModelForTask,
  setAiModelProviderServiceForTest,
} from './ai-model-handlers.js';
import {
  setAuthServiceForTest,
  setSecureStorageForTest,
} from './auth-handlers.js';
import {
  AiProviderService,
  AiProviderUnavailableError,
  AiModelNotFoundError,
  AiModelUnavailableError,
  AiTimeoutError,
  AiCrossProjectAccessError,
  AiConfigInvalidError,
  AiConfigNotFoundError,
  type AuthenticationService,
} from '@ai-quality/core';
import type {
  AiModelListDto,
  AiModelDto,
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

describe('V9 Phase 128 Installed Model Discovery IPC Handlers', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testUserId = 'user-uuid-1111-2222';

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
      url: 'https://evil.attacker.com',
      parent: null,
    },
  } as unknown as IpcMainInvokeEvent;

  const sampleModel: AiModelDto = {
    id: 'ollama:llama3.2:latest',
    name: 'llama3.2:latest',
    provider: 'ollama',
    size: 2000000000,
    digest: 'abcdef1234567890',
    modifiedAt: '2026-10-05T12:00:00Z',
    family: 'llama',
    architecture: 'llama',
    parameters: '3.2B',
    quantization: 'Q4_K_M',
    contextLength: 131072,
    capabilities: {
      textGeneration: true,
      embeddings: false,
      vision: false,
      toolCalling: false,
    },
  };

  const sampleModelList: AiModelListDto = {
    provider: 'ollama',
    models: [sampleModel],
    total: 1,
    refreshedAt: '2026-10-05T12:00:00Z',
    fromCache: false,
  };

  beforeEach(() => {
    setAuthServiceForTest(mockAuthService as AuthenticationService);
    setSecureStorageForTest(new MockSecureStorage());
    setAiModelProviderServiceForTest(null);
  });

  describe('Security & Sender Validation', () => {
    it('should reject untrusted sender frame for handleListAiModels', async () => {
      const res = await handleListAiModels(untrustedEvent, { projectId: testProjectId });
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('should reject untrusted sender frame for handleRefreshAiModels', async () => {
      const res = await handleRefreshAiModels(untrustedEvent, { projectId: testProjectId });
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('should reject untrusted sender frame for handleGetAiModel', async () => {
      const res = await handleGetAiModel(untrustedEvent, {
        projectId: testProjectId,
        modelId: 'ollama:llama3.2:latest',
      });
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('should reject unauthenticated request when token is missing', async () => {
      const emptyStorage = new MockSecureStorage();
      emptyStorage.token = null;
      setSecureStorageForTest(emptyStorage);

      const res = await handleListAiModels(validEvent, { projectId: testProjectId });
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'AUTHENTICATION_FAILED');
      }
    });
  });

  describe('Input Validation', () => {
    it('should reject invalid UUID projectId in list', async () => {
      const res = await handleListAiModels(validEvent, { projectId: 'not-a-uuid' });
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'VALIDATION_ERROR');
      }
    });

    it('should reject missing modelId in get', async () => {
      const res = await handleGetAiModel(validEvent, { projectId: testProjectId });
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'VALIDATION_ERROR');
      }
    });
  });

  describe('Service Delegation & Error Translation', () => {
    it('should successfully list AI models', async () => {
      const mockService = {
        listAiModels: async (input: unknown, userId: string) => {
          assert.strictEqual(userId, testUserId);
          return sampleModelList;
        },
      } as unknown as AiProviderService;

      const res = await handleListAiModels(validEvent, { projectId: testProjectId }, mockService);
      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.total, 1);
        const first = res.data.models[0];
        assert.ok(first);
        assert.strictEqual(first.name, 'llama3.2:latest');
      }
    });

    it('should successfully refresh AI models', async () => {
      const mockService = {
        refreshAiModels: async (input: unknown, userId: string) => {
          assert.strictEqual(userId, testUserId);
          return sampleModelList;
        },
      } as unknown as AiProviderService;

      const res = await handleRefreshAiModels(validEvent, { projectId: testProjectId }, mockService);
      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.total, 1);
      }
    });

    it('should successfully get single AI model', async () => {
      const mockService = {
        getAiModel: async (input: unknown, userId: string) => {
          assert.strictEqual(userId, testUserId);
          return sampleModel;
        },
      } as unknown as AiProviderService;

      const res = await handleGetAiModel(
        validEvent,
        { projectId: testProjectId, modelId: 'ollama:llama3.2:latest' },
        mockService,
      );
      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.id, 'ollama:llama3.2:latest');
      }
    });

    it('should translate AiModelNotFoundError to AI_MODEL_NOT_FOUND', async () => {
      const mockService = {
        getAiModel: async () => {
          throw new AiModelNotFoundError('Model nonexistent not found.');
        },
      } as unknown as AiProviderService;

      const res = await handleGetAiModel(
        validEvent,
        { projectId: testProjectId, modelId: 'nonexistent' },
        mockService,
      );
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'AI_MODEL_NOT_FOUND');
      }
    });

    it('should translate AiProviderUnavailableError to PROVIDER_UNAVAILABLE', async () => {
      const mockService = {
        listAiModels: async () => {
          throw new AiProviderUnavailableError('Ollama daemon not running.');
        },
      } as unknown as AiProviderService;

      const res = await handleListAiModels(validEvent, { projectId: testProjectId }, mockService);
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'PROVIDER_UNAVAILABLE');
      }
    });

    it('should translate AiTimeoutError to TIMEOUT', async () => {
      const mockService = {
        listAiModels: async () => {
          throw new AiTimeoutError(5000, 'ollama');
        },
      } as unknown as AiProviderService;

      const res = await handleListAiModels(validEvent, { projectId: testProjectId }, mockService);
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'TIMEOUT');
      }
    });

    it('should translate AiCrossProjectAccessError to PERMISSION_DENIED', async () => {
      const mockService = {
        listAiModels: async () => {
          throw new AiCrossProjectAccessError('Unauthorized access to project.');
        },
      } as unknown as AiProviderService;

      const res = await handleListAiModels(validEvent, { projectId: testProjectId }, mockService);
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'PERMISSION_DENIED');
      }
    });
  });

  describe('V9 Phase 129 Model Capabilities & Selection IPC Handlers', () => {
    const sampleProfile = {
      modelId: 'ollama:llama3.2:latest',
      modelName: 'llama3.2:latest',
      provider: 'ollama',
      availability: true,
      contextLength: 131072,
      capabilities: {
        CHAT: { status: 'SUPPORTED' as const, source: 'METADATA' as const, confidence: 1.0, verifiedAt: '2026-10-05T12:00:00Z' },
        TEXT_GENERATION: { status: 'SUPPORTED' as const, source: 'METADATA' as const, confidence: 1.0, verifiedAt: '2026-10-05T12:00:00Z' },
        STREAMING: { status: 'UNKNOWN' as const, source: 'HEURISTIC' as const, confidence: 0.5 },
        STRUCTURED_OUTPUT: { status: 'UNKNOWN' as const, source: 'HEURISTIC' as const, confidence: 0.5 },
        JSON_OUTPUT: { status: 'UNKNOWN' as const, source: 'HEURISTIC' as const, confidence: 0.5 },
        TOOL_CALLING: { status: 'UNKNOWN' as const, source: 'HEURISTIC' as const, confidence: 0.5 },
        CODE_GENERATION: { status: 'SUPPORTED' as const, source: 'HEURISTIC' as const, confidence: 0.8 },
        CODE_ANALYSIS: { status: 'SUPPORTED' as const, source: 'HEURISTIC' as const, confidence: 0.8 },
        LONG_CONTEXT: { status: 'SUPPORTED' as const, source: 'METADATA' as const, confidence: 1.0 },
        VISION: { status: 'UNSUPPORTED' as const, source: 'METADATA' as const, confidence: 1.0 },
        EMBEDDING: { status: 'UNSUPPORTED' as const, source: 'METADATA' as const, confidence: 1.0 },
      },
      verifiedAt: '2026-10-05T12:00:00Z',
    };

    const sampleSelection = {
      selectedModel: sampleModel,
      provider: 'ollama',
      task: 'default' as const,
      selectionType: 'DEFAULT' as const,
      capabilities: sampleProfile.capabilities,
      selectionReason: 'User default model',
      isPersistent: true,
      lastVerifiedAt: '2026-10-05T12:00:00Z',
    };

    it('should reject untrusted sender for Phase 129 handlers', async () => {
      const r1 = await handleGetModelCapabilities(untrustedEvent, {
        projectId: testProjectId,
        modelId: 'ollama:llama3.2:latest',
      });
      assert.strictEqual(r1.ok, false);
      if (!r1.ok) assert.strictEqual(r1.error.code, 'UNAUTHORIZED_SENDER');

      const r2 = await handleVerifyModelCapabilities(untrustedEvent, {
        projectId: testProjectId,
        modelId: 'ollama:llama3.2:latest',
      });
      assert.strictEqual(r2.ok, false);
      if (!r2.ok) assert.strictEqual(r2.error.code, 'UNAUTHORIZED_SENDER');

      const r3 = await handleSelectModel(untrustedEvent, {
        projectId: testProjectId,
        selectionType: 'DEFAULT',
        modelId: 'ollama:llama3.2:latest',
      });
      assert.strictEqual(r3.ok, false);
      if (!r3.ok) assert.strictEqual(r3.error.code, 'UNAUTHORIZED_SENDER');

      const r4 = await handleGetModelSelection(untrustedEvent, {
        projectId: testProjectId,
        selectionType: 'DEFAULT',
      });
      assert.strictEqual(r4.ok, false);
      if (!r4.ok) assert.strictEqual(r4.error.code, 'UNAUTHORIZED_SENDER');

      const r5 = await handleResolveModelForTask(untrustedEvent, {
        projectId: testProjectId,
        task: 'code',
      });
      assert.strictEqual(r5.ok, false);
      if (!r5.ok) assert.strictEqual(r5.error.code, 'UNAUTHORIZED_SENDER');
    });

    it('should validate inputs for Phase 129 handlers', async () => {
      // Invalid task for handleResolveModelForTask
      const badTask = await handleResolveModelForTask(validEvent, {
        projectId: testProjectId,
        task: 'invalid-task',
      });
      assert.strictEqual(badTask.ok, false);
      if (!badTask.ok) assert.strictEqual(badTask.error.code, 'VALIDATION_ERROR');

      // Missing modelId for handleGetModelCapabilities
      const missingModel = await handleGetModelCapabilities(validEvent, {
        projectId: testProjectId,
      });
      assert.strictEqual(missingModel.ok, false);
      if (!missingModel.ok) assert.strictEqual(missingModel.error.code, 'VALIDATION_ERROR');
    });

    it('should successfully get model capabilities', async () => {
      const mockService = {
        getModelCapabilities: async () => sampleProfile,
      } as unknown as AiProviderService;

      const res = await handleGetModelCapabilities(
        validEvent,
        { projectId: testProjectId, modelId: 'ollama:llama3.2:latest' },
        mockService,
      );
      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.modelId, 'ollama:llama3.2:latest');
        assert.strictEqual(res.data.capabilities.CHAT.status, 'SUPPORTED');
      }
    });

    it('should successfully verify model capabilities via probe', async () => {
      const mockService = {
        verifyModelCapabilities: async () => ({
          ...sampleProfile,
          capabilities: {
            ...sampleProfile.capabilities,
            STREAMING: { status: 'SUPPORTED' as const, source: 'PROBE' as const, confidence: 1.0, verifiedAt: '2026-10-05T12:00:00Z' },
          },
        }),
      } as unknown as AiProviderService;

      const res = await handleVerifyModelCapabilities(
        validEvent,
        { projectId: testProjectId, modelId: 'ollama:llama3.2:latest' },
        mockService,
      );
      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.capabilities.STREAMING.status, 'SUPPORTED');
        assert.strictEqual(res.data.capabilities.STREAMING.source, 'PROBE');
      }
    });

    it('should successfully select model and persist', async () => {
      const mockService = {
        selectModel: async () => sampleSelection,
      } as unknown as AiProviderService;

      const res = await handleSelectModel(
        validEvent,
        { projectId: testProjectId, selectionType: 'DEFAULT', modelId: 'ollama:llama3.2:latest' },
        mockService,
      );
      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.selectedModel.id, 'ollama:llama3.2:latest');
        assert.strictEqual(res.data.selectionType, 'DEFAULT');
      }
    });

    it('should successfully get saved model selection', async () => {
      const mockService = {
        getModelSelection: async () => sampleSelection,
      } as unknown as AiProviderService;

      const res = await handleGetModelSelection(
        validEvent,
        { projectId: testProjectId, selectionType: 'DEFAULT' },
        mockService,
      );
      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.ok(res.data);
        assert.strictEqual(res.data?.selectedModel.id, 'ollama:llama3.2:latest');
      }
    });

    it('should successfully resolve model for task', async () => {
      const mockService = {
        resolveModelForTask: async () => sampleSelection,
      } as unknown as AiProviderService;

      const res = await handleResolveModelForTask(
        validEvent,
        { projectId: testProjectId, task: 'chat' },
        mockService,
      );
      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.selectedModel.id, 'ollama:llama3.2:latest');
      }
    });

    it('should translate AiNoCompatibleModelError to NO_COMPATIBLE_MODEL', async () => {
      const { AiNoCompatibleModelError } = await import('@ai-quality/core');
      const mockService = {
        resolveModelForTask: async () => {
          throw new AiNoCompatibleModelError('vision', ['VISION'], 'No model supports VISION');
        },
      } as unknown as AiProviderService;

      const res = await handleResolveModelForTask(
        validEvent,
        { projectId: testProjectId, task: 'vision' },
        mockService,
      );
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'NO_COMPATIBLE_MODEL');
      }
    });

    it('should translate probe errors to CAPABILITY_PROBE_TIMEOUT and CAPABILITY_PROBE_FAILED', async () => {
      const { AiCapabilityProbeTimeoutError, AiCapabilityProbeFailedError } = await import('@ai-quality/core');

      const timeoutService = {
        verifyModelCapabilities: async () => {
          throw new AiCapabilityProbeTimeoutError('ollama:llama3.2:latest', 'STREAMING', 5000);
        },
      } as unknown as AiProviderService;

      const r1 = await handleVerifyModelCapabilities(
        validEvent,
        { projectId: testProjectId, modelId: 'ollama:llama3.2:latest' },
        timeoutService,
      );
      assert.strictEqual(r1.ok, false);
      if (!r1.ok) {
        assert.strictEqual(r1.error.code, 'CAPABILITY_PROBE_TIMEOUT');
      }

      const failedService = {
        verifyModelCapabilities: async () => {
          throw new AiCapabilityProbeFailedError('ollama:llama3.2:latest', 'JSON_OUTPUT', 'Model did not produce valid JSON');
        },
      } as unknown as AiProviderService;

      const r2 = await handleVerifyModelCapabilities(
        validEvent,
        { projectId: testProjectId, modelId: 'ollama:llama3.2:latest' },
        failedService,
      );
      assert.strictEqual(r2.ok, false);
      if (!r2.ok) {
        assert.strictEqual(r2.error.code, 'CAPABILITY_PROBE_FAILED');
      }
    });
  });
});
