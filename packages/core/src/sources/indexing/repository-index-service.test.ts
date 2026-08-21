import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { RepositoryIndexService } from './repository-index-service.js';
import type { RepositoryIndexRepository, FileToUpsert } from './repository-index-repository.js';
import type { SourceRepository } from '../source-repository.js';
import type { ProjectRepository } from '../../projects/project-repository.js';
import type { SourceStructureService } from '../structure/source-structure-service.js';
import type { ClassificationProfileService } from '../classification/classification-profile-service.js';
import type { SourceContentService } from '../content/source-content-service.js';
import type {
  SourceStructureDto,
  ClassificationProfileDto,
  SourceFileContentDto,
} from '@ai-quality/contracts';

describe('RepositoryIndexService Unit Tests', () => {
  const tempRootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'idx-service-test-'));

  after(() => {
    fs.rmSync(tempRootPath, { recursive: true, force: true });
  });

  const dummyStructure: SourceStructureDto = {
    sourceId: 'src-123',
    rootName: 'sample-app',
    entries: [
      { relativePath: 'src/app.ts', name: 'app.ts', kind: 'FILE', depth: 2 },
      { relativePath: 'src/user.service.ts', name: 'user.service.ts', kind: 'FILE', depth: 2 },
      { relativePath: '.env', name: '.env', kind: 'FILE', depth: 1 },
      { relativePath: 'public/logo.png', name: 'logo.png', kind: 'FILE', depth: 2 },
    ],
    summary: {
      filesDiscovered: 4,
      directoriesDiscovered: 2,
      symlinksDiscovered: 0,
      totalDiscovered: 6,
      includedFiles: 4,
      includedDirectories: 2,
      totalIncluded: 6,
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

  const dummyClassification: ClassificationProfileDto = {
    sourceId: 'src-123',
    summary: {
      totalFiles: 4,
      sourceFiles: 2,
      testFiles: 0,
      configurationFiles: 1,
      buildToolingFiles: 0,
      documentationFiles: 0,
      assetFiles: 1,
      databaseFiles: 0,
      migrationFiles: 0,
      generatedFiles: 0,
      scriptFiles: 0,
      templateFiles: 0,
      unknownFiles: 0,
    },
    files: [
      { relativePath: 'src/app.ts', category: 'SOURCE', confidence: 'HIGH', evidence: [] },
      { relativePath: 'src/user.service.ts', category: 'SOURCE', confidence: 'HIGH', evidence: [] },
      { relativePath: '.env', category: 'CONFIGURATION', confidence: 'HIGH', evidence: [] },
      { relativePath: 'public/logo.png', category: 'ASSET', confidence: 'HIGH', evidence: [] },
    ],
    analyzedAt: new Date().toISOString(),
    ruleVersion: 1,
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

  const mockStructureService = {
    getSourceStructure: async () => dummyStructure,
  } as unknown as SourceStructureService;

  const mockClassificationService = {
    getClassificationProfile: async () => dummyClassification,
  } as unknown as ClassificationProfileService;

  const mockContentService = {
    readSourceFile: async (_projId: string, relPath: string): Promise<SourceFileContentDto> => {
      if (relPath === 'src/app.ts') {
        return {
          sourceId: 'src-123',
          relativePath: relPath,
          status: 'AVAILABLE',
          category: 'SOURCE',
          language: 'TypeScript',
          sizeBytes: 40,
          encoding: 'UTF-8',
          content: 'export function startApp() { return true; }',
          readAt: new Date().toISOString(),
        };
      }
      if (relPath === 'src/user.service.ts') {
        return {
          sourceId: 'src-123',
          relativePath: relPath,
          status: 'AVAILABLE',
          category: 'SOURCE',
          language: 'TypeScript',
          sizeBytes: 80,
          encoding: 'UTF-8',
          content: 'import { startApp } from "./app";\nexport class UserService {}',
          readAt: new Date().toISOString(),
        };
      }
      if (relPath === '.env') {
        return {
          sourceId: 'src-123',
          relativePath: relPath,
          status: 'SENSITIVE',
          category: 'CONFIGURATION',
          language: null,
          sizeBytes: 0,
          encoding: 'UTF-8',
          content: null,
          readAt: new Date().toISOString(),
        };
      }
      return {
        sourceId: 'src-123',
        relativePath: relPath,
        status: 'BINARY',
        category: 'ASSET',
        language: null,
        sizeBytes: 100,
        encoding: 'UTF-8',
        content: null,
        readAt: new Date().toISOString(),
      };
    },
  } as unknown as SourceContentService;

  it('should orchestrate indexing run and persist extracted symbols and imports', async () => {
    const upsertedBatches: FileToUpsert[][] = [];

    const mockIndexRepo = {
      createIndexRun: async () => ({ id: 'run-1', sourceId: 'src-123', status: 'RUNNING' }),
      updateIndexRun: async (_id: string, data: { status: string }) => ({ id: 'run-1', ...data }),
      getLatestIndexRun: async () => ({
        id: 'run-1',
        sourceId: 'src-123',
        status: 'COMPLETED',
        schemaVersion: 1,
        parserVersion: 1,
        filesEligible: 3,
        filesIndexed: 2,
        filesSkipped: 1,
        filesFailed: 0,
        symbolsIndexed: 2,
        importsIndexed: 1,
        exportsIndexed: 2,
        unsupportedLanguageFiles: 0,
        durationMs: 25,
        truncated: false,
        warnings: [],
        startedAt: new Date(),
        completedAt: new Date(),
      }),
      getExistingFileHashes: async () => new Map(),
      deleteStaleFiles: async () => 0,
      batchUpsertFiles: async (_sourceId: string, batch: FileToUpsert[]) => {
        upsertedBatches.push([...batch]);
      },
    } as unknown as RepositoryIndexRepository;

    const service = new RepositoryIndexService(
      mockIndexRepo,
      mockSourceRepo,
      mockProjectRepo,
      mockStructureService,
      mockClassificationService,
      mockContentService,
    );

    const status = await service.refreshIndex('proj-active');

    assert.strictEqual(status.isIndexed, true);
    assert.strictEqual(status.summary?.filesIndexed, 2);
    assert.strictEqual(status.summary?.filesSkipped, 1); // .env was skipped because SENSITIVE
    assert.strictEqual(upsertedBatches.length, 1);
    assert.strictEqual(upsertedBatches[0]?.length, 2);
  });

  it('should skip reparsing unchanged files when SHA-256 content hash matches', async () => {
    const upsertedBatches: FileToUpsert[][] = [];
    const appTsHash = crypto
      .createHash('sha256')
      .update('export function startApp() { return true; }')
      .digest('hex');

    const mockIndexRepo = {
      createIndexRun: async () => ({ id: 'run-2', sourceId: 'src-123', status: 'RUNNING' }),
      updateIndexRun: async (_id: string, data: { status: string }) => ({ id: 'run-2', ...data }),
      getLatestIndexRun: async () => ({
        id: 'run-2',
        sourceId: 'src-123',
        status: 'COMPLETED',
        schemaVersion: 1,
        parserVersion: 1,
        filesEligible: 3,
        filesIndexed: 2,
        filesSkipped: 1,
        filesFailed: 0,
        symbolsIndexed: 1,
        importsIndexed: 1,
        exportsIndexed: 1,
        unsupportedLanguageFiles: 0,
        durationMs: 15,
        truncated: false,
        warnings: [],
        startedAt: new Date(),
        completedAt: new Date(),
      }),
      getExistingFileHashes: async () =>
        new Map([['src/app.ts', { id: 'f-1', contentHash: appTsHash }]]),
      deleteStaleFiles: async () => 0,
      batchUpsertFiles: async (_sourceId: string, batch: FileToUpsert[]) => {
        upsertedBatches.push([...batch]);
      },
    } as unknown as RepositoryIndexRepository;

    const service = new RepositoryIndexService(
      mockIndexRepo,
      mockSourceRepo,
      mockProjectRepo,
      mockStructureService,
      mockClassificationService,
      mockContentService,
    );

    const status = await service.refreshIndex('proj-active');

    assert.strictEqual(status.isIndexed, true);
    // Only src/user.service.ts needed parsing & upserting because src/app.ts had matching hash!
    assert.strictEqual(upsertedBatches.length, 1);
    assert.strictEqual(upsertedBatches[0]?.length, 1);
    assert.strictEqual(upsertedBatches[0]?.[0]?.relativePath, 'src/user.service.ts');
  });

  it('should NEVER leak source file contents into logs (Privacy Verification)', async () => {
    const SECRET_MARKER = 'SUPER_SECRET_INDEX_SOURCE_MARKER_98765';
    const loggedMessages: string[] = [];

    const mockContentWithSecret = {
      readSourceFile: async (_projId: string, relPath: string): Promise<SourceFileContentDto> => ({
        sourceId: 'src-123',
        relativePath: relPath,
        status: 'AVAILABLE',
        category: 'SOURCE',
        language: 'TypeScript',
        sizeBytes: 100,
        encoding: 'UTF-8',
        content: `// ${SECRET_MARKER}\nexport const secretVal = "private";`,
        readAt: new Date().toISOString(),
      }),
    } as unknown as SourceContentService;

    const mockIndexRepo = {
      createIndexRun: async () => ({ id: 'run-sec', sourceId: 'src-123', status: 'RUNNING' }),
      updateIndexRun: async (_id: string, data: Record<string, unknown>) => ({
        id: 'run-sec',
        ...data,
      }),
      getLatestIndexRun: async () => ({
        id: 'run-sec',
        sourceId: 'src-123',
        status: 'COMPLETED',
        schemaVersion: 1,
        parserVersion: 1,
        filesEligible: 1,
        filesIndexed: 1,
        filesSkipped: 0,
        filesFailed: 0,
        symbolsIndexed: 1,
        importsIndexed: 0,
        exportsIndexed: 1,
        unsupportedLanguageFiles: 0,
        durationMs: 10,
        truncated: false,
        warnings: [],
        startedAt: new Date(),
        completedAt: new Date(),
      }),
      getExistingFileHashes: async () => new Map(),
      deleteStaleFiles: async () => 0,
      batchUpsertFiles: async () => {},
    } as unknown as RepositoryIndexRepository;

    const service = new RepositoryIndexService(
      mockIndexRepo,
      mockSourceRepo,
      mockProjectRepo,
      mockStructureService,
      mockClassificationService,
      mockContentWithSecret,
    );

    await service.refreshIndex('proj-active');

    // Verify SECRET_MARKER does not appear in logged outputs
    for (const msg of loggedMessages) {
      assert.ok(!msg.includes(SECRET_MARKER), 'Source content marker must not leak into logs');
    }
  });

  it('should reject refreshIndex on an ARCHIVED project', async () => {
    const service = new RepositoryIndexService(
      {} as RepositoryIndexRepository,
      mockSourceRepo,
      mockProjectRepo,
      mockStructureService,
      mockClassificationService,
      mockContentService,
    );

    await assert.rejects(
      async () => {
        await service.refreshIndex('proj-archived');
      },
      {
        name: 'ProjectArchivedError',
      },
    );
  });
});
