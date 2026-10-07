/**
 * @file packages/core/src/qa-report/release-readiness-policy.ts
 * Deterministic, versioned policy engine for release readiness evaluation.
 * Evaluates aggregated QA metrics against formal release gating criteria.
 */

import {
  POLICY_RULE_CODES,
  QA_REPORT_POLICY_VERSION,
  type IReleaseReadinessPolicyEngine,
  type QaReportSnapshot,
  type ReleaseBlockerItemDto,
  type ReleasePolicyEvaluationResultDto,
  type ReleaseReadinessVerdictDto,
  type ResidualRiskItemDto,
} from './qa-report-types.js';

export class ReleaseReadinessPolicyEngine implements IReleaseReadinessPolicyEngine {
  public evaluate(params: {
    readonly snapshot: QaReportSnapshot;
    readonly policyVersion?: string;
  }): ReleasePolicyEvaluationResultDto {
    const { snapshot } = params;
    const policyVersion = params.policyVersion ?? QA_REPORT_POLICY_VERSION;

    const evaluatedRules: string[] = [];
    const passedRules: string[] = [];
    const failedRules: string[] = [];
    const blockingRules: ReleaseBlockerItemDto[] = [];
    const warningRules: ResidualRiskItemDto[] = [];
    const recommendations: string[] = [];

    // -------------------------------------------------------------------------
    // 1. Evaluate Blocker Rules
    // -------------------------------------------------------------------------

    // Rule: Critical Open Defects
    evaluatedRules.push(POLICY_RULE_CODES.BLOCK_CRITICAL_OPEN_DEFECT);
    if (snapshot.defectSummary.openCritical > 0) {
      failedRules.push(POLICY_RULE_CODES.BLOCK_CRITICAL_OPEN_DEFECT);
      blockingRules.push({
        ruleCode: POLICY_RULE_CODES.BLOCK_CRITICAL_OPEN_DEFECT,
        title: 'Open Critical Defects Detected',
        description: `${snapshot.defectSummary.openCritical} critical severity defect candidate(s) remain open and unresolved.`,
        severity: 'CRITICAL',
      });
      recommendations.push(
        `Resolve and verify all ${snapshot.defectSummary.openCritical} open Critical defects before release.`,
      );
    } else {
      passedRules.push(POLICY_RULE_CODES.BLOCK_CRITICAL_OPEN_DEFECT);
    }

    // Rule: High Open Defects
    evaluatedRules.push(POLICY_RULE_CODES.BLOCK_HIGH_OPEN_DEFECT);
    if (snapshot.defectSummary.openHigh > 0) {
      failedRules.push(POLICY_RULE_CODES.BLOCK_HIGH_OPEN_DEFECT);
      blockingRules.push({
        ruleCode: POLICY_RULE_CODES.BLOCK_HIGH_OPEN_DEFECT,
        title: 'Open High Severity Defects Detected',
        description: `${snapshot.defectSummary.openHigh} high severity defect candidate(s) remain open and unresolved.`,
        severity: 'HIGH',
      });
      recommendations.push(
        `Triage and resolve all ${snapshot.defectSummary.openHigh} open High severity defects.`,
      );
    } else {
      passedRules.push(POLICY_RULE_CODES.BLOCK_HIGH_OPEN_DEFECT);
    }

    // Rule: Mandatory Regression Failed
    evaluatedRules.push(POLICY_RULE_CODES.BLOCK_MANDATORY_REGRESSION_FAILED);
    if (
      snapshot.regressionSummary.failedRegressionTests > 0 ||
      !snapshot.regressionSummary.allMandatoryRegressionsPassed
    ) {
      failedRules.push(POLICY_RULE_CODES.BLOCK_MANDATORY_REGRESSION_FAILED);
      blockingRules.push({
        ruleCode: POLICY_RULE_CODES.BLOCK_MANDATORY_REGRESSION_FAILED,
        title: 'Mandatory Regression Failures',
        description: `${snapshot.regressionSummary.failedRegressionTests} mandatory regression test(s) failed or have not passed cleanly.`,
        severity: 'CRITICAL',
      });
      recommendations.push(
        `Execute and ensure 100% pass rate on mandatory regression test suites (${snapshot.regressionSummary.failedRegressionTests} failed).`,
      );
    } else {
      passedRules.push(POLICY_RULE_CODES.BLOCK_MANDATORY_REGRESSION_FAILED);
    }

    // Rule: Mandatory Requirements Failing
    evaluatedRules.push(POLICY_RULE_CODES.BLOCK_MANDATORY_REQUIREMENT_FAILED);
    if (snapshot.requirementSummary.failing > 0) {
      failedRules.push(POLICY_RULE_CODES.BLOCK_MANDATORY_REQUIREMENT_FAILED);
      blockingRules.push({
        ruleCode: POLICY_RULE_CODES.BLOCK_MANDATORY_REQUIREMENT_FAILED,
        title: 'Failing Requirement Test Cases',
        description: `${snapshot.requirementSummary.failing} requirement(s) have failing test executions.`,
        severity: 'HIGH',
      });
      recommendations.push(
        `Investigate and fix failing tests mapped to ${snapshot.requirementSummary.failing} requirement(s).`,
      );
    } else {
      passedRules.push(POLICY_RULE_CODES.BLOCK_MANDATORY_REQUIREMENT_FAILED);
    }

    // Rule: Unverified Fixes
    evaluatedRules.push(POLICY_RULE_CODES.BLOCK_UNVERIFIED_FIX);
    const unverifiedCount =
      snapshot.defectSummary.reverificationFailed +
      snapshot.reverificationSummary.stillFailingCount +
      snapshot.defectSummary.reverificationPending;
    if (unverifiedCount > 0) {
      failedRules.push(POLICY_RULE_CODES.BLOCK_UNVERIFIED_FIX);
      blockingRules.push({
        ruleCode: POLICY_RULE_CODES.BLOCK_UNVERIFIED_FIX,
        title: 'Unverified Fixes or Failed Reverifications',
        description: `${unverifiedCount} defect(s) have unverified fixes (${snapshot.defectSummary.reverificationPending} pending, ${snapshot.defectSummary.reverificationFailed + snapshot.reverificationSummary.stillFailingCount} failed).`,
        severity: 'HIGH',
      });
      recommendations.push(
        `Complete re-verification for all ${unverifiedCount} pending or failing defect fixes.`,
      );
    } else {
      passedRules.push(POLICY_RULE_CODES.BLOCK_UNVERIFIED_FIX);
    }

    // Rule: Execution Blocked
    evaluatedRules.push(POLICY_RULE_CODES.BLOCK_EXECUTION_BLOCKED);
    if (
      snapshot.testExecutionSummary.blockedCount > 0 ||
      snapshot.requirementSummary.blocked > 0
    ) {
      failedRules.push(POLICY_RULE_CODES.BLOCK_EXECUTION_BLOCKED);
      blockingRules.push({
        ruleCode: POLICY_RULE_CODES.BLOCK_EXECUTION_BLOCKED,
        title: 'Blocked Test Executions or Requirements',
        description: `${snapshot.testExecutionSummary.blockedCount} test execution(s) and ${snapshot.requirementSummary.blocked} requirement(s) are blocked by external prerequisites.`,
        severity: 'HIGH',
      });
      recommendations.push(
        `Unblock and execute the ${snapshot.testExecutionSummary.blockedCount} blocked test execution(s).`,
      );
    } else {
      passedRules.push(POLICY_RULE_CODES.BLOCK_EXECUTION_BLOCKED);
    }

    // Rule: Environment Prohibited
    evaluatedRules.push(POLICY_RULE_CODES.BLOCK_ENVIRONMENT_PROHIBITED);
    if (snapshot.environmentHealth.status === 'UNHEALTHY') {
      failedRules.push(POLICY_RULE_CODES.BLOCK_ENVIRONMENT_PROHIBITED);
      blockingRules.push({
        ruleCode: POLICY_RULE_CODES.BLOCK_ENVIRONMENT_PROHIBITED,
        title: 'Environment Status Unhealthy',
        description: `Target deployment environment is reporting UNHEALTHY status: ${snapshot.environmentHealth.issues.join('; ') || 'Critical infrastructure failures'}.`,
        severity: 'CRITICAL',
      });
      recommendations.push(
        'Restore target environment health before evaluating release readiness.',
      );
    } else {
      passedRules.push(POLICY_RULE_CODES.BLOCK_ENVIRONMENT_PROHIBITED);
    }

    // -------------------------------------------------------------------------
    // 2. Evaluate Warning Rules
    // -------------------------------------------------------------------------

    // Rule: Medium Open Defects
    evaluatedRules.push(POLICY_RULE_CODES.WARN_MEDIUM_DEFECT);
    if (snapshot.defectSummary.openMedium > 0) {
      failedRules.push(POLICY_RULE_CODES.WARN_MEDIUM_DEFECT);
      warningRules.push({
        riskCode: POLICY_RULE_CODES.WARN_MEDIUM_DEFECT,
        title: 'Open Medium Severity Defects',
        description: `${snapshot.defectSummary.openMedium} medium severity defect(s) remain open.`,
        severity: 'MEDIUM',
        mitigation: 'Review medium defects for deferred resolution or release note documentation.',
      });
      recommendations.push(
        `Review ${snapshot.defectSummary.openMedium} open medium defects for sign-off or mitigation.`,
      );
    } else {
      passedRules.push(POLICY_RULE_CODES.WARN_MEDIUM_DEFECT);
    }

    // Rule: Flaky Tests
    evaluatedRules.push(POLICY_RULE_CODES.WARN_FLAKY_TESTS);
    if (
      snapshot.flakinessSummary.flakyTestsDetected > 0 ||
      snapshot.flakinessSummary.flakinessRate > 5.0
    ) {
      failedRules.push(POLICY_RULE_CODES.WARN_FLAKY_TESTS);
      warningRules.push({
        riskCode: POLICY_RULE_CODES.WARN_FLAKY_TESTS,
        title: 'Flaky Tests Detected',
        description: `${snapshot.flakinessSummary.flakyTestsDetected} test(s) exhibited flaky retry behavior (${snapshot.flakinessSummary.flakinessRate.toFixed(1)}% flakiness rate).`,
        severity: 'MEDIUM',
        mitigation: 'Quarantine or stabilize intermittent test cases before general availability.',
      });
      recommendations.push(
        `Investigate ${snapshot.flakinessSummary.flakyTestsDetected} flaky tests showing retry instability.`,
      );
    } else {
      passedRules.push(POLICY_RULE_CODES.WARN_FLAKY_TESTS);
    }

    // Rule: Partial Coverage
    evaluatedRules.push(POLICY_RULE_CODES.WARN_PARTIAL_COVERAGE);
    if (
      snapshot.requirementSummary.testable > 0 &&
      snapshot.requirementSummary.coveragePercentage < 100.0
    ) {
      failedRules.push(POLICY_RULE_CODES.WARN_PARTIAL_COVERAGE);
      warningRules.push({
        riskCode: POLICY_RULE_CODES.WARN_PARTIAL_COVERAGE,
        title: 'Incomplete Test Coverage for Requirements',
        description: `Testable requirement coverage is ${snapshot.requirementSummary.coveragePercentage.toFixed(1)}% (${snapshot.requirementSummary.uncovered} uncovered testable requirements).`,
        severity: 'MEDIUM',
        mitigation: 'Author automated or exploratory test cases for remaining uncovered requirements.',
      });
      recommendations.push(
        `Author tests for the ${snapshot.requirementSummary.uncovered} uncovered testable requirement(s).`,
      );
    } else {
      passedRules.push(POLICY_RULE_CODES.WARN_PARTIAL_COVERAGE);
    }

    // Rule: Environment Drift / Degraded
    evaluatedRules.push(POLICY_RULE_CODES.WARN_ENVIRONMENT_DRIFT);
    if (snapshot.environmentHealth.status === 'DEGRADED') {
      failedRules.push(POLICY_RULE_CODES.WARN_ENVIRONMENT_DRIFT);
      warningRules.push({
        riskCode: POLICY_RULE_CODES.WARN_ENVIRONMENT_DRIFT,
        title: 'Environment Health Degraded',
        description: `Target environment is reporting DEGRADED health: ${snapshot.environmentHealth.issues.join('; ') || 'Latency/connectivity warnings'}.`,
        severity: 'LOW',
        mitigation: 'Monitor environment performance and verify connectivity during release window.',
      });
      recommendations.push(
        'Monitor target environment metrics to verify degraded state does not impact users.',
      );
    } else {
      passedRules.push(POLICY_RULE_CODES.WARN_ENVIRONMENT_DRIFT);
    }

    // -------------------------------------------------------------------------
    // 3. Determine Verdict & Readiness Score
    // -------------------------------------------------------------------------

    const hasNoData =
      snapshot.testExecutionSummary.totalDistinctTests === 0 &&
      snapshot.requirementSummary.total === 0;

    let verdict: ReleaseReadinessVerdictDto;
    let readinessScore: number | null = null;

    if (hasNoData) {
      verdict = 'UNKNOWN';
      recommendations.push('Run test suites and ingest requirements to generate release readiness intelligence.');
    } else if (blockingRules.length > 0) {
      // Check if blocked by external environment or execution blocking
      const isEnvironmentBlocker = blockingRules.some(
        b => b.ruleCode === POLICY_RULE_CODES.BLOCK_ENVIRONMENT_PROHIBITED,
      );
      const isExecutionBlocker = blockingRules.some(
        b => b.ruleCode === POLICY_RULE_CODES.BLOCK_EXECUTION_BLOCKED,
      );

      if (isEnvironmentBlocker || isExecutionBlocker) {
        verdict = 'BLOCKED';
      } else {
        verdict = 'NOT_READY';
      }
    } else if (warningRules.length > 0) {
      verdict = 'READY_WITH_RISK';
    } else {
      verdict = 'READY';
    }

    // Compute Readiness Score (0.0 to 100.0) if data exists
    if (!hasNoData) {
      const distinctTests = Math.max(1, snapshot.testExecutionSummary.totalDistinctTests);
      const passRatio = snapshot.testExecutionSummary.passedCount / distinctTests;
      const passComponent = passRatio * 40.0; // 40 pts

      const testableReqs = Math.max(1, snapshot.requirementSummary.testable);
      const verifiedRatio = snapshot.requirementSummary.verified / testableReqs;
      const verifiedComponent = verifiedRatio * 30.0; // 30 pts

      const coveredRatio = snapshot.requirementSummary.covered / testableReqs;
      const coverageComponent = coveredRatio * 15.0; // 15 pts

      const totalReverifs = snapshot.reverificationSummary.totalReverifications;
      const reverifRatio =
        totalReverifs > 0
          ? snapshot.reverificationSummary.verifiedFixedCount / totalReverifs
          : 1.0;
      const reverifComponent = reverifRatio * 15.0; // 15 pts

      let rawScore =
        passComponent +
        verifiedComponent +
        coverageComponent +
        reverifComponent;

      // Penalties for defects
      rawScore -= snapshot.defectSummary.openCritical * 30.0;
      rawScore -= snapshot.defectSummary.openHigh * 15.0;
      rawScore -= snapshot.defectSummary.openMedium * 5.0;
      rawScore -= snapshot.defectSummary.openLow * 1.0;

      // Penalty for flakiness
      rawScore -= (snapshot.flakinessSummary.flakinessRate * 0.2);

      // Clamp between 0.0 and 100.0
      readinessScore = Math.max(0.0, Math.min(100.0, Math.round(rawScore * 10) / 10));
    }

    // Build explanatory text
    let explanation: string;
    switch (verdict) {
      case 'READY':
        explanation = `Release criteria satisfied. All ${passedRules.length} policy rules passed. 0 release blockers and 0 residual risk warnings.`;
        break;
      case 'READY_WITH_RISK':
        explanation = `Release criteria conditionally met with ${warningRules.length} residual risk warning(s). 0 release blockers identified.`;
        break;
      case 'NOT_READY':
        explanation = `Release criteria failed with ${blockingRules.length} active release blocker(s). Cannot proceed with release.`;
        break;
      case 'BLOCKED':
        explanation = `Release evaluation blocked by ${blockingRules.length} critical blocking factor(s) (environment outage or blocked executions).`;
        break;
      case 'UNKNOWN':
      default:
        explanation = 'Insufficient execution or requirement data available to evaluate release readiness.';
        break;
    }

    return {
      policyVersion,
      verdict,
      readinessScore,
      passedRules,
      failedRules,
      blockingRules,
      warningRules,
      explanation,
      recommendations,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
