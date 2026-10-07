/**
 * @file apps/desktop/src/main/ipc/patch-rollback-handlers.ts
 * Main-process IPC handlers for Patch Rollback & Recovery (V7 Phase 105).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DefectPatchRollbackDto,
  type DesktopError,
  type DesktopResult,
  type PatchRollbackPlanResultDto,
  executePatchRollbackInputSchema,
  getPatchRollbackInputSchema,
  listPatchRollbacksInputSchema,
  planPatchRollbackInputSchema,
  resumePatchRollbackRecoveryInputSchema,
} from '@ai-quality/contracts';
import { PatchRollbackError, PatchRollbackService, getPrismaClient } from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let patchRollbackService: PatchRollbackService | null = null;

export function resolvePatchRollbackService(): PatchRollbackService {
  if (!patchRollbackService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }
    patchRollbackService = new PatchRollbackService(prisma);
  }
  return patchRollbackService;
}

export function setPatchRollbackService(service: PatchRollbackService | null): void {
  patchRollbackService = service;
}

function sanitizeError(err: unknown): DesktopError {
  if (err && typeof err === 'object' && 'issues' in err) {
    return {
      code: 'VALIDATION_ERROR',
      message:
        (err as { issues: Array<{ message: string }> }).issues[0]?.message ?? 'Validation error',
    };
  }

  if (err instanceof PatchRollbackError) {
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

export async function handlePlanPatchRollback(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<PatchRollbackPlanResultDto>> {
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
    const parsed = planPatchRollbackInputSchema.parse(input);
    const service = resolvePatchRollbackService();
    const data = await service.planRollback(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleExecutePatchRollback(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectPatchRollbackDto>> {
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
    const parsed = executePatchRollbackInputSchema.parse(input);
    const service = resolvePatchRollbackService();
    const data = await service.executeRollback(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetPatchRollback(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectPatchRollbackDto | null>> {
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
    const parsed = getPatchRollbackInputSchema.parse(input);
    const service = resolvePatchRollbackService();
    const data = await service.getRollback(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListPatchRollbacks(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly DefectPatchRollbackDto[]>> {
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
    const parsed = listPatchRollbacksInputSchema.parse(input);
    const service = resolvePatchRollbackService();
    const data = await service.listRollbacks(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleResumePatchRollbackRecovery(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectPatchRollbackDto>> {
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
    const parsed = resumePatchRollbackRecoveryInputSchema.parse(input);
    const service = resolvePatchRollbackService();
    const data = await service.resumeRecovery(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}
