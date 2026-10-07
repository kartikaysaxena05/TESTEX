/**
 * @file apps/desktop/src/main/ipc/synchronization-handlers.ts
 * Main process IPC handlers for Navigation, Waiting, Synchronization & Async Stability (V5 Phase 66).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopResult,
  type SynchronizationResultDto,
  type SynchronizeStepInputDto,
  synchronizeStepInputSchema,
} from '@ai-quality/contracts';
import {
  getSynchronizationCoordinator,
  getBrowserSessionManager,
  getPrismaClient,
  SynchronizationCoordinator,
  ExecutionDomainError,
  BrowserSessionManager,
  BrowserSessionNotFoundError,
  CrossRunExecutionError,
} from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let testCoordinator: SynchronizationCoordinator | null = null;
let testSessionManager: BrowserSessionManager | null = null;

export function setSynchronizationCoordinatorForTest(
  coordinator: SynchronizationCoordinator | null,
): void {
  testCoordinator = coordinator;
}

export function setSessionManagerForTest(manager: BrowserSessionManager | null): void {
  testSessionManager = manager;
}

function resolveCoordinator(): SynchronizationCoordinator {
  return testCoordinator ?? getSynchronizationCoordinator();
}

function resolveSessionManager(): BrowserSessionManager {
  if (testSessionManager) return testSessionManager;
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  return getBrowserSessionManager(prisma);
}

const ALLOWED_SYNCHRONIZATION_ERROR_CODES = new Set([
  'SYNCHRONIZATION_TIMEOUT',
  'NAVIGATION_TIMEOUT',
  'ELEMENT_READINESS_TIMEOUT',
  'RESPONSE_WAIT_TIMEOUT',
  'POPUP_TIMEOUT',
  'LOADING_STATE_TIMEOUT',
  'CUSTOM_CONDITION_TIMEOUT',
  'PAGE_NOT_AVAILABLE',
  'CONTEXT_CLOSED',
  'BROWSER_SESSION_NOT_FOUND',
  'CROSS_RUN_EXECUTION_ERROR',
  'ACTION_CANCELLED',
  'VALIDATION_ERROR',
  'UNAUTHORIZED_SENDER',
  'INTERNAL_ERROR',
]);

function sanitizeError(err: unknown): { code: any; message: string } {
  if (err instanceof ExecutionDomainError && ALLOWED_SYNCHRONIZATION_ERROR_CODES.has(err.code)) {
    return {
      code: err.code,
      message: err.message,
    };
  }

  if (err && typeof err === 'object' && 'name' in err && (err as any).name === 'ZodError') {
    return {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input payload for synchronization.',
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: err instanceof Error ? err.message : 'An unexpected synchronization error occurred.',
  };
}

export async function handleSynchronize(
  event: IpcMainInvokeEvent,
  payload: SynchronizeStepInputDto,
): Promise<DesktopResult<SynchronizationResultDto>> {
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
    const validated = synchronizeStepInputSchema.parse(payload);
    const sessionManager = resolveSessionManager();
    const coordinator = resolveCoordinator();

    const session = sessionManager.getSession(validated.testRunId);
    if (!session) {
      throw new BrowserSessionNotFoundError(validated.testRunId);
    }

    if (session.projectId !== validated.projectId) {
      throw new CrossRunExecutionError(
        `Session project '${session.projectId}' does not match requested project '${validated.projectId}'`,
      );
    }

    const result = await coordinator.synchronize(
      {
        projectId: validated.projectId,
        testRunId: validated.testRunId,
        page: session.page,
        browserContext: session.context,
      },
      {
        strategy: validated.strategy,
        target: validated.target,
        readinessState: validated.readinessState,
        urlPattern: validated.urlPattern,
        loadState: validated.loadState,
        responseMatcher: validated.responseMatcher,
        customCondition: validated.customCondition,
        timeoutMs: validated.timeoutMs,
      },
    );

    return {
      ok: true,
      data: result,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      error: sanitizeError(err),
    };
  }
}
