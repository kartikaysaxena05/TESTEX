/**
 * @file apps/desktop/src/main/ipc/structure-handlers.ts
 * Privileged IPC handlers managing repository structure discovery.
 */

import { sourceProjectIdSchema, type SourceStructureDto } from '@ai-quality/contracts';
import { SourceStructureService } from '@ai-quality/core';

let defaultStructureService: SourceStructureService | null = null;

export function getSourceStructureService(): SourceStructureService {
  if (!defaultStructureService) {
    defaultStructureService = new SourceStructureService();
  }
  return defaultStructureService;
}

export function setSourceStructureServiceForTest(service: SourceStructureService | null): void {
  defaultStructureService = service;
}

/**
 * Handles get repository structure request for a project.
 */
export async function handleGetSourceStructure(
  projectId: unknown,
  service: SourceStructureService = getSourceStructureService(),
): Promise<SourceStructureDto | null> {
  const validated = sourceProjectIdSchema.parse({ projectId });
  return service.getSourceStructure(validated.projectId);
}

/**
 * Handles refresh repository structure request for a project.
 */
export async function handleRefreshSourceStructure(
  projectId: unknown,
  service: SourceStructureService = getSourceStructureService(),
): Promise<SourceStructureDto> {
  const validated = sourceProjectIdSchema.parse({ projectId });
  return service.refreshStructure(validated.projectId);
}
