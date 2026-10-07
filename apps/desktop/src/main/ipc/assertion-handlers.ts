/**
 * @file apps/desktop/src/main/ipc/assertion-handlers.ts
 * Main process IPC handlers for Assertion & Expected-vs-Actual Verification Engine (V5 Phase 67).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopResult,
  type AssertionResultDto,
  type StepAssertionEvaluationResultDto,
  type AssertInputDto,
  type EvaluateStepAssertionsInputDto,
  assertInputSchema,
  evaluateStepAssertionsInputSchema,
} from '@ai-quality/contracts';
import {
  getAssertionEngine,
  getBrowserSessionManager,
  getPrismaClient,
  AssertionEngine,
  ExecutionDomainError,
  BrowserSessionManager,
  BrowserSessionNotFoundError,
  CrossRunExecutionError,
} from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let testEngine: AssertionEngine | null = null;
let testSessionManager: BrowserSessionManager | null = null;

export function setAssertionEngineForTest(engine: AssertionEngine | null): void {
  testEngine = engine;
}

export function setSessionManagerForTest(manager: BrowserSessionManager | null): void {
  testSessionManager = manager;
}

function resolveEngine(): AssertionEngine {
  return testEngine ?? getAssertionEngine();
}

function resolveSessionManager(): BrowserSessionManager {
  if (testSessionManager) return testSessionManager;
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  return getBrowserSessionManager(prisma);
}

const ALLOWED_ASSERTION_ERROR_CODES = new Set([
  'ASSERTION_FAILED',
  'ASSERTION_TIMEOUT',
  'ASSERTION_ERROR',
  'UNSUPPORTED_ASSERTION',
  'INVALID_ASSERTION_TYPE',
  'INVALID_ASSERTION_OPERATOR',
  'INVALID_EXPECTED_VALUE',
  'MALFORMED_REGEX',
  'UNRESOLVED_VARIABLE',
  'LOCATOR_NOT_FOUND',
  'LOCATOR_AMBIGUOUS',
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
  if (err instanceof ExecutionDomainError && ALLOWED_ASSERTION_ERROR_CODES.has(err.code)) {
    return {
      code: err.code,
      message: err.message,
    };
  }

  if (err && typeof err === 'object' && 'name' in err && (err as any).name === 'ZodError') {
    return {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input payload for assertion.',
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: err instanceof Error ? err.message : 'An unexpected assertion error occurred.',
  };
}

export async function handleAssert(
  event: IpcMainInvokeEvent,
  payload: AssertInputDto,
): Promise<DesktopResult<AssertionResultDto>> {
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
    const validated = assertInputSchema.parse(payload);
    const sessionManager = resolveSessionManager();
    const session =
      sessionManager.getSessionByRunId(validated.testRunId) ??
      sessionManager.getActiveSessions().find(s => s.sessionId === validated.testRunId) ??
      null;

    if (!session) {
      throw new BrowserSessionNotFoundError(validated.testRunId);
    }

    if (session.projectId !== validated.projectId) {
      throw new CrossRunExecutionError(
        `Cross-project assertion blocked: Session belongs to project '${session.projectId}', not '${validated.projectId}'.`,
      );
    }

    const engine = resolveEngine();
    const result = await engine.evaluateAssertion(
      validated.assertion,
      {
        projectId: validated.projectId,
        testRunId: validated.testRunId,
        stepId: validated.stepId,
        page: session.page,
        browserContext: session.context,
        session,
      },
      validated.options,
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

export async function handleEvaluateStepAssertions(
  event: IpcMainInvokeEvent,
  payload: EvaluateStepAssertionsInputDto,
): Promise<DesktopResult<StepAssertionEvaluationResultDto>> {
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
    const validated = evaluateStepAssertionsInputSchema.parse(payload);
    const sessionManager = resolveSessionManager();
    const session =
      sessionManager.getSessionByRunId(validated.testRunId) ??
      sessionManager.getActiveSessions().find(s => s.sessionId === validated.testRunId) ??
      null;

    if (!session) {
      throw new BrowserSessionNotFoundError(validated.testRunId);
    }

    if (session.projectId !== validated.projectId) {
      throw new CrossRunExecutionError(
        `Cross-project assertion blocked: Session belongs to project '${session.projectId}', not '${validated.projectId}'.`,
      );
    }

    const engine = resolveEngine();
    const result = await engine.evaluateStepAssertions(
      validated.stepId,
      validated.assertions,
      {
        projectId: validated.projectId,
        testRunId: validated.testRunId,
        stepId: validated.stepId,
        page: session.page,
        browserContext: session.context,
        session,
      },
      validated.options,
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
