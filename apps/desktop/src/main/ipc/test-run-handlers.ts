/**
 * @file apps/desktop/src/main/ipc/test-run-handlers.ts
 * IPC handlers for Test Run Orchestration, Queue, State Machine & Cancellation (V5 Phase 61).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopResult,
  type DesktopErrorCode,
  type TestRunDto,
  type TestRunQueueStateDto,
  type EnqueueTestRunInputDto,
  type GetTestRunInputDto,
  type ListTestRunsInputDto,
  type CancelTestRunInputDto,
  enqueueTestRunInputSchema,
  getTestRunInputSchema,
  listTestRunsInputSchema,
  cancelTestRunInputSchema,
} from '@ai-quality/contracts';
import {
  getTestRunService,
  getPrismaClient,
  ExecutionDomainError,
  TestRunService,
} from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let testRunService: TestRunService | null = null;

export function setTestRunServiceForTest(service: TestRunService | null): void {
  testRunService = service;
}

function getService(): TestRunService {
  return testRunService ?? getTestRunService(getPrismaClient()!);
}

function sanitizeTestRunError(err: unknown): { code: DesktopErrorCode; message: string } {
  if (err instanceof ExecutionDomainError) {
    return {
      code: err.code as DesktopErrorCode,
      message: err.message.slice(0, 300),
    };
  }
  const message = err instanceof Error ? err.message : 'Unknown test run failure';
  return {
    code: 'INTERNAL_ERROR',
    message: message.slice(0, 300),
  };
}

/**
 * Enqueues a new test execution run.
 */
export async function handleEnqueueTestRun(
  event: IpcMainInvokeEvent,
  input: EnqueueTestRunInputDto,
): Promise<DesktopResult<TestRunDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parseResult = enqueueTestRunInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid enqueue test run input payload.',
      },
    };
  }

  try {
    const run = await getService().enqueueRun(parseResult.data);
    return {
      ok: true,
      data: run,
    };
  } catch (error) {
    return {
      ok: false,
      error: sanitizeTestRunError(error),
    };
  }
}

/**
 * Retrieves a test run by ID.
 */
export async function handleGetTestRun(
  event: IpcMainInvokeEvent,
  input: GetTestRunInputDto,
): Promise<DesktopResult<TestRunDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parseResult = getTestRunInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid get test run input payload.',
      },
    };
  }

  try {
    const run = await getService().getRun(parseResult.data);
    return {
      ok: true,
      data: run,
    };
  } catch (error) {
    return {
      ok: false,
      error: sanitizeTestRunError(error),
    };
  }
}

/**
 * Lists test runs for a project with optional filters.
 */
export async function handleListTestRuns(
  event: IpcMainInvokeEvent,
  input: ListTestRunsInputDto,
): Promise<DesktopResult<readonly TestRunDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parseResult = listTestRunsInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid list test runs input payload.',
      },
    };
  }

  try {
    const runs = await getService().listRuns(parseResult.data);
    return {
      ok: true,
      data: runs,
    };
  } catch (error) {
    return {
      ok: false,
      error: sanitizeTestRunError(error),
    };
  }
}

/**
 * Cancels a queued, preparing, or running test execution.
 */
export async function handleCancelTestRun(
  event: IpcMainInvokeEvent,
  input: CancelTestRunInputDto,
): Promise<DesktopResult<TestRunDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parseResult = cancelTestRunInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid cancel test run input payload.',
      },
    };
  }

  try {
    const run = await getService().cancelRun(parseResult.data);
    return {
      ok: true,
      data: run,
    };
  } catch (error) {
    return {
      ok: false,
      error: sanitizeTestRunError(error),
    };
  }
}

/**
 * Retrieves current execution queue metrics and state for a project.
 */
export async function handleGetTestRunQueueState(
  event: IpcMainInvokeEvent,
  input: { readonly projectId: string },
): Promise<DesktopResult<TestRunQueueStateDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  if (!input || typeof input.projectId !== 'string' || !input.projectId.trim()) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid project ID.',
      },
    };
  }

  try {
    const state = await getService().getQueueState(input.projectId);
    return {
      ok: true,
      data: state,
    };
  } catch (error) {
    return {
      ok: false,
      error: sanitizeTestRunError(error),
    };
  }
}
