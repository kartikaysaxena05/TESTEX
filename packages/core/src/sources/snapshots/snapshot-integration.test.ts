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
import { SourceStructureService } from '../structure/source-structure-service.js';
import { ClassificationProfileService } from '../classification/classification-profile-service.js';
import { SnapshotService } from './snapshot-service.js';
import { ChangeService } from '../changes/change-service.js';
import { closeDatabaseManager } from '../../database/database.js';
import { getPrismaClient } from '../../database/client.js';

describe('Snapshot & Change Detection PostgreSQL Integration Tests', () => {
  let projectService: ProjectService;
  let sourceService: SourceService;
  let indexService: RepositoryIndexService;
  let snapshotService: SnapshotService;
  let changeService: ChangeService;
  let tempRepoDir: string;

  before(() => {
    const projectRepo = new ProjectRepository();
    const sourceRepo = new SourceRepository();

    projectService = new ProjectService(projectRepo);
    sourceService = new SourceService(sourceRepo, projectRepo);
    indexService = new RepositoryIndexService();
    snapshotService = new SnapshotService();
    changeService = new ChangeService();

    tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-integ-'));
    fs.mkdirSync(path.join(tempRepoDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempRepoDir, 'tests'), { recursive: true });

    fs.writeFileSync(path.join(tempRepoDir, 'src', 'app.ts'), 'export const a = 1;', 'utf-8');
    fs.writeFileSync(
      path.join(tempRepoDir, 'src', 'auth.ts'),
      'export const auth = true;',
      'utf-8',
    );
    fs.writeFileSync(path.join(tempRepoDir, 'tests', 'auth.test.ts'), 'import "./auth";', 'utf-8');
  });

  after(async () => {
    try {
      fs.rmSync(tempRepoDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
    await closeDatabaseManager();
  });

  it('should capture baseline snapshot, detect changes after source modification, and cascade delete on project deletion', async () => {
    const prisma = getPrismaClient();
    assert.ok(prisma, 'Prisma client must be initialized');

    // 1. Create Project & Attach Source
    const project = await projectService.createProject({
      name: 'Snapshot Integration Project',
    });
    const attachResult = await sourceService.attachLocalDirectory(project.id, tempRepoDir);
    const sourceId = attachResult.id;

    // 2. Build initial repository index
    await indexService.refreshIndex(project.id);

    // 3. Create Baseline Snapshot A
    const snapshotA = await snapshotService.createSnapshot(project.id, {
      projectId: project.id,
      label: 'Baseline A',
    });
    assert.strictEqual(snapshotA.fileCount, 3);
    assert.strictEqual(snapshotA.isBaseline, true);

    // 4. Initial changes check (should be 0 changes)
    const initialChanges = await changeService.getChanges(project.id);
    assert.ok(initialChanges);
    assert.strictEqual(initialChanges.totalChanges, 0);
    assert.strictEqual(initialChanges.unchangedCount, 3);

    // 5. Mutate repository files:
    // - Modify src/auth.ts
    // - Add tests/login.test.ts
    // - Delete tests/auth.test.ts
    // - Rename src/app.ts -> src/main.ts (same exact content)
    fs.writeFileSync(
      path.join(tempRepoDir, 'src', 'auth.ts'),
      'export const auth = "v2 modified";',
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tempRepoDir, 'tests', 'login.test.ts'),
      'export const login = true;',
      'utf-8',
    );
    fs.unlinkSync(path.join(tempRepoDir, 'tests', 'auth.test.ts'));
    fs.unlinkSync(path.join(tempRepoDir, 'src', 'app.ts'));
    fs.writeFileSync(path.join(tempRepoDir, 'src', 'main.ts'), 'export const a = 1;', 'utf-8');

    // 6. Refresh structure and re-index repository
    const structureService = new SourceStructureService();
    const classificationService = new ClassificationProfileService();
    await structureService.refreshStructure(project.id);
    await classificationService.refreshClassificationProfile(project.id);
    await indexService.refreshIndex(project.id);

    // 7. Refresh Change Set
    const changeSet = await changeService.refreshChanges(project.id);
    assert.ok(changeSet);
    assert.strictEqual(changeSet.modifiedCount, 1, 'src/auth.ts modified');
    assert.strictEqual(changeSet.addedCount, 1, 'tests/login.test.ts added');
    assert.strictEqual(changeSet.deletedCount, 1, 'tests/auth.test.ts deleted');
    assert.strictEqual(changeSet.renamedCount, 1, 'src/app.ts -> src/main.ts renamed');
    assert.strictEqual(changeSet.totalChanges, 4);

    // 8. Delete project and verify cascade delete of snapshots and snapshot files
    await projectService.archiveProject(project.id);
    await projectService.deleteProject(project.id);

    const remainingSnapshots = await prisma.repositorySnapshot.count({
      where: { sourceId },
    });
    assert.strictEqual(remainingSnapshots, 0, 'Snapshots must cascade delete');
  });
});
