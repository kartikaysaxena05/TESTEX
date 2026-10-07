/**
 * @file packages/core/src/failures/separation/domain-separation-rules-engine.test.ts
 * Unit tests for DomainSeparationRulesEngine (V6 Phase 80).
 */

import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { DomainSeparationRulesEngine } from './domain-separation-rules-engine.js';
import type { DomainSeparationFacts } from './separation-types.js';

function createBaseFacts(overrides: Partial<DomainSeparationFacts> = {}): DomainSeparationFacts {
  return {
    projectId: crypto.randomUUID(),
    failureCaseId: crypto.randomUUID(),
    testCaseId: crypto.randomUUID(),
    testCaseTitle: 'User Checkout Flow',
    testCaseVersionNumber: 1,
    testRunId: crypto.randomUUID(),
    executionId: crypto.randomUUID(),
    failureSummary: 'Step 3 failed',
    errorCode: null,
    errorMessage: null,
    failureSignature: 'sig-test-123',
    stepIndex: 3,
    evidenceItems: [
      {
        id: crypto.randomUUID(),
        artifactType: 'SCREENSHOT',
        logicalName: 'failure_screenshot.png',
        integrityStatus: 'VALID',
        sha256: 'abc123sha256',
      },
    ],
    reproduction: null,
    classification: null,
    decisionIntegrity: null,
    flakiness: null,
    executionMetadata: null,
    ...overrides,
  };
}

test('DomainSeparationRulesEngine (Phase 80)', async t => {
  const engine = new DomainSeparationRulesEngine();

  await t.test(
    '1. Application Defect Candidate: clean assertion mismatch with healthy browser and environment',
    () => {
      const facts = createBaseFacts({
        errorCode: 'ERR_ASSERTION_MISMATCH',
        errorMessage: 'Expected "Total: $100.00" but received "Total: $0.00"',
        executionMetadata: {
          assertionFailure: {
            expected: 'Total: $100.00',
            actual: 'Total: $0.00',
            operator: 'equals',
          },
        },
        classification: {
          id: crypto.randomUUID(),
          category: 'APPLICATION_FAILURE',
          subcategory: 'ASSERTION_MISMATCH',
          primaryRuleId: 'RULE_ASSERTION_MISMATCH',
          isAuthoritative: true,
        },
        reproduction: {
          id: crypto.randomUUID(),
          attemptNumber: 1,
          status: 'REPRODUCED',
          environmentEquivalence: 'EXACT',
          isSignatureMatch: true,
          isFailedStepMatch: true,
        },
      });

      const result = engine.evaluate(facts);

      assert.strictEqual(result.domain, 'APPLICATION_DEFECT_CANDIDATE');
      assert.ok(result.matchedRuleIds.includes('RULE_APPLICATION_DEFECT_EXCLUSIONS_PASSED'));
      assert.ok(result.excludedDomains.includes('AUTOMATION_FAILURE'));
      assert.ok(result.excludedDomains.includes('ENVIRONMENT_FAILURE'));
      assert.ok(result.excludedDomains.includes('TEST_DATA_FAILURE'));
      assert.ok(result.exclusionReasons.AUTOMATION_FAILURE);
      assert.ok(
        result.decisionExplanation.includes('Selected Domain: APPLICATION_DEFECT_CANDIDATE'),
      );
    },
  );

  await t.test(
    '2. Automation Failure: browser crash takes precedence over application mismatch',
    () => {
      const facts = createBaseFacts({
        errorMessage:
          'Target page, context or browser has been closed: Browser crashed unexpectedly',
        executionMetadata: {
          browserCrash: true,
        },
      });

      const result = engine.evaluate(facts);

      assert.strictEqual(result.domain, 'AUTOMATION_FAILURE');
      assert.strictEqual(result.domainSubreason, 'BROWSER_CRASH');
      assert.ok(result.excludedDomains.includes('APPLICATION_DEFECT_CANDIDATE'));
      assert.ok(result.exclusionReasons.APPLICATION_DEFECT_CANDIDATE);
    },
  );

  await t.test('3. Automation Failure: invalid locator syntax / ambiguous selector refusal', () => {
    const facts = createBaseFacts({
      errorMessage: 'Error: strict mode violation: locator("button") resolved to 3 elements',
      executionMetadata: {
        locatorFailure: {
          selector: 'button',
          isAmbiguous: true,
          isElementMissingInDom: false,
        },
      },
    });

    const result = engine.evaluate(facts);

    assert.strictEqual(result.domain, 'AUTOMATION_FAILURE');
    assert.strictEqual(result.domainSubreason, 'AMBIGUOUS_LOCATOR');
  });

  await t.test('4. Environment Failure: target baseUrl unreachable with ECONNREFUSED', () => {
    const facts = createBaseFacts({
      errorCode: 'ERR_CONNECTION_REFUSED',
      errorMessage: 'connect ECONNREFUSED 127.0.0.1:8080',
      executionMetadata: {
        environmentDiagnostics: {
          isTargetUnreachable: true,
          isDnsFailure: false,
        },
      },
    });

    const result = engine.evaluate(facts);

    assert.strictEqual(result.domain, 'ENVIRONMENT_FAILURE');
    assert.strictEqual(result.domainSubreason, 'TARGET_UNREACHABLE');
    assert.ok(result.excludedDomains.includes('APPLICATION_DEFECT_CANDIDATE'));
  });

  await t.test('5. Test-Data Failure: missing required test fixture record', () => {
    const facts = createBaseFacts({
      errorMessage: 'Precondition error: required fixture missing for test account #99',
      executionMetadata: {
        testDataProvenance: {
          fixtureName: 'user_fixture_premium',
          isFixtureMissing: true,
        },
      },
    });

    const result = engine.evaluate(facts);

    assert.strictEqual(result.domain, 'TEST_DATA_FAILURE');
    assert.strictEqual(result.domainSubreason, 'MISSING_TEST_DATA_FIXTURE');
    assert.ok(result.excludedDomains.includes('APPLICATION_DEFECT_CANDIDATE'));
  });

  await t.test('6. Blocked: blocked when Phase 78 decision integrity is BLOCKED', () => {
    const facts = createBaseFacts({
      decisionIntegrity: {
        id: crypto.randomUUID(),
        decisionState: 'BLOCKED',
        evidenceFreshnessState: 'CURRENT',
        consistencyState: 'INCONSISTENT',
        arbitrationState: 'CONFLICTED',
        blockingReasons: ['Browser process crash contradicts application logic failure.'],
      },
    });

    const result = engine.evaluate(facts);

    assert.strictEqual(result.domain, 'BLOCKED');
    assert.strictEqual(result.domainSubreason, 'DECISION_INTEGRITY_BLOCKED');
    assert.ok(result.matchedRuleIds.includes('RULE_BLOCKED_BY_DECISION_INTEGRITY'));
  });

  await t.test('7. Unknown: zero evidence and zero diagnostic telemetry', () => {
    const facts = createBaseFacts({
      evidenceItems: [],
      errorMessage: null,
      errorCode: null,
      failureSummary: null,
    });

    const result = engine.evaluate(facts);

    assert.strictEqual(result.domain, 'UNKNOWN');
    assert.strictEqual(result.domainSubreason, 'INSUFFICIENT_EVIDENCE');
  });

  await t.test(
    '8. Flaky Application Behavior: confirmed flaky does not collapse to automation failure',
    () => {
      const facts = createBaseFacts({
        errorCode: 'ERR_ASSERTION_MISMATCH',
        errorMessage: 'Expected "Status: READY" but received "Status: PENDING"',
        executionMetadata: {
          assertionFailure: {
            expected: 'Status: READY',
            actual: 'Status: PENDING',
            operator: 'equals',
          },
        },
        flakiness: {
          id: crypto.randomUUID(),
          flakinessState: 'CONFIRMED_FLAKY',
          stabilityState: 'INTERMITTENT',
          flakinessScore: 0.8,
          passRate: 0.4,
        },
      });

      const result = engine.evaluate(facts);

      // Flakiness in application race condition remains an Application Defect Candidate
      assert.strictEqual(result.domain, 'APPLICATION_DEFECT_CANDIDATE');
      assert.ok(result.decisionExplanation.includes('CONFIRMED_FLAKY'));
    },
  );
});
