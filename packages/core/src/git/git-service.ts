/**
 * @file packages/core/src/git/git-service.ts
 * Privileged business service managing Git repository detection, metadata collection, and validation.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { GitStatusDto } from '@ai-quality/contracts';
import { getLogger } from '../logging/logger.js';
import { ProjectRepository } from '../projects/project-repository.js';
import {
  ProjectNotFoundError,
  ProjectArchivedError,
  ProjectValidationError,
} from '../projects/project-errors.js';
import { SourceRepository } from '../sources/source-repository.js';
import { SourceNotFoundError } from '../sources/source-errors.js';
import { checkPathAvailability } from '../sources/source-path-validation.js';
import { GitCommandRunner } from './git-command-runner.js';
import { GitRepository } from './git-repository.js';
import { mapProjectGitMetadataToDto } from './git-mappers.js';

export class GitService {
  constructor(
    private readonly gitRepository: GitRepository = new GitRepository(),
    private readonly sourceRepository: SourceRepository = new SourceRepository(),
    private readonly projectRepository: ProjectRepository = new ProjectRepository(),
    private readonly gitRunner: GitCommandRunner = new GitCommandRunner(),
  ) {}

  /**
   * Retrieves the current Git status and metadata for a project's attached source.
   */
  async getGitStatus(projectId: string): Promise<GitStatusDto | null> {
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

    const versionInfo = await this.gitRunner.checkGitVersion();
    const stored = await this.gitRepository.getGitMetadataBySourceId(source.id);

    if (stored) {
      return mapProjectGitMetadataToDto(stored, versionInfo.available, versionInfo.version);
    }

    // If active and never inspected before, perform initial inspection
    if (project.status === 'ACTIVE') {
      return this.refreshGitMetadata(projectId);
    }

    return {
      gitAvailable: versionInfo.available,
      gitVersion: versionInfo.version,
      isGitRepository: false,
      repositoryRoot: null,
      sourceRelationToRepository: 'UNKNOWN',
      currentBranch: null,
      headCommit: null,
      isDetachedHead: false,
      lastCheckedAt: new Date().toISOString(),
    };
  }

  /**
   * Rechecks and refreshes Git repository identity and metadata for an active project's attached source.
   */
  async refreshGitMetadata(projectId: string): Promise<GitStatusDto> {
    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot refresh Git metadata on an archived project.');
    }

    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!source) {
      throw new SourceNotFoundError();
    }

    const now = new Date();
    const versionInfo = await this.gitRunner.checkGitVersion();

    // 1. Check if Git executable is available
    if (!versionInfo.available) {
      getLogger().warn('git.executable_missing', { projectId, sourceId: source.id });
      const metadata = await this.gitRepository.upsertGitMetadata(source.id, {
        isGitRepository: false,
        repositoryRoot: null,
        sourceRelationToRepository: 'UNKNOWN',
        currentBranch: null,
        headCommit: null,
        isDetachedHead: false,
        lastCheckedAt: now,
      });
      return mapProjectGitMetadataToDto(metadata, false, null);
    }

    // 2. Check if source root exists on disk
    const isSourceAvailable = checkPathAvailability(source.rootPath);
    if (!isSourceAvailable) {
      getLogger().warn('git.source_unavailable', { projectId, sourceId: source.id });
      const metadata = await this.gitRepository.upsertGitMetadata(source.id, {
        isGitRepository: false,
        repositoryRoot: null,
        sourceRelationToRepository: 'UNKNOWN',
        currentBranch: null,
        headCommit: null,
        isDetachedHead: false,
        lastCheckedAt: now,
      });
      return mapProjectGitMetadataToDto(metadata, versionInfo.available, versionInfo.version);
    }

    // 3. Check if inside Git worktree
    const isInside = await this.gitRunner.isInsideWorkTree(source.rootPath);
    if (!isInside) {
      getLogger().info('git.repository_not_detected', { projectId, sourceId: source.id });
      const metadata = await this.gitRepository.upsertGitMetadata(source.id, {
        isGitRepository: false,
        repositoryRoot: null,
        sourceRelationToRepository: 'UNKNOWN',
        currentBranch: null,
        headCommit: null,
        isDetachedHead: false,
        lastCheckedAt: now,
      });
      return mapProjectGitMetadataToDto(metadata, versionInfo.available, versionInfo.version);
    }

    // 4. Resolve top-level root and determine relation
    const repositoryRoot = await this.gitRunner.getShowTopLevel(source.rootPath);

    let canonicalSourceRoot: string;
    try {
      canonicalSourceRoot = fs.existsSync(source.rootPath)
        ? fs.realpathSync(source.rootPath)
        : path.normalize(source.rootPath);
    } catch {
      canonicalSourceRoot = path.normalize(source.rootPath);
    }

    let relation: 'ROOT' | 'NESTED' | 'UNKNOWN' = 'UNKNOWN';
    if (repositoryRoot) {
      relation = repositoryRoot === canonicalSourceRoot ? 'ROOT' : 'NESTED';
    }

    // 5. Inspect detached HEAD, branch, and commit
    const isDetached = await this.gitRunner.isDetachedHead(source.rootPath);
    const currentBranch = isDetached
      ? null
      : await this.gitRunner.getCurrentBranch(source.rootPath);
    const headCommit = await this.gitRunner.getHeadCommit(source.rootPath);

    const metadata = await this.gitRepository.upsertGitMetadata(source.id, {
      isGitRepository: true,
      repositoryRoot,
      sourceRelationToRepository: relation,
      currentBranch,
      headCommit,
      isDetachedHead: isDetached,
      lastCheckedAt: now,
    });

    getLogger().info('git.repository_detected', {
      projectId,
      sourceId: source.id,
      relation,
      branch: currentBranch,
      commit: headCommit ? headCommit.substring(0, 8) : null,
      isDetached,
    });

    return mapProjectGitMetadataToDto(metadata, versionInfo.available, versionInfo.version);
  }
}
