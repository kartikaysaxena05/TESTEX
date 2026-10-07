/**
 * @file apps/desktop/src/main/ipc/patch-validation-handlers.ts
 * Main-process IPC handlers for Patch Validation & Before/After Testing (V7 Phase 103).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DefectPatchValidationDto,
  type DesktopError,
  type DesktopResult,
  cancelPatchValidationInputSchema,
  executePatchValidationInputSchema,
  getPatchValidationInputSchema,
  listPatchValidationsInputSchema,
} from '@ai-quality/contracts';
import { PatchValidationError, PatchValidationService, getPrismaClient } from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let patchValidationService: PatchValidationService | null = null;

export function resolvePatchValidationService(): PatchValidationService {
  if (!patchValidationService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }
    patchValidationService = new PatchValidationService({ prisma });
  }
  return patchValidationService;
}

export function setPatchValidationService(service: PatchValidationService | null): void {
  patchValidationService = service;
}

function sanitizeError(err: unknown): DesktopError {
  if (err && typeof err === 'object' && 'issues' in err) {
    return {
      code: 'VALIDATION_ERROR',
      message:
        (err as { issues: Array<{ message: string }> }).issues[0]?.message ?? 'Validation error',
    };
  }

  if (err instanceof PatchValidationError) {
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

export async function handleExecutePatchValidation(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectPatchValidationDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = executePatchValidationInputSchema.parse(input);
    const service = resolvePatchValidationService();
    const result = await service.executeValidation(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetPatchValidation(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectPatchValidationDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = getPatchValidationInputSchema.parse(input);
    const service = resolvePatchValidationService();
    const result = await service.getValidation(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListPatchValidations(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly DefectPatchValidationDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = listPatchValidationsInputSchema.parse(input);
    const service = resolvePatchValidationService();
    const result = await service.listValidations(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleCancelPatchValidation(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectPatchValidationDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = cancelPatchValidationInputSchema.parse(input);
    const service = resolvePatchValidationService();
    const result = await service.cancelValidation(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}
