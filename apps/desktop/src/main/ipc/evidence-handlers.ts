/**
 * @file apps/desktop/src/main/ipc/evidence-handlers.ts
 * Main-process IPC handlers for Failure Evidence Capture Foundation (V5 Phase 69).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopResult,
  type DesktopError,
  type ExecutionEvidenceBundleDto,
  type ExecutionEvidenceArtifactDto,
  type EvidenceArtifactContentDto,
  createEvidenceBundleInputSchema,
  addEvidenceArtifactInputSchema,
  finalizeEvidenceBundleInputSchema,
  getEvidenceBundleInputSchema,
  listEvidenceBundlesInputSchema,
  listEvidenceArtifactsInputSchema,
  getEvidenceArtifactMetadataInputSchema,
  getEvidenceArtifactContentInputSchema,
  verifyEvidenceArtifactIntegrityInputSchema,
} from '@ai-quality/contracts';
import {
  ExecutionEvidenceService,
  EvidenceDomainError,
  getPrismaClient,
  getEvidenceStorageService,
} from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let sharedEvidenceService: ExecutionEvidenceService | null = null;

function resolveEvidenceService(): ExecutionEvidenceService {
  if (sharedEvidenceService) {
    return sharedEvidenceService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  const storageService = getEvidenceStorageService();
  sharedEvidenceService = new ExecutionEvidenceService({ prisma, storageService });
  return sharedEvidenceService;
}

export function setSharedEvidenceService(service: ExecutionEvidenceService | null): void {
  sharedEvidenceService = service;
}

export async function handleCreateEvidenceBundle(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ExecutionEvidenceBundleDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = createEvidenceBundleInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid evidence bundle input: ' + parsed.error.issues.map(i => i.message).join(', '),
      },
    };
  }

  try {
    const service = resolveEvidenceService();
    const result = await service.createBundle(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: mapToDesktopError(err) };
  }
}

export async function handleAddEvidenceArtifact(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ExecutionEvidenceArtifactDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = addEvidenceArtifactInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid evidence artifact input: ' + parsed.error.issues.map(i => i.message).join(', '),
      },
    };
  }

  try {
    const service = resolveEvidenceService();
    const result = await service.addArtifact(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: mapToDesktopError(err) };
  }
}

export async function handleFinalizeEvidenceBundle(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ExecutionEvidenceBundleDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = finalizeEvidenceBundleInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid finalize evidence bundle input: ' +
          parsed.error.issues.map(i => i.message).join(', '),
      },
    };
  }

  try {
    const service = resolveEvidenceService();
    const result = await service.finalizeBundle(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: mapToDesktopError(err) };
  }
}

export async function handleGetEvidenceBundle(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ExecutionEvidenceBundleDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getEvidenceBundleInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid get evidence bundle input: ' +
          parsed.error.issues.map(i => i.message).join(', '),
      },
    };
  }

  try {
    const service = resolveEvidenceService();
    const result = await service.getBundle(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: mapToDesktopError(err) };
  }
}

export async function handleListEvidenceBundles(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<
  DesktopResult<{
    readonly items: readonly ExecutionEvidenceBundleDto[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly totalPages: number;
  }>
> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = listEvidenceBundlesInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid list evidence bundles input: ' +
          parsed.error.issues.map(i => i.message).join(', '),
      },
    };
  }

  try {
    const service = resolveEvidenceService();
    const result = await service.listBundles(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: mapToDesktopError(err) };
  }
}

export async function handleListEvidenceArtifacts(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<
  DesktopResult<{
    readonly items: readonly ExecutionEvidenceArtifactDto[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly totalPages: number;
  }>
> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = listEvidenceArtifactsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid list evidence artifacts input: ' +
          parsed.error.issues.map(i => i.message).join(', '),
      },
    };
  }

  try {
    const service = resolveEvidenceService();
    const result = await service.listArtifacts(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: mapToDesktopError(err) };
  }
}

export async function handleGetEvidenceArtifactMetadata(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ExecutionEvidenceArtifactDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getEvidenceArtifactMetadataInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid get evidence artifact metadata input: ' +
          parsed.error.issues.map(i => i.message).join(', '),
      },
    };
  }

  try {
    const service = resolveEvidenceService();
    const result = await service.getArtifactMetadata(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: mapToDesktopError(err) };
  }
}

export async function handleGetEvidenceArtifactContent(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<EvidenceArtifactContentDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getEvidenceArtifactContentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid get evidence artifact content input: ' +
          parsed.error.issues.map(i => i.message).join(', '),
      },
    };
  }

  try {
    const service = resolveEvidenceService();
    const storageService = getEvidenceStorageService();
    const meta = await service.getArtifactMetadata(parsed.data);

    const file = await storageService.readArtifact({
      projectId: meta.projectId,
      testRunId: meta.testRunId,
      executionId: meta.executionId,
      storageIdentity: meta.storageIdentity,
      expectedSha256: meta.sha256,
    });

    const isBinary =
      meta.mimeType.startsWith('image/') ||
      meta.mimeType === 'application/zip' ||
      meta.mimeType === 'application/pdf' ||
      meta.mimeType.startsWith('video/') ||
      meta.mimeType === 'application/octet-stream';

    const contentStr = isBinary ? file.buffer.toString('base64') : file.buffer.toString('utf8');

    return {
      ok: true,
      data: {
        id: meta.id,
        projectId: meta.projectId,
        artifactType: meta.artifactType,
        mimeType: meta.mimeType,
        byteSize: meta.byteSize,
        sha256: meta.sha256,
        content: contentStr,
        isBase64: isBinary,
      },
    };
  } catch (err) {
    return { ok: false, error: mapToDesktopError(err) };
  }
}

export async function handleVerifyEvidenceIntegrity(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<
  DesktopResult<{
    readonly isValid: boolean;
    readonly expectedSha256: string;
    readonly actualSha256: string;
    readonly byteSize: number;
  }>
> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = verifyEvidenceArtifactIntegrityInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid verify evidence integrity input: ' +
          parsed.error.issues.map(i => i.message).join(', '),
      },
    };
  }

  try {
    const service = resolveEvidenceService();
    const result = await service.verifyArtifactIntegrity(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: mapToDesktopError(err) };
  }
}

function mapToDesktopError(err: unknown): DesktopError {
  if (err instanceof EvidenceDomainError) {
    return {
      code: err.code,
      message: err.message,
    };
  }
  return {
    code: 'INTERNAL_ERROR',
    message: err instanceof Error ? err.message : 'Internal evidence error occurred.',
  };
}
