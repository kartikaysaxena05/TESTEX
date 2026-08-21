/**
 * @file apps/desktop/src/main/ipc/change-handlers.ts
 * IPC handlers for baseline vs current repository change detection.
 */

import { projectIdSchema, type RepositoryChangeSetDto } from '@ai-quality/contracts';
import { ChangeService } from '@ai-quality/core';

export async function handleGetChanges(
  rawProjectId: unknown,
  service: ChangeService = new ChangeService(),
): Promise<RepositoryChangeSetDto | null> {
  const projectId = projectIdSchema.parse(rawProjectId);
  return await service.getChanges(projectId);
}

export async function handleRefreshChanges(
  rawProjectId: unknown,
  service: ChangeService = new ChangeService(),
): Promise<RepositoryChangeSetDto> {
  const projectId = projectIdSchema.parse(rawProjectId);
  return await service.refreshChanges(projectId);
}
