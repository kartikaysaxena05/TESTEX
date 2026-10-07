/**
 * @file packages/core/src/failures/separation/failure-domain-separation-service.ts
 * Core domain service orchestrating Failure Domain Separation (V6 Phase 80).
 */

import type { PrismaClient } from '@prisma/client';
import {
  separateFailureDomainInputSchema,
  getDomainSeparationInputSchema,
  reevaluateDomainSeparationInputSchema,
  listDomainSeparationHistoryInputSchema,
} from '@ai-quality/contracts';
import {
  SEPARATION_BOUNDS,
  type IFailureDomainSeparationService,
  type FailureDomainSeparationDto,
  type SeparateFailureDomainInputDto,
  type GetDomainSeparationInputDto,
  type ReevaluateDomainSeparationInputDto,
  type ListDomainSeparationHistoryInputDto,
  type DomainSeparationFacts,
  type FailureDomain,
} from './separation-types.js';
import { FailureDomainCrossProjectError } from './separation-errors.js';
import { DomainSeparationRulesEngine } from './domain-separation-rules-engine.js';
import { generateDomainSeparationFingerprint } from './separation-fingerprint.js';
import { FailureCaseNotFoundError } from '../failure-errors.js';

export class FailureDomainSeparationService implements IFailureDomainSeparationService {
  private readonly rulesEngine = new DomainSeparationRulesEngine();
  private readonly caseLocks = new Map<string, Promise<void>>();

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Serializes concurrent separation operations on the same failure case.
   */
  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const currentLock = this.caseLocks.get(key) ?? Promise.resolve();
    let releaseLock: () => void;
    const nextLock = new Promise<void>(resolve => {
      releaseLock = resolve;
    });
    this.caseLocks.set(key, nextLock);

    try {
      await currentLock;
      return await fn();
    } finally {
      releaseLock!();
      if (this.caseLocks.get(key) === nextLock) {
        this.caseLocks.delete(key);
      }
    }
  }

  /**
   * Separates the failure domain for a failure case.
   */
  public async separateFailureDomain(
    input: SeparateFailureDomainInputDto,
  ): Promise<FailureDomainSeparationDto> {
    const validated = separateFailureDomainInputSchema.parse(input);
    const lockKey = `${validated.projectId}:${validated.failureCaseId}`;

    return this.withLock(lockKey, async () => {
      return this.executeSeparation(validated.projectId, validated.failureCaseId);
    });
  }

  /**
   * Idempotent read returning the authoritative failure domain separation.
   */
  public async getDomainSeparation(
    input: GetDomainSeparationInputDto,
  ): Promise<FailureDomainSeparationDto | null> {
    const validated = getDomainSeparationInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: validated.failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase) {
      throw new FailureCaseNotFoundError(validated.failureCaseId, validated.projectId);
    }

    if (failureCase.projectId !== validated.projectId) {
      throw new FailureDomainCrossProjectError(
        'FailureCase',
        validated.failureCaseId,
        validated.projectId,
      );
    }

    const record = await this.prisma.failureDomainSeparation.findFirst({
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

    // Dynamic staleness check
    const isStale = await this.checkIsStale(record.failureCaseId, record.evaluatedAt);

    return this.mapToDto(record, isStale);
  }

  /**
   * Explicitly re-evaluates the failure domain separation with an operator reason.
   */
  public async reevaluateDomainSeparation(
    input: ReevaluateDomainSeparationInputDto,
  ): Promise<FailureDomainSeparationDto> {
    const validated = reevaluateDomainSeparationInputSchema.parse(input);
    const lockKey = `${validated.projectId}:${validated.failureCaseId}`;

    return this.withLock(lockKey, async () => {
      return this.executeSeparation(
        validated.projectId,
        validated.failureCaseId,
        validated.reevaluationReason,
      );
    });
  }

  /**
   * Lists historical failure domain separation records for auditability.
   */
  public async listDomainSeparationHistory(
    input: ListDomainSeparationHistoryInputDto,
  ): Promise<readonly FailureDomainSeparationDto[]> {
    const validated = listDomainSeparationHistoryInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: validated.failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase) {
      throw new FailureCaseNotFoundError(validated.failureCaseId, validated.projectId);
    }

    if (failureCase.projectId !== validated.projectId) {
      throw new FailureDomainCrossProjectError(
        'FailureCase',
        validated.failureCaseId,
        validated.projectId,
      );
    }

    const records = await this.prisma.failureDomainSeparation.findMany({
      where: {
        failureCaseId: validated.failureCaseId,
        projectId: validated.projectId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map(r => this.mapToDto(r));
  }

  // =========================================================================
  // INTERNAL EXECUTION
  // =========================================================================

  private async executeSeparation(
    projectId: string,
    failureCaseId: string,
    reevaluationReason?: string,
  ): Promise<FailureDomainSeparationDto> {
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: failureCaseId },
      include: {
        testCase: true,
        execution: {
          include: {
            stepExecutions: true,
          },
        },
      },
    });

    if (!failureCase) {
      throw new FailureCaseNotFoundError(failureCaseId, projectId);
    }

    if (failureCase.projectId !== projectId) {
      throw new FailureDomainCrossProjectError('FailureCase', failureCaseId, projectId);
    }

    // Load Phase 75 evidence
    const evidenceItems = await this.prisma.failureEvidenceReference.findMany({
      where: { failureCaseId, projectId },
      orderBy: { attachedAt: 'asc' },
    });

    // Load Phase 76 reproduction
    const reproduction = await this.prisma.failureReproductionAttempt.findFirst({
      where: { failureCaseId, projectId },
      orderBy: { attemptNumber: 'desc' },
    });

    // Load Phase 77 classification
    const classification = await this.prisma.failureClassification.findFirst({
      where: { failureCaseId, projectId, isAuthoritative: true },
      orderBy: { createdAt: 'desc' },
    });

    // Load Phase 78 decision integrity
    const decisionIntegrity = await this.prisma.classificationDecisionIntegrity.findFirst({
      where: { failureCaseId, projectId, isAuthoritative: true },
      orderBy: { createdAt: 'desc' },
    });

    // Load Phase 79 flakiness
    const flakiness = await this.prisma.flakinessAnalysis.findFirst({
      where: { failureCaseId, projectId, isAuthoritative: true },
      orderBy: { createdAt: 'desc' },
    });

    // Extract execution metadata
    const executionMeta = failureCase.execution?.metadataJson as Record<string, unknown> | null;
    const failureMeta = failureCase.metadataJson as Record<string, unknown> | null;

    const facts: DomainSeparationFacts = {
      projectId,
      failureCaseId,
      testCaseId: failureCase.testCaseId,
      testCaseTitle: failureCase.testCase.title,
      testCaseVersionNumber: failureCase.testCaseVersionNumber,
      testRunId: failureCase.testRunId,
      executionId: failureCase.executionId,
      failureSummary: failureCase.failureSummary,
      errorCode: failureCase.errorCode,
      errorMessage: failureCase.errorMessage,
      failureSignature: failureCase.failureSignature,
      stepIndex: failureCase.stepIndex,

      evidenceItems: evidenceItems.map(e => ({
        id: e.id,
        artifactType: e.artifactType,
        logicalName: e.logicalName,
        integrityStatus: e.integrityStatus,
        sha256: e.sha256,
        metadataJson: e.metadataJson as Record<string, unknown> | null,
      })),

      reproduction: reproduction
        ? {
            id: reproduction.id,
            attemptNumber: reproduction.attemptNumber,
            status: reproduction.status,
            environmentEquivalence: reproduction.environmentEquivalence,
            isSignatureMatch: reproduction.isSignatureMatch,
            isFailedStepMatch: reproduction.isFailedStepMatch,
            reproductionFailureSignature: reproduction.reproductionFailureSignature,
            blockerReason: reproduction.blockerReason,
          }
        : null,

      classification: classification
        ? {
            id: classification.id,
            category: classification.category,
            subcategory: classification.subcategory,
            primaryRuleId: classification.primaryRuleId,
            isAuthoritative: classification.isAuthoritative,
          }
        : null,

      decisionIntegrity: decisionIntegrity
        ? {
            id: decisionIntegrity.id,
            decisionState: decisionIntegrity.decisionState,
            evidenceFreshnessState: decisionIntegrity.evidenceFreshnessState,
            consistencyState: decisionIntegrity.consistencyState,
            arbitrationState: decisionIntegrity.arbitrationState,
            blockingReasons: (decisionIntegrity.blockingReasons as string[]) ?? [],
            conflictDetails: decisionIntegrity.conflictDetailsJson as Record<
              string,
              unknown
            > | null,
          }
        : null,

      flakiness: flakiness
        ? {
            id: flakiness.id,
            flakinessState: flakiness.flakinessState,
            stabilityState: flakiness.stabilityState,
            flakinessScore: flakiness.reproducibilityRatio,
            passRate: flakiness.passRate,
            dominantFailureSignature: flakiness.dominantFailureSignature,
          }
        : null,

      executionMetadata: {
        browserCrash: Boolean(executionMeta?.browserCrash || failureMeta?.browserCrash),
        networkErrors: (executionMeta?.networkErrors as string[]) ?? [],
        consoleErrors: (executionMeta?.consoleErrors as string[]) ?? [],
        assertionFailure: (executionMeta?.assertionFailure as any) ?? null,
        locatorFailure: (executionMeta?.locatorFailure as any) ?? null,
        timeoutDetails: (executionMeta?.timeoutDetails as any) ?? null,
        testDataProvenance: (executionMeta?.testDataProvenance as any) ?? null,
        environmentDiagnostics: (executionMeta?.environmentDiagnostics as any) ?? null,
      },
    };

    // Run rules engine
    const evaluation = this.rulesEngine.evaluate(facts);

    // Generate fingerprint
    const fingerprint = generateDomainSeparationFingerprint({
      failureCaseId,
      testCaseId: failureCase.testCaseId,
      testCaseVersionNumber: failureCase.testCaseVersionNumber,
      domain: evaluation.domain,
      domainSubreason: evaluation.domainSubreason,
      separationRulesVersion: SEPARATION_BOUNDS.RULES_VERSION,
      matchedRuleIds: evaluation.matchedRuleIds,
      excludedDomains: evaluation.excludedDomains,
      exclusionReasons: evaluation.exclusionReasons,
      evidenceReferences: evaluation.evidenceReferences,
      reproductionStatus: reproduction?.status,
      flakinessState: flakiness?.flakinessState,
    });

    // Check count for reevaluations
    const existingCount = await this.prisma.failureDomainSeparation.count({
      where: { failureCaseId, projectId },
    });

    // Atomically persist in transaction
    const saved = await this.prisma.$transaction(async tx => {
      // Demote previous authoritative records
      await tx.failureDomainSeparation.updateMany({
        where: { failureCaseId, projectId, isAuthoritative: true },
        data: { isAuthoritative: false },
      });

      return tx.failureDomainSeparation.create({
        data: {
          projectId,
          failureCaseId,
          failureAnalysisRunId: failureCase.currentAnalysisRunId,
          classificationId: classification?.id,
          decisionIntegrityId: decisionIntegrity?.id,
          flakinessAnalysisId: flakiness?.id,
          testCaseId: failureCase.testCaseId,
          domain: evaluation.domain,
          domainSubreason: evaluation.domainSubreason,
          separationRulesVersion: SEPARATION_BOUNDS.RULES_VERSION,
          primaryRationale: evaluation.primaryRationale,
          decisionExplanation: evaluation.decisionExplanation,
          matchedRuleIds: evaluation.matchedRuleIds as any,
          excludedDomains: evaluation.excludedDomains as any,
          exclusionReasons: evaluation.exclusionReasons as any,
          conflictingSignals: evaluation.conflictingSignals as any,
          evidenceReferences: evaluation.evidenceReferences as any,
          reproductionSummary: evaluation.reproductionSummary as any,
          flakinessSummary: evaluation.flakinessSummary as any,
          separationFingerprint: fingerprint,
          isAuthoritative: true,
          isStale: false,
          reevaluationCount: reevaluationReason ? existingCount : 0,
          lastReevaluatedAt: reevaluationReason ? new Date() : null,
          reevaluationReason: reevaluationReason ?? null,
        },
      });
    });

    return this.mapToDto(saved, false);
  }

  private async checkIsStale(failureCaseId: string, evaluatedAt: Date): Promise<boolean> {
    const newerExecutions = await this.prisma.testCaseExecution.count({
      where: {
        createdAt: { gt: evaluatedAt },
        failureCase: { id: failureCaseId },
      },
    });

    if (newerExecutions > 0) {
      return true;
    }

    const newerReproductions = await this.prisma.failureReproductionAttempt.count({
      where: {
        failureCaseId,
        createdAt: { gt: evaluatedAt },
      },
    });

    return newerReproductions > 0;
  }

  private mapToDto(record: any, dynamicIsStale?: boolean): FailureDomainSeparationDto {
    return {
      id: record.id,
      projectId: record.projectId,
      failureCaseId: record.failureCaseId,
      failureAnalysisRunId: record.failureAnalysisRunId ?? null,
      classificationId: record.classificationId ?? null,
      decisionIntegrityId: record.decisionIntegrityId ?? null,
      flakinessAnalysisId: record.flakinessAnalysisId ?? null,
      testCaseId: record.testCaseId,
      domain: record.domain as FailureDomain,
      domainSubreason: record.domainSubreason ?? null,
      separationRulesVersion: record.separationRulesVersion,
      primaryRationale: record.primaryRationale,
      decisionExplanation: record.decisionExplanation,
      matchedRuleIds: (record.matchedRuleIds as string[]) ?? [],
      excludedDomains: (record.excludedDomains as FailureDomain[]) ?? [],
      exclusionReasons: (record.exclusionReasons as Record<string, string>) ?? {},
      conflictingSignals: (record.conflictingSignals as string[]) ?? [],
      evidenceReferences: (record.evidenceReferences as string[]) ?? [],
      reproductionSummary: (record.reproductionSummary as Record<string, unknown>) ?? {},
      flakinessSummary: (record.flakinessSummary as Record<string, unknown>) ?? {},
      separationFingerprint: record.separationFingerprint,
      isAuthoritative: record.isAuthoritative,
      isStale: dynamicIsStale ?? record.isStale,
      stalenessReason: record.stalenessReason ?? null,
      reevaluationCount: record.reevaluationCount,
      lastReevaluatedAt: record.lastReevaluatedAt ? record.lastReevaluatedAt.toISOString() : null,
      reevaluationReason: record.reevaluationReason ?? null,
      evaluatedAt: record.evaluatedAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
