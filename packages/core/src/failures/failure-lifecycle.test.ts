/**
 * @file packages/core/src/failures/failure-lifecycle.test.ts
 * Unit tests for the Failure Intelligence lifecycle state machine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidCaseTransition,
  assertValidCaseTransition,
  isValidRunTransition,
  assertValidRunTransition,
  isTerminalCaseStatus,
  isTerminalRunStatus,
} from './failure-lifecycle-state-machine.js';
import { InvalidLifecycleTransitionError } from './failure-errors.js';
import type { FailureCaseStatus } from '@ai-quality/contracts';

describe('Failure Lifecycle State Machine (V6 Phase 74)', () => {
  describe('FailureCase Transitions', () => {
    it('allows valid progressive transitions: PENDING -> READY -> ANALYZING -> COMPLETED', () => {
      assert.strictEqual(isValidCaseTransition('PENDING', 'READY'), true);
      assert.strictEqual(isValidCaseTransition('READY', 'ANALYZING'), true);
      assert.strictEqual(isValidCaseTransition('ANALYZING', 'COMPLETED'), true);
    });

    it('allows valid failure branch transitions: ANALYZING -> FAILED and ANALYZING -> BLOCKED', () => {
      assert.strictEqual(isValidCaseTransition('ANALYZING', 'FAILED'), true);
      assert.strictEqual(isValidCaseTransition('ANALYZING', 'BLOCKED'), true);
    });

    it('allows re-attempt transitions from FAILED or BLOCKED to READY or ANALYZING', () => {
      assert.strictEqual(isValidCaseTransition('FAILED', 'READY'), true);
      assert.strictEqual(isValidCaseTransition('FAILED', 'ANALYZING'), true);
      assert.strictEqual(isValidCaseTransition('BLOCKED', 'READY'), true);
      assert.strictEqual(isValidCaseTransition('BLOCKED', 'ANALYZING'), true);
    });

    it('allows staleness transition from COMPLETED to STALE and re-analysis from STALE', () => {
      assert.strictEqual(isValidCaseTransition('COMPLETED', 'STALE'), true);
      assert.strictEqual(isValidCaseTransition('STALE', 'READY'), true);
      assert.strictEqual(isValidCaseTransition('STALE', 'ANALYZING'), true);
    });

    it('allows cancellation from PENDING, READY, or ANALYZING', () => {
      assert.strictEqual(isValidCaseTransition('PENDING', 'CANCELLED'), true);
      assert.strictEqual(isValidCaseTransition('READY', 'CANCELLED'), true);
      assert.strictEqual(isValidCaseTransition('ANALYZING', 'CANCELLED'), true);
    });

    it('allows identity transition (same state to same state)', () => {
      const statuses: FailureCaseStatus[] = [
        'PENDING',
        'READY',
        'ANALYZING',
        'COMPLETED',
        'FAILED',
        'BLOCKED',
        'STALE',
        'CANCELLED',
      ];
      for (const s of statuses) {
        assert.strictEqual(isValidCaseTransition(s, s), true);
      }
    });

    it('rejects invalid jumps such as PENDING -> COMPLETED', () => {
      assert.strictEqual(isValidCaseTransition('PENDING', 'COMPLETED'), false);
      assert.throws(
        () => assertValidCaseTransition('PENDING', 'COMPLETED'),
        (err: unknown) => {
          assert.ok(err instanceof InvalidLifecycleTransitionError);
          assert.strictEqual(err.code, 'INVALID_LIFECYCLE_TRANSITION');
          return true;
        },
      );
    });

    it('rejects invalid jump from CANCELLED to COMPLETED', () => {
      assert.strictEqual(isValidCaseTransition('CANCELLED', 'COMPLETED'), false);
      assert.throws(
        () => assertValidCaseTransition('CANCELLED', 'COMPLETED'),
        InvalidLifecycleTransitionError,
      );
    });
  });

  describe('FailureAnalysisRun Transitions', () => {
    it('allows valid run transition: PENDING -> RUNNING -> COMPLETED', () => {
      assert.strictEqual(isValidRunTransition('PENDING', 'RUNNING'), true);
      assert.strictEqual(isValidRunTransition('RUNNING', 'COMPLETED'), true);
    });

    it('allows run failure and cancellation from RUNNING', () => {
      assert.strictEqual(isValidRunTransition('RUNNING', 'FAILED'), true);
      assert.strictEqual(isValidRunTransition('RUNNING', 'BLOCKED'), true);
      assert.strictEqual(isValidRunTransition('RUNNING', 'CANCELLED'), true);
    });

    it('rejects transitions out of terminal run states', () => {
      assert.strictEqual(isValidRunTransition('COMPLETED', 'RUNNING'), false);
      assert.strictEqual(isValidRunTransition('FAILED', 'RUNNING'), false);
      assert.throws(
        () => assertValidRunTransition('COMPLETED', 'RUNNING'),
        InvalidLifecycleTransitionError,
      );
    });
  });

  describe('Terminal State Checks', () => {
    it('identifies terminal case statuses', () => {
      assert.strictEqual(isTerminalCaseStatus('COMPLETED'), true);
      assert.strictEqual(isTerminalCaseStatus('CANCELLED'), true);
      assert.strictEqual(isTerminalCaseStatus('ANALYZING'), false);
      assert.strictEqual(isTerminalCaseStatus('PENDING'), false);
    });

    it('identifies terminal run statuses', () => {
      assert.strictEqual(isTerminalRunStatus('COMPLETED'), true);
      assert.strictEqual(isTerminalRunStatus('FAILED'), true);
      assert.strictEqual(isTerminalRunStatus('BLOCKED'), true);
      assert.strictEqual(isTerminalRunStatus('CANCELLED'), true);
      assert.strictEqual(isTerminalRunStatus('RUNNING'), false);
      assert.strictEqual(isTerminalRunStatus('PENDING'), false);
    });
  });
});
