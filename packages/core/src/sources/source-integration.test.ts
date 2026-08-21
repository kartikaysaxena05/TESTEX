import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getPrismaClient } from '../database/client.js';
import { closeDatabaseManager } from '../database/database.js';
import { ProjectRepository } from '../projects/project-repository.js';
import { ProjectService } from '../projects/project-service.js';
import { SourceRepository } from './source-repository.js';
import { SourceService } from './source-service.js';

describe('ProjectSource Relational PostgreSQL Integration Tests', () => {
  let projectService: ProjectService;
  let sourceService: SourceService;
  let tempDir: string;
  let sampleDirA: string;
  let sampleDirB: string;

  before(async () => {
    const projectRepo = new ProjectRepository();
    const sourceRepo = new SourceRepository();
    projectService = new ProjectService(projectRepo);
    sourceService = new SourceService(sourceRepo, projectRepo);

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-pg-integration-'));
    sampleDirA = path.join(tempDir, 'sample-app-a');
    sampleDirB = path.join(tempDir, 'sample-app-b');
    fs.mkdirSync(sampleDirA, { recursive: true });
    fs.mkdirSync(sampleDirB, { recursive: true });
  });

  after(async () => {
    try {
      const prisma = getPrismaClient();
      if (prisma) {
        await prisma.project.deleteMany({
          where: { name: { startsWith: 'Source Integration Test Project' } },
        });
      }
      await closeDatabaseManager();
    } catch {
      // Ignore
    }

    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should persist and retrieve a ProjectSource record with identity fingerprint in PostgreSQL', async () => {
    const project = await projectService.createProject({
      name: 'Source Integration Test Project 1',
      description: 'Testing source persistence and identity',
    });

    const attached = await sourceService.attachLocalDirectory(project.id, sampleDirA);
    assert.strictEqual(attached.projectId, project.id);
    assert.strictEqual(attached.displayName, 'sample-app-a');
    assert.strictEqual(attached.kind, 'LOCAL_DIRECTORY');
    assert.strictEqual(attached.availability, 'AVAILABLE');
    assert.ok(attached.identityFingerprint !== null);
    assert.strictEqual(attached.identityFingerprint?.length, 64);
    assert.ok(attached.metadataRefreshedAt !== null);

    // Retrieve via service
    const retrieved = await sourceService.getSource(project.id);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.id, attached.id);
    assert.strictEqual(retrieved.rootPath, fs.realpathSync(sampleDirA));
    assert.strictEqual(retrieved.identityFingerprint, attached.identityFingerprint);

    // Verify directly in Prisma
    const prisma = getPrismaClient();
    assert.ok(prisma);
    const dbRecord = await prisma.projectSource.findUnique({
      where: { projectId: project.id },
    });
    assert.ok(dbRecord);
    assert.strictEqual(dbRecord.displayName, 'sample-app-a');
    assert.strictEqual(dbRecord.identityFingerprint, attached.identityFingerprint);
  });

  it('should refresh metadata and update timestamps in PostgreSQL', async () => {
    const project = await projectService.createProject({
      name: 'Source Integration Test Project Refresh',
    });

    const attached = await sourceService.attachLocalDirectory(project.id, sampleDirA);
    const refreshed = await sourceService.refreshMetadata(project.id);

    assert.strictEqual(refreshed.id, attached.id);
    assert.strictEqual(refreshed.availability, 'AVAILABLE');
    assert.ok(refreshed.metadataRefreshedAt !== null);
  });

  it('should replace an existing source attachment and calculate new identity', async () => {
    const project = await projectService.createProject({
      name: 'Source Integration Test Project 2',
    });

    const first = await sourceService.attachLocalDirectory(project.id, sampleDirA);
    const updated = await sourceService.attachLocalDirectory(project.id, sampleDirB);

    assert.strictEqual(updated.displayName, 'sample-app-b');
    assert.strictEqual(updated.rootPath, fs.realpathSync(sampleDirB));
    assert.notStrictEqual(updated.identityFingerprint, first.identityFingerprint);

    // Ensure only 1 source record exists for the project
    const prisma = getPrismaClient();
    assert.ok(prisma);
    const count = await prisma.projectSource.count({
      where: { projectId: project.id },
    });
    assert.strictEqual(count, 1);
  });

  it('should cascade delete the ProjectSource record when the parent Project is deleted', async () => {
    const project = await projectService.createProject({
      name: 'Source Integration Test Project 3',
    });

    const attached = await sourceService.attachLocalDirectory(project.id, sampleDirA);

    // Archive and permanently delete project
    await projectService.archiveProject(project.id);
    await projectService.deleteProject(project.id);

    // Verify source record was deleted from database via cascade
    const prisma = getPrismaClient();
    assert.ok(prisma);
    const sourceRecord = await prisma.projectSource.findUnique({
      where: { id: attached.id },
    });
    assert.strictEqual(sourceRecord, null);

    // Verify filesystem directory was NOT deleted
    assert.strictEqual(fs.existsSync(sampleDirA), true);
  });

  it('should detach source from database and keep filesystem folder untouched', async () => {
    const project = await projectService.createProject({
      name: 'Source Integration Test Project 4',
    });

    await sourceService.attachLocalDirectory(project.id, sampleDirA);

    const detachResult = await sourceService.detachSource(project.id);
    assert.strictEqual(detachResult.detached, true);

    const prisma = getPrismaClient();
    assert.ok(prisma);
    const sourceRecord = await prisma.projectSource.findUnique({
      where: { projectId: project.id },
    });
    assert.strictEqual(sourceRecord, null);

    // Filesystem directory must remain completely intact
    assert.strictEqual(fs.existsSync(sampleDirA), true);
  });
});
