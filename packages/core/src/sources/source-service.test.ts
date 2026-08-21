import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
  Project as PrismaProject,
  ProjectSource as PrismaProjectSource,
} from '@prisma/client';
import { SourceService } from './source-service.js';
import { SourceRepository } from './source-repository.js';
import { ProjectRepository } from '../projects/project-repository.js';
import { ProjectNotFoundError, ProjectArchivedError } from '../projects/project-errors.js';
import { SourceNotFoundError } from './source-errors.js';

describe('SourceService Unit Tests', () => {
  let tempDir: string;
  let testFolder: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-service-test-'));
    testFolder = path.join(tempDir, 'sample-source-dir');
    fs.mkdirSync(testFolder, { recursive: true });
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
  }) {
    let currentSource = opts?.source ?? null;

    const mockProjectRepo = {
      getProjectById: async (id: string): Promise<PrismaProject | null> => {
        if (opts?.project) return opts.project;
        if (opts?.project === null) return null;
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
        return currentSource;
      },
      upsertSource: async (
        projectId: string,
        data: {
          kind: 'LOCAL_DIRECTORY';
          displayName: string;
          rootPath: string;
          identityFingerprint?: string | null;
          filesystemCreatedAt?: Date | null;
          filesystemModifiedAt?: Date | null;
          metadataRefreshedAt?: Date | null;
          lastValidatedAt?: Date | null;
        },
      ): Promise<PrismaProjectSource> => {
        currentSource = {
          id: 'source-uuid-1',
          projectId,
          kind: data.kind,
          displayName: data.displayName,
          rootPath: data.rootPath,
          identityFingerprint: data.identityFingerprint ?? null,
          activeBaselineSnapshotId: null,
          filesystemCreatedAt: data.filesystemCreatedAt ?? null,
          filesystemModifiedAt: data.filesystemModifiedAt ?? null,
          metadataRefreshedAt: data.metadataRefreshedAt ?? new Date(),
          lastValidatedAt: data.lastValidatedAt ?? new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return currentSource;
      },
      updateSourceMetadata: async (
        _projectId: string,
        data: {
          identityFingerprint?: string | null;
          filesystemCreatedAt?: Date | null;
          filesystemModifiedAt?: Date | null;
          metadataRefreshedAt?: Date | null;
          lastValidatedAt?: Date | null;
        },
      ): Promise<PrismaProjectSource | null> => {
        if (currentSource) {
          currentSource = {
            ...currentSource,
            ...(data.identityFingerprint !== undefined && {
              identityFingerprint: data.identityFingerprint,
            }),
            ...(data.filesystemCreatedAt !== undefined && {
              filesystemCreatedAt: data.filesystemCreatedAt,
            }),
            ...(data.filesystemModifiedAt !== undefined && {
              filesystemModifiedAt: data.filesystemModifiedAt,
            }),
            ...(data.metadataRefreshedAt !== undefined && {
              metadataRefreshedAt: data.metadataRefreshedAt,
            }),
            ...(data.lastValidatedAt !== undefined && {
              lastValidatedAt: data.lastValidatedAt,
            }),
          };
        }
        return currentSource;
      },
      deleteSourceByProjectId: async (_projectId: string): Promise<PrismaProjectSource | null> => {
        const prev = currentSource;
        currentSource = null;
        return prev;
      },
      updateLastValidatedAt: async (
        _projectId: string,
        lastValidatedAt: Date,
      ): Promise<PrismaProjectSource | null> => {
        if (currentSource) {
          currentSource = { ...currentSource, lastValidatedAt };
        }
        return currentSource;
      },
    } as unknown as SourceRepository;

    return { mockSourceRepo, mockProjectRepo };
  }

  it('should return null when getSource is called on a project with no attached source', async () => {
    const { mockSourceRepo, mockProjectRepo } = createMockRepositories();
    const service = new SourceService(mockSourceRepo, mockProjectRepo);

    const result = await service.getSource('project-1');
    assert.strictEqual(result, null);
  });

  it('should throw ProjectNotFoundError if project does not exist', async () => {
    const { mockSourceRepo, mockProjectRepo } = createMockRepositories({ project: null });
    const service = new SourceService(mockSourceRepo, mockProjectRepo);

    await assert.rejects(async () => await service.getSource('missing-id'), ProjectNotFoundError);
  });

  it('should reject attachLocalDirectory on an ARCHIVED project', async () => {
    const { mockSourceRepo, mockProjectRepo } = createMockRepositories({
      project: {
        id: 'archived-id',
        name: 'Archived Project',
        description: null,
        status: 'ARCHIVED',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const service = new SourceService(mockSourceRepo, mockProjectRepo);

    await assert.rejects(
      async () => await service.attachLocalDirectory('archived-id', testFolder),
      ProjectArchivedError,
    );
  });

  it('should attach a valid local directory to an ACTIVE project and derive identity fingerprint', async () => {
    const { mockSourceRepo, mockProjectRepo } = createMockRepositories();
    const service = new SourceService(mockSourceRepo, mockProjectRepo);

    const result = await service.attachLocalDirectory('project-1', testFolder);
    assert.strictEqual(result.kind, 'LOCAL_DIRECTORY');
    assert.strictEqual(result.displayName, 'sample-source-dir');
    assert.strictEqual(result.availability, 'AVAILABLE');
    assert.strictEqual(result.rootPath, fs.realpathSync(testFolder));
    assert.ok(result.identityFingerprint !== null);
    assert.strictEqual(result.identityFingerprint?.length, 64);
    assert.ok(result.metadataRefreshedAt !== null);
  });

  it('should refresh metadata and update timestamps on an active project', async () => {
    const initialSource: PrismaProjectSource = {
      id: 'src-1',
      projectId: 'proj-1',
      kind: 'LOCAL_DIRECTORY',
      displayName: 'sample-source-dir',
      rootPath: testFolder,
      identityFingerprint: 'initial-fingerprint',
      activeBaselineSnapshotId: null,
      filesystemCreatedAt: new Date(),
      filesystemModifiedAt: new Date(),
      metadataRefreshedAt: new Date(Date.now() - 60000),
      lastValidatedAt: new Date(Date.now() - 60000),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { mockSourceRepo, mockProjectRepo } = createMockRepositories({ source: initialSource });
    const service = new SourceService(mockSourceRepo, mockProjectRepo);

    const refreshed = await service.refreshMetadata('proj-1');
    assert.strictEqual(refreshed.availability, 'AVAILABLE');
    assert.strictEqual(refreshed.displayName, 'sample-source-dir');
    assert.ok(refreshed.identityFingerprint !== null);
  });

  it('should reject refreshMetadata on an ARCHIVED project', async () => {
    const { mockSourceRepo, mockProjectRepo } = createMockRepositories({
      project: {
        id: 'archived-id',
        name: 'Archived Project',
        description: null,
        status: 'ARCHIVED',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const service = new SourceService(mockSourceRepo, mockProjectRepo);

    await assert.rejects(
      async () => await service.refreshMetadata('archived-id'),
      ProjectArchivedError,
    );
  });

  it('should reject detachSource on an ARCHIVED project', async () => {
    const { mockSourceRepo, mockProjectRepo } = createMockRepositories({
      project: {
        id: 'archived-id',
        name: 'Archived Project',
        description: null,
        status: 'ARCHIVED',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const service = new SourceService(mockSourceRepo, mockProjectRepo);

    await assert.rejects(
      async () => await service.detachSource('archived-id'),
      ProjectArchivedError,
    );
  });

  it('should throw SourceNotFoundError if detaching a project with no source attached', async () => {
    const { mockSourceRepo, mockProjectRepo } = createMockRepositories({ source: null });
    const service = new SourceService(mockSourceRepo, mockProjectRepo);

    await assert.rejects(async () => await service.detachSource('project-1'), SourceNotFoundError);
  });

  it('should successfully detach an attached source', async () => {
    const initialSource: PrismaProjectSource = {
      id: 'src-1',
      projectId: 'proj-1',
      kind: 'LOCAL_DIRECTORY',
      displayName: 'sample-source-dir',
      rootPath: testFolder,
      identityFingerprint: 'dummy',
      activeBaselineSnapshotId: null,
      filesystemCreatedAt: null,
      filesystemModifiedAt: null,
      metadataRefreshedAt: null,
      lastValidatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { mockSourceRepo, mockProjectRepo } = createMockRepositories({ source: initialSource });
    const service = new SourceService(mockSourceRepo, mockProjectRepo);

    const detachResult = await service.detachSource('proj-1');
    assert.strictEqual(detachResult.detached, true);

    const after = await service.getSource('proj-1');
    assert.strictEqual(after, null);
  });

  it('should validate and report availability correctly', async () => {
    const initialSource: PrismaProjectSource = {
      id: 'src-1',
      projectId: 'proj-1',
      kind: 'LOCAL_DIRECTORY',
      displayName: 'sample-source-dir',
      rootPath: testFolder,
      identityFingerprint: null,
      activeBaselineSnapshotId: null,
      filesystemCreatedAt: null,
      filesystemModifiedAt: null,
      metadataRefreshedAt: null,
      lastValidatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { mockSourceRepo, mockProjectRepo } = createMockRepositories({ source: initialSource });
    const service = new SourceService(mockSourceRepo, mockProjectRepo);

    const validated = await service.validateSource('proj-1');
    assert.strictEqual(validated.availability, 'AVAILABLE');
    assert.ok(validated.lastValidatedAt !== null);
  });

  it('should report UNAVAILABLE when attached directory path has been deleted or moved', async () => {
    const missingFolder = path.join(tempDir, 'deleted-folder');
    const initialSource: PrismaProjectSource = {
      id: 'src-1',
      projectId: 'proj-1',
      kind: 'LOCAL_DIRECTORY',
      displayName: 'deleted-folder',
      rootPath: missingFolder,
      identityFingerprint: 'prev-fingerprint',
      activeBaselineSnapshotId: null,
      filesystemCreatedAt: null,
      filesystemModifiedAt: null,
      metadataRefreshedAt: null,
      lastValidatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { mockSourceRepo, mockProjectRepo } = createMockRepositories({ source: initialSource });
    const service = new SourceService(mockSourceRepo, mockProjectRepo);

    const validated = await service.validateSource('proj-1');
    assert.strictEqual(validated.availability, 'UNAVAILABLE');
    assert.strictEqual(validated.identityFingerprint, 'prev-fingerprint');
  });
});
