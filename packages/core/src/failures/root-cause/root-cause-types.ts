/**
 * @file packages/core/src/failures/root-cause/root-cause-types.ts
 * Domain types, bounds, facts, and interfaces for Phase 83 Root-Cause Analysis & Probable Layer Identification.
 */

import type {
  RootCauseProbableLayer,
  RootCauseStatus,
  RootCauseSupportingEvidenceItemDto,
  RootCauseContradictingEvidenceItemDto,
  RootCauseAlternativeHypothesisDto,
  RootCauseRepositoryReferenceDto,
  FailureRootCauseAnalysisDto,
  AnalyzeRootCauseInputDto,
  GetRootCauseAnalysisInputDto,
  ReanalyzeRootCauseInputDto,
  ListRootCauseHistoryInputDto,
  FailureCategory,
  FailureSubcategory,
} from '@ai-quality/contracts';

export type {
  RootCauseProbableLayer,
  RootCauseStatus,
  RootCauseSupportingEvidenceItemDto,
  RootCauseContradictingEvidenceItemDto,
  RootCauseAlternativeHypothesisDto,
  RootCauseRepositoryReferenceDto,
  FailureRootCauseAnalysisDto,
  AnalyzeRootCauseInputDto,
  GetRootCauseAnalysisInputDto,
  ReanalyzeRootCauseInputDto,
  ListRootCauseHistoryInputDto,
};

export const ROOT_CAUSE_BOUNDS = Object.freeze({
  MAX_PROBABLE_CAUSE_LENGTH: 8192,
  MAX_EXPLANATION_LENGTH: 8192,
  MAX_PROBABLE_COMPONENT_LENGTH: 256,
  MAX_RELATED_ENDPOINT_LENGTH: 1024,
  MAX_AFFECTED_EXECUTION_PATHS: 20,
  MAX_SUPPORTING_EVIDENCE: 20,
  MAX_CONTRADICTING_EVIDENCE: 10,
  MAX_ALTERNATIVE_HYPOTHESES: 5,
  MAX_REPOSITORY_REFERENCES: 10,
  MAX_LIMITATIONS: 10,
  MAX_UNCERTAINTIES: 10,
  MAX_CONTEXT_BYTES: 65536,
  FINGERPRINT_LENGTH: 64,
  PROMPT_VERSION: '1.0.0',
  SCHEMA_VERSION: '1.0.0',
});

/**
 * Sanitized passive context passed to the Root-Cause Analysis reasoning engine.
 * Untrusted strings have been redacted and length-bounded.
 */
export interface RootCauseSanitizedContext {
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
    readonly suspectedComponent?: string | null;
    readonly networkResponsibility?: string | null;
    readonly domResponsibility?: string | null;
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
  };
  readonly aiAssessment?: {
    readonly aiCategory: string;
    readonly aiSubcategory?: string | null;
    readonly agreementState: string;
    readonly confidenceLevel: string;
    readonly primaryReasoning: string;
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
  readonly repositoryContext: {
    readonly available: boolean;
    readonly knownFilesSummary: readonly {
      readonly path: string;
      readonly symbols: readonly string[];
    }[];
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
 * Raw output emitted by the Root-Cause AI completion before repository verification.
 */
export interface RootCauseRawOutput {
  readonly rootCauseStatus: RootCauseStatus;
  readonly probableLayer: RootCauseProbableLayer;
  readonly probableComponent?: string | null;
  readonly relatedEndpoint?: string | null;
  readonly probableCause: string;
  readonly humanExplanation: string;
  readonly affectedExecutionPath: readonly string[];
  readonly supportingEvidence: readonly RootCauseSupportingEvidenceItemDto[];
  readonly contradictingEvidence: readonly RootCauseContradictingEvidenceItemDto[];
  readonly alternativeHypotheses: readonly RootCauseAlternativeHypothesisDto[];
  readonly repositoryReferences: readonly {
    readonly filePath: string;
    readonly symbolName?: string;
    readonly symbolKind?: string;
    readonly startLine?: number;
    readonly endLine?: number;
    readonly relevance: string;
  }[];
  readonly limitations: readonly string[];
  readonly uncertainties: readonly string[];
}

/**
 * Domain service interface for Phase 83 Root-Cause Analysis.
 */
export interface IFailureRootCauseService {
  analyzeRootCause(input: AnalyzeRootCauseInputDto): Promise<FailureRootCauseAnalysisDto>;

  getRootCauseAnalysis(
    input: GetRootCauseAnalysisInputDto,
  ): Promise<FailureRootCauseAnalysisDto | null>;

  reanalyzeRootCause(input: ReanalyzeRootCauseInputDto): Promise<FailureRootCauseAnalysisDto>;

  listRootCauseHistory(
    input: ListRootCauseHistoryInputDto,
  ): Promise<readonly FailureRootCauseAnalysisDto[]>;
}
