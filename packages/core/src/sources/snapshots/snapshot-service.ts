/**
 * @file packages/core/src/sources/snapshots/snapshot-service.ts
 * Privileged orchestration service for immutable repository snapshot capture and baseline management.
 */

import type {
  RepositorySnapshotDto,
  CreateSnapshotInput,
  SnapshotKind,
  SnapshotStatus,
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
import { RepositoryIndexRepository } from '../indexing/repository-index-repository.js';
import { ArchitectureRepository } from '../architecture/architecture-repository.js';
import { GitService } from '../../git/git-service.js';
import { SnapshotRepository } from './snapshot-repository.js';
import { SnapshotFingerprintCalculator } from './snapshot-fingerprint.js';
import { SNAPSHOT_VERSION } from './snapshot-types.js';

export class SnapshotService {
  constructor(
    private readonly snapshotRepo: SnapshotRepository = new SnapshotRepository(),
    private readonly sourceRepo: SourceRepository = new SourceRepository(),
    private readonly projectRepo: ProjectRepository = new ProjectRepository(),
    private readonly indexRepo: RepositoryIndexRepository = new RepositoryIndexRepository(),
    private readonly archRepo: ArchitectureRepository = new ArchitectureRepository(),
    private readonly gitService: GitService = new GitService(),
  ) {}

  /**
   * Lists all repository snapshots for a project source.
   */
  async listSnapshots(projectId: string): Promise<readonly RepositorySnapshotDto[]> {
    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepo.getProjectById(projectId);
    if (!project) throw new ProjectNotFoundError();

    const source = await this.sourceRepo.getSourceByProjectId(projectId);
    if (!source) return [];

    const snapshots = await this.snapshotRepo.listSnapshotsForSource(source.id);
    const activeBaselineId = source.activeBaselineSnapshotId;

    return snapshots.map(s => ({
      id: s.id,
      sourceId: s.sourceId,
      indexRunId: s.indexRunId,
      label: s.label,
      kind: s.kind as SnapshotKind,
      status: s.status as SnapshotStatus,
      snapshotVersion: s.snapshotVersion,
      fingerprint: s.fingerprint,
      fileCount: s.fileCount,
      sourceFileCount: s.sourceFileCount,
      testFileCount: s.testFileCount,
      isBaseline: s.id === activeBaselineId,
      gitHeadCommit: s.gitHeadCommit,
      gitBranch: s.gitBranch,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  /**
   * Captures an immutable repository snapshot from the current completed repository index.
   */
  async createSnapshot(
    projectId: string,
    input?: CreateSnapshotInput,
  ): Promise<RepositorySnapshotDto> {
    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepo.getProjectById(projectId);
    if (!project) throw new ProjectNotFoundError();

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot create snapshot for an archived project.');
    }

    const source = await this.sourceRepo.getSourceByProjectId(projectId);
    if (!source) throw new SourceNotFoundError();

    // Verify current index run state
    const latestIndexRun = await this.indexRepo.getLatestIndexRun(source.id);
    if (!latestIndexRun || latestIndexRun.status !== 'COMPLETED') {
      throw new ProjectValidationError(
        'Cannot create baseline snapshot without a completed repository index run. Please run repository indexing first.',
      );
    }

    const startTime = performance.now();
    getLogger().info('repository.snapshot_creation_started', {
      projectId,
      sourceId: source.id,
      indexRunId: latestIndexRun.id,
    });

    try {
      const { files } = await this.archRepo.getIndexedDataForSource(source.id);

      const fingerprint = SnapshotFingerprintCalculator.computeFingerprint(files);

      let sourceFileCount = 0;
      let testFileCount = 0;

      for (const f of files) {
        if (f.classification === 'SOURCE') sourceFileCount++;
        if (f.classification === 'TEST') testFileCount++;
      }

      // Optional Git Context (Gracefully handled if not a Git repository)
      let gitHeadCommit: string | null = null;
      let gitBranch: string | null = null;
      try {
        const gitStatus = await this.gitService.getGitStatus(projectId);
        if (gitStatus?.isGitRepository) {
          gitHeadCommit = gitStatus.headCommit;
          gitBranch = gitStatus.currentBranch;
        }
      } catch {
        // Non-git project context
      }

      const snapshot = await this.snapshotRepo.createSnapshotWithFiles(
        source.id,
        {
          indexRunId: latestIndexRun.id,
          label: input?.label?.trim() || null,
          kind: 'MANUAL_BASELINE',
          status: 'COMPLETE',
          snapshotVersion: SNAPSHOT_VERSION,
          fingerprint,
          fileCount: files.length,
          sourceFileCount,
          testFileCount,
          gitHeadCommit,
          gitBranch,
        },
        files.map(f => ({
          relativePath: f.relativePath,
          contentHash: f.contentHash,
          language: f.language,
          classification: f.classification,
          sizeBytes: f.sizeBytes,
        })),
      );

      // Auto-set as active baseline if none currently active
      if (!source.activeBaselineSnapshotId) {
        await this.snapshotRepo.setActiveBaseline(source.id, snapshot.id);
      }

      const durationMs = Math.round(performance.now() - startTime);
      getLogger().info('repository.snapshot_created', {
        projectId,
        sourceId: source.id,
        snapshotId: snapshot.id,
        fileCount: snapshot.fileCount,
        durationMs,
      });

      const isBaseline =
        !source.activeBaselineSnapshotId || source.activeBaselineSnapshotId === snapshot.id;

      return {
        id: snapshot.id,
        sourceId: snapshot.sourceId,
        indexRunId: snapshot.indexRunId,
        label: snapshot.label,
        kind: snapshot.kind as SnapshotKind,
        status: snapshot.status as SnapshotStatus,
        snapshotVersion: snapshot.snapshotVersion,
        fingerprint: snapshot.fingerprint,
        fileCount: snapshot.fileCount,
        sourceFileCount: snapshot.sourceFileCount,
        testFileCount: snapshot.testFileCount,
        isBaseline,
        gitHeadCommit: snapshot.gitHeadCommit,
        gitBranch: snapshot.gitBranch,
        createdAt: snapshot.createdAt.toISOString(),
      };
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      getLogger().error('repository.snapshot_failed', error, {
        projectId,
        sourceId: source.id,
        durationMs,
      });
      throw error;
    }
  }

  /**
   * Sets the active baseline snapshot for change detection.
   */
  async setBaseline(projectId: string, snapshotId: string): Promise<RepositorySnapshotDto> {
    if (!projectId || !snapshotId) {
      throw new ProjectValidationError('Project ID and Snapshot ID are required.');
    }

    const source = await this.sourceRepo.getSourceByProjectId(projectId);
    if (!source) throw new SourceNotFoundError();

    const snapshot = await this.snapshotRepo.getSnapshotById(snapshotId);
    if (!snapshot || snapshot.sourceId !== source.id) {
      throw new ProjectValidationError('Snapshot not found for the attached repository source.');
    }

    await this.snapshotRepo.setActiveBaseline(source.id, snapshot.id);

    getLogger().info('repository.baseline_changed', {
      projectId,
      sourceId: source.id,
      snapshotId: snapshot.id,
    });

    return {
      id: snapshot.id,
      sourceId: snapshot.sourceId,
      indexRunId: snapshot.indexRunId,
      label: snapshot.label,
      kind: snapshot.kind as SnapshotKind,
      status: snapshot.status as SnapshotStatus,
      snapshotVersion: snapshot.snapshotVersion,
      fingerprint: snapshot.fingerprint,
      fileCount: snapshot.fileCount,
      sourceFileCount: snapshot.sourceFileCount,
      testFileCount: snapshot.testFileCount,
      isBaseline: true,
      gitHeadCommit: snapshot.gitHeadCommit,
      gitBranch: snapshot.gitBranch,
      createdAt: snapshot.createdAt.toISOString(),
    };
  }

  /**
   * Deletes a repository snapshot.
   */
  async deleteSnapshot(projectId: string, snapshotId: string): Promise<void> {
    const source = await this.sourceRepo.getSourceByProjectId(projectId);
    if (!source) throw new SourceNotFoundError();

    const snapshot = await this.snapshotRepo.getSnapshotById(snapshotId);
    if (!snapshot || snapshot.sourceId !== source.id) {
      throw new ProjectValidationError('Snapshot not found.');
    }

    await this.snapshotRepo.deleteSnapshot(source.id, snapshotId);
  }
}
