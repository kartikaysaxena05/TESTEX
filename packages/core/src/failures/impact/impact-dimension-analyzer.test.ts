/**
 * @file packages/core/src/failures/impact/impact-dimension-analyzer.test.ts
 * Unit tests for multi-dimensional impact analysis (Phase 84).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ImpactDimensionAnalyzer } from './impact-dimension-analyzer.js';
import type { ImpactRawFacts } from './impact-types.js';

function createMockFacts(overrides: Partial<ImpactRawFacts> = {}): ImpactRawFacts {
  return {
    projectId: 'proj-123',
    failureCaseId: 'fc-123',
    testCaseId: 'tc-123',
    testCaseVersionNumber: 1,

    failureTitle: 'User Profile Update Failed',
    failureErrorMessage: 'Mutation failed with database error',
    executionStatus: 'FAILED',
    executionErrorMessage: null,
    browserEngine: 'chromium',
    environmentType: 'STAGING',

    testCaseTitle: 'Profile Save Flow',
    testCasePriority: 'HIGH',
    requirementId: 'req-123',
    requirementKey: 'REQ-PROFILE',
    requirementTitle: 'Profile Management',
    requirementCriticality: 'HIGH',

    evidenceArtifactCount: 2,
    hasConsoleErrors: false,
    consoleErrorSnippets: [],
    hasNetworkFailures: true,
    failedHttpEndpoints: [{ url: '/api/v1/profile', method: 'PUT', statusCode: 500 }],
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
    httpEndpoint: '/api/v1/profile',

    aiCategory: 'APPLICATION_FAILURE',
    aiConfidenceLevel: 'HIGH',
    aiAgreementState: 'AGREES',

    rootCauseStatus: 'SUPPORTED_HYPOTHESIS',
    rootCauseProbableLayer: 'BACKEND',
    rootCauseProbableComponent: 'UserService',
    rootCauseProbableCause: 'Database connection dropped during profile update',
    repositoryContextAvailable: true,

    environmentOverride: null,
    releaseBlockingOverride: null,
    ...overrides,
  };
}

test('ImpactDimensionAnalyzer: Multi-Dimensional Impact & Release Recommendation', async t => {
  const analyzer = new ImpactDimensionAnalyzer();

  await t.test('1. Correctly distinguishes Data Impact types without collapsing them', () => {
    // Scenario G: Factual distinction between display, write failure, data corruption, and data loss
    const displayFacts = createMockFacts({
      failureTitle: 'Product rating display rounding mismatch',
      failureErrorMessage: 'Expected display to render 4.5 stars but rendered 4 stars',
    });
    const displayRes = analyzer.analyze(displayFacts, 'LOW', 'P3_LOW');
    assert.equal(displayRes.dataImpact, 'DISPLAY_ONLY');

    const writeFacts = createMockFacts({
      failureTitle: 'Order Save POST request failed',
      failureErrorMessage: 'Failed to save mutation payload over HTTP POST',
    });
    const writeRes = analyzer.analyze(writeFacts, 'HIGH', 'P1_URGENT');
    assert.equal(writeRes.dataImpact, 'FAILED_WRITE');

    const corruptFacts = createMockFacts({
      failureTitle: 'Customer session corrupted in redis cache',
      failureErrorMessage: 'Corrupt state foreign key constraint error in persistence ledger',
    });
    const corruptRes = analyzer.analyze(corruptFacts, 'CRITICAL', 'P0_IMMEDIATE');
    assert.equal(corruptRes.dataImpact, 'DATA_CORRUPTION');

    const lossFacts = createMockFacts({
      failureTitle: 'Document permanent deletion on save',
      failureErrorMessage: 'Irreversible data loss: record deleted permanently from cluster',
    });
    const lossRes = analyzer.analyze(lossFacts, 'CRITICAL', 'P0_IMMEDIATE');
    assert.equal(lossRes.dataImpact, 'DATA_LOSS');
  });

  await t.test('2. Correctly flags security bypass conditions', () => {
    const authBypassFacts = createMockFacts({
      failureTitle: 'Unauthenticated user accessed admin settings',
      failureErrorMessage: 'Authentication bypass detected on protected route /admin/keys',
    });
    const res = analyzer.analyze(authBypassFacts, 'CRITICAL', 'P0_IMMEDIATE');
    assert.equal(res.securityImpact, 'AUTHENTICATION_BYPASS');
    assert.equal(res.blastRadius, 'PROJECT_WIDE');
  });

  await t.test('3. Evaluates release recommendation deterministically', () => {
    // Critical severity blocks release
    const critFacts = createMockFacts();
    const critRes = analyzer.analyze(critFacts, 'CRITICAL', 'P0_IMMEDIATE');
    assert.equal(critRes.releaseRecommendation, 'BLOCK_RELEASE');

    // High severity without workaround blocks release
    const highNoWorkaround = createMockFacts();
    const highRes = analyzer.analyze(highNoWorkaround, 'HIGH', 'P1_URGENT');
    assert.equal(highRes.releaseRecommendation, 'BLOCK_RELEASE');

    // Low severity is non-blocking
    const lowFacts = createMockFacts();
    const lowRes = analyzer.analyze(lowFacts, 'LOW', 'P3_LOW');
    assert.equal(lowRes.releaseRecommendation, 'NON_BLOCKING');

    // Operator override takes precedence
    const overrideFacts = createMockFacts({ releaseBlockingOverride: false });
    const overrideRes = analyzer.analyze(overrideFacts, 'CRITICAL', 'P0_IMMEDIATE');
    assert.equal(overrideRes.releaseRecommendation, 'NON_BLOCKING');
  });

  await t.test('4. Identifies conflicting signals between AI and deterministic pipeline', () => {
    const conflictFacts = createMockFacts({
      domain: 'AUTOMATION_FAILURE',
      aiCategory: 'PRODUCT_BUG_HTTP_ERROR',
      isFlaky: true,
      reproductionRate: 1.0,
    });

    const res = analyzer.analyze(conflictFacts, 'NOT_APPLICABLE', 'P3_LOW');
    assert.ok(res.conflictingSignals.length >= 2);
    assert.ok(
      res.conflictingSignals.some(
        s => s.includes('Product Bug') && s.includes('AUTOMATION_FAILURE'),
      ),
    );
    assert.ok(
      res.conflictingSignals.some(s => s.includes('flaky') && s.includes('100% reproduction')),
    );
  });

  await t.test('5. Accurately collects unknown factors when evidence is sparse', () => {
    const sparseFacts = createMockFacts({
      isReproductionAttempted: false,
      evidenceArtifactCount: 0,
      requirementId: null,
      repositoryContextAvailable: false,
    });

    const res = analyzer.analyze(sparseFacts, 'UNKNOWN', 'UNKNOWN');
    assert.equal(res.unknownFactors.length, 4);
    assert.equal(res.releaseRecommendation, 'UNKNOWN');
  });
});
