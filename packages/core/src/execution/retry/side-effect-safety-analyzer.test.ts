/**
 * @file packages/core/src/execution/retry/side-effect-safety-analyzer.test.ts
 * Unit tests for SideEffectSafetyAnalyzer detecting mutating actions vs idempotent read-only flows.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SideEffectSafetyAnalyzer } from './side-effect-safety-analyzer.js';
import type { ExecutablePlanStepDto } from '@ai-quality/contracts';

describe('SideEffectSafetyAnalyzer', () => {
  const analyzer = new SideEffectSafetyAnalyzer();

  it('classifies empty plan as safe to retry', () => {
    const res = analyzer.analyzePlan([]);
    assert.equal(res.isSafe, true);
    assert.equal(res.safetyLevel, 'SAFE_TO_RETRY');
    assert.equal(res.mutatingStepIndices.length, 0);
  });

  it('classifies read-only navigation and assertion steps as safe to retry', () => {
    const steps: ExecutablePlanStepDto[] = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        sequence: 1,
        action: 'NAVIGATE',
        description: 'Navigate to dashboard',
        isOptional: false,
        assertions: [],
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        sequence: 2,
        action: 'WAIT_FOR_ELEMENT',
        description: 'Wait for dashboard stats widget',
        target: { kind: 'ELEMENT', role: 'heading', name: 'Dashboard' },
        isOptional: false,
        assertions: [],
      },
      {
        id: '00000000-0000-0000-0000-000000000003',
        sequence: 3,
        action: 'CLICK',
        description: 'Click view details tab',
        target: { kind: 'CONTROL', role: 'tab', name: 'Analytics' },
        isOptional: false,
        assertions: [],
      },
    ];

    const res = analyzer.analyzePlan(steps);
    assert.equal(res.isSafe, true);
    assert.equal(res.safetyLevel, 'SAFE_TO_RETRY');
    assert.equal(res.mutatingStepIndices.length, 0);
  });

  it('identifies mutating action types (FILL, CHECK, SELECT_OPTION, UPLOAD_FILE)', () => {
    const steps: ExecutablePlanStepDto[] = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        sequence: 1,
        action: 'NAVIGATE',
        description: 'Open login',
        isOptional: false,
        assertions: [],
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        sequence: 2,
        action: 'FILL',
        description: 'Enter username',
        target: { kind: 'FIELD', role: 'textbox', name: 'Username' },
        isOptional: false,
        assertions: [],
      },
    ];

    const res = analyzer.analyzePlan(steps);
    assert.equal(res.isSafe, false);
    assert.equal(res.safetyLevel, 'NOT_SAFE_TO_RETRY');
    assert.deepEqual(res.mutatingStepIndices, [2]);
  });

  it('identifies mutating keywords in action text or selectors (submit, delete, pay, purchase)', () => {
    const steps: ExecutablePlanStepDto[] = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        sequence: 1,
        action: 'CLICK',
        description: 'Click Submit Payment order button',
        target: { kind: 'CONTROL', role: 'button', name: 'Submit Payment' },
        isOptional: false,
        assertions: [],
      },
    ];

    const res = analyzer.analyzePlan(steps);
    assert.equal(res.isSafe, false);
    assert.equal(res.safetyLevel, 'NOT_SAFE_TO_RETRY');
    assert.deepEqual(res.mutatingStepIndices, [1]);
  });

  it('permits retry when failure occurred at step 1 before reaching mutating step 3', () => {
    const steps: ExecutablePlanStepDto[] = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        sequence: 1,
        action: 'NAVIGATE',
        description: 'Open checkout page',
        isOptional: false,
        assertions: [],
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        sequence: 2,
        action: 'WAIT_FOR_ELEMENT',
        description: 'Wait for cart header',
        target: { kind: 'ELEMENT', role: 'heading', name: 'Cart' },
        isOptional: false,
        assertions: [],
      },
      {
        id: '00000000-0000-0000-0000-000000000003',
        sequence: 3,
        action: 'CLICK',
        description: 'Click submit order',
        target: { kind: 'CONTROL', role: 'button', name: 'Submit Order' },
        isOptional: false,
        assertions: [],
      },
    ];

    // Failure happened at step 1 (navigation timed out)
    const res = analyzer.analyzePlan(steps, 1);
    assert.equal(res.isSafe, true);
    assert.equal(res.safetyLevel, 'SAFE_TO_RETRY');
    assert.ok(res.reason.includes('before reaching any mutating steps'));
  });

  it('blocks retry when failure occurred at step 2 (on the mutating submit payment step)', () => {
    const steps: ExecutablePlanStepDto[] = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        sequence: 1,
        action: 'NAVIGATE',
        description: 'Open checkout page',
        isOptional: false,
        assertions: [],
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        sequence: 2,
        action: 'CLICK',
        description: 'Click submit payment',
        target: { kind: 'CONTROL', role: 'button', name: 'Submit Payment' },
        isOptional: false,
        assertions: [],
      },
    ];

    const res = analyzer.analyzePlan(steps, 2);
    assert.equal(res.isSafe, false);
    assert.equal(res.safetyLevel, 'NOT_SAFE_TO_RETRY');
  });
});
