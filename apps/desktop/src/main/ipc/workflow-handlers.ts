/**
 * @file apps/desktop/src/main/ipc/workflow-handlers.ts
 * Main-process IPC handlers for Bug Status & External Workflow Synchronization (V7 Phase 96).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopResult,
  type DesktopError,
  type BugWorkflowStateDto,
  type WorkflowStatusMappingDto,
  type WorkflowSyncEventDto,
  getWorkflowStateInputSchema,
  updateInternalStatusInputSchema,
  getWorkflowStatusMappingsInputSchema,
  saveWorkflowStatusMappingInputSchema,
  deleteWorkflowStatusMappingInputSchema,
  syncWorkflowNowInputSchema,
  resolveWorkflowConflictInputSchema,
  listWorkflowSyncEventsInputSchema,
} from '@ai-quality/contracts';
import { WorkflowSyncService, WorkflowError, getPrismaClient } from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let workflowSyncService: WorkflowSyncService | null = null;

export function resolveWorkflowSyncService(): WorkflowSyncService {
  if (!workflowSyncService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }
    workflowSyncService = new WorkflowSyncService({ prisma });
  }
  return workflowSyncService;
}

export function setWorkflowSyncService(service: WorkflowSyncService | null): void {
  workflowSyncService = service;
}

function sanitizeError(err: unknown): DesktopError {
  if (err && typeof err === 'object' && 'issues' in err) {
    return {
      code: 'VALIDATION_ERROR',
      message:
        (err as { issues: Array<{ message: string }> }).issues[0]?.message ?? 'Validation error',
    };
  }

  if (err instanceof WorkflowError) {
    return {
      code: err.code,
      message: err.message,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    code: 'INTERNAL_ERROR',
    message,
  };
}

export async function handleGetWorkflowState(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<BugWorkflowStateDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = getWorkflowStateInputSchema.parse(input);
    const service = resolveWorkflowSyncService();
    const result = await service.getState(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleUpdateInternalStatus(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<BugWorkflowStateDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = updateInternalStatusInputSchema.parse(input);
    const service = resolveWorkflowSyncService();
    const result = await service.updateInternalStatus(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetWorkflowStatusMappings(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly WorkflowStatusMappingDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = getWorkflowStatusMappingsInputSchema.parse(input);
    const service = resolveWorkflowSyncService();
    const result = await service.getStatusMappings(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleSaveWorkflowStatusMapping(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<WorkflowStatusMappingDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = saveWorkflowStatusMappingInputSchema.parse(input);
    const service = resolveWorkflowSyncService();
    const result = await service.saveStatusMapping(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleDeleteWorkflowStatusMapping(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<{ readonly deleted: true }>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = deleteWorkflowStatusMappingInputSchema.parse(input);
    const service = resolveWorkflowSyncService();
    const result = await service.deleteStatusMapping(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleSyncWorkflowNow(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<BugWorkflowStateDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = syncWorkflowNowInputSchema.parse(input);
    const service = resolveWorkflowSyncService();
    const result = await service.syncNow(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleResolveWorkflowConflict(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<BugWorkflowStateDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = resolveWorkflowConflictInputSchema.parse(input);
    const service = resolveWorkflowSyncService();
    const result = await service.resolveConflict(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListWorkflowSyncEvents(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<
  DesktopResult<{
    readonly items: readonly WorkflowSyncEventDto[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly totalPages: number;
  }>
> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = listWorkflowSyncEventsInputSchema.parse(input);
    const service = resolveWorkflowSyncService();
    const result = await service.listSyncEvents(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}
