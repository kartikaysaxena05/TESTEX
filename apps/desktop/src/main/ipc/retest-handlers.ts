/**
 * @file apps/desktop/src/main/ipc/retest-handlers.ts
 * Main-process IPC handlers for Requirement Change-Impact & Intelligent Retest Selection (V7 Phase 106).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type ChangeSnapshotDto,
  type DesktopError,
  type DesktopResult,
  type ExplainTestSelectionResultDto,
  type RetestPlanDto,
  createChangeSnapshotInputSchema,
  explainTestSelectionInputSchema,
  getRetestPlanInputSchema,
  listRetestPlansInputSchema,
  planRetestInputSchema,
} from '@ai-quality/contracts';
import { RetestError, RetestPlanService, getPrismaClient } from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let retestPlanService: RetestPlanService | null = null;

export function resolveRetestPlanService(): RetestPlanService {
  if (!retestPlanService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }
    retestPlanService = new RetestPlanService(prisma);
  }
  return retestPlanService;
}

export function setRetestPlanService(service: RetestPlanService | null): void {
  retestPlanService = service;
}

function sanitizeError(err: unknown): DesktopError {
  if (err && typeof err === 'object' && 'issues' in err) {
    return {
      code: 'VALIDATION_ERROR',
      message:
        (err as { issues: Array<{ message: string }> }).issues[0]?.message ?? 'Validation error',
    };
  }

  if (err instanceof RetestError) {
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

export async function handleCreateChangeSnapshot(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ChangeSnapshotDto>> {
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
    const parsed = createChangeSnapshotInputSchema.parse(input);
    const service = resolveRetestPlanService();
    const data = await service.createChangeSnapshot(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handlePlanRetest(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<RetestPlanDto>> {
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
    const parsed = planRetestInputSchema.parse(input);
    const service = resolveRetestPlanService();
    const data = await service.planRetest(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetRetestPlan(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<RetestPlanDto | null>> {
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
    const parsed = getRetestPlanInputSchema.parse(input);
    const service = resolveRetestPlanService();
    const data = await service.getRetestPlan(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListRetestPlans(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly RetestPlanDto[]>> {
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
    const parsed = listRetestPlansInputSchema.parse(input);
    const service = resolveRetestPlanService();
    const data = await service.listRetestPlans(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleExplainTestSelection(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ExplainTestSelectionResultDto>> {
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
    const parsed = explainTestSelectionInputSchema.parse(input);
    const service = resolveRetestPlanService();
    const data = await service.explainTestSelection(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}
