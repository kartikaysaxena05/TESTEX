/**
 * @file packages/core/src/failures/bug-report/bug-report-eligibility-evaluator.ts
 * Evaluates bug report eligibility and defect state based on upstream intelligence (Phases 76–80).
 *
 * Core Invariant: A failed test execution (FAILED) does NOT automatically mean a software application defect.
 * Differentiates confirmed application defects, supported candidates, automation defects, test data issues,
 * environment failures, flaky tests, blocked executions, and inconclusive diagnostic failures.
 */

import type { StructuredBugReportFacts, EligibilityEvaluationResult } from './bug-report-types.js';

export class BugReportEligibilityEvaluator {
  /**
   * Evaluates eligibility and determines whether the failure is an application defect or diagnostic failure.
   */
  public evaluateEligibility(facts: StructuredBugReportFacts): EligibilityEvaluationResult {
    const evidence: string[] = [];

    // 1. Check Phase 80 Domain Separation (primary authority)
    const domain = facts.domainSeparation?.domain?.toUpperCase();
    const domainConfidence = facts.domainSeparation?.confidenceScore;

    // 2. Check Phase 76 Reproduction
    const isReproduced =
      facts.reproductionSummary?.status?.toUpperCase() === 'REPRODUCED' ||
      (facts.reproductionSummary?.reproducedCount !== undefined &&
        facts.reproductionSummary.reproducedCount > 0);

    // 3. Check Phase 79 Flakiness
    const isFlaky =
      facts.flakiness?.isFlaky === true ||
      facts.flakiness?.flakinessState?.toUpperCase() === 'CONFIRMED_FLAKY';

    // 4. Check Phase 77 Classification (supporting authority)
    const category = facts.classification?.category?.toUpperCase();

    // Check for Blocked execution state
    if (
      domain === 'BLOCKED' ||
      category === 'BLOCKED_EXECUTION' ||
      facts.testExecution.status?.toUpperCase() === 'BLOCKED'
    ) {
      evidence.push('Execution marked as BLOCKED by domain separation or runner');
      return {
        defectState: 'BLOCKED',
        isApplicationDefect: false,
        eligibilityReason: 'Test execution was blocked and could not complete execution.',
        decisionEvidence: evidence,
      };
    }

    // Check Automation Failure
    if (
      domain === 'AUTOMATION_FAILURE' ||
      category === 'AUTOMATION_FAILURE' ||
      category === 'TEST_AUTOMATION_DEFECT' ||
      category === 'LOCATOR_ERROR' ||
      category === 'SELECTOR_ERROR' ||
      category === 'SYNCHRONIZATION_ERROR'
    ) {
      evidence.push(
        `Classified as automation failure (Domain: ${domain ?? 'N/A'}, Category: ${category ?? 'N/A'})`,
      );
      return {
        defectState: 'AUTOMATION_FAILURE',
        isApplicationDefect: false,
        eligibilityReason:
          'Failure localized to test script, locator, or automation harness, not the application under test.',
        decisionEvidence: evidence,
      };
    }

    // Check Test Data Failure
    if (
      domain === 'TEST_DATA_FAILURE' ||
      category === 'TEST_DATA_FAILURE' ||
      category === 'TEST_DATA_DEFECT' ||
      category === 'DATA_ERROR'
    ) {
      evidence.push(
        `Classified as test data failure (Domain: ${domain ?? 'N/A'}, Category: ${category ?? 'N/A'})`,
      );
      return {
        defectState: 'TEST_DATA_FAILURE',
        isApplicationDefect: false,
        eligibilityReason:
          'Failure caused by missing, invalid, or corrupted test data fixtures, not application logic.',
        decisionEvidence: evidence,
      };
    }

    // Check Environment Failure
    if (
      domain === 'ENVIRONMENT_FAILURE' ||
      category === 'ENVIRONMENT_FAILURE' ||
      category === 'ENVIRONMENTAL_ISSUE' ||
      category === 'INFRASTRUCTURE_FAILURE' ||
      category === 'NETWORK_ERROR'
    ) {
      evidence.push(
        `Classified as environment failure (Domain: ${domain ?? 'N/A'}, Category: ${category ?? 'N/A'})`,
      );
      return {
        defectState: 'ENVIRONMENT_FAILURE',
        isApplicationDefect: false,
        eligibilityReason:
          'Failure caused by test environment downtime, network instability, or configuration failure.',
        decisionEvidence: evidence,
      };
    }

    // Check Flaky Unstable Failure
    if (isFlaky && domain !== 'APPLICATION_DEFECT_CANDIDATE') {
      evidence.push(
        `Classified as flaky failure (Flakiness State: ${facts.flakiness?.flakinessState ?? 'CONFIRMED_FLAKY'}, Score: ${facts.flakiness?.overallScore ?? 'N/A'})`,
      );
      return {
        defectState: 'FLAKY_UNSTABLE_FAILURE',
        isApplicationDefect: false,
        eligibilityReason:
          'Failure exhibits non-deterministic execution behavior (intermittent passes/failures under identical code).',
        decisionEvidence: evidence,
      };
    }

    // Check Application Defect Candidate
    const isAppDefectCandidate =
      domain === 'APPLICATION_DEFECT_CANDIDATE' ||
      category === 'APPLICATION_FAILURE' ||
      category === 'PRODUCT_DEFECT' ||
      category === 'APPLICATION_ERROR';

    if (isAppDefectCandidate) {
      if (isReproduced) {
        evidence.push(
          `Domain confirmed as APPLICATION_DEFECT_CANDIDATE (confidence: ${domainConfidence ?? 'N/A'}) and successfully REPRODUCED in isolated sandbox`,
        );
        return {
          defectState: 'CONFIRMED_APPLICATION_DEFECT',
          isApplicationDefect: true,
          eligibilityReason:
            'Autonomous reproduction verified the failure is a genuine, repeatable application defect.',
          decisionEvidence: evidence,
        };
      } else {
        evidence.push(
          `Domain indicates APPLICATION_DEFECT_CANDIDATE but reproduction status is ${facts.reproductionSummary?.status ?? 'NOT_ATTEMPTED'}`,
        );
        return {
          defectState: 'SUPPORTED_APPLICATION_DEFECT',
          isApplicationDefect: true,
          eligibilityReason:
            'Evidence strongly supports an application defect, pending deterministic multi-trial reproduction.',
          decisionEvidence: evidence,
        };
      }
    }

    // Check Inconclusive / Conflicting
    if (domain === 'INCONCLUSIVE' || category === 'INCONCLUSIVE') {
      evidence.push('Upstream analysis marked domain or category as INCONCLUSIVE');
      return {
        defectState: 'INCONCLUSIVE',
        isApplicationDefect: false,
        eligibilityReason:
          'Evidence is insufficient or conflicting to conclusively label as an application defect.',
        decisionEvidence: evidence,
      };
    }

    // Fallback: Unknown
    evidence.push('No conclusive domain separation or classification facts available');
    return {
      defectState: 'UNKNOWN',
      isApplicationDefect: false,
      eligibilityReason:
        'Failure domain is unknown; diagnostic failure report generated to aid triage.',
      decisionEvidence: evidence,
    };
  }
}
