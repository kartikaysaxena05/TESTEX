/**
 * @file apps/desktop/src/main/ipc/failure-handlers.ts
 * Main-process IPC handlers for V6 Failure Intelligence domain operations.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopResult,
  type DesktopError,
  type DesktopErrorCode,
  type FailureCaseDto,
  type FailureAnalysisRunDto,
  type FailureEvidenceReferenceDto,
  createFailureCaseInputSchema,
  ensureFailureCaseInputSchema,
  getFailureCaseInputSchema,
  listFailureCasesInputSchema,
  startFailureAnalysisInputSchema,
  completeFailureAnalysisInputSchema,
  failFailureAnalysisInputSchema,
  cancelFailureAnalysisInputSchema,
  markFailureCaseStaleInputSchema,
  listFailureAnalysisRunsInputSchema,
  listFailureEvidenceReferencesInputSchema,
} from '@ai-quality/contracts';
import { FailureCaseService, getPrismaClient } from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let sharedFailureCaseService: FailureCaseService | null = null;

function resolveFailureCaseService(): FailureCaseService {
  if (sharedFailureCaseService) {
    return sharedFailureCaseService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedFailureCaseService = new FailureCaseService({ prisma });
  return sharedFailureCaseService;
}

export function setSharedFailureCaseService(service: FailureCaseService | null): void {
  sharedFailureCaseService = service;
}

function sanitizeError(err: unknown): DesktopError {
  if (err && typeof err === 'object' && 'code' in err && typeof (err as any).code === 'string') {
    return {
      code: (err as any).code as DesktopErrorCode,
      message: (err as any).message || String(err),
    };
  }

  if (err instanceof Error) {
    return {
      code: 'INTERNAL_ERROR',
      message: err.message,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected internal error occurred.',
  };
}

export async function handleCreateFailureCase(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureCaseDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = createFailureCaseInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid create failure case input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureCaseService();
    const result = await service.createFailureCase(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleEnsureFailureCase(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureCaseDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = ensureFailureCaseInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid ensure failure case input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureCaseService();
    const result = await service.ensureFailureCaseFromExecution(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetFailureCase(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureCaseDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getFailureCaseInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid get failure case input: ' + parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureCaseService();
    const result = await service.getFailureCase(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListFailureCases(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<
  DesktopResult<{
    readonly items: readonly FailureCaseDto[];
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

  const parsed = listFailureCasesInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid list failure cases input: ' + parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureCaseService();
    const result = await service.listFailureCases(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleStartFailureAnalysis(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureAnalysisRunDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = startFailureAnalysisInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid start failure analysis input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureCaseService();
    const result = await service.startAnalysis(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleCompleteFailureAnalysis(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureAnalysisRunDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = completeFailureAnalysisInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid complete failure analysis input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureCaseService();
    const result = await service.completeAnalysis(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleFailFailureAnalysis(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureAnalysisRunDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = failFailureAnalysisInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid fail failure analysis input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureCaseService();
    const result = await service.failAnalysis(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleCancelFailureAnalysis(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureCaseDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = cancelFailureAnalysisInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid cancel failure analysis input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureCaseService();
    const result = await service.cancelAnalysis(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleMarkFailureCaseStale(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureCaseDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = markFailureCaseStaleInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid mark failure case stale input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureCaseService();
    const result = await service.markStale(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListFailureAnalysisRuns(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly FailureAnalysisRunDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = listFailureAnalysisRunsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid list failure analysis runs input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureCaseService();
    const result = await service.listAnalysisRuns(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListFailureEvidenceReferences(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly FailureEvidenceReferenceDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = listFailureEvidenceReferencesInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid list failure evidence references input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureCaseService();
    const result = await service.listEvidenceReferences(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

// -----------------------------------------------------------------------------
// V6 Phase 75 — Evidence Ingestion, Normalization & Integrity IPC Handlers
// -----------------------------------------------------------------------------

import {
  type FailureEvidencePackageDto,
  type FailureEvidenceIntegrityReportDto,
  type FailureEvidenceArtifactContentDto,
  ingestFailureEvidenceInputSchema,
  getFailureEvidencePackageInputSchema,
  verifyEvidenceIntegrityInputSchema,
  getFailureEvidenceArtifactContentInputSchema,
} from '@ai-quality/contracts';
import { FailureEvidenceIngestionService } from '@ai-quality/core';

let sharedFailureEvidenceService: FailureEvidenceIngestionService | null = null;

function resolveFailureEvidenceService(): FailureEvidenceIngestionService {
  if (sharedFailureEvidenceService) {
    return sharedFailureEvidenceService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedFailureEvidenceService = new FailureEvidenceIngestionService({ prisma });
  return sharedFailureEvidenceService;
}

export function setSharedFailureEvidenceService(
  service: FailureEvidenceIngestionService | null,
): void {
  sharedFailureEvidenceService = service;
}

export async function handleIngestFailureEvidence(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureEvidencePackageDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = ingestFailureEvidenceInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid ingest failure evidence input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureEvidenceService();
    const result = await service.ingestEvidence(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetFailureEvidencePackage(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureEvidencePackageDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getFailureEvidencePackageInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid get failure evidence package input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureEvidenceService();
    const result = await service.getEvidencePackage(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleVerifyEvidenceIntegrity(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureEvidenceIntegrityReportDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = verifyEvidenceIntegrityInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid verify evidence integrity input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureEvidenceService();
    const result = await service.verifyEvidenceIntegrity(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetEvidenceArtifactContent(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureEvidenceArtifactContentDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getFailureEvidenceArtifactContentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid get evidence artifact content input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureEvidenceService();
    const result = await service.getEvidenceArtifactContent(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

// -----------------------------------------------------------------------------
// V6 Phase 76 — Failure Reproduction & Reproducibility Verification IPC Handlers
// -----------------------------------------------------------------------------

import {
  type FailureReproductionAttemptDto,
  type ReproducibilitySummaryDto,
  executeReproductionInputSchema,
  getReproductionAttemptsInputSchema,
  getReproducibilitySummaryInputSchema,
  cancelReproductionInputSchema,
} from '@ai-quality/contracts';
import { FailureReproductionService } from '@ai-quality/core';

let sharedFailureReproductionService: FailureReproductionService | null = null;

function resolveFailureReproductionService(): FailureReproductionService {
  if (sharedFailureReproductionService) {
    return sharedFailureReproductionService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedFailureReproductionService = new FailureReproductionService({ prisma });
  return sharedFailureReproductionService;
}

export function setSharedFailureReproductionService(
  service: FailureReproductionService | null,
): void {
  sharedFailureReproductionService = service;
}

export async function handleExecuteReproduction(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ReproducibilitySummaryDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = executeReproductionInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid execute reproduction input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureReproductionService();
    const result = await service.executeReproduction(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetReproductionAttempts(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly FailureReproductionAttemptDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getReproductionAttemptsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid get reproduction attempts input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureReproductionService();
    const result = await service.getReproductionAttempts(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetReproducibilitySummary(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ReproducibilitySummaryDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getReproducibilitySummaryInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid get reproducibility summary input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureReproductionService();
    const result = await service.getReproducibilitySummary(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleCancelReproduction(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<{ readonly cancelled: boolean }>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = cancelReproductionInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid cancel reproduction input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureReproductionService();
    const result = await service.cancelReproduction(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

// -----------------------------------------------------------------------------
// V6 Phase 77 — Failure Taxonomy & Deterministic Classification IPC Handlers
// -----------------------------------------------------------------------------

import {
  type FailureClassificationDto,
  classifyFailureInputSchema,
  getFailureClassificationInputSchema,
  reclassifyFailureInputSchema,
  listFailureClassificationsInputSchema,
} from '@ai-quality/contracts';
import { FailureDeterministicClassifier } from '@ai-quality/core';

let sharedFailureClassificationService: FailureDeterministicClassifier | null = null;

function resolveFailureClassificationService(): FailureDeterministicClassifier {
  if (sharedFailureClassificationService) {
    return sharedFailureClassificationService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedFailureClassificationService = new FailureDeterministicClassifier(prisma);
  return sharedFailureClassificationService;
}

export function setSharedFailureClassificationService(
  service: FailureDeterministicClassifier | null,
): void {
  sharedFailureClassificationService = service;
}

export async function handleClassifyFailure(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureClassificationDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = classifyFailureInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid classify failure input: ' + parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureClassificationService();
    const result = await service.classify(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetFailureClassification(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureClassificationDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getFailureClassificationInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid get failure classification input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureClassificationService();
    const result = await service.getClassification(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleReclassifyFailure(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureClassificationDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = reclassifyFailureInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid reclassify failure input: ' + parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureClassificationService();
    const result = await service.reclassify(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListFailureClassificationHistory(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly FailureClassificationDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = listFailureClassificationsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid list failure classification history input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureClassificationService();
    const result = await service.listClassificationHistory(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

// -----------------------------------------------------------------------------
// V6 Phase 78 — Classification Decision Integrity & Cross-Evidence Arbitration IPC Handlers
// -----------------------------------------------------------------------------

import {
  type ClassificationDecisionIntegrityDto,
  evaluateDecisionIntegrityInputSchema,
  getDecisionIntegrityInputSchema,
  recomputeDecisionIntegrityInputSchema,
  listDecisionIntegrityHistoryInputSchema,
} from '@ai-quality/contracts';
import { ClassificationDecisionIntegrityService } from '@ai-quality/core';

let sharedDecisionIntegrityService: ClassificationDecisionIntegrityService | null = null;

function resolveDecisionIntegrityService(): ClassificationDecisionIntegrityService {
  if (sharedDecisionIntegrityService) {
    return sharedDecisionIntegrityService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedDecisionIntegrityService = new ClassificationDecisionIntegrityService(prisma);
  return sharedDecisionIntegrityService;
}

export function setSharedDecisionIntegrityService(
  service: ClassificationDecisionIntegrityService | null,
): void {
  sharedDecisionIntegrityService = service;
}

export async function handleEvaluateDecisionIntegrity(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ClassificationDecisionIntegrityDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = evaluateDecisionIntegrityInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid evaluate decision integrity input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveDecisionIntegrityService();
    const result = await service.evaluateDecisionIntegrity(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetDecisionIntegrity(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ClassificationDecisionIntegrityDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getDecisionIntegrityInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid get decision integrity input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveDecisionIntegrityService();
    const result = await service.getDecisionIntegrity(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleRecomputeDecisionIntegrity(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ClassificationDecisionIntegrityDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = recomputeDecisionIntegrityInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid recompute decision integrity input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveDecisionIntegrityService();
    const result = await service.recomputeDecisionIntegrity(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListDecisionIntegrityHistory(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly ClassificationDecisionIntegrityDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = listDecisionIntegrityHistoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid list decision integrity history input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveDecisionIntegrityService();
    const result = await service.listDecisionIntegrityHistory(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

// -----------------------------------------------------------------------------
// V6 Phase 79 — Failure Flakiness Detection & Reproducibility Intelligence IPC Handlers
// -----------------------------------------------------------------------------

import {
  type FlakinessAnalysisDto,
  analyzeFlakinessInputSchema,
  getFlakinessAnalysisInputSchema,
  reanalyzeFlakinessInputSchema,
  listFlakinessHistoryInputSchema,
} from '@ai-quality/contracts';
import { FlakinessAnalysisService } from '@ai-quality/core';

let sharedFlakinessAnalysisService: FlakinessAnalysisService | null = null;

function resolveFlakinessAnalysisService(): FlakinessAnalysisService {
  if (sharedFlakinessAnalysisService) {
    return sharedFlakinessAnalysisService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedFlakinessAnalysisService = new FlakinessAnalysisService(prisma);
  return sharedFlakinessAnalysisService;
}

export function setSharedFlakinessAnalysisService(service: FlakinessAnalysisService | null): void {
  sharedFlakinessAnalysisService = service;
}

export async function handleAnalyzeFlakiness(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FlakinessAnalysisDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = analyzeFlakinessInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid analyze flakiness input: ' + parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFlakinessAnalysisService();
    const result = await service.analyzeFlakiness(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetFlakinessAnalysis(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FlakinessAnalysisDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getFlakinessAnalysisInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid get flakiness analysis input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFlakinessAnalysisService();
    const result = await service.getFlakinessAnalysis(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleReanalyzeFlakiness(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FlakinessAnalysisDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = reanalyzeFlakinessInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid reanalyze flakiness input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFlakinessAnalysisService();
    const result = await service.reanalyzeFlakiness(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListFlakinessHistory(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly FlakinessAnalysisDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = listFlakinessHistoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid list flakiness history input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFlakinessAnalysisService();
    const result = await service.listFlakinessHistory(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

// -----------------------------------------------------------------------------
// V6 Phase 80 — Application Bug vs Automation / Test-Data / Environment Failure Separation Handlers
// -----------------------------------------------------------------------------

import {
  type FailureDomainSeparationDto,
  separateFailureDomainInputSchema,
  getDomainSeparationInputSchema,
  reevaluateDomainSeparationInputSchema,
  listDomainSeparationHistoryInputSchema,
} from '@ai-quality/contracts';
import { FailureDomainSeparationService } from '@ai-quality/core';

let sharedFailureDomainSeparationService: FailureDomainSeparationService | null = null;

function resolveFailureDomainSeparationService(): FailureDomainSeparationService {
  if (sharedFailureDomainSeparationService) {
    return sharedFailureDomainSeparationService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedFailureDomainSeparationService = new FailureDomainSeparationService(prisma);
  return sharedFailureDomainSeparationService;
}

export function setSharedFailureDomainSeparationService(
  service: FailureDomainSeparationService | null,
): void {
  sharedFailureDomainSeparationService = service;
}

export async function handleSeparateFailureDomain(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureDomainSeparationDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = separateFailureDomainInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid separate failure domain input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureDomainSeparationService();
    const result = await service.separateFailureDomain(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetDomainSeparation(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureDomainSeparationDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getDomainSeparationInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid get domain separation input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureDomainSeparationService();
    const result = await service.getDomainSeparation(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleReevaluateDomainSeparation(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureDomainSeparationDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = reevaluateDomainSeparationInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid reevaluate domain separation input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureDomainSeparationService();
    const result = await service.reevaluateDomainSeparation(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListDomainSeparationHistory(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly FailureDomainSeparationDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = listDomainSeparationHistoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid list domain separation history input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureDomainSeparationService();
    const result = await service.listDomainSeparationHistory(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

// -----------------------------------------------------------------------------
// V6 Phase 81 — Failure Evidence Correlation & Technical Cause Localization Handlers
// -----------------------------------------------------------------------------

import {
  type FailureTechnicalLocalizationDto,
  localizeTechnicalCauseInputSchema,
  getTechnicalLocalizationInputSchema,
  relocalizeTechnicalCauseInputSchema,
  listLocalizationHistoryInputSchema,
} from '@ai-quality/contracts';
import { FailureEvidenceCorrelationService } from '@ai-quality/core';

let sharedFailureEvidenceCorrelationService: FailureEvidenceCorrelationService | null = null;

function resolveFailureEvidenceCorrelationService(): FailureEvidenceCorrelationService {
  if (sharedFailureEvidenceCorrelationService) {
    return sharedFailureEvidenceCorrelationService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedFailureEvidenceCorrelationService = new FailureEvidenceCorrelationService(prisma);
  return sharedFailureEvidenceCorrelationService;
}

export function setSharedFailureEvidenceCorrelationService(
  service: FailureEvidenceCorrelationService | null,
): void {
  sharedFailureEvidenceCorrelationService = service;
}

export async function handleLocalizeTechnicalCause(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureTechnicalLocalizationDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = localizeTechnicalCauseInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid localize technical cause input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureEvidenceCorrelationService();
    const result = await service.localizeTechnicalCause(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetTechnicalLocalization(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureTechnicalLocalizationDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getTechnicalLocalizationInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid get technical localization input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureEvidenceCorrelationService();
    const result = await service.getTechnicalLocalization(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleRelocalizeTechnicalCause(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureTechnicalLocalizationDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = relocalizeTechnicalCauseInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid relocalize technical cause input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureEvidenceCorrelationService();
    const result = await service.relocalizeTechnicalCause(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListLocalizationHistory(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly FailureTechnicalLocalizationDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = listLocalizationHistoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid list localization history input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureEvidenceCorrelationService();
    const result = await service.listLocalizationHistory(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

// ------------------------------------------------------------------------------
// Phase 82: AI-Assisted Failure Classification & Reasoning Handlers
// ------------------------------------------------------------------------------

import {
  type FailureAiAssessmentDto,
  assessFailureWithAiInputSchema,
  getFailureAiAssessmentInputSchema,
  reassessFailureWithAiInputSchema,
  listFailureAiAssessmentHistoryInputSchema,
} from '@ai-quality/contracts';
import { FailureAiReasoningService } from '@ai-quality/core';

let sharedFailureAiReasoningService: FailureAiReasoningService | null = null;

function resolveFailureAiReasoningService(): FailureAiReasoningService {
  if (sharedFailureAiReasoningService) {
    return sharedFailureAiReasoningService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedFailureAiReasoningService = new FailureAiReasoningService(prisma);
  return sharedFailureAiReasoningService;
}

export function setSharedFailureAiReasoningService(
  service: FailureAiReasoningService | null,
): void {
  sharedFailureAiReasoningService = service;
}

export async function handleAssessFailureWithAi(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureAiAssessmentDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = assessFailureWithAiInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid assess failure with AI input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureAiReasoningService();
    const result = await service.assessFailureWithAi(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetFailureAiAssessment(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureAiAssessmentDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getFailureAiAssessmentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid get failure AI assessment input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureAiReasoningService();
    const result = await service.getAiAssessment(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleReassessFailureWithAi(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureAiAssessmentDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = reassessFailureWithAiInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid reassess failure with AI input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureAiReasoningService();
    const result = await service.reassessFailureWithAi(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListFailureAiAssessmentHistory(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly FailureAiAssessmentDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = listFailureAiAssessmentHistoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid list failure AI assessment history input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureAiReasoningService();
    const result = await service.listAiAssessmentHistory(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

// ------------------------------------------------------------------------------
// Phase 83: Root-Cause Analysis & Probable Layer Identification Handlers
// ------------------------------------------------------------------------------

import {
  type FailureRootCauseAnalysisDto,
  analyzeRootCauseInputSchema,
  getRootCauseAnalysisInputSchema,
  reanalyzeRootCauseInputSchema,
  listRootCauseHistoryInputSchema,
} from '@ai-quality/contracts';
import { FailureRootCauseService } from '@ai-quality/core';

let sharedFailureRootCauseService: FailureRootCauseService | null = null;

function resolveFailureRootCauseService(): FailureRootCauseService {
  if (sharedFailureRootCauseService) {
    return sharedFailureRootCauseService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedFailureRootCauseService = new FailureRootCauseService(prisma);
  return sharedFailureRootCauseService;
}

export function setSharedFailureRootCauseService(service: FailureRootCauseService | null): void {
  sharedFailureRootCauseService = service;
}

export async function handleAnalyzeRootCause(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureRootCauseAnalysisDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = analyzeRootCauseInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid analyze root cause input: ' + parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureRootCauseService();
    const result = await service.analyzeRootCause(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetRootCauseAnalysis(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureRootCauseAnalysisDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getRootCauseAnalysisInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid get root cause analysis input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureRootCauseService();
    const result = await service.getRootCauseAnalysis(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleReanalyzeRootCause(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureRootCauseAnalysisDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = reanalyzeRootCauseInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid reanalyze root cause input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureRootCauseService();
    const result = await service.reanalyzeRootCause(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListRootCauseHistory(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly FailureRootCauseAnalysisDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = listRootCauseHistoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid list root cause history input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureRootCauseService();
    const result = await service.listRootCauseHistory(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

// -----------------------------------------------------------------------------
// V6 Phase 84 — Severity, Priority & Impact Intelligence Handlers
// -----------------------------------------------------------------------------

import {
  type FailureImpactAssessmentDto,
  assessImpactInputSchema,
  getImpactAssessmentInputSchema,
  reassessImpactInputSchema,
  listImpactHistoryInputSchema,
} from '@ai-quality/contracts';
import { FailureImpactAssessmentService } from '@ai-quality/core';

let sharedFailureImpactAssessmentService: FailureImpactAssessmentService | null = null;

function resolveFailureImpactAssessmentService(): FailureImpactAssessmentService {
  if (sharedFailureImpactAssessmentService) {
    return sharedFailureImpactAssessmentService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedFailureImpactAssessmentService = new FailureImpactAssessmentService(prisma);
  return sharedFailureImpactAssessmentService;
}

export function setSharedFailureImpactAssessmentService(
  service: FailureImpactAssessmentService | null,
): void {
  sharedFailureImpactAssessmentService = service;
}

export async function handleAssessImpact(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureImpactAssessmentDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = assessImpactInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid assess impact input: ' + parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureImpactAssessmentService();
    const result = await service.assessImpact(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetImpactAssessment(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureImpactAssessmentDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getImpactAssessmentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid get impact assessment input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureImpactAssessmentService();
    const result = await service.getImpactAssessment(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleReassessImpact(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<FailureImpactAssessmentDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = reassessImpactInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid reassess impact input: ' + parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureImpactAssessmentService();
    const result = await service.reassessImpact(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListImpactHistory(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly FailureImpactAssessmentDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = listImpactHistoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid list impact history input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveFailureImpactAssessmentService();
    const result = await service.listImpactHistory(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

// -----------------------------------------------------------------------------
// V6 Phase 85: Duplicate Failure Detection & Defect Clustering Handlers
// -----------------------------------------------------------------------------

import {
  compareDuplicatesInputSchema,
  clusterDefectsInputSchema,
  getClusterInputSchema,
  listClustersInputSchema,
  getFailureMembershipInputSchema,
  mergeClustersInputSchema,
  splitClusterInputSchema,
  overrideMembershipInputSchema,
  listClusterHistoryInputSchema,
  type DuplicateComparisonResultDto,
  type DefectClusterDto,
  type DefectClusterMembershipDto,
  type DefectClusterHistoryDto,
} from '@ai-quality/contracts';
import { DefectClusteringService } from '@ai-quality/core';

let sharedDefectClusteringService: DefectClusteringService | null = null;

function resolveDefectClusteringService(): DefectClusteringService {
  if (sharedDefectClusteringService) {
    return sharedDefectClusteringService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedDefectClusteringService = new DefectClusteringService(prisma);
  return sharedDefectClusteringService;
}

export function setSharedDefectClusteringService(service: DefectClusteringService | null): void {
  sharedDefectClusteringService = service;
}

export async function handleCompareDuplicates(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DuplicateComparisonResultDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = compareDuplicatesInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid compare duplicates input: ' + parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveDefectClusteringService();
    const result = await service.compareDuplicates(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleClusterDefects(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly DefectClusterDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = clusterDefectsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid cluster defects input: ' + parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveDefectClusteringService();
    const result = await service.clusterDefects(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetCluster(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectClusterDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getClusterInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid get cluster input: ' + parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveDefectClusteringService();
    const result = await service.getCluster(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListClusters(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly DefectClusterDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = listClustersInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid list clusters input: ' + parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveDefectClusteringService();
    const result = await service.listClusters(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetFailureMembership(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectClusterMembershipDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getFailureMembershipInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid get failure membership input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveDefectClusteringService();
    const result = await service.getFailureMembership(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleMergeClusters(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectClusterDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = mergeClustersInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid merge clusters input: ' + parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveDefectClusteringService();
    const result = await service.mergeClusters(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleSplitCluster(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<
  DesktopResult<{
    readonly remainingCluster: DefectClusterDto;
    readonly newCluster: DefectClusterDto;
  }>
> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = splitClusterInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid split cluster input: ' + parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveDefectClusteringService();
    const result = await service.splitCluster(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleOverrideMembership(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectClusterMembershipDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = overrideMembershipInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid override membership input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveDefectClusteringService();
    const result = await service.overrideMembership(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListClusterHistory(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly DefectClusterHistoryDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = listClusterHistoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid list cluster history input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveDefectClusteringService();
    const result = await service.listClusterHistory(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

// ------------------------------------------------------------------------------
// Confidence Scoring, Explainability & Evidence Attribution Handlers (V6 Phase 86)
// ------------------------------------------------------------------------------

import {
  assessConfidenceInputSchema,
  getConfidenceInputSchema,
  reassessConfidenceInputSchema,
  listConfidenceHistoryInputSchema,
  listEvidenceAttributionsInputSchema,
  type ConfidenceAssessmentDto,
  type EvidenceAttributionDto,
} from '@ai-quality/contracts';
import { ConfidenceAssessmentService } from '@ai-quality/core';

let sharedConfidenceAssessmentService: ConfidenceAssessmentService | null = null;

function resolveConfidenceAssessmentService(): ConfidenceAssessmentService {
  if (sharedConfidenceAssessmentService) {
    return sharedConfidenceAssessmentService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedConfidenceAssessmentService = new ConfidenceAssessmentService(prisma);
  return sharedConfidenceAssessmentService;
}

export function setSharedConfidenceAssessmentService(
  service: ConfidenceAssessmentService | null,
): void {
  sharedConfidenceAssessmentService = service;
}

export async function handleAssessConfidence(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ConfidenceAssessmentDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = assessConfidenceInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid assess confidence input: ' + parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveConfidenceAssessmentService();
    const result = await service.assessConfidence(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetConfidence(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ConfidenceAssessmentDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getConfidenceInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid get confidence input: ' + parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveConfidenceAssessmentService();
    const result = await service.getConfidence(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleReassessConfidence(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ConfidenceAssessmentDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = reassessConfidenceInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid reassess confidence input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveConfidenceAssessmentService();
    const result = await service.reassessConfidence(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListConfidenceHistory(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly ConfidenceAssessmentDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = listConfidenceHistoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid list confidence history input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveConfidenceAssessmentService();
    const result = await service.listConfidenceHistory(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListEvidenceAttributions(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly EvidenceAttributionDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = listEvidenceAttributionsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid list evidence attributions input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveConfidenceAssessmentService();
    const result = await service.listEvidenceAttributions(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

// ------------------------------------------------------------------------------
// Structured Bug Report Generation & Workspace Handlers (V6 Phase 87)
// ------------------------------------------------------------------------------

import {
  createBugReportInputSchema,
  getBugReportInputSchema,
  listBugReportsInputSchema,
  regenerateBugReportInputSchema,
  listBugReportHistoryInputSchema,
  type StructuredBugReportDto,
} from '@ai-quality/contracts';
import { StructuredBugReportService } from '@ai-quality/core';

let sharedStructuredBugReportService: StructuredBugReportService | null = null;

function resolveStructuredBugReportService(): StructuredBugReportService {
  if (sharedStructuredBugReportService) {
    return sharedStructuredBugReportService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedStructuredBugReportService = new StructuredBugReportService(prisma);
  return sharedStructuredBugReportService;
}

export function setSharedStructuredBugReportService(
  service: StructuredBugReportService | null,
): void {
  sharedStructuredBugReportService = service;
}

export async function handleCreateBugReport(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<StructuredBugReportDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = createBugReportInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid create bug report input: ' + parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveStructuredBugReportService();
    const result = await service.createBugReport(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetBugReport(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<StructuredBugReportDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getBugReportInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid get bug report input: ' + parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveStructuredBugReportService();
    const result = await service.getBugReport(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListBugReports(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<
  DesktopResult<{
    readonly items: readonly StructuredBugReportDto[];
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

  const parsed = listBugReportsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid list bug reports input: ' + parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveStructuredBugReportService();
    const result = await service.listBugReports(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleRegenerateBugReport(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<StructuredBugReportDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = regenerateBugReportInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid regenerate bug report input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveStructuredBugReportService();
    const result = await service.regenerateBugReport(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListBugReportHistory(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly StructuredBugReportDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = listBugReportHistoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Invalid list bug report history input: ' +
          parsed.error.errors.map(e => e.message).join(', '),
      },
    };
  }

  try {
    const service = resolveStructuredBugReportService();
    const result = await service.listBugReportHistory(parsed.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}
