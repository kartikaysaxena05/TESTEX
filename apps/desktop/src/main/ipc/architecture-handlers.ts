/**
 * @file apps/desktop/src/main/ipc/architecture-handlers.ts
 * IPC handler functions for application architecture profile and entry-point discovery.
 */

import { projectIdSchema, type ApplicationArchitectureProfileDto } from '@ai-quality/contracts';
import { ArchitectureService } from '@ai-quality/core';

export async function handleGetArchitectureProfile(
  rawProjectId: unknown,
  service: ArchitectureService = new ArchitectureService(),
): Promise<ApplicationArchitectureProfileDto | null> {
  const projectId = projectIdSchema.parse(rawProjectId);
  return await service.getArchitectureProfile(projectId);
}

export async function handleRefreshArchitectureProfile(
  rawProjectId: unknown,
  service: ArchitectureService = new ArchitectureService(),
): Promise<ApplicationArchitectureProfileDto> {
  const projectId = projectIdSchema.parse(rawProjectId);
  return await service.refreshArchitectureProfile(projectId);
}
