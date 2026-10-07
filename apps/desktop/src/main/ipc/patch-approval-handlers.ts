/**
 * @file apps/desktop/src/main/ipc/patch-approval-handlers.ts
 * Main-process IPC handlers for Human Approval, Reject & Apply Workflow (V7 Phase 104).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DefectPatchApprovalDto,
  type DesktopError,
  type DesktopResult,
  approvePatchInputSchema,
  applyPatchInputSchema,
  getPatchApprovalInputSchema,
  listPatchApprovalsInputSchema,
  rejectPatchInputSchema,
} from '@ai-quality/contracts';
import { PatchApprovalError, PatchApprovalService, getPrismaClient } from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let patchApprovalService: PatchApprovalService | null = null;

export function resolvePatchApprovalService(): PatchApprovalService {
  if (!patchApprovalService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }
    patchApprovalService = new PatchApprovalService(prisma);
  }
  return patchApprovalService;
}

export function setPatchApprovalService(service: PatchApprovalService | null): void {
  patchApprovalService = service;
}

function sanitizeError(err: unknown): DesktopError {
  if (err && typeof err === 'object' && 'issues' in err) {
    return {
      code: 'VALIDATION_ERROR',
      message:
        (err as { issues: Array<{ message: string }> }).issues[0]?.message ?? 'Validation error',
    };
  }

  if (err instanceof PatchApprovalError) {
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

export async function handleGetPatchApproval(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectPatchApprovalDto | null>> {
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
    const parsed = getPatchApprovalInputSchema.parse(input);
    const service = resolvePatchApprovalService();
    const data = await service.getApproval(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListPatchApprovals(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly DefectPatchApprovalDto[]>> {
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
    const parsed = listPatchApprovalsInputSchema.parse(input);
    const service = resolvePatchApprovalService();
    const data = await service.listApprovals(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleApprovePatch(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectPatchApprovalDto>> {
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
    const parsed = approvePatchInputSchema.parse(input);
    const service = resolvePatchApprovalService();
    const data = await service.approvePatch(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleRejectPatch(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectPatchApprovalDto>> {
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
    const parsed = rejectPatchInputSchema.parse(input);
    const service = resolvePatchApprovalService();
    const data = await service.rejectPatch(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleApplyPatch(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectPatchApprovalDto>> {
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
    const parsed = applyPatchInputSchema.parse(input);
    const service = resolvePatchApprovalService();
    const data = await service.applyPatch(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}
