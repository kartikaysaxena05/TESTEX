/**
 * @file apps/desktop/src/main/ipc/healing-handlers.ts
 * Main-process IPC handlers for locator self-healing audit history, reviewable suggestions, and parallel worker pool state.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopResult,
  type DesktopError,
  type LocatorHealingAttemptDto,
  type LocatorHealingSuggestionDto,
  type ParallelWorkerPoolStateDto,
  getHealingAttemptsInputSchema,
  listHealingSuggestionsInputSchema,
  reviewHealingSuggestionInputSchema,
  getParallelPoolStateInputSchema,
} from '@ai-quality/contracts';
import {
  ExecutionPersistenceService,
  ParallelWorkerPool,
  ExecutionDomainError,
  getPrismaClient,
} from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let sharedPersistenceService: ExecutionPersistenceService | null = null;
let sharedParallelPool: ParallelWorkerPool | null = null;

function resolvePersistenceService(): ExecutionPersistenceService {
  if (sharedPersistenceService) {
    return sharedPersistenceService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedPersistenceService = new ExecutionPersistenceService({ prisma });
  return sharedPersistenceService;
}

function resolveParallelPool(): ParallelWorkerPool {
  if (sharedParallelPool) {
    return sharedParallelPool;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedParallelPool = new ParallelWorkerPool(prisma);
  return sharedParallelPool;
}

export function setSharedHealingServices(
  persistence?: ExecutionPersistenceService | null,
  pool?: ParallelWorkerPool | null,
): void {
  sharedPersistenceService = persistence ?? null;
  sharedParallelPool = pool ?? null;
}

export async function handleGetHealingAttempts(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly LocatorHealingAttemptDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getHealingAttemptsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid get healing attempts input.',
      },
    };
  }

  try {
    const persistence = resolvePersistenceService();
    const attempts = await persistence.getHealingAttempts(parsed.data);
    return { ok: true, data: attempts };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListHealingSuggestions(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly LocatorHealingSuggestionDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = listHealingSuggestionsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid list healing suggestions input.',
      },
    };
  }

  try {
    const persistence = resolvePersistenceService();
    const suggestions = await persistence.listHealingSuggestions(parsed.data);
    return { ok: true, data: suggestions };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleReviewHealingSuggestion(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<LocatorHealingSuggestionDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = reviewHealingSuggestionInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid review healing suggestion input.',
      },
    };
  }

  try {
    const persistence = resolvePersistenceService();
    const reviewed = await persistence.reviewHealingSuggestion(parsed.data);
    return { ok: true, data: reviewed };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetParallelPoolState(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ParallelWorkerPoolStateDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getParallelPoolStateInputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid get parallel pool state input.',
      },
    };
  }

  try {
    const pool = resolveParallelPool();
    const state = await pool.getState(parsed.data.projectId);
    return { ok: true, data: state };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

function sanitizeError(err: unknown): DesktopError {
  if (err instanceof ExecutionDomainError) {
    return {
      code: (err.code as any) || 'INTERNAL_ERROR',
      message: err.message,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    code: 'INTERNAL_ERROR',
    message: message || 'An unexpected execution healing error occurred.',
  };
}
