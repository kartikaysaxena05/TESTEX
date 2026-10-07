import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  Project as PrismaProject,
  ProjectSource as PrismaProjectSource,
} from '@prisma/client';
import type { SourceStructureDto } from '@ai-quality/contracts';
import { TechnologyProfileService } from './technology-profile-service.js';
import { SourceStructureService } from '../structure/source-structure-service.js';
import { ProjectRepository } from '../../projects/project-repository.js';
import { SourceRepository } from '../source-repository.js';
import { ProjectNotFoundError, ProjectArchivedError } from '../../projects/project-errors.js';
import { SourceNotFoundError } from '../source-errors.js';

describe('TechnologyProfileService Unit Tests', () => {
  const dummyStructure: SourceStructureDto = {
    sourceId: 'src-123',
    rootName: 'fullstack-app',
    entries: [
      { relativePath: 'package.json', name: 'package.json', kind: 'FILE', depth: 1 },
      { relativePath: 'Dockerfile', name: 'Dockerfile', kind: 'FILE', depth: 1 },
      { relativePath: 'src/app.ts', name: 'app.ts', kind: 'FILE', depth: 2 },
      { relativePath: 'src/components/Card.tsx', name: 'Card.tsx', kind: 'FILE', depth: 3 },
      { relativePath: 'styles/theme.css', name: 'theme.css', kind: 'FILE', depth: 2 },
      { relativePath: 'db/schema.sql', name: 'schema.sql', kind: 'FILE', depth: 2 },
    ],
    summary: {
      filesDiscovered: 6,
      directoriesDiscovered: 3,
      symlinksDiscovered: 0,
      totalDiscovered: 9,
      includedFiles: 6,
      includedDirectories: 3,
      totalIncluded: 9,
      ignoredEntries: 2,
      safetyExcludedEntries: 1,
      earlyPrunedDirectories: 1,
      ignoreFilesLoaded: 1,
      ignoreRulesLoaded: 3,
      warnings: [],
    },
    truncated: false,
    truncationReason: null,
    scannedAt: new Date().toISOString(),
  };

  function createMockRepositories(opts?: {
    project?: PrismaProject | null;
    source?: PrismaProjectSource | null;
    structure?: SourceStructureDto | null;
  }) {
    const mockProjectRepo = {
      getProjectById: async (id: string): Promise<PrismaProject | null> => {
        if (opts?.project !== undefined) return opts.project;
        return {
          id,
          name: 'Active Project',
          description: null,
          status: 'ACTIVE',
          userId: null,
          lastOpenedAt: null,
          archivedAt: null,
          deletedAt: null,
          isFavorite: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    } as unknown as ProjectRepository;

    const mockSourceRepo = {
      getSourceByProjectId: async (_projectId: string): Promise<PrismaProjectSource | null> => {
        if (opts?.source !== undefined) return opts.source;
        return {
          id: 'src-123',
          projectId: 'proj-123',
          kind: 'LOCAL_DIRECTORY',
          displayName: 'fullstack-app',
          rootPath: '/Users/test/workspace/fullstack-app',
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

    const mockStructureService = {
      getSourceStructure: async () => {
        if (opts?.structure !== undefined) return opts.structure;
        return dummyStructure;
      },
    } as unknown as SourceStructureService;

    return { mockProjectRepo, mockSourceRepo, mockStructureService };
  }

  it('should analyze technology profile from filtered structure accurately', async () => {
    const { mockProjectRepo, mockSourceRepo, mockStructureService } = createMockRepositories();
    const service = new TechnologyProfileService(
      mockSourceRepo,
      mockProjectRepo,
      mockStructureService,
    );

    const profile = await service.refreshTechnologyProfile('proj-123');

    assert.strictEqual(profile.sourceId, 'src-123');
    assert.strictEqual(profile.dominantLanguage, 'TypeScript');
    assert.strictEqual(profile.totalIncludedFiles, 6);
    assert.strictEqual(profile.totalLanguageFiles, 6);

    const ts = profile.detectedLanguages.find(l => l.language === 'TypeScript');
    assert.ok(ts);
    assert.strictEqual(ts.fileCount, 2);

    const nodeSignal = profile.technologySignals.find(s => s.technology === 'Node.js Ecosystem');
    assert.ok(nodeSignal);
    assert.strictEqual(nodeSignal.confidence, 'HIGH');

    const dockerSignal = profile.technologySignals.find(s => s.technology === 'Docker');
    assert.ok(dockerSignal);
    assert.strictEqual(dockerSignal.confidence, 'HIGH');

    // Test caching
    const cached = await service.getTechnologyProfile('proj-123');
    assert.deepStrictEqual(cached, profile);
  });

  it('should return null when getTechnologyProfile is called on project with no attached source', async () => {
    const { mockProjectRepo, mockSourceRepo, mockStructureService } = createMockRepositories({
      source: null,
    });
    const service = new TechnologyProfileService(
      mockSourceRepo,
      mockProjectRepo,
      mockStructureService,
    );

    const result = await service.getTechnologyProfile('proj-123');
    assert.strictEqual(result, null);
  });

  it('should throw ProjectNotFoundError when project does not exist', async () => {
    const { mockProjectRepo, mockSourceRepo, mockStructureService } = createMockRepositories({
      project: null,
    });
    const service = new TechnologyProfileService(
      mockSourceRepo,
      mockProjectRepo,
      mockStructureService,
    );

    await assert.rejects(
      async () => await service.getTechnologyProfile('missing-id'),
      ProjectNotFoundError,
    );
  });

  it('should reject refreshTechnologyProfile on an ARCHIVED project', async () => {
    const { mockProjectRepo, mockSourceRepo, mockStructureService } = createMockRepositories({
      project: {
        id: 'archived-id',
        name: 'Archived Project',
        description: null,
        status: 'ARCHIVED',
        userId: null,
        lastOpenedAt: null,
        archivedAt: null,
        deletedAt: null,
        isFavorite: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const service = new TechnologyProfileService(
      mockSourceRepo,
      mockProjectRepo,
      mockStructureService,
    );

    await assert.rejects(
      async () => await service.refreshTechnologyProfile('archived-id'),
      ProjectArchivedError,
    );
  });

  it('should throw SourceNotFoundError if refreshing on a project with no source attached', async () => {
    const { mockProjectRepo, mockSourceRepo, mockStructureService } = createMockRepositories({
      source: null,
    });
    const service = new TechnologyProfileService(
      mockSourceRepo,
      mockProjectRepo,
      mockStructureService,
    );

    await assert.rejects(
      async () => await service.refreshTechnologyProfile('proj-123'),
      SourceNotFoundError,
    );
  });
});
