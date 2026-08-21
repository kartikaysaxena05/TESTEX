/**
 * @file apps/desktop/src/main/ipc/classification-handlers.ts
 * IPC handler functions for repository source file classification.
 */

import { projectIdSchema, type ClassificationProfileDto } from '@ai-quality/contracts';
import { ClassificationProfileService } from '@ai-quality/core';

export async function handleGetClassificationProfile(
  rawProjectId: unknown,
  service: ClassificationProfileService = new ClassificationProfileService(),
): Promise<ClassificationProfileDto | null> {
  const projectId = projectIdSchema.parse(rawProjectId);
  return await service.getClassificationProfile(projectId);
}

export async function handleRefreshClassificationProfile(
  rawProjectId: unknown,
  service: ClassificationProfileService = new ClassificationProfileService(),
): Promise<ClassificationProfileDto> {
  const projectId = projectIdSchema.parse(rawProjectId);
  return await service.refreshClassificationProfile(projectId);
}
