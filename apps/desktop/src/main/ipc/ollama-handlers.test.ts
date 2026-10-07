/**
 * @file apps/desktop/src/main/ipc/ollama-handlers.test.ts
 * Security, authentication, and validation unit tests for V9 Phase 127 Ollama IPC handlers.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleGetOllamaStatus,
  handleHealthCheckOllama,
  handleGetOllamaConfig,
  handleSetOllamaConfig,
  setOllamaAiProviderServiceForTest,
} from './ollama-handlers.js';
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
  OllamaStatusDto,
  OllamaHealthDiagnosticDto,
  OllamaConfigDto,
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

describe('V9 Phase 127 Ollama Connection & Health IPC Handlers', () => {
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

  beforeEach(() => {
    setAuthServiceForTest(mockAuthService as AuthenticationService);
    setSecureStorageForTest(new MockSecureStorage());
  });

  describe('Sender Security & Authentication', () => {
    it('should reject untrusted sender frame for handleGetOllamaStatus', async () => {
      const res = await handleGetOllamaStatus(untrustedEvent, { projectId: testProjectId });
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('should reject unauthenticated call if session token is missing', async () => {
      const storage = new MockSecureStorage();
      storage.token = null;
      setSecureStorageForTest(storage);

      const res = await handleGetOllamaStatus(validEvent, { projectId: testProjectId });
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'AUTHENTICATION_FAILED');
      }
    });

    it('should reject untrusted sender for handleHealthCheckOllama', async () => {
      const res = await handleHealthCheckOllama(untrustedEvent, {
        projectId: testProjectId,
        endpoint: 'http://127.0.0.1:11434',
      });
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('should reject untrusted sender for handleGetOllamaConfig', async () => {
      const res = await handleGetOllamaConfig(untrustedEvent, { projectId: testProjectId });
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('should reject untrusted sender for handleSetOllamaConfig', async () => {
      const res = await handleSetOllamaConfig(untrustedEvent, {
        projectId: testProjectId,
        endpoint: 'http://127.0.0.1:11434',
      });
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });
  });

  describe('Validation & Payload Rejection', () => {
    it('should reject invalid project UUID in handleGetOllamaStatus', async () => {
      const res = await handleGetOllamaStatus(validEvent, { projectId: 'not-a-uuid' });
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'VALIDATION_ERROR');
      }
    });

    it('should reject invalid endpoint URL with INVALID_REQUEST', async () => {
      const res = await handleHealthCheckOllama(validEvent, {
        projectId: testProjectId,
        endpoint: 'not-a-valid-url',
      });
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'INVALID_REQUEST');
      }
    });

    it('should reject negative connectionTimeout with VALIDATION_ERROR', async () => {
      const res = await handleSetOllamaConfig(validEvent, {
        projectId: testProjectId,
        connectionTimeout: -100,
      });
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'VALIDATION_ERROR');
      }
    });
  });

  describe('Successful Delegation & Response Formatting', () => {
    it('should delegate handleGetOllamaStatus to service', async () => {
      const mockStatus: OllamaStatusDto = {
        provider: 'OLLAMA',
        endpoint: 'http://127.0.0.1:11434',
        enabled: true,
        connectionTimeout: 5000,
        health: {
          state: 'AVAILABLE',
          message: 'Ollama is reachable and healthy.',
          endpoint: 'http://127.0.0.1:11434',
          checkedAt: new Date().toISOString(),
          latencyMs: 12,
        },
        installation: {
          state: 'INSTALLED_AND_RUNNING',
          isCustomEndpoint: false,
        },
        isConnected: true,
        lastCheckedAt: new Date().toISOString(),
      };

      const mockService = {
        getOllamaStatus: async (projectId: string | null | undefined, userId: string) => {
          assert.strictEqual(projectId, testProjectId);
          assert.strictEqual(userId, testUserId);
          return mockStatus;
        },
      } as unknown as AiProviderService;

      setOllamaAiProviderServiceForTest(mockService);

      const res = await handleGetOllamaStatus(validEvent, { projectId: testProjectId });
      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.health.state, 'AVAILABLE');
        assert.strictEqual(res.data.installation.state, 'INSTALLED_AND_RUNNING');
      }
    });

    it('should delegate handleHealthCheckOllama to service', async () => {
      const mockDiag: OllamaHealthDiagnosticDto = {
        state: 'UNAVAILABLE',
        message: 'Connection refused.',
        endpoint: 'http://127.0.0.1:11434',
        checkedAt: new Date().toISOString(),
      };

      const mockService = {
        healthCheckOllama: async (input: { endpoint?: string }, userId: string) => {
          assert.strictEqual(userId, testUserId);
          assert.strictEqual(input.endpoint, 'http://127.0.0.1:11434');
          return mockDiag;
        },
      } as unknown as AiProviderService;

      setOllamaAiProviderServiceForTest(mockService);

      const res = await handleHealthCheckOllama(validEvent, {
        projectId: testProjectId,
        endpoint: 'http://127.0.0.1:11434',
      });
      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.state, 'UNAVAILABLE');
      }
    });

    it('should delegate handleSetOllamaConfig and return updated configuration', async () => {
      const mockConfig: OllamaConfigDto = {
        provider: 'OLLAMA',
        enabled: true,
        endpoint: 'http://127.0.0.1:11434',
        connectionTimeout: 8000,
        projectId: testProjectId,
        isProjectSpecific: true,
      };

      const mockService = {
        setOllamaConfig: async (input: { endpoint?: string; connectionTimeout?: number }, userId: string) => {
          assert.strictEqual(userId, testUserId);
          assert.strictEqual(input.endpoint, 'http://127.0.0.1:11434');
          return mockConfig;
        },
      } as unknown as AiProviderService;

      setOllamaAiProviderServiceForTest(mockService);

      const res = await handleSetOllamaConfig(validEvent, {
        projectId: testProjectId,
        endpoint: 'http://127.0.0.1:11434',
      });
      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.endpoint, 'http://127.0.0.1:11434');
        assert.strictEqual(res.data.connectionTimeout, 8000);
      }
    });
  });

  describe('Error Mapping Completeness', () => {
    it('should map domain exceptions accurately to DesktopResult error codes', async () => {
      const testCases: Array<{
        error: Error;
        expectedCode: string;
      }> = [
        { error: new AiProviderUnavailableError('ollama'), expectedCode: 'PROVIDER_UNAVAILABLE' },
        { error: new AiProviderAuthError('ollama'), expectedCode: 'PROVIDER_AUTH_ERROR' },
        { error: new AiModelUnavailableError('llama3', 'ollama'), expectedCode: 'MODEL_UNAVAILABLE' },
        { error: new AiInvalidRequestError('bad input'), expectedCode: 'INVALID_REQUEST' },
        { error: new AiTimeoutError(5000), expectedCode: 'TIMEOUT' },
        { error: new AiCancelledError(), expectedCode: 'CANCELLED' },
        { error: new AiRateLimitError('ollama'), expectedCode: 'RATE_LIMITED' },
        { error: new AiInvalidResponseError('ollama'), expectedCode: 'INVALID_RESPONSE' },
        { error: new AiProviderError('ollama'), expectedCode: 'PROVIDER_ERROR' },
        { error: new AiUnknownError('mystery'), expectedCode: 'UNKNOWN' },
        { error: new AiCrossProjectAccessError('Cross project error'), expectedCode: 'PERMISSION_DENIED' },
        { error: new AiConfigInvalidError('bad config'), expectedCode: 'CONFIGURATION_INVALID' },
        { error: new AiConfigNotFoundError('proj-1', 'ollama'), expectedCode: 'AI_CONFIG_NOT_FOUND' },
      ];

      for (const tc of testCases) {
        const throwingService = {
          getOllamaStatus: async () => {
            throw tc.error;
          },
        } as unknown as AiProviderService;

        setOllamaAiProviderServiceForTest(throwingService);
        const res = await handleGetOllamaStatus(validEvent, { projectId: testProjectId });
        assert.strictEqual(res.ok, false);
        if (!res.ok) {
          assert.strictEqual(res.error.code, tc.expectedCode);
          assert.strictEqual(res.error.message, tc.error.message);
        }
      }
    });
  });
});
