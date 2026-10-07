/**
 * @file packages/core/src/failures/ai-reasoning/ai-reasoning-types.ts
 * Domain types, bounds, facts, and interfaces for Phase 82 AI-Assisted Failure Classification & Reasoning.
 */

import type {
  FailureCategory,
  FailureSubcategory,
  ClassificationAgreement,
  AiConfidenceLevel,
  AiSupportingEvidenceItemDto,
  AiContradictingEvidenceItemDto,
  AiAlternativeHypothesisDto,
  FailureAiAssessmentDto,
  AssessFailureWithAiInputDto,
  GetFailureAiAssessmentInputDto,
  ReassessFailureWithAiInputDto,
  ListFailureAiAssessmentHistoryInputDto,
} from '@ai-quality/contracts';

export type {
  FailureCategory,
  FailureSubcategory,
  ClassificationAgreement,
  AiConfidenceLevel,
  AiSupportingEvidenceItemDto,
  AiContradictingEvidenceItemDto,
  AiAlternativeHypothesisDto,
  FailureAiAssessmentDto,
  AssessFailureWithAiInputDto,
  GetFailureAiAssessmentInputDto,
  ReassessFailureWithAiInputDto,
  ListFailureAiAssessmentHistoryInputDto,
};

export const AI_ASSESSMENT_BOUNDS = Object.freeze({
  MAX_REASONING_LENGTH: 16384,
  MAX_EXPLANATION_LENGTH: 8192,
  MAX_RECOMMENDATIONS: 10,
  MAX_ALTERNATIVE_HYPOTHESES: 5,
  MAX_UNCERTAINTIES: 10,
  MAX_CONTEXT_BYTES: 65536,
  FINGERPRINT_LENGTH: 64,
  PROMPT_VERSION: '1.0.0',
  SCHEMA_VERSION: '1.0.0',
});

/**
 * Sanitized passive context passed to the AI reasoning engine.
 * Untrusted strings have been redacted and length-bounded.
 */
export interface AiReasoningSanitizedContext {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly caseTitle: string;
  readonly executionDetails: {
    readonly testName: string;
    readonly suiteName?: string;
    readonly browser: string;
    readonly os: string;
    readonly url?: string;
    readonly status: string;
    readonly durationMs: number;
    readonly errorMessage?: string;
    readonly stepIndex?: number;
    readonly actionType?: string;
  };
  readonly deterministicClassification?: {
    readonly category: FailureCategory;
    readonly subcategory?: FailureSubcategory | null;
    readonly confidenceScore: number;
    readonly ruleCitations?: readonly string[];
    readonly ruleEngineVersion?: string;
  };
  readonly domainSeparation?: {
    readonly failureDomain: string;
    readonly boundaryCrossing?: boolean;
    readonly suspectedComponent?: string | null;
    readonly networkResponsibility?: string | null;
    readonly domResponsibility?: string | null;
    readonly confidenceScore?: number;
  };
  readonly technicalLocalization?: {
    readonly primaryLayer?: string;
    readonly primaryTargetType?: string;
    readonly primaryTargetIdentifier?: string;
    readonly matchedFilePath?: string | null;
    readonly matchedSymbolName?: string | null;
    readonly httpEndpoint?: string | null;
    readonly httpMethod?: string | null;
    readonly httpStatusCode?: number | null;
    readonly domSelector?: string | null;
    readonly confidenceScore?: number;
  };
  readonly reproductionFacts?: {
    readonly isReproducible: boolean;
    readonly reproductionRate: number;
    readonly totalRuns: number;
    readonly passedRuns: number;
    readonly failedRuns: number;
  };
  readonly flakinessFacts?: {
    readonly isFlaky: boolean;
    readonly flakinessScore: number;
    readonly flakinessCategory?: string;
  };
  readonly sanitizedEvidence: {
    readonly consoleErrors: readonly string[];
    readonly networkFailures: readonly {
      readonly url: string;
      readonly method: string;
      readonly status?: number;
      readonly error?: string;
    }[];
    readonly domSnippet?: string;
    readonly stackTrace?: string;
    readonly artifactSummaries: readonly {
      readonly artifactType: string;
      readonly byteSize: number;
      readonly mimeType: string;
    }[];
  };
}

/**
 * Raw output emitted by the AI structured completion before deterministic calibration.
 */
export interface AiClassificationRawOutput {
  readonly aiCategory: FailureCategory;
  readonly aiSubcategory?: FailureSubcategory | null;
  readonly confidenceScore: number;
  readonly primaryReasoning: string;
  readonly humanExplanation: string;
  readonly supportingEvidence: readonly AiSupportingEvidenceItemDto[];
  readonly contradictingEvidence: readonly AiContradictingEvidenceItemDto[];
  readonly alternativeHypotheses: readonly AiAlternativeHypothesisDto[];
  readonly uncertainties: readonly string[];
  readonly recommendations?: readonly string[];
}

/**
 * Deterministic calibration factors assessing reliability and evidence quality.
 */
export interface ConfidenceCalibrationFactors {
  readonly evidenceCompleteness: number; // 0.0 to 1.0
  readonly reproductionConsistency: number; // 0.0 to 1.0
  readonly environmentEquivalence: number; // 0.0 to 1.0
  readonly contradictorySignalsCount: number;
  readonly rawConfidenceScore: number;
  readonly calibratedScore: number;
  readonly calibratedLevel: AiConfidenceLevel;
  readonly calibrationBasis: readonly string[];
}

/**
 * Domain service interface for Phase 82.
 */
export interface IFailureAiReasoningService {
  assessFailureWithAi(input: AssessFailureWithAiInputDto): Promise<FailureAiAssessmentDto>;

  getAiAssessment(input: GetFailureAiAssessmentInputDto): Promise<FailureAiAssessmentDto | null>;

  reassessFailureWithAi(input: ReassessFailureWithAiInputDto): Promise<FailureAiAssessmentDto>;

  listAiAssessmentHistory(
    input: ListFailureAiAssessmentHistoryInputDto,
  ): Promise<readonly FailureAiAssessmentDto[]>;
}
