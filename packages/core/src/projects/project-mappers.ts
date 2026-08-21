/**
 * @file packages/core/src/projects/project-mappers.ts
 * Serializable DTO mappers converting Prisma models into platform-neutral contracts.
 */

import type { ProjectEnvironment, Project } from '@prisma/client';
import type {
  ProjectEnvironmentDto,
  ProjectSummary,
  ProjectDetails,
  EnvironmentType,
  ProjectStatus,
} from '@ai-quality/contracts';

export function mapEnvironmentToDto(env: ProjectEnvironment): ProjectEnvironmentDto {
  return {
    id: env.id,
    projectId: env.projectId,
    name: env.name,
    type: env.type as EnvironmentType,
    baseUrl: env.baseUrl,
    isDefault: env.isDefault,
    createdAt: env.createdAt.toISOString(),
    updatedAt: env.updatedAt.toISOString(),
  };
}

export interface ProjectWithEnvironments extends Project {
  environments: ProjectEnvironment[];
}

export function mapProjectToSummary(project: ProjectWithEnvironments): ProjectSummary {
  const defaultEnv = project.environments.find(e => e.isDefault);

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status as ProjectStatus,
    environmentCount: project.environments.length,
    defaultEnvironment: defaultEnv ? mapEnvironmentToDto(defaultEnv) : null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export function mapProjectToDetails(project: ProjectWithEnvironments): ProjectDetails {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status as ProjectStatus,
    environments: project.environments.map(mapEnvironmentToDto),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}
