/**
 * @file packages/core/src/workflow/workflow-transition-validator.test.ts
 * Deterministic transition validation test suite for bug workflow lifecycles.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowTransitionValidator } from './workflow-transition-validator.js';
import type { InternalBugStatus } from './workflow-types.js';

describe('WorkflowTransitionValidator', () => {
  test('allows identical status as a valid no-op', () => {
    const statuses: InternalBugStatus[] = [
      'OPEN',
      'ACKNOWLEDGED',
      'IN_PROGRESS',
      'RESOLVED',
      'REOPENED',
      'CLOSED',
      'BLOCKED',
      'WONT_FIX',
      'DUPLICATE',
    ];

    for (const s of statuses) {
      const result = WorkflowTransitionValidator.validate(s, s);
      assert.equal(result.valid, true);
      assert.equal(result.isNoOp, true);
    }
  });

  test('validates standard progression OPEN -> ACKNOWLEDGED -> IN_PROGRESS -> RESOLVED -> CLOSED', () => {
    // OPEN -> ACKNOWLEDGED
    const r1 = WorkflowTransitionValidator.validate('OPEN', 'ACKNOWLEDGED');
    assert.equal(r1.valid, true);
    assert.equal(r1.isNoOp, false);

    // ACKNOWLEDGED -> IN_PROGRESS
    const r2 = WorkflowTransitionValidator.validate('ACKNOWLEDGED', 'IN_PROGRESS');
    assert.equal(r2.valid, true);

    // IN_PROGRESS -> RESOLVED
    const r3 = WorkflowTransitionValidator.validate('IN_PROGRESS', 'RESOLVED');
    assert.equal(r3.valid, true);
    assert.equal(r3.isResolution, true);

    // RESOLVED -> CLOSED
    const r4 = WorkflowTransitionValidator.validate('RESOLVED', 'CLOSED');
    assert.equal(r4.valid, true);
    assert.equal(r4.isClosure, true);
  });

  test('strictly forbids jumping directly from CLOSED to IN_PROGRESS or OPEN without reopening', () => {
    const r1 = WorkflowTransitionValidator.validate('CLOSED', 'IN_PROGRESS');
    assert.equal(r1.valid, false);
    assert.match(r1.reason ?? '', /explicitly reopened/i);

    const r2 = WorkflowTransitionValidator.validate('CLOSED', 'OPEN');
    assert.equal(r2.valid, false);
    assert.match(r2.reason ?? '', /explicitly reopened/i);
  });

  test('allows reopening from terminal or resolved states', () => {
    const fromResolved = WorkflowTransitionValidator.validate('RESOLVED', 'REOPENED');
    assert.equal(fromResolved.valid, true);
    assert.equal(fromResolved.isReopen, true);

    const fromClosed = WorkflowTransitionValidator.validate('CLOSED', 'REOPENED');
    assert.equal(fromClosed.valid, true);
    assert.equal(fromClosed.isReopen, true);

    const fromWontFix = WorkflowTransitionValidator.validate('WONT_FIX', 'REOPENED');
    assert.equal(fromWontFix.valid, true);
    assert.equal(fromWontFix.isReopen, true);

    const fromDuplicate = WorkflowTransitionValidator.validate('DUPLICATE', 'REOPENED');
    assert.equal(fromDuplicate.valid, true);
    assert.equal(fromDuplicate.isReopen, true);
  });

  test('correctly sets transition semantic flags (resolution, reopen, closure)', () => {
    assert.equal(WorkflowTransitionValidator.validate('OPEN', 'RESOLVED').isResolution, true);
    assert.equal(WorkflowTransitionValidator.validate('RESOLVED', 'REOPENED').isReopen, true);
    assert.equal(WorkflowTransitionValidator.validate('RESOLVED', 'CLOSED').isClosure, true);
  });

  test('getReachableStates returns accurate list of allowed targets', () => {
    const openReachable = WorkflowTransitionValidator.getReachableStates('OPEN');
    assert.ok(openReachable.includes('IN_PROGRESS'));
    assert.ok(openReachable.includes('RESOLVED'));
    assert.ok(openReachable.includes('WONT_FIX'));

    const closedReachable = WorkflowTransitionValidator.getReachableStates('CLOSED');
    assert.deepEqual(closedReachable, ['REOPENED']);
  });
});
