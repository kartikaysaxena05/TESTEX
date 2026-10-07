/**
 * @file packages/core/src/failures/bug-report/bug-report-eligibility.test.ts
 * Unit tests for BugReportEligibilityEvaluator (V6 Phase 87).
 *
 * Enforces the core invariant: A failed test execution (FAILED) does NOT automatically mean a software application defect.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { BugReportEligibilityEvaluator } from './bug-report-eligibility-evaluator.js';
import type { StructuredBugReportFacts } from './bug-report-types.js';

function createMockFacts(
  overrides: Partial<StructuredBugReportFacts> = {},
): StructuredBugReportFacts {
  return {
    projectId: '11111111-1111-1111-1111-111111111111',
    failureCaseId: '22222222-2222-2222-2222-222222222222',
    failureCase: {
      id: '22222222-2222-2222-2222-222222222222',
      projectId: '11111111-1111-1111-1111-111111111111',
      executionId: '33333333-3333-3333-3333-333333333333',
      title: 'Checkout payment submission fails',
      failureSummary: 'Button clicked but 500 returned',
      status: 'OPEN',
      createdAt: new Date('2026-09-08T10:00:00Z'),
      updatedAt: new Date('2026-09-08T10:00:00Z'),
    },
    project: {
      id: '11111111-1111-1111-1111-111111111111',
      key: 'ECOM',
      name: 'E-Commerce App',
    },
    testExecution: {
      id: '33333333-3333-3333-3333-333333333333',
      testCaseId: 'tc-checkout',
      testCaseVersionNumber: 1,
      status: 'FAILED',
      errorMessage: 'Expected 200 OK but received 500 Internal Server Error',
      errorStack: null,
      startedAt: new Date('2026-09-08T09:59:00Z'),
      completedAt: new Date('2026-09-08T10:00:00Z'),
      environmentId: 'env-prod-like',
      stepExecutions: [],
    },
    evidenceReferences: [],
    ...overrides,
  };
}

test('BugReportEligibilityEvaluator Test Suite', async t => {
  const evaluator = new BugReportEligibilityEvaluator();

  await t.test('evaluates CONFIRMED_APPLICATION_DEFECT when domain candidate is reproduced', () => {
    const facts = createMockFacts({
      domainSeparation: {
        domain: 'APPLICATION_DEFECT_CANDIDATE',
        rationale: 'Backend server 500 returned on valid input',
        confidenceScore: 0.95,
      },
      reproductionSummary: {
        status: 'REPRODUCED',
        attemptCount: 3,
        reproducedCount: 3,
        environmentalSensitivity: null,
      },
    });

    const result = evaluator.evaluateEligibility(facts);
    assert.equal(result.defectState, 'CONFIRMED_APPLICATION_DEFECT');
    assert.equal(result.isApplicationDefect, true);
    assert.ok(result.eligibilityReason.includes('Autonomous reproduction verified'));
  });

  await t.test(
    'evaluates SUPPORTED_APPLICATION_DEFECT when candidate is not yet reproduced',
    () => {
      const facts = createMockFacts({
        domainSeparation: {
          domain: 'APPLICATION_DEFECT_CANDIDATE',
          rationale: 'Assertion failure on UI text',
          confidenceScore: 0.85,
        },
        reproductionSummary: {
          status: 'NOT_REPRODUCED',
          attemptCount: 1,
          reproducedCount: 0,
          environmentalSensitivity: null,
        },
      });

      const result = evaluator.evaluateEligibility(facts);
      assert.equal(result.defectState, 'SUPPORTED_APPLICATION_DEFECT');
      assert.equal(result.isApplicationDefect, true);
      assert.ok(
        result.eligibilityReason.includes('Evidence strongly supports an application defect'),
      );
    },
  );

  await t.test('evaluates AUTOMATION_FAILURE when test harness or locator failed', () => {
    const facts = createMockFacts({
      domainSeparation: {
        domain: 'AUTOMATION_FAILURE',
        rationale: 'Selector button#nonexistent was not found',
        confidenceScore: 0.9,
      },
    });

    const result = evaluator.evaluateEligibility(facts);
    assert.equal(result.defectState, 'AUTOMATION_FAILURE');
    assert.equal(result.isApplicationDefect, false);
    assert.ok(result.eligibilityReason.includes('not the application under test'));
  });

  await t.test('evaluates TEST_DATA_FAILURE when fixture data was missing', () => {
    const facts = createMockFacts({
      domainSeparation: {
        domain: 'TEST_DATA_FAILURE',
        rationale: 'User user_1234 did not exist in database seed',
        confidenceScore: 0.92,
      },
    });

    const result = evaluator.evaluateEligibility(facts);
    assert.equal(result.defectState, 'TEST_DATA_FAILURE');
    assert.equal(result.isApplicationDefect, false);
    assert.ok(result.eligibilityReason.includes('test data fixtures'));
  });

  await t.test('evaluates ENVIRONMENT_FAILURE when network or infrastructure died', () => {
    const facts = createMockFacts({
      domainSeparation: {
        domain: 'ENVIRONMENT_FAILURE',
        rationale: 'ECONNREFUSED connecting to target host',
        confidenceScore: 0.98,
      },
    });

    const result = evaluator.evaluateEligibility(facts);
    assert.equal(result.defectState, 'ENVIRONMENT_FAILURE');
    assert.equal(result.isApplicationDefect, false);
    assert.ok(result.eligibilityReason.includes('environment downtime'));
  });

  await t.test('evaluates FLAKY_UNSTABLE_FAILURE when flakiness state is confirmed', () => {
    const facts = createMockFacts({
      flakiness: {
        flakinessState: 'CONFIRMED_FLAKY',
        overallScore: 0.8,
        isFlaky: true,
      },
    });

    const result = evaluator.evaluateEligibility(facts);
    assert.equal(result.defectState, 'FLAKY_UNSTABLE_FAILURE');
    assert.equal(result.isApplicationDefect, false);
    assert.ok(result.eligibilityReason.includes('non-deterministic execution behavior'));
  });

  await t.test('evaluates BLOCKED when execution was blocked', () => {
    const facts = createMockFacts({
      testExecution: {
        id: 'exec-blocked',
        testCaseId: 'tc-1',
        testCaseVersionNumber: 1,
        status: 'BLOCKED',
        errorMessage: 'Preconditions not met',
        errorStack: null,
        startedAt: new Date(),
        completedAt: null,
        environmentId: null,
        stepExecutions: [],
      },
    });

    const result = evaluator.evaluateEligibility(facts);
    assert.equal(result.defectState, 'BLOCKED');
    assert.equal(result.isApplicationDefect, false);
  });

  await t.test('evaluates INCONCLUSIVE when domain is inconclusive', () => {
    const facts = createMockFacts({
      domainSeparation: {
        domain: 'INCONCLUSIVE',
        rationale: 'Conflicting network and locator signals',
        confidenceScore: 0.4,
      },
    });

    const result = evaluator.evaluateEligibility(facts);
    assert.equal(result.defectState, 'INCONCLUSIVE');
    assert.equal(result.isApplicationDefect, false);
  });

  await t.test('evaluates UNKNOWN when no prior domain facts are recorded', () => {
    const facts = createMockFacts();
    const result = evaluator.evaluateEligibility(facts);
    assert.equal(result.defectState, 'UNKNOWN');
    assert.equal(result.isApplicationDefect, false);
  });
});
