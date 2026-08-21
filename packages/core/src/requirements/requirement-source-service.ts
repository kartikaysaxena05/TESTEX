/**
 * @file packages/core/src/requirements/requirement-source-service.ts
 * Privileged domain service for managing Requirement Sources with strict project validation.
 */

import type {
  RequirementSourceDto,
  ListRequirementSourcesInput,
  GetRequirementSourceInput,
} from '@ai-quality/contracts';
import { getLogger } from '../logging/logger.js';
import { ProjectRepository } from '../projects/project-repository.js';
import {
  ProjectNotFoundError,
  ProjectArchivedError,
  ProjectValidationError,
} from '../projects/project-errors.js';
import {
  RequirementSourceRepository,
  type RequirementSourceWithCount,
  type CreateRequirementSourceRecordInput,
} from './requirement-source-repository.js';

export class RequirementSourceService {
  constructor(
    private readonly sourceRepo: RequirementSourceRepository = new RequirementSourceRepository(),
    private readonly projectRepo: ProjectRepository = new ProjectRepository(),
  ) {}

  /**
   * Lists all requirement sources for an active project.
   */
  async listSources(input: ListRequirementSourcesInput): Promise<readonly RequirementSourceDto[]> {
    if (!input.projectId || typeof input.projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) throw new ProjectNotFoundError();

    const sources = await this.sourceRepo.listSourcesForProject(input.projectId);
    return sources.map(s => this.mapSourceToDto(s));
  }

  /**
   * Retrieves a single requirement source scoped to a project.
   */
  async getSource(input: GetRequirementSourceInput): Promise<RequirementSourceDto | null> {
    if (!input.projectId || typeof input.projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!input.sourceId || typeof input.sourceId !== 'string') {
      throw new ProjectValidationError('Source ID is required.');
    }

    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) throw new ProjectNotFoundError();

    const source = await this.sourceRepo.getSourceById(input.projectId, input.sourceId);
    if (!source) return null;

    return this.mapSourceToDto(source);
  }

  /**
   * Creates a new requirement source for a project.
   */
  async createSource(
    projectId: string,
    input: Omit<CreateRequirementSourceRecordInput, 'projectId'>,
  ): Promise<RequirementSourceDto> {
    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!input.name || !input.name.trim()) {
      throw new ProjectValidationError('Requirement source name is required.');
    }

    const project = await this.projectRepo.getProjectById(projectId);
    if (!project) throw new ProjectNotFoundError();

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot create requirement source in an archived project.');
    }

    getLogger().info('requirement.source_created', {
      projectId,
      sourceName: input.name,
      sourceType: input.sourceType ?? 'MANUAL',
    });

    const source = await this.sourceRepo.createSource({
      projectId,
      name: input.name.trim(),
      sourceType: input.sourceType,
      status: input.status,
      description: input.description,
      metadata: input.metadata,
    });

    return this.mapSourceToDto(source);
  }

  private mapSourceToDto(source: RequirementSourceWithCount): RequirementSourceDto {
    return {
      id: source.id,
      projectId: source.projectId,
      name: source.name,
      sourceType: source.sourceType,
      status: source.status,
      description: source.description,
      metadata: source.metadata ? (source.metadata as Record<string, unknown>) : null,
      requirementCount: source._count?.requirements ?? 0,
      createdAt: source.createdAt.toISOString(),
      updatedAt: source.updatedAt.toISOString(),
    };
  }
}
