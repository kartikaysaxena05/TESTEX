/**
 * @file packages/core/src/failures/integrity/arbitration-engine.ts
 * Cross-evidence arbitration and deterministic contradiction matrix engine (V6 Phase 78).
 */

import type {
  ArbitrationEvaluationContext,
  ArbitrationResult,
  DecisionArbitrationState,
  DecisionConsistencyState,
} from './decision-integrity-types.js';

export class CrossEvidenceArbitrationEngine {
  /**
   * Arbitrates factual signals across all evidence channels and determines consistency/contradiction.
   */
  public arbitrate(ctx: ArbitrationEvaluationContext): ArbitrationResult {
    const blockingReasons: string[] = [];
    const warningReasons: string[] = [];
    const conflictingChannels: string[] = [];
    const materialChanges: string[] = [];

    let arbitrationState: DecisionArbitrationState = 'SUPPORTED';
    let consistencyState: DecisionConsistencyState = 'CONSISTENT';
    let isContradictionDetected = false;

    // 1. Invalidation checks: Corrupted / Failed Evidence Integrity
    if (
      ctx.evidencePackageIntegrityStatus === 'CORRUPT' ||
      ctx.evidencePackageIntegrityStatus === 'MISMATCH'
    ) {
      blockingReasons.push(
        `Supporting evidence integrity verification failed with status "${ctx.evidencePackageIntegrityStatus}". The evidence snapshot can no longer be considered authoritative.`,
      );
      return {
        arbitrationState: 'OVERRIDDEN',
        consistencyState: 'INCONSISTENT',
        isContradictionDetected: true,
        conflictingEvidenceChannels: ['EVIDENCE_INTEGRITY'],
        blockingReasons,
        warningReasons,
        materialChanges,
      };
    }

    // 2. Insufficient evidence check
    if (
      ctx.evidenceCompleteness === 'INSUFFICIENT' &&
      ctx.category !== 'UNKNOWN' &&
      ctx.category !== 'BLOCKED_EXECUTION'
    ) {
      conflictingChannels.push('EVIDENCE_COMPLETENESS');
      blockingReasons.push(
        'Evidence completeness is INSUFFICIENT; deterministic classification should not have inferred a concrete failure category without mandatory artifacts.',
      );
      isContradictionDetected = true;
      arbitrationState = 'CONFLICTED';
      consistencyState = 'INCONSISTENT';
    }

    // 3. Contradiction Matrix: APPLICATION_FAILURE vs Stronger Signals
    if (ctx.category === 'APPLICATION_FAILURE') {
      if (ctx.hasBrowserCrash) {
        conflictingChannels.push('BROWSER_RUNTIME');
        blockingReasons.push(
          'Contradiction: Classification is APPLICATION_FAILURE, but browser process crash was recorded before assertion completed.',
        );
        isContradictionDetected = true;
        arbitrationState = 'OVERRIDDEN';
        consistencyState = 'INCONSISTENT';
      }

      if (ctx.hasTargetUnreachable) {
        conflictingChannels.push('ENVIRONMENT_NETWORK');
        blockingReasons.push(
          'Contradiction: Classification is APPLICATION_FAILURE, but target host was unreachable (net::ERR_CONNECTION_REFUSED / ENOTFOUND).',
        );
        isContradictionDetected = true;
        arbitrationState = 'OVERRIDDEN';
        consistencyState = 'INCONSISTENT';
      }
    }

    // 4. Contradiction Matrix: TEST_DATA_FAILURE vs Verified Fixture Present
    if (ctx.category === 'TEST_DATA_FAILURE') {
      if (ctx.verifiedFixturePresent && !ctx.hasTestDataFailure) {
        conflictingChannels.push('TEST_DATA');
        blockingReasons.push(
          'Contradiction: Classification is TEST_DATA_FAILURE, but verified test fixture was present and no data violation occurred.',
        );
        isContradictionDetected = true;
        arbitrationState = 'CONFLICTED';
        consistencyState = 'INCONSISTENT';
      }
    }

    // 5. Contradiction Matrix: ENVIRONMENT_FAILURE vs Fully Successful Steps
    if (ctx.category === 'ENVIRONMENT_FAILURE') {
      if (
        ctx.cleanStepsCompletedCount === ctx.totalStepsCount &&
        ctx.totalStepsCount > 0 &&
        !ctx.hasTargetUnreachable &&
        !ctx.hasHttp5xx
      ) {
        conflictingChannels.push('STEP_EXECUTION');
        warningReasons.push(
          'Potential contradiction: Classification is ENVIRONMENT_FAILURE, but all test steps executed cleanly without network unreachable errors.',
        );
        arbitrationState = 'CONFLICTED';
        consistencyState = 'INCONSISTENT';
      }
    }

    // 6. Check reproduction timeline and snapshot changes
    const completedAfterClassification = ctx.reproductionAttempts.filter(
      a => a.createdAt > ctx.classificationCreatedAt,
    );

    if (completedAfterClassification.length > 0) {
      warningReasons.push(
        `A new reproduction attempt (#${completedAfterClassification[0]?.attemptNumber}) was created after the authoritative classification was recorded.`,
      );
      materialChanges.push('NEW_REPRODUCTION_ATTEMPT');
    }

    return {
      arbitrationState,
      consistencyState,
      isContradictionDetected,
      conflictingEvidenceChannels: conflictingChannels,
      blockingReasons,
      warningReasons,
      materialChanges,
    };
  }
}
