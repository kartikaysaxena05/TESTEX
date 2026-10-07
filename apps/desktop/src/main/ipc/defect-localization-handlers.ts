/**
 * @file apps/desktop/src/main/ipc/defect-localization-handlers.ts
 * Main-process IPC handlers for Repository-Aware Defect Localization (V7 Phase 100).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type CandidateSourceContentDto,
  type DesktopError,
  type DesktopResult,
  type RepositoryDefectLocalizationDto,
  getDefectLocalizationInputSchema,
  inspectCandidateSourceInputSchema,
  listDefectLocalizationsInputSchema,
  localizeDefectInputSchema,
} from '@ai-quality/contracts';
import {
  DefectLocalizationError,
  DefectLocalizationService,
  getPrismaClient,
} from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let defectLocalizationService: DefectLocalizationService | null = null;

export function resolveDefectLocalizationService(): DefectLocalizationService {
  if (!defectLocalizationService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }
    defectLocalizationService = new DefectLocalizationService(prisma);
  }
  return defectLocalizationService;
}

export function setDefectLocalizationService(service: DefectLocalizationService | null): void {
  defectLocalizationService = service;
}

function sanitizeError(err: unknown): DesktopError {
  if (err && typeof err === 'object' && 'issues' in err) {
    return {
      code: 'VALIDATION_ERROR',
      message:
        (err as { issues: Array<{ message: string }> }).issues[0]?.message ?? 'Validation error',
    };
  }

  if (err instanceof DefectLocalizationError) {
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

export async function handleLocalizeDefect(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<RepositoryDefectLocalizationDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = localizeDefectInputSchema.parse(input);
    const service = resolveDefectLocalizationService();
    const result = await service.localizeDefect(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetDefectLocalization(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<RepositoryDefectLocalizationDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = getDefectLocalizationInputSchema.parse(input);
    const service = resolveDefectLocalizationService();
    const result = await service.getLocalization(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListDefectLocalizations(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly RepositoryDefectLocalizationDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = listDefectLocalizationsInputSchema.parse(input);
    const service = resolveDefectLocalizationService();
    const result = await service.listLocalizations(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleInspectCandidateSource(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<CandidateSourceContentDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = inspectCandidateSourceInputSchema.parse(input);
    const service = resolveDefectLocalizationService();
    const result = await service.inspectCandidateSource(validated);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}
