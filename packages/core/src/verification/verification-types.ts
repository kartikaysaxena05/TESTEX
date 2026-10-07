/**
 * @file packages/core/src/verification/verification-types.ts
 * Domain types and bounds for V7 Phase 98 Automated Failed-Test Rerun & Fix Verification.
 */

import type {
  VerificationOutcome,
  DefectVerificationAttemptDto,
  VerificationSummaryDto,
  ExecuteVerificationInputDto,
  GetVerificationAttemptsInputDto,
  GetVerificationComparisonInputDto,
  CancelVerificationInputDto,
  EnvironmentEquivalenceStatus,
} from '@ai-quality/contracts';

export const VERIFICATION_BOUNDS = {
  MIN_ATTEMPTS: 1,
  MAX_ATTEMPTS: 5,
  DEFAULT_TIMEOUT_MS: 30000,
  LOCK_TIMEOUT_MS: 120000,
} as const;

export interface VerificationStepComparison {
  readonly stepIndex: number;
  readonly action: string;
  readonly originalStatus: string;
  readonly verificationStatus: string;
  readonly originalErrorMessage?: string | null;
  readonly verificationErrorMessage?: string | null;
  readonly isMatchingFailure: boolean;
}

export interface VerificationAssertionComparison {
  readonly stepIndex: number;
  readonly assertionType: string;
  readonly originalPassed: boolean;
  readonly verificationPassed: boolean;
  readonly originalActual?: unknown;
  readonly verificationActual?: unknown;
  readonly expected?: unknown;
}

export interface VerificationComparisonResult {
  readonly outcome: VerificationOutcome;
  readonly isSignatureMatch: boolean;
  readonly originalSignature: string | null;
  readonly verificationSignature: string | null;
  readonly originalFailingStepIndex: number | null;
  readonly verificationFailingStepIndex: number | null;
  readonly isStepIndexMatch: boolean;
  readonly originalFailedStepAction: string | null;
  readonly verificationFailedStepAction: string | null;
  readonly stepComparisons: readonly VerificationStepComparison[];
  readonly assertionComparisons: readonly VerificationAssertionComparison[];
  readonly environmentEquivalence: EnvironmentEquivalenceStatus;
  readonly environmentDriftDetected: boolean;
  readonly environmentDriftDetails: string | null;
  readonly testVersionDifference: string | null;
  readonly comparisonSummary: string;
  readonly blockerReason?: string | null;
}

export interface IDefectVerificationService {
  executeVerification(input: ExecuteVerificationInputDto): Promise<VerificationSummaryDto>;
  getAttempts(
    input: GetVerificationAttemptsInputDto,
  ): Promise<readonly DefectVerificationAttemptDto[]>;
  getComparison(
    input: GetVerificationComparisonInputDto,
  ): Promise<DefectVerificationAttemptDto | null>;
  cancelVerification(input: CancelVerificationInputDto): Promise<{ readonly cancelled: true }>;
}
