/**
 * @file apps/desktop/src/main/ipc/reverification-handlers.ts
 * Main-process IPC handlers for Defect Reverification Foundation (V7 Phase 97).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopResult,
  type DesktopError,
  type DefectReverificationDto,
  type ReverificationAuditEventDto,
  type EvaluateReverificationEligibilityOutputDto,
  getReverificationStateInputSchema,
  evaluateReverificationEligibilityInputSchema,
  createReverificationRequestInputSchema,
  generateReverificationPlanInputSchema,
  cancelReverificationInputSchema,
  listReverificationAuditEventsInputSchema,
} from '@ai-quality/contracts';
import {
  DefectReverificationService,
  ReverificationError,
  getPrismaClient,
} from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let defectReverificationService: DefectReverificationService | null = null;

export function resolveDefectReverificationService(): DefectReverificationService {
  if (!defectReverificationService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }
    defectReverificationService = new DefectReverificationService({ prisma });
  }
  return defectReverificationService;
}

export function setDefectReverificationService(service: DefectReverificationService | null): void {
  defectReverificationService = service;
}

function sanitizeError(err: unknown): DesktopError {
  if (err && typeof err === 'object' && 'issues' in err) {
    return {
      code: 'VALIDATION_ERROR',
      message:
        (err as { issues: Array<{ message: string }> }).issues[0]?.message ?? 'Validation error',
    };
  }

  if (err instanceof ReverificationError) {
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

export async function handleGetReverificationState(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectReverificationDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = getReverificationStateInputSchema.parse(input);
    const service = resolveDefectReverificationService();
    const result = await service.getState(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleEvaluateReverificationEligibility(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<EvaluateReverificationEligibilityOutputDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = evaluateReverificationEligibilityInputSchema.parse(input);
    const service = resolveDefectReverificationService();
    const result = await service.evaluateEligibility(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleCreateReverificationRequest(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectReverificationDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = createReverificationRequestInputSchema.parse(input);
    const service = resolveDefectReverificationService();
    const result = await service.createRequest(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGenerateReverificationPlan(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectReverificationDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = generateReverificationPlanInputSchema.parse(input);
    const service = resolveDefectReverificationService();
    const result = await service.generatePlan(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleCancelReverification(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectReverificationDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = cancelReverificationInputSchema.parse(input);
    const service = resolveDefectReverificationService();
    const result = await service.cancel(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListReverificationAuditEvents(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly ReverificationAuditEventDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = listReverificationAuditEventsInputSchema.parse(input);
    const service = resolveDefectReverificationService();
    const result = await service.listAuditEvents(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}
