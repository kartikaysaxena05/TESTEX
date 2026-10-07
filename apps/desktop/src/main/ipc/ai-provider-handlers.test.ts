/**
 * @file apps/desktop/src/main/ipc/ai-provider-handlers.test.ts
 * Security and validation unit tests for V9 Phase 126 AI Provider Abstraction IPC handlers.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleListAiProviders,
  handleGetAiProvider,
  handleValidateAiRequest,
  handleGetAiProviderConfig,
  handleUpdateAiProviderConfig,
  setAiProviderServiceForTest,
} from './ai-provider-handlers.js';
import {
  setAuthServiceForTest,
  setSecureStorageForTest,
} from './auth-handlers.js';
import {
  AiProviderService,
  AiProviderUnavailableError,
  AiProviderAuthError,
  AiModelUnavailableError,
  AiInvalidRequestError,
  AiTimeoutError,
  AiCancelledError,
  AiRateLimitError,
  AiInvalidResponseError,
  AiProviderError,
  AiUnknownError,
  AiCrossProjectAccessError,
  AiConfigInvalidError,
  AiConfigNotFoundError,
  type AuthenticationService,
} from '@ai-quality/core';
import type {
  AiProviderDescriptorDto,
  AiProviderConfigDto,
  NormalizedAiRequestDto,
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

describe('V9 Phase 126 AI Provider Abstraction IPC Handlers', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testUserId = 'user-uuid-1111-2222';

  const mockDescriptor: AiProviderDescriptorDto = {
    providerId: 'ollama',
    providerName: 'Ollama Local Provider',
    providerType: 'LOCAL',
    status: 'AVAILABLE',
    capabilities: {
      textGeneration: true,
      systemMessages: true,
      tokenUsageReporting: false,
      cancellation: true,
      streaming: true,
      maxContextTokens: 8192,
      defaultModel: 'llama3',
      supportedModels: ['llama3', 'mistral', 'codellama'],
    },
    configuration: {
      enabled: true,
      baseUrl: 'http://127.0.0.1:11434',
      defaultModel: 'llama3',
      requestTimeoutMs: 60000,
      streamingEnabled: true,
    },
  };

  const mockConfig: AiProviderConfigDto = {
    id: '33333333-3333-3333-3333-333333333333',
    projectId: testProjectId,
    providerId: 'ollama',
    enabled: true,
    baseUrl: 'http://127.0.0.1:11434',
    defaultModel: 'llama3',
    requestTimeoutMs: 60000,
    streamingEnabled: true,
  };

  const mockRequest: NormalizedAiRequestDto = {
    requestId: '44444444-4444-4444-4444-444444444444',
    projectId: testProjectId,
    providerId: 'ollama',
    model: 'llama3',
    prompt: 'Synthesize quality criteria for this test suite.',
    systemPrompt: 'You are a software quality engine.',
    parameters: {
      temperature: 0.2,
      maxTokens: 2048,
    },
    outputFormat: 'text',
  };

  let mockSecureStorage: MockSecureStorage;

  const trustedEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    },
  } as unknown as IpcMainInvokeEvent;

  const untrustedEvent = {
    senderFrame: {
      parent: null,
      url: 'https://attacker.evil.com/exploit',
    },
  } as unknown as IpcMainInvokeEvent;

  beforeEach(() => {
    mockSecureStorage = new MockSecureStorage();
    setSecureStorageForTest(mockSecureStorage);

    const mockAuthService = {
      validateSession: async () => ({
        userId: testUserId,
        email: 'test@example.com',
        displayName: 'Test User',
        accountStatus: 'ACTIVE',
        emailVerified: true,
        sessionId: 'session-1234',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
    } as unknown as AuthenticationService;
    setAuthServiceForTest(mockAuthService);
  });

  describe('handleListAiProviders', () => {
    it('rejects untrusted sender frame', async () => {
      const result = await handleListAiProviders(untrustedEvent, {});
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('requires authentication', async () => {
      mockSecureStorage.token = null;
      const result = await handleListAiProviders(trustedEvent, {});
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'AUTHENTICATION_FAILED');
    });

    it('delegates to service and returns providers', async () => {
      const mockService = {
        listProviders: async (projectId?: string | null, userId?: string) => {
          assert.strictEqual(projectId, testProjectId);
          assert.strictEqual(userId, testUserId);
          return [mockDescriptor];
        },
      } as unknown as AiProviderService;

      const result = await handleListAiProviders(trustedEvent, { projectId: testProjectId }, mockService);
      assert.strictEqual(result.ok, true);
      assert(result.ok);
      assert.strictEqual(result.data.length, 1);
      assert.strictEqual(result.data[0]?.providerId, 'ollama');
    });

    it('maps AiCrossProjectAccessError to PERMISSION_DENIED', async () => {
      const mockService = {
        listProviders: async () => {
          throw new AiCrossProjectAccessError('Cross-project access blocked.');
        },
      } as unknown as AiProviderService;

      const result = await handleListAiProviders(trustedEvent, { projectId: testProjectId }, mockService);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'PERMISSION_DENIED');
      assert.match(result.error?.message, /Cross-project access blocked/);
    });
  });

  describe('handleGetAiProvider', () => {
    it('rejects untrusted sender frame', async () => {
      const result = await handleGetAiProvider(untrustedEvent, { providerId: 'ollama' });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('validates missing providerId schema error', async () => {
      const result = await handleGetAiProvider(trustedEvent, {});
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'VALIDATION_ERROR');
    });

    it('delegates to service and returns provider descriptor', async () => {
      const mockService = {
        getProvider: async (providerId: string, projectId?: string | null, userId?: string) => {
          assert.strictEqual(providerId, 'ollama');
          assert.strictEqual(projectId, testProjectId);
          assert.strictEqual(userId, testUserId);
          return mockDescriptor;
        },
      } as unknown as AiProviderService;

      const result = await handleGetAiProvider(
        trustedEvent,
        { providerId: 'ollama', projectId: testProjectId },
        mockService,
      );
      assert.strictEqual(result.ok, true);
      assert(result.ok);
      assert.strictEqual(result.data.providerId, 'ollama');
      assert.strictEqual(result.data.configuration.baseUrl, 'http://127.0.0.1:11434');
    });

    it('maps AiProviderUnavailableError to PROVIDER_UNAVAILABLE', async () => {
      const mockService = {
        getProvider: async () => {
          throw new AiProviderUnavailableError('ollama', 'Provider ollama is not reachable.');
        },
      } as unknown as AiProviderService;

      const result = await handleGetAiProvider(
        trustedEvent,
        { providerId: 'ollama' },
        mockService,
      );
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'PROVIDER_UNAVAILABLE');
    });
  });

  describe('handleValidateAiRequest', () => {
    it('rejects untrusted sender frame', async () => {
      const result = await handleValidateAiRequest(untrustedEvent, {
        projectId: testProjectId,
        prompt: 'test',
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects invalid request payload with missing prompt', async () => {
      const result = await handleValidateAiRequest(trustedEvent, {
        projectId: testProjectId,
        prompt: '',
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'VALIDATION_ERROR');
    });

    it('delegates to service and returns normalized request', async () => {
      const mockService = {
        validateRequest: async (input: unknown, userId: string) => {
          assert.strictEqual(userId, testUserId);
          return mockRequest;
        },
      } as unknown as AiProviderService;

      const result = await handleValidateAiRequest(
        trustedEvent,
        {
          projectId: testProjectId,
          prompt: 'Synthesize quality criteria for this test suite.',
        },
        mockService,
      );
      assert.strictEqual(result.ok, true);
      assert(result.ok);
      assert.strictEqual(result.data.model, 'llama3');
      assert.strictEqual(result.data.parameters?.temperature, 0.2);
    });

    it('maps domain AiInvalidRequestError to INVALID_REQUEST', async () => {
      const mockService = {
        validateRequest: async () => {
          throw new AiInvalidRequestError('ollama', 'Malicious model identifier.');
        },
      } as unknown as AiProviderService;

      const result = await handleValidateAiRequest(
        trustedEvent,
        {
          projectId: testProjectId,
          prompt: 'test prompt',
        },
        mockService,
      );
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'INVALID_REQUEST');
    });
  });

  describe('handleGetAiProviderConfig', () => {
    it('delegates to service and returns config', async () => {
      const mockService = {
        getConfig: async (providerId: string, projectId?: string | null, userId?: string) => {
          assert.strictEqual(providerId, 'ollama');
          assert.strictEqual(projectId, testProjectId);
          assert.strictEqual(userId, testUserId);
          return mockConfig;
        },
      } as unknown as AiProviderService;

      const result = await handleGetAiProviderConfig(
        trustedEvent,
        { providerId: 'ollama', projectId: testProjectId },
        mockService,
      );
      assert.strictEqual(result.ok, true);
      assert(result.ok);
      assert.strictEqual(result.data.defaultModel, 'llama3');
    });

    it('maps AiConfigNotFoundError to AI_CONFIG_NOT_FOUND', async () => {
      const mockService = {
        getConfig: async () => {
          throw new AiConfigNotFoundError('Config not found for provider.');
        },
      } as unknown as AiProviderService;

      const result = await handleGetAiProviderConfig(
        trustedEvent,
        { providerId: 'unknown-provider' },
        mockService,
      );
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'AI_CONFIG_NOT_FOUND');
    });
  });

  describe('handleUpdateAiProviderConfig', () => {
    it('rejects invalid timeout bounds (< 1000)', async () => {
      const result = await handleUpdateAiProviderConfig(trustedEvent, {
        providerId: 'ollama',
        requestTimeoutMs: 50,
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'VALIDATION_ERROR');
    });

    it('delegates valid update to service', async () => {
      const updatedConfig = { ...mockConfig, defaultModel: 'mistral:latest' };
      const mockService = {
        updateConfig: async (input: unknown, userId: string) => {
          assert.strictEqual(userId, testUserId);
          return updatedConfig;
        },
      } as unknown as AiProviderService;

      const result = await handleUpdateAiProviderConfig(
        trustedEvent,
        {
          providerId: 'ollama',
          projectId: testProjectId,
          defaultModel: 'mistral:latest',
        },
        mockService,
      );
      assert.strictEqual(result.ok, true);
      assert(result.ok);
      assert.strictEqual(result.data.defaultModel, 'mistral:latest');
    });

    it('maps AiConfigInvalidError to CONFIGURATION_INVALID', async () => {
      const mockService = {
        updateConfig: async () => {
          throw new AiConfigInvalidError('Disallowed remote base URL.');
        },
      } as unknown as AiProviderService;

      const result = await handleUpdateAiProviderConfig(
        trustedEvent,
        {
          providerId: 'ollama',
          baseUrl: 'http://127.0.0.1:11434',
        },
        mockService,
      );
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'CONFIGURATION_INVALID');
    });
  });

  describe('all deterministic domain error mappings', () => {
    const errorCases = [
      { err: new AiProviderAuthError('ollama', 'Auth failure'), expectedCode: 'PROVIDER_AUTH_ERROR' },
      { err: new AiModelUnavailableError('ollama', 'Model unavailable'), expectedCode: 'MODEL_UNAVAILABLE' },
      { err: new AiTimeoutError(5000, 'ollama'), expectedCode: 'TIMEOUT' },
      { err: new AiCancelledError('ollama'), expectedCode: 'CANCELLED' },
      { err: new AiRateLimitError('ollama', 'Too many requests'), expectedCode: 'RATE_LIMITED' },
      { err: new AiInvalidResponseError('ollama', 'Corrupt JSON'), expectedCode: 'INVALID_RESPONSE' },
      { err: new AiProviderError('ollama', 'Provider error'), expectedCode: 'PROVIDER_ERROR' },
      { err: new AiUnknownError('ollama', 'Unknown glitch'), expectedCode: 'UNKNOWN' },
    ];

    for (const { err, expectedCode } of errorCases) {
      it(`maps ${err.constructor.name} to ${expectedCode}`, async () => {
        const mockService = {
          getProvider: async () => {
            throw err;
          },
        } as unknown as AiProviderService;

        const result = await handleGetAiProvider(
          trustedEvent,
          { providerId: 'ollama' },
          mockService,
        );
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.error?.code, expectedCode);
      });
    }
  });
});
