/**
 * @file packages/core/src/projects/project-service.ts
 * Authoritative business rules, validations, and domain orchestration for Projects.
 */

import { ProjectRepository } from './project-repository.js';
import {
  ProjectNotFoundError,
  ProjectArchivedError,
  ProjectValidationError,
  ProjectConflictError,
  ProjectAccessDeniedError,
  EnvironmentNotFoundError,
} from './project-errors.js';
import {
  mapProjectToSummary,
  mapProjectToDetails,
  mapEnvironmentToDto,
} from './project-mappers.js';
import type {
  CreateProjectInput,
  UpdateProjectInput,
  ListProjectsInput,
  CreateEnvironmentInput,
  UpdateEnvironmentInput,
  DeleteEnvironmentInput,
  SetDefaultEnvironmentInput,
  ProjectSummary,
  ProjectDetails,
  ProjectEnvironmentDto,
  AuthAuditAction,
} from '@ai-quality/contracts';
import { getLogger } from '../logging/logger.js';
import { getPrismaClient } from '../database/client.js';
import { AuthAuditService } from '../auth/auth-audit-service.js';

export class ProjectService {
  constructor(private readonly repository: ProjectRepository = new ProjectRepository()) {}

  /**
   * Enforces that the requesting user owns the target project.
   */
  private checkOwnership(project: { userId?: string | null }, userId?: string | null): void {
    if (userId && project.userId && project.userId !== userId) {
      throw new ProjectAccessDeniedError('Access denied: You do not own this project.');
    }
  }

  /**
   * Records project lifecycle events to the audit trail.
   */
  private recordAudit(
    action: AuthAuditAction,
    userId?: string | null,
    metadata?: Record<string, unknown>,
  ): void {
    if (!userId) return;
    try {
      const prisma = getPrismaClient();
      if (prisma) {
        new AuthAuditService(prisma)
          .recordEvent({
            action,
            userId,
            metadata,
          })
          .catch(err => {
            getLogger().warn('project.audit_failed', { action, error: String(err) });
          });
      }
    } catch {
      // Non-blocking audit record
    }
  }

  /**
   * Helper to validate and normalize URL inputs.
   */
  private validateBaseUrl(urlStr?: string | null): string | null {
    if (!urlStr || urlStr.trim().length === 0) {
      return null;
    }

    const trimmed = urlStr.trim();
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new ProjectValidationError('Base URL must be a valid URL.');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ProjectValidationError('Base URL must use http:// or https:// protocol.');
    }

    if (parsed.username || parsed.password) {
      throw new ProjectValidationError('Base URL must not contain embedded user credentials.');
    }

    return trimmed;
  }

  /**
   * Creates a new Project and its mandatory ProjectSettings record within a transaction.
   */
  async createProject(
    input: CreateProjectInput,
    userId?: string | null,
  ): Promise<ProjectDetails> {
    const name = input.name?.trim();
    if (!name || name.length === 0) {
      throw new ProjectValidationError('Project name is required.');
    }
    if (name.length > 120) {
      throw new ProjectValidationError('Project name must be 120 characters or fewer.');
    }

    const description = input.description?.trim() ? input.description.trim() : null;
    if (description && description.length > 5000) {
      throw new ProjectValidationError('Project description must be 5000 characters or fewer.');
    }

    const project = await this.repository.createProject({
      name,
      description,
      userId: userId ?? null,
      isFavorite: input.isFavorite ?? false,
    });

    this.recordAudit('PROJECT_CREATED', userId, {
      projectId: project.id,
      name: project.name,
    });

    getLogger().info('project.created', { projectId: project.id, userId: userId ?? null });
    return mapProjectToDetails(project);
  }

  /**
   * Lists projects with summary metadata, sorted deterministically, filtered by user and search.
   */
  async listProjects(
    input?: ListProjectsInput,
    userId?: string | null,
  ): Promise<ProjectSummary[]> {
    const projects = await this.repository.listProjects({
      status: input?.status ?? 'ACTIVE',
      userId: userId ?? undefined,
      search: input?.search,
      sortBy: input?.sortBy,
      sortDirection: input?.sortDirection,
    });
    return projects.map(mapProjectToSummary);
  }

  /**
   * Retrieves a single project by ID with its environments, verifying ownership.
   */
  async getProject(projectId: string, userId?: string | null): Promise<ProjectDetails> {
    if (!projectId || projectId.trim().length === 0) {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.repository.getProjectById(projectId);
    if (!project || project.deletedAt !== null) {
      throw new ProjectNotFoundError();
    }

    this.checkOwnership(project, userId);

    return mapProjectToDetails(project);
  }

  /**
   * Updates an active project's name, description, and favorite status.
   */
  async updateProject(
    input: UpdateProjectInput,
    userId?: string | null,
  ): Promise<ProjectDetails> {
    const project = await this.repository.getProjectById(input.projectId);
    if (!project || project.deletedAt !== null) {
      throw new ProjectNotFoundError();
    }

    this.checkOwnership(project, userId);

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError(
        'Archived projects cannot be modified. Restore the project first.',
      );
    }

    const name = input.name !== undefined ? input.name.trim() : undefined;
    if (name !== undefined) {
      if (name.length === 0) {
        throw new ProjectValidationError('Project name is required.');
      }
      if (name.length > 120) {
        throw new ProjectValidationError('Project name must be 120 characters or fewer.');
      }
    }

    const description =
      input.description !== undefined
        ? input.description?.trim()
          ? input.description.trim()
          : null
        : undefined;
    if (description && description.length > 5000) {
      throw new ProjectValidationError('Project description must be 5000 characters or fewer.');
    }

    const updated = await this.repository.updateProject(input.projectId, {
      name,
      description,
      isFavorite: input.isFavorite,
    });

    if (name && name !== project.name) {
      this.recordAudit('PROJECT_RENAMED', userId, {
        projectId: input.projectId,
        oldName: project.name,
        newName: name,
      });
    }

    getLogger().info('project.updated', { projectId: input.projectId });
    return mapProjectToDetails(updated);
  }

  /**
   * Archives an active project.
   */
  async archiveProject(projectId: string, userId?: string | null): Promise<ProjectDetails> {
    const project = await this.repository.getProjectById(projectId);
    if (!project || project.deletedAt !== null) {
      throw new ProjectNotFoundError();
    }

    this.checkOwnership(project, userId);

    if (project.status === 'ARCHIVED') {
      return mapProjectToDetails(project);
    }

    const updated = await this.repository.updateStatus(projectId, 'ARCHIVED');
    this.recordAudit('PROJECT_ARCHIVED', userId, { projectId });
    getLogger().info('project.archived', { projectId });
    return mapProjectToDetails(updated);
  }

  /**
   * Restores an archived project to active status.
   */
  async restoreProject(projectId: string, userId?: string | null): Promise<ProjectDetails> {
    const project = await this.repository.getProjectById(projectId);
    if (!project || project.deletedAt !== null) {
      throw new ProjectNotFoundError();
    }

    this.checkOwnership(project, userId);

    if (project.status === 'ACTIVE') {
      return mapProjectToDetails(project);
    }

    const updated = await this.repository.updateStatus(projectId, 'ACTIVE');
    this.recordAudit('PROJECT_RESTORED', userId, { projectId });
    getLogger().info('project.restored', { projectId });
    return mapProjectToDetails(updated);
  }

  /**
   * Records project open recency timestamp.
   */
  async markOpened(projectId: string, userId?: string | null): Promise<{ success: true }> {
    if (!projectId || projectId.trim().length === 0) {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.repository.getProjectById(projectId);
    if (!project || project.deletedAt !== null) {
      throw new ProjectNotFoundError();
    }

    this.checkOwnership(project, userId);

    await this.repository.markOpened(projectId);
    getLogger().info('project.opened', { projectId, userId });
    return { success: true };
  }

  /**
   * Permanently deletes or soft-deletes an archived project. Active projects cannot be deleted directly.
   */
  async deleteProject(
    projectId: string,
    userId?: string | null,
    options?: { soft?: boolean },
  ): Promise<{ deleted: true }> {
    const project = await this.repository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    this.checkOwnership(project, userId);

    if (project.deletedAt !== null) {
      // Double delete is safe and idempotent
      return { deleted: true };
    }

    if (project.status === 'ACTIVE') {
      throw new ProjectValidationError(
        'Active projects cannot be deleted. Archive the project first.',
      );
    }

    if (options?.soft) {
      await this.repository.softDelete(projectId);
    } else {
      await this.repository.deleteProject(projectId);
    }

    this.recordAudit('PROJECT_DELETED', userId, { projectId });
    getLogger().info('project.deleted', { projectId, soft: options?.soft ?? false });
    return { deleted: true };
  }

  /**
   * Creates an environment for an active project. Automatically marks first environment as default.
   */
  async createEnvironment(input: CreateEnvironmentInput): Promise<ProjectEnvironmentDto> {
    const project = await this.repository.getProjectById(input.projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot add environments to an archived project.');
    }

    const name = input.name?.trim();
    if (!name || name.length === 0) {
      throw new ProjectValidationError('Environment name is required.');
    }
    if (name.length > 80) {
      throw new ProjectValidationError('Environment name must be 80 characters or fewer.');
    }

    const baseUrl = this.validateBaseUrl(input.baseUrl);
    const existingCount = await this.repository.countEnvironments(input.projectId);
    const isDefault = existingCount === 0;

    try {
      const created = await this.repository.createEnvironment({
        projectId: input.projectId,
        name,
        type: input.type ?? 'DEVELOPMENT',
        baseUrl,
        isDefault,
      });

      getLogger().info('project.environment.created', {
        projectId: input.projectId,
        environmentId: created.id,
      });

      return mapEnvironmentToDto(created);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('Unique constraint') || message.includes('P2002')) {
        throw new ProjectConflictError(
          'An environment with this name already exists in this project.',
        );
      }
      throw err;
    }
  }

  /**
   * Updates an existing environment.
   */
  async updateEnvironment(input: UpdateEnvironmentInput): Promise<ProjectEnvironmentDto> {
    const project = await this.repository.getProjectById(input.projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot edit environments of an archived project.');
    }

    const env = await this.repository.getEnvironmentById(input.environmentId);
    if (!env || env.projectId !== input.projectId) {
      throw new EnvironmentNotFoundError();
    }

    const name = input.name?.trim();
    if (!name || name.length === 0) {
      throw new ProjectValidationError('Environment name is required.');
    }
    if (name.length > 80) {
      throw new ProjectValidationError('Environment name must be 80 characters or fewer.');
    }

    const baseUrl = this.validateBaseUrl(input.baseUrl);

    try {
      const updated = await this.repository.updateEnvironment({
        environmentId: input.environmentId,
        name,
        type: input.type ?? env.type,
        baseUrl,
      });

      getLogger().info('project.environment.updated', {
        projectId: input.projectId,
        environmentId: input.environmentId,
      });

      return mapEnvironmentToDto(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('Unique constraint') || message.includes('P2002')) {
        throw new ProjectConflictError(
          'An environment with this name already exists in this project.',
        );
      }
      throw err;
    }
  }

  /**
   * Deletes an environment from an active project.
   */
  async deleteEnvironment(input: DeleteEnvironmentInput): Promise<{ deleted: true }> {
    const project = await this.repository.getProjectById(input.projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot delete environments of an archived project.');
    }

    const env = await this.repository.getEnvironmentById(input.environmentId);
    if (!env || env.projectId !== input.projectId) {
      throw new EnvironmentNotFoundError();
    }

    await this.repository.deleteEnvironment(input.environmentId);
    getLogger().info('project.environment.deleted', {
      projectId: input.projectId,
      environmentId: input.environmentId,
    });

    return { deleted: true };
  }

  /**
   * Atomically switches default environment.
   */
  async setDefaultEnvironment(input: SetDefaultEnvironmentInput): Promise<ProjectEnvironmentDto> {
    const project = await this.repository.getProjectById(input.projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot change default environment of an archived project.');
    }

    const env = await this.repository.getEnvironmentById(input.environmentId);
    if (!env || env.projectId !== input.projectId) {
      throw new EnvironmentNotFoundError();
    }

    const updated = await this.repository.setDefaultEnvironment(
      input.projectId,
      input.environmentId,
    );

    getLogger().info('project.environment.default_changed', {
      projectId: input.projectId,
      environmentId: input.environmentId,
    });

    return mapEnvironmentToDto(updated);
  }
}
