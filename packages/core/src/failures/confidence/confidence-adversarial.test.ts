/**
 * @file packages/core/src/failures/confidence/confidence-adversarial.test.ts
 * Adversarial test suite for Confidence Scoring, Explainability & Evidence Attribution (V6 Phase 86).
 * Tests resistance to hallucinated AI confidence, contradictory telemetry, and flood attacks.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfidenceScoringEngine } from './confidence-scoring-engine.js';
import { EvidenceAttributionEngine } from './evidence-attribution-engine.js';
import type { ConfidenceEvaluationFacts } from './confidence-types.js';

test('Confidence Assessment: Adversarial Test Suite', async t => {
  const scoringEngine = new ConfidenceScoringEngine();
  const attributionEngine = new EvidenceAttributionEngine();

  await t.test(
    'Adversarial Test 1: Inflated AI confidence without factual backing is strictly discounted',
    () => {
      const ungroundedFacts: ConfidenceEvaluationFacts = {
        projectId: '11111111-1111-1111-1111-111111111111',
        failureCaseId: '22222222-2222-2222-2222-222222222222',
        testCaseId: 'tc-adv-1',
        testCaseTitle: 'Adversarial Test Case',
        testRunId: 'tr-adv-1',
        executionId: 'exec-adv-1',
        failureTitle: 'Fake crash claimed by AI',
        failureSummary: null,
        errorCode: null,
        errorMessage: null,
        failureSignature: null,
        caseStatus: 'OPEN',
        caseCreatedAt: new Date(),
        caseUpdatedAt: new Date(),

        evidenceCompleteness: 'INSUFFICIENT',
        evidenceIntegrityStatus: 'UNVERIFIED',
        evidenceReferences: [],
        hasScreenshot: false,
        hasDomSnapshot: false,
        hasConsoleLogs: false,
        hasNetworkTrace: false,
        hasTraceArchive: false,

        isReproduced: false,
        reproductionStatus: null,
        reproductionSignature: null,
        reproductionAttempts: 0,
        reproductionSuccessCount: 0,

        deterministicCategory: null,
        deterministicConfidence: null,
        classificationRationale: null,
        decisionIntegrityPassed: true,
        integrityViolations: [],

        isFlaky: false,
        flakinessScore: null,
        flakinessPattern: null,

        failureDomain: null,
        domainConfidence: null,
        domainIndicators: [],

        suspectLayer: null,
        localizedFilePath: null,
        localizedSymbol: null,
        localizedStackTraceSnippet: null,
        localizedFileExistsInRepo: false,

        // AI claims 99% certainty without any facts
        aiCategory: 'APPLICATION_FAILURE',
        aiSelfReportedConfidence: 0.999,
        aiCalibratedConfidence: 0.6, // Calibrated down
        aiReasoningExplanation: 'Model hallucinates high confidence without evidence',
        aiAuditLog: [],

        rootCauseStatus: null,
        probableLayer: null,
        probableComponent: null,
        probableCause: null,
        rootCauseConfidenceReported: null,
        verifiedRepositoryReferences: [],

        severity: null,
        priority: null,
        impactDimensions: [],

        clusterId: null,
        clusterKey: null,
        clusterSimilarityScore: null,
        clusterActiveMemberCount: 0,
        isClusterRepresentative: false,
      };

      const attributions = attributionEngine.extractAttributions(ungroundedFacts);
      const result = scoringEngine.computeConfidence(ungroundedFacts, attributions);

      // Raw AI confidence of 0.999 must NOT lead to HIGH or VERY_HIGH
      assert.ok(result.overallConfidence < 0.6, `Expected < 0.6, got ${result.overallConfidence}`);
      assert.ok(result.confidenceBand === 'LOW' || result.confidenceBand === 'VERY_LOW');
      assert.ok(result.missingFactors.length > 0);
    },
  );

  await t.test(
    'Adversarial Test 2: Severe contradictions pull overall score down to VERY_LOW',
    () => {
      const contradictoryFacts: ConfidenceEvaluationFacts = {
        projectId: '11111111-1111-1111-1111-111111111111',
        failureCaseId: '22222222-2222-2222-2222-222222222222',
        testCaseId: 'tc-adv-2',
        testCaseTitle: 'Adversarial Contradiction Test',
        testRunId: 'tr-adv-2',
        executionId: 'exec-adv-2',
        failureTitle: 'Conflicting failure signals',
        failureSummary: 'All subsystems conflict',
        errorCode: 'CONFLICT',
        errorMessage: 'Conflict everywhere',
        failureSignature: 'sig-conflict',
        caseStatus: 'OPEN',
        caseCreatedAt: new Date(),
        caseUpdatedAt: new Date(),

        evidenceCompleteness: 'MINIMAL',
        evidenceIntegrityStatus: 'CORRUPT',
        evidenceReferences: [
          {
            id: 'ev-corrupt',
            evidenceType: 'SCREENSHOT',
            filePath: 'artifacts/corrupt.png',
            mimeType: 'image/png',
            sha256: 'corrupt-sha256',
            byteSize: 100,
            createdAt: new Date(),
          },
        ],
        hasScreenshot: true,
        hasDomSnapshot: false,
        hasConsoleLogs: false,
        hasNetworkTrace: false,
        hasTraceArchive: false,

        // Reproduction failed
        isReproduced: false,
        reproductionStatus: 'NOT_REPRODUCED',
        reproductionSignature: null,
        reproductionAttempts: 5,
        reproductionSuccessCount: 0,

        // Flakiness asserts intermittent
        isFlaky: true,
        flakinessScore: 0.9,
        flakinessPattern: 'CONFIRMED_FLAKY',

        // Classification conflict: Deterministic vs AI
        deterministicCategory: 'APPLICATION_FAILURE',
        deterministicConfidence: 0.85,
        classificationRationale: 'Deterministic rule match',
        decisionIntegrityPassed: false,
        integrityViolations: ['Rule precondition violated', 'Incompatible telemetry'],

        failureDomain: 'BACKEND_SERVICE',
        domainConfidence: 0.4,
        domainIndicators: [],

        // Localization claims file that does NOT exist
        suspectLayer: 'BACKEND',
        localizedFilePath: 'non/existent/bogus/file.ts',
        localizedSymbol: 'Bogus.doThings',
        localizedStackTraceSnippet: null,
        localizedFileExistsInRepo: false,

        aiCategory: 'ENVIRONMENT_FAILURE', // Conflicts with APPLICATION_FAILURE
        aiSelfReportedConfidence: 0.95,
        aiCalibratedConfidence: 0.3,
        aiReasoningExplanation: 'AI asserts environment failure',
        aiAuditLog: [],

        rootCauseStatus: 'IDENTIFIED',
        probableLayer: 'DATABASE',
        probableComponent: 'Postgres',
        probableCause: 'Corrupt lock',
        rootCauseConfidenceReported: 0.2,
        verifiedRepositoryReferences: [],

        severity: 'CRITICAL',
        priority: 'P0',
        impactDimensions: [],

        clusterId: null,
        clusterKey: null,
        clusterSimilarityScore: null,
        clusterActiveMemberCount: 0,
        isClusterRepresentative: false,
      };

      const attributions = attributionEngine.extractAttributions(contradictoryFacts);
      const result = scoringEngine.computeConfidence(contradictoryFacts, attributions);

      assert.strictEqual(result.confidenceBand, 'VERY_LOW');
      assert.ok(result.overallConfidence <= 0.2);
      assert.ok(result.contradictions.length >= 2);
      assert.ok(result.penalties.length >= 2);
    },
  );

  await t.test(
    'Adversarial Test 3: Flood of identical evidence items does not inflate score',
    () => {
      // 50 duplicate screenshot records pointing to same hash
      const floodEvidence = Array.from({ length: 50 }, (_, i) => ({
        id: `ev-dup-${i}`,
        evidenceType: 'SCREENSHOT',
        filePath: `artifacts/shot_${i}.png`,
        mimeType: 'image/png',
        sha256: 'identical-content-hash-abcdef1234567890',
        byteSize: 15000,
        createdAt: new Date(),
      }));

      const floodFacts: ConfidenceEvaluationFacts = {
        projectId: '11111111-1111-1111-1111-111111111111',
        failureCaseId: '22222222-2222-2222-2222-222222222222',
        testCaseId: 'tc-adv-3',
        testCaseTitle: 'Flood Test',
        testRunId: 'tr-adv-3',
        executionId: 'exec-adv-3',
        failureTitle: 'Flood test failure',
        failureSummary: null,
        errorCode: null,
        errorMessage: null,
        failureSignature: null,
        caseStatus: 'OPEN',
        caseCreatedAt: new Date(),
        caseUpdatedAt: new Date(),

        evidenceCompleteness: 'MINIMAL',
        evidenceIntegrityStatus: 'VERIFIED',
        evidenceReferences: floodEvidence,
        hasScreenshot: true,
        hasDomSnapshot: false,
        hasConsoleLogs: false,
        hasNetworkTrace: false,
        hasTraceArchive: false,

        isReproduced: false,
        reproductionStatus: null,
        reproductionSignature: null,
        reproductionAttempts: 0,
        reproductionSuccessCount: 0,

        deterministicCategory: 'APPLICATION_FAILURE',
        deterministicConfidence: 0.6,
        classificationRationale: null,
        decisionIntegrityPassed: true,
        integrityViolations: [],

        isFlaky: false,
        flakinessScore: null,
        flakinessPattern: null,

        failureDomain: null,
        domainConfidence: null,
        domainIndicators: [],

        suspectLayer: null,
        localizedFilePath: null,
        localizedSymbol: null,
        localizedStackTraceSnippet: null,
        localizedFileExistsInRepo: false,

        aiCategory: null,
        aiSelfReportedConfidence: null,
        aiCalibratedConfidence: null,
        aiReasoningExplanation: null,
        aiAuditLog: [],

        rootCauseStatus: null,
        probableLayer: null,
        probableComponent: null,
        probableCause: null,
        rootCauseConfidenceReported: null,
        verifiedRepositoryReferences: [],

        severity: null,
        priority: null,
        impactDimensions: [],

        clusterId: null,
        clusterKey: null,
        clusterSimilarityScore: null,
        clusterActiveMemberCount: 0,
        isClusterRepresentative: false,
      };

      const attributions = attributionEngine.extractAttributions(floodFacts);
      const screenshotAttributions = attributions.filter(
        a =>
          a.conclusionType === 'CLASSIFICATION' &&
          a.canonicalEvidenceKey.startsWith('artifact:screenshot'),
      );

      // Only 1 deduped attribution must survive
      assert.strictEqual(screenshotAttributions.length, 1);
    },
  );
});
