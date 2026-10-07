/**
 * @file packages/core/src/failures/reproduction/reproduction-comparator.test.ts
 * Unit tests for ReproductionComparator (V6 Phase 76).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ReproductionComparator } from './reproduction-comparator.js';
import { FailureSignatureGenerator } from '../evidence/failure-signature-generator.js';

describe('ReproductionComparator (Phase 76)', () => {
  const comparator = new ReproductionComparator();
  const signatureGen = new FailureSignatureGenerator();

  describe('normalizeVolatileTokens & generateSignature', () => {
    it('normalizes dynamic UUIDs, timestamps, and memory addresses', () => {
      const errorWithVolatiles =
        'Error at 2026-09-08T12:34:56.789Z for object 0x7fff5fbff820 with uuid a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d and duration 1234ms';
      const normalized = signatureGen.normalizeVolatileTokens(errorWithVolatiles);

      assert.ok(!normalized.includes('2026-09-08T12:34:56.789Z'));
      assert.ok(!normalized.includes('0x7fff5fbff820'));
      assert.ok(!normalized.includes('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'));
      assert.ok(normalized.includes('<timestamp>'));
      assert.ok(normalized.includes('<addr>'));
      assert.ok(normalized.includes('<uuid>'));
    });

    it('generates deterministic signatures for equivalent errors', () => {
      const sig1 = signatureGen.generateSignature({
        actionType: 'click',
        targetSummary: 'button#submit',
        errorCode: 'ASSERTION_FAILED',
        errorMessage:
          'Element #submit-btn failed at 2026-09-08T01:00:00.000Z with uuid 11111111-2222-3333-4444-555555555555',
      });
      const sig2 = signatureGen.generateSignature({
        actionType: 'click',
        targetSummary: 'button#submit',
        errorCode: 'ASSERTION_FAILED',
        errorMessage:
          'Element #submit-btn failed at 2026-09-08T02:00:00.000Z with uuid 99999999-8888-7777-6666-555555555555',
      });

      assert.equal(sig1, sig2);
    });

    it('generates different signatures when error code or action differs', () => {
      const sig1 = signatureGen.generateSignature({
        actionType: 'click',
        errorCode: 'TIMEOUT',
        errorMessage: 'Wait timeout',
      });
      const sig2 = signatureGen.generateSignature({
        actionType: 'fill',
        errorCode: 'TIMEOUT',
        errorMessage: 'Wait timeout',
      });
      const sig3 = signatureGen.generateSignature({
        actionType: 'click',
        errorCode: 'ELEMENT_NOT_FOUND',
        errorMessage: 'Wait timeout',
      });

      assert.notEqual(sig1, sig2);
      assert.notEqual(sig1, sig3);
    });
  });

  describe('compare', () => {
    it('determines REPRODUCED when signatures match and failed steps match', () => {
      const sig = signatureGen.generateSignature({
        actionType: 'click',
        errorCode: 'TIMEOUT',
        errorMessage: 'Element timeout',
      });

      const result = comparator.compare({
        originalStatus: 'FAILED',
        reproductionStatus: 'FAILED',
        originalFailureSignature: sig,
        reproductionFailureSignature: sig,
        originalSteps: [
          { stepIndex: 0, actionType: 'navigate', status: 'PASSED' },
          { stepIndex: 1, actionType: 'click', status: 'FAILED', errorMessage: 'Element timeout' },
        ],
        reproductionSteps: [
          { stepIndex: 0, actionType: 'navigate', status: 'PASSED' },
          { stepIndex: 1, actionType: 'click', status: 'FAILED', errorMessage: 'Element timeout' },
        ],
      });

      assert.equal(result.status, 'REPRODUCED');
      assert.equal(result.isSignatureMatch, true);
      assert.equal(result.isFailedStepMatch, true);
      assert.equal(result.failedStepIndex, 1);
    });

    it('determines NOT_REPRODUCED when reproduction status is PASSED', () => {
      const result = comparator.compare({
        originalStatus: 'FAILED',
        reproductionStatus: 'PASSED',
        originalFailureSignature: 'sig_1',
        reproductionFailureSignature: null,
        originalSteps: [
          { stepIndex: 0, actionType: 'navigate', status: 'PASSED' },
          { stepIndex: 1, actionType: 'click', status: 'FAILED' },
        ],
        reproductionSteps: [
          { stepIndex: 0, actionType: 'navigate', status: 'PASSED' },
          { stepIndex: 1, actionType: 'click', status: 'PASSED' },
        ],
      });

      assert.equal(result.status, 'NOT_REPRODUCED');
      assert.equal(result.isSignatureMatch, false);
    });
  });

  describe('compareSteps', () => {
    it('accurately compares matched step sequence', () => {
      const original = [
        {
          stepIndex: 0,
          actionType: 'navigate',
          targetSummary: 'navigate to "/dashboard"',
          status: 'PASSED',
          durationMs: 50,
          errorMessage: null,
        },
        {
          stepIndex: 1,
          actionType: 'click',
          targetSummary: 'click "#save"',
          status: 'FAILED',
          durationMs: 120,
          errorMessage: 'Timeout waiting for #save',
        },
      ];

      const reproduction = [
        {
          stepIndex: 0,
          actionType: 'navigate',
          targetSummary: 'navigate to "/dashboard"',
          status: 'PASSED',
          durationMs: 45,
          errorMessage: null,
        },
        {
          stepIndex: 1,
          actionType: 'click',
          targetSummary: 'click "#save"',
          status: 'FAILED',
          durationMs: 110,
          errorMessage: 'Timeout waiting for #save',
        },
      ];

      const result = comparator.compareSteps(original, reproduction);

      assert.equal(result.length, 2);
      assert.equal(result[0]?.isMatch, true);
      assert.equal(result[0]?.originalStatus, 'PASSED');
      assert.equal(result[0]?.reproductionStatus, 'PASSED');

      assert.equal(result[1]?.isMatch, true);
      assert.equal(result[1]?.originalStatus, 'FAILED');
      assert.equal(result[1]?.reproductionStatus, 'FAILED');
    });

    it('flags mismatch when reproduction step diverges', () => {
      const original = [
        {
          stepIndex: 0,
          actionType: 'click',
          targetSummary: 'click "#submit"',
          status: 'FAILED',
          durationMs: 100,
          errorMessage: 'Element not found',
        },
      ];

      const reproduction = [
        {
          stepIndex: 0,
          actionType: 'click',
          targetSummary: 'click "#submit"',
          status: 'PASSED',
          durationMs: 50,
          errorMessage: null,
        },
      ];

      const result = comparator.compareSteps(original, reproduction);

      assert.equal(result.length, 1);
      assert.equal(result[0]?.isMatch, false);
      assert.equal(result[0]?.originalStatus, 'FAILED');
      assert.equal(result[0]?.reproductionStatus, 'PASSED');
    });
  });

  describe('compareAssertions', () => {
    it('compares identical assertion outcomes', () => {
      const original = {
        assertionType: 'ELEMENT_TEXT',
        operator: 'EQUALS',
        expectedValue: 'Welcome Admin',
        actualValue: 'Error 500',
      };
      const repro = {
        assertionType: 'ELEMENT_TEXT',
        operator: 'EQUALS',
        expectedValue: 'Welcome Admin',
        actualValue: 'Error 500',
      };

      const comparison = comparator.compareAssertions(original, repro);

      assert.ok(comparison);
      assert.equal(comparison.isMatch, true);
      assert.equal(comparison.assertionType, 'ELEMENT_TEXT');
      assert.equal(comparison.operator, 'EQUALS');
      assert.equal(comparison.originalExpected, 'Welcome Admin');
      assert.equal(comparison.reproductionActual, 'Error 500');
    });

    it('detects assertion difference when actual value changed in reproduction', () => {
      const original = {
        assertionType: 'ELEMENT_TEXT',
        operator: 'EQUALS',
        expectedValue: 'Welcome Admin',
        actualValue: 'Error 500',
      };
      const repro = {
        assertionType: 'ELEMENT_TEXT',
        operator: 'EQUALS',
        expectedValue: 'Welcome Admin',
        actualValue: 'Error 404',
      };

      const comparison = comparator.compareAssertions(original, repro);

      assert.ok(comparison);
      assert.equal(comparison.isMatch, false);
      assert.ok(comparison.diffSummary?.includes('Actual value mismatch'));
    });
  });
});
