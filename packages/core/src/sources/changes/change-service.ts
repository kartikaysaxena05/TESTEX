/**
 * @file packages/core/src/sources/changes/change-service.ts
 * Privileged orchestration service for baseline vs current repository change detection.
 */

import type { RepositoryChangeSetDto } from '@ai-quality/contracts';
import { getLogger } from '../../logging/logger.js';
import { ProjectRepository } from '../../projects/project-repository.js';
import { ProjectNotFoundError, ProjectValidationError } from '../../projects/project-errors.js';
import { SourceRepository } from '../source-repository.js';
import { SourceNotFoundError } from '../source-errors.js';
import { RepositoryIndexRepository } from '../indexing/repository-index-repository.js';
import { ArchitectureRepository } from '../architecture/architecture-repository.js';
import { SnapshotRepository } from '../snapshots/snapshot-repository.js';
import { ChangeDetector } from './change-detector.js';
import { CHANGE_DETECTION_VERSION } from '../snapshots/snapshot-types.js';

export class ChangeService {
  constructor(
    private readonly snapshotRepo: SnapshotRepository = new SnapshotRepository(),
    private readonly sourceRepo: SourceRepository = new SourceRepository(),
    private readonly projectRepo: ProjectRepository = new ProjectRepository(),
    private readonly indexRepo: RepositoryIndexRepository = new RepositoryIndexRepository(),
    private readonly archRepo: ArchitectureRepository = new ArchitectureRepository(),
  ) {}

  /**
   * Retrieves change set comparing active baseline snapshot against current repository index.
   */
  async getChanges(projectId: string): Promise<RepositoryChangeSetDto | null> {
    return await this.refreshChanges(projectId);
  }

  /**
   * Recalculates and refreshes change set between active baseline and current index run.
   */
  async refreshChanges(projectId: string): Promise<RepositoryChangeSetDto> {
    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepo.getProjectById(projectId);
    if (!project) throw new ProjectNotFoundError();

    const source = await this.sourceRepo.getSourceByProjectId(projectId);
    if (!source) throw new SourceNotFoundError();

    const baselineId = source.activeBaselineSnapshotId;
    if (!baselineId) {
      return {
        sourceId: source.id,
        baselineSnapshotId: null,
        baselineLabel: null,
        currentIndexRunId: null,
        comparisonVersion: CHANGE_DETECTION_VERSION,
        isStale: false,
        totalChanges: 0,
        addedCount: 0,
        modifiedCount: 0,
        deletedCount: 0,
        renamedCount: 0,
        unchangedCount: 0,
        changesByClassification: {},
        changesByLanguage: {},
        changes: [],
        comparedAt: new Date().toISOString(),
        warnings: ['No baseline snapshot has been created or selected for this repository.'],
      };
    }

    const baseline = await this.snapshotRepo.getSnapshotById(baselineId);
    if (!baseline || baseline.sourceId !== source.id) {
      return {
        sourceId: source.id,
        baselineSnapshotId: baselineId,
        baselineLabel: null,
        currentIndexRunId: null,
        comparisonVersion: CHANGE_DETECTION_VERSION,
        isStale: true,
        totalChanges: 0,
        addedCount: 0,
        modifiedCount: 0,
        deletedCount: 0,
        renamedCount: 0,
        unchangedCount: 0,
        changesByClassification: {},
        changesByLanguage: {},
        changes: [],
        comparedAt: new Date().toISOString(),
        warnings: ['Active baseline snapshot is missing or unreachable.'],
      };
    }

    const startTime = performance.now();
    getLogger().info('repository.change_detection_started', {
      projectId,
      sourceId: source.id,
      baselineSnapshotId: baseline.id,
    });

    try {
      const [baselineFiles, latestIndexRun, { files: currentFiles, importEdges }] =
        await Promise.all([
          this.snapshotRepo.getSnapshotFiles(baseline.id),
          this.indexRepo.getLatestIndexRun(source.id),
          this.archRepo.getIndexedDataForSource(source.id),
        ]);

      // Direct importer mapping (file -> array of files that import it)
      const importersMap = new Map<string, string[]>();
      for (const edge of importEdges) {
        if (edge.resolvedRelativePath) {
          const list = importersMap.get(edge.resolvedRelativePath) ?? [];
          list.push(edge.fromRelativePath);
          importersMap.set(edge.resolvedRelativePath, list);
        }
      }

      const comparison = ChangeDetector.compare({
        baselineFiles,
        currentFiles,
        importsByPath: importersMap,
      });

      const isStale = latestIndexRun ? latestIndexRun.id !== baseline.indexRunId : false;
      const durationMs = Math.round(performance.now() - startTime);

      getLogger().info('repository.change_detection_completed', {
        projectId,
        sourceId: source.id,
        baselineSnapshotId: baseline.id,
        currentIndexRunId: latestIndexRun?.id ?? null,
        totalChanges: comparison.totalChanges,
        added: comparison.addedCount,
        modified: comparison.modifiedCount,
        deleted: comparison.deletedCount,
        renamed: comparison.renamedCount,
        unchanged: comparison.unchangedCount,
        durationMs,
      });

      return {
        sourceId: source.id,
        baselineSnapshotId: baseline.id,
        baselineLabel: baseline.label,
        currentIndexRunId: latestIndexRun?.id ?? null,
        comparisonVersion: CHANGE_DETECTION_VERSION,
        isStale,
        totalChanges: comparison.totalChanges,
        addedCount: comparison.addedCount,
        modifiedCount: comparison.modifiedCount,
        deletedCount: comparison.deletedCount,
        renamedCount: comparison.renamedCount,
        unchangedCount: comparison.unchangedCount,
        changesByClassification: comparison.changesByClassification,
        changesByLanguage: comparison.changesByLanguage,
        changes: comparison.changes,
        comparedAt: new Date().toISOString(),
        warnings: isStale ? ['Current index run differs from baseline capture index run.'] : [],
      };
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      getLogger().error('repository.change_detection_failed', error, {
        projectId,
        sourceId: source.id,
        durationMs,
      });
      throw error;
    }
  }
}
