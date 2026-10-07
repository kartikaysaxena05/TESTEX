/**
 * @file packages/core/src/failures/flakiness/flakiness-rules-engine.ts
 * Deterministic flakiness policy and reproducibility evaluation rules engine (V6 Phase 79).
 */

import { AttemptSeriesCollector } from './attempt-series-collector.js';
import { deriveFlakinessFingerprint } from './flakiness-fingerprint.js';
import {
  FLAKINESS_BOUNDS,
  type FlakinessEvaluationContext,
  type FlakinessEvaluationResult,
  type FlakinessState,
  type StabilityState,
} from './flakiness-types.js';

export class FlakinessRulesEngine {
  /**
   * Evaluates the attempt series deterministically and outputs flakiness intelligence.
   */
  public static evaluate(ctx: FlakinessEvaluationContext): FlakinessEvaluationResult {
    const series = AttemptSeriesCollector.collect(ctx);

    const warnings = [...series.warnings];
    const evidenceGaps = [...series.evidenceGaps];

    // Integrate Phase 78 Decision Integrity warnings if present
    if (ctx.decisionIntegrityState) {
      if (ctx.decisionIntegrityBlocked) {
        warnings.push(
          'Phase 78 classification decision integrity is marked BLOCKED due to contradictory evidence.',
        );
      } else if (ctx.decisionIntegrityState === 'INVALIDATED') {
        warnings.push('Phase 78 classification decision integrity is INVALIDATED.');
      } else if (ctx.decisionIntegrityState === 'STALE') {
        warnings.push('Phase 78 classification decision integrity is STALE.');
      }
    }

    const passRate =
      series.validAttemptCount > 0
        ? Number((series.passCount / series.validAttemptCount).toFixed(4))
        : null;
    const failureRate =
      series.validAttemptCount > 0
        ? Number((series.failCount / series.validAttemptCount).toFixed(4))
        : null;
    const reproducibilityRatio =
      series.validAttemptCount > 0
        ? Number((series.equivalentFailureCount / series.validAttemptCount).toFixed(4))
        : null;

    let flakinessState: FlakinessState = 'INSUFFICIENT_EVIDENCE';
    let stabilityState: StabilityState = 'UNKNOWN';
    const explanationParts: string[] = [];

    if (ctx.decisionIntegrityBlocked) {
      flakinessState = 'INCONCLUSIVE';
      stabilityState = 'UNKNOWN';
      evidenceGaps.push(...(ctx.decisionIntegrityReasons ?? []));
      explanationParts.push(
        'Flakiness analysis is inconclusive because underlying classification decision integrity is BLOCKED by contradictory cross-evidence.',
      );
    } else if (series.validAttemptCount < FLAKINESS_BOUNDS.MIN_EVALUATION_ATTEMPTS) {
      // Check if outcome variation was observed across drifted environments
      const allAttempts = series.attempts;
      const hasPassAnywhere = allAttempts.some(a => a.status === 'PASSED');
      const hasFailAnywhere = allAttempts.some(a => a.status === 'FAILED');

      if (series.environmentDriftCount > 0 && hasPassAnywhere && hasFailAnywhere) {
        flakinessState = 'ENVIRONMENT_VARIABILITY';
        stabilityState = 'UNKNOWN';
        explanationParts.push(
          'Outcome variation (PASS vs FAIL) observed across executions with material environment drift.',
          'Differences in browser engine or target environment preclude attributing instability to test flakiness.',
        );
      } else {
        flakinessState = 'INSUFFICIENT_EVIDENCE';
        stabilityState = 'UNKNOWN';
        explanationParts.push(
          `Insufficient valid comparable attempts (${series.validAttemptCount}/${FLAKINESS_BOUNDS.MIN_EVALUATION_ATTEMPTS} required).`,
          'At least 2 comparable attempts under matching test version and environment are required to evaluate flakiness.',
        );
      }
    } else {
      // We have >= 2 valid comparable attempts
      if (series.passCount === 0 && series.failCount > 0) {
        // All comparable attempts failed
        if (series.differentFailureCount > 0 && series.equivalentFailureCount === 0) {
          flakinessState = 'EXECUTION_VARIABILITY';
          stabilityState = 'UNSTABLE';
          explanationParts.push(
            `All ${series.validAttemptCount} comparable attempts failed, but failures occurred with non-matching signatures or at different steps.`,
          );
        } else if (series.differentFailureCount > 0 && series.equivalentFailureCount > 0) {
          flakinessState = 'EXECUTION_VARIABILITY';
          stabilityState = 'UNSTABLE';
          explanationParts.push(
            `All ${series.validAttemptCount} comparable attempts failed, but exhibited a mix of equivalent and diverging failure signatures.`,
          );
        } else {
          flakinessState = 'STABLE_FAILURE';
          stabilityState = 'STABLE';
          explanationParts.push(
            `Deterministically reproduced: all ${series.validAttemptCount} comparable execution attempts failed with the identical failure signature.`,
          );
        }
      } else if (series.failCount === 0 && series.passCount > 0) {
        // All comparable attempts passed
        flakinessState = 'STABLE_PASS';
        stabilityState = 'STABLE';
        explanationParts.push(
          `Consistently passed: all ${series.validAttemptCount} subsequent comparable execution attempts passed without failure.`,
        );
      } else if (series.passCount > 0 && series.failCount > 0) {
        // Alternating / unstable outcomes under comparable environment
        if (series.differentFailureCount > 0 && series.equivalentFailureCount === 0) {
          flakinessState = 'EXECUTION_VARIABILITY';
          stabilityState = 'UNSTABLE';
          explanationParts.push(
            `Executions fluctuated between passes and failures, but failures occurred with different signatures across attempts.`,
          );
        } else {
          // Equivalent failures present along with passes
          if (series.validAttemptCount >= FLAKINESS_BOUNDS.MIN_CONFIRMED_ATTEMPTS) {
            flakinessState = 'CONFIRMED_FLAKY';
            stabilityState = 'INTERMITTENT';
            explanationParts.push(
              `Confirmed flaky: observed intermittent oscillation across ${series.validAttemptCount} comparable attempts (${series.failCount} failures, ${series.passCount} passes) with consistent failure signatures under matching environment conditions.`,
            );
          } else {
            // Exactly 2 attempts (e.g. 1 FAIL + 1 PASS)
            flakinessState = 'FLAKY_CANDIDATE';
            stabilityState = 'INTERMITTENT';
            explanationParts.push(
              `Flaky candidate: outcome alternation observed (${series.failCount} FAIL, ${series.passCount} PASS) across ${series.validAttemptCount} comparable attempts. Minimum ${FLAKINESS_BOUNDS.MIN_CONFIRMED_ATTEMPTS} attempts required for confirmation.`,
            );
          }
        }
      } else {
        // Blocked or error attempts without clear pass/fail
        flakinessState = 'INCONCLUSIVE';
        stabilityState = 'UNKNOWN';
        explanationParts.push(
          `Execution attempts resulted in blocked or execution error states without definitive pass or fail outcomes.`,
        );
      }
    }

    const explanation = explanationParts.join(' ');

    const analysisFingerprint = deriveFlakinessFingerprint({
      testCaseId: ctx.testCaseId,
      testCaseVersionNumber: ctx.testCaseVersionNumber,
      flakinessPolicyVersion: FLAKINESS_BOUNDS.POLICY_VERSION,
      analysisVersion: FLAKINESS_BOUNDS.ANALYSIS_VERSION,
      attempts: series.attempts.map(a => ({
        attemptId: a.attemptId,
        source: a.source,
        status: a.status,
        isEligible: a.isEligible,
        environmentEquivalence: a.environmentEquivalence,
        isSignatureMatch: a.isSignatureMatch ?? null,
        isStepMatch: a.isStepMatch ?? null,
        normalizedSignature: a.failureSignature ?? null,
      })),
    });

    return {
      flakinessState,
      stabilityState,
      attemptCount: series.totalAttempts,
      validAttemptCount: series.validAttemptCount,
      passCount: series.passCount,
      failCount: series.failCount,
      blockedCount: series.blockedCount,
      cancelledCount: series.cancelledCount,
      executionErrorCount: series.executionErrorCount,
      equivalentFailureCount: series.equivalentFailureCount,
      differentFailureCount: series.differentFailureCount,
      sameStepFailureCount: series.sameStepFailureCount,
      differentStepFailureCount: series.differentStepFailureCount,
      environmentComparableCount: series.environmentComparableCount,
      environmentDriftCount: series.environmentDriftCount,
      reproducibilityRatio,
      passRate,
      failureRate,
      dominantFailureSignature: series.dominantFailureSignature,
      analysisFingerprint,
      analysisExplanation: explanation,
      attemptTimeline: series.attempts,
      warnings,
      evidenceGaps,
    };
  }
}
