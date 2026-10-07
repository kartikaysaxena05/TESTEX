/**
 * @file packages/core/src/failures/classification/failure-deterministic-classifier.ts
 * Central deterministic failure classification engine and persistence coordinator (V6 Phase 77).
 */

import type { PrismaClient } from '@prisma/client';
import { FailureEvidenceRedactor } from '../evidence/failure-evidence-redactor.js';
import {
  FAILURE_CLASSIFICATION_BOUNDS,
  type ClassificationEvidenceContext,
  type ClassificationRuleExplanationDto,
  type ClassifyFailureInputDto,
  type FailureCategory,
  type FailureClassificationDto,
  type FailureSubcategory,
  type GetFailureClassificationInputDto,
  type IFailureDeterministicClassifier,
  type ListFailureClassificationsInputDto,
  type ReclassifyFailureInputDto,
  type RuleEvaluationResult,
} from './classification-types.js';
import {
  ClassificationCrossProjectError,
  ConcurrentClassificationError,
} from './classification-errors.js';
import {
  DETERMINISTIC_RULES_REGISTRY,
  RULE_INCONCLUSIVE_CONTRADICTORY_SIGNALS_001,
  RULE_UNKNOWN_INSUFFICIENT_EVIDENCE_001,
} from './rule-registry.js';
import { FailureCaseNotFoundError } from '../failure-errors.js';

export class FailureDeterministicClassifier implements IFailureDeterministicClassifier {
  private readonly redactor: FailureEvidenceRedactor;
  private readonly caseLocks = new Map<string, Promise<void>>();

  constructor(private readonly prisma: PrismaClient) {
    this.redactor = new FailureEvidenceRedactor();
  }

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
   * Helper to load failure case with all required relation records.
   */
  private async loadFailureCaseWithRelations(failureCaseId: string) {
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
        evidenceReferences: true,
        reproductionAttempts: {
          orderBy: { attemptNumber: 'desc' },
        },
      },
    });
  }

  /**
   * Classifies a failure case deterministically based on factual execution and reproduction evidence.
   */
  public async classify(input: ClassifyFailureInputDto): Promise<FailureClassificationDto> {
    const lockKey = `${input.projectId}:${input.failureCaseId}`;
    return this.withLock(lockKey, async () => {
      const failureCase = await this.loadFailureCaseWithRelations(input.failureCaseId);

      if (!failureCase) {
        throw new FailureCaseNotFoundError(input.failureCaseId, input.projectId);
      }

      if (failureCase.projectId !== input.projectId) {
        throw new ClassificationCrossProjectError(
          input.failureCaseId,
          input.projectId,
          failureCase.projectId,
        );
      }

      // If not forcing reclassification, check for an existing authoritative classification
      if (!input.forceReclassify) {
        const existing = await this.prisma.failureClassification.findFirst({
          where: {
            failureCaseId: input.failureCaseId,
            projectId: input.projectId,
            isAuthoritative: true,
          },
        });

        if (existing) {
          return this.mapToDto(existing);
        }
      }

      // Assemble classification evidence context
      const context = this.assembleEvidenceContext(failureCase);

      // Evaluate rules
      const matchedRules: Array<{
        rule: (typeof DETERMINISTIC_RULES_REGISTRY)[number];
        result: RuleEvaluationResult;
      }> = [];

      for (const rule of DETERMINISTIC_RULES_REGISTRY) {
        const result = rule.evaluate(context);
        if (result && result.matched) {
          matchedRules.push({ rule, result });
        }
      }

      // Determine primary rule and handle conflicts / inconclusive / unknown
      let primaryRule: (typeof DETERMINISTIC_RULES_REGISTRY)[number];
      let primaryResult: RuleEvaluationResult;
      const conflictingRuleIds: string[] = [];

      if (matchedRules.length === 0) {
        // Check if evidence completeness is INSUFFICIENT or core data missing
        const unknownResult = RULE_UNKNOWN_INSUFFICIENT_EVIDENCE_001.evaluate(context);
        primaryRule = RULE_UNKNOWN_INSUFFICIENT_EVIDENCE_001;
        primaryResult = unknownResult ?? {
          matched: true,
          explanation: 'No deterministic rule matched the recorded failure evidence.',
          supportingEvidence: [
            'Recorded failure characteristics did not satisfy any explicit pattern.',
          ],
          signalStrength: 'DEFINITIVE',
        };
        matchedRules.push({ rule: primaryRule, result: primaryResult });
      } else {
        const first = matchedRules[0];
        if (!first) {
          throw new Error('Unexpected empty matchedRules array');
        }
        primaryRule = first.rule;
        primaryResult = first.result;

        // Identify conflicting rules from different failure categories
        for (let i = 1; i < matchedRules.length; i++) {
          const candidate = matchedRules[i];
          if (candidate && candidate.rule.category !== primaryRule.category) {
            conflictingRuleIds.push(candidate.rule.id);
          }
        }

        // If conflicting rules represent irreconcilable divergence across core failure domains
        // (e.g. environment unreachable AND application assertion mismatch), resolve to INCONCLUSIVE
        const hasAppFailure = matchedRules.some(r => r.rule.category === 'APPLICATION_FAILURE');
        const hasEnvFailure = matchedRules.some(r => r.rule.category === 'ENVIRONMENT_FAILURE');
        const hasEnvConflict = hasAppFailure && hasEnvFailure;

        const hasReproductionDriftConflict = context.reproductionAttempts.some(
          a => a.status === 'NOT_REPRODUCED' && a.environmentEquivalence === 'DRIFTED',
        );

        if (hasEnvConflict || hasReproductionDriftConflict) {
          primaryRule = RULE_INCONCLUSIVE_CONTRADICTORY_SIGNALS_001;
          primaryResult = hasEnvConflict
            ? {
                matched: true,
                explanation:
                  'Conflicting factual signals detected: Both environment unreachable and application assertion errors were recorded.',
                supportingEvidence: [
                  'Environment failure indicators conflict with application failure assertion.',
                  'Cannot safely determine whether application mismatch was caused by target environment disruption.',
                ],
                signalStrength: 'STRONG',
              }
            : {
                matched: true,
                explanation:
                  'Conflicting factual signals detected: Original execution failed, but reproduction did not reproduce under a drifted environment.',
                supportingEvidence: [
                  'Original execution failed with error.',
                  'Reproduction attempt produced NOT_REPRODUCED but environment equivalence is DRIFTED.',
                  'Deterministic classification is inconclusive due to environment divergence.',
                ],
                signalStrength: 'STRONG',
              };
          matchedRules.unshift({ rule: primaryRule, result: primaryResult });
        } else if (
          context.evidenceCompleteness === 'INSUFFICIENT' &&
          primaryRule.category !== 'BLOCKED_EXECUTION' &&
          primaryRule.category !== 'AUTOMATION_FAILURE'
        ) {
          primaryRule = RULE_UNKNOWN_INSUFFICIENT_EVIDENCE_001;
          primaryResult = {
            matched: true,
            explanation:
              'Mandatory failure evidence is absent or incomplete; classification cannot be deterministically inferred.',
            supportingEvidence: [
              `Evidence completeness: ${context.evidenceCompleteness}`,
              `Recorded error: ${context.errorMessage ?? 'None'}`,
            ],
            signalStrength: 'DEFINITIVE',
          };
          matchedRules.unshift({ rule: primaryRule, result: primaryResult });
        }
      }

      // Build redacted rule explanations
      const ruleExplanations: ClassificationRuleExplanationDto[] = matchedRules.map(m => ({
        ruleId: m.rule.id,
        ruleName: m.rule.name,
        category: m.rule.category,
        subcategory: m.rule.subcategory ?? null,
        explanation: this.redactor.redactText(m.result.explanation).redacted,
        supportingEvidence: m.result.supportingEvidence.map(
          ev => this.redactor.redactText(ev).redacted,
        ),
        signalStrength: m.result.signalStrength,
      }));

      const matchedRuleIds = matchedRules.map(m => m.rule.id);
      const evidenceReferences = (failureCase.evidenceReferences ?? []).map(
        (r: { id: string }) => r.id,
      );

      // Concurrency-safe atomic transaction for reclassification & persistence
      try {
        const persisted = await this.prisma.$transaction(async tx => {
          // Find existing authoritative record if reclassifying
          const priorAuthoritative = await tx.failureClassification.findFirst({
            where: {
              failureCaseId: input.failureCaseId,
              projectId: input.projectId,
              isAuthoritative: true,
            },
          });

          // Create new classification
          const newRecord = await tx.failureClassification.create({
            data: {
              projectId: input.projectId,
              failureCaseId: input.failureCaseId,
              analysisRunId: input.analysisRunId ?? failureCase.currentAnalysisRunId ?? null,
              category: primaryRule.category,
              subcategory: primaryRule.subcategory ?? null,
              classifierVersion: FAILURE_CLASSIFICATION_BOUNDS.CLASSIFIER_VERSION,
              taxonomyVersion: FAILURE_CLASSIFICATION_BOUNDS.TAXONOMY_VERSION,
              primaryRuleId: primaryRule.id,
              matchedRuleIds: matchedRuleIds,
              ruleExplanationsJson: ruleExplanations as unknown as object,
              conflictingRuleIds: conflictingRuleIds,
              evidenceReferencesJson: evidenceReferences,
              isAuthoritative: true,
              reclassificationReason: input.reclassificationReason
                ? this.redactor.redactText(input.reclassificationReason).redacted
                : null,
            },
          });

          // If a prior record existed, supersede it
          if (priorAuthoritative) {
            await tx.failureClassification.update({
              where: { id: priorAuthoritative.id },
              data: {
                isAuthoritative: false,
                supersededById: newRecord.id,
              },
            });
          }

          return newRecord;
        });

        return this.mapToDto(persisted);
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          (err.message.includes('deadlock') || err.message.includes('concurrent'))
        ) {
          throw new ConcurrentClassificationError(input.failureCaseId);
        }
        throw err;
      }
    });
  }

  /**
   * Retrieves the current authoritative classification for a failure case.
   */
  public async getClassification(
    input: GetFailureClassificationInputDto,
  ): Promise<FailureClassificationDto | null> {
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: input.failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase) {
      throw new FailureCaseNotFoundError(input.failureCaseId, input.projectId);
    }

    if (failureCase.projectId !== input.projectId) {
      throw new ClassificationCrossProjectError(
        input.failureCaseId,
        input.projectId,
        failureCase.projectId,
      );
    }

    const classification = await this.prisma.failureClassification.findFirst({
      where: {
        failureCaseId: input.failureCaseId,
        projectId: input.projectId,
        isAuthoritative: true,
      },
    });

    return classification ? this.mapToDto(classification) : null;
  }

  /**
   * Explicitly reclassifies a failure case, recording a mandatory reclassification reason.
   */
  public async reclassify(input: ReclassifyFailureInputDto): Promise<FailureClassificationDto> {
    return this.classify({
      projectId: input.projectId,
      failureCaseId: input.failureCaseId,
      analysisRunId: input.analysisRunId,
      forceReclassify: true,
      reclassificationReason: input.reclassificationReason,
    });
  }

  /**
   * Lists the complete audit history of classifications for a failure case.
   */
  public async listClassificationHistory(
    input: ListFailureClassificationsInputDto,
  ): Promise<readonly FailureClassificationDto[]> {
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: input.failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase) {
      throw new FailureCaseNotFoundError(input.failureCaseId, input.projectId);
    }

    if (failureCase.projectId !== input.projectId) {
      throw new ClassificationCrossProjectError(
        input.failureCaseId,
        input.projectId,
        failureCase.projectId,
      );
    }

    const records = await this.prisma.failureClassification.findMany({
      where: {
        failureCaseId: input.failureCaseId,
        projectId: input.projectId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map(r => this.mapToDto(r));
  }

  /**
   * Assembles a normalized evidence context from database records.
   */
  private assembleEvidenceContext(failureCase: any): ClassificationEvidenceContext {
    const stepExecutions = failureCase.execution?.stepExecutions ?? [];
    const assertions = failureCase.execution?.assertionExecutionRecords ?? [];

    // Extract console and network errors from metadata if present
    const consoleErrors: string[] = [];
    const networkErrors: Array<{
      url: string;
      status?: number;
      statusText?: string;
      error?: string;
    }> = [];

    const meta = (failureCase.metadataJson as Record<string, unknown>) ?? {};
    if (Array.isArray(meta.consoleErrors)) {
      for (const err of meta.consoleErrors) {
        if (typeof err === 'string') consoleErrors.push(err);
      }
    }

    if (Array.isArray(meta.networkErrors)) {
      for (const item of meta.networkErrors) {
        if (item && typeof item === 'object') {
          networkErrors.push(item as any);
        }
      }
    }

    return {
      projectId: failureCase.projectId,
      failureCaseId: failureCase.id,
      testCaseId: failureCase.testCaseId,
      testRunId: failureCase.testRunId,
      executionId: failureCase.executionId,
      failureCaseStatus: failureCase.status,
      triggeringExecutionStatus: failureCase.triggeringExecutionStatus,
      isEligible: failureCase.isEligible,
      ineligibilityReason: failureCase.ineligibilityReason,
      isStale: failureCase.isStale,
      failureSignature: failureCase.failureSignature,
      evidenceCompleteness: failureCase.evidenceCompleteness,
      errorCode: failureCase.errorCode,
      errorMessage: failureCase.errorMessage,
      failureSummary: failureCase.failureSummary,
      metadataJson: meta,
      executionStatus: failureCase.execution?.status ?? null,
      executionFailureReason: failureCase.execution?.failureReason ?? null,
      stepExecutions: stepExecutions.map((s: any) => ({
        id: s.id,
        stepIndex: s.stepIndex,
        action: s.actionType ?? s.action,
        status: s.status,
        errorMessage: s.errorMessage,
        durationMs: s.durationMs,
        metadataJson: (s.metadataJson as Record<string, unknown>) ?? {},
      })),
      assertions: assertions.map((a: any) => ({
        id: a.id,
        stepExecutionId: a.stepExecutionId,
        assertionType: a.assertionType,
        expectedValue:
          a.expectedValueJson !== null && a.expectedValueJson !== undefined
            ? typeof a.expectedValueJson === 'string'
              ? a.expectedValueJson
              : JSON.stringify(a.expectedValueJson)
            : null,
        actualValue:
          a.actualValueJson !== null && a.actualValueJson !== undefined
            ? typeof a.actualValueJson === 'string'
              ? a.actualValueJson
              : JSON.stringify(a.actualValueJson)
            : null,
        passed: a.status === 'PASSED',
        errorMessage: a.errorMessage,
      })),
      evidenceReferences: (failureCase.evidenceReferences ?? []).map((r: any) => ({
        id: r.id,
        artifactType: r.artifactType,
        logicalName: r.logicalName,
        integrityStatus: r.integrityStatus,
        sha256: r.sha256,
        metadataJson: (r.metadataJson as Record<string, unknown>) ?? {},
      })),
      reproductionAttempts: (failureCase.reproductionAttempts ?? []).map((a: any) => ({
        id: a.id,
        attemptNumber: a.attemptNumber,
        status: a.status,
        environmentEquivalence: a.environmentEquivalence,
        isSignatureMatch: a.isSignatureMatch,
        isFailedStepMatch: a.isFailedStepMatch,
        blockerReason: a.blockerReason,
        createdAt: a.createdAt,
      })),
      consoleErrors,
      networkErrors,
    };
  }

  /**
   * Safely maps a database model to a DTO across the IPC boundary.
   */
  private mapToDto(record: {
    id: string;
    projectId: string;
    failureCaseId: string;
    analysisRunId: string | null;
    category: any;
    subcategory: any;
    classifierVersion: string;
    taxonomyVersion: string;
    primaryRuleId: string;
    matchedRuleIds: any;
    ruleExplanationsJson: any;
    conflictingRuleIds: any;
    evidenceReferencesJson: any;
    isAuthoritative: boolean;
    reclassificationReason: string | null;
    supersededById: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): FailureClassificationDto {
    return {
      id: record.id,
      projectId: record.projectId,
      failureCaseId: record.failureCaseId,
      analysisRunId: record.analysisRunId,
      category: record.category as FailureCategory,
      subcategory: (record.subcategory as FailureSubcategory) ?? null,
      classifierVersion: record.classifierVersion,
      taxonomyVersion: record.taxonomyVersion,
      primaryRuleId: record.primaryRuleId,
      matchedRuleIds: Array.isArray(record.matchedRuleIds)
        ? (record.matchedRuleIds as string[])
        : [],
      ruleExplanations: Array.isArray(record.ruleExplanationsJson)
        ? (record.ruleExplanationsJson as unknown as ClassificationRuleExplanationDto[])
        : [],
      conflictingRuleIds: Array.isArray(record.conflictingRuleIds)
        ? (record.conflictingRuleIds as string[])
        : [],
      evidenceReferences: Array.isArray(record.evidenceReferencesJson)
        ? (record.evidenceReferencesJson as string[])
        : [],
      isAuthoritative: record.isAuthoritative,
      reclassificationReason: record.reclassificationReason,
      supersededById: record.supersededById,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
