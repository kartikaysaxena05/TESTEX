/**
 * @file packages/core/src/test-validation/test-validation-policy.ts
 * Central policy engine mapping validation findings into final status verdicts and metrics.
 */

import type { TestValidationMetricsDto, TestValidationStatus } from '@ai-quality/contracts';
import type { RawValidationFinding } from './test-validation-types.js';

export interface PolicyEvaluationResult {
  readonly status: TestValidationStatus;
  readonly metrics: TestValidationMetricsDto;
  readonly summary: string;
}

export class TestValidationPolicyEngine {
  /**
   * Evaluates findings against policy to determine status, counts, and summary.
   */
  public evaluateFindings(
    rawFindings: readonly RawValidationFinding[],
    durationMs: number,
  ): PolicyEvaluationResult {
    let infoCount = 0;
    let warningCount = 0;
    let errorCount = 0;
    let blockerCount = 0;
    let contradictionCount = 0;
    let hallucinationCount = 0;
    let structuralValid = true;

    for (const f of rawFindings) {
      switch (f.severity) {
        case 'INFO':
          infoCount++;
          break;
        case 'WARNING':
          warningCount++;
          break;
        case 'ERROR':
          errorCount++;
          break;
        case 'BLOCKER':
          blockerCount++;
          break;
      }

      if (f.code === 'STRUCTURAL_INVALIDITY' && f.severity !== 'INFO') {
        structuralValid = false;
      }

      if (f.code.includes('CONTRADICT')) {
        contradictionCount++;
      }

      if (
        f.code.includes('UNSUPPORTED') ||
        f.code.includes('INVENTED') ||
        f.code === 'MISSING_GROUNDING_EVIDENCE'
      ) {
        hallucinationCount++;
      }
    }

    const totalFindings = rawFindings.length;
    const grounded = hallucinationCount === 0 && contradictionCount === 0;

    let status: TestValidationStatus;
    let summary: string;

    if (blockerCount > 0 || errorCount > 0) {
      status = 'REJECTED';
      summary = `Test rejected with ${blockerCount} blocker(s) and ${errorCount} error(s). Contains material unsupported claims or contradictions.`;
    } else if (warningCount > 0) {
      status = 'REVIEW_REQUIRED';
      summary = `Test requires human review due to ${warningCount} warning(s) (potential ungrounded details or requirement ambiguities).`;
    } else {
      status = 'VALID';
      summary =
        'Test case is structurally valid and grounded in authoritative requirement context.';
    }

    const metrics: TestValidationMetricsDto = {
      totalFindings,
      infoCount,
      warningCount,
      errorCount,
      blockerCount,
      structuralValid,
      grounded,
      contradictionCount,
      hallucinationCount,
      durationMs,
    };

    return { status, metrics, summary };
  }
}
