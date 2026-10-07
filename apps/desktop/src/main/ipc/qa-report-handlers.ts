/**
 * @file apps/desktop/src/main/ipc/qa-report-handlers.ts
 * Main-process IPC handlers for Final QA Report & Release Readiness Intelligence (V7 Phase 109).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopError,
  type DesktopResult,
  type FinalQaReportDto,
  type ExportQaReportResultDto,
  type ReleasePolicyEvaluationResultDto,
  type QaReportStalenessResultDto,
  generateQaReportInputSchema,
  getQaReportInputSchema,
  listQaReportsInputSchema,
  finalizeQaReportInputSchema,
  exportQaReportInputSchema,
  evaluateReleasePolicyInputSchema,
  checkQaReportStalenessInputSchema,
} from '@ai-quality/contracts';
import { FinalQaReportError, FinalQaReportService, getPrismaClient } from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let finalQaReportService: FinalQaReportService | null = null;

export function resolveFinalQaReportService(): FinalQaReportService {
  if (!finalQaReportService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }
    finalQaReportService = new FinalQaReportService({ prisma });
  }
  return finalQaReportService;
}

export function setFinalQaReportService(service: FinalQaReportService | null): void {
  finalQaReportService = service;
}

function sanitizeError(err: unknown): DesktopError {
  if (err && typeof err === 'object' && 'issues' in err) {
    return {
      code: 'QA_REPORT_VALIDATION_ERROR',
      message:
        (err as { issues: Array<{ message: string }> }).issues[0]?.message ?? 'Validation error',
    };
  }

  if (err instanceof FinalQaReportError) {
    return {
      code: err.code,
      message: err.message,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    code: 'INTERNAL_ERROR',
    message,
  };
}

export async function handleGenerateQaReport(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FinalQaReportDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const parsed = generateQaReportInputSchema.parse(input);
    const service = resolveFinalQaReportService();
    const result = await service.generateReport(parsed);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetQaReport(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FinalQaReportDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const parsed = getQaReportInputSchema.parse(input);
    const service = resolveFinalQaReportService();
    const result = await service.getReport(parsed);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListQaReports(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly FinalQaReportDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const parsed = listQaReportsInputSchema.parse(input);
    const service = resolveFinalQaReportService();
    const result = await service.listReports(parsed);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleFinalizeQaReport(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FinalQaReportDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const parsed = finalizeQaReportInputSchema.parse(input);
    const service = resolveFinalQaReportService();
    const result = await service.finalizeReport(parsed);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleExportQaReport(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ExportQaReportResultDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const parsed = exportQaReportInputSchema.parse(input);
    const service = resolveFinalQaReportService();
    const result = await service.exportReport(parsed);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleEvaluateReleasePolicy(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ReleasePolicyEvaluationResultDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const parsed = evaluateReleasePolicyInputSchema.parse(input);
    const service = resolveFinalQaReportService();
    const result = await service.evaluatePolicy(parsed);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleCheckQaReportStaleness(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<QaReportStalenessResultDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const parsed = checkQaReportStalenessInputSchema.parse(input);
    const service = resolveFinalQaReportService();
    const result = await service.checkStaleness(parsed);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}
