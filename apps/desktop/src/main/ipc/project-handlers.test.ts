import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleListProjects,
  handleGetProject,
  handleCreateProject,
  handleCreateEnvironment,
} from './project-handlers.js';
import { createSafeIpcHandler } from './register-ipc.js';
import { ProjectValidationError, ProjectNotFoundError } from '@ai-quality/core';
import type { IpcMainInvokeEvent } from 'electron';
import type { ProjectService } from '@ai-quality/core';
import type { ProjectSummary, ProjectDetails, ProjectEnvironmentDto } from '@ai-quality/contracts';

describe('Project IPC Handlers & Security Tests', () => {
  const dummyDateStr = new Date('2026-01-01T00:00:00.000Z').toISOString();

  const mockProjectDetails: ProjectDetails = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Sample Project',
    description: 'Sample description',
    status: 'ACTIVE',
    environments: [],
    createdAt: dummyDateStr,
    updatedAt: dummyDateStr,
  };

  const mockEnvDto: ProjectEnvironmentDto = {
    id: '22222222-2222-2222-2222-222222222222',
    projectId: '11111111-1111-1111-1111-111111111111',
    targetApplicationId: null,
    name: 'Dev Env',
    type: 'DEVELOPMENT',
    baseUrl: 'http://localhost:3000',
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
    createdAt: dummyDateStr,
    updatedAt: dummyDateStr,
  };

  const mockSummary: ProjectSummary = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Sample Project',
    description: 'Sample description',
    status: 'ACTIVE',
    environmentCount: 1,
    defaultEnvironment: mockEnvDto,
    createdAt: dummyDateStr,
    updatedAt: dummyDateStr,
  };

  const createMockService = (overrides?: Partial<ProjectService>): ProjectService =>
    ({
      listProjects: async () => [mockSummary],
      getProject: async () => mockProjectDetails,
      createProject: async () => mockProjectDetails,
      updateProject: async () => mockProjectDetails,
      archiveProject: async () => ({ ...mockProjectDetails, status: 'ARCHIVED' }),
      restoreProject: async () => ({ ...mockProjectDetails, status: 'ACTIVE' }),
      deleteProject: async () => ({ deleted: true as const }),
      createEnvironment: async () => mockEnvDto,
      updateEnvironment: async () => mockEnvDto,
      deleteEnvironment: async () => ({ deleted: true as const }),
      setDefaultEnvironment: async () => mockEnvDto,
      ...overrides,
    }) as unknown as ProjectService;

  const trustedEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    },
  } as unknown as IpcMainInvokeEvent;

  const untrustedEvent = {
    senderFrame: {
      parent: null,
      url: 'https://evil.com/phishing.html',
    },
  } as unknown as IpcMainInvokeEvent;

  describe('createSafeIpcHandler Security & Untrusted Sender Validation', () => {
    it('should reject untrusted sender with UNAUTHORIZED_SENDER error', async () => {
      const handler = createSafeIpcHandler(async () => ({ ok: true }));
      const result = await handler(untrustedEvent);

      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
    });

    it('should sanitize unhandled internal errors to INTERNAL_ERROR', async () => {
      const handler = createSafeIpcHandler(async () => {
        throw new Error('Secret PostgreSQL connection failed with internal stack');
      });
      const result = await handler(trustedEvent);

      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error.code, 'INTERNAL_ERROR');
      assert.strictEqual(result.error.message, 'The desktop operation failed.');
    });

    it('should pass through domain error codes like VALIDATION_ERROR, PROJECT_NOT_FOUND, CONFLICT', async () => {
      const handler = createSafeIpcHandler(async () => {
        throw new ProjectNotFoundError('Custom not found message');
      });
      const result = await handler(trustedEvent);

      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error.code, 'PROJECT_NOT_FOUND');
      assert.strictEqual(result.error.message, 'Custom not found message');
    });
  });

  describe('Zod Schema Validation in IPC Handlers', () => {
    it('should reject invalid project creation payload with VALIDATION_ERROR', async () => {
      const service = createMockService();

      // Empty name
      await assert.rejects(
        () => handleCreateProject({ name: '' }, service),
        (err: Error) => err instanceof ProjectValidationError,
      );

      // Name exceeding 120 chars
      await assert.rejects(
        () => handleCreateProject({ name: 'A'.repeat(121) }, service),
        (err: Error) => err instanceof ProjectValidationError,
      );
    });

    it('should reject invalid project ID with VALIDATION_ERROR', async () => {
      const service = createMockService();

      await assert.rejects(
        () => handleGetProject('invalid-non-uuid-string', service),
        (err: Error) => err instanceof ProjectValidationError,
      );
    });

    it('should reject environment with invalid URL or credentials', async () => {
      const service = createMockService();

      // Invalid scheme
      await assert.rejects(
        () =>
          handleCreateEnvironment(
            {
              projectId: '11111111-1111-1111-1111-111111111111',
              name: 'Bad URL',
              type: 'DEVELOPMENT',
              baseUrl: 'javascript:alert(1)',
            },
            service,
          ),
        (err: Error) => err instanceof ProjectValidationError,
      );

      // Credentials in URL
      await assert.rejects(
        () =>
          handleCreateEnvironment(
            {
              projectId: '11111111-1111-1111-1111-111111111111',
              name: 'Cred URL',
              type: 'DEVELOPMENT',
              baseUrl: 'https://admin:secret@qa.example.com',
            },
            service,
          ),
        (err: Error) => err instanceof ProjectValidationError,
      );
    });

    it('should successfully delegate valid requests to service', async () => {
      const service = createMockService();

      const created = await handleCreateProject(
        { name: 'Valid Project', description: 'Valid Desc' },
        service,
      );
      assert.strictEqual(created.name, 'Sample Project');

      const list = await handleListProjects({ status: 'ACTIVE' }, service);
      assert.strictEqual(list.length, 1);

      const env = await handleCreateEnvironment(
        {
          projectId: '11111111-1111-1111-1111-111111111111',
          name: 'Local Dev',
          type: 'LOCAL',
          baseUrl: 'http://localhost:3000',
        },
        service,
      );
      assert.strictEqual(env.name, 'Dev Env');
    });
  });
});
