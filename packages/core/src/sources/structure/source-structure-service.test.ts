import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
  Project as PrismaProject,
  ProjectSource as PrismaProjectSource,
} from '@prisma/client';
import { SourceStructureService } from './source-structure-service.js';
import { SafeDirectoryWalker } from './safe-directory-walker.js';
import { ProjectRepository } from '../../projects/project-repository.js';
import { SourceRepository } from '../source-repository.js';
import { ProjectNotFoundError, ProjectArchivedError } from '../../projects/project-errors.js';
import { SourceNotFoundError } from '../source-errors.js';

describe('SourceStructureService Unit Tests', () => {
  let tempDir: string;
  let sourceDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'struct-service-test-'));
    sourceDir = path.join(tempDir, 'valid-source');
    fs.mkdirSync(path.join(sourceDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, '.gitignore'), 'dist/\n', 'utf-8');
    fs.writeFileSync(path.join(sourceDir, 'src', 'main.ts'), 'export const a = 1;', 'utf-8');
    fs.writeFileSync(path.join(sourceDir, 'dist', 'bundle.js'), 'bundle', 'utf-8');
    fs.writeFileSync(path.join(sourceDir, 'README.md'), '# Doc', 'utf-8');
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
          displayName: 'valid-source',
          rootPath: sourceDir,
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

    return { mockProjectRepo, mockSourceRepo };
  }

  it('should return null when getSourceStructure is called on project with no attached source', async () => {
    const { mockProjectRepo, mockSourceRepo } = createMockRepositories({
      source: null,
    });
    const service = new SourceStructureService(mockSourceRepo, mockProjectRepo);

    const result = await service.getSourceStructure('project-111');
    assert.strictEqual(result, null);
  });

  it('should throw ProjectNotFoundError when project does not exist', async () => {
    const { mockProjectRepo, mockSourceRepo } = createMockRepositories({
      project: null,
    });
    const service = new SourceStructureService(mockSourceRepo, mockProjectRepo);

    await assert.rejects(
      async () => await service.getSourceStructure('missing-id'),
      ProjectNotFoundError,
    );
  });

  it('should discover filtered structure and cache result for active project', async () => {
    const { mockProjectRepo, mockSourceRepo } = createMockRepositories();
    const walker = new SafeDirectoryWalker();
    const service = new SourceStructureService(mockSourceRepo, mockProjectRepo, walker);

    const structure = await service.refreshStructure('project-111');
    assert.strictEqual(structure.sourceId, 'source-111');
    assert.strictEqual(structure.rootName, 'valid-source');
    assert.strictEqual(structure.summary.includedFiles, 3); // .gitignore, README.md, src/main.ts
    assert.strictEqual(structure.summary.includedDirectories, 1); // src
    assert.strictEqual(structure.summary.ignoredEntries, 1); // dist
    assert.strictEqual(structure.summary.ignoreFilesLoaded, 1);
    assert.strictEqual(structure.truncated, false);

    // Subsequent getSourceStructure retrieves from cache
    const cached = await service.getSourceStructure('project-111');
    assert.deepStrictEqual(cached, structure);
  });

  it('should reject refreshStructure on an ARCHIVED project', async () => {
    const { mockProjectRepo, mockSourceRepo } = createMockRepositories({
      project: {
        id: 'archived-id',
        name: 'Archived Project',
        description: null,
        status: 'ARCHIVED',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const service = new SourceStructureService(mockSourceRepo, mockProjectRepo);

    await assert.rejects(
      async () => await service.refreshStructure('archived-id'),
      ProjectArchivedError,
    );
  });

  it('should throw SourceNotFoundError if refreshing a project with no source attached', async () => {
    const { mockProjectRepo, mockSourceRepo } = createMockRepositories({
      source: null,
    });
    const service = new SourceStructureService(mockSourceRepo, mockProjectRepo);

    await assert.rejects(
      async () => await service.refreshStructure('project-111'),
      SourceNotFoundError,
    );
  });

  it('should return empty structure when source path is unavailable on disk', async () => {
    const unavailableSource: PrismaProjectSource = {
      id: 'source-unavail',
      projectId: 'project-unavail',
      kind: 'LOCAL_DIRECTORY',
      displayName: 'missing-folder',
      rootPath: path.join(tempDir, 'deleted-folder'),
      identityFingerprint: null,
      activeBaselineSnapshotId: null,
      filesystemCreatedAt: null,
      filesystemModifiedAt: null,
      metadataRefreshedAt: null,
      lastValidatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { mockProjectRepo, mockSourceRepo } = createMockRepositories({
      source: unavailableSource,
    });
    const service = new SourceStructureService(mockSourceRepo, mockProjectRepo);

    const result = await service.refreshStructure('project-unavail');
    assert.strictEqual(result.summary.totalIncluded, 0);
    assert.strictEqual(result.entries.length, 0);
  });
});
