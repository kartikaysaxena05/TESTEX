/**
 * @file packages/core/src/qa-report/release-readiness-policy.test.ts
 * Unit tests for deterministic Release Readiness Policy Engine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ReleaseReadinessPolicyEngine } from './release-readiness-policy.js';
import {
  type QaReportSnapshot,
  POLICY_RULE_CODES,
} from './qa-report-types.js';

describe('V7 Phase 109 - Release Readiness Policy Engine', () => {
  const engine = new ReleaseReadinessPolicyEngine();

  const createBaseSnapshot = (overrides?: Partial<QaReportSnapshot>): QaReportSnapshot => ({
    requirementSummary: {
      total: 10,
      testable: 10,
      covered: 10,
      verified: 10,
      uncovered: 0,
      failing: 0,
      blocked: 0,
      coveragePercentage: 100.0,
      verifiedPercentage: 100.0,
    },
    testExecutionSummary: {
      totalDistinctTests: 50,
      totalExecutionAttempts: 50,
      passedCount: 50,
      failedCount: 0,
      blockedCount: 0,
      automationErrorCount: 0,
      cancelledCount: 0,
      passPercentage: 100.0,
      retryCount: 0,
      passedAfterRetryCount: 0,
    },
    failureDomainSummary: {
      totalFailures: 0,
      applicationDefects: 0,
      automationFailures: 0,
      testDataFailures: 0,
      environmentFailures: 0,
      blockedFailures: 0,
      inconclusiveFailures: 0,
      unknownFailures: 0,
    },
    defectSummary: {
      totalDefects: 0,
      openCritical: 0,
      openHigh: 0,
      openMedium: 0,
      openLow: 0,
      resolvedOrClosed: 0,
      verifiedFixed: 0,
      reverificationPending: 0,
      reverificationFailed: 0,
    },
    reverificationSummary: {
      totalReverifications: 0,
      verifiedFixedCount: 0,
      stillFailingCount: 0,
      differentFailureCount: 0,
      blockedCount: 0,
      inconclusiveCount: 0,
    },
    regressionSummary: {
      totalRetestPlans: 1,
      totalRegressionTests: 20,
      passedRegressionTests: 20,
      failedRegressionTests: 0,
      untestedRegressionTests: 0,
      allMandatoryRegressionsPassed: true,
    },
    flakinessSummary: {
      flakyTestsDetected: 0,
      flakyExecutionAttempts: 0,
      flakinessRate: 0,
    },
    automationHealth: {
      status: 'HEALTHY',
      issues: [],
      details: {},
    },
    environmentHealth: {
      status: 'HEALTHY',
      issues: [],
      details: {},
    },
    testDataHealth: {
      status: 'HEALTHY',
      issues: [],
      details: {},
    },
    securityFindings: [],
    releaseBlockers: [],
    residualRisks: [],
    knownLimitations: [],
    traceabilityMatrix: [],
    evidenceReferences: [],
    snapshotTime: new Date(),
    ...overrides,
  });

  it('evaluates clean snapshot as READY with score 100', () => {
    const snapshot = createBaseSnapshot();
    const result = engine.evaluate({ snapshot });

    assert.equal(result.verdict, 'READY');
    assert.equal(result.readinessScore, 100);
    assert.equal(result.blockingRules.length, 0);
    assert.equal(result.warningRules.length, 0);
    assert.ok(result.explanation.includes('criteria satisfied'));
  });

  it('evaluates snapshot with medium defect as READY_WITH_RISK', () => {
    const snapshot = createBaseSnapshot({
      defectSummary: {
        totalDefects: 1,
        openCritical: 0,
        openHigh: 0,
        openMedium: 1,
        openLow: 0,
        resolvedOrClosed: 0,
        verifiedFixed: 0,
        reverificationPending: 0,
        reverificationFailed: 0,
      },
    });
    const result = engine.evaluate({ snapshot });

    assert.equal(result.verdict, 'READY_WITH_RISK');
    assert.equal(result.blockingRules.length, 0);
    assert.equal(result.warningRules.length, 1);
    assert.equal(result.warningRules[0]!.riskCode, POLICY_RULE_CODES.WARN_MEDIUM_DEFECT);
    assert.ok(result.readinessScore! < 100);
  });

  it('evaluates snapshot with flaky tests as READY_WITH_RISK', () => {
    const snapshot = createBaseSnapshot({
      flakinessSummary: {
        flakyTestsDetected: 3,
        flakyExecutionAttempts: 5,
        flakinessRate: 10.0,
      },
    });
    const result = engine.evaluate({ snapshot });

    assert.equal(result.verdict, 'READY_WITH_RISK');
    assert.equal(result.warningRules.length, 1);
    assert.equal(result.warningRules[0]!.riskCode, POLICY_RULE_CODES.WARN_FLAKY_TESTS);
  });

  it('evaluates snapshot with open Critical defect as NOT_READY despite 100% pass rate', () => {
    const snapshot = createBaseSnapshot({
      testExecutionSummary: {
        totalDistinctTests: 100,
        totalExecutionAttempts: 100,
        passedCount: 100,
        failedCount: 0,
        blockedCount: 0,
        automationErrorCount: 0,
        cancelledCount: 0,
        passPercentage: 100.0,
        retryCount: 0,
        passedAfterRetryCount: 0,
      },
      defectSummary: {
        totalDefects: 1,
        openCritical: 1,
        openHigh: 0,
        openMedium: 0,
        openLow: 0,
        resolvedOrClosed: 0,
        verifiedFixed: 0,
        reverificationPending: 0,
        reverificationFailed: 0,
      },
    });
    const result = engine.evaluate({ snapshot });

    // CRITICAL INVARIANT: 100% pass percentage NEVER overrides an open Critical defect!
    assert.equal(result.verdict, 'NOT_READY');
    assert.ok(result.blockingRules.some(b => b.ruleCode === POLICY_RULE_CODES.BLOCK_CRITICAL_OPEN_DEFECT));
    assert.ok(result.explanation.includes('failed with 1 active release blocker'));
  });

  it('evaluates snapshot with failed mandatory regression as NOT_READY', () => {
    const snapshot = createBaseSnapshot({
      regressionSummary: {
        totalRetestPlans: 1,
        totalRegressionTests: 15,
        passedRegressionTests: 13,
        failedRegressionTests: 2,
        untestedRegressionTests: 0,
        allMandatoryRegressionsPassed: false,
      },
    });
    const result = engine.evaluate({ snapshot });

    assert.equal(result.verdict, 'NOT_READY');
    assert.ok(result.blockingRules.some(b => b.ruleCode === POLICY_RULE_CODES.BLOCK_MANDATORY_REGRESSION_FAILED));
  });

  it('evaluates unhealthy environment as BLOCKED', () => {
    const snapshot = createBaseSnapshot({
      environmentHealth: {
        status: 'UNHEALTHY',
        issues: ['Database connection pool exhausted'],
        details: {},
      },
    });
    const result = engine.evaluate({ snapshot });

    assert.equal(result.verdict, 'BLOCKED');
    assert.ok(result.blockingRules.some(b => b.ruleCode === POLICY_RULE_CODES.BLOCK_ENVIRONMENT_PROHIBITED));
    assert.ok(result.explanation.includes('blocked by 1 critical blocking factor'));
  });

  it('evaluates blocked test executions as BLOCKED', () => {
    const snapshot = createBaseSnapshot({
      testExecutionSummary: {
        totalDistinctTests: 10,
        totalExecutionAttempts: 10,
        passedCount: 8,
        failedCount: 0,
        blockedCount: 2,
        automationErrorCount: 0,
        cancelledCount: 0,
        passPercentage: 80.0,
        retryCount: 0,
        passedAfterRetryCount: 0,
      },
    });
    const result = engine.evaluate({ snapshot });

    assert.equal(result.verdict, 'BLOCKED');
    assert.ok(result.blockingRules.some(b => b.ruleCode === POLICY_RULE_CODES.BLOCK_EXECUTION_BLOCKED));
  });

  it('evaluates empty snapshot with 0 tests and 0 reqs as UNKNOWN', () => {
    const snapshot = createBaseSnapshot({
      requirementSummary: {
        total: 0,
        testable: 0,
        covered: 0,
        verified: 0,
        uncovered: 0,
        failing: 0,
        blocked: 0,
        coveragePercentage: 0,
        verifiedPercentage: 0,
      },
      testExecutionSummary: {
        totalDistinctTests: 0,
        totalExecutionAttempts: 0,
        passedCount: 0,
        failedCount: 0,
        blockedCount: 0,
        automationErrorCount: 0,
        cancelledCount: 0,
        passPercentage: 0,
        retryCount: 0,
        passedAfterRetryCount: 0,
      },
    });
    const result = engine.evaluate({ snapshot });

    assert.equal(result.verdict, 'UNKNOWN');
    assert.equal(result.readinessScore, null);
    assert.ok(result.explanation.includes('Insufficient execution or requirement data'));
  });
});
