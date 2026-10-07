/**
 * @file packages/core/src/verification/verification-comparator.test.ts
 * Tests for deterministic VerificationComparator comparing E1 and E2.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VerificationComparator } from './verification-comparator.js';

describe('VerificationComparator (V7 Phase 98)', () => {
  const comparator = new VerificationComparator();

  it('determines VERIFIED_FIXED when E2 passes cleanly with all steps and assertions passed', () => {
    const result = comparator.compare({
      originalExecutionStatus: 'FAILED',
      verificationExecutionStatus: 'PASSED',
      originalFailureSignature: 'sig-button-click-timeout',
      verificationFailureSignature: null,
      originalSteps: [
        { stepIndex: 0, actionType: 'NAVIGATE', status: 'PASSED' },
        { stepIndex: 1, actionType: 'CLICK', status: 'FAILED', errorMessage: 'Button timeout' },
      ],
      verificationSteps: [
        { stepIndex: 0, actionType: 'NAVIGATE', status: 'PASSED' },
        { stepIndex: 1, actionType: 'CLICK', status: 'PASSED' },
      ],
      originalAssertions: [],
      verificationAssertions: [{ stepIndex: 1, assertionType: 'VISIBILITY', status: 'PASSED' }],
      environmentDetails: {
        equivalence: 'EXACT',
        isDriftDetected: false,
      },
    });

    assert.equal(result.outcome, 'VERIFIED_FIXED');
    assert.equal(result.isSignatureMatch, false);
    assert.equal(result.verificationFailingStepIndex, null);
    assert.equal(result.environmentEquivalence, 'EXACT');
    assert.match(result.comparisonSummary, /Defect verified FIXED/);
  });

  it('determines STILL_FAILING when E2 fails at same step index and with matching signature', () => {
    const result = comparator.compare({
      originalExecutionStatus: 'FAILED',
      verificationExecutionStatus: 'FAILED',
      originalFailureSignature: 'sig-button-click-timeout',
      verificationFailureSignature: 'sig-button-click-timeout',
      originalSteps: [
        { stepIndex: 0, actionType: 'NAVIGATE', status: 'PASSED' },
        { stepIndex: 1, actionType: 'CLICK', status: 'FAILED', errorMessage: 'Button not found' },
      ],
      verificationSteps: [
        { stepIndex: 0, actionType: 'NAVIGATE', status: 'PASSED' },
        { stepIndex: 1, actionType: 'CLICK', status: 'FAILED', errorMessage: 'Button not found' },
      ],
      environmentDetails: {
        equivalence: 'EQUIVALENT',
        isDriftDetected: false,
      },
    });

    assert.equal(result.outcome, 'STILL_FAILING');
    assert.equal(result.isSignatureMatch, true);
    assert.equal(result.isStepIndexMatch, true);
    assert.equal(result.originalFailingStepIndex, 1);
    assert.equal(result.verificationFailingStepIndex, 1);
    assert.match(result.comparisonSummary, /Defect is STILL_FAILING/);
  });

  it('determines DIFFERENT_FAILURE when E2 fails at a different step index or different error', () => {
    const result = comparator.compare({
      originalExecutionStatus: 'FAILED',
      verificationExecutionStatus: 'FAILED',
      originalFailureSignature: 'sig-button-click-timeout',
      verificationFailureSignature: 'sig-payment-gateway-500',
      originalSteps: [
        { stepIndex: 0, actionType: 'NAVIGATE', status: 'PASSED' },
        { stepIndex: 1, actionType: 'CLICK', status: 'FAILED', errorMessage: 'Button not found' },
      ],
      verificationSteps: [
        { stepIndex: 0, actionType: 'NAVIGATE', status: 'PASSED' },
        { stepIndex: 1, actionType: 'CLICK', status: 'PASSED' },
        { stepIndex: 2, actionType: 'CLICK', status: 'FAILED', errorMessage: 'Payment error 500' },
      ],
      environmentDetails: {
        equivalence: 'EXACT',
        isDriftDetected: false,
      },
    });

    assert.equal(result.outcome, 'DIFFERENT_FAILURE');
    assert.equal(result.isSignatureMatch, false);
    assert.equal(result.isStepIndexMatch, false);
    assert.equal(result.originalFailingStepIndex, 1);
    assert.equal(result.verificationFailingStepIndex, 2);
    assert.match(result.comparisonSummary, /DIFFERENT_FAILURE/);
  });

  it('determines BLOCKED when blocker reason is specified or status is BLOCKED', () => {
    const result = comparator.compare({
      originalExecutionStatus: 'FAILED',
      verificationExecutionStatus: 'BLOCKED',
      originalSteps: [{ stepIndex: 0, actionType: 'NAVIGATE', status: 'PASSED' }],
      verificationSteps: [],
      blockerReason: 'Production safety policy strictly forbids destructive actions.',
      environmentDetails: {
        equivalence: 'DRIFTED',
        isDriftDetected: true,
        driftDetails: 'Production environment target',
      },
    });

    assert.equal(result.outcome, 'BLOCKED');
    assert.equal(result.environmentDriftDetected, true);
    assert.match(result.comparisonSummary, /BLOCKED/);
  });

  it('determines CANCELLED when verification status is CANCELLED', () => {
    const result = comparator.compare({
      originalExecutionStatus: 'FAILED',
      verificationExecutionStatus: 'CANCELLED',
      originalSteps: [{ stepIndex: 0, actionType: 'NAVIGATE', status: 'PASSED' }],
      verificationSteps: [],
    });

    assert.equal(result.outcome, 'CANCELLED');
    assert.match(result.comparisonSummary, /CANCELLED/);
  });

  it('determines EXECUTION_ERROR when runner encounters browser crash or harness error', () => {
    const result = comparator.compare({
      originalExecutionStatus: 'FAILED',
      verificationExecutionStatus: 'AUTOMATION_ERROR',
      originalSteps: [{ stepIndex: 0, actionType: 'NAVIGATE', status: 'PASSED' }],
      verificationSteps: [],
    });

    assert.equal(result.outcome, 'EXECUTION_ERROR');
    assert.match(result.comparisonSummary, /EXECUTION_ERROR/);
  });
});
