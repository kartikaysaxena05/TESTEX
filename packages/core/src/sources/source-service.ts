/**
 * @file packages/core/src/sources/source-service.ts
 * Privileged business service managing source attachment, identity verification, and metadata refresh.
 */

import type { ProjectSourceDto } from '@ai-quality/contracts';
import { getLogger } from '../logging/logger.js';
import { ProjectRepository } from '../projects/project-repository.js';
import {
  ProjectNotFoundError,
  ProjectArchivedError,
  ProjectValidationError,
} from '../projects/project-errors.js';
import { SourceRepository } from './source-repository.js';
import { SourceNotFoundError } from './source-errors.js';
import { validateDirectoryPath, checkPathAvailability } from './source-path-validation.js';
import { calculateSourceRootIdentity } from './source-identity.js';
import { mapProjectSourceToDto } from './source-mappers.js';

export class SourceService {
  constructor(
    private readonly sourceRepository: SourceRepository = new SourceRepository(),
    private readonly projectRepository: ProjectRepository = new ProjectRepository(),
  ) {}

  /**
   * Retrieves the current source attachment for a project with real-time availability check.
   */
  async getSource(projectId: string): Promise<ProjectSourceDto | null> {
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

    const isAvailable = checkPathAvailability(source.rootPath);
    return mapProjectSourceToDto(source, isAvailable ? 'AVAILABLE' : 'UNAVAILABLE');
  }

  /**
   * Attaches or replaces a local directory source for an active project, deriving initial identity metadata.
   */
  async attachLocalDirectory(projectId: string, rawPath: string): Promise<ProjectSourceDto> {
    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot attach a source to an archived project.');
    }

    // Validate and canonicalize local path
    const { canonicalPath } = validateDirectoryPath(rawPath);

    // Calculate initial source root identity (constant-time O(1) root inspection)
    const identity = calculateSourceRootIdentity(canonicalPath, 'LOCAL_DIRECTORY');

    const source = await this.sourceRepository.upsertSource(projectId, {
      kind: 'LOCAL_DIRECTORY',
      displayName: identity.displayName,
      rootPath: identity.canonicalPath,
      identityFingerprint: identity.identityFingerprint,
      filesystemCreatedAt: identity.filesystemCreatedAt,
      filesystemModifiedAt: identity.filesystemModifiedAt,
      metadataRefreshedAt: identity.metadataRefreshedAt,
      lastValidatedAt: identity.metadataRefreshedAt,
    });

    getLogger().info('source.attached', {
      projectId,
      sourceId: source.id,
      kind: source.kind,
      displayName: identity.displayName,
      fingerprint: identity.identityFingerprint.substring(0, 12),
    });

    return mapProjectSourceToDto(source, 'AVAILABLE');
  }

  /**
   * Refreshes metadata and verifies identity of the attached source directory.
   */
  async refreshMetadata(projectId: string): Promise<ProjectSourceDto> {
    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot refresh source metadata for an archived project.');
    }

    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!source) {
      throw new SourceNotFoundError();
    }

    const now = new Date();
    const isAvailable = checkPathAvailability(source.rootPath);

    if (!isAvailable) {
      await this.sourceRepository.updateLastValidatedAt(projectId, now);
      getLogger().warn('source.unavailable', {
        projectId,
        sourceId: source.id,
        availability: 'UNAVAILABLE',
      });
      return mapProjectSourceToDto({ ...source, lastValidatedAt: now }, 'UNAVAILABLE');
    }

    // Recompute root identity
    const freshIdentity = calculateSourceRootIdentity(source.rootPath, source.kind);

    if (
      source.identityFingerprint &&
      source.identityFingerprint !== freshIdentity.identityFingerprint
    ) {
      getLogger().info('source.identity_changed', {
        projectId,
        sourceId: source.id,
        previousFingerprint: source.identityFingerprint.substring(0, 12),
        newFingerprint: freshIdentity.identityFingerprint.substring(0, 12),
      });
    }

    const updated = await this.sourceRepository.updateSourceMetadata(projectId, {
      identityFingerprint: freshIdentity.identityFingerprint,
      filesystemCreatedAt: freshIdentity.filesystemCreatedAt,
      filesystemModifiedAt: freshIdentity.filesystemModifiedAt,
      metadataRefreshedAt: freshIdentity.metadataRefreshedAt,
      lastValidatedAt: freshIdentity.metadataRefreshedAt,
    });

    getLogger().info('source.metadata_refreshed', {
      projectId,
      sourceId: source.id,
      fingerprint: freshIdentity.identityFingerprint.substring(0, 12),
    });

    return mapProjectSourceToDto(updated ?? source, 'AVAILABLE');
  }

  /**
   * Detaches the source record from an active project without deleting local filesystem assets.
   */
  async detachSource(projectId: string): Promise<{ readonly detached: true }> {
    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot detach source from an archived project.');
    }

    const existingSource = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!existingSource) {
      throw new SourceNotFoundError();
    }

    await this.sourceRepository.deleteSourceByProjectId(projectId);

    getLogger().info('source.detached', {
      projectId,
      sourceId: existingSource.id,
    });

    return { detached: true };
  }

  /**
   * Rechecks the availability of the attached source directory and updates lastValidatedAt.
   */
  async validateSource(projectId: string): Promise<ProjectSourceDto> {
    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!source) {
      throw new SourceNotFoundError();
    }

    // If active, delegate to refreshMetadata
    if (project.status === 'ACTIVE') {
      return this.refreshMetadata(projectId);
    }

    // If archived (read-only), just do non-mutating availability check
    const isAvailable = checkPathAvailability(source.rootPath);
    return mapProjectSourceToDto(source, isAvailable ? 'AVAILABLE' : 'UNAVAILABLE');
  }
}
