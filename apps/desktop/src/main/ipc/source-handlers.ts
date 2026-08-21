/**
 * @file apps/desktop/src/main/ipc/source-handlers.ts
 * Privileged IPC handlers managing source attachment, detachment, validation, metadata refresh, and retrieval.
 */

import {
  sourceProjectIdSchema,
  type ProjectSourceDto,
  type AttachLocalDirectoryResult,
  type DetachSourceResult,
} from '@ai-quality/contracts';
import { SourceService } from '@ai-quality/core';
import { showFolderPickerDialog } from '../dialogs/folder-picker.js';

let defaultSourceService: SourceService | null = null;

export function getSourceService(): SourceService {
  if (!defaultSourceService) {
    defaultSourceService = new SourceService();
  }
  return defaultSourceService;
}

export function setSourceServiceForTest(service: SourceService | null): void {
  defaultSourceService = service;
}

/**
 * Handles get source request for a project.
 */
export async function handleGetSource(
  projectId: unknown,
  service: SourceService = getSourceService(),
): Promise<ProjectSourceDto | null> {
  const validated = sourceProjectIdSchema.parse({ projectId });
  return service.getSource(validated.projectId);
}

/**
 * Handles attach local directory request: validates project, opens native folder picker,
 * and attaches selected directory.
 */
export async function handleAttachLocalDirectory(
  projectId: unknown,
  service: SourceService = getSourceService(),
  pickerFn: typeof showFolderPickerDialog = showFolderPickerDialog,
): Promise<AttachLocalDirectoryResult> {
  const validated = sourceProjectIdSchema.parse({ projectId });

  // 1. Open native OS folder picker dialog
  const pickerResult = await pickerFn();
  if (pickerResult.cancelled) {
    return { cancelled: true };
  }

  // 2. Attach selected canonical directory and compute identity
  const source = await service.attachLocalDirectory(
    validated.projectId,
    pickerResult.directoryPath,
  );

  return {
    cancelled: false,
    source,
  };
}

/**
 * Handles detach source request for a project.
 */
export async function handleDetachSource(
  projectId: unknown,
  service: SourceService = getSourceService(),
): Promise<DetachSourceResult> {
  const validated = sourceProjectIdSchema.parse({ projectId });
  return service.detachSource(validated.projectId);
}

/**
 * Handles validate source availability request for a project.
 */
export async function handleValidateSource(
  projectId: unknown,
  service: SourceService = getSourceService(),
): Promise<ProjectSourceDto> {
  const validated = sourceProjectIdSchema.parse({ projectId });
  return service.validateSource(validated.projectId);
}

/**
 * Handles refresh source metadata and identity request for a project.
 */
export async function handleRefreshSourceMetadata(
  projectId: unknown,
  service: SourceService = getSourceService(),
): Promise<ProjectSourceDto> {
  const validated = sourceProjectIdSchema.parse({ projectId });
  return service.refreshMetadata(validated.projectId);
}
