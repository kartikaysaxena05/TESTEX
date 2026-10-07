/**
 * @file packages/core/src/failures/integrity/classification-decision-integrity-service.ts
 * Core domain service orchestrating classification decision integrity, cross-evidence arbitration,
 * snapshot binding, and auditable runtime enforcement (V6 Phase 78).
 */

import crypto from 'node:crypto';
import type { PrismaClient, FailureClassification, EvidenceIntegrityStatus } from '@prisma/client';
import type {
  IClassificationDecisionIntegrityService,
  EvaluateDecisionIntegrityInputDto,
  GetDecisionIntegrityInputDto,
  RecomputeDecisionIntegrityInputDto,
  ListDecisionIntegrityHistoryInputDto,
  ClassificationDecisionIntegrityDto,
  DecisionIntegrityState,
  EvidenceFreshnessState,
  ArbitrationEvaluationContext,
  DecisionFingerprintFacts,
} from './decision-integrity-types.js';
import { DECISION_INTEGRITY_BOUNDS } from './decision-integrity-types.js';
import {
  DecisionIntegrityCrossProjectError,
  ConcurrentDecisionIntegrityError,
} from './decision-integrity-errors.js';
import { ClassificationNotFoundError } from '../classification/classification-errors.js';
import { FailureCaseNotFoundError } from '../failure-errors.js';
import { CrossEvidenceArbitrationEngine } from './arbitration-engine.js';
import { generateDecisionFingerprint } from './decision-fingerprint.js';
import { FailureEvidenceRedactor } from '../evidence/failure-evidence-redactor.js';

export class ClassificationDecisionIntegrityService implements IClassificationDecisionIntegrityService {
  private readonly arbitrationEngine: CrossEvidenceArbitrationEngine;
  private readonly redactor: FailureEvidenceRedactor;
  private readonly caseLocks = new Map<string, Promise<void>>();

  constructor(private readonly prisma: PrismaClient) {
    this.arbitrationEngine = new CrossEvidenceArbitrationEngine();
    this.redactor = new FailureEvidenceRedactor();
  }

  /**
   * Serializes concurrent integrity mutations on the same failure case.
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
   * Helper to load failure case with required relations.
   */
  private async loadFailureCase(failureCaseId: string) {
    return this.prisma.failureCase.findUnique({
      where: { id: failureCaseId },
      include: {
        execution: {
          include: {
            stepExecutions: {
              orderBy: { stepIndex: 'asc' },
            },
            assertionExecutionRecords: true,
          },
        },
        evidenceReferences: {
          orderBy: { attachedAt: 'asc' },
        },
        reproductionAttempts: {
          orderBy: { attemptNumber: 'asc' },
        },
      },
    });
  }

  /**
   * Evaluates or re-evaluates the decision integrity for an authoritative failure classification.
   */
  public async evaluateDecisionIntegrity(
    input: EvaluateDecisionIntegrityInputDto,
  ): Promise<ClassificationDecisionIntegrityDto> {
    const lockKey = `${input.projectId}:${input.failureCaseId}`;
    return this.withLock(lockKey, async () => {
      const failureCase = await this.loadFailureCase(input.failureCaseId);

      if (!failureCase) {
        throw new FailureCaseNotFoundError(input.failureCaseId, input.projectId);
      }

      if (failureCase.projectId !== input.projectId) {
        throw new DecisionIntegrityCrossProjectError(
          input.failureCaseId,
          input.projectId,
          failureCase.projectId,
        );
      }

      // Find target classification
      let classification: FailureClassification | null;
      if (input.classificationId) {
        classification = await this.prisma.failureClassification.findUnique({
          where: { id: input.classificationId },
        });
      } else {
        classification = await this.prisma.failureClassification.findFirst({
          where: {
            failureCaseId: input.failureCaseId,
            projectId: input.projectId,
            isAuthoritative: true,
          },
        });
      }

      if (!classification) {
        throw new ClassificationNotFoundError(input.failureCaseId, input.projectId);
      }

      if (classification.projectId !== input.projectId) {
        throw new DecisionIntegrityCrossProjectError(
          input.failureCaseId,
          input.projectId,
          classification.projectId,
        );
      }

      // Check if authoritative decision integrity already exists and not forcing recompute
      if (!input.forceRecompute) {
        const existing = await this.prisma.classificationDecisionIntegrity.findFirst({
          where: {
            classificationId: classification.id,
            projectId: input.projectId,
            isAuthoritative: true,
          },
        });
        if (existing) {
          return this.mapToDto(existing);
        }
      }

      // Compute evidence package identity & overall integrity status
      const evidenceRefs = failureCase.evidenceReferences ?? [];
      const evidenceIds = evidenceRefs.map(
        r => `${r.id}:${r.sha256 ?? 'none'}:${r.integrityStatus}`,
      );
      const evidencePackageIdentity = crypto
        .createHash('sha256')
        .update(evidenceIds.join('|'), 'utf8')
        .digest('hex');

      const isEvidenceCorrupt = evidenceRefs.some(
        r => r.integrityStatus === 'CORRUPT' || r.integrityStatus === 'MISMATCH',
      );
      const overallEvidenceIntegrity: EvidenceIntegrityStatus = isEvidenceCorrupt
        ? 'CORRUPT'
        : evidenceRefs.some(r => r.integrityStatus === 'VERIFIED')
          ? 'VERIFIED'
          : 'UNVERIFIED';

      // Compute reproduction snapshot identity
      const reproductionAttempts = failureCase.reproductionAttempts ?? [];
      const reproFacts = reproductionAttempts.map(
        a =>
          `${a.attemptNumber}:${a.status}:${a.environmentEquivalence}:${a.reproductionFailureSignature ?? 'none'}`,
      );
      const reproductionSnapshotIdentity = crypto
        .createHash('sha256')
        .update(reproFacts.join('|'), 'utf8')
        .digest('hex');

      // Check freshness: changed facts or new reproduction after classification
      let evidenceFreshnessState: EvidenceFreshnessState = 'CURRENT';
      const hasNewReproductionAttempt = reproductionAttempts.some(
        a => a.createdAt > classification!.createdAt,
      );

      const hasVersionMismatch =
        classification.classifierVersion !== DECISION_INTEGRITY_BOUNDS.SERVICE_VERSION ||
        classification.taxonomyVersion !== DECISION_INTEGRITY_BOUNDS.SERVICE_VERSION;

      if (hasNewReproductionAttempt || hasVersionMismatch) {
        evidenceFreshnessState = 'STALE';
      }

      // Evaluate factual signals for arbitration context
      const execution = failureCase.execution;
      const stepExecutions = execution?.stepExecutions ?? [];
      const assertions = execution?.assertionExecutionRecords ?? [];
      const errorText = [
        failureCase.errorMessage ?? '',
        failureCase.failureSummary ?? '',
        execution?.errorMessage ?? '',
        ...stepExecutions.map(s => s.errorMessage ?? ''),
        ...assertions.map(a => a.errorMessage ?? ''),
      ].join(' \n ');

      const hasBrowserCrash = /browser\s+(has\s+)?crashed|target\s+page.*closed|SIGSEGV/i.test(
        errorText,
      );
      const hasTargetUnreachable =
        /net::ERR_CONNECTION_REFUSED|ENOTFOUND|target.*unreachable/i.test(errorText);
      const hasHttp5xx =
        /502\s+Bad\s+Gateway|503\s+Service\s+Unavailable|504\s+Gateway\s+Timeout/i.test(errorText);
      const hasAssertionFailure = assertions.some(a => a.status === 'FAILED');
      const hasTestDataFailure =
        /foreign\s+key\s+constraint|fixture.*missing|record\s+not\s+found/i.test(errorText);
      const hasInvalidTestSteps =
        stepExecutions.length === 0 && failureCase.triggeringExecutionStatus === 'FAILED';
      const hasRequirementConflict = /requirement\s+conflict|ambiguous\s+requirement/i.test(
        errorText,
      );
      const verifiedFixturePresent = !hasTestDataFailure && stepExecutions.length > 0;
      const cleanStepsCompleted = stepExecutions.filter(s => s.status === 'PASSED').length;

      const arbitrationCtx: ArbitrationEvaluationContext = {
        category: classification.category,
        subcategory: classification.subcategory,
        primaryRuleId: classification.primaryRuleId,
        matchedRuleIds: (classification.matchedRuleIds as string[]) ?? [],
        conflictingRuleIds: (classification.conflictingRuleIds as string[]) ?? [],
        executionStatus: execution?.status ?? failureCase.triggeringExecutionStatus,
        executionErrorCode: execution?.errorCode ?? failureCase.errorCode,
        executionErrorMessage: execution?.errorMessage ?? failureCase.errorMessage,
        hasBrowserCrash,
        hasTargetUnreachable,
        hasHttp5xx,
        hasAssertionFailure,
        hasTestDataFailure,
        hasInvalidTestSteps,
        hasRequirementConflict,
        verifiedFixturePresent,
        cleanStepsCompletedCount: cleanStepsCompleted,
        totalStepsCount: stepExecutions.length,
        reproductionAttempts: reproductionAttempts.map(a => ({
          attemptNumber: a.attemptNumber,
          status: a.status,
          environmentEquivalence: a.environmentEquivalence,
          blockerReason: a.blockerReason,
          completedAt: a.completedAt,
          createdAt: a.createdAt,
        })),
        classificationCreatedAt: classification.createdAt,
        evidencePackageIntegrityStatus: overallEvidenceIntegrity,
        evidenceCompleteness: failureCase.evidenceCompleteness,
      };

      const arbitrationResult = this.arbitrationEngine.arbitrate(arbitrationCtx);

      // Determine final DecisionIntegrityState
      let decisionState: DecisionIntegrityState = 'VALID';

      if (failureCase.status === 'BLOCKED') {
        decisionState = 'BLOCKED';
      } else if (isEvidenceCorrupt) {
        decisionState = 'INVALIDATED';
      } else if (
        arbitrationResult.arbitrationState === 'CONFLICTED' ||
        arbitrationResult.arbitrationState === 'OVERRIDDEN'
      ) {
        decisionState = 'CONFLICTED';
      } else if (
        failureCase.evidenceCompleteness === 'INSUFFICIENT' &&
        classification.category !== 'UNKNOWN' &&
        classification.category !== 'BLOCKED_EXECUTION'
      ) {
        decisionState = 'INSUFFICIENT';
      } else if (evidenceFreshnessState === 'STALE') {
        decisionState = 'STALE';
      } else {
        decisionState = 'VALID';
      }

      // Generate stable decision fingerprint
      const latestRepro = reproductionAttempts[reproductionAttempts.length - 1];
      const failedStep = stepExecutions.find(s => s.status === 'FAILED');
      const failedStepId = failedStep
        ? `step_${failedStep.stepIndex}_${failedStep.actionType}`
        : null;

      const fingerprintFacts: DecisionFingerprintFacts = {
        category: classification.category,
        subcategory: classification.subcategory,
        classifierVersion: classification.classifierVersion,
        taxonomyVersion: classification.taxonomyVersion,
        primaryRuleId: classification.primaryRuleId,
        matchedRuleIds: (classification.matchedRuleIds as string[]) ?? [],
        conflictingRuleIds: (classification.conflictingRuleIds as string[]) ?? [],
        normalizedEvidenceIdentities: evidenceRefs.map(r => r.id),
        reproductionSnapshotIdentity,
        environmentEquivalence: latestRepro?.environmentEquivalence ?? 'UNKNOWN',
        failedStepIdentity: failedStepId,
        failureSignature: failureCase.failureSignature ?? 'unknown_sig',
      };

      const decisionFingerprint = generateDecisionFingerprint(fingerprintFacts);

      // Redact reasons before persistence
      const redactedBlockingReasons = arbitrationResult.blockingReasons.map(
        r => this.redactor.redactText(r).redacted,
      );
      const redactedWarningReasons = arbitrationResult.warningReasons.map(
        r => this.redactor.redactText(r).redacted,
      );

      // Persist in transaction
      try {
        const persisted = await this.prisma.$transaction(async tx => {
          // Find and supersede existing authoritative record
          const priorAuthoritative = await tx.classificationDecisionIntegrity.findFirst({
            where: {
              classificationId: classification!.id,
              projectId: input.projectId,
              isAuthoritative: true,
            },
          });

          if (priorAuthoritative) {
            await tx.classificationDecisionIntegrity.update({
              where: { id: priorAuthoritative.id },
              data: { isAuthoritative: false },
            });
          }

          return tx.classificationDecisionIntegrity.create({
            data: {
              projectId: input.projectId,
              failureCaseId: input.failureCaseId,
              classificationId: classification!.id,
              classifierVersion: classification!.classifierVersion,
              taxonomyVersion: classification!.taxonomyVersion,
              evidencePackageIdentity,
              evidencePackageVersion: DECISION_INTEGRITY_BOUNDS.EVIDENCE_PACKAGE_VERSION,
              evidenceIntegrityState: overallEvidenceIntegrity as any,
              reproductionSnapshotIdentity,
              reproductionSummaryVersion: DECISION_INTEGRITY_BOUNDS.REPRODUCTION_SUMMARY_VERSION,
              decisionFingerprint,
              decisionState,
              evidenceFreshnessState,
              consistencyState: arbitrationResult.consistencyState,
              arbitrationState: arbitrationResult.arbitrationState,
              isAuthoritative: true,
              blockingReasons: redactedBlockingReasons,
              warningReasons: redactedWarningReasons,
              conflictDetailsJson: {
                conflictingChannels: arbitrationResult.conflictingEvidenceChannels,
                isContradictionDetected: arbitrationResult.isContradictionDetected,
              },
              materialChangesJson: arbitrationResult.materialChanges,
            },
          });
        });

        return this.mapToDto(persisted);
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          (err.message.includes('deadlock') || err.message.includes('concurrent'))
        ) {
          throw new ConcurrentDecisionIntegrityError(input.failureCaseId);
        }
        throw err;
      }
    });
  }

  /**
   * Idempotently retrieves the latest authoritative decision integrity record without mutating anything.
   */
  public async getDecisionIntegrity(
    input: GetDecisionIntegrityInputDto,
  ): Promise<ClassificationDecisionIntegrityDto | null> {
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: input.failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase) {
      throw new FailureCaseNotFoundError(input.failureCaseId, input.projectId);
    }

    if (failureCase.projectId !== input.projectId) {
      throw new DecisionIntegrityCrossProjectError(
        input.failureCaseId,
        input.projectId,
        failureCase.projectId,
      );
    }

    const whereClause: {
      failureCaseId: string;
      projectId: string;
      isAuthoritative: boolean;
      classificationId?: string;
    } = {
      failureCaseId: input.failureCaseId,
      projectId: input.projectId,
      isAuthoritative: true,
    };

    if (input.classificationId) {
      whereClause.classificationId = input.classificationId;
    }

    const record = await this.prisma.classificationDecisionIntegrity.findFirst({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    return record ? this.mapToDto(record) : null;
  }

  /**
   * Explicitly forces a recomputation of the decision integrity.
   */
  public async recomputeDecisionIntegrity(
    input: RecomputeDecisionIntegrityInputDto,
  ): Promise<ClassificationDecisionIntegrityDto> {
    return this.evaluateDecisionIntegrity({
      projectId: input.projectId,
      failureCaseId: input.failureCaseId,
      classificationId: input.classificationId,
      forceRecompute: true,
    });
  }

  /**
   * Lists the full audit history of decision integrity records for a failure case.
   */
  public async listDecisionIntegrityHistory(
    input: ListDecisionIntegrityHistoryInputDto,
  ): Promise<readonly ClassificationDecisionIntegrityDto[]> {
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: input.failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase) {
      throw new FailureCaseNotFoundError(input.failureCaseId, input.projectId);
    }

    if (failureCase.projectId !== input.projectId) {
      throw new DecisionIntegrityCrossProjectError(
        input.failureCaseId,
        input.projectId,
        failureCase.projectId,
      );
    }

    const records = await this.prisma.classificationDecisionIntegrity.findMany({
      where: {
        failureCaseId: input.failureCaseId,
        projectId: input.projectId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map(r => this.mapToDto(r));
  }

  /**
   * Maps a Prisma record to the standardized contracts DTO.
   */
  private mapToDto(record: any): ClassificationDecisionIntegrityDto {
    return {
      id: record.id,
      projectId: record.projectId,
      failureCaseId: record.failureCaseId,
      classificationId: record.classificationId,
      classifierVersion: record.classifierVersion,
      taxonomyVersion: record.taxonomyVersion,
      evidencePackageIdentity: record.evidencePackageIdentity,
      evidencePackageVersion: record.evidencePackageVersion,
      evidenceIntegrityState: record.evidenceIntegrityState,
      reproductionSnapshotIdentity: record.reproductionSnapshotIdentity,
      reproductionSummaryVersion: record.reproductionSummaryVersion,
      decisionFingerprint: record.decisionFingerprint,
      decisionState: record.decisionState,
      evidenceFreshnessState: record.evidenceFreshnessState,
      consistencyState: record.consistencyState,
      arbitrationState: record.arbitrationState,
      isAuthoritative: record.isAuthoritative,
      blockingReasons: (record.blockingReasons as string[]) ?? [],
      warningReasons: (record.warningReasons as string[]) ?? [],
      conflictDetailsJson: (record.conflictDetailsJson as Record<string, unknown>) ?? {},
      materialChangesJson: (record.materialChangesJson as string[]) ?? [],
      evaluatedAt: record.evaluatedAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
