import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPrismaClient, disconnectPrismaClient } from './index.js';
import type { PrismaClient } from '@prisma/client';

describe('Core Project Data Models Relational Integration Tests', () => {
  let prisma: PrismaClient;
  const createdProjectIds: string[] = [];

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('DATABASE_URL must be configured for integration tests.');
    }
    prisma = client;
  });

  after(async () => {
    // Clean up any test projects and cascading children
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
        // Ignore cleanup errors during teardown
      }
    }
    await disconnectPrismaClient();
  });

  describe('Project Model & Lifecycle', () => {
    it('should create a project with default ACTIVE status and valid timestamps', async () => {
      const projectId = randomUUID();
      createdProjectIds.push(projectId);

      const project = await prisma.project.create({
        data: {
          id: projectId,
          name: 'Core Quality Platform Test Project',
          description: 'Automated integration test project instance',
        },
      });

      assert.strictEqual(project.id, projectId);
      assert.strictEqual(project.name, 'Core Quality Platform Test Project');
      assert.strictEqual(project.status, 'ACTIVE');
      assert.ok(project.createdAt instanceof Date);
      assert.ok(project.updatedAt instanceof Date);
    });

    it('should archive a project and update the updatedAt timestamp', async () => {
      const projectId = randomUUID();
      createdProjectIds.push(projectId);

      const created = await prisma.project.create({
        data: {
          id: projectId,
          name: 'Archivable Test Project',
        },
      });

      const updated = await prisma.project.update({
        where: { id: projectId },
        data: { status: 'ARCHIVED' },
      });

      assert.strictEqual(updated.status, 'ARCHIVED');
      assert.ok(updated.updatedAt.getTime() >= created.updatedAt.getTime());
    });
  });

  describe('ProjectSettings Model (1:1 Relation)', () => {
    it('should create 1:1 project settings and fetch via relation', async () => {
      const projectId = randomUUID();
      createdProjectIds.push(projectId);

      await prisma.project.create({
        data: {
          id: projectId,
          name: 'Settings Relation Project',
          settings: {
            create: {},
          },
        },
      });

      const projectWithSettings = await prisma.project.findUnique({
        where: { id: projectId },
        include: { settings: true },
      });

      assert.ok(projectWithSettings?.settings);
      assert.strictEqual(projectWithSettings?.settings?.projectId, projectId);
    });

    it('should prevent inserting duplicate settings for the same project', async () => {
      const projectId = randomUUID();
      createdProjectIds.push(projectId);

      await prisma.project.create({
        data: {
          id: projectId,
          name: 'Duplicate Settings Test',
          settings: {
            create: {},
          },
        },
      });

      // Attempt second settings insert for the same project
      await assert.rejects(async () => {
        await prisma.projectSettings.create({
          data: {
            projectId,
          },
        });
      }, /Unique constraint|duplicate key|P2002/i);
    });
  });

  describe('ProjectEnvironment Model (1:N Relation & Constraints)', () => {
    it('should insert multiple environments and retrieve via project relation', async () => {
      const projectId = randomUUID();
      createdProjectIds.push(projectId);

      const project = await prisma.project.create({
        data: {
          id: projectId,
          name: 'Environments Relation Project',
          environments: {
            create: [
              { name: 'Local Dev', type: 'LOCAL', baseUrl: 'http://localhost:3000' },
              { name: 'QA Server', type: 'TEST', baseUrl: 'https://qa.example.com' },
              { name: 'Staging', type: 'STAGING', baseUrl: 'https://staging.example.com' },
            ],
          },
        },
        include: { environments: true },
      });

      assert.strictEqual(project.environments.length, 3);
      const names = project.environments.map(e => e.name).sort();
      assert.deepStrictEqual(names, ['Local Dev', 'QA Server', 'Staging']);
    });

    it('should enforce environment name uniqueness within the same project', async () => {
      const projectId = randomUUID();
      createdProjectIds.push(projectId);

      await prisma.project.create({
        data: {
          id: projectId,
          name: 'Environment Unique Name Test',
          environments: {
            create: [{ name: 'Staging', type: 'STAGING' }],
          },
        },
      });

      // Attempt duplicate environment name for the same project
      await assert.rejects(async () => {
        await prisma.projectEnvironment.create({
          data: {
            projectId,
            name: 'Staging',
            type: 'STAGING',
          },
        });
      }, /Unique constraint|duplicate key|P2002/i);
    });

    it('should allow identical environment names across different projects', async () => {
      const projectAId = randomUUID();
      const projectBId = randomUUID();
      createdProjectIds.push(projectAId, projectBId);

      const pA = await prisma.project.create({
        data: {
          id: projectAId,
          name: 'Project A',
          environments: {
            create: [{ name: 'Production', type: 'PRODUCTION' }],
          },
        },
        include: { environments: true },
      });

      const pB = await prisma.project.create({
        data: {
          id: projectBId,
          name: 'Project B',
          environments: {
            create: [{ name: 'Production', type: 'PRODUCTION' }],
          },
        },
        include: { environments: true },
      });

      assert.strictEqual(pA.environments[0]?.name, 'Production');
      assert.strictEqual(pB.environments[0]?.name, 'Production');
    });

    it('should allow 0 default environments for a project', async () => {
      const projectId = randomUUID();
      createdProjectIds.push(projectId);

      const project = await prisma.project.create({
        data: {
          id: projectId,
          name: 'Zero Default Env Project',
          environments: {
            create: [
              { name: 'Env 1', isDefault: false },
              { name: 'Env 2', isDefault: false },
            ],
          },
        },
        include: { environments: true },
      });

      assert.strictEqual(project.environments.length, 2);
      assert.strictEqual(
        project.environments.every(e => !e.isDefault),
        true,
      );
    });

    it('should enforce at most one default environment per project via PostgreSQL partial index', async () => {
      const projectId = randomUUID();
      createdProjectIds.push(projectId);

      await prisma.project.create({
        data: {
          id: projectId,
          name: 'Single Default Constraint Project',
          environments: {
            create: [{ name: 'Primary Default', isDefault: true }],
          },
        },
      });

      // Attempt to insert a second default environment for the same project
      await assert.rejects(async () => {
        await prisma.projectEnvironment.create({
          data: {
            projectId,
            name: 'Secondary Default',
            isDefault: true,
          },
        });
      }, /Unique constraint|duplicate key|P2002/i);
    });

    it('should allow different projects to each have their own default environment', async () => {
      const p1Id = randomUUID();
      const p2Id = randomUUID();
      createdProjectIds.push(p1Id, p2Id);

      const p1 = await prisma.project.create({
        data: {
          id: p1Id,
          name: 'Multi-Project Default 1',
          environments: {
            create: [{ name: 'P1 Default', isDefault: true }],
          },
        },
        include: { environments: true },
      });

      const p2 = await prisma.project.create({
        data: {
          id: p2Id,
          name: 'Multi-Project Default 2',
          environments: {
            create: [{ name: 'P2 Default', isDefault: true }],
          },
        },
        include: { environments: true },
      });

      assert.strictEqual(p1.environments[0]?.isDefault, true);
      assert.strictEqual(p2.environments[0]?.isDefault, true);
    });
  });

  describe('Cascade Deletion and Foreign Key Integrity', () => {
    it('should cascade delete settings and environments when project is deleted', async () => {
      const projectId = randomUUID();

      await prisma.project.create({
        data: {
          id: projectId,
          name: 'Cascade Deletion Project',
          settings: {
            create: {},
          },
          environments: {
            create: [{ name: 'Cascade Env 1' }, { name: 'Cascade Env 2' }],
          },
        },
      });

      // Confirm records exist before deletion
      const settingsBefore = await prisma.projectSettings.findUnique({
        where: { projectId },
      });
      assert.ok(settingsBefore);

      const envsBefore = await prisma.projectEnvironment.findMany({
        where: { projectId },
      });
      assert.strictEqual(envsBefore.length, 2);

      // Delete the parent project
      await prisma.project.delete({
        where: { id: projectId },
      });

      // Verify orphaned child records were cascade deleted
      const settingsAfter = await prisma.projectSettings.findUnique({
        where: { projectId },
      });
      assert.strictEqual(settingsAfter, null);

      const envsAfter = await prisma.projectEnvironment.findMany({
        where: { projectId },
      });
      assert.strictEqual(envsAfter.length, 0);
    });

    it('should preserve parent project when a single child environment is deleted', async () => {
      const projectId = randomUUID();
      createdProjectIds.push(projectId);

      const project = await prisma.project.create({
        data: {
          id: projectId,
          name: 'Child Delete Project',
          environments: {
            create: [{ name: 'Env To Keep' }, { name: 'Env To Delete' }],
          },
        },
        include: { environments: true },
      });

      const envToDelete = project.environments.find(e => e.name === 'Env To Delete');
      assert.ok(envToDelete);

      await prisma.projectEnvironment.delete({
        where: { id: envToDelete.id },
      });

      const projectAfter = await prisma.project.findUnique({
        where: { id: projectId },
        include: { environments: true },
      });

      assert.ok(projectAfter);
      assert.strictEqual(projectAfter.environments.length, 1);
      assert.strictEqual(projectAfter.environments[0]?.name, 'Env To Keep');
    });

    it('should reject creating an environment with a non-existent projectId', async () => {
      const nonExistentId = randomUUID();

      await assert.rejects(async () => {
        await prisma.projectEnvironment.create({
          data: {
            projectId: nonExistentId,
            name: 'Orphan Env',
          },
        });
      }, /Foreign key constraint|P2003/i);
    });
  });

  describe('Field Bounds & Length Constraints', () => {
    it('should reject project name exceeding 120 characters', async () => {
      const projectId = randomUUID();
      const longName = 'A'.repeat(121);

      await assert.rejects(async () => {
        await prisma.project.create({
          data: {
            id: projectId,
            name: longName,
          },
        });
      }, /too long|P2000/i);
    });

    it('should reject environment name exceeding 80 characters', async () => {
      const projectId = randomUUID();
      createdProjectIds.push(projectId);

      await prisma.project.create({
        data: {
          id: projectId,
          name: 'Environment Length Test',
        },
      });

      const longEnvName = 'E'.repeat(81);

      await assert.rejects(async () => {
        await prisma.projectEnvironment.create({
          data: {
            projectId,
            name: longEnvName,
          },
        });
      }, /too long|P2000/i);
    });
  });
});
