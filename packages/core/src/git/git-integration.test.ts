import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getPrismaClient } from '../database/client.js';
import { closeDatabaseManager } from '../database/database.js';
import { ProjectRepository } from '../projects/project-repository.js';
import { ProjectService } from '../projects/project-service.js';
import { SourceRepository } from '../sources/source-repository.js';
import { SourceService } from '../sources/source-service.js';
import { GitRepository } from './git-repository.js';
import { GitService } from './git-service.js';
import { GitCommandRunner } from './git-command-runner.js';

describe('ProjectGitMetadata Relational PostgreSQL Integration Tests', () => {
  let projectService: ProjectService;
  let sourceService: SourceService;
  let gitService: GitService;
  let gitRunner: GitCommandRunner;
  let tempDir: string;
  let gitRepoDir: string;
  let emptyGitDir: string;
  let nonGitDir: string;
  const createdProjectIds: string[] = [];

  before(async () => {
    const projectRepo = new ProjectRepository();
    const sourceRepo = new SourceRepository();
    const gitRepo = new GitRepository();
    gitRunner = new GitCommandRunner();

    projectService = new ProjectService(projectRepo);
    sourceService = new SourceService(sourceRepo, projectRepo);
    gitService = new GitService(gitRepo, sourceRepo, projectRepo, gitRunner);

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-pg-integration-'));
    gitRepoDir = path.join(tempDir, 'sample-git-repo');
    emptyGitDir = path.join(tempDir, 'empty-git-repo');
    nonGitDir = path.join(tempDir, 'non-git-dir');

    fs.mkdirSync(gitRepoDir, { recursive: true });
    fs.mkdirSync(emptyGitDir, { recursive: true });
    fs.mkdirSync(nonGitDir, { recursive: true });

    // Normal Git repo with commit
    await gitRunner.runGit(['-C', gitRepoDir, 'init', '-b', 'main']);
    await gitRunner.runGit(['-C', gitRepoDir, 'config', 'user.name', 'Integration Test']);
    await gitRunner.runGit(['-C', gitRepoDir, 'config', 'user.email', 'test@integration.com']);
    await gitRunner.runGit(['-C', gitRepoDir, 'config', 'commit.gpgSign', 'false']);
    fs.writeFileSync(path.join(gitRepoDir, 'app.js'), 'console.log("App");', 'utf-8');
    await gitRunner.runGit(['-C', gitRepoDir, 'add', 'app.js']);
    await gitRunner.runGit(['-C', gitRepoDir, 'commit', '-m', 'Initial commit']);

    // Empty Git repo (0 commits)
    await gitRunner.runGit(['-C', emptyGitDir, 'init', '-b', 'main']);
  });

  after(async () => {
    try {
      const prisma = getPrismaClient();
      if (prisma && createdProjectIds.length > 0) {
        await prisma.project.deleteMany({
          where: { id: { in: createdProjectIds } },
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

  it('should persist and retrieve Git metadata for an attached Git repository in PostgreSQL', async () => {
    const project = await projectService.createProject({
      name: 'Git Integration Test Project 1',
    });
    createdProjectIds.push(project.id);

    const source = await sourceService.attachLocalDirectory(project.id, gitRepoDir);
    const gitStatus = await gitService.refreshGitMetadata(project.id);

    assert.strictEqual(gitStatus.isGitRepository, true);
    assert.strictEqual(gitStatus.sourceRelationToRepository, 'ROOT');
    assert.strictEqual(gitStatus.currentBranch, 'main');
    assert.ok(gitStatus.headCommit !== null);
    assert.strictEqual(gitStatus.isDetachedHead, false);

    // Verify record in PostgreSQL directly
    const prisma = getPrismaClient();
    assert.ok(prisma);
    const dbRecord = await prisma.projectGitMetadata.findUnique({
      where: { sourceId: source.id },
    });

    assert.ok(dbRecord);
    assert.strictEqual(dbRecord.isGitRepository, true);
    assert.strictEqual(dbRecord.currentBranch, 'main');
    assert.strictEqual(dbRecord.headCommit, gitStatus.headCommit);
  });

  it('should handle an empty Git repository (0 commits) gracefully', async () => {
    const project = await projectService.createProject({
      name: 'Git Integration Test Project Empty Repo',
    });
    createdProjectIds.push(project.id);

    await sourceService.attachLocalDirectory(project.id, emptyGitDir);
    const gitStatus = await gitService.refreshGitMetadata(project.id);

    assert.strictEqual(gitStatus.isGitRepository, true);
    assert.strictEqual(gitStatus.sourceRelationToRepository, 'ROOT');
    assert.strictEqual(gitStatus.headCommit, null); // Unborn HEAD
    assert.strictEqual(gitStatus.isDetachedHead, false);
  });

  it('should handle non-Git folder and persist isGitRepository = false', async () => {
    const project = await projectService.createProject({
      name: 'Git Integration Test Project Non-Git',
    });
    createdProjectIds.push(project.id);

    const source = await sourceService.attachLocalDirectory(project.id, nonGitDir);
    const gitStatus = await gitService.refreshGitMetadata(project.id);

    assert.strictEqual(gitStatus.isGitRepository, false);
    assert.strictEqual(gitStatus.repositoryRoot, null);
    assert.strictEqual(gitStatus.currentBranch, null);

    const prisma = getPrismaClient();
    assert.ok(prisma);
    const dbRecord = await prisma.projectGitMetadata.findUnique({
      where: { sourceId: source.id },
    });
    assert.ok(dbRecord);
    assert.strictEqual(dbRecord.isGitRepository, false);
  });

  it('should cascade delete ProjectGitMetadata when source is detached, keeping filesystem intact', async () => {
    const project = await projectService.createProject({
      name: 'Git Integration Test Project Detach',
    });
    createdProjectIds.push(project.id);

    const source = await sourceService.attachLocalDirectory(project.id, gitRepoDir);
    await gitService.refreshGitMetadata(project.id);

    // Detach source
    await sourceService.detachSource(project.id);

    const prisma = getPrismaClient();
    assert.ok(prisma);
    const gitRecord = await prisma.projectGitMetadata.findUnique({
      where: { sourceId: source.id },
    });
    assert.strictEqual(gitRecord, null, 'Git metadata must cascade delete on source detachment');

    // Verify git directory on disk was NOT deleted or modified
    assert.strictEqual(fs.existsSync(path.join(gitRepoDir, 'app.js')), true);
  });
});
