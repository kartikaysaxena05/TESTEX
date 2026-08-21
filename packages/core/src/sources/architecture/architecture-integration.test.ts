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
import { ArchitectureService } from './architecture-service.js';
import { closeDatabaseManager } from '../../database/database.js';
import { getPrismaClient } from '../../database/client.js';

describe('Architecture Relational PostgreSQL Integration Tests', () => {
  let projectService: ProjectService;
  let sourceService: SourceService;
  let indexService: RepositoryIndexService;
  let architectureService: ArchitectureService;
  let tempRepoDir: string;

  before(() => {
    const projectRepo = new ProjectRepository();
    const sourceRepo = new SourceRepository();

    projectService = new ProjectService(projectRepo);
    sourceService = new SourceService(sourceRepo, projectRepo);
    indexService = new RepositoryIndexService();
    architectureService = new ArchitectureService();

    tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-integration-'));
    fs.mkdirSync(path.join(tempRepoDir, 'app'), { recursive: true });
    fs.mkdirSync(path.join(tempRepoDir, 'src', 'components'), { recursive: true });

    // Next.js style layout & page
    fs.writeFileSync(
      path.join(tempRepoDir, 'package.json'),
      JSON.stringify({
        name: 'next-sample-app',
        dependencies: {
          next: '^14.0.0',
          react: '^18.0.0',
        },
      }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tempRepoDir, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }: { children: any }) { return <html><body>{children}</body></html>; }',
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tempRepoDir, 'app', 'page.tsx'),
      'export default function HomePage() { return <div>Home</div>; }',
      'utf-8',
    );
  });

  after(async () => {
    fs.rmSync(tempRepoDir, { recursive: true, force: true });
    await closeDatabaseManager();
  });

  it('should analyze architecture, persist profile into PostgreSQL, and cascade on delete', async () => {
    const prisma = getPrismaClient();
    assert.ok(prisma, 'Prisma client must be initialized');

    // 1. Create QA Project & Attach Source
    const project = await projectService.createProject({
      name: 'Architecture Integration Test Project',
    });

    const attachResult = await sourceService.attachLocalDirectory(project.id, tempRepoDir);
    const sourceId = attachResult.id;

    // 2. Build Repository Index First
    await indexService.refreshIndex(project.id);

    // 3. Refresh Architecture Profile
    const profile = await architectureService.refreshArchitectureProfile(project.id);

    assert.strictEqual(profile.primaryKind, 'FULL_STACK_WEB');
    assert.strictEqual(profile.confidence, 'HIGH');
    assert.ok(profile.entryCandidates.length >= 1);
    assert.ok(profile.entryCandidates.some(c => c.relativePath === 'app/layout.tsx'));

    // 4. Verify DB Row Exists
    const dbRecord = await prisma.repositoryArchitectureAnalysis.findUnique({
      where: { sourceId },
    });
    assert.ok(dbRecord, 'Must find architecture analysis record in PostgreSQL');
    assert.strictEqual(dbRecord.primaryKind, 'FULL_STACK_WEB');
    assert.strictEqual(dbRecord.confidence, 'HIGH');

    // 5. Verify Cascade Deletion
    await projectService.archiveProject(project.id);
    await projectService.deleteProject(project.id);

    const remaining = await prisma.repositoryArchitectureAnalysis.count({
      where: { sourceId },
    });
    assert.strictEqual(remaining, 0, 'Architecture analysis must cascade delete');
  });
});
