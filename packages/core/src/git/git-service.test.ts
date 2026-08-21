import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
  Project as PrismaProject,
  ProjectSource as PrismaProjectSource,
  ProjectGitMetadata as PrismaProjectGitMetadata,
} from '@prisma/client';
import { GitService } from './git-service.js';
import { GitRepository, type UpsertGitMetadataData } from './git-repository.js';
import { GitCommandRunner } from './git-command-runner.js';
import { ProjectRepository } from '../projects/project-repository.js';
import { SourceRepository } from '../sources/source-repository.js';
import { ProjectNotFoundError, ProjectArchivedError } from '../projects/project-errors.js';

describe('GitService Unit Tests', () => {
  let tempDir: string;
  let normalRepoDir: string;
  let nonGitDir: string;
  let nestedDir: string;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-service-test-'));
    normalRepoDir = path.join(tempDir, 'normal-repo');
    nonGitDir = path.join(tempDir, 'plain-dir');
    nestedDir = path.join(normalRepoDir, 'packages', 'web-client');

    fs.mkdirSync(normalRepoDir, { recursive: true });
    fs.mkdirSync(nonGitDir, { recursive: true });
    fs.mkdirSync(nestedDir, { recursive: true });

    const runner = new GitCommandRunner();
    await runner.runGit(['-C', normalRepoDir, 'init', '-b', 'main']);
    await runner.runGit(['-C', normalRepoDir, 'config', 'user.name', 'Test User']);
    await runner.runGit(['-C', normalRepoDir, 'config', 'user.email', 'test@example.com']);
    await runner.runGit(['-C', normalRepoDir, 'config', 'commit.gpgSign', 'false']);

    fs.writeFileSync(path.join(normalRepoDir, 'README.md'), '# Repo', 'utf-8');
    await runner.runGit(['-C', normalRepoDir, 'add', 'README.md']);
    await runner.runGit(['-C', normalRepoDir, 'commit', '-m', 'Initial commit']);
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  function createMockRepositories(opts?: {
    project?: PrismaProject | null;
    source?: PrismaProjectSource | null;
    gitMetadata?: PrismaProjectGitMetadata | null;
  }) {
    let currentGit = opts?.gitMetadata ?? null;

    const mockProjectRepo = {
      getProjectById: async (id: string): Promise<PrismaProject | null> => {
        if (opts?.project !== undefined) return opts.project;
        return {
          id,
          name: 'Active Project',
          description: null,
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    } as unknown as ProjectRepository;

    const mockSourceRepo = {
      getSourceByProjectId: async (_projectId: string): Promise<PrismaProjectSource | null> => {
        if (opts?.source !== undefined) return opts.source;
        return {
          id: 'source-111',
          projectId: 'project-111',
          kind: 'LOCAL_DIRECTORY',
          displayName: 'normal-repo',
          rootPath: normalRepoDir,
          identityFingerprint: 'dummy',
          activeBaselineSnapshotId: null,
          filesystemCreatedAt: new Date(),
          filesystemModifiedAt: new Date(),
          metadataRefreshedAt: new Date(),
          lastValidatedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    } as unknown as SourceRepository;

    const mockGitRepo = {
      getGitMetadataBySourceId: async (
        _sourceId: string,
      ): Promise<PrismaProjectGitMetadata | null> => {
        return currentGit;
      },
      upsertGitMetadata: async (
        sourceId: string,
        data: UpsertGitMetadataData,
      ): Promise<PrismaProjectGitMetadata> => {
        currentGit = {
          id: 'git-meta-111',
          sourceId,
          isGitRepository: data.isGitRepository,
          repositoryRoot: data.repositoryRoot ?? null,
          sourceRelationToRepository: data.sourceRelationToRepository ?? 'UNKNOWN',
          currentBranch: data.currentBranch ?? null,
          headCommit: data.headCommit ?? null,
          isDetachedHead: data.isDetachedHead ?? false,
          lastCheckedAt: data.lastCheckedAt ?? new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return currentGit;
      },
      deleteGitMetadataBySourceId: async (
        _sourceId: string,
      ): Promise<PrismaProjectGitMetadata | null> => {
        const prev = currentGit;
        currentGit = null;
        return prev;
      },
    } as unknown as GitRepository;

    return { mockProjectRepo, mockSourceRepo, mockGitRepo };
  }

  it('should return null when getGitStatus is called on project with no attached source', async () => {
    const { mockProjectRepo, mockSourceRepo, mockGitRepo } = createMockRepositories({
      source: null,
    });
    const service = new GitService(mockGitRepo, mockSourceRepo, mockProjectRepo);

    const result = await service.getGitStatus('project-111');
    assert.strictEqual(result, null);
  });

  it('should throw ProjectNotFoundError when project does not exist', async () => {
    const { mockProjectRepo, mockSourceRepo, mockGitRepo } = createMockRepositories({
      project: null,
    });
    const service = new GitService(mockGitRepo, mockSourceRepo, mockProjectRepo);

    await assert.rejects(
      async () => await service.getGitStatus('missing-id'),
      ProjectNotFoundError,
    );
  });

  it('should detect a valid Git repository root, branch, and commit', async () => {
    const { mockProjectRepo, mockSourceRepo, mockGitRepo } = createMockRepositories();
    const service = new GitService(mockGitRepo, mockSourceRepo, mockProjectRepo);

    const status = await service.refreshGitMetadata('project-111');
    assert.strictEqual(status.gitAvailable, true);
    assert.strictEqual(status.isGitRepository, true);
    assert.strictEqual(status.sourceRelationToRepository, 'ROOT');
    assert.strictEqual(status.currentBranch, 'main');
    assert.ok(status.headCommit !== null);
    assert.strictEqual(status.headCommit?.length, 40);
    assert.strictEqual(status.isDetachedHead, false);
  });

  it('should detect a nested source inside a Git repository without altering source path', async () => {
    const sourceRecord: PrismaProjectSource = {
      id: 'source-222',
      projectId: 'project-222',
      kind: 'LOCAL_DIRECTORY',
      displayName: 'web-client',
      rootPath: nestedDir,
      identityFingerprint: 'dummy',
      activeBaselineSnapshotId: null,
      filesystemCreatedAt: new Date(),
      filesystemModifiedAt: new Date(),
      metadataRefreshedAt: new Date(),
      lastValidatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { mockProjectRepo, mockSourceRepo, mockGitRepo } = createMockRepositories({
      source: sourceRecord,
    });
    const service = new GitService(mockGitRepo, mockSourceRepo, mockProjectRepo);

    const status = await service.refreshGitMetadata('project-222');
    assert.strictEqual(status.isGitRepository, true);
    assert.strictEqual(status.sourceRelationToRepository, 'NESTED');
    assert.strictEqual(status.repositoryRoot, fs.realpathSync(normalRepoDir));
  });

  it('should safely identify a non-Git directory without error', async () => {
    const sourceRecord: PrismaProjectSource = {
      id: 'source-333',
      projectId: 'project-333',
      kind: 'LOCAL_DIRECTORY',
      displayName: 'plain-dir',
      rootPath: nonGitDir,
      identityFingerprint: 'dummy',
      activeBaselineSnapshotId: null,
      filesystemCreatedAt: new Date(),
      filesystemModifiedAt: new Date(),
      metadataRefreshedAt: new Date(),
      lastValidatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { mockProjectRepo, mockSourceRepo, mockGitRepo } = createMockRepositories({
      source: sourceRecord,
    });
    const service = new GitService(mockGitRepo, mockSourceRepo, mockProjectRepo);

    const status = await service.refreshGitMetadata('project-333');
    assert.strictEqual(status.gitAvailable, true);
    assert.strictEqual(status.isGitRepository, false);
    assert.strictEqual(status.repositoryRoot, null);
    assert.strictEqual(status.sourceRelationToRepository, 'UNKNOWN');
    assert.strictEqual(status.currentBranch, null);
    assert.strictEqual(status.headCommit, null);
  });

  it('should reject refreshGitMetadata on an ARCHIVED project', async () => {
    const { mockProjectRepo, mockSourceRepo, mockGitRepo } = createMockRepositories({
      project: {
        id: 'archived-id',
        name: 'Archived Project',
        description: null,
        status: 'ARCHIVED',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const service = new GitService(mockGitRepo, mockSourceRepo, mockProjectRepo);

    await assert.rejects(
      async () => await service.refreshGitMetadata('archived-id'),
      ProjectArchivedError,
    );
  });
});
