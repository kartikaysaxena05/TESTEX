/**
 * @file packages/core/src/requirements/quality/requirement-quality-analyzer.test.ts
 * Pure unit tests for RequirementQualityAnalyzer: ambiguity detection, testability assessment,
 * clarification generation, false-positive protection, and evaluation metrics.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RequirementQualityAnalyzer } from './requirement-quality-analyzer.js';

describe('RequirementQualityAnalyzer Unit Tests', () => {
  it('should evaluate clear functional requirement as TESTABLE with 100 quality score', () => {
    const res = RequirementQualityAnalyzer.analyze({
      originalText: 'The system shall reject an invalid password.',
    });

    assert.equal(res.testabilityStatus, 'TESTABLE');
    assert.equal(res.qualityScore, 100);
    assert.equal(res.findings.length, 0);
    assert.equal(res.clarificationQuestions.length, 0);
  });

  it('should not flag precise performance requirement with numeric thresholds', () => {
    const res = RequirementQualityAnalyzer.analyze({
      originalText: 'The API shall respond within 500 ms for 95% of requests.',
    });

    assert.equal(res.testabilityStatus, 'TESTABLE');
    const timingFinding = res.findings.find(f => f.code === 'UNDEFINED_TIME_CONSTRAINT');
    assert.equal(timingFinding, undefined);
  });

  it('should detect undefined timing (quickly) with exact offsets and clarification', () => {
    const text = 'The API shall respond quickly.';
    const res = RequirementQualityAnalyzer.analyze({ originalText: text });

    assert.equal(res.testabilityStatus, 'PARTIALLY_TESTABLE');
    const timingFinding = res.findings.find(f => f.code === 'UNDEFINED_TIME_CONSTRAINT');
    assert.ok(timingFinding !== undefined);
    assert.equal(timingFinding?.severity, 'ERROR');
    assert.equal(timingFinding?.evidenceText, 'quickly');
    assert.equal(timingFinding?.startOffset, 22);
    assert.equal(timingFinding?.endOffset, 29);
    assert.ok(res.clarificationQuestions.some(q => q.includes('maximum acceptable response')));
  });

  it('should detect vague quantities and undefined scale', () => {
    const res = RequirementQualityAnalyzer.analyze({
      originalText: 'The application shall support many concurrent users.',
    });

    assert.equal(res.testabilityStatus, 'PARTIALLY_TESTABLE');
    const qtyFinding = res.findings.find(f => f.code === 'VAGUE_QUANTITY');
    assert.ok(qtyFinding !== undefined);
    assert.equal(qtyFinding?.evidenceText, 'many');
  });

  it('should evaluate purely subjective requirement as NOT_TESTABLE', () => {
    const res = RequirementQualityAnalyzer.analyze({
      originalText: 'The application shall be user friendly.',
    });

    assert.equal(res.testabilityStatus, 'NOT_TESTABLE');
    const subjFinding = res.findings.find(f => f.code === 'SUBJECTIVE_CRITERION');
    assert.ok(subjFinding !== undefined);
    assert.equal(subjFinding?.severity, 'ERROR');
    assert.ok(res.qualityScore !== null && res.qualityScore < 100);
  });

  it('should detect open-ended list markers (etc.)', () => {
    const text = 'The form shall validate name, email, address, etc.';
    const res = RequirementQualityAnalyzer.analyze({ originalText: text });

    const etcFinding = res.findings.find(f => f.code === 'OPEN_ENDED_LIST');
    assert.ok(etcFinding !== undefined);
    assert.equal(etcFinding?.evidenceText, 'etc.');
    assert.ok(res.clarificationQuestions.some(q => q.includes('complete, exhaustive set')));
  });

  it('should detect ambiguous and/or logical operator', () => {
    const text = 'The manager and/or supervisor shall approve the request.';
    const res = RequirementQualityAnalyzer.analyze({ originalText: text });

    const andOrFinding = res.findings.find(f => f.code === 'AMBIGUOUS_LOGICAL_OPERATOR');
    assert.ok(andOrFinding !== undefined);
    assert.equal(andOrFinding?.evidenceText, 'and/or');
    assert.ok(
      res.clarificationQuestions.some(q => q.includes('both conditions, either condition')),
    );
  });

  it('should detect weak modality (should)', () => {
    const res = RequirementQualityAnalyzer.analyze({
      originalText: 'The system should send a confirmation email.',
    });

    const weakFinding = res.findings.find(f => f.code === 'WEAK_MODALITY');
    assert.ok(weakFinding !== undefined);
    assert.equal(weakFinding?.evidenceText, 'should');
  });

  it('should detect undefined expected outcome (handle the error)', () => {
    const res = RequirementQualityAnalyzer.analyze({
      originalText: 'When the payment fails, the system shall handle the error.',
    });

    const outcomeFinding = res.findings.find(f => f.code === 'UNDEFINED_EXPECTED_OUTCOME');
    assert.ok(outcomeFinding !== undefined);
    assert.equal(outcomeFinding?.severity, 'ERROR');
  });

  it('should recognize state transitions with explicit triggers as TESTABLE', () => {
    const res = RequirementQualityAnalyzer.analyze({
      originalText: 'After 5 failed login attempts, the account shall become locked.',
    });

    assert.equal(res.testabilityStatus, 'TESTABLE');
    assert.equal(res.findings.filter(f => f.severity === 'ERROR').length, 0);
  });

  it('should detect compound non-atomic requirements with multiple shall statements', () => {
    const res = RequirementQualityAnalyzer.analyze({
      originalText: 'The system shall create the account and shall send a confirmation email.',
    });

    const compoundFinding = res.findings.find(f => f.code === 'COMPOUND_REQUIREMENT');
    assert.ok(compoundFinding !== undefined);
  });

  it('should detect incomplete comparisons without baseline (faster)', () => {
    const res = RequirementQualityAnalyzer.analyze({
      originalText: 'The new search process shall be faster.',
    });

    const compFinding = res.findings.find(f => f.code === 'UNDEFINED_COMPARISON_BASELINE');
    assert.ok(compFinding !== undefined);
    assert.equal(compFinding?.evidenceText, 'faster');
  });

  it('should avoid false positives on precise phrases like maximum of 5 and within 2 seconds', () => {
    const res1 = RequirementQualityAnalyzer.analyze({
      originalText: 'The system shall support a maximum of 5 active sessions per user.',
    });
    assert.equal(
      res1.findings.find(f => f.code === 'UNDEFINED_CAPACITY'),
      undefined,
    );

    const res2 = RequirementQualityAnalyzer.analyze({
      originalText: 'The system shall send the notification within 2 seconds.',
    });
    assert.equal(
      res2.findings.find(f => f.code === 'UNDEFINED_TIME_CONSTRAINT'),
      undefined,
    );
  });

  it('should be 100% deterministic across 100 repeated runs', () => {
    const input = {
      originalText: 'The system should quickly process requests and/or handle the error, etc.',
    };

    const first = RequirementQualityAnalyzer.analyze(input);

    for (let i = 0; i < 100; i++) {
      const current = RequirementQualityAnalyzer.analyze(input);
      assert.deepEqual(current, first);
    }
  });

  it('should measure precision, recall, and rule-based agreement on labeled benchmark fixtures', () => {
    interface Fixture {
      text: string;
      expectedTestability: 'TESTABLE' | 'PARTIALLY_TESTABLE' | 'NOT_TESTABLE';
      expectedCodes: string[];
    }

    const fixtures: Fixture[] = [
      {
        text: 'The system shall reject invalid credentials.',
        expectedTestability: 'TESTABLE',
        expectedCodes: [],
      },
      {
        text: 'The API shall respond within 200 ms.',
        expectedTestability: 'TESTABLE',
        expectedCodes: [],
      },
      {
        text: 'The dashboard shall load quickly.',
        expectedTestability: 'PARTIALLY_TESTABLE',
        expectedCodes: ['UNDEFINED_TIME_CONSTRAINT'],
      },
      {
        text: 'The UI shall be user-friendly.',
        expectedTestability: 'NOT_TESTABLE',
        expectedCodes: ['SUBJECTIVE_CRITERION'],
      },
      {
        text: 'The form shall validate name, email, etc.',
        expectedTestability: 'PARTIALLY_TESTABLE',
        expectedCodes: ['OPEN_ENDED_LIST'],
      },
      {
        text: 'The user and/or admin shall approve.',
        expectedTestability: 'PARTIALLY_TESTABLE',
        expectedCodes: ['AMBIGUOUS_LOGICAL_OPERATOR'],
      },
      {
        text: 'The service should send an alert.',
        expectedTestability: 'PARTIALLY_TESTABLE',
        expectedCodes: ['WEAK_MODALITY'],
      },
      {
        text: 'The new engine shall be faster.',
        expectedTestability: 'PARTIALLY_TESTABLE',
        expectedCodes: ['UNDEFINED_COMPARISON_BASELINE'],
      },
    ];

    let matchedLabels = 0;
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;

    for (const item of fixtures) {
      const res = RequirementQualityAnalyzer.analyze({ originalText: item.text });

      if (res.testabilityStatus === item.expectedTestability) {
        matchedLabels++;
      }

      const detectedCodes = new Set<string>(res.findings.map(f => f.code));
      for (const expected of item.expectedCodes) {
        if (detectedCodes.has(expected)) {
          truePositives++;
        } else {
          falseNegatives++;
        }
      }

      for (const detected of detectedCodes) {
        if (!item.expectedCodes.includes(detected)) {
          falsePositives++;
        }
      }
    }

    const testabilityAgreement = matchedLabels / fixtures.length;
    const precision =
      truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 1;
    const recall =
      truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 1;

    assert.equal(testabilityAgreement, 1.0); // 100% agreement
    assert.equal(precision, 1.0); // 100% precision
    assert.equal(recall, 1.0); // 100% recall
  });
});
