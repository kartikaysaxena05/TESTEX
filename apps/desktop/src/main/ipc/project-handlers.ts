/**
 * @file apps/desktop/src/main/ipc/project-handlers.ts
 * Privileged IPC handlers for Project and Environment management.
 */

import { ProjectService, ProjectValidationError } from '@ai-quality/core';
import {
  createProjectSchema,
  updateProjectSchema,
  listProjectsSchema,
  createEnvironmentSchema,
  updateEnvironmentSchema,
  deleteEnvironmentSchema,
  setDefaultEnvironmentSchema,
  projectIdSchema,
  type ProjectSummary,
  type ProjectDetails,
  type ProjectEnvironmentDto,
} from '@ai-quality/contracts';
import { ZodError } from 'zod';

let defaultProjectService: ProjectService | null = null;

export function getProjectService(): ProjectService {
  if (!defaultProjectService) {
    defaultProjectService = new ProjectService();
  }
  return defaultProjectService;
}

export function setProjectServiceForTest(service: ProjectService | null): void {
  defaultProjectService = service;
}

/**
 * Maps known domain errors and Zod validation errors to DesktopResult error envelopes.
 */
export function handleProjectServiceError(error: unknown): never {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const message = firstIssue ? firstIssue.message : 'Invalid request payload.';
    const err = new ProjectValidationError(message);
    err.name = 'ProjectValidationError';
    throw err;
  }
  throw error;
}

export async function handleListProjects(
  rawInput?: unknown,
  service: ProjectService = getProjectService(),
): Promise<readonly ProjectSummary[]> {
  const parseResult = listProjectsSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleProjectServiceError(parseResult.error);
  }
  return service.listProjects(parseResult.data);
}

export async function handleGetProject(
  rawProjectId: unknown,
  service: ProjectService = getProjectService(),
): Promise<ProjectDetails> {
  const parseResult = projectIdSchema.safeParse(rawProjectId);
  if (!parseResult.success) {
    handleProjectServiceError(parseResult.error);
  }
  return service.getProject(parseResult.data);
}

export async function handleCreateProject(
  rawInput: unknown,
  service: ProjectService = getProjectService(),
): Promise<ProjectDetails> {
  const parseResult = createProjectSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleProjectServiceError(parseResult.error);
  }
  return service.createProject(parseResult.data);
}

export async function handleUpdateProject(
  rawInput: unknown,
  service: ProjectService = getProjectService(),
): Promise<ProjectDetails> {
  const parseResult = updateProjectSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleProjectServiceError(parseResult.error);
  }
  return service.updateProject(parseResult.data);
}

export async function handleArchiveProject(
  rawProjectId: unknown,
  service: ProjectService = getProjectService(),
): Promise<ProjectDetails> {
  const parseResult = projectIdSchema.safeParse(rawProjectId);
  if (!parseResult.success) {
    handleProjectServiceError(parseResult.error);
  }
  return service.archiveProject(parseResult.data);
}

export async function handleRestoreProject(
  rawProjectId: unknown,
  service: ProjectService = getProjectService(),
): Promise<ProjectDetails> {
  const parseResult = projectIdSchema.safeParse(rawProjectId);
  if (!parseResult.success) {
    handleProjectServiceError(parseResult.error);
  }
  return service.restoreProject(parseResult.data);
}

export async function handleDeleteProject(
  rawProjectId: unknown,
  service: ProjectService = getProjectService(),
): Promise<{ readonly deleted: true }> {
  const parseResult = projectIdSchema.safeParse(rawProjectId);
  if (!parseResult.success) {
    handleProjectServiceError(parseResult.error);
  }
  return service.deleteProject(parseResult.data);
}

export async function handleCreateEnvironment(
  rawInput: unknown,
  service: ProjectService = getProjectService(),
): Promise<ProjectEnvironmentDto> {
  const parseResult = createEnvironmentSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleProjectServiceError(parseResult.error);
  }
  return service.createEnvironment(parseResult.data);
}

export async function handleUpdateEnvironment(
  rawInput: unknown,
  service: ProjectService = getProjectService(),
): Promise<ProjectEnvironmentDto> {
  const parseResult = updateEnvironmentSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleProjectServiceError(parseResult.error);
  }
  return service.updateEnvironment(parseResult.data);
}

export async function handleDeleteEnvironment(
  rawInput: unknown,
  service: ProjectService = getProjectService(),
): Promise<{ readonly deleted: true }> {
  const parseResult = deleteEnvironmentSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleProjectServiceError(parseResult.error);
  }
  return service.deleteEnvironment(parseResult.data);
}

export async function handleSetDefaultEnvironment(
  rawInput: unknown,
  service: ProjectService = getProjectService(),
): Promise<ProjectEnvironmentDto> {
  const parseResult = setDefaultEnvironmentSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleProjectServiceError(parseResult.error);
  }
  return service.setDefaultEnvironment(parseResult.data);
}
