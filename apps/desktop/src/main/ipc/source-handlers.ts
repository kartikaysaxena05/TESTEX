/**
 * @file apps/desktop/src/main/ipc/source-handlers.ts
 * Privileged IPC handlers managing source attachment, detachment, validation, metadata refresh, and retrieval.
 */

import path from 'node:path';
import {
  sourceProjectIdSchema,
  type ProjectSourceDto,
  type AttachLocalDirectoryResult,
  type PickDirectoryResult,
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
 * Handles picking a local directory via the native OS folder picker dialog.
 */
export async function handlePickDirectory(
  pickerFn: typeof showFolderPickerDialog = showFolderPickerDialog,
): Promise<PickDirectoryResult> {
  const pickerResult = await pickerFn();
  if (pickerResult.cancelled) {
    return { cancelled: true };
  }

  const folderName = path.basename(pickerResult.directoryPath);
  return {
    cancelled: false,
    directoryPath: pickerResult.directoryPath,
    folderName,
  };
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
 * Handles attach local directory request: validates project, opens native folder picker
 * (or uses already selected directoryPath), and attaches directory.
 */
export async function handleAttachLocalDirectory(
  payload: unknown,
  service: SourceService = getSourceService(),
  pickerFn: typeof showFolderPickerDialog = showFolderPickerDialog,
): Promise<AttachLocalDirectoryResult> {
  let projectId: string;
  let targetPath: string | undefined;

  if (typeof payload === 'string') {
    projectId = sourceProjectIdSchema.parse({ projectId: payload }).projectId;
  } else if (payload && typeof payload === 'object') {
    const raw = payload as { projectId?: unknown; directoryPath?: unknown };
    projectId = sourceProjectIdSchema.parse({ projectId: raw.projectId }).projectId;
    if (typeof raw.directoryPath === 'string' && raw.directoryPath.trim().length > 0) {
      targetPath = raw.directoryPath.trim();
    }
  } else {
    projectId = sourceProjectIdSchema.parse({ projectId: payload }).projectId;
  }

  // 1. If directoryPath is provided, use it; otherwise open native OS folder picker dialog
  let finalPath = targetPath;
  if (!finalPath) {
    const pickerResult = await pickerFn();
    if (pickerResult.cancelled) {
      return { cancelled: true };
    }
    finalPath = pickerResult.directoryPath;
  }

  // 2. Attach selected canonical directory and compute identity
  const source = await service.attachLocalDirectory(
    projectId,
    finalPath,
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
