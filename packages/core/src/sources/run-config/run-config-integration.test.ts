import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProjectService } from '../../projects/project-service.js';
import { ProjectRepository } from '../../projects/project-repository.js';
import { SourceService } from '../source-service.js';
import { SourceRepository } from '../source-repository.js';
import { RepositoryIndexService } from '../indexing/repository-index-service.js';
import { ArchitectureService } from '../architecture/architecture-service.js';
import { RunConfigService } from './run-config-service.js';
import { closeDatabaseManager } from '../../database/database.js';
import { getPrismaClient } from '../../database/client.js';

describe('Run Configuration PostgreSQL Integration Tests', () => {
  let projectService: ProjectService;
  let sourceService: SourceService;
  let indexService: RepositoryIndexService;
  let architectureService: ArchitectureService;
  let runConfigService: RunConfigService;
  let tempRepoDir: string;

  before(() => {
    const projectRepo = new ProjectRepository();
    const sourceRepo = new SourceRepository();

    projectService = new ProjectService(projectRepo);
    sourceService = new SourceService(sourceRepo, projectRepo);
    indexService = new RepositoryIndexService();
    architectureService = new ArchitectureService();
    runConfigService = new RunConfigService();

    tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-config-integ-'));
    fs.writeFileSync(
      path.join(tempRepoDir, 'package.json'),
      JSON.stringify({
        name: 'vite-app',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview',
        },
        dependencies: {
          react: '^18.0.0',
        },
      }),
      'utf-8',
    );
    fs.writeFileSync(path.join(tempRepoDir, 'pnpm-lock.yaml'), 'lockfileVersion: 5.4\n', 'utf-8');
  });

  after(async () => {
    fs.rmSync(tempRepoDir, { recursive: true, force: true });
    await closeDatabaseManager();
  });

  it('should detect startup candidates, persist run configuration in PostgreSQL, update target URL, and cascade delete', async () => {
    const prisma = getPrismaClient();
    assert.ok(prisma, 'Prisma client must be initialized');

    // 1. Create Project & Attach Source
    const project = await projectService.createProject({
      name: 'Run Config Integration Project',
    });
    const attachResult = await sourceService.attachLocalDirectory(project.id, tempRepoDir);
    const sourceId = attachResult.id;

    // 2. Build Index & Architecture
    await indexService.refreshIndex(project.id);
    await architectureService.refreshArchitectureProfile(project.id);

    // 3. Detect Run Configuration
    const profile = await runConfigService.detectRunConfiguration(project.id);
    assert.ok(profile.candidates.length >= 1);
    assert.strictEqual(profile.candidates[0]?.executable, 'pnpm');
    assert.deepStrictEqual(profile.candidates[0]?.args, ['dev']);
    assert.strictEqual(profile.selectedConfiguration?.executable, 'pnpm');

    // 4. Update Target URL
    const updated = await runConfigService.updateTargetUrl(project.id, 'http://localhost:5173');
    assert.strictEqual(updated?.targetUrl, 'http://localhost:5173');

    // 5. Verify PostgreSQL row
    const dbRecord = await prisma.projectRunConfiguration.findFirst({
      where: { sourceId, isSelected: true },
    });
    assert.ok(dbRecord);
    assert.strictEqual(dbRecord.executable, 'pnpm');
    assert.strictEqual(dbRecord.targetUrl, 'http://localhost:5173');

    // 6. Delete project and verify cascade delete
    await projectService.archiveProject(project.id);
    await projectService.deleteProject(project.id);

    const count = await prisma.projectRunConfiguration.count({
      where: { sourceId },
    });
    assert.strictEqual(count, 0, 'Run configuration records must cascade delete');
  });
});
