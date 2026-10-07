/**
 * @file packages/core/src/failures/flakiness/flakiness-types.ts
 * Authoritative types, bounds, and interfaces for Failure Flakiness Detection & Reproducibility Intelligence (V6 Phase 79).
 */

import type {
  FlakinessState,
  StabilityState,
  FlakinessAttemptSummaryDto,
  FlakinessAnalysisDto,
  AnalyzeFlakinessInputDto,
  GetFlakinessAnalysisInputDto,
  ReanalyzeFlakinessInputDto,
  ListFlakinessHistoryInputDto,
  EnvironmentEquivalenceStatus,
} from '@ai-quality/contracts';

export type {
  FlakinessState,
  StabilityState,
  FlakinessAttemptSummaryDto,
  FlakinessAnalysisDto,
  AnalyzeFlakinessInputDto,
  GetFlakinessAnalysisInputDto,
  ReanalyzeFlakinessInputDto,
  ListFlakinessHistoryInputDto,
  EnvironmentEquivalenceStatus,
};

/**
 * Authoritative bounds and constants for Failure Flakiness Detection.
 */
export const FLAKINESS_BOUNDS = {
  ANALYSIS_VERSION: '1.0.0',
  POLICY_VERSION: '1.0.0',
  MIN_EVALUATION_ATTEMPTS: 2,
  MIN_CONFIRMED_ATTEMPTS: 3,
  DEFAULT_MAX_ADDITIONAL_ATTEMPTS: 0,
  MAX_ADDITIONAL_ATTEMPTS: 3,
  MAX_FINGERPRINT_STRING_LENGTH: 64,
  MAX_EXPLANATION_LENGTH: 4096,
} as const;

/**
 * Raw attempt input gathered from primary execution, V5 retries, or Phase 76 reproductions.
 */
export interface RawAttemptRecord {
  readonly id: string;
  readonly source: 'PRIMARY_EXECUTION' | 'V5_RETRY' | 'PHASE76_REPRODUCTION';
  readonly attemptNumber: number;
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly testCaseId: string;
  readonly testCaseVersionId?: string | null;
  readonly testCaseVersionNumber: number;
  readonly status: 'PASSED' | 'FAILED' | 'BLOCKED' | 'CANCELLED' | 'EXECUTION_ERROR';
  readonly environmentEquivalence: EnvironmentEquivalenceStatus;
  readonly failureSignature?: string | null;
  readonly failedStepIndex?: number | null;
  readonly durationMs?: number | null;
  readonly timestamp?: Date | string | null;
  readonly hasCorruptEvidence?: boolean;
}

/**
 * Result of attempt collection and eligibility filtering.
 */
export interface CollectedAttemptSeries {
  readonly attempts: readonly FlakinessAttemptSummaryDto[];
  readonly totalAttempts: number;
  readonly validComparableAttempts: readonly FlakinessAttemptSummaryDto[];
  readonly validAttemptCount: number;
  readonly passCount: number;
  readonly failCount: number;
  readonly blockedCount: number;
  readonly cancelledCount: number;
  readonly executionErrorCount: number;
  readonly equivalentFailureCount: number;
  readonly differentFailureCount: number;
  readonly sameStepFailureCount: number;
  readonly differentStepFailureCount: number;
  readonly environmentComparableCount: number;
  readonly environmentDriftCount: number;
  readonly dominantFailureSignature?: string | null;
  readonly warnings: readonly string[];
  readonly evidenceGaps: readonly string[];
}

/**
 * Evaluation context passed to the flakiness rules engine.
 */
export interface FlakinessEvaluationContext {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly testCaseId: string;
  readonly testCaseVersionId?: string | null;
  readonly testCaseVersionNumber: number;
  readonly originalFailureSignature?: string | null;
  readonly originalFailedStepIndex?: number | null;
  readonly decisionIntegrityState?: string | null;
  readonly decisionIntegrityBlocked?: boolean;
  readonly decisionIntegrityReasons?: readonly string[];
  readonly rawAttempts: readonly RawAttemptRecord[];
}

/**
 * Complete evaluation output computed by the flakiness rules engine.
 */
export interface FlakinessEvaluationResult {
  readonly flakinessState: FlakinessState;
  readonly stabilityState: StabilityState;
  readonly attemptCount: number;
  readonly validAttemptCount: number;
  readonly passCount: number;
  readonly failCount: number;
  readonly blockedCount: number;
  readonly cancelledCount: number;
  readonly executionErrorCount: number;
  readonly equivalentFailureCount: number;
  readonly differentFailureCount: number;
  readonly sameStepFailureCount: number;
  readonly differentStepFailureCount: number;
  readonly environmentComparableCount: number;
  readonly environmentDriftCount: number;
  readonly reproducibilityRatio: number | null;
  readonly passRate: number | null;
  readonly failureRate: number | null;
  readonly dominantFailureSignature?: string | null;
  readonly analysisFingerprint: string;
  readonly analysisExplanation: string;
  readonly attemptTimeline: readonly FlakinessAttemptSummaryDto[];
  readonly warnings: readonly string[];
  readonly evidenceGaps: readonly string[];
}

/**
 * Canonical payload used for deterministic fingerprint derivation.
 */
export interface CanonicalFlakinessPayload {
  readonly testCaseId: string;
  readonly testCaseVersionNumber: number;
  readonly flakinessPolicyVersion: string;
  readonly analysisVersion: string;
  readonly attempts: ReadonlyArray<{
    readonly attemptId: string;
    readonly source: string;
    readonly status: string;
    readonly isEligible: boolean;
    readonly environmentEquivalence: string;
    readonly isSignatureMatch: boolean | null;
    readonly isStepMatch: boolean | null;
    readonly normalizedSignature: string | null;
  }>;
}

/**
 * Service interface for Flakiness Detection & Reproducibility Intelligence.
 */
export interface IFlakinessAnalysisService {
  analyzeFlakiness(input: AnalyzeFlakinessInputDto): Promise<FlakinessAnalysisDto>;
  getFlakinessAnalysis(input: GetFlakinessAnalysisInputDto): Promise<FlakinessAnalysisDto | null>;
  reanalyzeFlakiness(input: ReanalyzeFlakinessInputDto): Promise<FlakinessAnalysisDto>;
  listFlakinessHistory(
    input: ListFlakinessHistoryInputDto,
  ): Promise<readonly FlakinessAnalysisDto[]>;
}
