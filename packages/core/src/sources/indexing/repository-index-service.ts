/**
 * @file packages/core/src/sources/indexing/repository-index-service.ts
 * Privileged orchestration service for building and querying the repository source index.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  RepositoryIndexStatusDto,
  RepositoryIndexSummaryDto,
  RepositoryFileDto,
  RepositoryFileDetailsDto,
  RepositorySymbolDto,
  ListIndexedFilesInput,
  SearchSymbolsInput,
  PaginatedResult,
} from '@ai-quality/contracts';
import { getLogger } from '../../logging/logger.js';
import { ProjectRepository } from '../../projects/project-repository.js';
import {
  ProjectNotFoundError,
  ProjectArchivedError,
  ProjectValidationError,
} from '../../projects/project-errors.js';
import { SourceRepository } from '../source-repository.js';
import { SourceNotFoundError } from '../source-errors.js';
import { SourceStructureService } from '../structure/source-structure-service.js';
import { ClassificationProfileService } from '../classification/classification-profile-service.js';
import { SourceContentService } from '../content/source-content-service.js';
import { LanguageRegistry } from '../technology/language-registry.js';
import { FileClassifier } from '../classification/file-classifier.js';
import { SourceParserRegistry } from './source-parser-registry.js';
import { ImportResolver } from './import-resolver.js';
import { RepositoryIndexRepository, type FileToUpsert } from './repository-index-repository.js';
import {
  INDEX_SCHEMA_VERSION,
  PARSER_VERSION,
  MAX_INDEXABLE_FILES,
  DB_BATCH_SIZE,
} from './index-types.js';

export class RepositoryIndexService {
  private activeIndexingRuns = new Set<string>();

  constructor(
    private readonly indexRepository: RepositoryIndexRepository = new RepositoryIndexRepository(),
    private readonly sourceRepository: SourceRepository = new SourceRepository(),
    private readonly projectRepository: ProjectRepository = new ProjectRepository(),
    private readonly structureService: SourceStructureService = new SourceStructureService(),
    private readonly classificationService: ClassificationProfileService = new ClassificationProfileService(
      sourceRepository,
      projectRepository,
      structureService,
    ),
    private readonly contentService: SourceContentService = new SourceContentService(
      sourceRepository,
      projectRepository,
      structureService,
    ),
    private readonly parserRegistry: SourceParserRegistry = new SourceParserRegistry(),
    private readonly languageRegistry: LanguageRegistry = new LanguageRegistry(),
    private readonly classifier: FileClassifier = new FileClassifier(),
  ) {}

  /**
   * Retrieves the current index status and summary for a QA project source.
   */
  async getIndexStatus(projectId: string): Promise<RepositoryIndexStatusDto> {
    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!source) {
      return {
        isIndexed: false,
        isRunning: false,
        schemaVersion: INDEX_SCHEMA_VERSION,
        parserVersion: PARSER_VERSION,
        summary: null,
        lastIndexedAt: null,
      };
    }

    const latestRun = await this.indexRepository.getLatestIndexRun(source.id);
    const isRunning = this.activeIndexingRuns.has(projectId) || latestRun?.status === 'RUNNING';

    if (!latestRun) {
      return {
        isIndexed: false,
        isRunning,
        schemaVersion: INDEX_SCHEMA_VERSION,
        parserVersion: PARSER_VERSION,
        summary: null,
        lastIndexedAt: null,
      };
    }

    const summary: RepositoryIndexSummaryDto = {
      filesEligible: latestRun.filesEligible,
      filesIndexed: latestRun.filesIndexed,
      filesSkipped: latestRun.filesSkipped,
      filesFailed: latestRun.filesFailed,
      symbolsIndexed: latestRun.symbolsIndexed,
      importsIndexed: latestRun.importsIndexed,
      exportsIndexed: latestRun.exportsIndexed,
      unsupportedLanguageFiles: latestRun.unsupportedLanguageFiles,
      durationMs: latestRun.durationMs,
      truncated: latestRun.truncated,
      warnings: latestRun.warnings,
    };

    return {
      isIndexed: latestRun.status === 'COMPLETED' || latestRun.status === 'PARTIAL',
      isRunning,
      schemaVersion: latestRun.schemaVersion,
      parserVersion: latestRun.parserVersion,
      summary,
      lastIndexedAt: latestRun.completedAt ? latestRun.completedAt.toISOString() : null,
    };
  }

  /**
   * Builds or incrementally rebuilds the repository source index.
   */
  async refreshIndex(projectId: string): Promise<RepositoryIndexStatusDto> {
    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot index an archived project.');
    }

    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!source) {
      throw new SourceNotFoundError();
    }

    if (!fs.existsSync(source.rootPath)) {
      return {
        isIndexed: false,
        isRunning: false,
        schemaVersion: INDEX_SCHEMA_VERSION,
        parserVersion: PARSER_VERSION,
        summary: null,
        lastIndexedAt: null,
      };
    }

    // In-flight concurrency lock per project
    if (this.activeIndexingRuns.has(projectId)) {
      return await this.getIndexStatus(projectId);
    }

    this.activeIndexingRuns.add(projectId);
    const startTime = performance.now();

    getLogger().info('repository.index_started', {
      projectId,
      sourceId: source.id,
      rootName: source.displayName,
    });

    const indexRun = await this.indexRepository.createIndexRun(
      source.id,
      INDEX_SCHEMA_VERSION,
      PARSER_VERSION,
    );

    try {
      // 1. Get Filtered Structure & Classification (refresh from disk when available)
      const structure =
        typeof this.structureService.refreshStructure === 'function'
          ? await this.structureService.refreshStructure(projectId)
          : await this.structureService.getSourceStructure(projectId);

      const classification =
        typeof this.classificationService.refreshClassificationProfile === 'function'
          ? await this.classificationService.refreshClassificationProfile(projectId)
          : await this.classificationService.getClassificationProfile(projectId);

      const allIncludedFileEntries = (structure?.entries ?? []).filter(e => e.kind === 'FILE');
      const knownPaths = new Set(allIncludedFileEntries.map(e => e.relativePath));

      // 2. Filter Candidate Indexable Files (exclude ASSET, include code/config/docs)
      const classificationMap = new Map(
        (classification?.files ?? []).map(f => [f.relativePath, f.category]),
      );

      const candidateFiles = allIncludedFileEntries.filter(e => {
        const cat = classificationMap.get(e.relativePath) ?? 'UNKNOWN';
        return cat !== 'ASSET';
      });

      const totalEligible = candidateFiles.length;
      let truncated = false;
      const filesToProcess =
        totalEligible > MAX_INDEXABLE_FILES
          ? ((truncated = true), candidateFiles.slice(0, MAX_INDEXABLE_FILES))
          : candidateFiles;

      // 3. Incremental Hash Comparison
      const existingFileHashes = await this.indexRepository.getExistingFileHashes(source.id);

      // Clean up stale files no longer present in source repository
      const stalePaths = [...existingFileHashes.keys()].filter(p => !knownPaths.has(p));
      if (stalePaths.length > 0) {
        await this.indexRepository.deleteStaleFiles(source.id, stalePaths);
      }

      let filesIndexed = 0;
      let filesSkipped = 0;
      let filesFailed = 0;
      let symbolsIndexed = 0;
      let importsIndexed = 0;
      let exportsIndexed = 0;
      let unsupportedLanguageFiles = 0;
      const warnings: string[] = [];

      // 4. Batch Processing
      for (let i = 0; i < filesToProcess.length; i += DB_BATCH_SIZE) {
        const batchEntries = filesToProcess.slice(i, i + DB_BATCH_SIZE);
        const batchToUpsert: FileToUpsert[] = [];

        for (const entry of batchEntries) {
          const cat = classificationMap.get(entry.relativePath) ?? 'UNKNOWN';

          // Read content via Phase 23 secure gateway
          const contentDto = await this.contentService.readSourceFile(
            projectId,
            entry.relativePath,
          );

          if (contentDto.status !== 'AVAILABLE' || contentDto.content === null) {
            if (
              contentDto.status === 'SENSITIVE' ||
              contentDto.status === 'BINARY' ||
              contentDto.status === 'TOO_LARGE' ||
              contentDto.status === 'FILTERED'
            ) {
              filesSkipped++;
            } else {
              filesFailed++;
            }
            continue;
          }

          const content = contentDto.content;
          const contentHash = crypto.createHash('sha256').update(content).digest('hex');

          // Check if unchanged in DB
          const existing = existingFileHashes.get(entry.relativePath);
          if (existing && existing.contentHash === contentHash) {
            filesIndexed++;
            continue;
          }

          // Parse AST / Declarations
          const langSpec = this.languageRegistry.match(entry.name);
          const langName = langSpec ? langSpec.displayName : null;

          const parseResult = this.parserRegistry.parse({
            relativePath: entry.relativePath,
            content,
            language: langName,
          });

          if (!parseResult.isSupported) {
            unsupportedLanguageFiles++;
          }

          // Resolve imports
          const resolvedImports = parseResult.imports.map(imp => {
            const res = ImportResolver.resolve(entry.relativePath, imp.specifier, knownPaths);
            return {
              ...imp,
              resolvedRelativePath: res.resolvedRelativePath,
              isExternal: res.isExternal,
            };
          });

          symbolsIndexed += parseResult.symbols.length;
          importsIndexed += resolvedImports.length;
          exportsIndexed += parseResult.exports.length;
          filesIndexed++;

          batchToUpsert.push({
            relativePath: entry.relativePath,
            name: entry.name,
            extension: path.posix.extname(entry.relativePath).toLowerCase() || null,
            language: langName,
            classification: cat,
            sizeBytes: contentDto.sizeBytes,
            contentHash,
            indexStatus: 'INDEXED',
            symbols: parseResult.symbols,
            imports: resolvedImports,
          });
        }

        if (batchToUpsert.length > 0) {
          await this.indexRepository.batchUpsertFiles(source.id, batchToUpsert);
        }
      }

      const durationMs = Math.round(performance.now() - startTime);

      const finalStatus = truncated ? 'PARTIAL' : 'COMPLETED';

      await this.indexRepository.updateIndexRun(indexRun.id, {
        status: finalStatus,
        filesEligible: totalEligible,
        filesIndexed,
        filesSkipped,
        filesFailed,
        symbolsIndexed,
        importsIndexed,
        exportsIndexed,
        unsupportedLanguageFiles,
        durationMs,
        truncated,
        warnings,
        completedAt: new Date(),
      });

      getLogger().info('repository.index_completed', {
        projectId,
        sourceId: source.id,
        filesEligible: totalEligible,
        filesIndexed,
        filesSkipped,
        filesFailed,
        symbolsIndexed,
        importsIndexed,
        durationMs,
      });

      return await this.getIndexStatus(projectId);
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      getLogger().error('repository.index_failed', error, {
        projectId,
        sourceId: source.id,
        durationMs,
      });

      await this.indexRepository.updateIndexRun(indexRun.id, {
        status: 'FAILED',
        durationMs,
        warnings: ['Indexing run encountered an unexpected failure.'],
        completedAt: new Date(),
      });

      throw error;
    } finally {
      this.activeIndexingRuns.delete(projectId);
    }
  }

  /**
   * Lists indexed files with pagination and search.
   */
  async listIndexedFiles(
    projectId: string,
    input: ListIndexedFilesInput,
  ): Promise<PaginatedResult<RepositoryFileDto>> {
    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) throw new ProjectNotFoundError();

    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!source) {
      return { items: [], total: 0, page: 1, pageSize: input.pageSize ?? 20, totalPages: 0 };
    }

    const page = input.page && input.page > 0 ? input.page : 1;
    const pageSize =
      input.pageSize && input.pageSize > 0 && input.pageSize <= 100 ? input.pageSize : 20;

    const { items, total } = await this.indexRepository.listIndexedFiles(source.id, {
      page,
      pageSize,
      searchQuery: input.searchQuery,
      language: input.language,
      classification: input.classification,
    });

    const totalPages = Math.ceil(total / pageSize);
    return { items, total, page, pageSize, totalPages };
  }

  /**
   * Retrieves single file details with symbols and imports.
   */
  async getFileDetails(
    projectId: string,
    relativePath: string,
  ): Promise<RepositoryFileDetailsDto | null> {
    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) throw new ProjectNotFoundError();

    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!source) return null;

    return await this.indexRepository.getFileDetails(source.id, relativePath);
  }

  /**
   * Searches symbols across indexed repository files.
   */
  async searchSymbols(
    projectId: string,
    input: SearchSymbolsInput,
  ): Promise<readonly RepositorySymbolDto[]> {
    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) throw new ProjectNotFoundError();

    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!source) return [];

    return await this.indexRepository.searchSymbols(
      source.id,
      input.query,
      input.kind,
      input.limit ?? 25,
    );
  }
}
