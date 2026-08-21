import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotService } from './snapshot-service.js';
import type { SnapshotRepository } from './snapshot-repository.js';
import type { SourceRepository } from '../source-repository.js';
import type { ProjectRepository } from '../../projects/project-repository.js';
import type { RepositoryIndexRepository } from '../indexing/repository-index-repository.js';
import type { GitService } from '../../git/git-service.js';

import type { ArchitectureRepository } from '../architecture/architecture-repository.js';

describe('SnapshotService Unit Tests', () => {
  const mockProjectRepo = {
    getProjectById: async (id: string) => {
      if (id === 'proj-archived') return { id, name: 'Archived', status: 'ARCHIVED' };
      if (id === 'proj-active') return { id, name: 'Active', status: 'ACTIVE' };
      return null;
    },
  } as unknown as ProjectRepository;

  const mockSourceRepo = {
    getSourceByProjectId: async (projectId: string) => {
      if (projectId === 'proj-active') {
        return {
          id: 'src-1',
          projectId,
          kind: 'LOCAL_DIRECTORY',
          displayName: 'app',
          rootPath: '/tmp/repo',
          activeBaselineSnapshotId: null,
        };
      }
      return null;
    },
  } as unknown as SourceRepository;

  it('should reject snapshot creation if repository index is incomplete or running', async () => {
    const mockIndexRepo = {
      getLatestIndexRun: async () => ({ id: 'run-1', sourceId: 'src-1', status: 'RUNNING' }),
    } as unknown as RepositoryIndexRepository;

    const service = new SnapshotService(
      {} as SnapshotRepository,
      mockSourceRepo,
      mockProjectRepo,
      mockIndexRepo,
      {} as ArchitectureRepository,
      {} as GitService,
    );

    await assert.rejects(
      async () => {
        await service.createSnapshot('proj-active');
      },
      {
        name: 'ProjectValidationError',
        message: /Cannot create baseline snapshot without a completed repository index run/,
      },
    );
  });

  it('should capture snapshot and auto-set active baseline on first snapshot', async () => {
    const mockIndexRepo = {
      getLatestIndexRun: async () => ({ id: 'run-1', sourceId: 'src-1', status: 'COMPLETED' }),
      listFiles: async () => ({
        items: [
          {
            relativePath: 'src/main.ts',
            contentHash: 'hash1',
            classification: 'SOURCE',
            language: 'TypeScript',
            sizeBytes: 100,
          },
          {
            relativePath: 'tests/main.test.ts',
            contentHash: 'hash2',
            classification: 'TEST',
            language: 'TypeScript',
            sizeBytes: 80,
          },
        ],
        total: 2,
        page: 1,
        pageSize: 100,
        totalPages: 1,
      }),
    } as unknown as RepositoryIndexRepository;

    const mockArchRepo = {
      getIndexedDataForSource: async () => ({
        files: [
          {
            relativePath: 'src/main.ts',
            contentHash: 'hash1',
            classification: 'SOURCE',
            language: 'TypeScript',
            sizeBytes: 100,
          },
          {
            relativePath: 'tests/main.test.ts',
            contentHash: 'hash2',
            classification: 'TEST',
            language: 'TypeScript',
            sizeBytes: 80,
          },
        ],
        importEdges: [],
      }),
    } as unknown as ArchitectureRepository;

    let activeBaselineSet: string | null = null;
    const mockSnapshotRepo = {
      createSnapshotWithFiles: async (_sourceId: string, header: Record<string, unknown>) => ({
        id: 'snap-1',
        sourceId: 'src-1',
        indexRunId: 'run-1',
        label: header.label,
        kind: 'MANUAL_BASELINE',
        status: 'COMPLETE',
        snapshotVersion: 1,
        fingerprint: header.fingerprint,
        fileCount: 2,
        sourceFileCount: 1,
        testFileCount: 1,
        gitHeadCommit: null,
        gitBranch: null,
        createdAt: new Date(),
      }),
      setActiveBaseline: async (_sourceId: string, snapId: string) => {
        activeBaselineSet = snapId;
      },
    } as unknown as SnapshotRepository;

    const service = new SnapshotService(
      mockSnapshotRepo,
      mockSourceRepo,
      mockProjectRepo,
      mockIndexRepo,
      mockArchRepo,
      {} as GitService,
    );

    const snapshot = await service.createSnapshot('proj-active', {
      projectId: 'proj-active',
      label: 'Initial Baseline',
    });
    assert.strictEqual(snapshot.id, 'snap-1');
    assert.strictEqual(snapshot.fileCount, 2);
    assert.strictEqual(snapshot.sourceFileCount, 1);
    assert.strictEqual(snapshot.testFileCount, 1);
    assert.strictEqual(activeBaselineSet, 'snap-1', 'Must auto-set as active baseline');
  });
});
