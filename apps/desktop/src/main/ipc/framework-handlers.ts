/**
 * @file apps/desktop/src/main/ipc/framework-handlers.ts
 * IPC handler functions for repository framework and dependency inspection.
 */

import { projectIdSchema, type FrameworkProfileDto } from '@ai-quality/contracts';
import { FrameworkProfileService } from '@ai-quality/core';

export async function handleGetFrameworkProfile(
  rawProjectId: unknown,
  service: FrameworkProfileService = new FrameworkProfileService(),
): Promise<FrameworkProfileDto | null> {
  const projectId = projectIdSchema.parse(rawProjectId);
  return await service.getFrameworkProfile(projectId);
}

export async function handleRefreshFrameworkProfile(
  rawProjectId: unknown,
  service: FrameworkProfileService = new FrameworkProfileService(),
): Promise<FrameworkProfileDto> {
  const projectId = projectIdSchema.parse(rawProjectId);
  return await service.refreshFrameworkProfile(projectId);
}
