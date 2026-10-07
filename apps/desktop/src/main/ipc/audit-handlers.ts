/**
 * @file apps/desktop/src/main/ipc/audit-handlers.ts
 * Main-process IPC handlers for Complete Repair & Reverification Audit Trail (V7 Phase 108).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopError,
  type DesktopResult,
  type RepairAuditTimelineDto,
  type RepairSessionDto,
  type RepairAuditEventDto,
  type ExportRepairTimelineResultDto,
  getRepairTimelineInputSchema,
  getRepairSessionInputSchema,
  listRepairSessionsInputSchema,
  exportRepairTimelineInputSchema,
  recordRepairAuditEventInputSchema,
} from '@ai-quality/contracts';
import { RepairAuditError, RepairAuditTrailService, getPrismaClient } from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let repairAuditTrailService: RepairAuditTrailService | null = null;

export function resolveRepairAuditTrailService(): RepairAuditTrailService {
  if (!repairAuditTrailService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }
    repairAuditTrailService = new RepairAuditTrailService({ prisma });
  }
  return repairAuditTrailService;
}

export function setRepairAuditTrailService(service: RepairAuditTrailService | null): void {
  repairAuditTrailService = service;
}

function sanitizeError(err: unknown): DesktopError {
  if (err && typeof err === 'object' && 'issues' in err) {
    return {
      code: 'VALIDATION_ERROR',
      message:
        (err as { issues: Array<{ message: string }> }).issues[0]?.message ?? 'Validation error',
    };
  }

  if (err instanceof RepairAuditError) {
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

export async function handleGetRepairTimeline(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<RepairAuditTimelineDto>> {
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
    const parsed = getRepairTimelineInputSchema.parse(input);
    const service = resolveRepairAuditTrailService();
    const data = await service.getTimeline(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetRepairSession(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<RepairSessionDto | null>> {
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
    const parsed = getRepairSessionInputSchema.parse(input);
    const service = resolveRepairAuditTrailService();
    const data = await service.getSession(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListRepairSessions(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly RepairSessionDto[]>> {
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
    const parsed = listRepairSessionsInputSchema.parse(input);
    const service = resolveRepairAuditTrailService();
    const data = await service.listSessions(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleExportRepairTimeline(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ExportRepairTimelineResultDto>> {
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
    const parsed = exportRepairTimelineInputSchema.parse(input);
    const service = resolveRepairAuditTrailService();
    const data = await service.exportTimeline(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleRecordRepairAuditEvent(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<RepairAuditEventDto>> {
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
    const parsed = recordRepairAuditEventInputSchema.parse(input);
    const service = resolveRepairAuditTrailService();
    const data = await service.recordEvent(parsed);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}
