/**
 * @file packages/core/src/sources/structure/source-structure-service.ts
 * Privileged service managing bounded repository structure discovery and in-memory caching.
 */

import type { SourceStructureDto } from '@ai-quality/contracts';
import { getLogger } from '../../logging/logger.js';
import { ProjectRepository } from '../../projects/project-repository.js';
import {
  ProjectNotFoundError,
  ProjectArchivedError,
  ProjectValidationError,
} from '../../projects/project-errors.js';
import { SourceRepository } from '../source-repository.js';
import { SourceNotFoundError } from '../source-errors.js';
import { checkPathAvailability } from '../source-path-validation.js';
import { SafeDirectoryWalker } from './safe-directory-walker.js';
import { mapRawStructureToDto } from './structure-mappers.js';

export class SourceStructureService {
  private readonly cache = new Map<string, SourceStructureDto>();

  constructor(
    private readonly sourceRepository: SourceRepository = new SourceRepository(),
    private readonly projectRepository: ProjectRepository = new ProjectRepository(),
    private readonly walker: SafeDirectoryWalker = new SafeDirectoryWalker(),
  ) {}

  /**
   * Clears the in-memory structure cache for a source.
   */
  invalidateCache(sourceId: string): void {
    this.cache.delete(sourceId);
  }

  /**
   * Retrieves the cached repository structure, or scans if not yet cached.
   */
  async getSourceStructure(projectId: string): Promise<SourceStructureDto | null> {
    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!source) {
      return null;
    }

    const cached = this.cache.get(source.id);
    if (cached) {
      return cached;
    }

    if (project.status === 'ACTIVE') {
      return this.refreshStructure(projectId);
    }

    return {
      sourceId: source.id,
      rootName: source.displayName,
      entries: [],
      summary: {
        filesDiscovered: 0,
        directoriesDiscovered: 0,
        symlinksDiscovered: 0,
        totalDiscovered: 0,
        includedFiles: 0,
        includedDirectories: 0,
        totalIncluded: 0,
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
  }

  /**
   * Bounded and deterministically refreshes repository file and directory structure with filtering.
   */
  async refreshStructure(projectId: string): Promise<SourceStructureDto> {
    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot refresh repository structure on an archived project.');
    }

    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!source) {
      throw new SourceNotFoundError();
    }

    const isAvailable = checkPathAvailability(source.rootPath);
    if (!isAvailable) {
      getLogger().warn('source.structure_scan_unavailable', {
        projectId,
        sourceId: source.id,
      });

      const emptyDto: SourceStructureDto = {
        sourceId: source.id,
        rootName: source.displayName,
        entries: [],
        summary: {
          filesDiscovered: 0,
          directoriesDiscovered: 0,
          symlinksDiscovered: 0,
          totalDiscovered: 0,
          includedFiles: 0,
          includedDirectories: 0,
          totalIncluded: 0,
          ignoredEntries: 0,
          safetyExcludedEntries: 0,
          earlyPrunedDirectories: 0,
          ignoreFilesLoaded: 0,
          ignoreRulesLoaded: 0,
          warnings: ['Source path is unavailable on disk.'],
        },
        truncated: false,
        truncationReason: null,
        scannedAt: new Date().toISOString(),
      };
      this.cache.set(source.id, emptyDto);
      return emptyDto;
    }

    getLogger().info('source.structure_scan_started', {
      projectId,
      sourceId: source.id,
      rootName: source.displayName,
    });

    const rawResult = await this.walker.walk(source.rootPath);
    const dto = mapRawStructureToDto(source.id, rawResult);

    this.cache.set(source.id, dto);

    if (rawResult.truncated) {
      getLogger().warn('source.structure_scan_truncated', {
        projectId,
        sourceId: source.id,
        reason: rawResult.truncationReason,
        totalIncluded: dto.summary.totalIncluded,
        durationMs: rawResult.durationMs,
      });
    } else {
      getLogger().info('source.structure_scan_completed', {
        projectId,
        sourceId: source.id,
        includedFiles: dto.summary.includedFiles,
        includedDirectories: dto.summary.includedDirectories,
        ignoredEntries: dto.summary.ignoredEntries,
        safetyExcludedEntries: dto.summary.safetyExcludedEntries,
        totalIncluded: dto.summary.totalIncluded,
        durationMs: rawResult.durationMs,
      });
    }

    return dto;
  }
}
