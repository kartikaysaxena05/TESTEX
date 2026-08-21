/**
 * @file apps/desktop/src/main/ipc/snapshot-handlers.ts
 * IPC handlers for repository snapshot capture and active baseline management.
 */

import {
  projectIdSchema,
  createSnapshotSchema,
  setBaselineSchema,
  deleteSnapshotSchema,
  type RepositorySnapshotDto,
} from '@ai-quality/contracts';
import { SnapshotService } from '@ai-quality/core';

export async function handleListSnapshots(
  rawProjectId: unknown,
  service: SnapshotService = new SnapshotService(),
): Promise<readonly RepositorySnapshotDto[]> {
  const projectId = projectIdSchema.parse(rawProjectId);
  return await service.listSnapshots(projectId);
}

export async function handleCreateSnapshot(
  rawInput: unknown,
  service: SnapshotService = new SnapshotService(),
): Promise<RepositorySnapshotDto> {
  const input = createSnapshotSchema.parse(rawInput);
  return await service.createSnapshot(input.projectId, input);
}

export async function handleSetBaseline(
  rawInput: unknown,
  service: SnapshotService = new SnapshotService(),
): Promise<RepositorySnapshotDto> {
  const input = setBaselineSchema.parse(rawInput);
  return await service.setBaseline(input.projectId, input.snapshotId);
}

export async function handleDeleteSnapshot(
  rawInput: unknown,
  service: SnapshotService = new SnapshotService(),
): Promise<{ readonly deleted: true }> {
  const input = deleteSnapshotSchema.parse(rawInput);
  await service.deleteSnapshot(input.projectId, input.snapshotId);
  return { deleted: true };
}
