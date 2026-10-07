/**
 * @file apps/desktop/src/main/ipc/workspace-session-handlers.ts
 * Privileged IPC handlers for Workspace Sessions and Shell Layout state.
 */

import crypto from 'node:crypto';
import type {
  WorkspaceSessionDto,
  WorkspaceSessionSummaryDto,
  ListWorkspaceSessionsInputDto,
  GetWorkspaceSessionInputDto,
  CreateWorkspaceSessionInputDto,
  UpdateWorkspaceSessionInputDto,
  DeleteWorkspaceSessionInputDto,
  ShellLayoutPreferencesDto,
  UpdateShellLayoutInputDto,
} from '@ai-quality/contracts';

// In-memory store of workspace sessions partitioned by projectId
const sessionsStore = new Map<string, WorkspaceSessionDto>();

// Default shell layout state
let currentLayoutPreferences: ShellLayoutPreferencesDto = {
  sidebarCollapsed: false,
  contextPanelCollapsed: false,
  activeContextTab: 'run',
  sidebarWidthPx: 264,
  contextPanelWidthPx: 360,
  themeMode: 'dark',
};

export class WorkspaceSessionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceSessionValidationError';
  }
}

export class WorkspaceSessionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceSessionNotFoundError';
  }
}

export class WorkspaceSessionProjectMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceSessionProjectMismatchError';
  }
}

/**
 * List workspace sessions for a given project.
 */
export async function handleListWorkspaceSessions(
  rawInput: unknown,
): Promise<readonly WorkspaceSessionSummaryDto[]> {
  const input = rawInput as ListWorkspaceSessionsInputDto;
  if (!input || typeof input.projectId !== 'string' || input.projectId.trim() === '') {
    throw new WorkspaceSessionValidationError('Field "projectId" must be a non-empty string.');
  }

  const projectSessions = Array.from(sessionsStore.values())
    .filter(s => s.projectId === input.projectId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const limit = typeof input.limit === 'number' && input.limit > 0 ? input.limit : 50;
  return projectSessions.slice(0, limit).map(s => ({
    id: s.id,
    projectId: s.projectId,
    title: s.title,
    status: s.status,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
}

/**
 * Get a specific workspace session by ID with project ownership validation.
 */
export async function handleGetWorkspaceSession(
  rawInput: unknown,
): Promise<WorkspaceSessionDto | null> {
  const input = rawInput as GetWorkspaceSessionInputDto;
  if (!input || typeof input.projectId !== 'string' || input.projectId.trim() === '') {
    throw new WorkspaceSessionValidationError('Field "projectId" must be a non-empty string.');
  }
  if (!input || typeof input.sessionId !== 'string' || input.sessionId.trim() === '') {
    throw new WorkspaceSessionValidationError('Field "sessionId" must be a non-empty string.');
  }

  const session = sessionsStore.get(input.sessionId);
  if (!session) {
    return null;
  }

  if (session.projectId !== input.projectId) {
    throw new WorkspaceSessionProjectMismatchError(
      `Session "${input.sessionId}" does not belong to project "${input.projectId}".`,
    );
  }

  return session;
}

/**
 * Create a new workspace session for a project.
 */
export async function handleCreateWorkspaceSession(
  rawInput: unknown,
): Promise<WorkspaceSessionDto> {
  const input = rawInput as CreateWorkspaceSessionInputDto;
  if (!input || typeof input.projectId !== 'string' || input.projectId.trim() === '') {
    throw new WorkspaceSessionValidationError('Field "projectId" must be a non-empty string.');
  }
  if (!input || typeof input.title !== 'string' || input.title.trim() === '') {
    throw new WorkspaceSessionValidationError('Field "title" must be a non-empty string.');
  }

  const now = new Date().toISOString();
  const newSession: WorkspaceSessionDto = {
    id: crypto.randomUUID(),
    projectId: input.projectId.trim(),
    title: input.title.trim(),
    status: 'IDLE',
    createdAt: now,
    updatedAt: now,
    activeContext: input.activeContext ?? { activeTab: 'run' },
  };

  sessionsStore.set(newSession.id, newSession);
  return newSession;
}

/**
 * Update an existing workspace session.
 */
export async function handleUpdateWorkspaceSession(
  rawInput: unknown,
): Promise<WorkspaceSessionDto> {
  const input = rawInput as UpdateWorkspaceSessionInputDto;
  if (!input || typeof input.projectId !== 'string' || input.projectId.trim() === '') {
    throw new WorkspaceSessionValidationError('Field "projectId" must be a non-empty string.');
  }
  if (!input || typeof input.sessionId !== 'string' || input.sessionId.trim() === '') {
    throw new WorkspaceSessionValidationError('Field "sessionId" must be a non-empty string.');
  }

  const session = sessionsStore.get(input.sessionId);
  if (!session) {
    throw new WorkspaceSessionNotFoundError(`Session "${input.sessionId}" not found.`);
  }

  if (session.projectId !== input.projectId) {
    throw new WorkspaceSessionProjectMismatchError(
      `Session "${input.sessionId}" does not belong to project "${input.projectId}".`,
    );
  }

  const updated: WorkspaceSessionDto = {
    ...session,
    title:
      typeof input.title === 'string' && input.title.trim() ? input.title.trim() : session.title,
    status: input.status ?? session.status,
    activeContext: input.activeContext
      ? { ...session.activeContext, ...input.activeContext }
      : session.activeContext,
    updatedAt: new Date().toISOString(),
  };

  sessionsStore.set(updated.id, updated);
  return updated;
}

/**
 * Delete an existing workspace session.
 */
export async function handleDeleteWorkspaceSession(
  rawInput: unknown,
): Promise<{ readonly deleted: boolean }> {
  const input = rawInput as DeleteWorkspaceSessionInputDto;
  if (!input || typeof input.projectId !== 'string' || input.projectId.trim() === '') {
    throw new WorkspaceSessionValidationError('Field "projectId" must be a non-empty string.');
  }
  if (!input || typeof input.sessionId !== 'string' || input.sessionId.trim() === '') {
    throw new WorkspaceSessionValidationError('Field "sessionId" must be a non-empty string.');
  }

  const session = sessionsStore.get(input.sessionId);
  if (!session) {
    return { deleted: false };
  }

  if (session.projectId !== input.projectId) {
    throw new WorkspaceSessionProjectMismatchError(
      `Session "${input.sessionId}" does not belong to project "${input.projectId}".`,
    );
  }

  sessionsStore.delete(input.sessionId);
  return { deleted: true };
}

/**
 * Get current shell layout preferences.
 */
export async function handleGetShellLayout(): Promise<ShellLayoutPreferencesDto> {
  return { ...currentLayoutPreferences };
}

/**
 * Update shell layout preferences.
 */
export async function handleUpdateShellLayout(
  rawInput: unknown,
): Promise<ShellLayoutPreferencesDto> {
  const input = (rawInput ?? {}) as UpdateShellLayoutInputDto;
  currentLayoutPreferences = {
    ...currentLayoutPreferences,
    ...(input.sidebarCollapsed !== undefined
      ? { sidebarCollapsed: Boolean(input.sidebarCollapsed) }
      : {}),
    ...(input.contextPanelCollapsed !== undefined
      ? { contextPanelCollapsed: Boolean(input.contextPanelCollapsed) }
      : {}),
    ...(input.activeContextTab ? { activeContextTab: input.activeContextTab } : {}),
    ...(typeof input.sidebarWidthPx === 'number' &&
    input.sidebarWidthPx >= 180 &&
    input.sidebarWidthPx <= 400
      ? { sidebarWidthPx: input.sidebarWidthPx }
      : {}),
    ...(typeof input.contextPanelWidthPx === 'number' &&
    input.contextPanelWidthPx >= 240 &&
    input.contextPanelWidthPx <= 600
      ? { contextPanelWidthPx: input.contextPanelWidthPx }
      : {}),
  };

  return { ...currentLayoutPreferences };
}

/**
 * Testing helper to reset workspace sessions store.
 */
export function resetWorkspaceSessionsStoreForTest(): void {
  sessionsStore.clear();
  currentLayoutPreferences = {
    sidebarCollapsed: false,
    contextPanelCollapsed: false,
    activeContextTab: 'run',
    sidebarWidthPx: 264,
    contextPanelWidthPx: 360,
    themeMode: 'dark',
  };
}
