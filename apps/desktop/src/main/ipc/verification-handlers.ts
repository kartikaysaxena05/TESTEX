/**
 * @file apps/desktop/src/main/ipc/verification-handlers.ts
 * Main-process IPC handlers for Automated Failed-Test Rerun & Fix Verification (V7 Phase 98).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopResult,
  type DesktopError,
  type DefectVerificationAttemptDto,
  type VerificationSummaryDto,
  executeVerificationInputSchema,
  getVerificationAttemptsInputSchema,
  getVerificationComparisonInputSchema,
  cancelVerificationInputSchema,
} from '@ai-quality/contracts';
import { DefectVerificationService, VerificationError, getPrismaClient } from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let defectVerificationService: DefectVerificationService | null = null;

export function resolveDefectVerificationService(): DefectVerificationService {
  if (!defectVerificationService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }
    defectVerificationService = new DefectVerificationService({ prisma });
  }
  return defectVerificationService;
}

export function setDefectVerificationService(service: DefectVerificationService | null): void {
  defectVerificationService = service;
}

function sanitizeError(err: unknown): DesktopError {
  if (err && typeof err === 'object' && 'issues' in err) {
    return {
      code: 'VALIDATION_ERROR',
      message:
        (err as { issues: Array<{ message: string }> }).issues[0]?.message ?? 'Validation error',
    };
  }

  if (err instanceof VerificationError) {
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

export async function handleExecuteVerification(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<VerificationSummaryDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = executeVerificationInputSchema.parse(input);
    const service = resolveDefectVerificationService();
    const result = await service.executeVerification(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetVerificationAttempts(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly DefectVerificationAttemptDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = getVerificationAttemptsInputSchema.parse(input);
    const service = resolveDefectVerificationService();
    const result = await service.getAttempts(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetVerificationComparison(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectVerificationAttemptDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = getVerificationComparisonInputSchema.parse(input);
    const service = resolveDefectVerificationService();
    const result = await service.getComparison(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleCancelVerification(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<{ readonly cancelled: true }>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = cancelVerificationInputSchema.parse(input);
    const service = resolveDefectVerificationService();
    const result = await service.cancelVerification(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}
