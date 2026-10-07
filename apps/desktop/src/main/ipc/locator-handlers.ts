/**
 * @file apps/desktop/src/main/ipc/locator-handlers.ts
 * Main process IPC handlers for UI Element Resolution & Locator Intelligence (V5 Phase 64).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopResult,
  type LocatorResolutionResultDto,
  type ResolveLocatorInputDto,
  resolveLocatorInputSchema,
} from '@ai-quality/contracts';
import {
  getLocatorResolutionService,
  getPrismaClient,
  LocatorResolutionService,
  ExecutionDomainError,
} from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let testLocatorResolutionService: LocatorResolutionService | null = null;

export function setLocatorResolutionServiceForTest(service: LocatorResolutionService | null): void {
  testLocatorResolutionService = service;
}

function resolveService(): LocatorResolutionService {
  if (testLocatorResolutionService) {
    return testLocatorResolutionService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  return getLocatorResolutionService(prisma);
}

const ALLOWED_LOCATOR_ERROR_CODES = new Set([
  'LOCATOR_INVALID_TARGET',
  'LOCATOR_NOT_FOUND',
  'LOCATOR_AMBIGUOUS',
  'LOCATOR_TIMEOUT',
  'LOCATOR_UNSUPPORTED_STRATEGY',
  'LOCATOR_SCOPE_NOT_FOUND',
  'LOCATOR_FRAME_NOT_FOUND',
  'LOCATOR_FRAME_AMBIGUOUS',
  'LOCATOR_CANCELLED',
  'LOCATOR_PAGE_CLOSED',
  'LOCATOR_CONTEXT_CLOSED',
  'CROSS_RUN_EXECUTION_ERROR',
  'BROWSER_SESSION_NOT_FOUND',
  'PAGE_NOT_AVAILABLE',
  'CONTEXT_CLOSED',
  'VALIDATION_ERROR',
  'UNAUTHORIZED_SENDER',
  'INTERNAL_ERROR',
]);

function sanitizeError(err: unknown): { code: any; message: string } {
  if (err instanceof ExecutionDomainError && ALLOWED_LOCATOR_ERROR_CODES.has(err.code)) {
    return {
      code: err.code,
      message: err.message,
    };
  }

  if (err && typeof err === 'object' && 'name' in err && (err as any).name === 'ZodError') {
    return {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input payload for locator resolution.',
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message:
      err instanceof Error ? err.message : 'An unexpected locator resolution error occurred.',
  };
}

export async function handleResolveLocator(
  event: IpcMainInvokeEvent,
  payload: ResolveLocatorInputDto,
): Promise<DesktopResult<LocatorResolutionResultDto>> {
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
    const validated = resolveLocatorInputSchema.parse(payload);
    const service = resolveService();
    const result = await service.resolveLocator(validated);
    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    const error = sanitizeError(err);
    return {
      ok: false,
      error,
    };
  }
}
