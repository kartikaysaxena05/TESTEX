/**
 * @file apps/desktop/src/main/ipc/environment-handlers.test.ts
 * Security and functionality tests for Target Application & Environment Configuration IPC handlers.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleGetTargetApplication,
  handleListEnvironments,
  handleGetEnvironment,
  handleCreateEnvironment,
  handleCheckEnvironmentReachability,
  handleResolveEnvironmentSnapshot,
  setTargetAppServiceForTest,
  setEnvironmentServiceForTest,
} from './environment-handlers.js';
import type {
  TargetApplicationDto,
  ProjectEnvironmentDto,
  EnvironmentReachabilityResultDto,
  ExecutionEnvironmentSnapshotDto,
} from '@ai-quality/contracts';
import {
  TargetApplicationService,
  EnvironmentConfigurationService,
  EnvironmentNotFoundError,
  EnvironmentProjectMismatchError,
} from '@ai-quality/core';

describe('Environment IPC Handlers Unit & Security Tests', () => {
  const validProjectId = '11111111-1111-1111-1111-111111111111';
  const validEnvId = '22222222-2222-2222-2222-222222222222';

  const mockTrustedEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    },
  } as unknown as IpcMainInvokeEvent;

  const mockUntrustedEvent = {
    senderFrame: {
      parent: {},
      url: 'https://evil.attacker.com',
    },
  } as unknown as IpcMainInvokeEvent;

  const mockTargetAppDto: TargetApplicationDto = {
    id: 'app-1',
    projectId: validProjectId,
    name: 'Test Web App',
    description: 'Main App',
    defaultEnvironmentId: validEnvId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockEnvDto: ProjectEnvironmentDto = {
    id: validEnvId,
    projectId: validProjectId,
    targetApplicationId: 'app-1',
    name: 'Staging Env',
    type: 'STAGING',
    baseUrl: 'https://staging.example.com',
    isDefault: true,
    isEnabled: true,
    isProduction: false,
    productionSafetyPolicy: 'PROHIBITED',
    browserEngine: 'chromium',
    headless: true,
    viewportWidth: 1280,
    viewportHeight: 720,
    locale: null,
    timezoneId: null,
    colorScheme: 'light',
    ignoreHttpsErrors: false,
    permissions: [],
    extraHeaders: null,
    variables: null,
    secretReferences: null,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockSnapshotDto: ExecutionEnvironmentSnapshotDto = {
    environmentId: validEnvId,
    projectId: validProjectId,
    targetApplicationName: 'Test Web App',
    environmentName: 'Staging Env',
    environmentType: 'STAGING',
    baseUrl: 'https://staging.example.com',
    isProduction: false,
    productionSafetyPolicy: 'PROHIBITED',
    browserEngine: 'chromium',
    headless: true,
    viewportWidth: 1280,
    viewportHeight: 720,
    locale: null,
    timezoneId: null,
    colorScheme: 'light',
    ignoreHttpsErrors: false,
    permissions: [],
    extraHeaders: {},
    variables: {},
    secretReferences: [],
    snapshotTimestamp: new Date().toISOString(),
    configurationHash: 'a'.repeat(64),
  };

  const mockReachabilityDto: EnvironmentReachabilityResultDto = {
    status: 'REACHABLE',
    statusCode: 200,
    statusText: 'OK',
    requestedUrl: 'https://staging.example.com',
    finalUrl: 'https://staging.example.com',
    responseTimeMs: 42,
    redirectCount: 0,
    message: 'Preflight reachable (HTTP 200).',
    checkedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    setTargetAppServiceForTest({
      getTargetApplication: async () => mockTargetAppDto,
      updateTargetApplication: async () => mockTargetAppDto,
    } as unknown as TargetApplicationService);

    setEnvironmentServiceForTest({
      getEnvironment: async () => mockEnvDto,
      listEnvironments: async () => [mockEnvDto],
      createEnvironment: async () => mockEnvDto,
      updateEnvironment: async () => mockEnvDto,
      deleteEnvironment: async () => ({ deleted: true }),
      setDefaultEnvironment: async () => mockEnvDto,
      checkReachability: async () => mockReachabilityDto,
      resolveSnapshot: async () => mockSnapshotDto,
    } as unknown as EnvironmentConfigurationService);
  });

  describe('IPC Sender Security', () => {
    it('should reject untrusted sender frames for all handlers', async () => {
      const getAppRes = await handleGetTargetApplication(mockUntrustedEvent, validProjectId);
      assert.equal(getAppRes.ok, false);
      assert.equal(getAppRes.error?.code, 'UNAUTHORIZED_SENDER');

      const listEnvRes = await handleListEnvironments(mockUntrustedEvent, {
        projectId: validProjectId,
      });
      assert.equal(listEnvRes.ok, false);
      assert.equal(listEnvRes.error?.code, 'UNAUTHORIZED_SENDER');

      const createEnvRes = await handleCreateEnvironment(mockUntrustedEvent, {
        projectId: validProjectId,
        name: 'New Env',
        type: 'DEVELOPMENT',
      });
      assert.equal(createEnvRes.ok, false);
      assert.equal(createEnvRes.error?.code, 'UNAUTHORIZED_SENDER');
    });
  });

  describe('Validation & Success Paths', () => {
    it('should retrieve target application for valid project ID', async () => {
      const res = await handleGetTargetApplication(mockTrustedEvent, validProjectId);
      assert.equal(res.ok, true);
      assert.equal(res.data?.name, 'Test Web App');
    });

    it('should validate input and create an environment successfully', async () => {
      const res = await handleCreateEnvironment(mockTrustedEvent, {
        projectId: validProjectId,
        name: 'Staging Env',
        type: 'STAGING',
        baseUrl: 'https://staging.example.com',
      });

      assert.equal(res.ok, true);
      assert.equal(res.data?.name, 'Staging Env');
    });

    it('should reject malformed payload during createEnvironment with VALIDATION_ERROR', async () => {
      const res = await handleCreateEnvironment(mockTrustedEvent, {
        projectId: 'not-a-uuid',
        name: '',
      } as any);

      assert.equal(res.ok, false);
      assert.equal(res.error?.code, 'VALIDATION_ERROR');
    });

    it('should perform preflight reachability check', async () => {
      const res = await handleCheckEnvironmentReachability(mockTrustedEvent, {
        projectId: validProjectId,
        targetUrl: 'https://staging.example.com',
      });

      assert.equal(res.ok, true);
      assert.equal(res.data?.status, 'REACHABLE');
      assert.equal(res.data?.statusCode, 200);
    });

    it('should resolve execution environment snapshot', async () => {
      const res = await handleResolveEnvironmentSnapshot(mockTrustedEvent, {
        projectId: validProjectId,
        environmentId: validEnvId,
      });

      assert.equal(res.ok, true);
      assert.equal(res.data?.environmentId, validEnvId);
      assert.equal(res.data?.configurationHash, 'a'.repeat(64));
    });
  });

  describe('Domain Error Sanitization', () => {
    it('should sanitize EnvironmentNotFoundError and return typed error code', async () => {
      setEnvironmentServiceForTest({
        getEnvironment: async () => {
          throw new EnvironmentNotFoundError('non-existent-env');
        },
      } as unknown as EnvironmentConfigurationService);

      const res = await handleGetEnvironment(mockTrustedEvent, {
        projectId: validProjectId,
        environmentId: validEnvId,
      });

      assert.equal(res.ok, false);
      assert.equal(res.error?.code, 'ENVIRONMENT_NOT_FOUND');
    });

    it('should sanitize EnvironmentProjectMismatchError and return ENVIRONMENT_PROJECT_MISMATCH', async () => {
      setEnvironmentServiceForTest({
        getEnvironment: async () => {
          throw new EnvironmentProjectMismatchError(validEnvId, validProjectId);
        },
      } as unknown as EnvironmentConfigurationService);

      const res = await handleGetEnvironment(mockTrustedEvent, {
        projectId: validProjectId,
        environmentId: validEnvId,
      });

      assert.equal(res.ok, false);
      assert.equal(res.error?.code, 'ENVIRONMENT_PROJECT_MISMATCH');
    });
  });
});
