/**
 * @file apps/desktop/src/main/ipc/patch-sandbox-handlers.ts
 * Main-process IPC handlers for Secure Patch Sandbox & Change Isolation (V7 Phase 102).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DefectPatchSandboxDto,
  type DesktopError,
  type DesktopResult,
  applyPatchToSandboxInputSchema,
  createPatchSandboxInputSchema,
  destroyPatchSandboxInputSchema,
  getPatchSandboxInputSchema,
  listPatchSandboxesInputSchema,
} from '@ai-quality/contracts';
import { PatchSandboxError, PatchSandboxService, getPrismaClient } from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let patchSandboxService: PatchSandboxService | null = null;

export function resolvePatchSandboxService(): PatchSandboxService {
  if (!patchSandboxService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }
    patchSandboxService = new PatchSandboxService({ prisma });
  }
  return patchSandboxService;
}

export function setPatchSandboxService(service: PatchSandboxService | null): void {
  patchSandboxService = service;
}

function sanitizeError(err: unknown): DesktopError {
  if (err && typeof err === 'object' && 'issues' in err) {
    return {
      code: 'VALIDATION_ERROR',
      message:
        (err as { issues: Array<{ message: string }> }).issues[0]?.message ?? 'Validation error',
    };
  }

  if (err instanceof PatchSandboxError) {
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

export async function handleCreatePatchSandbox(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectPatchSandboxDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = createPatchSandboxInputSchema.parse(input);
    const service = resolvePatchSandboxService();
    const result = await service.createSandbox(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleApplyPatchToSandbox(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectPatchSandboxDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = applyPatchToSandboxInputSchema.parse(input);
    const service = resolvePatchSandboxService();
    const result = await service.applyPatch(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetPatchSandbox(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectPatchSandboxDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = getPatchSandboxInputSchema.parse(input);
    const service = resolvePatchSandboxService();
    const result = await service.getSandbox(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListPatchSandboxes(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly DefectPatchSandboxDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = listPatchSandboxesInputSchema.parse(input);
    const service = resolvePatchSandboxService();
    const result = await service.listSandboxes(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleDestroyPatchSandbox(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectPatchSandboxDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = destroyPatchSandboxInputSchema.parse(input);
    const service = resolvePatchSandboxService();
    const result = await service.destroySandbox(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}
