/**
 * @file apps/desktop/src/main/ipc/traceability-handlers.ts
 * IPC handlers for Requirement-to-Test Traceability.
 */

import type { IpcMainInvokeEvent } from 'electron';
import type {
  DesktopResult,
  ListTracesResultDto,
  RequirementTestTraceDto,
} from '@ai-quality/contracts';
import {
  createRequirementTestTraceInputSchema,
  deleteRequirementTestTraceInputSchema,
  getTraceByIdInputSchema,
  listProjectTracesInputSchema,
  listTracesByRequirementInputSchema,
  listTracesByTestCaseInputSchema,
} from '@ai-quality/contracts';
import {
  RequirementTestTraceService,
  TraceNotFoundError,
  TraceProjectMismatchError,
  TraceRequirementNotFoundError,
  TraceTestCaseNotFoundError,
  TraceValidationError,
  getPrismaClient,
} from '@ai-quality/core';

let traceServiceInstance: RequirementTestTraceService | null = null;

function getTraceService(): RequirementTestTraceService {
  if (!traceServiceInstance) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not initialized.');
    }
    traceServiceInstance = new RequirementTestTraceService(prisma);
  }
  return traceServiceInstance;
}

export function setTraceServiceForTesting(service: RequirementTestTraceService | null): void {
  traceServiceInstance = service;
}

export async function handleCreateTrace(
  _event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<RequirementTestTraceDto>> {
  const parsed = createRequirementTestTraceInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'TRACEABILITY_VALIDATION_FAILED',
        message: parsed.error.issues.map(i => i.message).join('; '),
      },
    };
  }

  try {
    const service = getTraceService();
    const result = await service.createTrace(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function handleDeleteTrace(
  _event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<{ readonly deleted: true }>> {
  const parsed = deleteRequirementTestTraceInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'TRACEABILITY_VALIDATION_FAILED',
        message: parsed.error.issues.map(i => i.message).join('; '),
      },
    };
  }

  try {
    const service = getTraceService();
    const result = await service.deleteTrace(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function handleGetTraceById(
  _event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<RequirementTestTraceDto | null>> {
  const parsed = getTraceByIdInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'TRACEABILITY_VALIDATION_FAILED',
        message: parsed.error.issues.map(i => i.message).join('; '),
      },
    };
  }

  try {
    const service = getTraceService();
    const result = await service.getTraceById(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function handleListTracesByRequirement(
  _event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ListTracesResultDto>> {
  const parsed = listTracesByRequirementInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'TRACEABILITY_VALIDATION_FAILED',
        message: parsed.error.issues.map(i => i.message).join('; '),
      },
    };
  }

  try {
    const service = getTraceService();
    const result = await service.listTracesForRequirement(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function handleListTracesByTestCase(
  _event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ListTracesResultDto>> {
  const parsed = listTracesByTestCaseInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'TRACEABILITY_VALIDATION_FAILED',
        message: parsed.error.issues.map(i => i.message).join('; '),
      },
    };
  }

  try {
    const service = getTraceService();
    const result = await service.listTracesForTestCase(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function handleListProjectTraces(
  _event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ListTracesResultDto>> {
  const parsed = listProjectTracesInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'TRACEABILITY_VALIDATION_FAILED',
        message: parsed.error.issues.map(i => i.message).join('; '),
      },
    };
  }

  try {
    const service = getTraceService();
    const result = await service.listProjectTraces(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return mapError(err);
  }
}

function mapError(err: unknown): DesktopResult<never> {
  if (err instanceof TraceProjectMismatchError) {
    return {
      ok: false,
      error: {
        code: 'TRACEABILITY_PROJECT_MISMATCH',
        message: err.message,
      },
    };
  }
  if (err instanceof TraceNotFoundError) {
    return {
      ok: false,
      error: {
        code: 'TRACEABILITY_NOT_FOUND',
        message: err.message,
      },
    };
  }
  if (err instanceof TraceRequirementNotFoundError) {
    return {
      ok: false,
      error: {
        code: 'TRACEABILITY_REQUIREMENT_NOT_FOUND',
        message: err.message,
      },
    };
  }
  if (err instanceof TraceTestCaseNotFoundError) {
    return {
      ok: false,
      error: {
        code: 'TRACEABILITY_TEST_CASE_NOT_FOUND',
        message: err.message,
      },
    };
  }
  if (err instanceof TraceValidationError) {
    return {
      ok: false,
      error: {
        code: 'TRACEABILITY_VALIDATION_FAILED',
        message: err.message,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: err instanceof Error ? err.message : 'An internal error occurred in traceability.',
    },
  };
}
