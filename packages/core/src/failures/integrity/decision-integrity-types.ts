/**
 * @file packages/core/src/failures/integrity/decision-integrity-types.ts
 * Domain types, service interfaces, and bounds for Classification Decision Integrity & Arbitration (V6 Phase 78).
 */

import type {
  DecisionIntegrityState,
  EvidenceFreshnessState,
  DecisionConsistencyState,
  DecisionArbitrationState,
  ClassificationDecisionIntegrityDto,
  EvaluateDecisionIntegrityInputDto,
  GetDecisionIntegrityInputDto,
  RecomputeDecisionIntegrityInputDto,
  ListDecisionIntegrityHistoryInputDto,
  FailureCategory,
  FailureSubcategory,
} from '@ai-quality/contracts';

export type {
  DecisionIntegrityState,
  EvidenceFreshnessState,
  DecisionConsistencyState,
  DecisionArbitrationState,
  ClassificationDecisionIntegrityDto,
  EvaluateDecisionIntegrityInputDto,
  GetDecisionIntegrityInputDto,
  RecomputeDecisionIntegrityInputDto,
  ListDecisionIntegrityHistoryInputDto,
};

/**
 * Authoritative bounds and constants for Phase 78 decision integrity.
 */
export const DECISION_INTEGRITY_BOUNDS = {
  SERVICE_VERSION: '1.0.0',
  EVIDENCE_PACKAGE_VERSION: '1.0.0',
  REPRODUCTION_SUMMARY_VERSION: '1.0.0',
  FINGERPRINT_ALGORITHM: 'sha256',
  MAX_REASONS: 100,
} as const;

/**
 * Facts required to compute the deterministic decision fingerprint.
 * Strictly excludes volatile fields (timestamps, random order, paths, IDs of temporary runs)
 * and guarantees secret redaction.
 */
export interface DecisionFingerprintFacts {
  readonly category: FailureCategory;
  readonly subcategory: FailureSubcategory | null;
  readonly classifierVersion: string;
  readonly taxonomyVersion: string;
  readonly primaryRuleId: string;
  readonly matchedRuleIds: readonly string[];
  readonly conflictingRuleIds: readonly string[];
  readonly normalizedEvidenceIdentities: readonly string[];
  readonly reproductionSnapshotIdentity: string;
  readonly environmentEquivalence: string;
  readonly failedStepIdentity: string | null;
  readonly failureSignature: string;
}

/**
 * Context provided to the cross-evidence arbitration engine.
 */
export interface ArbitrationEvaluationContext {
  readonly category: FailureCategory;
  readonly subcategory: FailureSubcategory | null;
  readonly primaryRuleId: string;
  readonly matchedRuleIds: readonly string[];
  readonly conflictingRuleIds: readonly string[];
  readonly executionStatus: string;
  readonly executionErrorCode?: string | null;
  readonly executionErrorMessage?: string | null;
  readonly hasBrowserCrash: boolean;
  readonly hasTargetUnreachable: boolean;
  readonly hasHttp5xx: boolean;
  readonly hasAssertionFailure: boolean;
  readonly hasTestDataFailure: boolean;
  readonly hasInvalidTestSteps: boolean;
  readonly hasRequirementConflict: boolean;
  readonly verifiedFixturePresent: boolean;
  readonly cleanStepsCompletedCount: number;
  readonly totalStepsCount: number;
  readonly reproductionAttempts: ReadonlyArray<{
    readonly attemptNumber: number;
    readonly status: string;
    readonly environmentEquivalence: string;
    readonly blockerReason?: string | null;
    readonly completedAt?: Date | null;
    readonly createdAt: Date;
  }>;
  readonly classificationCreatedAt: Date;
  readonly evidencePackageIntegrityStatus: string;
  readonly evidenceCompleteness: string | null;
}

/**
 * Result of evaluating cross-evidence arbitration.
 */
export interface ArbitrationResult {
  readonly arbitrationState: DecisionArbitrationState;
  readonly consistencyState: DecisionConsistencyState;
  readonly isContradictionDetected: boolean;
  readonly conflictingEvidenceChannels: readonly string[];
  readonly blockingReasons: readonly string[];
  readonly warningReasons: readonly string[];
  readonly materialChanges: readonly string[];
}

/**
 * Domain service interface for Classification Decision Integrity.
 */
export interface IClassificationDecisionIntegrityService {
  /**
   * Evaluates or re-evaluates the decision integrity for an authoritative failure classification.
   */
  evaluateDecisionIntegrity(
    input: EvaluateDecisionIntegrityInputDto,
  ): Promise<ClassificationDecisionIntegrityDto>;

  /**
   * Idempotently retrieves the latest decision integrity record without mutating anything.
   */
  getDecisionIntegrity(
    input: GetDecisionIntegrityInputDto,
  ): Promise<ClassificationDecisionIntegrityDto | null>;

  /**
   * Explicitly forces a recomputation of the decision integrity.
   */
  recomputeDecisionIntegrity(
    input: RecomputeDecisionIntegrityInputDto,
  ): Promise<ClassificationDecisionIntegrityDto>;

  /**
   * Lists the full audit history of decision integrity records for a failure case.
   */
  listDecisionIntegrityHistory(
    input: ListDecisionIntegrityHistoryInputDto,
  ): Promise<readonly ClassificationDecisionIntegrityDto[]>;
}
