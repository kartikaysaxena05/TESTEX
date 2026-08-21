import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProjectService } from '../../projects/project-service.js';
import { ProjectRepository } from '../../projects/project-repository.js';
import { SourceService } from '../source-service.js';
import { SourceRepository } from '../source-repository.js';
import { RepositoryIndexService } from './repository-index-service.js';
import { RepositoryIndexRepository } from './repository-index-repository.js';
import { closeDatabaseManager } from '../../database/database.js';
import { getPrismaClient } from '../../database/client.js';

describe('Repository Index Relational PostgreSQL Integration Tests', () => {
  let projectService: ProjectService;
  let sourceService: SourceService;
  let indexService: RepositoryIndexService;
  let indexRepository: RepositoryIndexRepository;
  let tempRepoDir: string;

  before(() => {
    const projectRepo = new ProjectRepository();
    const sourceRepo = new SourceRepository();
    indexRepository = new RepositoryIndexRepository();

    projectService = new ProjectService(projectRepo);
    sourceService = new SourceService(sourceRepo, projectRepo);
    indexService = new RepositoryIndexService(indexRepository, sourceRepo, projectRepo);

    tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'index-integration-'));
    fs.mkdirSync(path.join(tempRepoDir, 'src'), { recursive: true });

    // 1. Target files
    fs.writeFileSync(
      path.join(tempRepoDir, 'src', 'db.ts'),
      'export interface DbConfig { host: string; }\nexport const defaultDb: DbConfig = { host: "localhost" };',
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tempRepoDir, 'src', 'user.ts'),
      'import { defaultDb } from "./db";\nimport React from "react";\nexport class UserService {}\nexport function findUser() {}',
      'utf-8',
    );
    fs.writeFileSync(path.join(tempRepoDir, '.env'), 'SECRET=DENIED', 'utf-8');
  });

  after(async () => {
    fs.rmSync(tempRepoDir, { recursive: true, force: true });
    await closeDatabaseManager();
  });

  it('should persist index runs, files, symbols, and imports into PostgreSQL with cascade deletion', async () => {
    const prisma = getPrismaClient();
    assert.ok(prisma, 'Prisma client must be initialized');

    // 1. Create QA Project & Attach Source
    const project = await projectService.createProject({
      name: 'Index Integration Test Project',
    });

    const attachResult = await sourceService.attachLocalDirectory(project.id, tempRepoDir);
    const sourceId = attachResult.id;

    // 2. Refresh Index
    const status = await indexService.refreshIndex(project.id);
    assert.strictEqual(status.isIndexed, true);
    assert.strictEqual(status.summary?.filesIndexed, 2);
    assert.strictEqual(status.summary?.filesSkipped, 1); // .env skipped

    // 3. Verify Database Records
    const dbFiles = await prisma.repositoryFile.findMany({
      where: { sourceId },
      include: { symbols: true, imports: true },
      orderBy: { relativePath: 'asc' },
    });

    assert.strictEqual(dbFiles.length, 2);
    const dbFile = dbFiles.find(f => f.relativePath === 'src/user.ts');
    assert.ok(dbFile, 'Must find src/user.ts in database');
    assert.strictEqual(dbFile.language, 'TypeScript');
    assert.strictEqual(dbFile.classification, 'SOURCE');
    assert.ok(dbFile.contentHash, 'Must have computed SHA-256 hash');
    assert.strictEqual(dbFile.symbols.length, 2); // UserService, findUser
    assert.strictEqual(dbFile.imports.length, 2); // ./db, react

    // 4. Test List Indexed Files
    const listResult = await indexService.listIndexedFiles(project.id, {
      projectId: project.id,
      page: 1,
      pageSize: 10,
    });
    assert.strictEqual(listResult.total, 2);
    assert.strictEqual(listResult.items.length, 2);

    // 5. Test File Details
    const fileDetails = await indexService.getFileDetails(project.id, 'src/user.ts');
    assert.ok(fileDetails);
    assert.strictEqual(fileDetails.file.relativePath, 'src/user.ts');
    assert.strictEqual(fileDetails.symbols.length, 2);
    assert.strictEqual(fileDetails.imports.length, 2);

    // 6. Test Symbol Search
    const symbols = await indexService.searchSymbols(project.id, {
      projectId: project.id,
      query: 'User',
    });
    assert.ok(symbols.length >= 1);
    assert.ok(symbols.some(s => s.name === 'UserService'));

    // 7. Verify Unique Constraint on (sourceId, relativePath)
    await assert.rejects(async () => {
      await prisma.repositoryFile.create({
        data: {
          sourceId,
          relativePath: 'src/user.ts',
          name: 'user.ts',
          classification: 'SOURCE',
          sizeBytes: 50,
        },
      });
    }, /Unique constraint failed/);

    // 8. Verify Cascade Deletion on Detach / Delete Project
    await projectService.archiveProject(project.id);
    await projectService.deleteProject(project.id);

    const remainingFiles = await prisma.repositoryFile.count({ where: { sourceId } });
    const remainingRuns = await prisma.repositoryIndexRun.count({ where: { sourceId } });
    assert.strictEqual(remainingFiles, 0, 'Repository files must cascade delete');
    assert.strictEqual(remainingRuns, 0, 'Index runs must cascade delete');
  });
});
