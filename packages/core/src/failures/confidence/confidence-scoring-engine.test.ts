/**
 * @file packages/core/src/failures/confidence/confidence-scoring-engine.test.ts
 * Unit tests for ConfidenceScoringEngine (V6 Phase 86).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfidenceScoringEngine } from './confidence-scoring-engine.js';
import { EvidenceAttributionEngine } from './evidence-attribution-engine.js';
import type { ConfidenceEvaluationFacts } from './confidence-types.js';

test('ConfidenceScoringEngine Unit Test Suite', async t => {
  const scoringEngine = new ConfidenceScoringEngine();
  const attributionEngine = new EvidenceAttributionEngine();

  const createBaseFacts = (
    overrides: Partial<ConfidenceEvaluationFacts> = {},
  ): ConfidenceEvaluationFacts => ({
    projectId: '11111111-1111-1111-1111-111111111111',
    failureCaseId: '22222222-2222-2222-2222-222222222222',
    testCaseId: 'tc-1',
    testCaseTitle: 'Authentication Flow',
    testRunId: 'tr-1',
    executionId: 'exec-1',
    failureTitle: 'Login button unresponsive',
    failureSummary: 'Button click did not trigger HTTP request',
    errorCode: 'TIMEOUT_WAIT',
    errorMessage: 'Timed out waiting for selector button#login',
    failureSignature: 'sig-timeout-login',
    caseStatus: 'OPEN',
    caseCreatedAt: new Date('2026-09-08T10:00:00Z'),
    caseUpdatedAt: new Date('2026-09-08T10:00:00Z'),

    evidenceCompleteness: 'COMPLETE',
    evidenceIntegrityStatus: 'VERIFIED',
    evidenceReferences: [
      {
        id: 'ev-1',
        evidenceType: 'SCREENSHOT',
        filePath: 'artifacts/shot.png',
        mimeType: 'image/png',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        byteSize: 10240,
        createdAt: new Date('2026-09-08T10:00:00Z'),
      },
      {
        id: 'ev-2',
        evidenceType: 'CONSOLE_LOGS',
        filePath: 'artifacts/console.log',
        mimeType: 'text/plain',
        sha256: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
        byteSize: 2048,
        createdAt: new Date('2026-09-08T10:00:00Z'),
      },
      {
        id: 'ev-3',
        evidenceType: 'DOM_SNAPSHOT',
        filePath: 'artifacts/dom.html',
        mimeType: 'text/html',
        sha256: '4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce',
        byteSize: 34500,
        createdAt: new Date('2026-09-08T10:00:00Z'),
      },
      {
        id: 'ev-4',
        evidenceType: 'NETWORK_TRACE',
        filePath: 'artifacts/net.har',
        mimeType: 'application/json',
        sha256: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
        byteSize: 51200,
        createdAt: new Date('2026-09-08T10:00:00Z'),
      },
    ],
    hasScreenshot: true,
    hasDomSnapshot: true,
    hasConsoleLogs: true,
    hasNetworkTrace: true,
    hasTraceArchive: false,

    isReproduced: true,
    reproductionStatus: 'REPRODUCED',
    reproductionSignature: 'sig-timeout-login',
    reproductionAttempts: 3,
    reproductionSuccessCount: 3,

    deterministicCategory: 'APPLICATION_FAILURE',
    deterministicConfidence: 0.95,
    classificationRationale: 'Target button present in DOM but disabled by application state',
    decisionIntegrityPassed: true,
    integrityViolations: [],

    isFlaky: false,
    flakinessScore: 0.0,
    flakinessPattern: null,

    failureDomain: 'FRONTEND_APPLICATION',
    domainConfidence: 0.9,
    domainIndicators: ['ui_state_disabled', 'no_network_dispatched'],

    suspectLayer: 'UI_COMPONENT',
    localizedFilePath: 'src/components/LoginForm.tsx',
    localizedSymbol: 'LoginForm.handleSubmit',
    localizedStackTraceSnippet: 'at LoginForm.handleSubmit (src/components/LoginForm.tsx:42)',
    localizedFileExistsInRepo: true,

    aiCategory: 'APPLICATION_FAILURE',
    aiSelfReportedConfidence: 0.92,
    aiCalibratedConfidence: 0.9,
    aiReasoningExplanation: 'Button state machine entered disabled state unexpectedly',
    aiAuditLog: [],

    rootCauseStatus: 'IDENTIFIED',
    probableLayer: 'UI_COMPONENT',
    probableComponent: 'LoginForm',
    probableCause: 'Form validation bug prevents submit button activation',
    rootCauseConfidenceReported: 0.88,
    verifiedRepositoryReferences: ['src/components/LoginForm.tsx'],

    severity: 'HIGH',
    priority: 'P1',
    impactDimensions: [
      { dimension: 'userImpact', score: 0.8, rationale: 'Users cannot log in' },
      { dimension: 'dataImpact', score: 0.2, rationale: 'No data loss' },
    ],

    clusterId: '33333333-3333-3333-3333-333333333333',
    clusterKey: 'cluster-login-button',
    clusterSimilarityScore: 0.95,
    clusterActiveMemberCount: 4,
    isClusterRepresentative: true,

    ...overrides,
  });

  await t.test('High-evidence complete failure produces VERY_HIGH confidence', () => {
    const facts = createBaseFacts();
    const attributions = attributionEngine.extractAttributions(facts);
    const result = scoringEngine.computeConfidence(facts, attributions);

    assert.ok(result.overallConfidence >= 0.8, `Expected >= 0.8, got ${result.overallConfidence}`);
    assert.strictEqual(result.confidenceBand, 'VERY_HIGH');
    assert.strictEqual(result.contradictions.length, 0);
    assert.ok(result.supportingFactors.length > 0);
    assert.strictEqual(result.classificationConfidence, 1.0);
    assert.strictEqual(result.reproducibilityConfidence, 0.95);
    assert.ok(result.duplicateConfidence! >= 0.9);
  });

  await t.test(
    'Unattempted reproduction yields UNKNOWN reproducibility confidence without crashing',
    () => {
      const facts = createBaseFacts({
        reproductionAttempts: 0,
        reproductionSuccessCount: 0,
        isReproduced: false,
        reproductionStatus: null,
        reproductionSignature: null,
      });
      const attributions = attributionEngine.extractAttributions(facts);
      const result = scoringEngine.computeConfidence(facts, attributions);

      assert.strictEqual(result.reproducibilityConfidence, null);
      const reproComp = result.componentBreakdown.find(
        c => c.component === 'REPRODUCTION_STRENGTH',
      );
      assert.ok(reproComp);
      assert.strictEqual(reproComp.missingCount, 1);
    },
  );

  await t.test(
    'Severe contradiction (AI conflicts with deterministic rule) applies penalty',
    () => {
      const facts = createBaseFacts({
        deterministicCategory: 'APPLICATION_FAILURE',
        aiCategory: 'ENVIRONMENT_FAILURE',
        aiSelfReportedConfidence: 0.98,
        aiCalibratedConfidence: 0.95,
      });
      const attributions = attributionEngine.extractAttributions(facts);
      const result = scoringEngine.computeConfidence(facts, attributions);

      assert.ok(result.contradictions.length > 0);
      assert.ok(result.penalties.some(p => p.includes('AI classification diverges')));
      assert.ok(result.overallConfidence < 0.8);
    },
  );

  await t.test('Missing mandatory artifacts penalizes completeness score', () => {
    const facts = createBaseFacts({
      hasScreenshot: false,
      hasConsoleLogs: false,
      evidenceReferences: [],
    });
    const attributions = attributionEngine.extractAttributions(facts);
    const result = scoringEngine.computeConfidence(facts, attributions);

    assert.ok(result.missingFactors.length >= 2);
    const compScore = result.componentBreakdown.find(c => c.component === 'EVIDENCE_COMPLETENESS');
    assert.ok(compScore);
    assert.ok(compScore.score <= 0.5);
  });

  await t.test('Tampered evidence results in 0 integrity score', () => {
    const facts = createBaseFacts({
      evidenceIntegrityStatus: 'TAMPERED',
    });
    const attributions = attributionEngine.extractAttributions(facts);
    const result = scoringEngine.computeConfidence(facts, attributions);

    const integrityComp = result.componentBreakdown.find(c => c.component === 'EVIDENCE_INTEGRITY');
    assert.ok(integrityComp);
    assert.strictEqual(integrityComp.score, 0.0);
    assert.strictEqual(integrityComp.contradictingCount, 1);
  });

  await t.test('Unclustered failure has duplicateConfidence as null (NOT_APPLICABLE)', () => {
    const facts = createBaseFacts({
      clusterId: null,
      clusterKey: null,
      clusterSimilarityScore: null,
      clusterActiveMemberCount: 0,
    });
    const attributions = attributionEngine.extractAttributions(facts);
    const result = scoringEngine.computeConfidence(facts, attributions);

    assert.strictEqual(result.duplicateConfidence, null);
  });

  await t.test('Score bounds clamp strictly to [0.0000, 1.0000]', () => {
    // Extreme contradictions
    const facts = createBaseFacts({
      hasScreenshot: false,
      hasConsoleLogs: false,
      hasDomSnapshot: false,
      hasNetworkTrace: false,
      isReproduced: false,
      reproductionAttempts: 10,
      reproductionSuccessCount: 0,
      isFlaky: true,
      flakinessScore: 0.99,
      decisionIntegrityPassed: false,
      integrityViolations: ['Violation 1', 'Violation 2', 'Violation 3', 'Violation 4'],
      deterministicCategory: 'APPLICATION_FAILURE',
      aiCategory: 'ENVIRONMENT_FAILURE',
      evidenceIntegrityStatus: 'TAMPERED',
    });
    const attributions = attributionEngine.extractAttributions(facts);
    const result = scoringEngine.computeConfidence(facts, attributions);

    assert.ok(result.overallConfidence >= 0.0);
    assert.ok(result.overallConfidence <= 1.0);
    assert.strictEqual(result.confidenceBand, 'VERY_LOW');
  });
});
