/**
 * @file packages/core/src/failures/classification/classification-types.ts
 * Authoritative types, bounds, and interfaces for Failure Taxonomy & Deterministic Classification Foundation (V6 Phase 77).
 */

import type {
  FailureCategory,
  FailureSubcategory,
  FactualSignalStrength,
  ClassificationRuleExplanationDto,
  FailureClassificationDto,
  ClassifyFailureInputDto,
  GetFailureClassificationInputDto,
  ReclassifyFailureInputDto,
  ListFailureClassificationsInputDto,
  EvidenceCompletenessStatus,
  FailureCaseStatus,
  FailureReproductionOutcome,
  EnvironmentEquivalenceStatus,
} from '@ai-quality/contracts';

export type {
  FailureCategory,
  FailureSubcategory,
  FactualSignalStrength,
  ClassificationRuleExplanationDto,
  FailureClassificationDto,
  ClassifyFailureInputDto,
  GetFailureClassificationInputDto,
  ReclassifyFailureInputDto,
  ListFailureClassificationsInputDto,
};

/**
 * Authoritative bounds and constants for Deterministic Classification.
 */
export const FAILURE_CLASSIFICATION_BOUNDS = {
  CLASSIFIER_VERSION: '1.0.0',
  TAXONOMY_VERSION: '1.0.0',
  MAX_REASON_LENGTH: 1000,
  MAX_EXPLANATION_LENGTH: 2048,
  MAX_EVIDENCE_ITEMS: 100,
} as const;

/**
 * Factual context assembled from V5 execution and V6 Phase 74-76 records for rule evaluation.
 */
export interface ClassificationEvidenceContext {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly testCaseId: string;
  readonly testRunId: string;
  readonly executionId: string;
  readonly failureCaseStatus: FailureCaseStatus;
  readonly triggeringExecutionStatus: string;
  readonly isEligible: boolean;
  readonly ineligibilityReason?: string | null;
  readonly isStale: boolean;
  readonly failureSignature?: string | null;
  readonly evidenceCompleteness?: EvidenceCompletenessStatus | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly failureSummary?: string | null;
  readonly metadataJson?: Record<string, unknown>;

  // Execution facts
  readonly executionStatus?: string | null;
  readonly executionFailureReason?: string | null;
  readonly stepExecutions: ReadonlyArray<{
    readonly id: string;
    readonly stepIndex: number;
    readonly action: string;
    readonly status: string;
    readonly errorMessage?: string | null;
    readonly durationMs?: number | null;
    readonly metadataJson?: Record<string, unknown>;
  }>;
  readonly assertions: ReadonlyArray<{
    readonly id: string;
    readonly stepExecutionId?: string | null;
    readonly assertionType: string;
    readonly expectedValue?: string | null;
    readonly actualValue?: string | null;
    readonly passed: boolean;
    readonly errorMessage?: string | null;
  }>;

  // Evidence references (Phase 75)
  readonly evidenceReferences: ReadonlyArray<{
    readonly id: string;
    readonly artifactType: string;
    readonly logicalName: string;
    readonly integrityStatus: string;
    readonly sha256?: string | null;
    readonly metadataJson?: Record<string, unknown>;
  }>;

  // Reproduction facts (Phase 76)
  readonly reproductionAttempts: ReadonlyArray<{
    readonly id: string;
    readonly attemptNumber: number;
    readonly status: FailureReproductionOutcome;
    readonly environmentEquivalence: EnvironmentEquivalenceStatus;
    readonly isSignatureMatch?: boolean | null;
    readonly isFailedStepMatch?: boolean | null;
    readonly blockerReason?: string | null;
    readonly createdAt: Date;
  }>;

  // Console & Network signals extracted from evidence / metadata
  readonly consoleErrors: readonly string[];
  readonly networkErrors: ReadonlyArray<{
    readonly url: string;
    readonly status?: number;
    readonly statusText?: string;
    readonly error?: string;
  }>;
}

/**
 * Result of evaluating a deterministic rule against evidence.
 */
export interface RuleEvaluationResult {
  readonly matched: boolean;
  readonly explanation: string;
  readonly supportingEvidence: readonly string[];
  readonly signalStrength: FactualSignalStrength;
}

/**
 * Definition interface for a deterministic classification rule.
 */
export interface IDeterministicRule {
  readonly id: string;
  readonly name: string;
  readonly category: FailureCategory;
  readonly subcategory?: FailureSubcategory | null;
  readonly precedence: number; // Lower number = higher precedence
  readonly evaluate: (ctx: ClassificationEvidenceContext) => RuleEvaluationResult | null;
}

/**
 * Service interface for Deterministic Failure Classification.
 */
export interface IFailureDeterministicClassifier {
  classify(input: ClassifyFailureInputDto): Promise<FailureClassificationDto>;
  getClassification(
    input: GetFailureClassificationInputDto,
  ): Promise<FailureClassificationDto | null>;
  reclassify(input: ReclassifyFailureInputDto): Promise<FailureClassificationDto>;
  listClassificationHistory(
    input: ListFailureClassificationsInputDto,
  ): Promise<readonly FailureClassificationDto[]>;
}
