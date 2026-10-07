/**
 * @file packages/core/src/failures/flakiness/attempt-series-collector.ts
 * Attempt series aggregator, eligibility evaluator, and comparability normalizer (V6 Phase 79).
 */

import type {
  FlakinessEvaluationContext,
  CollectedAttemptSeries,
  FlakinessAttemptSummaryDto,
  RawAttemptRecord,
} from './flakiness-types.js';

export class AttemptSeriesCollector {
  /**
   * Consolidates and normalizes execution attempts into a structured series with strict eligibility filtering.
   */
  public static collect(ctx: FlakinessEvaluationContext): CollectedAttemptSeries {
    const warnings: string[] = [];
    const evidenceGaps: string[] = [];

    const timeline: FlakinessAttemptSummaryDto[] = [];

    // Sort raw attempts chronologically by timestamp, or by attemptNumber
    const sortedRaw = [...ctx.rawAttempts].sort((a, b) => {
      if (a.timestamp && b.timestamp) {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        if (timeA !== timeB) return timeA - timeB;
      }
      return a.attemptNumber - b.attemptNumber;
    });

    for (const raw of sortedRaw) {
      const eligibilityResult = this.evaluateEligibility(raw, ctx);

      if (!eligibilityResult.isEligible && eligibilityResult.reason) {
        warnings.push(`Attempt ${raw.id} excluded: ${eligibilityResult.reason}`);
      }

      let isSignatureMatch: boolean | null = null;
      let isStepMatch: boolean | null = null;

      if (raw.status === 'FAILED') {
        if (ctx.originalFailureSignature && raw.failureSignature) {
          isSignatureMatch = raw.failureSignature === ctx.originalFailureSignature;
        } else if (raw.failureSignature) {
          isSignatureMatch = false;
        }

        if (ctx.originalFailedStepIndex != null && raw.failedStepIndex != null) {
          isStepMatch = raw.failedStepIndex === ctx.originalFailedStepIndex;
        }
      }

      const timestampStr =
        raw.timestamp instanceof Date
          ? raw.timestamp.toISOString()
          : typeof raw.timestamp === 'string'
            ? raw.timestamp
            : null;

      timeline.push({
        attemptId: raw.id,
        source: raw.source,
        attemptNumber: raw.attemptNumber,
        status: raw.status,
        isEligible: eligibilityResult.isEligible,
        ineligibilityReason: eligibilityResult.reason ?? null,
        environmentEquivalence: raw.environmentEquivalence,
        failureSignature: raw.failureSignature ?? null,
        isSignatureMatch,
        failedStepIndex: raw.failedStepIndex ?? null,
        isStepMatch,
        testCaseVersionNumber: raw.testCaseVersionNumber,
        durationMs: raw.durationMs ?? null,
        timestamp: timestampStr,
      });
    }

    // Filter valid comparable attempts: eligible AND comparable environment
    const validComparableAttempts = timeline.filter(
      att =>
        att.isEligible &&
        (att.environmentEquivalence === 'EXACT' || att.environmentEquivalence === 'EQUIVALENT'),
    );

    let passCount = 0;
    let failCount = 0;
    let blockedCount = 0;
    let cancelledCount = 0;
    let executionErrorCount = 0;
    let equivalentFailureCount = 0;
    let differentFailureCount = 0;
    let sameStepFailureCount = 0;
    let differentStepFailureCount = 0;

    const signatureFrequencies = new Map<string, number>();

    for (const att of validComparableAttempts) {
      if (att.status === 'PASSED') {
        passCount++;
      } else if (att.status === 'FAILED') {
        failCount++;
        if (att.isSignatureMatch === true) {
          equivalentFailureCount++;
        } else if (att.isSignatureMatch === false) {
          differentFailureCount++;
        } else {
          // If no original signature was provided, treat matching as equivalent baseline
          equivalentFailureCount++;
        }

        if (att.isStepMatch === true) {
          sameStepFailureCount++;
        } else if (att.isStepMatch === false) {
          differentStepFailureCount++;
        }

        if (att.failureSignature) {
          signatureFrequencies.set(
            att.failureSignature,
            (signatureFrequencies.get(att.failureSignature) ?? 0) + 1,
          );
        }
      } else if (att.status === 'BLOCKED') {
        blockedCount++;
      } else if (att.status === 'CANCELLED') {
        cancelledCount++;
      } else if (att.status === 'EXECUTION_ERROR') {
        executionErrorCount++;
      }
    }

    // Count drifted environments across all attempts
    const environmentDriftCount = timeline.filter(
      att =>
        att.environmentEquivalence === 'DRIFTED' || att.environmentEquivalence === 'INCOMPATIBLE',
    ).length;

    // Find dominant signature
    let dominantFailureSignature = ctx.originalFailureSignature ?? null;
    let highestFreq = 0;
    for (const [sig, freq] of signatureFrequencies.entries()) {
      if (freq > highestFreq) {
        highestFreq = freq;
        dominantFailureSignature = sig;
      }
    }

    if (validComparableAttempts.length < 2) {
      evidenceGaps.push('Fewer than 2 valid comparable execution attempts available.');
    }

    if (environmentDriftCount > 0) {
      warnings.push(
        `${environmentDriftCount} attempt(s) exhibited environment drift and were isolated.`,
      );
    }

    return {
      attempts: timeline,
      totalAttempts: timeline.length,
      validComparableAttempts,
      validAttemptCount: validComparableAttempts.length,
      passCount,
      failCount,
      blockedCount,
      cancelledCount,
      executionErrorCount,
      equivalentFailureCount,
      differentFailureCount,
      sameStepFailureCount,
      differentStepFailureCount,
      environmentComparableCount: validComparableAttempts.length,
      environmentDriftCount,
      dominantFailureSignature,
      warnings,
      evidenceGaps,
    };
  }

  private static evaluateEligibility(
    raw: RawAttemptRecord,
    ctx: FlakinessEvaluationContext,
  ): { isEligible: boolean; reason?: string } {
    if (raw.projectId !== ctx.projectId) {
      return { isEligible: false, reason: 'Cross-project attempt identity mismatch.' };
    }

    if (raw.testCaseId !== ctx.testCaseId) {
      return { isEligible: false, reason: 'Test case identity mismatch.' };
    }

    if (raw.testCaseVersionNumber !== ctx.testCaseVersionNumber) {
      return {
        isEligible: false,
        reason: `Test version mismatch: attempt is v${raw.testCaseVersionNumber}, active failure is v${ctx.testCaseVersionNumber}.`,
      };
    }

    if (raw.hasCorruptEvidence) {
      return {
        isEligible: false,
        reason: 'Attempt evidence has integrity corruption or mismatch.',
      };
    }

    if (raw.status === 'CANCELLED') {
      return { isEligible: false, reason: 'Execution was aborted/cancelled by user.' };
    }

    return { isEligible: true };
  }
}
