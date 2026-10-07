/**
 * @file packages/core/src/failures/confidence/confidence-types.ts
 * Type definitions, bounds, and service interfaces for V6 Phase 86: Confidence Scoring, Explainability & Evidence Attribution.
 */

import type {
  ConfidenceBand,
  ConclusionType,
  AttributionRelationship,
  AttributionSupportStrength,
  SourceSubsystem,
  EpistemicType,
  ConfidenceAssessmentDto,
  EvidenceAttributionDto,
  ConfidenceComponentScoreDto,
  AssessConfidenceInputDto,
  GetConfidenceInputDto,
  ReassessConfidenceInputDto,
  ListConfidenceHistoryInputDto,
  ListEvidenceAttributionsInputDto,
} from '@ai-quality/contracts';

export type {
  ConfidenceBand,
  ConclusionType,
  AttributionRelationship,
  AttributionSupportStrength,
  SourceSubsystem,
  EpistemicType,
  ConfidenceAssessmentDto,
  EvidenceAttributionDto,
  ConfidenceComponentScoreDto,
  AssessConfidenceInputDto,
  GetConfidenceInputDto,
  ReassessConfidenceInputDto,
  ListConfidenceHistoryInputDto,
  ListEvidenceAttributionsInputDto,
};

/**
 * System-wide bounds, weights, and thresholds for Confidence Scoring.
 */
export const CONFIDENCE_BOUNDS = {
  ENGINE_VERSION: '1.0.0',
  SCORING_POLICY_VERSION: '2026.1',
  EXPLANATION_VERSION: '1.0.0',

  // Confidence Bands
  BANDS: {
    VERY_LOW: { min: 0.0, max: 0.1999 },
    LOW: { min: 0.2, max: 0.3999 },
    MEDIUM: { min: 0.4, max: 0.5999 },
    HIGH: { min: 0.6, max: 0.7999 },
    VERY_HIGH: { min: 0.8, max: 1.0 },
  },

  // Default Domain Weights (sum to 1.0 when all applicable)
  DEFAULT_DOMAIN_WEIGHTS: {
    classification: 0.3,
    rootCause: 0.25,
    reproducibility: 0.2,
    severity: 0.15,
    duplicate: 0.1,
  },

  // Penalty deductions
  CONTRADICTION_PENALTY_SEVERE: 0.2,
  CONTRADICTION_PENALTY_MODERATE: 0.1,
  CONTRADICTION_PENALTY_MILD: 0.05,
  MISSING_MANDATORY_FACTOR_PENALTY: 0.1,

  // Text limits
  MAX_EXPLANATION_LENGTH: 12000,
  MAX_REASON_LENGTH: 1000,
} as const;

/**
 * Epistemic status of a confidence score or domain evaluation.
 */
export type ScoreStatus = 'EVALUATED' | 'UNKNOWN' | 'NOT_APPLICABLE';

/**
 * Evaluated domain score with epistemic status.
 */
export interface EvaluatedDomainScore {
  readonly score: number | null;
  readonly status: ScoreStatus;
  readonly reason: string;
}

/**
 * Multi-phase facts gathered from Phases 74 through 85 for a single failure case.
 */
export interface ConfidenceEvaluationFacts {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly failureAnalysisRunId?: string | null;
  readonly testCaseId: string;
  readonly testCaseTitle: string;
  readonly testRunId: string;
  readonly executionId: string;
  readonly failureTitle: string;
  readonly failureSummary: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly failureSignature: string | null;
  readonly caseStatus: string;
  readonly caseCreatedAt: Date;
  readonly caseUpdatedAt: Date;

  // Phase 75: Evidence Ingestion & Normalization
  readonly evidenceCompleteness: string | null;
  readonly evidenceIntegrityStatus: string | null;
  readonly evidenceReferences: readonly {
    readonly id: string;
    readonly evidenceType: string;
    readonly filePath: string;
    readonly mimeType: string;
    readonly sha256: string;
    readonly byteSize: number;
    readonly metadataJson?: Record<string, unknown> | null;
    readonly createdAt: Date;
  }[];
  readonly hasScreenshot: boolean;
  readonly hasDomSnapshot: boolean;
  readonly hasConsoleLogs: boolean;
  readonly hasNetworkTrace: boolean;
  readonly hasTraceArchive: boolean;

  // Phase 76: Failure Reproduction
  readonly isReproduced: boolean;
  readonly reproductionStatus: string | null;
  readonly reproductionSignature: string | null;
  readonly reproductionAttempts: number;
  readonly reproductionSuccessCount: number;

  // Phase 77 / 78: Deterministic Classification & Decision Integrity
  readonly deterministicCategory: string | null;
  readonly deterministicConfidence: number | null;
  readonly classificationRationale: string | null;
  readonly decisionIntegrityPassed: boolean;
  readonly integrityViolations: readonly string[];

  // Phase 79: Flakiness Detection
  readonly isFlaky: boolean;
  readonly flakinessScore: number | null;
  readonly flakinessPattern: string | null;

  // Phase 80: Domain Separation
  readonly failureDomain: string | null;
  readonly domainConfidence: number | null;
  readonly domainIndicators: readonly string[];

  // Phase 81: Technical Localization
  readonly suspectLayer: string | null;
  readonly localizedFilePath: string | null;
  readonly localizedSymbol: string | null;
  readonly localizedStackTraceSnippet: string | null;
  readonly localizedFileExistsInRepo: boolean;

  // Phase 82: AI Reasoning & Calibration
  readonly aiCategory: string | null;
  readonly aiSelfReportedConfidence: number | null;
  readonly aiCalibratedConfidence: number | null;
  readonly aiReasoningExplanation: string | null;
  readonly aiAuditLog: readonly string[];

  // Phase 83: Root Cause Analysis
  readonly rootCauseStatus: string | null;
  readonly probableLayer: string | null;
  readonly probableComponent: string | null;
  readonly probableCause: string | null;
  readonly rootCauseConfidenceReported: number | null;
  readonly verifiedRepositoryReferences: readonly string[];

  // Phase 84: Impact & Severity
  readonly severity: string | null;
  readonly priority: string | null;
  readonly impactDimensions: readonly {
    readonly dimension: string;
    readonly score: number;
    readonly rationale: string;
  }[];

  // Phase 85: Duplicate Failure & Defect Clustering
  readonly clusterId: string | null;
  readonly clusterKey: string | null;
  readonly clusterSimilarityScore: number | null;
  readonly clusterActiveMemberCount: number;
  readonly isClusterRepresentative: boolean;
}

/**
 * Result of confidence calculation before persistence.
 */
export interface ConfidenceScoringResult {
  readonly overallConfidence: number;
  readonly confidenceBand: ConfidenceBand;
  readonly classificationConfidence: number | null;
  readonly reproducibilityConfidence: number | null;
  readonly rootCauseConfidence: number | null;
  readonly severityConfidence: number | null;
  readonly duplicateConfidence: number | null;
  readonly componentBreakdown: readonly ConfidenceComponentScoreDto[];
  readonly supportingFactors: readonly string[];
  readonly penalties: readonly string[];
  readonly missingFactors: readonly string[];
  readonly contradictions: readonly string[];
  readonly deterministicFacts: readonly string[];
  readonly aiInferences: readonly string[];
}

/**
 * Result of human-readable explanation generation.
 */
export interface GeneratedExplanation {
  readonly markdownExplanation: string;
  readonly claimsWithAttributions: readonly {
    readonly claim: string;
    readonly epistemicType: EpistemicType;
    readonly attributedKeys: readonly string[];
  }[];
}

/**
 * Interface for Confidence Assessment Service.
 */
export interface IConfidenceAssessmentService {
  assessConfidence(input: AssessConfidenceInputDto): Promise<ConfidenceAssessmentDto>;
  getConfidence(input: GetConfidenceInputDto): Promise<ConfidenceAssessmentDto | null>;
  reassessConfidence(input: ReassessConfidenceInputDto): Promise<ConfidenceAssessmentDto>;
  listConfidenceHistory(
    input: ListConfidenceHistoryInputDto,
  ): Promise<readonly ConfidenceAssessmentDto[]>;
  listEvidenceAttributions(
    input: ListEvidenceAttributionsInputDto,
  ): Promise<readonly EvidenceAttributionDto[]>;
}
