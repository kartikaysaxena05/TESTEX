/**
 * @file apps/desktop/src/main/ipc/target-env-handlers.test.ts
 * Security and validation tests for Target Environment & Authentication IPC handlers (Phase 122).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleGetTargetEnvironment,
  handleListTargetEnvironments,
  handleSaveTargetEnvironment,
  handleDeleteTargetEnvironment,
  handleSetActiveTargetEnvironment,
  handleTestTargetConnection,
  handleTestTargetAuth,
  handleResolveTargetEnvironment,
  setTargetEnvironmentServiceForTest,
} from './target-env-handlers.js';
import {
  setAuthServiceForTest,
  setSecureStorageForTest,
} from './auth-handlers.js';
import {
  TargetEnvNotFoundError,
  TargetEnvAccessDeniedError,
  TargetEnvValidationError,
  TargetEnvUnreachableError,
  TargetEnvAuthFailedError,
  TargetEnvProductionSafetyError,
  type TargetEnvironmentService,
  type AuthenticationService,
} from '@ai-quality/core';
import type {
  TargetEnvironmentConfigDto,
  TargetConnectionTestResultDto,
  TargetAuthTestResultDto,
  TargetExecutionSnapshotDto,
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

describe('Phase 122 Target Environment IPC Handlers & Security Tests', () => {
  const dummyDateStr = new Date('2026-01-01T00:00:00.000Z').toISOString();
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testEnvId = '22222222-2222-2222-2222-222222222222';
  const testUserId = 'user-uuid-1111-2222';

  const mockTargetEnv: TargetEnvironmentConfigDto = {
    id: testEnvId,
    projectId: testProjectId,
    name: 'Development Env',
    type: 'DEVELOPMENT',
    baseUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:3000/api',
    isDefault: true,
    isEnabled: true,
    isProduction: false,
    productionSafetyPolicy: 'SAFE_MODE',
    browserEngine: 'chromium',
    headless: true,
    viewportWidth: 1280,
    viewportHeight: 720,
    ignoreHttpsErrors: false,
    notes: null,
    auth: {
      id: '33333333-3333-3333-3333-333333333333',
      strategy: 'FORM_LOGIN',
      status: 'CONFIGURED',
      loginUrl: 'http://localhost:3000/login',
      username: 'admin@example.com',
      hasPassword: true,
      passwordPreview: '••••••••',
      usernameFieldSelector: 'input[name="username"]',
      passwordFieldSelector: 'input[name="password"]',
      submitControlSelector: 'button[type="submit"]',
      successValidationType: 'URL_MATCH',
      successValidationValue: '/dashboard',
      lastValidatedAt: dummyDateStr,
      validationError: null,
    },
    lastCheckedAt: dummyDateStr,
    connectionStatus: 'REACHABLE',
    createdAt: dummyDateStr,
    updatedAt: dummyDateStr,
  };

  const mockConnectionResult: TargetConnectionTestResultDto = {
    reachable: true,
    statusCode: 200,
    responseTimeMs: 45,
    redirectCount: 0,
    finalUrl: 'http://localhost:3000',
    tlsValid: true,
    errorMessage: null,
  };

  const mockAuthResult: TargetAuthTestResultDto = {
    success: true,
    durationMs: 310,
    authenticated: true,
    finalUrl: 'http://localhost:3000/dashboard',
    errorMessage: null,
    diagnosticEvidence: null,
  };

  const mockSnapshot: TargetExecutionSnapshotDto = {
    environmentId: testEnvId,
    projectId: testProjectId,
    name: 'Development Env',
    type: 'DEVELOPMENT',
    baseUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:3000/api',
    browserEngine: 'chromium',
    headless: true,
    viewport: {
      width: 1280,
      height: 720,
    },
    ignoreHttpsErrors: false,
    isProduction: false,
    productionSafetyPolicy: 'SAFE_MODE',
    authProfileId: '33333333-3333-3333-3333-333333333333',
    storageStateKey: null,
    resolvedAt: dummyDateStr,
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
        user: {
          id: testUserId,
          email: 'test@example.com',
          name: 'Test User',
          createdAt: new Date(),
          updatedAt: new Date(),
          emailVerified: true,
        },
      }),
    } as unknown as AuthenticationService;

    setAuthServiceForTest(mockAuthService);
  });

  describe('Sender Frame Security Validation', () => {
    it('rejects untrusted sender frame for handleGetTargetEnvironment', async () => {
      const res = await handleGetTargetEnvironment(untrustedEvent, {
        projectId: testProjectId,
        environmentId: testEnvId,
      });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects untrusted sender frame for handleSaveTargetEnvironment', async () => {
      const res = await handleSaveTargetEnvironment(untrustedEvent, {
        projectId: testProjectId,
        name: 'New Env',
        type: 'DEVELOPMENT',
      });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects untrusted sender frame for handleTestTargetConnection', async () => {
      const res = await handleTestTargetConnection(untrustedEvent, {
        projectId: testProjectId,
        url: 'http://localhost:3000',
      });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects untrusted sender frame for handleTestTargetAuth', async () => {
      const res = await handleTestTargetAuth(untrustedEvent, {
        projectId: testProjectId,
        environmentId: testEnvId,
      });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'UNAUTHORIZED_SENDER');
    });
  });

  describe('Authentication Enforcement', () => {
    it('rejects unauthenticated request with TARGET_ENV_ACCESS_DENIED', async () => {
      mockSecureStorage.token = null; // No session token stored
      const res = await handleGetTargetEnvironment(trustedEvent, {
        projectId: testProjectId,
        environmentId: testEnvId,
      });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'TARGET_ENV_ACCESS_DENIED');
    });
  });

  describe('Zod Validation Failure Mapping', () => {
    it('maps invalid UUID payload to VALIDATION_ERROR', async () => {
      const res = await handleGetTargetEnvironment(trustedEvent, {
        projectId: 'not-a-uuid',
        environmentId: testEnvId,
      });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'VALIDATION_ERROR');
    });
  });

  describe('Domain Error Translation', () => {
    it('translates TargetEnvNotFoundError to TARGET_ENV_NOT_FOUND', async () => {
      const mockService = {
        getEnvironment: async () => {
          throw new TargetEnvNotFoundError(testEnvId, testProjectId);
        },
      } as unknown as TargetEnvironmentService;

      const res = await handleGetTargetEnvironment(
        trustedEvent,
        { projectId: testProjectId, environmentId: testEnvId },
        mockService,
      );
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'TARGET_ENV_NOT_FOUND');
    });

    it('translates TargetEnvAccessDeniedError to TARGET_ENV_ACCESS_DENIED', async () => {
      const mockService = {
        saveEnvironment: async () => {
          throw new TargetEnvAccessDeniedError('Project access denied.');
        },
      } as unknown as TargetEnvironmentService;

      const res = await handleSaveTargetEnvironment(
        trustedEvent,
        { projectId: testProjectId, name: 'Dev Env', type: 'DEVELOPMENT' },
        mockService,
      );
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'TARGET_ENV_ACCESS_DENIED');
    });

    it('translates TargetEnvValidationError to TARGET_ENV_VALIDATION_ERROR', async () => {
      const mockService = {
        saveEnvironment: async () => {
          throw new TargetEnvValidationError('Invalid URL protocol.');
        },
      } as unknown as TargetEnvironmentService;

      const res = await handleSaveTargetEnvironment(
        trustedEvent,
        { projectId: testProjectId, name: 'Dev Env', type: 'DEVELOPMENT' },
        mockService,
      );
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'TARGET_ENV_VALIDATION_ERROR');
    });

    it('translates TargetEnvUnreachableError to TARGET_ENV_UNREACHABLE', async () => {
      const mockService = {
        testConnection: async () => {
          throw new TargetEnvUnreachableError('http://bad.target', 'Connection refused');
        },
      } as unknown as TargetEnvironmentService;

      const res = await handleTestTargetConnection(
        trustedEvent,
        { projectId: testProjectId, url: 'http://bad.target' },
        mockService,
      );
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'TARGET_ENV_UNREACHABLE');
    });

    it('translates TargetEnvAuthFailedError to TARGET_ENV_AUTH_FAILED', async () => {
      const mockService = {
        testAuthentication: async () => {
          throw new TargetEnvAuthFailedError('Invalid credentials or login failed');
        },
      } as unknown as TargetEnvironmentService;

      const res = await handleTestTargetAuth(
        trustedEvent,
        { projectId: testProjectId, environmentId: testEnvId },
        mockService,
      );
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'TARGET_ENV_AUTH_FAILED');
    });

    it('translates TargetEnvProductionSafetyError to TARGET_ENV_PROD_SAFETY_VIOLATION', async () => {
      const mockService = {
        resolveExecutionTarget: async () => {
          throw new TargetEnvProductionSafetyError('Execution blocked on production environment.');
        },
      } as unknown as TargetEnvironmentService;

      const res = await handleResolveTargetEnvironment(
        trustedEvent,
        { projectId: testProjectId, environmentId: testEnvId },
        mockService,
      );
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.error?.code, 'TARGET_ENV_PROD_SAFETY_VIOLATION');
    });
  });

  describe('Successful Handler Delegations', () => {
    it('successfully handles getEnvironment', async () => {
      const mockService = {
        getEnvironment: async () => mockTargetEnv,
      } as unknown as TargetEnvironmentService;

      const res = await handleGetTargetEnvironment(
        trustedEvent,
        { projectId: testProjectId, environmentId: testEnvId },
        mockService,
      );
      assert.strictEqual(res.ok, true);
      assert.deepStrictEqual(res.data, mockTargetEnv);
    });

    it('successfully handles listEnvironments', async () => {
      const mockService = {
        listEnvironments: async () => [mockTargetEnv],
      } as unknown as TargetEnvironmentService;

      const res = await handleListTargetEnvironments(
        trustedEvent,
        { projectId: testProjectId },
        mockService,
      );
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data.length, 1);
      assert.deepStrictEqual(res.data[0], mockTargetEnv);
    });

    it('successfully handles saveEnvironment', async () => {
      const mockService = {
        saveEnvironment: async () => mockTargetEnv,
      } as unknown as TargetEnvironmentService;

      const res = await handleSaveTargetEnvironment(
        trustedEvent,
        {
          projectId: testProjectId,
          environmentId: testEnvId,
          name: 'Development Env',
          type: 'DEVELOPMENT',
          baseUrl: 'http://localhost:3000',
        },
        mockService,
      );
      assert.strictEqual(res.ok, true);
      assert.deepStrictEqual(res.data, mockTargetEnv);
    });

    it('successfully handles deleteEnvironment', async () => {
      const mockService = {
        deleteEnvironment: async () => true,
      } as unknown as TargetEnvironmentService;

      const res = await handleDeleteTargetEnvironment(
        trustedEvent,
        { projectId: testProjectId, environmentId: testEnvId },
        mockService,
      );
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.data, true);
    });

    it('successfully handles setActiveEnvironment', async () => {
      const mockService = {
        setActiveEnvironment: async () => mockTargetEnv,
      } as unknown as TargetEnvironmentService;

      const res = await handleSetActiveTargetEnvironment(
        trustedEvent,
        { projectId: testProjectId, environmentId: testEnvId },
        mockService,
      );
      assert.strictEqual(res.ok, true);
      assert.deepStrictEqual(res.data, mockTargetEnv);
    });

    it('successfully handles testConnection', async () => {
      const mockService = {
        testConnection: async () => mockConnectionResult,
      } as unknown as TargetEnvironmentService;

      const res = await handleTestTargetConnection(
        trustedEvent,
        { projectId: testProjectId, url: 'http://localhost:3000' },
        mockService,
      );
      assert.strictEqual(res.ok, true);
      assert.deepStrictEqual(res.data, mockConnectionResult);
    });

    it('successfully handles testAuthentication', async () => {
      const mockService = {
        testAuthentication: async () => mockAuthResult,
      } as unknown as TargetEnvironmentService;

      const res = await handleTestTargetAuth(
        trustedEvent,
        { projectId: testProjectId, environmentId: testEnvId },
        mockService,
      );
      assert.strictEqual(res.ok, true);
      assert.deepStrictEqual(res.data, mockAuthResult);
    });

    it('successfully handles resolveExecutionTarget', async () => {
      const mockService = {
        resolveExecutionTarget: async () => mockSnapshot,
      } as unknown as TargetEnvironmentService;

      const res = await handleResolveTargetEnvironment(
        trustedEvent,
        { projectId: testProjectId, environmentId: testEnvId },
        mockService,
      );
      assert.strictEqual(res.ok, true);
      assert.deepStrictEqual(res.data, mockSnapshot);
    });
  });
});
