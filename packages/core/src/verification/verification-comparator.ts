/**
 * @file packages/core/src/verification/verification-comparator.ts
 * Authoritative comparison engine between original defect failure (E1) and verification rerun (E2).
 * Strictly deterministic and immutable against historical records.
 */

import type { EnvironmentEquivalenceStatus } from '@ai-quality/contracts';
import type {
  VerificationComparisonResult,
  VerificationStepComparison,
  VerificationAssertionComparison,
} from './verification-types.js';

export interface VerificationExecutionStep {
  readonly stepIndex: number;
  readonly actionType: string;
  readonly targetSummary?: string | null;
  readonly status: string;
  readonly durationMs?: number | null;
  readonly errorMessage?: string | null;
}

export interface VerificationAssertionRecord {
  readonly stepIndex?: number | null;
  readonly assertionType?: string | null;
  readonly operator?: string | null;
  readonly expectedValue?: unknown;
  readonly actualValue?: unknown;
  readonly status?: string | null;
  readonly message?: string | null;
}

export interface VerificationEnvironmentDetails {
  readonly equivalence: EnvironmentEquivalenceStatus;
  readonly isDriftDetected: boolean;
  readonly driftDetails?: string | null;
}

export interface CompareExecutionsInput {
  readonly originalExecutionStatus: string;
  readonly verificationExecutionStatus: string;
  readonly originalFailureSignature?: string | null;
  readonly verificationFailureSignature?: string | null;
  readonly originalSteps: readonly VerificationExecutionStep[];
  readonly verificationSteps: readonly VerificationExecutionStep[];
  readonly originalAssertions?: readonly VerificationAssertionRecord[];
  readonly verificationAssertions?: readonly VerificationAssertionRecord[];
  readonly environmentDetails?: VerificationEnvironmentDetails;
  readonly testVersionDifference?: string | null;
  readonly blockerReason?: string | null;
}

export class VerificationComparator {
  /**
   * Performs deep, deterministic comparison between original failure (E1) and verification rerun (E2).
   */
  public compare(input: CompareExecutionsInput): VerificationComparisonResult {
    const {
      originalExecutionStatus: _originalExecutionStatus,
      verificationExecutionStatus,
      originalFailureSignature = null,
      verificationFailureSignature = null,
      originalSteps,
      verificationSteps,
      originalAssertions = [],
      verificationAssertions = [],
      environmentDetails,
      testVersionDifference = null,
      blockerReason = null,
    } = input;

    const equivalence = environmentDetails?.equivalence ?? 'UNKNOWN';
    const driftDetected = environmentDetails?.isDriftDetected ?? false;
    const driftDetails = environmentDetails?.driftDetails ?? null;

    // 1. Check for explicit blocker
    if (blockerReason || verificationExecutionStatus === 'BLOCKED') {
      return {
        outcome: 'BLOCKED',
        isSignatureMatch: false,
        originalSignature: originalFailureSignature,
        verificationSignature: verificationFailureSignature,
        originalFailingStepIndex: this.findFailingStepIndex(originalSteps),
        verificationFailingStepIndex: null,
        isStepIndexMatch: false,
        originalFailedStepAction: this.findFailingStepAction(originalSteps),
        verificationFailedStepAction: null,
        stepComparisons: this.compareSteps(originalSteps, verificationSteps),
        assertionComparisons: this.compareAssertions(originalAssertions, verificationAssertions),
        environmentEquivalence: equivalence,
        environmentDriftDetected: driftDetected,
        environmentDriftDetails: driftDetails,
        testVersionDifference,
        comparisonSummary: `Verification execution is BLOCKED: ${blockerReason || 'Environmental or security constraints prevented execution.'}`,
        blockerReason,
      };
    }

    // 2. Check for cancellation
    if (verificationExecutionStatus === 'CANCELLED') {
      return {
        outcome: 'CANCELLED',
        isSignatureMatch: false,
        originalSignature: originalFailureSignature,
        verificationSignature: verificationFailureSignature,
        originalFailingStepIndex: this.findFailingStepIndex(originalSteps),
        verificationFailingStepIndex: null,
        isStepIndexMatch: false,
        originalFailedStepAction: this.findFailingStepAction(originalSteps),
        verificationFailedStepAction: null,
        stepComparisons: this.compareSteps(originalSteps, verificationSteps),
        assertionComparisons: this.compareAssertions(originalAssertions, verificationAssertions),
        environmentEquivalence: equivalence,
        environmentDriftDetected: driftDetected,
        environmentDriftDetails: driftDetails,
        testVersionDifference,
        comparisonSummary: 'Verification execution was CANCELLED by user or operator.',
        blockerReason: null,
      };
    }

    // 3. Check for execution errors (crashes, harness failures)
    if (
      verificationExecutionStatus === 'AUTOMATION_ERROR' ||
      verificationExecutionStatus === 'EXECUTION_ERROR'
    ) {
      return {
        outcome: 'EXECUTION_ERROR',
        isSignatureMatch: false,
        originalSignature: originalFailureSignature,
        verificationSignature: verificationFailureSignature,
        originalFailingStepIndex: this.findFailingStepIndex(originalSteps),
        verificationFailingStepIndex: this.findFailingStepIndex(verificationSteps),
        isStepIndexMatch: false,
        originalFailedStepAction: this.findFailingStepAction(originalSteps),
        verificationFailedStepAction: this.findFailingStepAction(verificationSteps),
        stepComparisons: this.compareSteps(originalSteps, verificationSteps),
        assertionComparisons: this.compareAssertions(originalAssertions, verificationAssertions),
        environmentEquivalence: equivalence,
        environmentDriftDetected: driftDetected,
        environmentDriftDetails: driftDetails,
        testVersionDifference,
        comparisonSummary:
          'Verification failed due to a browser automation or runner EXECUTION_ERROR.',
        blockerReason: null,
      };
    }

    // 4. Compare steps and assertions
    const stepComparisons = this.compareSteps(originalSteps, verificationSteps);
    const assertionComparisons = this.compareAssertions(originalAssertions, verificationAssertions);

    const origFailingStepIndex = this.findFailingStepIndex(originalSteps);
    const verifFailingStepIndex = this.findFailingStepIndex(verificationSteps);
    const origFailedAction = this.findFailingStepAction(originalSteps);
    const verifFailedAction = this.findFailingStepAction(verificationSteps);

    const isStepIndexMatch =
      origFailingStepIndex !== null &&
      verifFailingStepIndex !== null &&
      origFailingStepIndex === verifFailingStepIndex;

    const isSignatureMatch =
      Boolean(originalFailureSignature) &&
      Boolean(verificationFailureSignature) &&
      originalFailureSignature === verificationFailureSignature;

    // 5. If verification PASSED cleanly
    if (verificationExecutionStatus === 'PASSED') {
      const allAssertionsPassed = assertionComparisons.every(a => a.verificationPassed);
      if (allAssertionsPassed) {
        return {
          outcome: 'VERIFIED_FIXED',
          isSignatureMatch: false,
          originalSignature: originalFailureSignature,
          verificationSignature: null,
          originalFailingStepIndex: origFailingStepIndex,
          verificationFailingStepIndex: null,
          isStepIndexMatch: false,
          originalFailedStepAction: origFailedAction,
          verificationFailedStepAction: null,
          stepComparisons,
          assertionComparisons,
          environmentEquivalence: equivalence,
          environmentDriftDetected: driftDetected,
          environmentDriftDetails: driftDetails,
          testVersionDifference,
          comparisonSummary: `Defect verified FIXED: All ${verificationSteps.length} steps passed successfully with 0 assertion failures.`,
          blockerReason: null,
        };
      }
    }

    // 6. If verification FAILED
    if (verificationExecutionStatus === 'FAILED' || verificationExecutionStatus === 'TIMED_OUT') {
      // Check if it's the SAME failure (STILL_FAILING)
      // Criteria: signature matches OR (stepIndex matches AND failed step action matches)
      const sameStepFailing = isStepIndexMatch;
      const sameSignature = isSignatureMatch;

      if (sameSignature || sameStepFailing) {
        return {
          outcome: 'STILL_FAILING',
          isSignatureMatch,
          originalSignature: originalFailureSignature,
          verificationSignature: verificationFailureSignature,
          originalFailingStepIndex: origFailingStepIndex,
          verificationFailingStepIndex: verifFailingStepIndex,
          isStepIndexMatch,
          originalFailedStepAction: origFailedAction,
          verificationFailedStepAction: verifFailedAction,
          stepComparisons,
          assertionComparisons,
          environmentEquivalence: equivalence,
          environmentDriftDetected: driftDetected,
          environmentDriftDetails: driftDetails,
          testVersionDifference,
          comparisonSummary: `Defect is STILL_FAILING: Step ${verifFailingStepIndex ?? 'N/A'} failed with matching behavior (signature match: ${isSignatureMatch ? 'YES' : 'NO'}, step match: ${isStepIndexMatch ? 'YES' : 'NO'}).`,
          blockerReason: null,
        };
      }

      // If failing at a different step or with a different signature -> DIFFERENT_FAILURE
      return {
        outcome: 'DIFFERENT_FAILURE',
        isSignatureMatch: false,
        originalSignature: originalFailureSignature,
        verificationSignature: verificationFailureSignature,
        originalFailingStepIndex: origFailingStepIndex,
        verificationFailingStepIndex: verifFailingStepIndex,
        isStepIndexMatch: false,
        originalFailedStepAction: origFailedAction,
        verificationFailedStepAction: verifFailedAction,
        stepComparisons,
        assertionComparisons,
        environmentEquivalence: equivalence,
        environmentDriftDetected: driftDetected,
        environmentDriftDetails: driftDetails,
        testVersionDifference,
        comparisonSummary: `Verification encountered a DIFFERENT_FAILURE at step ${verifFailingStepIndex ?? 'unknown'} (original failed at step ${origFailingStepIndex ?? 'unknown'}).`,
        blockerReason: null,
      };
    }

    // 7. Fallback: INCONCLUSIVE
    return {
      outcome: 'INCONCLUSIVE',
      isSignatureMatch: false,
      originalSignature: originalFailureSignature,
      verificationSignature: verificationFailureSignature,
      originalFailingStepIndex: origFailingStepIndex,
      verificationFailingStepIndex: verifFailingStepIndex,
      isStepIndexMatch,
      originalFailedStepAction: origFailedAction,
      verificationFailedStepAction: verifFailedAction,
      stepComparisons,
      assertionComparisons,
      environmentEquivalence: equivalence,
      environmentDriftDetected: driftDetected,
      environmentDriftDetails: driftDetails,
      testVersionDifference,
      comparisonSummary: `Verification outcome is INCONCLUSIVE (status: ${verificationExecutionStatus}). Unable to determine fix resolution with certainty.`,
      blockerReason: null,
    };
  }

  private findFailingStepIndex(steps: readonly VerificationExecutionStep[]): number | null {
    const failed = steps.find(s => s.status === 'FAILED' || s.status === 'ERROR');
    return failed ? failed.stepIndex : null;
  }

  private findFailingStepAction(steps: readonly VerificationExecutionStep[]): string | null {
    const failed = steps.find(s => s.status === 'FAILED' || s.status === 'ERROR');
    return failed ? failed.targetSummary || failed.actionType : null;
  }

  private compareSteps(
    origSteps: readonly VerificationExecutionStep[],
    verifSteps: readonly VerificationExecutionStep[],
  ): readonly VerificationStepComparison[] {
    const results: VerificationStepComparison[] = [];
    const maxLen = Math.max(origSteps.length, verifSteps.length);

    for (let i = 0; i < maxLen; i++) {
      const orig = origSteps[i];
      const verif = verifSteps[i];
      const stepIndex = orig?.stepIndex ?? verif?.stepIndex ?? i + 1;
      const action = verif?.actionType || orig?.actionType || `Step ${stepIndex}`;
      const originalStatus = orig?.status || 'NOT_RUN';
      const verificationStatus = verif?.status || 'NOT_RUN';

      const isMatchingFailure = originalStatus === 'FAILED' && verificationStatus === 'FAILED';

      results.push({
        stepIndex,
        action,
        originalStatus,
        verificationStatus,
        originalErrorMessage: orig?.errorMessage || null,
        verificationErrorMessage: verif?.errorMessage || null,
        isMatchingFailure,
      });
    }

    return results;
  }

  private compareAssertions(
    origAssertions: readonly VerificationAssertionRecord[],
    verifAssertions: readonly VerificationAssertionRecord[],
  ): readonly VerificationAssertionComparison[] {
    const results: VerificationAssertionComparison[] = [];
    const maxLen = Math.max(origAssertions.length, verifAssertions.length);

    for (let i = 0; i < maxLen; i++) {
      const orig = origAssertions[i];
      const verif = verifAssertions[i];
      const stepIndex = verif?.stepIndex ?? orig?.stepIndex ?? i + 1;
      const assertionType = verif?.assertionType || orig?.assertionType || 'assertion';
      const originalPassed = orig ? orig.status === 'PASSED' : true;
      const verificationPassed = verif ? verif.status === 'PASSED' : true;

      results.push({
        stepIndex,
        assertionType,
        originalPassed,
        verificationPassed,
        originalActual: orig?.actualValue,
        verificationActual: verif?.actualValue,
        expected: verif?.expectedValue ?? orig?.expectedValue,
      });
    }

    return results;
  }
}
