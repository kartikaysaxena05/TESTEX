/**
 * @file apps/desktop/src/main/ipc/quick-fix-handlers.ts
 * Main-process IPC handlers for AI Quick-Fix Eligibility & Safety Analysis (V7 Phase 99).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopResult,
  type DesktopError,
  type QuickFixEligibilityAssessmentDto,
  evaluateQuickFixEligibilityInputSchema,
  getQuickFixAssessmentInputSchema,
  listQuickFixAssessmentsInputSchema,
} from '@ai-quality/contracts';
import { QuickFixEligibilityService, QuickFixError, getPrismaClient } from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let quickFixEligibilityService: QuickFixEligibilityService | null = null;

export function resolveQuickFixEligibilityService(): QuickFixEligibilityService {
  if (!quickFixEligibilityService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }
    quickFixEligibilityService = new QuickFixEligibilityService({ prisma });
  }
  return quickFixEligibilityService;
}

export function setQuickFixEligibilityService(service: QuickFixEligibilityService | null): void {
  quickFixEligibilityService = service;
}

function sanitizeError(err: unknown): DesktopError {
  if (err && typeof err === 'object' && 'issues' in err) {
    return {
      code: 'VALIDATION_ERROR',
      message:
        (err as { issues: Array<{ message: string }> }).issues[0]?.message ?? 'Validation error',
    };
  }

  if (err instanceof QuickFixError) {
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

export async function handleEvaluateQuickFixEligibility(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<QuickFixEligibilityAssessmentDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = evaluateQuickFixEligibilityInputSchema.parse(input);
    const service = resolveQuickFixEligibilityService();
    const result = await service.evaluateEligibility(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetQuickFixAssessment(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<QuickFixEligibilityAssessmentDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = getQuickFixAssessmentInputSchema.parse(input);
    const service = resolveQuickFixEligibilityService();
    const result = await service.getAssessment(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListQuickFixAssessments(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly QuickFixEligibilityAssessmentDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = listQuickFixAssessmentsInputSchema.parse(input);
    const service = resolveQuickFixEligibilityService();
    const result = await service.listAssessments(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}
