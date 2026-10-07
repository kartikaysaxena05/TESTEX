/**
 * @file apps/desktop/src/main/ipc/repair-patch-handlers.ts
 * Main-process IPC handlers for V10 Phase 149 Repair / Patch Tool (`repair_patch`).
 *
 * Exposes strictly typed boundary handlers for:
 * - create patch proposal
 * - get patch proposal
 * - approve patch
 * - reject patch
 * - cancel patch
 * - apply patch
 *
 * Validates every input at the IPC boundary and enforces sender origin verification.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type RepairPatchToolOutputDto,
  type DesktopError,
  type DesktopResult,
  repairPatchProposeInputSchema,
  repairPatchGetInputSchema,
  repairPatchApproveInputSchema,
  repairPatchRejectInputSchema,
  repairPatchCancelInputSchema,
  repairPatchApplyInputSchema,
} from '@ai-quality/contracts';
import {
  RepairPatchToolService,
  RepairPatchToolError,
  AiCrossProjectAccessError,
  AiInvalidRequestError,
  UnauthorizedError,
  getPrismaClient,
} from '@ai-quality/core';
import { ZodError } from 'zod';
import { isTrustedIpcSender } from './sender-validation.js';
import { assertAuthenticated } from './auth-handlers.js';

let defaultRepairPatchToolService: RepairPatchToolService | null = null;

export function resolveRepairPatchToolService(): RepairPatchToolService {
  if (!defaultRepairPatchToolService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available for RepairPatchToolService.');
    }
    defaultRepairPatchToolService = new RepairPatchToolService({ prisma });
  }
  return defaultRepairPatchToolService;
}

export function setRepairPatchToolServiceForTest(service: RepairPatchToolService | null): void {
  defaultRepairPatchToolService = service;
}

async function extractUser(event?: IpcMainInvokeEvent): Promise<string> {
  if (!event) {
    throw new UnauthorizedError('Authentication required.');
  }
  const user = await assertAuthenticated(event);
  return user.userId;
}

function sanitizeError(err: unknown): DesktopError {
  if (err instanceof ZodError) {
    return {
      code: 'VALIDATION_ERROR',
      message: err.errors.map(e => e.message).join(' '),
    };
  }

  if (err instanceof RepairPatchToolError) {
    return {
      code: err.code as any,
      message: err.message,
    };
  }

  if (err instanceof AiCrossProjectAccessError) {
    return {
      code: 'AI_CROSS_PROJECT_ACCESS',
      message: err.message,
    };
  }

  if (err instanceof AiInvalidRequestError) {
    return {
      code: 'AI_INVALID_REQUEST',
      message: err.message,
    };
  }

  if (err instanceof UnauthorizedError) {
    return {
      code: 'AUTHENTICATION_FAILED',
      message: err.message,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    code: 'INTERNAL_ERROR',
    message,
  };
}

/**
 * 1. Create / Propose Patch Proposal
 */
export async function handleProposeRepairPatch(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<RepairPatchToolOutputDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = repairPatchProposeInputSchema.parse(input);
    const service = resolveRepairPatchToolService();
    const data = await service.proposePatch(parsed, userId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

/**
 * 2. Get Patch Proposal
 */
export async function handleGetRepairPatch(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<RepairPatchToolOutputDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = repairPatchGetInputSchema.parse(input);
    const service = resolveRepairPatchToolService();
    const data = await service.getPatch(parsed, userId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

/**
 * 3. Approve Patch Proposal
 */
export async function handleApproveRepairPatch(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<RepairPatchToolOutputDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = repairPatchApproveInputSchema.parse(input);
    const service = resolveRepairPatchToolService();
    const data = await service.approvePatch(parsed, userId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

/**
 * 4. Reject Patch Proposal
 */
export async function handleRejectRepairPatch(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<RepairPatchToolOutputDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = repairPatchRejectInputSchema.parse(input);
    const service = resolveRepairPatchToolService();
    const data = await service.rejectPatch(parsed, userId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

/**
 * 5. Cancel Patch Proposal
 */
export async function handleCancelRepairPatch(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<RepairPatchToolOutputDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = repairPatchCancelInputSchema.parse(input);
    const service = resolveRepairPatchToolService();
    const data = await service.cancelPatch(parsed, userId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

/**
 * 6. Apply Approved Patch
 */
export async function handleApplyRepairPatch(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<RepairPatchToolOutputDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = repairPatchApplyInputSchema.parse(input);
    const service = resolveRepairPatchToolService();
    const data = await service.applyPatch(parsed, userId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}
