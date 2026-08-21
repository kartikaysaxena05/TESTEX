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
} from '@ai-quality/contracts';
import { getLogger } from '../logging/logger.js';

export class ProjectService {
  constructor(private readonly repository: ProjectRepository = new ProjectRepository()) {}

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
  async createProject(input: CreateProjectInput): Promise<ProjectDetails> {
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
    });

    getLogger().info('project.created', { projectId: project.id });
    return mapProjectToDetails(project);
  }

  /**
   * Lists projects with summary metadata, sorted by updatedAt descending.
   */
  async listProjects(input?: ListProjectsInput): Promise<ProjectSummary[]> {
    const status = input?.status ?? 'ACTIVE';
    const projects = await this.repository.listProjects(status);
    return projects.map(mapProjectToSummary);
  }

  /**
   * Retrieves a single project by ID with its environments.
   */
  async getProject(projectId: string): Promise<ProjectDetails> {
    if (!projectId || projectId.trim().length === 0) {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.repository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    return mapProjectToDetails(project);
  }

  /**
   * Updates an active project's name and description.
   */
  async updateProject(input: UpdateProjectInput): Promise<ProjectDetails> {
    const project = await this.repository.getProjectById(input.projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError(
        'Archived projects cannot be modified. Restore the project first.',
      );
    }

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

    const updated = await this.repository.updateProject(input.projectId, {
      name,
      description,
    });

    getLogger().info('project.updated', { projectId: input.projectId });
    return mapProjectToDetails(updated);
  }

  /**
   * Archives an active project.
   */
  async archiveProject(projectId: string): Promise<ProjectDetails> {
    const project = await this.repository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    if (project.status === 'ARCHIVED') {
      return mapProjectToDetails(project);
    }

    const updated = await this.repository.updateStatus(projectId, 'ARCHIVED');
    getLogger().info('project.archived', { projectId });
    return mapProjectToDetails(updated);
  }

  /**
   * Restores an archived project to active status.
   */
  async restoreProject(projectId: string): Promise<ProjectDetails> {
    const project = await this.repository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    if (project.status === 'ACTIVE') {
      return mapProjectToDetails(project);
    }

    const updated = await this.repository.updateStatus(projectId, 'ACTIVE');
    getLogger().info('project.restored', { projectId });
    return mapProjectToDetails(updated);
  }

  /**
   * Permanently deletes an archived project. Active projects cannot be deleted directly.
   */
  async deleteProject(projectId: string): Promise<{ deleted: true }> {
    const project = await this.repository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    if (project.status === 'ACTIVE') {
      throw new ProjectValidationError(
        'Active projects cannot be deleted. Archive the project first.',
      );
    }

    await this.repository.deleteProject(projectId);
    getLogger().info('project.deleted', { projectId });
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
