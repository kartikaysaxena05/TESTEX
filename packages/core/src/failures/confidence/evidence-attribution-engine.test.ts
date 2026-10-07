/**
 * @file packages/core/src/failures/confidence/evidence-attribution-engine.test.ts
 * Unit tests for EvidenceAttributionEngine (V6 Phase 86).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceAttributionEngine } from './evidence-attribution-engine.js';
import type { ConfidenceEvaluationFacts } from './confidence-types.js';

test('EvidenceAttributionEngine Unit Test Suite', async t => {
  const engine = new EvidenceAttributionEngine();

  const baseFacts: ConfidenceEvaluationFacts = {
    projectId: '11111111-1111-1111-1111-111111111111',
    failureCaseId: '22222222-2222-2222-2222-222222222222',
    testCaseId: 'tc-1',
    testCaseTitle: 'Search Product Test',
    testRunId: 'tr-1',
    executionId: 'exec-1',
    failureTitle: 'Search suggestions dropdown did not open',
    failureSummary: 'Search input typing did not render listbox',
    errorCode: 'ELEMENT_NOT_VISIBLE',
    errorMessage: 'Expected [role="listbox"] to be visible',
    failureSignature: 'sig-search-listbox',
    caseStatus: 'OPEN',
    caseCreatedAt: new Date('2026-09-08T10:00:00Z'),
    caseUpdatedAt: new Date('2026-09-08T10:00:00Z'),

    evidenceCompleteness: 'COMPLETE',
    evidenceIntegrityStatus: 'VERIFIED',
    evidenceReferences: [
      {
        id: 'ev-1',
        evidenceType: 'SCREENSHOT',
        filePath: 'artifacts/screenshot.png',
        mimeType: 'image/png',
        sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        byteSize: 12000,
        createdAt: new Date('2026-09-08T10:00:00Z'),
      },
      {
        id: 'ev-2',
        evidenceType: 'CONSOLE_LOGS',
        filePath: 'artifacts/console.log',
        mimeType: 'text/plain',
        sha256: 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
        byteSize: 3400,
        createdAt: new Date('2026-09-08T10:00:00Z'),
      },
    ],
    hasScreenshot: true,
    hasDomSnapshot: true,
    hasConsoleLogs: true,
    hasNetworkTrace: false,
    hasTraceArchive: false,

    isReproduced: true,
    reproductionStatus: 'REPRODUCED',
    reproductionSignature: 'sig-search-listbox',
    reproductionAttempts: 2,
    reproductionSuccessCount: 2,

    deterministicCategory: 'APPLICATION_FAILURE',
    deterministicConfidence: 0.9,
    classificationRationale: 'DOM search component state mismatch',
    decisionIntegrityPassed: true,
    integrityViolations: [],

    isFlaky: false,
    flakinessScore: 0.0,
    flakinessPattern: null,

    failureDomain: 'FRONTEND_APPLICATION',
    domainConfidence: 0.85,
    domainIndicators: ['dom_mismatch'],

    suspectLayer: 'UI_COMPONENT',
    localizedFilePath: 'src/components/SearchBox.tsx',
    localizedSymbol: 'SearchBox.renderDropdown',
    localizedStackTraceSnippet: 'SearchBox.renderDropdown (src/components/SearchBox.tsx:88)',
    localizedFileExistsInRepo: true,

    aiCategory: 'APPLICATION_FAILURE',
    aiSelfReportedConfidence: 0.88,
    aiCalibratedConfidence: 0.85,
    aiReasoningExplanation: 'Dropdown toggle animation promise was not resolved',
    aiAuditLog: [],

    rootCauseStatus: 'IDENTIFIED',
    probableLayer: 'UI_COMPONENT',
    probableComponent: 'SearchBox',
    probableCause: 'Async race condition in dropdown mount',
    rootCauseConfidenceReported: 0.85,
    verifiedRepositoryReferences: ['src/components/SearchBox.tsx'],

    severity: 'MEDIUM',
    priority: 'P2',
    impactDimensions: [{ dimension: 'userImpact', score: 0.6, rationale: 'Degraded search UX' }],

    clusterId: '44444444-4444-4444-4444-444444444444',
    clusterKey: 'cluster-searchbox-dropdown',
    clusterSimilarityScore: 0.9,
    clusterActiveMemberCount: 3,
    isClusterRepresentative: false,
  };

  await t.test('Generates canonical keys in deterministic format', () => {
    const key1 = engine.generateCanonicalKey('artifact', 'SCREENSHOT', 'ABCDEF1234');
    const key2 = engine.generateCanonicalKey('artifact', 'screenshot', 'abcdef1234');
    assert.strictEqual(key1, 'artifact:screenshot:abcdef1234');
    assert.strictEqual(key1, key2);
  });

  await t.test('Extracts attributions across multi-phase facts', () => {
    const attributions = engine.extractAttributions(baseFacts);

    assert.ok(attributions.length > 5);

    // Factual artifact
    const screenshotAttr = attributions.find(a =>
      a.canonicalEvidenceKey.startsWith('artifact:screenshot'),
    );
    assert.ok(screenshotAttr);
    assert.strictEqual(screenshotAttr.epistemicType, 'FACT');
    assert.strictEqual(screenshotAttr.relationship, 'SUPPORTS');

    // Deterministic classification
    const classAttr = attributions.find(a => a.sourceSubsystem === 'PHASE_77_CLASSIFICATION');
    assert.ok(classAttr);
    assert.strictEqual(classAttr.epistemicType, 'DETERMINISTIC_INFERENCE');
    assert.strictEqual(classAttr.relationship, 'SUPPORTS');

    // Root cause localization
    const rcAttr = attributions.find(a => a.sourceSubsystem === 'PHASE_81_CAUSE_LOCALIZATION');
    assert.ok(rcAttr);
    assert.strictEqual(rcAttr.epistemicType, 'FACT');
    assert.strictEqual(rcAttr.supportStrength, 'DECISIVE');

    // Cluster membership
    const clusterAttr = attributions.find(a => a.sourceSubsystem === 'PHASE_85_DUPLICATE_CLUSTER');
    assert.ok(clusterAttr);
    assert.strictEqual(clusterAttr.conclusionType, 'DUPLICATE_CLUSTER');
  });

  await t.test(
    'Double-count protection eliminates duplicate canonical keys for the same conclusion',
    () => {
      // Inject two identical evidence artifacts
      const duplicateFacts: ConfidenceEvaluationFacts = {
        ...baseFacts,
        evidenceReferences: [
          baseFacts.evidenceReferences[0]!,
          baseFacts.evidenceReferences[0]!, // duplicate
        ],
      };

      const attributions = engine.extractAttributions(duplicateFacts);
      const screenshotAttrsForClass = attributions.filter(
        a =>
          a.conclusionType === 'CLASSIFICATION' &&
          a.canonicalEvidenceKey.startsWith('artifact:screenshot'),
      );
      assert.strictEqual(
        screenshotAttrsForClass.length,
        1,
        'Duplicate canonical keys must be deduped',
      );
    },
  );

  await t.test(
    'Unverified repo path marks root-cause attribution as CONTRADICTORY and WEAK',
    () => {
      const unverifiedFacts: ConfidenceEvaluationFacts = {
        ...baseFacts,
        localizedFilePath: 'non/existent/file.tsx',
        localizedFileExistsInRepo: false,
      };

      const attributions = engine.extractAttributions(unverifiedFacts);
      const codeAttr = attributions.find(a => a.sourceSubsystem === 'PHASE_81_CAUSE_LOCALIZATION');
      assert.ok(codeAttr);
      assert.strictEqual(codeAttr.epistemicType, 'CONTRADICTORY');
      assert.strictEqual(codeAttr.supportStrength, 'WEAK');
    },
  );

  await t.test(
    'Missing reproduction emits MISSING relationship with UNKNOWN epistemic type',
    () => {
      const noReproFacts: ConfidenceEvaluationFacts = {
        ...baseFacts,
        reproductionAttempts: 0,
        reproductionSuccessCount: 0,
        isReproduced: false,
        reproductionStatus: null,
        reproductionSignature: null,
      };

      const attributions = engine.extractAttributions(noReproFacts);
      const missingRepro = attributions.find(
        a => a.canonicalEvidenceKey === 'missing:reproduction:none',
      );
      assert.ok(missingRepro);
      assert.strictEqual(missingRepro.relationship, 'MISSING');
      assert.strictEqual(missingRepro.epistemicType, 'UNKNOWN');
    },
  );
});
