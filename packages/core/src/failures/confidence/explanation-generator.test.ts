/**
 * @file packages/core/src/failures/confidence/explanation-generator.test.ts
 * Unit tests for ExplanationGenerator with claim-to-evidence validation (V6 Phase 86).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ExplanationGenerator } from './explanation-generator.js';
import { EvidenceAttributionEngine } from './evidence-attribution-engine.js';
import { ConfidenceScoringEngine } from './confidence-scoring-engine.js';
import type { ConfidenceEvaluationFacts } from './confidence-types.js';

test('ExplanationGenerator Unit Test Suite', async t => {
  const explanationGenerator = new ExplanationGenerator();
  const attributionEngine = new EvidenceAttributionEngine();
  const scoringEngine = new ConfidenceScoringEngine();

  const facts: ConfidenceEvaluationFacts = {
    projectId: '11111111-1111-1111-1111-111111111111',
    failureCaseId: '22222222-2222-2222-2222-222222222222',
    testCaseId: 'tc-1',
    testCaseTitle: 'Payment Gateway Validation',
    testRunId: 'tr-1',
    executionId: 'exec-1',
    failureTitle: '504 Gateway Timeout during checkout',
    failureSummary: 'Upstream payment processor did not respond within 30 seconds',
    errorCode: 'HTTP_504',
    errorMessage: 'Gateway Timeout connecting to api.payment.test',
    failureSignature: 'sig-504-timeout',
    caseStatus: 'OPEN',
    caseCreatedAt: new Date('2026-09-08T10:00:00Z'),
    caseUpdatedAt: new Date('2026-09-08T10:00:00Z'),

    evidenceCompleteness: 'COMPLETE',
    evidenceIntegrityStatus: 'VERIFIED',
    evidenceReferences: [
      {
        id: 'ev-1',
        evidenceType: 'SCREENSHOT',
        filePath: 'artifacts/screen.png',
        mimeType: 'image/png',
        sha256: '9876543210abcdef9876543210abcdef9876543210abcdef9876543210abcdef',
        byteSize: 22000,
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
    reproductionSignature: 'sig-504-timeout',
    reproductionAttempts: 3,
    reproductionSuccessCount: 3,

    deterministicCategory: 'ENVIRONMENT_FAILURE',
    deterministicConfidence: 0.92,
    classificationRationale: 'Payment gateway API unreachable',
    decisionIntegrityPassed: true,
    integrityViolations: [],

    isFlaky: false,
    flakinessScore: 0.0,
    flakinessPattern: null,

    failureDomain: 'EXTERNAL_INFRASTRUCTURE',
    domainConfidence: 0.95,
    domainIndicators: ['network_504_gateway_timeout'],

    suspectLayer: 'EXTERNAL_DEPENDENCY',
    localizedFilePath: 'src/services/PaymentClient.ts',
    localizedSymbol: 'PaymentClient.charge',
    localizedStackTraceSnippet: 'at PaymentClient.charge (src/services/PaymentClient.ts:77)',
    localizedFileExistsInRepo: true,

    aiCategory: 'ENVIRONMENT_FAILURE',
    aiSelfReportedConfidence: 0.95,
    aiCalibratedConfidence: 0.91,
    aiReasoningExplanation: 'Gateway timeout indicates 3rd party infrastructure down',
    aiAuditLog: [],

    rootCauseStatus: 'RESOLVED',
    probableLayer: 'EXTERNAL_DEPENDENCY',
    probableComponent: 'PaymentGateway',
    probableCause: 'Third-party gateway timeout',
    rootCauseConfidenceReported: 0.95,
    verifiedRepositoryReferences: ['src/services/PaymentClient.ts'],

    severity: 'HIGH',
    priority: 'P1',
    impactDimensions: [{ dimension: 'userImpact', score: 0.9, rationale: 'Checkout blocked' }],

    clusterId: '55555555-5555-5555-5555-555555555555',
    clusterKey: 'cluster-payment-504',
    clusterSimilarityScore: 0.98,
    clusterActiveMemberCount: 6,
    isClusterRepresentative: true,
  };

  const attributions = attributionEngine.extractAttributions(facts);
  const scoring = scoringEngine.computeConfidence(facts, attributions);

  await t.test('Generates structured markdown explanation', () => {
    const explanation = explanationGenerator.generateExplanation(facts, scoring, attributions);

    assert.ok(explanation.markdownExplanation.includes('# Confidence & Explainability Assessment'));
    assert.ok(explanation.markdownExplanation.includes('## Domain Confidence Scores'));
    assert.ok(explanation.markdownExplanation.includes('## Factual Grounding (FACT)'));
    assert.ok(explanation.markdownExplanation.includes('## Component Scoring Breakdown'));
  });

  await t.test(
    'All claims cite attributed canonical evidence keys (claim-to-evidence validation)',
    () => {
      const explanation = explanationGenerator.generateExplanation(facts, scoring, attributions);

      assert.ok(explanation.claimsWithAttributions.length > 0);
      const allAttrKeys = new Set(attributions.map(a => a.canonicalEvidenceKey));

      for (const claim of explanation.claimsWithAttributions) {
        assert.ok(claim.claim.length > 0);
        assert.ok(claim.attributedKeys.length > 0);
        for (const key of claim.attributedKeys) {
          assert.ok(allAttrKeys.has(key), `Claim cites ungrounded key: ${key}`);
        }
      }
    },
  );

  await t.test('Contains AI calibration notice when AI inferences exist', () => {
    const explanation = explanationGenerator.generateExplanation(facts, scoring, attributions);
    assert.ok(
      explanation.markdownExplanation.includes('Calibration Notice'),
      'Explanation must include AI calibration notice',
    );
  });
});
