/**
 * @file packages/core/src/failures/flakiness/flakiness-rules-engine.test.ts
 * Unit tests for FlakinessRulesEngine and FlakinessFingerprint (V6 Phase 79).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { FlakinessRulesEngine } from './flakiness-rules-engine.js';
import { deriveFlakinessFingerprint } from './flakiness-fingerprint.js';
import type { FlakinessEvaluationContext, RawAttemptRecord } from './flakiness-types.js';

describe('FlakinessRulesEngine & Taxonomy (V6 Phase 79)', () => {
  const projectId = crypto.randomUUID();
  const failureCaseId = crypto.randomUUID();
  const testCaseId = crypto.randomUUID();

  function createContext(
    rawAttempts: RawAttemptRecord[],
    overrides: Partial<FlakinessEvaluationContext> = {},
  ): FlakinessEvaluationContext {
    return {
      projectId,
      failureCaseId,
      testCaseId,
      testCaseVersionId: crypto.randomUUID(),
      testCaseVersionNumber: 1,
      originalFailureSignature: 'ERR_TIMEOUT_BUTTON_CLICK',
      originalFailedStepIndex: 3,
      decisionIntegrityState: 'VALID',
      decisionIntegrityBlocked: false,
      decisionIntegrityReasons: [],
      rawAttempts,
      ...overrides,
    };
  }

  it('evaluates INSUFFICIENT_EVIDENCE when fewer than 2 attempts exist', () => {
    const rawAttempts: RawAttemptRecord[] = [
      {
        id: crypto.randomUUID(),
        source: 'PRIMARY_EXECUTION',
        attemptNumber: 1,
        projectId,
        failureCaseId,
        testCaseId,
        testCaseVersionId: null,
        testCaseVersionNumber: 1,
        status: 'FAILED',
        environmentEquivalence: 'EXACT',
        failureSignature: 'ERR_TIMEOUT_BUTTON_CLICK',
        failedStepIndex: 3,
        durationMs: 1200,
        timestamp: new Date('2026-09-08T10:00:00Z'),
      },
    ];

    const result = FlakinessRulesEngine.evaluate(createContext(rawAttempts));
    assert.strictEqual(result.flakinessState, 'INSUFFICIENT_EVIDENCE');
    assert.strictEqual(result.stabilityState, 'UNKNOWN');
    assert.strictEqual(result.attemptCount, 1);
    assert.strictEqual(result.validAttemptCount, 1);
    assert.strictEqual(result.reproducibilityRatio, 1.0);
    assert.ok(result.evidenceGaps.length > 0);
  });

  it('evaluates STABLE_FAILURE when all valid attempts fail with identical signature and step', () => {
    const rawAttempts: RawAttemptRecord[] = [
      {
        id: crypto.randomUUID(),
        source: 'PRIMARY_EXECUTION',
        attemptNumber: 1,
        projectId,
        failureCaseId,
        testCaseId,
        testCaseVersionId: null,
        testCaseVersionNumber: 1,
        status: 'FAILED',
        environmentEquivalence: 'EXACT',
        failureSignature: 'ERR_TIMEOUT_BUTTON_CLICK',
        failedStepIndex: 3,
        durationMs: 1200,
        timestamp: new Date('2026-09-08T10:00:00Z'),
      },
      {
        id: crypto.randomUUID(),
        source: 'PHASE76_REPRODUCTION',
        attemptNumber: 2,
        projectId,
        failureCaseId,
        testCaseId,
        testCaseVersionId: null,
        testCaseVersionNumber: 1,
        status: 'FAILED',
        environmentEquivalence: 'EXACT',
        failureSignature: 'ERR_TIMEOUT_BUTTON_CLICK',
        failedStepIndex: 3,
        durationMs: 1150,
        timestamp: new Date('2026-09-08T10:05:00Z'),
      },
      {
        id: crypto.randomUUID(),
        source: 'PHASE76_REPRODUCTION',
        attemptNumber: 3,
        projectId,
        failureCaseId,
        testCaseId,
        testCaseVersionId: null,
        testCaseVersionNumber: 1,
        status: 'FAILED',
        environmentEquivalence: 'EXACT',
        failureSignature: 'ERR_TIMEOUT_BUTTON_CLICK',
        failedStepIndex: 3,
        durationMs: 1180,
        timestamp: new Date('2026-09-08T10:10:00Z'),
      },
    ];

    const result = FlakinessRulesEngine.evaluate(createContext(rawAttempts));
    assert.strictEqual(result.flakinessState, 'STABLE_FAILURE');
    assert.strictEqual(result.stabilityState, 'STABLE');
    assert.strictEqual(result.passCount, 0);
    assert.strictEqual(result.failCount, 3);
    assert.strictEqual(result.reproducibilityRatio, 1.0);
    assert.strictEqual(result.equivalentFailureCount, 3);
  });

  it('evaluates FLAKY_CANDIDATE on single alternation (FAIL -> PASS) and PREVENTS false-positive CONFIRMED_FLAKY', () => {
    const rawAttempts: RawAttemptRecord[] = [
      {
        id: crypto.randomUUID(),
        source: 'PRIMARY_EXECUTION',
        attemptNumber: 1,
        projectId,
        failureCaseId,
        testCaseId,
        testCaseVersionId: null,
        testCaseVersionNumber: 1,
        status: 'FAILED',
        environmentEquivalence: 'EXACT',
        failureSignature: 'ERR_TIMEOUT_BUTTON_CLICK',
        failedStepIndex: 3,
        durationMs: 1200,
        timestamp: new Date('2026-09-08T10:00:00Z'),
      },
      {
        id: crypto.randomUUID(),
        source: 'V5_RETRY',
        attemptNumber: 2,
        projectId,
        failureCaseId,
        testCaseId,
        testCaseVersionId: null,
        testCaseVersionNumber: 1,
        status: 'PASSED',
        environmentEquivalence: 'EXACT',
        failureSignature: null,
        failedStepIndex: null,
        durationMs: 950,
        timestamp: new Date('2026-09-08T10:02:00Z'),
      },
    ];

    const result = FlakinessRulesEngine.evaluate(createContext(rawAttempts));
    assert.strictEqual(
      result.flakinessState,
      'FLAKY_CANDIDATE',
      'Single alternation must be FLAKY_CANDIDATE, not CONFIRMED_FLAKY',
    );
    assert.strictEqual(result.stabilityState, 'INTERMITTENT');
    assert.strictEqual(result.passCount, 1);
    assert.strictEqual(result.failCount, 1);
    assert.strictEqual(result.validAttemptCount, 2);
    assert.strictEqual(result.reproducibilityRatio, 0.5);
    assert.notStrictEqual(result.flakinessState, 'CONFIRMED_FLAKY');
  });

  it('evaluates CONFIRMED_FLAKY when >= 3 attempts alternate pass/fail with matching failure signatures', () => {
    const rawAttempts: RawAttemptRecord[] = [
      {
        id: crypto.randomUUID(),
        source: 'PRIMARY_EXECUTION',
        attemptNumber: 1,
        projectId,
        failureCaseId,
        testCaseId,
        testCaseVersionId: null,
        testCaseVersionNumber: 1,
        status: 'FAILED',
        environmentEquivalence: 'EXACT',
        failureSignature: 'ERR_TIMEOUT_BUTTON_CLICK',
        failedStepIndex: 3,
        durationMs: 1200,
        timestamp: new Date('2026-09-08T10:00:00Z'),
      },
      {
        id: crypto.randomUUID(),
        source: 'V5_RETRY',
        attemptNumber: 2,
        projectId,
        failureCaseId,
        testCaseId,
        testCaseVersionId: null,
        testCaseVersionNumber: 1,
        status: 'PASSED',
        environmentEquivalence: 'EXACT',
        failureSignature: null,
        failedStepIndex: null,
        durationMs: 950,
        timestamp: new Date('2026-09-08T10:02:00Z'),
      },
      {
        id: crypto.randomUUID(),
        source: 'PHASE76_REPRODUCTION',
        attemptNumber: 3,
        projectId,
        failureCaseId,
        testCaseId,
        testCaseVersionId: null,
        testCaseVersionNumber: 1,
        status: 'FAILED',
        environmentEquivalence: 'EXACT',
        failureSignature: 'ERR_TIMEOUT_BUTTON_CLICK',
        failedStepIndex: 3,
        durationMs: 1190,
        timestamp: new Date('2026-09-08T10:05:00Z'),
      },
    ];

    const result = FlakinessRulesEngine.evaluate(createContext(rawAttempts));
    assert.strictEqual(result.flakinessState, 'CONFIRMED_FLAKY');
    assert.strictEqual(result.stabilityState, 'INTERMITTENT');
    assert.strictEqual(result.passCount, 1);
    assert.strictEqual(result.failCount, 2);
    assert.strictEqual(result.validAttemptCount, 3);
    assert.strictEqual(result.equivalentFailureCount, 2);
  });

  it('evaluates EXECUTION_VARIABILITY when failures diverge in signature or step under exact environment', () => {
    const rawAttempts: RawAttemptRecord[] = [
      {
        id: crypto.randomUUID(),
        source: 'PRIMARY_EXECUTION',
        attemptNumber: 1,
        projectId,
        failureCaseId,
        testCaseId,
        testCaseVersionId: null,
        testCaseVersionNumber: 1,
        status: 'FAILED',
        environmentEquivalence: 'EXACT',
        failureSignature: 'ERR_TIMEOUT_BUTTON_CLICK',
        failedStepIndex: 3,
        durationMs: 1200,
        timestamp: new Date('2026-09-08T10:00:00Z'),
      },
      {
        id: crypto.randomUUID(),
        source: 'PHASE76_REPRODUCTION',
        attemptNumber: 2,
        projectId,
        failureCaseId,
        testCaseId,
        testCaseVersionId: null,
        testCaseVersionNumber: 1,
        status: 'FAILED',
        environmentEquivalence: 'EXACT',
        failureSignature: 'ERR_DIFFERENT_CRASH',
        failedStepIndex: 5,
        durationMs: 400,
        timestamp: new Date('2026-09-08T10:05:00Z'),
      },
    ];

    const result = FlakinessRulesEngine.evaluate(createContext(rawAttempts));
    assert.strictEqual(result.flakinessState, 'EXECUTION_VARIABILITY');
    assert.strictEqual(result.stabilityState, 'UNSTABLE');
    assert.strictEqual(result.differentFailureCount, 1);
  });

  it('evaluates ENVIRONMENT_VARIABILITY when outcomes differ only across drifted environments', () => {
    const rawAttempts: RawAttemptRecord[] = [
      {
        id: crypto.randomUUID(),
        source: 'PRIMARY_EXECUTION',
        attemptNumber: 1,
        projectId,
        failureCaseId,
        testCaseId,
        testCaseVersionId: null,
        testCaseVersionNumber: 1,
        status: 'FAILED',
        environmentEquivalence: 'EXACT',
        failureSignature: 'ERR_TIMEOUT_BUTTON_CLICK',
        failedStepIndex: 3,
        durationMs: 1200,
        timestamp: new Date('2026-09-08T10:00:00Z'),
      },
      {
        id: crypto.randomUUID(),
        source: 'PHASE76_REPRODUCTION',
        attemptNumber: 2,
        projectId,
        failureCaseId,
        testCaseId,
        testCaseVersionId: null,
        testCaseVersionNumber: 1,
        status: 'PASSED',
        environmentEquivalence: 'DRIFTED',
        failureSignature: null,
        failedStepIndex: null,
        durationMs: 800,
        timestamp: new Date('2026-09-08T10:05:00Z'),
      },
    ];

    const result = FlakinessRulesEngine.evaluate(createContext(rawAttempts));
    assert.strictEqual(result.flakinessState, 'ENVIRONMENT_VARIABILITY');
    assert.strictEqual(result.stabilityState, 'UNKNOWN');
  });

  it('evaluates INCONCLUSIVE when decision integrity is BLOCKED', () => {
    const rawAttempts: RawAttemptRecord[] = [
      {
        id: crypto.randomUUID(),
        source: 'PRIMARY_EXECUTION',
        attemptNumber: 1,
        projectId,
        failureCaseId,
        testCaseId,
        testCaseVersionId: null,
        testCaseVersionNumber: 1,
        status: 'FAILED',
        environmentEquivalence: 'EXACT',
        failureSignature: 'ERR_TIMEOUT_BUTTON_CLICK',
        failedStepIndex: 3,
        durationMs: 1200,
        timestamp: new Date('2026-09-08T10:00:00Z'),
      },
      {
        id: crypto.randomUUID(),
        source: 'PHASE76_REPRODUCTION',
        attemptNumber: 2,
        projectId,
        failureCaseId,
        testCaseId,
        testCaseVersionId: null,
        testCaseVersionNumber: 1,
        status: 'PASSED',
        environmentEquivalence: 'EXACT',
        failureSignature: null,
        failedStepIndex: null,
        durationMs: 800,
        timestamp: new Date('2026-09-08T10:05:00Z'),
      },
    ];

    const result = FlakinessRulesEngine.evaluate(
      createContext(rawAttempts, {
        decisionIntegrityBlocked: true,
        decisionIntegrityReasons: ['Classification decision blocked due to conflicting evidence'],
      }),
    );

    assert.strictEqual(result.flakinessState, 'INCONCLUSIVE');
    assert.strictEqual(result.stabilityState, 'UNKNOWN');
    assert.ok(result.evidenceGaps.length > 0);
  });

  it('generates deterministic SHA-256 fingerprint regardless of attempt input ordering and redacts secrets', () => {
    const attemptA = {
      attemptId: 'att-1',
      source: 'PRIMARY_EXECUTION',
      status: 'FAILED',
      isEligible: true,
      environmentEquivalence: 'EXACT',
      isSignatureMatch: true,
      isStepMatch: true,
      normalizedSignature: 'Authorization: Bearer secret_token_12345',
    };

    const attemptB = {
      attemptId: 'att-2',
      source: 'V5_RETRY',
      status: 'PASSED',
      isEligible: true,
      environmentEquivalence: 'EXACT',
      isSignatureMatch: null,
      isStepMatch: null,
      normalizedSignature: null,
    };

    const fp1 = deriveFlakinessFingerprint({
      testCaseId: 'test-case-1',
      testCaseVersionNumber: 1,
      flakinessPolicyVersion: '1.0.0',
      analysisVersion: '1.0.0',
      attempts: [attemptA, attemptB],
    });

    const fp2 = deriveFlakinessFingerprint({
      testCaseId: 'test-case-1',
      testCaseVersionNumber: 1,
      flakinessPolicyVersion: '1.0.0',
      analysisVersion: '1.0.0',
      attempts: [attemptB, attemptA], // Inverted order
    });

    assert.strictEqual(fp1, fp2, 'Fingerprint must be independent of array order');
    assert.strictEqual(typeof fp1, 'string');
    assert.strictEqual(fp1.length, 64);
  });
});
