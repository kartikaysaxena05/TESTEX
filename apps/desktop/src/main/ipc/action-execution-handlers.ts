/**
 * @file apps/desktop/src/main/ipc/action-execution-handlers.ts
 * Main process IPC handlers for the Action Execution Engine (V5 Phase 63).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopResult,
  type ActionResultDto,
  type StepExecutionResultDto,
  type ExecuteActionInputDto,
  type ExecuteStepInputDto,
  executeActionInputSchema,
  executeStepInputSchema,
} from '@ai-quality/contracts';
import {
  getActionExecutionService,
  getBrowserSessionManager,
  getPrismaClient,
  ActionExecutionService,
  ExecutionDomainError,
} from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let testActionExecutionService: ActionExecutionService | null = null;

export function setActionExecutionServiceForTest(service: ActionExecutionService | null): void {
  testActionExecutionService = service;
}

function resolveService(): ActionExecutionService {
  if (testActionExecutionService) {
    return testActionExecutionService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  const sessionManager = getBrowserSessionManager(prisma);
  return getActionExecutionService(prisma, sessionManager);
}

const ALLOWED_ACTION_ERROR_CODES = new Set([
  'PAGE_NOT_AVAILABLE',
  'CONTEXT_CLOSED',
  'TARGET_NOT_FOUND',
  'TARGET_AMBIGUOUS',
  'TARGET_NOT_VISIBLE',
  'TARGET_DISABLED',
  'ACTION_TIMEOUT',
  'NAVIGATION_REJECTED',
  'INVALID_ACTION',
  'INVALID_ACTION_VALUE',
  'UNSUPPORTED_ACTION',
  'PLAYWRIGHT_ERROR',
  'ACTION_CANCELLED',
  'CROSS_RUN_EXECUTION_ERROR',
  'DESTRUCTIVE_ACTION_PROHIBITED',
  'FILE_NOT_ALLOWED',
  'ELEMENT_NOT_ACTIONABLE',
  'TARGET_NOT_RESOLVED',
  'BROWSER_SESSION_NOT_FOUND',
  'VALIDATION_ERROR',
  'UNAUTHORIZED_SENDER',
  'INTERNAL_ERROR',
]);

function sanitizeError(err: unknown): { code: any; message: string } {
  if (err instanceof ExecutionDomainError && ALLOWED_ACTION_ERROR_CODES.has(err.code)) {
    return {
      code: err.code,
      message: err.message,
    };
  }

  if (err && typeof err === 'object' && 'name' in err && (err as any).name === 'ZodError') {
    return {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input payload for action execution.',
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: err instanceof Error ? err.message : 'An unexpected action execution error occurred.',
  };
}

export async function handleExecuteAction(
  event: IpcMainInvokeEvent,
  payload: ExecuteActionInputDto,
): Promise<DesktopResult<ActionResultDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected from untrusted or nested frame.',
      },
    };
  }

  try {
    const validated = executeActionInputSchema.parse(payload);
    const service = resolveService();
    const result = await service.executeAction(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleExecuteStep(
  event: IpcMainInvokeEvent,
  payload: ExecuteStepInputDto,
): Promise<DesktopResult<StepExecutionResultDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected from untrusted or nested frame.',
      },
    };
  }

  try {
    const validated = executeStepInputSchema.parse(payload);
    const service = resolveService();
    const result = await service.executeStep(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}
