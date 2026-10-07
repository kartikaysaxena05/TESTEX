/**
 * @file apps/desktop/src/main/ipc/project-handlers.ts
 * Privileged IPC handlers for Project and Environment management.
 */

import type { IpcMainInvokeEvent } from 'electron';
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
  markProjectOpenedSchema,
  type ProjectSummary,
  type ProjectDetails,
  type ProjectEnvironmentDto,
} from '@ai-quality/contracts';
import { ZodError } from 'zod';
import { assertAuthenticated } from './auth-handlers.js';

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

function isIpcEvent(val: unknown): val is IpcMainInvokeEvent {
  return typeof val === 'object' && val !== null && 'senderFrame' in val;
}

async function extractUser(event?: IpcMainInvokeEvent): Promise<string | null> {
  if (!event) return null;
  const user = await assertAuthenticated(event);
  return user.userId;
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
  arg1?: unknown,
  arg2?: unknown,
  arg3?: ProjectService,
): Promise<readonly ProjectSummary[]> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  const rawInput = isIpcEvent(arg1) ? arg2 : arg1;
  const service = (isIpcEvent(arg1) ? arg3 : (arg2 as ProjectService | undefined)) ?? getProjectService();

  const userId = await extractUser(event);
  const parseResult = listProjectsSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleProjectServiceError(parseResult.error);
  }
  return service.listProjects(parseResult.data, userId);
}

export async function handleGetProject(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: ProjectService,
): Promise<ProjectDetails> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  const rawProjectId = isIpcEvent(arg1) ? arg2 : arg1;
  const service = (isIpcEvent(arg1) ? arg3 : (arg2 as ProjectService | undefined)) ?? getProjectService();

  const userId = await extractUser(event);
  const parseResult = projectIdSchema.safeParse(rawProjectId);
  if (!parseResult.success) {
    handleProjectServiceError(parseResult.error);
  }
  return service.getProject(parseResult.data, userId);
}

export async function handleCreateProject(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: ProjectService,
): Promise<ProjectDetails> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  const rawInput = isIpcEvent(arg1) ? arg2 : arg1;
  const service = (isIpcEvent(arg1) ? arg3 : (arg2 as ProjectService | undefined)) ?? getProjectService();

  const userId = await extractUser(event);
  const parseResult = createProjectSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleProjectServiceError(parseResult.error);
  }
  return service.createProject(parseResult.data, userId);
}

export async function handleUpdateProject(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: ProjectService,
): Promise<ProjectDetails> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  const rawInput = isIpcEvent(arg1) ? arg2 : arg1;
  const service = (isIpcEvent(arg1) ? arg3 : (arg2 as ProjectService | undefined)) ?? getProjectService();

  const userId = await extractUser(event);
  const parseResult = updateProjectSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleProjectServiceError(parseResult.error);
  }
  return service.updateProject(parseResult.data, userId);
}

export async function handleArchiveProject(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: ProjectService,
): Promise<ProjectDetails> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  const rawProjectId = isIpcEvent(arg1) ? arg2 : arg1;
  const service = (isIpcEvent(arg1) ? arg3 : (arg2 as ProjectService | undefined)) ?? getProjectService();

  const userId = await extractUser(event);
  const parseResult = projectIdSchema.safeParse(rawProjectId);
  if (!parseResult.success) {
    handleProjectServiceError(parseResult.error);
  }
  return service.archiveProject(parseResult.data, userId);
}

export async function handleRestoreProject(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: ProjectService,
): Promise<ProjectDetails> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  const rawProjectId = isIpcEvent(arg1) ? arg2 : arg1;
  const service = (isIpcEvent(arg1) ? arg3 : (arg2 as ProjectService | undefined)) ?? getProjectService();

  const userId = await extractUser(event);
  const parseResult = projectIdSchema.safeParse(rawProjectId);
  if (!parseResult.success) {
    handleProjectServiceError(parseResult.error);
  }
  return service.restoreProject(parseResult.data, userId);
}

export async function handleDeleteProject(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: ProjectService,
): Promise<{ readonly deleted: true }> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  const rawProjectId = isIpcEvent(arg1) ? arg2 : arg1;
  const service = (isIpcEvent(arg1) ? arg3 : (arg2 as ProjectService | undefined)) ?? getProjectService();

  const userId = await extractUser(event);
  const parseResult = projectIdSchema.safeParse(rawProjectId);
  if (!parseResult.success) {
    handleProjectServiceError(parseResult.error);
  }
  return service.deleteProject(parseResult.data, userId);
}

export async function handleMarkProjectOpened(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: ProjectService,
): Promise<{ readonly success: true }> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  const rawInput = isIpcEvent(arg1) ? arg2 : arg1;
  const service = (isIpcEvent(arg1) ? arg3 : (arg2 as ProjectService | undefined)) ?? getProjectService();

  const userId = await extractUser(event);
  const parseResult = markProjectOpenedSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleProjectServiceError(parseResult.error);
  }
  return service.markOpened(parseResult.data.projectId, userId);
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
