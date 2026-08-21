import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPrismaClient, disconnectPrismaClient } from '../database/client.js';
import { ProjectService } from './project-service.js';
import { ProjectRepository } from './project-repository.js';
import {
  ProjectNotFoundError,
  ProjectArchivedError,
  ProjectValidationError,
  ProjectConflictError,
  EnvironmentNotFoundError,
} from './project-errors.js';
import type { PrismaClient } from '@prisma/client';

describe('Project Management Relational PostgreSQL Integration Tests', () => {
  let prisma: PrismaClient;
  let service: ProjectService;
  let repo: ProjectRepository;
  const createdProjectIds: string[] = [];

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('DATABASE_URL must be configured for integration tests.');
    }
    prisma = client;
    repo = new ProjectRepository();
    service = new ProjectService(repo);
  });

  after(async () => {
    if (prisma && createdProjectIds.length > 0) {
      try {
        await prisma.project.deleteMany({
          where: {
            id: {
              in: createdProjectIds,
            },
          },
        });
      } catch {
        // Ignore teardown errors
      }
    }
    await disconnectPrismaClient();
  });

  describe('Project Creation & Automatic Settings', () => {
    it('should create a project and automatically generate exactly one ProjectSettings record', async () => {
      const project = await service.createProject({
        name: 'Integration Project 1',
        description: 'Testing automatic settings and creation transaction',
      });
      createdProjectIds.push(project.id);

      assert.strictEqual(project.name, 'Integration Project 1');
      assert.strictEqual(
        project.description,
        'Testing automatic settings and creation transaction',
      );
      assert.strictEqual(project.status, 'ACTIVE');
      assert.strictEqual(project.environments.length, 0);

      // Verify ProjectSettings row in database
      const settings = await prisma.projectSettings.findUnique({
        where: { projectId: project.id },
      });
      assert.ok(settings, 'ProjectSettings must exist');
      assert.strictEqual(settings.projectId, project.id);
    });
  });

  describe('Project Listing & Retrieval', () => {
    it('should list active projects and filter correctly', async () => {
      const p1 = await service.createProject({ name: 'Active Project 1' });
      const p2 = await service.createProject({ name: 'Active Project 2' });
      createdProjectIds.push(p1.id, p2.id);

      await service.archiveProject(p2.id);

      const activeList = await service.listProjects({ status: 'ACTIVE' });
      const archivedList = await service.listProjects({ status: 'ARCHIVED' });
      const allList = await service.listProjects({ status: 'ALL' });

      assert.ok(activeList.some(p => p.id === p1.id));
      assert.ok(!activeList.some(p => p.id === p2.id));

      assert.ok(archivedList.some(p => p.id === p2.id));
      assert.ok(!archivedList.some(p => p.id === p1.id));

      assert.ok(allList.some(p => p.id === p1.id));
      assert.ok(allList.some(p => p.id === p2.id));
    });

    it('should get project details by ID', async () => {
      const created = await service.createProject({ name: 'Fetchable Project' });
      createdProjectIds.push(created.id);

      const fetched = await service.getProject(created.id);
      assert.strictEqual(fetched.id, created.id);
      assert.strictEqual(fetched.name, 'Fetchable Project');
    });

    it('should throw ProjectNotFoundError for non-existent UUID', async () => {
      const nonExistent = randomUUID();
      await assert.rejects(
        () => service.getProject(nonExistent),
        (err: Error) => err instanceof ProjectNotFoundError,
      );
    });
  });

  describe('Project Updating & Lifecycle Rules', () => {
    it('should update active project name and description', async () => {
      const created = await service.createProject({
        name: 'Original Name',
        description: 'Original Desc',
      });
      createdProjectIds.push(created.id);

      const updated = await service.updateProject({
        projectId: created.id,
        name: 'Updated Name',
        description: 'Updated Desc',
      });

      assert.strictEqual(updated.name, 'Updated Name');
      assert.strictEqual(updated.description, 'Updated Desc');
    });

    it('should reject update on archived project and allow update after restore', async () => {
      const created = await service.createProject({ name: 'To Archive' });
      createdProjectIds.push(created.id);

      await service.archiveProject(created.id);

      await assert.rejects(
        () => service.updateProject({ projectId: created.id, name: 'Should Fail' }),
        (err: Error) => err instanceof ProjectArchivedError,
      );

      await service.restoreProject(created.id);

      const updated = await service.updateProject({
        projectId: created.id,
        name: 'Allowed After Restore',
      });
      assert.strictEqual(updated.name, 'Allowed After Restore');
    });
  });

  describe('Project Deletion Policy & Cascades', () => {
    it('should reject permanent delete of an ACTIVE project', async () => {
      const activeProject = await service.createProject({ name: 'Active Delete Guard' });
      createdProjectIds.push(activeProject.id);

      await assert.rejects(
        () => service.deleteProject(activeProject.id),
        (err: Error) =>
          err instanceof ProjectValidationError &&
          err.message.includes('Archive the project first'),
      );
    });

    it('should allow permanent delete of an ARCHIVED project and cascade to settings & environments', async () => {
      const project = await service.createProject({ name: 'Cascade Target' });
      await service.createEnvironment({
        projectId: project.id,
        name: 'Cascade Env',
        type: 'DEVELOPMENT',
      });

      await service.archiveProject(project.id);
      const delResult = await service.deleteProject(project.id);
      assert.deepStrictEqual(delResult, { deleted: true });

      // Verify records are gone from database
      const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      const dbSettings = await prisma.projectSettings.findUnique({
        where: { projectId: project.id },
      });
      const dbEnvs = await prisma.projectEnvironment.findMany({ where: { projectId: project.id } });

      assert.strictEqual(dbProject, null);
      assert.strictEqual(dbSettings, null);
      assert.strictEqual(dbEnvs.length, 0);
    });
  });

  describe('Environment Lifecycle & Constraints', () => {
    it('should create first environment as default and second as non-default', async () => {
      const project = await service.createProject({ name: 'Env Default Test' });
      createdProjectIds.push(project.id);

      const env1 = await service.createEnvironment({
        projectId: project.id,
        name: 'First Env (Dev)',
        type: 'DEVELOPMENT',
        baseUrl: 'http://localhost:3000',
      });
      assert.strictEqual(env1.isDefault, true);

      const env2 = await service.createEnvironment({
        projectId: project.id,
        name: 'Second Env (QA)',
        type: 'TEST',
        baseUrl: 'https://qa.example.com',
      });
      assert.strictEqual(env2.isDefault, false);

      const details = await service.getProject(project.id);
      assert.strictEqual(details.environments.length, 2);
    });

    it('should enforce unique environment names within the same project', async () => {
      const project = await service.createProject({ name: 'Duplicate Env Test' });
      createdProjectIds.push(project.id);

      await service.createEnvironment({
        projectId: project.id,
        name: 'Staging',
        type: 'STAGING',
      });

      await assert.rejects(
        () =>
          service.createEnvironment({
            projectId: project.id,
            name: 'Staging',
            type: 'STAGING',
          }),
        (err: Error) => err instanceof ProjectConflictError,
      );
    });

    it('should atomically switch default environment with setDefaultEnvironment', async () => {
      const project = await service.createProject({ name: 'Switch Default Project' });
      createdProjectIds.push(project.id);

      const env1 = await service.createEnvironment({
        projectId: project.id,
        name: 'Env 1',
        type: 'DEVELOPMENT',
      });
      const env2 = await service.createEnvironment({
        projectId: project.id,
        name: 'Env 2',
        type: 'STAGING',
      });

      assert.strictEqual(env1.isDefault, true);
      assert.strictEqual(env2.isDefault, false);

      // Switch default to Env 2
      const switched = await service.setDefaultEnvironment({
        projectId: project.id,
        environmentId: env2.id,
      });
      assert.strictEqual(switched.isDefault, true);

      const refreshed = await service.getProject(project.id);
      const rEnv1 = refreshed.environments.find(e => e.id === env1.id);
      const rEnv2 = refreshed.environments.find(e => e.id === env2.id);

      assert.strictEqual(rEnv1?.isDefault, false);
      assert.strictEqual(rEnv2?.isDefault, true);
    });

    it('should delete an environment and preserve parent project', async () => {
      const project = await service.createProject({ name: 'Delete Env Project' });
      createdProjectIds.push(project.id);

      const env = await service.createEnvironment({
        projectId: project.id,
        name: 'To Delete',
        type: 'TEST',
      });

      const delRes = await service.deleteEnvironment({
        projectId: project.id,
        environmentId: env.id,
      });
      assert.deepStrictEqual(delRes, { deleted: true });

      const details = await service.getProject(project.id);
      assert.strictEqual(details.environments.length, 0);
    });

    it('should reject environment mutation if environment belongs to a different project', async () => {
      const pA = await service.createProject({ name: 'Project A' });
      const pB = await service.createProject({ name: 'Project B' });
      createdProjectIds.push(pA.id, pB.id);

      const envA = await service.createEnvironment({
        projectId: pA.id,
        name: 'Env on A',
        type: 'DEVELOPMENT',
      });

      await assert.rejects(
        () =>
          service.updateEnvironment({
            projectId: pB.id,
            environmentId: envA.id,
            name: 'Malicious Update',
            type: 'DEVELOPMENT',
          }),
        (err: Error) => err instanceof EnvironmentNotFoundError,
      );
    });
  });
});
