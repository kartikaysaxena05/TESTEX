import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectService } from './project-service.js';
import {
  ProjectValidationError,
  ProjectNotFoundError,
  ProjectArchivedError,
} from './project-errors.js';
import type { ProjectRepository } from './project-repository.js';
import type { ProjectWithEnvironments } from './project-mappers.js';
import type { ProjectEnvironment } from '@prisma/client';

describe('ProjectService Unit Tests', () => {
  const dummyDate = new Date('2026-01-01T00:00:00.000Z');

  const createMockProject = (
    overrides?: Partial<ProjectWithEnvironments>,
  ): ProjectWithEnvironments => ({
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Sample Project',
    description: 'Sample description',
    status: 'ACTIVE',
    userId: null,
    lastOpenedAt: null,
    archivedAt: null,
    deletedAt: null,
    isFavorite: false,
    createdAt: dummyDate,
    updatedAt: dummyDate,
    environments: [],
    ...overrides,
  });

  const createMockEnv = (overrides?: Partial<ProjectEnvironment>): ProjectEnvironment => ({
    id: '22222222-2222-2222-2222-222222222222',
    projectId: '11111111-1111-1111-1111-111111111111',
    targetApplicationId: null,
    name: 'Dev Env',
    type: 'DEVELOPMENT',
    baseUrl: 'http://localhost:3000',
    apiUrl: null,
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
    createdAt: dummyDate,
    updatedAt: dummyDate,
    ...overrides,
  });

  describe('Project Creation & Validation', () => {
    it('should reject empty or whitespace-only project name', async () => {
      const service = new ProjectService({} as ProjectRepository);

      await assert.rejects(
        () => service.createProject({ name: '' }),
        (err: Error) => err instanceof ProjectValidationError && err.message.includes('required'),
      );

      await assert.rejects(
        () => service.createProject({ name: '   ' }),
        (err: Error) => err instanceof ProjectValidationError && err.message.includes('required'),
      );
    });

    it('should reject project name exceeding 120 characters', async () => {
      const service = new ProjectService({} as ProjectRepository);

      await assert.rejects(
        () => service.createProject({ name: 'A'.repeat(121) }),
        (err: Error) => err instanceof ProjectValidationError && err.message.includes('120'),
      );
    });

    it('should reject description exceeding 5000 characters', async () => {
      const service = new ProjectService({} as ProjectRepository);

      await assert.rejects(
        () => service.createProject({ name: 'Valid Name', description: 'D'.repeat(5001) }),
        (err: Error) => err instanceof ProjectValidationError && err.message.includes('5000'),
      );
    });

    it('should trim project name and normalize empty description to null', async () => {
      let createdName = '';
      let createdDesc: string | null | undefined = undefined;

      const mockRepo: Partial<ProjectRepository> = {
        createProject: async data => {
          createdName = data.name;
          createdDesc = data.description;
          return createMockProject({ name: data.name, description: data.description });
        },
      };

      const service = new ProjectService(mockRepo as ProjectRepository);
      const res = await service.createProject({
        name: '  Trimmed Project  ',
        description: '   ',
      });

      assert.strictEqual(createdName, 'Trimmed Project');
      assert.strictEqual(createdDesc, null);
      assert.strictEqual(res.name, 'Trimmed Project');
      assert.strictEqual(res.description, null);
    });
  });

  describe('Project Update & Archive Rules', () => {
    it('should reject update on non-existent project', async () => {
      const mockRepo: Partial<ProjectRepository> = {
        getProjectById: async () => null,
      };

      const service = new ProjectService(mockRepo as ProjectRepository);
      await assert.rejects(
        () =>
          service.updateProject({
            projectId: '11111111-1111-1111-1111-111111111111',
            name: 'New Name',
          }),
        (err: Error) => err instanceof ProjectNotFoundError,
      );
    });

    it('should reject update on archived project', async () => {
      const mockRepo: Partial<ProjectRepository> = {
        getProjectById: async () => createMockProject({ status: 'ARCHIVED' }),
      };

      const service = new ProjectService(mockRepo as ProjectRepository);
      await assert.rejects(
        () =>
          service.updateProject({
            projectId: '11111111-1111-1111-1111-111111111111',
            name: 'New Name',
          }),
        (err: Error) => err instanceof ProjectArchivedError,
      );
    });

    it('should allow archiving and restoring a project', async () => {
      let currentStatus: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE';

      const mockRepo: Partial<ProjectRepository> = {
        getProjectById: async () => createMockProject({ status: currentStatus }),
        updateStatus: async (_id, status) => {
          currentStatus = status;
          return createMockProject({ status });
        },
      };

      const service = new ProjectService(mockRepo as ProjectRepository);

      const archived = await service.archiveProject('11111111-1111-1111-1111-111111111111');
      assert.strictEqual(archived.status, 'ARCHIVED');

      const restored = await service.restoreProject('11111111-1111-1111-1111-111111111111');
      assert.strictEqual(restored.status, 'ACTIVE');
    });
  });

  describe('Permanent Delete Policy', () => {
    it('should reject permanent deletion of an ACTIVE project', async () => {
      const mockRepo: Partial<ProjectRepository> = {
        getProjectById: async () => createMockProject({ status: 'ACTIVE' }),
      };

      const service = new ProjectService(mockRepo as ProjectRepository);
      await assert.rejects(
        () => service.deleteProject('11111111-1111-1111-1111-111111111111'),
        (err: Error) =>
          err instanceof ProjectValidationError &&
          err.message.includes('Archive the project first'),
      );
    });

    it('should allow permanent deletion of an ARCHIVED project', async () => {
      let deletedId: string | null = null;
      const mockRepo: Partial<ProjectRepository> = {
        getProjectById: async () => createMockProject({ status: 'ARCHIVED' }),
        deleteProject: async id => {
          deletedId = id;
        },
      };

      const service = new ProjectService(mockRepo as ProjectRepository);
      const res = await service.deleteProject('11111111-1111-1111-1111-111111111111');
      assert.deepStrictEqual(res, { deleted: true });
      assert.strictEqual(deletedId, '11111111-1111-1111-1111-111111111111');
    });
  });

  describe('Environment Validation and Default Rules', () => {
    it('should automatically set the first environment as default', async () => {
      let recordedDefault: boolean | undefined = undefined;

      const mockRepo: Partial<ProjectRepository> = {
        getProjectById: async () => createMockProject({ status: 'ACTIVE' }),
        countEnvironments: async () => 0,
        createEnvironment: async data => {
          recordedDefault = data.isDefault;
          return createMockEnv({ isDefault: data.isDefault });
        },
      };

      const service = new ProjectService(mockRepo as ProjectRepository);
      const res = await service.createEnvironment({
        projectId: '11111111-1111-1111-1111-111111111111',
        name: 'First Env',
        type: 'DEVELOPMENT',
      });

      assert.strictEqual(recordedDefault, true);
      assert.strictEqual(res.isDefault, true);
    });

    it('should set subsequent environments as non-default', async () => {
      let recordedDefault: boolean | undefined = undefined;

      const mockRepo: Partial<ProjectRepository> = {
        getProjectById: async () => createMockProject({ status: 'ACTIVE' }),
        countEnvironments: async () => 1,
        createEnvironment: async data => {
          recordedDefault = data.isDefault;
          return createMockEnv({ isDefault: data.isDefault });
        },
      };

      const service = new ProjectService(mockRepo as ProjectRepository);
      const res = await service.createEnvironment({
        projectId: '11111111-1111-1111-1111-111111111111',
        name: 'Second Env',
        type: 'TEST',
      });

      assert.strictEqual(recordedDefault, false);
      assert.strictEqual(res.isDefault, false);
    });

    it('should reject invalid URL schemes and embedded credentials', async () => {
      const mockRepo: Partial<ProjectRepository> = {
        getProjectById: async () => createMockProject({ status: 'ACTIVE' }),
      };

      const service = new ProjectService(mockRepo as ProjectRepository);

      // Javascript protocol
      await assert.rejects(
        () =>
          service.createEnvironment({
            projectId: '11111111-1111-1111-1111-111111111111',
            name: 'Bad Env',
            type: 'DEVELOPMENT',
            baseUrl: 'javascript:alert(1)',
          }),
        (err: Error) => err instanceof ProjectValidationError,
      );

      // Embedded credentials
      await assert.rejects(
        () =>
          service.createEnvironment({
            projectId: '11111111-1111-1111-1111-111111111111',
            name: 'Cred Env',
            type: 'DEVELOPMENT',
            baseUrl: 'https://user:pass@example.com',
          }),
        (err: Error) =>
          err instanceof ProjectValidationError && err.message.includes('credentials'),
      );
    });

    it('should reject environment mutation on archived projects', async () => {
      const mockRepo: Partial<ProjectRepository> = {
        getProjectById: async () => createMockProject({ status: 'ARCHIVED' }),
      };

      const service = new ProjectService(mockRepo as ProjectRepository);

      await assert.rejects(
        () =>
          service.createEnvironment({
            projectId: '11111111-1111-1111-1111-111111111111',
            name: 'New Env',
            type: 'DEVELOPMENT',
          }),
        (err: Error) => err instanceof ProjectArchivedError,
      );
    });
  });
});
