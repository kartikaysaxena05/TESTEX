/**
 * @file packages/core/src/projects/project-mappers.ts
 * Serializable DTO mappers converting Prisma models into platform-neutral contracts.
 */

import type { ProjectEnvironment, Project, WebsiteTarget, RepositoryConnection, ProjectSource, ProjectGitMetadata } from '@prisma/client';
import type {
  ProjectEnvironmentDto,
  ProjectSummary,
  ProjectDetails,
  EnvironmentType,
  ProjectStatus,
  ProjectSourceState,
} from '@ai-quality/contracts';
import { toWebsiteTargetSummary } from '../website-targets/website-target-mappers.js';
import { toRepositoryConnectionSummary } from '../git-repositories/repository-connection-mappers.js';
import { toLocalFolderDto } from '../local-folders/local-folder-mappers.js';

export function mapEnvironmentToDto(env: ProjectEnvironment): ProjectEnvironmentDto {
  return {
    id: env.id,
    projectId: env.projectId,
    targetApplicationId: env.targetApplicationId,
    name: env.name,
    type: env.type as EnvironmentType,
    baseUrl: env.baseUrl,
    isDefault: env.isDefault,
    isEnabled: env.isEnabled,
    isProduction: env.isProduction,
    productionSafetyPolicy: env.productionSafetyPolicy,
    browserEngine: env.browserEngine as any,
    headless: env.headless,
    viewportWidth: env.viewportWidth,
    viewportHeight: env.viewportHeight,
    locale: env.locale,
    timezoneId: env.timezoneId,
    colorScheme: env.colorScheme as any,
    ignoreHttpsErrors: env.ignoreHttpsErrors,
    permissions: env.permissions,
    extraHeaders: (env.extraHeaders as Record<string, string>) || null,
    variables: (env.variables as Record<string, string>) || null,
    secretReferences: (env.secretReferences as any) || null,
    notes: env.notes,
    createdAt: env.createdAt.toISOString(),
    updatedAt: env.updatedAt.toISOString(),
  };
}

export interface ProjectWithEnvironments extends Project {
  environments: ProjectEnvironment[];
  websiteTargets?: WebsiteTarget[];
  repositoryConnections?: RepositoryConnection[];
  source?: (ProjectSource & { gitMetadata?: ProjectGitMetadata | null }) | null;
}

export function mapProjectToSummary(project: ProjectWithEnvironments): ProjectSummary {
  const defaultEnv = project.environments.find(e => e.isDefault);
  const nonDeletedTargets = project.websiteTargets?.filter(t => !t.deletedAt) ?? [];
  const activeTarget = nonDeletedTargets.find(t => t.isActive) ?? nonDeletedTargets[0] ?? null;

  const nonDeletedRepos = project.repositoryConnections?.filter(r => !r.deletedAt) ?? [];
  const activeRepo = nonDeletedRepos.find(r => r.isActive) ?? nonDeletedRepos[0] ?? null;

  const localFolderDto = project.source ? toLocalFolderDto(project.source) : null;
  const hasLocalFolder = !!project.source;
  const hasWebsite = nonDeletedTargets.length > 0;
  const hasRepo = nonDeletedRepos.length > 0;

  let sourceState: ProjectSourceState = 'NOT_CONFIGURED';
  const configuredCount = (hasWebsite ? 1 : 0) + (hasRepo ? 1 : 0) + (hasLocalFolder ? 1 : 0);
  if (configuredCount > 1) {
    sourceState = 'BOTH_CONFIGURED';
  } else if (hasRepo) {
    sourceState = 'REPOSITORY_CONFIGURED';
  } else if (hasWebsite) {
    sourceState = 'WEBSITE_CONFIGURED';
  } else if (hasLocalFolder) {
    sourceState = 'LOCAL_FOLDER_CONFIGURED';
  }

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status as ProjectStatus,
    environmentCount: project.environments.length,
    defaultEnvironment: defaultEnv ? mapEnvironmentToDto(defaultEnv) : null,
    userId: project.userId ?? null,
    lastOpenedAt: project.lastOpenedAt ? project.lastOpenedAt.toISOString() : null,
    archivedAt: project.archivedAt ? project.archivedAt.toISOString() : null,
    deletedAt: project.deletedAt ? project.deletedAt.toISOString() : null,
    isFavorite: project.isFavorite ?? false,
    sourceState,
    activeWebsiteTarget: activeTarget ? toWebsiteTargetSummary(activeTarget) : null,
    websiteTargets: nonDeletedTargets.map(toWebsiteTargetSummary),
    activeRepositoryConnection: activeRepo ? toRepositoryConnectionSummary(activeRepo) : null,
    repositoryConnections: nonDeletedRepos.map(toRepositoryConnectionSummary),
    localFolder: localFolderDto,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export function mapProjectToDetails(project: ProjectWithEnvironments): ProjectDetails {
  const nonDeletedTargets = project.websiteTargets?.filter(t => !t.deletedAt) ?? [];
  const activeTarget = nonDeletedTargets.find(t => t.isActive) ?? nonDeletedTargets[0] ?? null;

  const nonDeletedRepos = project.repositoryConnections?.filter(r => !r.deletedAt) ?? [];
  const activeRepo = nonDeletedRepos.find(r => r.isActive) ?? nonDeletedRepos[0] ?? null;

  const localFolderDto = project.source ? toLocalFolderDto(project.source) : null;
  const hasLocalFolder = !!project.source;
  const hasWebsite = nonDeletedTargets.length > 0;
  const hasRepo = nonDeletedRepos.length > 0;

  let sourceState: ProjectSourceState = 'NOT_CONFIGURED';
  const configuredCount = (hasWebsite ? 1 : 0) + (hasRepo ? 1 : 0) + (hasLocalFolder ? 1 : 0);
  if (configuredCount > 1) {
    sourceState = 'BOTH_CONFIGURED';
  } else if (hasRepo) {
    sourceState = 'REPOSITORY_CONFIGURED';
  } else if (hasWebsite) {
    sourceState = 'WEBSITE_CONFIGURED';
  } else if (hasLocalFolder) {
    sourceState = 'LOCAL_FOLDER_CONFIGURED';
  }

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status as ProjectStatus,
    environments: project.environments.map(mapEnvironmentToDto),
    userId: project.userId ?? null,
    lastOpenedAt: project.lastOpenedAt ? project.lastOpenedAt.toISOString() : null,
    archivedAt: project.archivedAt ? project.archivedAt.toISOString() : null,
    deletedAt: project.deletedAt ? project.deletedAt.toISOString() : null,
    isFavorite: project.isFavorite ?? false,
    sourceState,
    activeWebsiteTarget: activeTarget ? toWebsiteTargetSummary(activeTarget) : null,
    websiteTargets: nonDeletedTargets.map(toWebsiteTargetSummary),
    activeRepositoryConnection: activeRepo ? toRepositoryConnectionSummary(activeRepo) : null,
    repositoryConnections: nonDeletedRepos.map(toRepositoryConnectionSummary),
    localFolder: localFolderDto,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}


