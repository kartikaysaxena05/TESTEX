/**
 * @file packages/core/src/execution/orchestration/run-state-machine.test.ts
 * Unit tests for RunStateMachine lifecycle transitions, terminal state immutability, and assertion guards.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RunStateMachine, TERMINAL_TEST_RUN_STATUSES } from './run-state-machine.js';
import {
  TestRunAlreadyTerminalError,
  TestRunInvalidStateTransitionError,
} from './orchestration-errors.js';
import type { TestRunStatus } from '@ai-quality/contracts';

describe('RunStateMachine Unit Tests', () => {
  it('correctly identifies terminal vs active statuses', () => {
    assert.equal(RunStateMachine.isTerminal('PASSED'), true);
    assert.equal(RunStateMachine.isTerminal('FAILED'), true);
    assert.equal(RunStateMachine.isTerminal('BLOCKED'), true);
    assert.equal(RunStateMachine.isTerminal('AUTOMATION_ERROR'), true);
    assert.equal(RunStateMachine.isTerminal('CANCELLED'), true);

    assert.equal(RunStateMachine.isTerminal('QUEUED'), false);
    assert.equal(RunStateMachine.isTerminal('PREPARING'), false);
    assert.equal(RunStateMachine.isTerminal('RUNNING'), false);

    assert.equal(RunStateMachine.isActive('QUEUED'), true);
    assert.equal(RunStateMachine.isActive('PREPARING'), true);
    assert.equal(RunStateMachine.isActive('RUNNING'), true);
    assert.equal(RunStateMachine.isActive('PASSED'), false);
  });

  it('permits valid lifecycle forward transitions', () => {
    // QUEUED transitions
    assert.equal(RunStateMachine.isValidTransition('QUEUED', 'PREPARING'), true);
    assert.equal(RunStateMachine.isValidTransition('QUEUED', 'CANCELLED'), true);
    assert.equal(RunStateMachine.isValidTransition('QUEUED', 'RUNNING'), false);
    assert.equal(RunStateMachine.isValidTransition('QUEUED', 'PASSED'), false);

    // PREPARING transitions
    assert.equal(RunStateMachine.isValidTransition('PREPARING', 'RUNNING'), true);
    assert.equal(RunStateMachine.isValidTransition('PREPARING', 'BLOCKED'), true);
    assert.equal(RunStateMachine.isValidTransition('PREPARING', 'AUTOMATION_ERROR'), true);
    assert.equal(RunStateMachine.isValidTransition('PREPARING', 'CANCELLED'), true);
    assert.equal(RunStateMachine.isValidTransition('PREPARING', 'PASSED'), false);
    assert.equal(RunStateMachine.isValidTransition('PREPARING', 'FAILED'), false);

    // RUNNING transitions
    assert.equal(RunStateMachine.isValidTransition('RUNNING', 'PASSED'), true);
    assert.equal(RunStateMachine.isValidTransition('RUNNING', 'FAILED'), true);
    assert.equal(RunStateMachine.isValidTransition('RUNNING', 'BLOCKED'), true);
    assert.equal(RunStateMachine.isValidTransition('RUNNING', 'AUTOMATION_ERROR'), true);
    assert.equal(RunStateMachine.isValidTransition('RUNNING', 'CANCELLED'), true);
    assert.equal(RunStateMachine.isValidTransition('RUNNING', 'PREPARING'), false);
    assert.equal(RunStateMachine.isValidTransition('RUNNING', 'QUEUED'), false);
  });

  it('strictly rejects any transition out of terminal states (terminal immutability)', () => {
    const allStatuses: TestRunStatus[] = [
      'QUEUED',
      'PREPARING',
      'RUNNING',
      'PASSED',
      'FAILED',
      'BLOCKED',
      'AUTOMATION_ERROR',
      'CANCELLED',
    ];

    for (const terminalStatus of TERMINAL_TEST_RUN_STATUSES) {
      for (const targetStatus of allStatuses) {
        assert.equal(
          RunStateMachine.isValidTransition(terminalStatus, targetStatus),
          false,
          `Expected transition from ${terminalStatus} to ${targetStatus} to be strictly forbidden`,
        );

        assert.throws(
          () => RunStateMachine.assertValidTransition('run-123', terminalStatus, targetStatus),
          (err: unknown) => {
            assert(err instanceof TestRunAlreadyTerminalError);
            assert.equal(err.code, 'TEST_RUN_ALREADY_TERMINAL');
            return true;
          },
        );
      }
    }
  });

  it('throws TestRunInvalidStateTransitionError for invalid non-terminal transitions', () => {
    assert.throws(
      () => RunStateMachine.assertValidTransition('run-456', 'QUEUED', 'RUNNING'),
      (err: unknown) => {
        assert(err instanceof TestRunInvalidStateTransitionError);
        assert.equal(err.code, 'TEST_RUN_INVALID_STATE_TRANSITION');
        return true;
      },
    );
  });

  it('returns valid next statuses for any state', () => {
    assert.deepEqual(RunStateMachine.getValidNextStatuses('QUEUED'), ['PREPARING', 'CANCELLED']);
    assert.deepEqual(RunStateMachine.getValidNextStatuses('PREPARING'), [
      'RUNNING',
      'BLOCKED',
      'AUTOMATION_ERROR',
      'CANCELLED',
    ]);
    assert.deepEqual(RunStateMachine.getValidNextStatuses('RUNNING'), [
      'PASSED',
      'FAILED',
      'BLOCKED',
      'AUTOMATION_ERROR',
      'CANCELLED',
    ]);
    assert.deepEqual(RunStateMachine.getValidNextStatuses('PASSED'), []);
    assert.deepEqual(RunStateMachine.getValidNextStatuses('CANCELLED'), []);
  });
});
