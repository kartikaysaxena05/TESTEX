/**
 * @file apps/desktop/src/main/ipc/coverage-handlers.ts
 * IPC handlers for Coverage Analysis & Traceability Matrix subsystem.
 */

import type { IpcMainInvokeEvent } from 'electron';
import type {
  DesktopResult,
  OrphanTestsResultDto,
  ProjectCoverageSummaryDto,
  RequirementCoverageDetailDto,
  ReverseTraceabilityResultDto,
  TraceabilityMatrixResultDto,
} from '@ai-quality/contracts';
import {
  getOrphanTestsInputSchema,
  getProjectCoverageInputSchema,
  getRequirementCoverageInputSchema,
  getReverseTraceabilityInputSchema,
  getTraceabilityMatrixInputSchema,
} from '@ai-quality/contracts';
import {
  CoverageAnalysisService,
  CoverageProjectMismatchError,
  CoverageRequirementNotFoundError,
  CoverageValidationError,
  getPrismaClient,
} from '@ai-quality/core';

let coverageServiceInstance: CoverageAnalysisService | null = null;

function getCoverageService(): CoverageAnalysisService {
  if (!coverageServiceInstance) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not initialized.');
    }
    coverageServiceInstance = new CoverageAnalysisService(prisma);
  }
  return coverageServiceInstance;
}

export function setCoverageServiceForTesting(service: CoverageAnalysisService | null): void {
  coverageServiceInstance = service;
}

export async function handleGetProjectCoverageSummary(
  _event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ProjectCoverageSummaryDto>> {
  const parsed = getProjectCoverageInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'COVERAGE_VALIDATION_FAILED',
        message: parsed.error.issues.map(i => i.message).join('; '),
      },
    };
  }

  try {
    const service = getCoverageService();
    const result = await service.getProjectCoverageSummary(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function handleGetRequirementCoverage(
  _event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<RequirementCoverageDetailDto>> {
  const parsed = getRequirementCoverageInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'COVERAGE_VALIDATION_FAILED',
        message: parsed.error.issues.map(i => i.message).join('; '),
      },
    };
  }

  try {
    const service = getCoverageService();
    const result = await service.getRequirementCoverage(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function handleGetTraceabilityMatrix(
  _event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<TraceabilityMatrixResultDto>> {
  const parsed = getTraceabilityMatrixInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'COVERAGE_VALIDATION_FAILED',
        message: parsed.error.issues.map(i => i.message).join('; '),
      },
    };
  }

  try {
    const service = getCoverageService();
    const result = await service.getTraceabilityMatrix(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function handleGetReverseTraceability(
  _event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ReverseTraceabilityResultDto>> {
  const parsed = getReverseTraceabilityInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'COVERAGE_VALIDATION_FAILED',
        message: parsed.error.issues.map(i => i.message).join('; '),
      },
    };
  }

  try {
    const service = getCoverageService();
    const result = await service.getReverseTraceability(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function handleGetOrphanTests(
  _event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<OrphanTestsResultDto>> {
  const parsed = getOrphanTestsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'COVERAGE_VALIDATION_FAILED',
        message: parsed.error.issues.map(i => i.message).join('; '),
      },
    };
  }

  try {
    const service = getCoverageService();
    const result = await service.getOrphanTests(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return mapError(err);
  }
}

function mapError(err: unknown): DesktopResult<never> {
  if (err instanceof CoverageProjectMismatchError) {
    return {
      ok: false,
      error: {
        code: 'COVERAGE_PROJECT_MISMATCH',
        message: err.message,
      },
    };
  }
  if (err instanceof CoverageRequirementNotFoundError) {
    return {
      ok: false,
      error: {
        code: 'COVERAGE_REQUIREMENT_NOT_FOUND',
        message: err.message,
      },
    };
  }
  if (err instanceof CoverageValidationError) {
    return {
      ok: false,
      error: {
        code: 'COVERAGE_VALIDATION_FAILED',
        message: err.message,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message:
        err instanceof Error ? err.message : 'An internal error occurred in coverage analysis.',
    },
  };
}
