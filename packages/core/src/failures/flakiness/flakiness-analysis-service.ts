/**
 * @file packages/core/src/failures/flakiness/flakiness-analysis-service.ts
 * Authoritative service orchestrating Flakiness Detection & Reproducibility Intelligence (V6 Phase 79).
 */

import type { PrismaClient } from '@prisma/client';
import {
  analyzeFlakinessInputSchema,
  getFlakinessAnalysisInputSchema,
  reanalyzeFlakinessInputSchema,
  listFlakinessHistoryInputSchema,
} from '@ai-quality/contracts';
import { FlakinessRulesEngine } from './flakiness-rules-engine.js';
import {
  FLAKINESS_BOUNDS,
  type IFlakinessAnalysisService,
  type FlakinessAnalysisDto,
  type AnalyzeFlakinessInputDto,
  type GetFlakinessAnalysisInputDto,
  type ReanalyzeFlakinessInputDto,
  type ListFlakinessHistoryInputDto,
  type RawAttemptRecord,
  type FlakinessEvaluationContext,
  type EnvironmentEquivalenceStatus,
} from './flakiness-types.js';
import { FlakinessAnalysisNotFoundError, FlakinessCrossProjectError } from './flakiness-errors.js';
import type { IFailureReproductionService } from '../reproduction/failure-reproduction-types.js';

export class FlakinessAnalysisService implements IFlakinessAnalysisService {
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly reproductionService?: IFailureReproductionService,
  ) {}

  /**
   * Executes atomic, thread-safe operation with per-entity lock.
   */
  private async withLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
    while (this.locks.has(lockKey)) {
      await this.locks.get(lockKey);
    }

    let releaseLock!: () => void;
    const lockPromise = new Promise<void>(resolve => {
      releaseLock = resolve;
    });
    this.locks.set(lockKey, lockPromise);

    try {
      return await fn();
    } finally {
      this.locks.delete(lockKey);
      releaseLock();
    }
  }

  /**
   * Evaluates and records flakiness intelligence for a failure case.
   */
  public async analyzeFlakiness(input: AnalyzeFlakinessInputDto): Promise<FlakinessAnalysisDto> {
    const validated = analyzeFlakinessInputSchema.parse(input);
    const lockKey = `${validated.projectId}:${validated.failureCaseId}`;

    return this.withLock(lockKey, async () => {
      return this.executeAnalysis(validated.projectId, validated.failureCaseId, {
        maxAdditionalAttempts: validated.maxAdditionalAttempts,
      });
    });
  }

  /**
   * Idempotent read returning the authoritative flakiness analysis for a failure case.
   */
  public async getFlakinessAnalysis(
    input: GetFlakinessAnalysisInputDto,
  ): Promise<FlakinessAnalysisDto | null> {
    const validated = getFlakinessAnalysisInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: validated.failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase) {
      throw new FlakinessAnalysisNotFoundError(validated.failureCaseId);
    }

    if (failureCase.projectId !== validated.projectId) {
      throw new FlakinessCrossProjectError(validated.failureCaseId, validated.projectId);
    }

    const record = await this.prisma.flakinessAnalysis.findFirst({
      where: {
        failureCaseId: validated.failureCaseId,
        projectId: validated.projectId,
        isAuthoritative: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      return null;
    }

    // Evaluate real-time staleness: check if newer reproduction attempts or executions were recorded
    const newerReproductionCount = await this.prisma.failureReproductionAttempt.count({
      where: {
        failureCaseId: validated.failureCaseId,
        projectId: validated.projectId,
        createdAt: { gt: record.evaluatedAt },
      },
    });

    const isStale = record.isStale || newerReproductionCount > 0;
    const stalenessReason = isStale
      ? record.stalenessReason ||
        'Newer reproduction attempts recorded since analysis was evaluated.'
      : null;

    return this.mapToDto(record, isStale, stalenessReason);
  }

  /**
   * Explicit operator reanalysis forcing archive of past records and generating fresh authoritative analysis.
   */
  public async reanalyzeFlakiness(
    input: ReanalyzeFlakinessInputDto,
  ): Promise<FlakinessAnalysisDto> {
    const validated = reanalyzeFlakinessInputSchema.parse(input);
    const lockKey = `${validated.projectId}:${validated.failureCaseId}`;

    return this.withLock(lockKey, async () => {
      return this.executeAnalysis(validated.projectId, validated.failureCaseId, {
        reanalysisReason: validated.reanalysisReason,
        maxAdditionalAttempts: validated.maxAdditionalAttempts,
      });
    });
  }

  /**
   * Retrieves full chronological flakiness evaluation history for audit trails.
   */
  public async listFlakinessHistory(
    input: ListFlakinessHistoryInputDto,
  ): Promise<readonly FlakinessAnalysisDto[]> {
    const validated = listFlakinessHistoryInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: validated.failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase) {
      throw new FlakinessAnalysisNotFoundError(validated.failureCaseId);
    }

    if (failureCase.projectId !== validated.projectId) {
      throw new FlakinessCrossProjectError(validated.failureCaseId, validated.projectId);
    }

    const records = await this.prisma.flakinessAnalysis.findMany({
      where: {
        failureCaseId: validated.failureCaseId,
        projectId: validated.projectId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map(r => this.mapToDto(r));
  }

  /**
   * Internal analysis executor.
   */
  private async executeAnalysis(
    projectId: string,
    failureCaseId: string,
    options?: {
      reanalysisReason?: string;
      maxAdditionalAttempts?: number;
    },
  ): Promise<FlakinessAnalysisDto> {
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: failureCaseId },
      include: {
        testCase: {
          select: {
            id: true,
            currentVersionNumber: true,
          },
        },
      },
    });

    if (!failureCase) {
      throw new FlakinessAnalysisNotFoundError(failureCaseId);
    }

    if (failureCase.projectId !== projectId) {
      throw new FlakinessCrossProjectError(failureCaseId, projectId);
    }

    // 1. Fetch Primary Execution (E1)
    const primaryExecution = await this.prisma.testCaseExecution.findUnique({
      where: { id: failureCase.executionId },
    });

    // 2. Fetch V5 Retry Executions for the same testRun and testCase
    const retryExecutions = await this.prisma.testCaseExecution.findMany({
      where: {
        testRunId: failureCase.testRunId,
        testCaseId: failureCase.testCaseId,
        id: { not: failureCase.executionId },
      },
      orderBy: { attempt: 'asc' },
    });

    // Fetch step executions for primary + retries
    const allExecIds = [failureCase.executionId, ...retryExecutions.map(r => r.id)];
    const failedStepRecords = await this.prisma.stepExecutionRecord.findMany({
      where: {
        executionId: { in: allExecIds },
        status: 'FAILED',
      },
      orderBy: { stepIndex: 'asc' },
    });
    const failedStepMap = new Map<string, number>();
    for (const record of failedStepRecords) {
      if (!failedStepMap.has(record.executionId)) {
        failedStepMap.set(record.executionId, record.stepIndex);
      }
    }

    // Fetch failure evidence references to check integrity
    const evidenceReferences = await this.prisma.failureEvidenceReference.findMany({
      where: {
        failureCaseId: failureCase.id,
        projectId,
      },
      select: {
        executionId: true,
        integrityStatus: true,
      },
    });
    const corruptExecutions = new Set<string>();
    for (const ref of evidenceReferences) {
      if (ref.integrityStatus === 'CORRUPT' || ref.integrityStatus === 'MISMATCH') {
        corruptExecutions.add(ref.executionId);
      }
    }

    // 3. Fetch Phase 76 Controlled Reproduction Attempts
    let reproductionAttempts = await this.prisma.failureReproductionAttempt.findMany({
      where: {
        failureCaseId: failureCase.id,
        projectId,
      },
      orderBy: { attemptNumber: 'asc' },
    });

    // 4. Optionally trigger bounded additional attempts via Phase 76 reproduction service if requested
    const maxAdditional = Math.min(
      options?.maxAdditionalAttempts ?? FLAKINESS_BOUNDS.DEFAULT_MAX_ADDITIONAL_ATTEMPTS,
      FLAKINESS_BOUNDS.MAX_ADDITIONAL_ATTEMPTS,
    );

    if (
      maxAdditional > 0 &&
      this.reproductionService &&
      reproductionAttempts.length < FLAKINESS_BOUNDS.MIN_CONFIRMED_ATTEMPTS
    ) {
      try {
        await this.reproductionService.executeReproduction({
          projectId,
          failureCaseId,
          maxAttempts: maxAdditional,
        });

        // Refresh reproduction attempts
        reproductionAttempts = await this.prisma.failureReproductionAttempt.findMany({
          where: {
            failureCaseId: failureCase.id,
            projectId,
          },
          orderBy: { attemptNumber: 'asc' },
        });
      } catch {
        // Bounded reproduction error is non-fatal to flakiness analysis of existing history
      }
    }

    // 5. Fetch Authoritative Phase 77 Classification & Phase 78 Decision Integrity
    const classification = await this.prisma.failureClassification.findFirst({
      where: {
        failureCaseId: failureCase.id,
        projectId,
        isAuthoritative: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const decisionIntegrity = await this.prisma.classificationDecisionIntegrity.findFirst({
      where: {
        failureCaseId: failureCase.id,
        projectId,
        isAuthoritative: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // 6. Build Raw Attempt Records
    const rawAttempts: RawAttemptRecord[] = [];

    // Add Primary Execution (Attempt 1)
    if (primaryExecution) {
      const hasCorrupt = corruptExecutions.has(primaryExecution.id);
      rawAttempts.push({
        id: primaryExecution.id,
        source: 'PRIMARY_EXECUTION',
        attemptNumber: primaryExecution.attempt,
        projectId: primaryExecution.projectId,
        failureCaseId: failureCase.id,
        testCaseId: primaryExecution.testCaseId,
        testCaseVersionId: primaryExecution.testCaseVersionId,
        testCaseVersionNumber: primaryExecution.testCaseVersionNumber,
        status: primaryExecution.status === 'PASSED' ? 'PASSED' : 'FAILED',
        environmentEquivalence: 'EXACT',
        failureSignature: failureCase.failureSignature,
        failedStepIndex: failedStepMap.get(primaryExecution.id) ?? null,
        durationMs: primaryExecution.durationMs,
        timestamp: primaryExecution.createdAt,
        hasCorruptEvidence: hasCorrupt,
      });
    }

    // Add V5 Retry Executions
    for (const retry of retryExecutions) {
      const hasCorrupt = corruptExecutions.has(retry.id);
      rawAttempts.push({
        id: retry.id,
        source: 'V5_RETRY',
        attemptNumber: retry.attempt,
        projectId: retry.projectId,
        failureCaseId: failureCase.id,
        testCaseId: retry.testCaseId,
        testCaseVersionId: retry.testCaseVersionId,
        testCaseVersionNumber: retry.testCaseVersionNumber,
        status: retry.status === 'PASSED' ? 'PASSED' : 'FAILED',
        environmentEquivalence: 'EXACT',
        failureSignature:
          retry.status === 'PASSED' ? null : retry.errorCode || failureCase.failureSignature,
        failedStepIndex: failedStepMap.get(retry.id) ?? null,
        durationMs: retry.durationMs,
        timestamp: retry.createdAt,
        hasCorruptEvidence: hasCorrupt,
      });
    }

    // Add Phase 76 Reproduction Attempts
    for (const repro of reproductionAttempts) {
      let status: 'PASSED' | 'FAILED' | 'BLOCKED' | 'CANCELLED' | 'EXECUTION_ERROR' = 'FAILED';
      if (repro.status === 'NOT_REPRODUCED') {
        status = 'PASSED';
      } else if (repro.status === 'BLOCKED') {
        status = 'BLOCKED';
      } else if (repro.status === 'REPRODUCED') {
        status = 'FAILED';
      } else if (repro.status === 'CANCELLED') {
        status = 'CANCELLED';
      } else if (repro.status === 'EXECUTION_ERROR') {
        status = 'EXECUTION_ERROR';
      } else {
        status = 'BLOCKED';
      }

      rawAttempts.push({
        id: repro.id,
        source: 'PHASE76_REPRODUCTION',
        attemptNumber: 10 + repro.attemptNumber, // Offset to preserve attempt ordering
        projectId: repro.projectId,
        failureCaseId: failureCase.id,
        testCaseId: repro.testCaseId,
        testCaseVersionId: repro.testCaseVersionId,
        testCaseVersionNumber: repro.testCaseVersionNumber,
        status,
        environmentEquivalence: repro.environmentEquivalence as EnvironmentEquivalenceStatus,
        failureSignature:
          repro.reproductionFailureSignature ??
          (repro.isSignatureMatch ? failureCase.failureSignature : null),
        failedStepIndex: repro.failedStepIndex,
        durationMs: repro.durationMs,
        timestamp: repro.createdAt,
      });
    }

    const testVersionNumber =
      primaryExecution?.testCaseVersionNumber ?? failureCase.testCase.currentVersionNumber ?? 1;

    const evaluationContext: FlakinessEvaluationContext = {
      projectId,
      failureCaseId: failureCase.id,
      testCaseId: failureCase.testCaseId,
      testCaseVersionId: primaryExecution?.testCaseVersionId ?? null,
      testCaseVersionNumber: testVersionNumber,
      originalFailureSignature: failureCase.failureSignature,
      originalFailedStepIndex: failedStepMap.get(primaryExecution?.id ?? '') ?? null,
      decisionIntegrityState: decisionIntegrity?.decisionState ?? null,
      decisionIntegrityBlocked: decisionIntegrity?.decisionState === 'BLOCKED',
      decisionIntegrityReasons: Array.isArray(decisionIntegrity?.blockingReasons)
        ? (decisionIntegrity.blockingReasons as string[])
        : [],
      rawAttempts,
    };

    const evaluationResult = FlakinessRulesEngine.evaluate(evaluationContext);

    let finalExplanation = evaluationResult.analysisExplanation;
    if (options?.reanalysisReason) {
      finalExplanation = `[Reanalyzed: ${options.reanalysisReason}] ${finalExplanation}`;
    }

    // Persist in transaction
    const created = await this.prisma.$transaction(async tx => {
      // Archive previous authoritative records
      await tx.flakinessAnalysis.updateMany({
        where: {
          failureCaseId: failureCase.id,
          projectId,
          isAuthoritative: true,
        },
        data: {
          isAuthoritative: false,
          isStale: true,
          stalenessReason: 'Archived by new flakiness evaluation.',
        },
      });

      return tx.flakinessAnalysis.create({
        data: {
          projectId,
          failureCaseId: failureCase.id,
          classificationId: classification?.id ?? null,
          decisionIntegrityId: decisionIntegrity?.id ?? null,
          testCaseId: failureCase.testCaseId,
          testCaseVersionId: primaryExecution?.testCaseVersionId ?? null,
          testCaseVersionNumber: testVersionNumber,
          analysisVersion: FLAKINESS_BOUNDS.ANALYSIS_VERSION,
          flakinessPolicyVersion: FLAKINESS_BOUNDS.POLICY_VERSION,
          flakinessState: evaluationResult.flakinessState,
          stabilityState: evaluationResult.stabilityState,
          attemptCount: evaluationResult.attemptCount,
          validAttemptCount: evaluationResult.validAttemptCount,
          passCount: evaluationResult.passCount,
          failCount: evaluationResult.failCount,
          blockedCount: evaluationResult.blockedCount,
          cancelledCount: evaluationResult.cancelledCount,
          executionErrorCount: evaluationResult.executionErrorCount,
          equivalentFailureCount: evaluationResult.equivalentFailureCount,
          differentFailureCount: evaluationResult.differentFailureCount,
          sameStepFailureCount: evaluationResult.sameStepFailureCount,
          differentStepFailureCount: evaluationResult.differentStepFailureCount,
          environmentComparableCount: evaluationResult.environmentComparableCount,
          environmentDriftCount: evaluationResult.environmentDriftCount,
          reproducibilityRatio: evaluationResult.reproducibilityRatio,
          passRate: evaluationResult.passRate,
          failureRate: evaluationResult.failureRate,
          dominantFailureSignature: evaluationResult.dominantFailureSignature ?? null,
          analysisFingerprint: evaluationResult.analysisFingerprint,
          isAuthoritative: true,
          isStale: false,
          analysisExplanation: finalExplanation,
          attemptTimelineJson: evaluationResult.attemptTimeline as any,
          warningsJson: evaluationResult.warnings as any,
          evidenceGapsJson: evaluationResult.evidenceGaps as any,
          evaluatedAt: new Date(),
        },
      });
    });

    return this.mapToDto(created);
  }

  private mapToDto(
    record: any,
    overrideStale?: boolean,
    overrideStalenessReason?: string | null,
  ): FlakinessAnalysisDto {
    return {
      id: record.id,
      projectId: record.projectId,
      failureCaseId: record.failureCaseId,
      classificationId: record.classificationId ?? null,
      decisionIntegrityId: record.decisionIntegrityId ?? null,
      testCaseId: record.testCaseId,
      testCaseVersionId: record.testCaseVersionId ?? null,
      testCaseVersionNumber: record.testCaseVersionNumber,
      analysisVersion: record.analysisVersion,
      flakinessPolicyVersion: record.flakinessPolicyVersion,
      flakinessState: record.flakinessState,
      stabilityState: record.stabilityState,
      attemptCount: record.attemptCount,
      validAttemptCount: record.validAttemptCount,
      passCount: record.passCount,
      failCount: record.failCount,
      blockedCount: record.blockedCount,
      cancelledCount: record.cancelledCount,
      executionErrorCount: record.executionErrorCount,
      equivalentFailureCount: record.equivalentFailureCount,
      differentFailureCount: record.differentFailureCount,
      sameStepFailureCount: record.sameStepFailureCount,
      differentStepFailureCount: record.differentStepFailureCount,
      environmentComparableCount: record.environmentComparableCount,
      environmentDriftCount: record.environmentDriftCount,
      reproducibilityRatio: record.reproducibilityRatio,
      passRate: record.passRate,
      failureRate: record.failureRate,
      dominantFailureSignature: record.dominantFailureSignature ?? null,
      analysisFingerprint: record.analysisFingerprint,
      isAuthoritative: record.isAuthoritative,
      isStale: overrideStale ?? record.isStale,
      stalenessReason:
        overrideStalenessReason !== undefined ? overrideStalenessReason : record.stalenessReason,
      analysisExplanation: record.analysisExplanation ?? null,
      attemptTimeline: Array.isArray(record.attemptTimelineJson) ? record.attemptTimelineJson : [],
      warnings: Array.isArray(record.warningsJson) ? record.warningsJson : [],
      evidenceGaps: Array.isArray(record.evidenceGapsJson) ? record.evidenceGapsJson : [],
      evaluatedAt: record.evaluatedAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
