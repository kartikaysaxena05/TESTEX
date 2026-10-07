/**
 * @file packages/core/src/execution/retry/flakiness-detector.ts
 * Deterministic flakiness evaluation, outcome comparison, and reliability classification engine.
 */

import type {
  ExecutionReliabilityReportDto,
  ExecutionAttemptSummaryDto,
  ExecutionReliabilityStatus,
} from '@ai-quality/contracts';
import type { IFlakinessDetector, ReliabilityEvaluationParams } from './retry-types.js';

export class FlakinessDetector implements IFlakinessDetector {
  /**
   * Evaluates the reliability and flakiness characteristic of a test execution across all historical attempts.
   */
  public evaluateReliability(params: ReliabilityEvaluationParams): ExecutionReliabilityReportDto {
    const sortedAttempts = [...params.attempts].sort((a, b) => a.attempt - b.attempt);
    const totalAttempts = Math.max(1, sortedAttempts.length);
    const finalStatus = params.testRun.status;

    // 1. Build attempt summaries
    const attemptSummaries: ExecutionAttemptSummaryDto[] = sortedAttempts.map(att => {
      const evidenceBundle = (att as any).evidenceBundles?.[0];
      const artifactCount = (att as any).evidenceArtifacts?.length ?? 0;

      const startedAtStr =
        typeof att.startedAt === 'string'
          ? att.startedAt
          : (att.startedAt as any) instanceof Date
            ? (att.startedAt as any as Date).toISOString()
            : null;

      const completedAtStr =
        typeof att.completedAt === 'string'
          ? att.completedAt
          : (att.completedAt as any) instanceof Date
            ? (att.completedAt as any as Date).toISOString()
            : null;

      return {
        attempt: att.attempt,
        executionId: att.id,
        status: att.status as any,
        durationMs: att.durationMs ?? null,
        startedAt: startedAtStr,
        completedAt: completedAtStr,
        errorMessage: att.errorMessage ?? null,
        errorCode: att.errorCode ?? null,
        retryReason: (att as any).retryReason ?? null,
        reliabilityStatus:
          ((att as any).reliabilityStatus as ExecutionReliabilityStatus) ?? 'NOT_EVALUATED',
        passedAfterRetry: Boolean((att as any).passedAfterRetry),
        evidenceBundleId: evidenceBundle?.id ?? null,
        evidenceArtifactCount: artifactCount,
      };
    });

    // 2. Default baseline: Single attempt execution
    if (sortedAttempts.length <= 1) {
      return {
        testRunId: params.testRunId,
        totalAttempts: 1,
        finalStatus,
        passedAfterRetry: false,
        reliabilityStatus: 'STABLE',
        isFlakyCandidate: false,
        inconsistentSteps: [],
        attempts: attemptSummaries,
        generatedAt: new Date().toISOString(),
      };
    }

    // 3. Multi-attempt Analysis
    const hasInitialFailure = sortedAttempts[0]?.status !== 'PASSED';
    const hasSubsequentPass = sortedAttempts.slice(1).some(a => a.status === 'PASSED');
    const allPassed = sortedAttempts.every(a => a.status === 'PASSED');
    const allFailed = sortedAttempts.every(a => a.status !== 'PASSED');

    let reliabilityStatus: ExecutionReliabilityStatus = 'STABLE';
    let isFlakyCandidate = false;
    let passedAfterRetry = false;
    const inconsistentSteps: number[] = [];

    if (allFailed || allPassed) {
      // Consistent outcome across all attempts
      reliabilityStatus = 'STABLE';
      isFlakyCandidate = false;
      passedAfterRetry = false;
    } else if (hasInitialFailure && hasSubsequentPass) {
      // Passed after initial failure
      passedAfterRetry = true;

      // Check if initial failure was purely runtime/infra (e.g. browser crash / context closed)
      const firstAttempt = sortedAttempts[0];
      const isRuntimeCrash =
        firstAttempt?.errorCode === 'BROWSER_CRASH' ||
        firstAttempt?.errorCode === 'BROWSER_DISCONNECTED' ||
        firstAttempt?.errorCode === 'CONTEXT_CLOSED' ||
        (firstAttempt?.errorMessage &&
          /browser has been closed|target closed|crashed|disconnected/i.test(
            firstAttempt.errorMessage,
          ));

      if (isRuntimeCrash) {
        // Recovered from infrastructure/browser interruption -> Not test flakiness
        reliabilityStatus = 'RECOVERED_RUNTIME';
        isFlakyCandidate = false;
      } else {
        // Inconsistent test/assertion/timing outcome -> Flaky candidate
        reliabilityStatus = 'FLAKY_CANDIDATE';
        isFlakyCandidate = true;
      }
    } else {
      // Alternating / inconsistent outcomes across multiple attempts (e.g. FAIL -> PASS -> FAIL)
      reliabilityStatus = 'FLAKY_CANDIDATE';
      isFlakyCandidate = true;
    }

    return {
      testRunId: params.testRunId,
      totalAttempts,
      finalStatus,
      passedAfterRetry,
      reliabilityStatus,
      isFlakyCandidate,
      inconsistentSteps,
      attempts: attemptSummaries,
      generatedAt: new Date().toISOString(),
    };
  }
}
