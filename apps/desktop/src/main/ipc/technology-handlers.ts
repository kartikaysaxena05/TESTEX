/**
 * @file apps/desktop/src/main/ipc/technology-handlers.ts
 * IPC handler functions for repository technology and programming language profile inspection.
 */

import { projectIdSchema, type TechnologyProfileDto } from '@ai-quality/contracts';
import { TechnologyProfileService } from '@ai-quality/core';

export async function handleGetTechnologyProfile(
  rawProjectId: unknown,
  service: TechnologyProfileService = new TechnologyProfileService(),
): Promise<TechnologyProfileDto | null> {
  const projectId = projectIdSchema.parse(rawProjectId);
  return await service.getTechnologyProfile(projectId);
}

export async function handleRefreshTechnologyProfile(
  rawProjectId: unknown,
  service: TechnologyProfileService = new TechnologyProfileService(),
): Promise<TechnologyProfileDto> {
  const projectId = projectIdSchema.parse(rawProjectId);
  return await service.refreshTechnologyProfile(projectId);
}
