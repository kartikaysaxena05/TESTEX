/**
 * @file packages/core/src/failures/impact/severity-rules-engine.test.ts
 * Unit tests for deterministic technical defect severity evaluation (Phase 84).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SeverityRulesEngine, SEVERITY_RULE_IDS } from './severity-rules-engine.js';
import type { ImpactRawFacts } from './impact-types.js';

function createMockFacts(overrides: Partial<ImpactRawFacts> = {}): ImpactRawFacts {
  return {
    projectId: 'proj-123',
    failureCaseId: 'fc-123',
    testCaseId: 'tc-123',
    testCaseVersionNumber: 1,

    failureTitle: 'User Checkout Failed',
    failureErrorMessage: 'Unhandled exception in checkout pipeline',
    executionStatus: 'FAILED',
    executionErrorMessage: null,
    browserEngine: 'chromium',
    environmentType: 'STAGING',

    testCaseTitle: 'Standard Checkout Flow',
    testCasePriority: 'HIGH',
    requirementId: 'req-123',
    requirementKey: 'REQ-CHECKOUT',
    requirementTitle: 'Payment & Checkout',
    requirementCriticality: 'HIGH',

    evidenceArtifactCount: 2,
    hasConsoleErrors: false,
    consoleErrorSnippets: [],
    hasNetworkFailures: false,
    failedHttpEndpoints: [],
    hasDomSnapshot: true,
    evidenceItemReferences: [],

    isReproductionAttempted: true,
    isReproducible: true,
    reproductionRate: 1.0,
    reproductionEnvironmentDrift: false,

    classificationCategory: 'APPLICATION_FAILURE',
    classificationRuleId: 'RULE_SERVER_ERROR',
    isIntegrityBlocked: null,

    isFlaky: false,
    flakinessScore: 0.0,

    domain: 'APPLICATION_DEFECT_CANDIDATE',
    domainSubreason: 'CheckoutService',

    technicalLayer: 'BACKEND_API',
    technicalTargetType: 'HTTP_ENDPOINT',
    technicalTargetIdentifier: '/api/v1/checkout',
    matchedFilePath: 'src/checkout.ts',
    httpStatusCode: 500,
    httpEndpoint: '/api/v1/checkout',

    aiCategory: 'APPLICATION_FAILURE',
    aiConfidenceLevel: 'HIGH',
    aiAgreementState: 'AGREES',

    rootCauseStatus: 'SUPPORTED_HYPOTHESIS',
    rootCauseProbableLayer: 'BACKEND',
    rootCauseProbableComponent: 'PaymentGateway',
    rootCauseProbableCause: 'Payment gateway rejected payload',
    repositoryContextAvailable: true,

    environmentOverride: null,
    releaseBlockingOverride: null,
    ...overrides,
  };
}

test('SeverityRulesEngine: Deterministic Severity Evaluation', async t => {
  const engine = new SeverityRulesEngine();

  await t.test('1. Non-Application / Operational failures evaluate to NOT_APPLICABLE', () => {
    const facts = createMockFacts({
      domain: 'AUTOMATION_FAILURE',
      domainSubreason: 'ElementSelectorNotFound',
    });

    const result = engine.evaluate(facts);
    assert.equal(result.severity, 'NOT_APPLICABLE');
    assert.equal(result.ruleId, SEVERITY_RULE_IDS.SEV_NON_APP_FAILURE);
    assert.ok(result.rationale.includes('not applicable'));
    assert.equal(result.supportingEvidence.length, 1);
  });

  await t.test(
    '2. Insufficient diagnostic evidence evaluates to UNKNOWN (no worst-case inflation)',
    () => {
      const facts = createMockFacts({
        failureTitle: 'Unknown Error',
        failureErrorMessage: null,
        executionErrorMessage: null,
        evidenceArtifactCount: 0,
        classificationCategory: null,
        consoleErrorSnippets: [],
        failedHttpEndpoints: [],
      });

      const result = engine.evaluate(facts);
      assert.equal(result.severity, 'UNKNOWN');
      assert.equal(result.ruleId, SEVERITY_RULE_IDS.SEV_UNKNOWN_INSUFFICIENT_EVIDENCE);
      assert.ok(result.rationale.includes('Insufficient diagnostic evidence'));
    },
  );

  await t.test('3. Critical security authorization bypass evaluates to CRITICAL', () => {
    const facts = createMockFacts({
      failureErrorMessage:
        'Security control bypass: unauthorized privilege escalation detected in JWT token validation',
      technicalLayer: 'AUTHENTICATION',
    });

    const result = engine.evaluate(facts);
    assert.equal(result.severity, 'CRITICAL');
    assert.equal(result.ruleId, SEVERITY_RULE_IDS.SEV_CRITICAL_SECURITY_BYPASS);
  });

  await t.test('4. Critical data corruption evaluates to CRITICAL', () => {
    const facts = createMockFacts({
      failureErrorMessage:
        'Fatal database error: irreversible data corruption in customer financial balance table',
    });

    const result = engine.evaluate(facts);
    assert.equal(result.severity, 'CRITICAL');
    assert.equal(result.ruleId, SEVERITY_RULE_IDS.SEV_CRITICAL_DATA_CORRUPTION);
  });

  await t.test('5. Total outage of critical core capability evaluates to CRITICAL', () => {
    const facts = createMockFacts({
      failureErrorMessage:
        'system-wide outage: essential functionality completely unusable across all regions',
      requirementCriticality: 'CRITICAL',
    });

    const result = engine.evaluate(facts);
    assert.equal(result.severity, 'CRITICAL');
    assert.equal(result.ruleId, SEVERITY_RULE_IDS.SEV_CRITICAL_TOTAL_OUTAGE);
  });

  await t.test('6. High criticality requirement failure with HTTP 500 evaluates to HIGH', () => {
    const facts = createMockFacts({
      requirementCriticality: 'HIGH',
      httpStatusCode: 500,
      failureErrorMessage: 'Internal Server Error 500 during order checkout processing',
    });

    const result = engine.evaluate(facts);
    assert.equal(result.severity, 'HIGH');
    assert.equal(result.ruleId, SEVERITY_RULE_IDS.SEV_HIGH_MAJOR_WORKFLOW_BLOCKED);
  });

  await t.test('7. Minor cosmetic discrepancy evaluates to LOW', () => {
    const facts = createMockFacts({
      failureTitle: 'Button label margin alignment variance',
      failureErrorMessage:
        'Expected button font size 14px but found margin alignment discrepancy of 2px',
      requirementCriticality: 'LOW',
      testCasePriority: 'LOW',
      httpStatusCode: null,
      technicalLayer: 'FRONTEND',
    });

    const result = engine.evaluate(facts);
    assert.equal(result.severity, 'LOW');
    assert.equal(result.ruleId, SEVERITY_RULE_IDS.SEV_LOW_COSMETIC_MINOR);
  });

  await t.test('8. Partial functional impairment evaluates to MEDIUM', () => {
    const facts = createMockFacts({
      failureTitle: 'Profile Avatar Filter Dropdown Mismatch',
      failureErrorMessage:
        'Expected filter option "Recent" to appear first, but list was alphabetically sorted',
      requirementCriticality: 'MEDIUM',
      testCasePriority: 'MEDIUM',
      httpStatusCode: 200,
    });

    const result = engine.evaluate(facts);
    assert.equal(result.severity, 'MEDIUM');
    assert.equal(result.ruleId, SEVERITY_RULE_IDS.SEV_MEDIUM_PARTIAL_WORKFLOW);
  });
});
