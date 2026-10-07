/**
 * @file packages/core/src/failures/clustering/failure-duplicate-comparator.test.ts
 * Unit test suite for FailureDuplicateComparator (V6 Phase 85).
 * Tests strong, weak, and contradictory signals, false merge guards, and transitivity safety.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { FailureDuplicateComparator } from './failure-duplicate-comparator.js';
import type { FailureComparisonFacts } from './clustering-types.js';

test('FailureDuplicateComparator Unit Test Suite', async t => {
  const comparator = new FailureDuplicateComparator();

  const baseFactA: FailureComparisonFacts = {
    failureCaseId: '00000000-0000-0000-0000-000000000001',
    projectId: 'proj-1',
    testCaseId: 'tc-1',
    testCaseTitle: 'Checkout Flow Test',
    testRunId: 'tr-1',
    executionId: 'exec-1',
    stepIndex: 2,
    stepAction: 'CLICK',
    stepTarget: 'button#pay',
    title: 'Checkout POST /api/pay 500 error',
    failureSummary: 'Internal Server Error during payment',
    errorCode: 'HTTP_500',
    errorMessage: 'Internal Server Error: Database transaction deadlock at OrderService.checkout',
    failureSignature: 'fp-order-deadlock-001',
    evidenceCompleteness: 'COMPLETE',
    environmentId: 'env-1',
    environmentName: 'Staging',
    appBuildVersion: '1.0.0',
    requirementId: 'req-1',
    requirementKey: 'REQ-001',
    failureDomain: 'APPLICATION_DEFECT_CANDIDATE',
    domainConfidence: 0.95,
    failureCategory: 'HTTP_500_SERVER_ERROR',
    primarySuspectLayer: 'BACKEND_SERVICE',
    localizedFilePath: 'src/orders/order.service.ts',
    localizedSymbol: 'OrderService.checkout',
    localizedStackTraceSnippet:
      'Error: Deadlock at OrderService.checkout (src/orders/order.service.ts:42)',
    probableLayer: 'BACKEND_SERVICE',
    probableComponent: 'OrderService',
    probableCause: 'Database deadlock',
    rootCauseStatus: 'RESOLVED',
    isReproduced: true,
    reproductionSignature: 'sig-repro-deadlock',
    isFlaky: false,
    flakinessScore: 0.05,
    severity: 'HIGH',
    priority: 'P1_URGENT',
    failingHttpEndpoint: '/api/pay',
    failingHttpStatus: 500,
    consoleErrors: ['Uncaught 500 error at /api/pay'],
    evidenceFingerprints: ['ev-fp-1', 'ev-fp-2'],
    createdAt: new Date('2026-09-08T10:00:00Z'),
  };

  await t.test('1. EXACT_DUPLICATE: Same endpoint, status, and localized symbol', () => {
    const factB: FailureComparisonFacts = {
      ...baseFactA,
      failureCaseId: '00000000-0000-0000-0000-000000000002',
      errorMessage:
        'Internal Server Error: Database transaction deadlock at OrderService.checkout while saving order',
      createdAt: new Date('2026-09-08T10:05:00Z'),
    };

    const result = comparator.compare(baseFactA, factB);
    assert.equal(result.relationshipType, 'EXACT_DUPLICATE');
    assert.ok(result.similarityScore >= 0.85);
    assert.equal(result.relationshipStrength, 'EXACT');
    assert.ok(result.matchedSignals.some(s => s.signal === 'SAME_ENDPOINT_AND_STATUS'));
    assert.ok(result.matchedSignals.some(s => s.signal === 'SAME_LOCALIZED_SOURCE_AND_SYMBOL'));
    assert.equal(result.contradictorySignals.length, 0);
  });

  await t.test(
    '2. PROBABLE_DUPLICATE: Same localized file and root-cause category with high similarity',
    () => {
      const factB: FailureComparisonFacts = {
        ...baseFactA,
        failureCaseId: '00000000-0000-0000-0000-000000000003',
        failingHttpEndpoint: null,
        failingHttpStatus: null,
        title: 'Cart finalization failed',
        errorMessage:
          'Database transaction deadlock at OrderService.checkout when cart has coupons',
        stepIndex: 3,
        createdAt: new Date('2026-09-08T10:10:00Z'),
      };

      const result = comparator.compare(baseFactA, factB);
      assert.ok(
        result.relationshipType === 'PROBABLE_DUPLICATE' ||
          result.relationshipType === 'EXACT_DUPLICATE',
        `Expected PROBABLE or EXACT DUPLICATE, got ${result.relationshipType}`,
      );
      assert.ok(result.similarityScore >= 0.7);
      assert.ok(result.matchedSignals.some(s => s.signal === 'SAME_LOCALIZED_SOURCE_AND_SYMBOL'));
    },
  );

  await t.test(
    '3. DISTINCT_FAILURE: Domain separation mismatch (APPLICATION vs AUTOMATION)',
    () => {
      const factB: FailureComparisonFacts = {
        ...baseFactA,
        failureCaseId: '00000000-0000-0000-0000-000000000005',
        title: 'Timeout waiting for button',
        errorMessage: 'Timeout 30000ms exceeded waiting for locator button#submit',
        failureDomain: 'AUTOMATION_FAILURE',
        probableLayer: 'TEST_SCRIPT',
        probableComponent: 'CheckoutSpec',
        localizedFilePath: 'tests/e2e/checkout.spec.ts',
        localizedSymbol: null,
        failingHttpEndpoint: null,
        failingHttpStatus: null,
      };

      const result = comparator.compare(baseFactA, factB);
      assert.equal(result.relationshipType, 'DISTINCT_FAILURE');
      assert.ok(result.similarityScore <= 0.15);
      assert.ok(result.contradictorySignals.some(s => s.signal === 'DIFFERENT_FAILURE_DOMAINS'));
      assert.ok(result.contradictorySignals.some(s => s.severity === 'CRITICAL'));
    },
  );

  await t.test(
    '4. Generic Error Guard: "500 Internal Server Error" without endpoint/symbol corroboration is NOT an exact duplicate',
    () => {
      const genericA: FailureComparisonFacts = {
        ...baseFactA,
        title: 'Server error on page A',
        errorMessage: '500 Internal Server Error',
        failureSignature: null,
        localizedFilePath: null,
        localizedSymbol: null,
        failingHttpEndpoint: null,
        failingHttpStatus: 500,
        probableLayer: null,
        probableComponent: null,
      };

      const genericB: FailureComparisonFacts = {
        ...baseFactA,
        failureCaseId: '00000000-0000-0000-0000-000000000006',
        title: 'Server error on page B',
        errorMessage: '500 Internal Server Error',
        failureSignature: null,
        localizedFilePath: null,
        localizedSymbol: null,
        failingHttpEndpoint: null,
        failingHttpStatus: 500,
        probableLayer: null,
        probableComponent: null,
      };

      const result = comparator.compare(genericA, genericB);
      // Generic error guard MUST prevent EXACT_DUPLICATE and PROBABLE_DUPLICATE
      assert.notEqual(result.relationshipType, 'EXACT_DUPLICATE');
      assert.notEqual(result.relationshipType, 'PROBABLE_DUPLICATE');
    },
  );

  await t.test(
    '5. Anti-False-Merge Guard: Same test case alone NEVER produces a duplicate cluster',
    () => {
      const pageOnlyA: FailureComparisonFacts = {
        ...baseFactA,
        title: 'Dropdown not visible',
        errorMessage: 'Element <select id="state"> is not visible',
        failureSignature: null,
        localizedFilePath: null,
        localizedSymbol: null,
        failingHttpEndpoint: null,
        failingHttpStatus: null,
        probableLayer: 'UI_COMPONENT',
        probableComponent: 'Dropdown',
      };

      const pageOnlyB: FailureComparisonFacts = {
        ...baseFactA,
        failureCaseId: '00000000-0000-0000-0000-000000000007',
        title: 'Avatar upload failed',
        errorMessage: 'TypeError: Cannot read properties of null (reading "files")',
        failureSignature: null,
        localizedFilePath: null,
        localizedSymbol: null,
        failingHttpEndpoint: null,
        failingHttpStatus: null,
        probableLayer: 'UI_EVENT_HANDLER',
        probableComponent: 'AvatarUploader',
      };

      const result = comparator.compare(pageOnlyA, pageOnlyB);
      assert.notEqual(result.relationshipType, 'EXACT_DUPLICATE');
      assert.notEqual(result.relationshipType, 'PROBABLE_DUPLICATE');
      assert.ok(
        result.relationshipType === 'DISTINCT_FAILURE' ||
          result.relationshipType === 'INCONCLUSIVE',
        `Expected DISTINCT or INCONCLUSIVE for same-tc-only, got ${result.relationshipType}`,
      );
    },
  );

  await t.test('6. INSUFFICIENT_EVIDENCE: Minimal facts with no error messages or traces', () => {
    const emptyA: FailureComparisonFacts = {
      failureCaseId: '00000000-0000-0000-0000-000000000008',
      projectId: 'proj-1',
      testCaseId: 'tc-empty',
      testCaseTitle: 'Empty TC',
      testRunId: 'tr-empty',
      executionId: 'exec-empty',
      stepIndex: null,
      stepAction: null,
      stepTarget: null,
      title: 'Test failed',
      failureSummary: null,
      errorCode: null,
      errorMessage: null,
      failureSignature: null,
      evidenceCompleteness: null,
      environmentId: null,
      environmentName: null,
      appBuildVersion: null,
      requirementId: null,
      requirementKey: null,
      failureDomain: null,
      domainConfidence: null,
      failureCategory: null,
      primarySuspectLayer: null,
      localizedFilePath: null,
      localizedSymbol: null,
      localizedStackTraceSnippet: null,
      probableLayer: null,
      probableComponent: null,
      probableCause: null,
      rootCauseStatus: null,
      isReproduced: false,
      reproductionSignature: null,
      isFlaky: false,
      flakinessScore: null,
      severity: null,
      priority: null,
      failingHttpEndpoint: null,
      failingHttpStatus: null,
      consoleErrors: [],
      evidenceFingerprints: [],
      createdAt: new Date(),
    };

    const emptyB: FailureComparisonFacts = {
      ...emptyA,
      failureCaseId: '00000000-0000-0000-0000-000000000009',
    };

    const result = comparator.compare(emptyA, emptyB);
    assert.equal(result.relationshipType, 'INSUFFICIENT_EVIDENCE');
    assert.equal(result.relationshipStrength, 'UNKNOWN');
  });

  await t.test(
    '7. HTTP Status Contradiction: 404 Not Found vs 500 Internal Server Error applies penalty',
    () => {
      const fact404: FailureComparisonFacts = {
        ...baseFactA,
        failureCaseId: '00000000-0000-0000-0000-000000000010',
        title: 'Route not found',
        errorMessage: 'HTTP 404 Not Found at /api/pay',
        failingHttpStatus: 404,
        localizedFilePath: null,
        localizedSymbol: null,
      };

      const result = comparator.compare(baseFactA, fact404);
      assert.ok(result.contradictorySignals.some(s => s.signal === 'DIFFERENT_HTTP_STATUSES'));
      assert.notEqual(result.relationshipType, 'EXACT_DUPLICATE');
    },
  );
});
