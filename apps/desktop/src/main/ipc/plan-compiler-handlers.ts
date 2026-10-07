/**
 * @file apps/desktop/src/main/ipc/plan-compiler-handlers.ts
 * IPC handlers for the Structured Test-to-Executable Plan Compiler (V5 Phase 60).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopResult,
  type DesktopErrorCode,
  type ExecutableTestPlanDto,
  type CompileTestPlanInputDto,
  type GetExecutablePlanInputDto,
  type GetExecutablePlanByTestCaseInputDto,
  type ListExecutablePlansInputDto,
  type PreviewTestPlanInputDto,
  compileTestPlanInputSchema,
  getExecutablePlanInputSchema,
  getExecutablePlanByTestCaseInputSchema,
  listExecutablePlansInputSchema,
  previewTestPlanInputSchema,
} from '@ai-quality/contracts';
import {
  getExecutablePlanService,
  getPrismaClient,
  CompilerBaseError,
  ExecutablePlanService,
} from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let testPlanService: ExecutablePlanService | null = null;

export function setExecutablePlanServiceForTest(service: ExecutablePlanService | null): void {
  testPlanService = service;
}

function getPlanService(): ExecutablePlanService {
  return testPlanService ?? getExecutablePlanService(getPrismaClient()!);
}

function sanitizeCompilerError(err: unknown): { code: DesktopErrorCode; message: string } {
  if (err instanceof CompilerBaseError) {
    return {
      code: err.code as DesktopErrorCode,
      message: err.message.slice(0, 300),
    };
  }
  const message = err instanceof Error ? err.message : 'Unknown plan compilation failure';
  return {
    code: 'INTERNAL_ERROR',
    message: message.slice(0, 300),
  };
}

/**
 * Compiles and persists an executable test plan.
 */
export async function handleCompilePlan(
  event: IpcMainInvokeEvent,
  input: CompileTestPlanInputDto,
): Promise<DesktopResult<ExecutableTestPlanDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parseResult = compileTestPlanInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid compile test plan input payload.',
      },
    };
  }

  try {
    const plan = await getPlanService().compilePlan(parseResult.data);
    return {
      ok: true,
      data: plan,
    };
  } catch (error) {
    return {
      ok: false,
      error: sanitizeCompilerError(error),
    };
  }
}

/**
 * Retrieves an executable test plan by ID.
 */
export async function handleGetPlan(
  event: IpcMainInvokeEvent,
  input: GetExecutablePlanInputDto,
): Promise<DesktopResult<ExecutableTestPlanDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parseResult = getExecutablePlanInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid get plan input payload.',
      },
    };
  }

  try {
    const plan = await getPlanService().getPlan(parseResult.data);
    return {
      ok: true,
      data: plan,
    };
  } catch (error) {
    return {
      ok: false,
      error: sanitizeCompilerError(error),
    };
  }
}

/**
 * Retrieves the latest executable test plan for a test case.
 */
export async function handleGetPlanByTestCase(
  event: IpcMainInvokeEvent,
  input: GetExecutablePlanByTestCaseInputDto,
): Promise<DesktopResult<ExecutableTestPlanDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parseResult = getExecutablePlanByTestCaseInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid get plan by test case input payload.',
      },
    };
  }

  try {
    const plan = await getPlanService().getPlanByTestCase(parseResult.data);
    return {
      ok: true,
      data: plan,
    };
  } catch (error) {
    return {
      ok: false,
      error: sanitizeCompilerError(error),
    };
  }
}

/**
 * Lists executable test plans for a project with optional filters.
 */
export async function handleListPlans(
  event: IpcMainInvokeEvent,
  input: ListExecutablePlansInputDto,
): Promise<DesktopResult<readonly ExecutableTestPlanDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parseResult = listExecutablePlansInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid list plans input payload.',
      },
    };
  }

  try {
    const plans = await getPlanService().listPlans(parseResult.data);
    return {
      ok: true,
      data: plans,
    };
  } catch (error) {
    return {
      ok: false,
      error: sanitizeCompilerError(error),
    };
  }
}

/**
 * Compiles a plan in-memory for preview without database persistence.
 */
export async function handlePreviewPlan(
  event: IpcMainInvokeEvent,
  input: PreviewTestPlanInputDto,
): Promise<DesktopResult<ExecutableTestPlanDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parseResult = previewTestPlanInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid preview plan input payload.',
      },
    };
  }

  try {
    const plan = await getPlanService().previewPlan(parseResult.data);
    return {
      ok: true,
      data: plan,
    };
  } catch (error) {
    return {
      ok: false,
      error: sanitizeCompilerError(error),
    };
  }
}
