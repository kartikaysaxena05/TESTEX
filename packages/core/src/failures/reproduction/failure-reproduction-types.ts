/**
 * @file packages/core/src/failures/reproduction/failure-reproduction-types.ts
 * Authoritative types, bounds, and interfaces for Failure Reproduction & Reproducibility Verification (V6 Phase 76).
 */

import type {
  FailureReproductionOutcome,
  EnvironmentEquivalenceStatus,
  ReproductionStepComparisonDto,
  ReproductionAssertionComparisonDto,
  ReproductionEnvironmentComparisonDto,
  FailureReproductionAttemptDto,
  ReproducibilitySummaryDto,
  ExecuteReproductionInputDto,
  GetReproductionAttemptsInputDto,
  GetReproducibilitySummaryInputDto,
  CancelReproductionInputDto,
} from '@ai-quality/contracts';

export type {
  FailureReproductionOutcome,
  EnvironmentEquivalenceStatus,
  ReproductionStepComparisonDto,
  ReproductionAssertionComparisonDto,
  ReproductionEnvironmentComparisonDto,
  FailureReproductionAttemptDto,
  ReproducibilitySummaryDto,
  ExecuteReproductionInputDto,
  GetReproductionAttemptsInputDto,
  GetReproducibilitySummaryInputDto,
  CancelReproductionInputDto,
};

/**
 * Authoritative bounds and constants for Failure Reproduction.
 */
export const FAILURE_REPRODUCTION_BOUNDS = {
  REPRODUCTION_VERSION: '1.0.0',
  MIN_ATTEMPTS: 1,
  MAX_ATTEMPTS: 5,
  DEFAULT_ATTEMPTS: 1,
  DEFAULT_TIMEOUT_MS: 30000,
  MAX_TIMEOUT_MS: 120000,
  MAX_DIFF_SUMMARY_LENGTH: 4096,
} as const;

/**
 * Historical environment profile reconstructed from original execution data.
 */
export interface HistoricalEnvironmentProfile {
  readonly environmentId?: string | null;
  readonly environmentName?: string | null;
  readonly baseUrl?: string | null;
  readonly browserEngine: string;
  readonly browserVersion?: string | null;
  readonly viewport?: { readonly width: number; readonly height: number } | null;
  readonly locale?: string | null;
  readonly timezone?: string | null;
  readonly operatingSystem?: string | null;
}

/**
 * Current target environment profile designated for reproduction.
 */
export interface TargetEnvironmentProfile {
  readonly environmentId?: string | null;
  readonly environmentName?: string | null;
  readonly baseUrl?: string | null;
  readonly browserEngine: string;
  readonly viewport?: { readonly width: number; readonly height: number } | null;
  readonly locale?: string | null;
  readonly timezone?: string | null;
  readonly isProduction?: boolean;
}

/**
 * Result of resolving the historical test version.
 */
export interface HistoricalTestResolutionResult {
  readonly isExecutable: boolean;
  readonly blockerReason?: string | null;
  readonly testCaseId: string;
  readonly testCaseVersionId?: string | null;
  readonly testCaseVersionNumber: number;
  readonly requirementId?: string | null;
  readonly requirementVersionNumber?: number | null;
  readonly title: string;
  readonly steps: ReadonlyArray<{
    readonly id: string;
    readonly stepNumber: number;
    readonly action: string;
    readonly expectedResult?: string | null;
  }>;
}

/**
 * Service interface for Failure Reproduction & Reproducibility Verification.
 */
export interface IFailureReproductionService {
  executeReproduction(input: ExecuteReproductionInputDto): Promise<ReproducibilitySummaryDto>;
  getReproductionAttempts(
    input: GetReproductionAttemptsInputDto,
  ): Promise<readonly FailureReproductionAttemptDto[]>;
  getReproducibilitySummary(
    input: GetReproducibilitySummaryInputDto,
  ): Promise<ReproducibilitySummaryDto>;
  cancelReproduction(input: CancelReproductionInputDto): Promise<{ readonly cancelled: boolean }>;
}
