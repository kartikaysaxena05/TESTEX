import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ClassificationProfileService } from './classification-profile-service.js';
import type { SourceRepository } from '../source-repository.js';
import type { ProjectRepository } from '../../projects/project-repository.js';
import type { SourceStructureService } from '../structure/source-structure-service.js';
import type { SourceStructureDto } from '@ai-quality/contracts';

describe('ClassificationProfileService Unit Tests', () => {
  const dummyStructure: SourceStructureDto = {
    sourceId: 'src-123',
    rootName: 'fullstack-app',
    entries: [
      { relativePath: 'src/app.ts', name: 'app.ts', kind: 'FILE', depth: 2 },
      { relativePath: 'src/user.service.ts', name: 'user.service.ts', kind: 'FILE', depth: 2 },
      { relativePath: 'tests/app.test.ts', name: 'app.test.ts', kind: 'FILE', depth: 2 },
      { relativePath: 'package.json', name: 'package.json', kind: 'FILE', depth: 1 },
      { relativePath: 'vite.config.ts', name: 'vite.config.ts', kind: 'FILE', depth: 1 },
      { relativePath: 'README.md', name: 'README.md', kind: 'FILE', depth: 1 },
      { relativePath: 'public/logo.png', name: 'logo.png', kind: 'FILE', depth: 2 },
      {
        relativePath: 'prisma/migrations/001/migration.sql',
        name: 'migration.sql',
        kind: 'FILE',
        depth: 4,
      },
      { relativePath: 'scripts/deploy.sh', name: 'deploy.sh', kind: 'FILE', depth: 2 },
      { relativePath: 'src/components', name: 'components', kind: 'DIRECTORY', depth: 2 },
    ],
    summary: {
      filesDiscovered: 9,
      directoriesDiscovered: 1,
      symlinksDiscovered: 0,
      totalDiscovered: 10,
      includedFiles: 9,
      includedDirectories: 1,
      totalIncluded: 10,
      ignoredEntries: 0,
      safetyExcludedEntries: 0,
      earlyPrunedDirectories: 0,
      ignoreFilesLoaded: 0,
      ignoreRulesLoaded: 0,
      warnings: [],
    },
    truncated: false,
    truncationReason: null,
    scannedAt: new Date().toISOString(),
  };

  const mockProjectRepo = {
    getProjectById: async (id: string) => {
      if (id === 'proj-archived') {
        return { id, name: 'Archived', status: 'ARCHIVED' };
      }
      if (id === 'proj-active') {
        return { id, name: 'Active', status: 'ACTIVE' };
      }
      if (id === 'proj-no-source') {
        return { id, name: 'No Source', status: 'ACTIVE' };
      }
      return null;
    },
  } as unknown as ProjectRepository;

  const mockSourceRepo = {
    getSourceByProjectId: async (projectId: string) => {
      if (projectId === 'proj-active' || projectId === 'proj-archived') {
        return {
          id: 'src-123',
          projectId,
          kind: 'LOCAL_DIRECTORY',
          displayName: 'fullstack-app',
          rootPath: '/path/to/repo',
        };
      }
      return null;
    },
  } as unknown as SourceRepository;

  const mockStructureService = {
    getSourceStructure: async (_projectId: string) => dummyStructure,
  } as unknown as SourceStructureService;

  it('should accurately classify files and calculate category summaries', async () => {
    const service = new ClassificationProfileService(
      mockSourceRepo,
      mockProjectRepo,
      mockStructureService,
    );

    const profile = await service.refreshClassificationProfile('proj-active');

    assert.strictEqual(profile.sourceId, 'src-123');
    assert.strictEqual(profile.summary.totalFiles, 9);
    assert.strictEqual(profile.summary.sourceFiles, 2); // src/app.ts, src/user.service.ts
    assert.strictEqual(profile.summary.testFiles, 1); // tests/app.test.ts
    assert.strictEqual(profile.summary.configurationFiles, 1); // package.json
    assert.strictEqual(profile.summary.buildToolingFiles, 1); // vite.config.ts
    assert.strictEqual(profile.summary.documentationFiles, 1); // README.md
    assert.strictEqual(profile.summary.assetFiles, 1); // public/logo.png
    assert.strictEqual(profile.summary.migrationFiles, 1); // prisma/migrations/001/migration.sql
    assert.strictEqual(profile.summary.scriptFiles, 1); // scripts/deploy.sh
    assert.strictEqual(profile.summary.unknownFiles, 0);

    const sum =
      profile.summary.sourceFiles +
      profile.summary.testFiles +
      profile.summary.configurationFiles +
      profile.summary.buildToolingFiles +
      profile.summary.documentationFiles +
      profile.summary.assetFiles +
      profile.summary.databaseFiles +
      profile.summary.migrationFiles +
      profile.summary.generatedFiles +
      profile.summary.scriptFiles +
      profile.summary.templateFiles +
      profile.summary.unknownFiles;

    assert.strictEqual(sum, profile.summary.totalFiles);
  });

  it('should return null when getClassificationProfile is called on project with no source', async () => {
    const service = new ClassificationProfileService(
      mockSourceRepo,
      mockProjectRepo,
      mockStructureService,
    );

    const profile = await service.getClassificationProfile('proj-no-source');
    assert.strictEqual(profile, null);
  });

  it('should throw ProjectNotFoundError when project does not exist', async () => {
    const service = new ClassificationProfileService(
      mockSourceRepo,
      mockProjectRepo,
      mockStructureService,
    );

    await assert.rejects(
      async () => {
        await service.getClassificationProfile('non-existent-proj');
      },
      {
        name: 'ProjectNotFoundError',
      },
    );
  });
});
