/**
 * @file apps/desktop/src/main/ipc/post-fix-handlers.ts
 * Main-process IPC handlers for Post-Fix Jira & Notification Updates (V7 Phase 107).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopError,
  type DesktopResult,
  type PostFixSyncRecordDto,
  executePostFixSyncInputSchema,
  retryPostFixSyncInputSchema,
  getPostFixSyncStatusInputSchema,
  listPostFixSyncHistoryInputSchema,
} from '@ai-quality/contracts';
import {
  PostFixSyncError,
  PostFixExternalUpdateService,
  getPrismaClient,
} from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let postFixExternalUpdateService: PostFixExternalUpdateService | null = null;

export function resolvePostFixExternalUpdateService(): PostFixExternalUpdateService {
  if (!postFixExternalUpdateService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }
    postFixExternalUpdateService = new PostFixExternalUpdateService({ prisma });
  }
  return postFixExternalUpdateService;
}

export function setPostFixExternalUpdateService(service: PostFixExternalUpdateService | null): void {
  postFixExternalUpdateService = service;
}

function sanitizeError(err: unknown): DesktopError {
  if (err && typeof err === 'object' && 'issues' in err) {
    return {
      code: 'VALIDATION_ERROR',
      message:
        (err as { issues: Array<{ message: string }> }).issues[0]?.message ?? 'Validation error',
    };
  }

  if (err instanceof PostFixSyncError) {
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

export async function handleExecutePostFixSync(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<PostFixSyncRecordDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const parsed = executePostFixSyncInputSchema.parse(input);
    const service = resolvePostFixExternalUpdateService();
    const data = await service.executeSync(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleRetryPostFixSync(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<PostFixSyncRecordDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const parsed = retryPostFixSyncInputSchema.parse(input);
    const service = resolvePostFixExternalUpdateService();
    const data = await service.retrySync(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetPostFixSyncStatus(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<PostFixSyncRecordDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const parsed = getPostFixSyncStatusInputSchema.parse(input);
    const service = resolvePostFixExternalUpdateService();
    const data = await service.getStatus(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListPostFixSyncHistory(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly PostFixSyncRecordDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const parsed = listPostFixSyncHistoryInputSchema.parse(input);
    const service = resolvePostFixExternalUpdateService();
    const data = await service.listHistory(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}
