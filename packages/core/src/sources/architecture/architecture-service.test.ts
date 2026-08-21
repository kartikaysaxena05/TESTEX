import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ArchitectureService } from './architecture-service.js';
import type { ArchitectureRepository } from './architecture-repository.js';
import type { SourceRepository } from '../source-repository.js';
import type { ProjectRepository } from '../../projects/project-repository.js';
import type { FrameworkProfileService } from '../frameworks/framework-profile-service.js';
import type { TechnologyProfileService } from '../technology/technology-profile-service.js';
import type { RepositoryIndexRepository } from '../indexing/repository-index-repository.js';
import type {
  FrameworkProfileDto,
  TechnologyProfileDto,
  RepositoryFileDto,
} from '@ai-quality/contracts';

describe('ArchitectureService Unit Tests', () => {
  const tempRootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-service-test-'));

  after(() => {
    fs.rmSync(tempRootPath, { recursive: true, force: true });
  });

  const dummyFiles: RepositoryFileDto[] = [
    {
      id: 'f-1',
      sourceId: 'src-123',
      relativePath: 'src/main.tsx',
      name: 'main.tsx',
      extension: '.tsx',
      language: 'TypeScript',
      classification: 'SOURCE',
      sizeBytes: 100,
      contentHash: 'hash1',
      indexStatus: 'INDEXED',
      symbolCount: 1,
      importCount: 1,
      indexedAt: new Date().toISOString(),
    },
    {
      id: 'f-2',
      sourceId: 'src-123',
      relativePath: 'src/App.tsx',
      name: 'App.tsx',
      extension: '.tsx',
      language: 'TypeScript',
      classification: 'SOURCE',
      sizeBytes: 150,
      contentHash: 'hash2',
      indexStatus: 'INDEXED',
      symbolCount: 2,
      importCount: 1,
      indexedAt: new Date().toISOString(),
    },
  ];

  const dummyFrameworks: FrameworkProfileDto = {
    sourceId: 'src-123',
    primaryEcosystem: 'Node.js',
    packageManager: null,
    manifests: [],
    frameworks: [
      {
        id: 'react',
        name: 'React',
        category: 'UI_LIBRARY',
        confidence: 'HIGH',
        declaredVersion: '^18.0.0',
        resolvedVersion: null,
        evidence: [],
      },
      {
        id: 'vite',
        name: 'Vite',
        category: 'BUILD_TOOL',
        confidence: 'HIGH',
        declaredVersion: '^5.0.0',
        resolvedVersion: null,
        evidence: [],
      },
    ],
    dependencies: [],
    directDependencyCount: 2,
    devDependencyCount: 0,
    analyzedAt: new Date().toISOString(),
    warnings: [],
  };

  const dummyTech: TechnologyProfileDto = {
    sourceId: 'src-123',
    detectedLanguages: [],
    dominantLanguage: 'TypeScript',
    technologySignals: [],
    totalIncludedFiles: 2,
    totalLanguageFiles: 2,
    unknownFiles: 0,
    analyzedAt: new Date().toISOString(),
  };

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
          id: 'src-123',
          projectId,
          kind: 'LOCAL_DIRECTORY',
          displayName: 'sample-app',
          rootPath: tempRootPath,
        };
      }
      return null;
    },
  } as unknown as SourceRepository;

  const mockFrameworkService = {
    getFrameworkProfile: async () => dummyFrameworks,
  } as unknown as FrameworkProfileService;

  const mockTechService = {
    getTechnologyProfile: async () => dummyTech,
  } as unknown as TechnologyProfileService;

  const mockIndexRepo = {
    getLatestIndexRun: async () => ({ id: 'run-123', sourceId: 'src-123', status: 'COMPLETED' }),
  } as unknown as RepositoryIndexRepository;

  it('should analyze and persist architecture profile successfully', async () => {
    let savedAnalysis: Record<string, unknown> | null = null;

    const mockArchRepo = {
      getIndexedDataForSource: async () => ({
        files: dummyFiles,
        importEdges: [{ fromRelativePath: 'src/main.tsx', resolvedRelativePath: 'src/App.tsx' }],
      }),
      upsertAnalysis: async (_sourceId: string, data: Record<string, unknown>) => {
        savedAnalysis = { ...data };
        return { id: 'analysis-1', sourceId: 'src-123', ...data, analyzedAt: new Date() };
      },
      getAnalysisBySourceId: async () => {
        if (!savedAnalysis) return null;
        return {
          id: 'analysis-1',
          sourceId: 'src-123',
          indexRunId: 'run-123',
          status: 'CURRENT',
          architectureVersion: 1,
          primaryKind: 'WEB_FRONTEND',
          confidence: 'HIGH',
          applicationKindsJson: savedAnalysis.applicationKindsJson,
          applicationUnitsJson: savedAnalysis.applicationUnitsJson,
          entryCandidatesJson: savedAnalysis.entryCandidatesJson,
          structuralAreasJson: savedAnalysis.structuralAreasJson,
          signalsJson: savedAnalysis.signalsJson,
          moduleHubsJson: savedAnalysis.moduleHubsJson,
          warnings: [],
          analyzedAt: new Date(),
        };
      },
    } as unknown as ArchitectureRepository;

    const service = new ArchitectureService(
      mockArchRepo,
      mockSourceRepo,
      mockProjectRepo,
      mockFrameworkService,
      mockTechService,
      mockIndexRepo,
    );

    const profile = await service.refreshArchitectureProfile('proj-active');

    assert.strictEqual(profile.primaryKind, 'WEB_FRONTEND');
    assert.strictEqual(profile.confidence, 'HIGH');
    assert.ok(profile.entryCandidates.length >= 1);
    assert.strictEqual(profile.entryCandidates[0]?.relativePath, 'src/main.tsx');
    assert.strictEqual(profile.status, 'CURRENT');
  });

  it('should detect STALE status when underlying repository index has changed', async () => {
    const mockArchRepo = {
      getAnalysisBySourceId: async () => ({
        id: 'analysis-1',
        sourceId: 'src-123',
        indexRunId: 'old-run-000',
        status: 'CURRENT',
        architectureVersion: 1,
        primaryKind: 'WEB_FRONTEND',
        confidence: 'HIGH',
        applicationKindsJson: [],
        applicationUnitsJson: [],
        entryCandidatesJson: [],
        structuralAreasJson: [],
        signalsJson: [],
        moduleHubsJson: [],
        warnings: [],
        analyzedAt: new Date(),
      }),
    } as unknown as ArchitectureRepository;

    const mockIndexRepoNew = {
      getLatestIndexRun: async () => ({
        id: 'new-run-999',
        sourceId: 'src-123',
        status: 'COMPLETED',
      }),
    } as unknown as RepositoryIndexRepository;

    const service = new ArchitectureService(
      mockArchRepo,
      mockSourceRepo,
      mockProjectRepo,
      mockFrameworkService,
      mockTechService,
      mockIndexRepoNew,
    );

    const profile = await service.getArchitectureProfile('proj-active');
    assert.ok(profile);
    assert.strictEqual(profile.status, 'STALE');
  });

  it('should reject refreshArchitectureProfile on an ARCHIVED project', async () => {
    const service = new ArchitectureService(
      {} as ArchitectureRepository,
      mockSourceRepo,
      mockProjectRepo,
      mockFrameworkService,
      mockTechService,
      mockIndexRepo,
    );

    await assert.rejects(
      async () => {
        await service.refreshArchitectureProfile('proj-archived');
      },
      {
        name: 'ProjectArchivedError',
      },
    );
  });
});
