/**
 * @file packages/core/src/failures/clustering/representative-failure-selector.test.ts
 * Unit test suite for RepresentativeFailureSelector (V6 Phase 85).
 * Tests deterministic selection hierarchy: reproduction > evidence completeness > RCA presence > earliest timestamp > ID tie-breaker.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { RepresentativeFailureSelector } from './representative-failure-selector.js';
import type { FailureComparisonFacts } from './clustering-types.js';

test('RepresentativeFailureSelector Unit Test Suite', async t => {
  const selector = new RepresentativeFailureSelector();

  const createFact = (overrides: Partial<FailureComparisonFacts>): FailureComparisonFacts => ({
    failureCaseId: '00000000-0000-0000-0000-000000000001',
    projectId: 'proj-1',
    testCaseId: 'tc-1',
    testCaseTitle: 'TC Title',
    testRunId: 'tr-1',
    executionId: 'exec-1',
    stepIndex: null,
    stepAction: null,
    stepTarget: null,
    title: 'Failure Fact',
    failureSummary: null,
    errorCode: null,
    errorMessage: 'Something broke',
    failureSignature: null,
    evidenceCompleteness: 'MINIMAL',
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
    createdAt: new Date('2026-09-08T10:00:00Z'),
    ...overrides,
  });

  await t.test('1. Empty list throws error', () => {
    assert.throws(
      () => selector.selectRepresentative([]),
      /Cannot select representative from an empty member list/,
    );
  });

  await t.test('2. Single candidate is always selected', () => {
    const single = createFact({ failureCaseId: 'single-01' });
    const selected = selector.selectRepresentative([single]);
    assert.equal(selected.failureCaseId, 'single-01');
  });

  await t.test('3. Confirmed reproduced failure beats unconfirmed failure', () => {
    const reproduced = createFact({
      failureCaseId: 'fc-reproduced',
      isReproduced: true,
      evidenceCompleteness: 'MINIMAL',
    });

    const notReproduced = createFact({
      failureCaseId: 'fc-not-reproduced',
      isReproduced: false,
      evidenceCompleteness: 'COMPLETE', // Even with higher completeness, reproduction priority dominates
    });

    const selected = selector.selectRepresentative([notReproduced, reproduced]);
    assert.equal(selected.failureCaseId, 'fc-reproduced');
  });

  await t.test('4. Evidence completeness wins when reproduction status is identical', () => {
    const candidateA = createFact({
      failureCaseId: 'fc-rich-evidence',
      isReproduced: true,
      evidenceCompleteness: 'COMPLETE',
      probableLayer: 'BACKEND_SERVICE',
    });

    const candidateB = createFact({
      failureCaseId: 'fc-sparse-evidence',
      isReproduced: true,
      evidenceCompleteness: 'PARTIAL',
      probableLayer: 'BACKEND_SERVICE',
    });

    const selected = selector.selectRepresentative([candidateB, candidateA]);
    assert.equal(selected.failureCaseId, 'fc-rich-evidence');
  });

  await t.test(
    '5. Earliest timestamp wins when reproduction and completeness are identical',
    () => {
      const early = createFact({
        failureCaseId: 'fc-early',
        isReproduced: true,
        evidenceCompleteness: 'COMPLETE',
        createdAt: new Date('2026-09-08T08:00:00Z'),
      });

      const late = createFact({
        failureCaseId: 'fc-late',
        isReproduced: true,
        evidenceCompleteness: 'COMPLETE',
        createdAt: new Date('2026-09-08T09:00:00Z'),
      });

      const selected = selector.selectRepresentative([late, early]);
      assert.equal(selected.failureCaseId, 'fc-early');
    },
  );

  await t.test('6. Lexicographical ID tie-breaker wins when everything else is equal', () => {
    const idA = createFact({
      failureCaseId: 'fc-aaa',
      evidenceCompleteness: 'COMPLETE',
      createdAt: new Date('2026-09-08T12:00:00Z'),
    });

    const idZ = createFact({
      failureCaseId: 'fc-zzz',
      evidenceCompleteness: 'COMPLETE',
      createdAt: new Date('2026-09-08T12:00:00Z'),
    });

    const selected = selector.selectRepresentative([idZ, idA]);
    assert.equal(selected.failureCaseId, 'fc-aaa');
  });
});
