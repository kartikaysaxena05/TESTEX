/**
 * @file packages/core/src/sources/classification/classification-profile-service.ts
 * Privileged domain service managing source file classification profiles.
 */

import type {
  ClassificationProfileDto,
  ClassificationSummaryDto,
  FileClassificationDto,
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
import { CLASSIFICATION_RULE_VERSION } from './classification-types.js';
import { FileClassifier } from './file-classifier.js';

export class ClassificationProfileService {
  private readonly cache = new Map<string, ClassificationProfileDto>();

  constructor(
    private readonly sourceRepository: SourceRepository = new SourceRepository(),
    private readonly projectRepository: ProjectRepository = new ProjectRepository(),
    private readonly structureService: SourceStructureService = new SourceStructureService(),
    private readonly classifier: FileClassifier = new FileClassifier(),
  ) {}

  /**
   * Clears the in-memory classification profile cache for a source.
   */
  invalidateCache(sourceId: string): void {
    this.cache.delete(sourceId);
  }

  /**
   * Retrieves the cached classification profile, or refreshes if not yet cached.
   */
  async getClassificationProfile(projectId: string): Promise<ClassificationProfileDto | null> {
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
      return this.refreshClassificationProfile(projectId);
    }

    return {
      sourceId: source.id,
      summary: {
        totalFiles: 0,
        sourceFiles: 0,
        testFiles: 0,
        configurationFiles: 0,
        buildToolingFiles: 0,
        documentationFiles: 0,
        assetFiles: 0,
        databaseFiles: 0,
        migrationFiles: 0,
        generatedFiles: 0,
        scriptFiles: 0,
        templateFiles: 0,
        unknownFiles: 0,
      },
      files: [],
      analyzedAt: new Date().toISOString(),
      ruleVersion: CLASSIFICATION_RULE_VERSION,
    };
  }

  /**
   * Classifies all included files from the Phase-19 repository structure.
   */
  async refreshClassificationProfile(projectId: string): Promise<ClassificationProfileDto> {
    const startTime = performance.now();

    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot analyze file classification on an archived project.');
    }

    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!source) {
      throw new SourceNotFoundError();
    }

    getLogger().info('source.classification_started', {
      projectId,
      sourceId: source.id,
      rootName: source.displayName,
    });

    const structure = await this.structureService.getSourceStructure(projectId);
    const fileEntries = structure ? structure.entries.filter(e => e.kind === 'FILE') : [];

    const classifiedFiles: FileClassificationDto[] = [];
    const mutableSummary = {
      totalFiles: fileEntries.length,
      sourceFiles: 0,
      testFiles: 0,
      configurationFiles: 0,
      buildToolingFiles: 0,
      documentationFiles: 0,
      assetFiles: 0,
      databaseFiles: 0,
      migrationFiles: 0,
      generatedFiles: 0,
      scriptFiles: 0,
      templateFiles: 0,
      unknownFiles: 0,
    };

    for (const entry of fileEntries) {
      const result = this.classifier.classify(entry.relativePath);
      classifiedFiles.push(result);

      switch (result.category) {
        case 'SOURCE':
          mutableSummary.sourceFiles++;
          break;
        case 'TEST':
          mutableSummary.testFiles++;
          break;
        case 'CONFIGURATION':
          mutableSummary.configurationFiles++;
          break;
        case 'BUILD_TOOLING':
          mutableSummary.buildToolingFiles++;
          break;
        case 'DOCUMENTATION':
          mutableSummary.documentationFiles++;
          break;
        case 'ASSET':
          mutableSummary.assetFiles++;
          break;
        case 'DATABASE':
          mutableSummary.databaseFiles++;
          break;
        case 'MIGRATION':
          mutableSummary.migrationFiles++;
          break;
        case 'GENERATED':
          mutableSummary.generatedFiles++;
          break;
        case 'SCRIPT':
          mutableSummary.scriptFiles++;
          break;
        case 'TEMPLATE':
          mutableSummary.templateFiles++;
          break;
        case 'UNKNOWN':
          mutableSummary.unknownFiles++;
          break;
      }
    }

    // Sort deterministically by relative path
    classifiedFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    const durationMs = Math.round(performance.now() - startTime);

    const summary: ClassificationSummaryDto = {
      ...mutableSummary,
    };

    const profile: ClassificationProfileDto = {
      sourceId: source.id,
      summary,
      files: classifiedFiles,
      analyzedAt: new Date().toISOString(),
      ruleVersion: CLASSIFICATION_RULE_VERSION,
    };

    this.cache.set(source.id, profile);

    getLogger().info('source.classification_completed', {
      projectId,
      sourceId: source.id,
      filesClassified: summary.totalFiles,
      sourceFiles: summary.sourceFiles,
      testFiles: summary.testFiles,
      unknownFiles: summary.unknownFiles,
      durationMs,
    });

    return profile;
  }
}
