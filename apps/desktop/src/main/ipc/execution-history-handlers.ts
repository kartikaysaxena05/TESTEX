/**
 * @file apps/desktop/src/main/ipc/execution-history-handlers.ts
 * Main-process IPC handlers for execution persistence, step-level audit trail, and history queries.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopResult,
  type DesktopError,
  type TestCaseExecutionDto,
  type StepExecutionRecordDto,
  type ExecutionAuditTimelineDto,
  getExecutionInputSchema,
  listExecutionsInputSchema,
  getExecutionStepsInputSchema,
  getExecutionAuditTimelineInputSchema,
  reconcileOrphanedExecutionsInputSchema,
} from '@ai-quality/contracts';
import {
  ExecutionPersistenceService,
  ExecutionDomainError,
  getPrismaClient,
} from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let sharedPersistenceService: ExecutionPersistenceService | null = null;

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

export function setSharedPersistenceService(service: ExecutionPersistenceService | null): void {
  sharedPersistenceService = service;
}

export async function handleGetExecution(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<TestCaseExecutionDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getExecutionInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid get execution input.',
      },
    };
  }

  try {
    const service = resolvePersistenceService();
    const result = await service.getExecution(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListExecutions(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<
  DesktopResult<{
    readonly items: readonly TestCaseExecutionDto[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly totalPages: number;
  }>
> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = listExecutionsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid list executions input.',
      },
    };
  }

  try {
    const service = resolvePersistenceService();
    const result = await service.listExecutions(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetExecutionSteps(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<
  DesktopResult<{
    readonly items: readonly StepExecutionRecordDto[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
  }>
> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getExecutionStepsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid get execution steps input.',
      },
    };
  }

  try {
    const service = resolvePersistenceService();
    const result = await service.getExecutionSteps(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetExecutionTimeline(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ExecutionAuditTimelineDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getExecutionAuditTimelineInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid get execution timeline input.',
      },
    };
  }

  try {
    const service = resolvePersistenceService();
    const result = await service.getExecutionAuditTimeline(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleReconcileOrphaned(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<{ readonly reconciledCount: number }>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = reconcileOrphanedExecutionsInputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid reconcile orphaned executions input.',
      },
    };
  }

  try {
    const service = resolvePersistenceService();
    const result = await service.reconcileOrphanedExecutions(parsed.data);
    return { ok: true, data: result };
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
    message: message || 'An unexpected execution history error occurred.',
  };
}
