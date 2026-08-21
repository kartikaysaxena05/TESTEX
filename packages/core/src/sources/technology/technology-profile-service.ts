/**
 * @file packages/core/src/sources/technology/technology-profile-service.ts
 * Privileged service managing repository technology and programming language profiling.
 */

import type { TechnologyProfileDto } from '@ai-quality/contracts';
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
import { LanguageDetector } from './language-detector.js';
import { TechnologySignalDetector } from './technology-signal-detector.js';

export class TechnologyProfileService {
  private readonly cache = new Map<string, TechnologyProfileDto>();

  constructor(
    private readonly sourceRepository: SourceRepository = new SourceRepository(),
    private readonly projectRepository: ProjectRepository = new ProjectRepository(),
    private readonly structureService: SourceStructureService = new SourceStructureService(),
    private readonly languageDetector: LanguageDetector = new LanguageDetector(),
    private readonly signalDetector: TechnologySignalDetector = new TechnologySignalDetector(),
  ) {}

  /**
   * Clears the in-memory technology profile cache for a source.
   */
  invalidateCache(sourceId: string): void {
    this.cache.delete(sourceId);
  }

  /**
   * Retrieves the cached technology profile, or analyzes if not yet cached.
   */
  async getTechnologyProfile(projectId: string): Promise<TechnologyProfileDto | null> {
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
      return this.refreshTechnologyProfile(projectId);
    }

    return {
      sourceId: source.id,
      detectedLanguages: [],
      dominantLanguage: null,
      technologySignals: [],
      totalIncludedFiles: 0,
      totalLanguageFiles: 0,
      unknownFiles: 0,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Refreshes programming language detection and technology profile from the filtered structure.
   */
  async refreshTechnologyProfile(projectId: string): Promise<TechnologyProfileDto> {
    const startTime = performance.now();

    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot analyze technology profile on an archived project.');
    }

    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!source) {
      throw new SourceNotFoundError();
    }

    getLogger().info('source.technology_analysis_started', {
      projectId,
      sourceId: source.id,
      rootName: source.displayName,
    });

    const structure = await this.structureService.getSourceStructure(projectId);
    const entries = structure ? structure.entries : [];

    const languageResult = this.languageDetector.detect(entries);
    const technologySignals = this.signalDetector.detect(entries);

    const durationMs = Math.round(performance.now() - startTime);

    const profile: TechnologyProfileDto = {
      sourceId: source.id,
      detectedLanguages: languageResult.detectedLanguages,
      dominantLanguage: languageResult.dominantLanguage,
      technologySignals,
      totalIncludedFiles: languageResult.totalIncludedFiles,
      totalLanguageFiles: languageResult.totalLanguageFiles,
      unknownFiles: languageResult.unknownFiles,
      analyzedAt: new Date().toISOString(),
    };

    this.cache.set(source.id, profile);

    getLogger().info('source.technology_analysis_completed', {
      projectId,
      sourceId: source.id,
      languagesDetected: profile.detectedLanguages.length,
      dominantLanguage: profile.dominantLanguage,
      technologySignals: profile.technologySignals.length,
      filesAnalyzed: profile.totalIncludedFiles,
      durationMs,
    });

    return profile;
  }
}
