/**
 * @file apps/desktop/src/main/ipc/patch-proposal-handlers.ts
 * Main-process IPC handlers for Limited AI Patch Generation (V7 Phase 101).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DefectPatchProposalDto,
  type DesktopError,
  type DesktopResult,
  generatePatchProposalInputSchema,
  getPatchProposalInputSchema,
  listPatchProposalsInputSchema,
  withdrawPatchProposalInputSchema,
} from '@ai-quality/contracts';
import { PatchProposalError, PatchProposalService, getPrismaClient } from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let patchProposalService: PatchProposalService | null = null;

export function resolvePatchProposalService(): PatchProposalService {
  if (!patchProposalService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }
    patchProposalService = new PatchProposalService({ prisma });
  }
  return patchProposalService;
}

export function setPatchProposalService(service: PatchProposalService | null): void {
  patchProposalService = service;
}

function sanitizeError(err: unknown): DesktopError {
  if (err && typeof err === 'object' && 'issues' in err) {
    return {
      code: 'VALIDATION_ERROR',
      message:
        (err as { issues: Array<{ message: string }> }).issues[0]?.message ?? 'Validation error',
    };
  }

  if (err instanceof PatchProposalError) {
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

export async function handleGeneratePatchProposal(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectPatchProposalDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = generatePatchProposalInputSchema.parse(input);
    const service = resolvePatchProposalService();
    const result = await service.generateProposal(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetPatchProposal(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectPatchProposalDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = getPatchProposalInputSchema.parse(input);
    const service = resolvePatchProposalService();
    const result = await service.getProposal(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListPatchProposals(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly DefectPatchProposalDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = listPatchProposalsInputSchema.parse(input);
    const service = resolvePatchProposalService();
    const result = await service.listProposals(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleWithdrawPatchProposal(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectPatchProposalDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = withdrawPatchProposalInputSchema.parse(input);
    const service = resolvePatchProposalService();
    const result = await service.withdrawProposal(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}
