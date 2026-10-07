/**
 * @file packages/core/src/failures/impact/priority-rules-engine.test.ts
 * Unit tests for deterministic resolution priority evaluation (Phase 84).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { PriorityRulesEngine, PRIORITY_RULE_IDS } from './priority-rules-engine.js';
import type { ImpactRawFacts } from './impact-types.js';

function createMockFacts(overrides: Partial<ImpactRawFacts> = {}): ImpactRawFacts {
  return {
    projectId: 'proj-123',
    failureCaseId: 'fc-123',
    testCaseId: 'tc-123',
    testCaseVersionNumber: 1,

    failureTitle: 'Checkout Failed',
    failureErrorMessage: 'Failure occurred during execution',
    executionStatus: 'FAILED',
    executionErrorMessage: null,
    browserEngine: 'chromium',
    environmentType: 'STAGING',

    testCaseTitle: 'Standard Checkout Flow',
    testCasePriority: 'HIGH',
    requirementId: 'req-123',
    requirementKey: 'REQ-CHECKOUT',
    requirementTitle: 'Checkout Requirement',
    requirementCriticality: 'HIGH',

    evidenceArtifactCount: 1,
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
    domainSubreason: null,

    technicalLayer: 'BACKEND_API',
    technicalTargetType: null,
    technicalTargetIdentifier: null,
    matchedFilePath: null,
    httpStatusCode: 500,
    httpEndpoint: null,

    aiCategory: 'APPLICATION_FAILURE',
    aiConfidenceLevel: 'HIGH',
    aiAgreementState: 'AGREES',

    rootCauseStatus: null,
    rootCauseProbableLayer: null,
    rootCauseProbableComponent: null,
    rootCauseProbableCause: null,
    repositoryContextAvailable: true,

    environmentOverride: null,
    releaseBlockingOverride: null,
    ...overrides,
  };
}

test('PriorityRulesEngine: Deterministic Priority & Architectural Separation', async t => {
  const engine = new PriorityRulesEngine();

  await t.test('1. Production critical failure evaluates to P0_IMMEDIATE', () => {
    const facts = createMockFacts({
      environmentType: 'PRODUCTION',
    });

    const result = engine.evaluate(facts, 'CRITICAL');
    assert.equal(result.priority, 'P0_IMMEDIATE');
    assert.equal(result.ruleId, PRIORITY_RULE_IDS.PRI_P0_IMMEDIATE_BLOCKER);
  });

  await t.test(
    '2. Release-blocking override elevates HIGH severity to P0_IMMEDIATE in production',
    () => {
      const facts = createMockFacts({
        environmentType: 'PRODUCTION',
        releaseBlockingOverride: true,
      });

      const result = engine.evaluate(facts, 'HIGH');
      assert.equal(result.priority, 'P0_IMMEDIATE');
      assert.equal(result.ruleId, PRIORITY_RULE_IDS.PRI_P0_IMMEDIATE_BLOCKER);
    },
  );

  await t.test('3. High severity reproducible staging defect evaluates to P1_URGENT', () => {
    const facts = createMockFacts({
      environmentType: 'STAGING',
      isReproducible: true,
    });

    const result = engine.evaluate(facts, 'HIGH');
    assert.equal(result.priority, 'P1_URGENT');
    assert.equal(result.ruleId, PRIORITY_RULE_IDS.PRI_P1_URGENT);
  });

  await t.test(
    '4. Medium severity with release-blocking override evaluates to P1_URGENT (Severity != Priority)',
    () => {
      const facts = createMockFacts({
        environmentType: 'STAGING',
        releaseBlockingOverride: true,
      });

      // Proves severity and priority are independently evaluated!
      const result = engine.evaluate(facts, 'MEDIUM');
      assert.equal(result.priority, 'P1_URGENT');
      assert.equal(result.ruleId, PRIORITY_RULE_IDS.PRI_P1_URGENT);
    },
  );

  await t.test('5. Standard medium severity defect evaluates to P2_NORMAL', () => {
    const facts = createMockFacts({
      environmentType: 'STAGING',
      testCasePriority: 'NORMAL',
      requirementCriticality: 'MEDIUM',
    });

    const result = engine.evaluate(facts, 'MEDIUM');
    assert.equal(result.priority, 'P2_NORMAL');
    assert.equal(result.ruleId, PRIORITY_RULE_IDS.PRI_P2_NORMAL);
  });

  await t.test('6. Low severity cosmetic defect evaluates to P3_LOW', () => {
    const facts = createMockFacts({
      environmentType: 'STAGING',
    });

    const result = engine.evaluate(facts, 'LOW');
    assert.equal(result.priority, 'P3_LOW');
    assert.equal(result.ruleId, PRIORITY_RULE_IDS.PRI_P3_LOW);
  });

  await t.test(
    '7. Operational test failure triaged to P3_LOW without release-blocking flag',
    () => {
      const facts = createMockFacts({
        domain: 'TEST_DATA_FAILURE',
        domainSubreason: 'MissingSeedUser',
      });

      const result = engine.evaluate(facts, 'NOT_APPLICABLE');
      assert.equal(result.priority, 'P3_LOW');
      assert.ok(result.rationale.includes('TEST_DATA_FAILURE'));
    },
  );

  await t.test(
    '8. Insufficient evidence evaluates truthfully to UNKNOWN (no inflation to P0)',
    () => {
      const facts = createMockFacts({
        failureErrorMessage: null,
        executionErrorMessage: null,
        evidenceArtifactCount: 0,
        classificationCategory: null,
      });

      const result = engine.evaluate(facts, 'UNKNOWN');
      assert.equal(result.priority, 'UNKNOWN');
      assert.equal(result.ruleId, PRIORITY_RULE_IDS.PRI_UNKNOWN_INSUFFICIENT_EVIDENCE);
    },
  );
});
