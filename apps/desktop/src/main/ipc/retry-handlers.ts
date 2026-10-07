/**
 * @file apps/desktop/src/main/ipc/retry-handlers.ts
 * Main-process IPC handlers for execution attempt history and flakiness reliability evaluation.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopResult,
  type DesktopError,
  type ExecutionAttemptSummaryDto,
  type ExecutionReliabilityReportDto,
  getExecutionAttemptsInputSchema,
  evaluateExecutionReliabilityInputSchema,
} from '@ai-quality/contracts';
import {
  ExecutionPersistenceService,
  FlakinessDetector,
  ExecutionDomainError,
  getPrismaClient,
} from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let sharedPersistenceService: ExecutionPersistenceService | null = null;
let sharedFlakinessDetector: FlakinessDetector | null = null;

function resolvePersistenceService(): ExecutionPersistenceService {
  if (sharedPersistenceService) {
    return sharedPersistenceService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedPersistenceService = new ExecutionPersistenceService({ prisma });
  return sharedPersistenceService;
}

function resolveFlakinessDetector(): FlakinessDetector {
  if (sharedFlakinessDetector) {
    return sharedFlakinessDetector;
  }
  sharedFlakinessDetector = new FlakinessDetector();
  return sharedFlakinessDetector;
}

export function setSharedRetryServices(
  persistence?: ExecutionPersistenceService | null,
  detector?: FlakinessDetector | null,
): void {
  sharedPersistenceService = persistence ?? null;
  sharedFlakinessDetector = detector ?? null;
}

export async function handleGetAttempts(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly ExecutionAttemptSummaryDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = getExecutionAttemptsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid get execution attempts input.',
      },
    };
  }

  try {
    const persistence = resolvePersistenceService();
    const attempts = await persistence.listExecutionAttempts(parsed.data);
    const summaries: ExecutionAttemptSummaryDto[] = attempts.map(att => {
      const evidenceBundle = (att as any).evidenceBundles?.[0];
      const artifactCount = (att as any).evidenceArtifacts?.length ?? 0;
      return {
        attempt: att.attempt,
        executionId: att.id,
        status: att.status as any,
        durationMs: att.durationMs ?? null,
        startedAt: att.startedAt ?? null,
        completedAt: att.completedAt ?? null,
        errorMessage: att.errorMessage ?? null,
        errorCode: att.errorCode ?? null,
        retryReason: att.retryReason ?? null,
        reliabilityStatus: (att.reliabilityStatus as any) ?? 'NOT_EVALUATED',
        passedAfterRetry: Boolean(att.passedAfterRetry),
        evidenceBundleId: evidenceBundle?.id ?? null,
        evidenceArtifactCount: artifactCount,
      };
    });

    return { ok: true, data: summaries };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleEvaluateReliability(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ExecutionReliabilityReportDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'IPC sender is not authorized.' },
    };
  }

  const parsed = evaluateExecutionReliabilityInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid evaluate execution reliability input.',
      },
    };
  }

  try {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Prisma client not initialized in desktop process.');
    }

    const run = await prisma.testRun.findUnique({
      where: { id: parsed.data.testRunId },
    });

    if (!run || run.projectId !== parsed.data.projectId) {
      return {
        ok: false,
        error: {
          code: 'EXECUTION_TEST_NOT_FOUND',
          message: `Test run '${parsed.data.testRunId}' not found in project.`,
        },
      };
    }

    const persistence = resolvePersistenceService();
    const detector = resolveFlakinessDetector();
    const attempts = await persistence.listExecutionAttempts(parsed.data);

    const report = detector.evaluateReliability({
      projectId: parsed.data.projectId,
      testRunId: parsed.data.testRunId,
      testRun: {
        id: run.id,
        projectId: run.projectId,
        testCaseId: run.testCaseId,
        testCaseVersionId: run.testCaseVersionId,
        testCaseVersionNumber: run.testCaseVersionNumber,
        executableTestPlanId: run.executableTestPlanId,
        environmentId: run.environmentId,
        targetApplicationId: run.targetApplicationId,
        status: run.status as any,
        idempotencyKey: run.idempotencyKey,
        workerId: run.workerId,
        leaseExpiresAt: run.leaseExpiresAt?.toISOString() ?? null,
        heartbeatAt: run.heartbeatAt?.toISOString() ?? null,
        queuedAt: run.queuedAt.toISOString(),
        startedAt: run.startedAt?.toISOString() ?? null,
        completedAt: run.completedAt?.toISOString() ?? null,
        cancelRequestedAt: run.cancelRequestedAt?.toISOString() ?? null,
        cancelledAt: run.cancelledAt?.toISOString() ?? null,
        terminalReason: run.terminalReason,
        errorMessage: run.errorMessage,
        executionDurationMs: run.executionDurationMs,
        planFingerprint: run.planFingerprint,
        testCaseTitle: run.testCaseTitle,
        environmentName: run.environmentName,
        browserEngine: run.browserEngine as any,
        headless: run.headless,
        timeoutMs: run.timeoutMs,
        totalAttempts: (run as any).totalAttempts ?? 1,
        passedAfterRetry: Boolean((run as any).passedAfterRetry),
        reliabilityStatus: (run as any).reliabilityStatus ?? 'NOT_EVALUATED',
        healingUsed: Boolean((run as any).healingUsed),
        healingCount: (run as any).healingCount ?? 0,
        diagnosticsJson: (run as any).diagnosticsJson ?? [],
        metadataJson: (run as any).metadataJson ?? {},
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
      },
      attempts,
    });

    return { ok: true, data: report };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

function sanitizeError(err: unknown): DesktopError {
  if (err instanceof ExecutionDomainError) {
    return {
      code: (err.code as any) || 'INTERNAL_ERROR',
      message: err.message,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    code: 'INTERNAL_ERROR',
    message: message || 'An unexpected execution retry error occurred.',
  };
}
