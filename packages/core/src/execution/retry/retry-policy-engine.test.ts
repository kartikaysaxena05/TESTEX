/**
 * @file packages/core/src/execution/retry/retry-policy-engine.test.ts
 * Unit tests for the RetryPolicyEngine, bounds validation, failure categorization, and decision evaluation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RetryPolicyEngine } from './retry-policy-engine.js';
import { RetryPolicyValidationError } from './retry-errors.js';

describe('RetryPolicyEngine', () => {
  describe('Configuration Validation and Normalization', () => {
    it('uses default policy configuration when no options provided', () => {
      const engine = new RetryPolicyEngine();
      assert.equal(engine.config.enabled, true);
      assert.equal(engine.config.maxAttempts, 3);
      assert.equal(engine.config.retryDelayMs, 1000);
      assert.equal(engine.config.backoffMultiplier, 1.5);
      assert.equal(engine.config.retryOnAssertionFailure, false);
      assert.equal(engine.config.sideEffectSafetyPolicy, 'SAFE_ONLY');
    });

    it('accepts valid custom configuration within bounds', () => {
      const engine = new RetryPolicyEngine({
        enabled: true,
        maxAttempts: 5,
        retryDelayMs: 2500,
        backoffMultiplier: 2.0,
        retryOnAssertionFailure: true,
      });

      assert.equal(engine.config.maxAttempts, 5);
      assert.equal(engine.config.retryDelayMs, 2500);
      assert.equal(engine.config.backoffMultiplier, 2.0);
      assert.equal(engine.config.retryOnAssertionFailure, true);
    });

    it('rejects invalid maxAttempts (< 1, > 5, NaN, Infinity)', () => {
      assert.throws(() => new RetryPolicyEngine({ maxAttempts: 0 }), RetryPolicyValidationError);
      assert.throws(() => new RetryPolicyEngine({ maxAttempts: -1 }), RetryPolicyValidationError);
      assert.throws(() => new RetryPolicyEngine({ maxAttempts: 6 }), RetryPolicyValidationError);
      assert.throws(() => new RetryPolicyEngine({ maxAttempts: NaN }), RetryPolicyValidationError);
      assert.throws(
        () => new RetryPolicyEngine({ maxAttempts: Infinity }),
        RetryPolicyValidationError,
      );
    });

    it('rejects invalid retryDelayMs (< 0, > 30000ms, NaN)', () => {
      assert.throws(
        () => new RetryPolicyEngine({ retryDelayMs: -100 }),
        RetryPolicyValidationError,
      );
      assert.throws(
        () => new RetryPolicyEngine({ retryDelayMs: 35000 }),
        RetryPolicyValidationError,
      );
      assert.throws(() => new RetryPolicyEngine({ retryDelayMs: NaN }), RetryPolicyValidationError);
    });

    it('rejects invalid backoffMultiplier (< 1.0, > 5.0, NaN)', () => {
      assert.throws(
        () => new RetryPolicyEngine({ backoffMultiplier: 0.5 }),
        RetryPolicyValidationError,
      );
      assert.throws(
        () => new RetryPolicyEngine({ backoffMultiplier: 6.0 }),
        RetryPolicyValidationError,
      );
      assert.throws(
        () => new RetryPolicyEngine({ backoffMultiplier: NaN }),
        RetryPolicyValidationError,
      );
    });
  });

  describe('Failure Category Classification', () => {
    const engine = new RetryPolicyEngine();

    it('classifies explicit error codes correctly', () => {
      assert.equal(engine.classifyFailureCategory('any', 'NAVIGATION_TIMEOUT'), 'TIMEOUT');
      assert.equal(engine.classifyFailureCategory('any', 'WAIT_TIMEOUT'), 'TIMEOUT');
      assert.equal(engine.classifyFailureCategory('any', 'BROWSER_CRASHED'), 'BROWSER_CRASH');
      assert.equal(engine.classifyFailureCategory('any', 'BROWSER_DISCONNECTED'), 'BROWSER_CRASH');
      assert.equal(engine.classifyFailureCategory('any', 'CONTEXT_CLOSED'), 'CONTEXT_CLOSED');
      assert.equal(engine.classifyFailureCategory('any', 'ASSERTION_FAILED'), 'ASSERTION_FAILURE');
    });

    it('classifies timeout patterns in error message', () => {
      assert.equal(
        engine.classifyFailureCategory(
          new Error('Timeout 30000ms exceeded while waiting for element'),
        ),
        'TIMEOUT',
      );
      assert.equal(engine.classifyFailureCategory('Navigation timed out after 15000ms'), 'TIMEOUT');
    });

    it('classifies browser and process crashes', () => {
      assert.equal(
        engine.classifyFailureCategory('Target page, context or browser has been closed'),
        'BROWSER_CRASH',
      );
      assert.equal(
        engine.classifyFailureCategory('Browser process crashed unexpectedly'),
        'BROWSER_CRASH',
      );
      assert.equal(engine.classifyFailureCategory('Browser disconnected'), 'BROWSER_CRASH');
    });

    it('classifies network transient failures', () => {
      assert.equal(
        engine.classifyFailureCategory('net::ERR_CONNECTION_RESET at https://app.internal'),
        'NETWORK_ERROR',
      );
      assert.equal(
        engine.classifyFailureCategory('fetch failed with ECONNREFUSED'),
        'NETWORK_ERROR',
      );
    });

    it('classifies transient DOM detached errors', () => {
      assert.equal(
        engine.classifyFailureCategory('Element is not attached to the DOM - stale reference'),
        'TRANSIENT_DOM_ERROR',
      );
    });

    it('classifies hard assertion mismatch errors', () => {
      assert.equal(
        engine.classifyFailureCategory(
          'Assertion failed: expected "Welcome Alice" to equal "Welcome Bob"',
        ),
        'ASSERTION_FAILURE',
      );
    });

    it('falls back to AUTOMATION_ERROR for unknown generic errors', () => {
      assert.equal(
        engine.classifyFailureCategory('Cannot read properties of undefined (reading foo)'),
        'AUTOMATION_ERROR',
      );
    });
  });

  describe('evaluateDecision Evaluation', () => {
    it('returns shouldRetry: false when retry policy is globally disabled', async () => {
      const engine = new RetryPolicyEngine({ enabled: false });
      const decision = await engine.evaluateDecision({
        projectId: '00000000-0000-0000-0000-000000000001',
        testRunId: '00000000-0000-0000-0000-000000000002',
        currentAttemptNumber: 1,
        failureCategory: 'TIMEOUT',
      });

      assert.equal(decision.shouldRetry, false);
      assert.ok(decision.reason.includes('globally disabled'));
    });

    it('returns shouldRetry: false immediately when cooperative cancellation is requested', async () => {
      const engine = new RetryPolicyEngine();
      const abortController = new AbortController();
      abortController.abort();

      const decision = await engine.evaluateDecision({
        projectId: '00000000-0000-0000-0000-000000000001',
        testRunId: '00000000-0000-0000-0000-000000000002',
        currentAttemptNumber: 1,
        failureCategory: 'TIMEOUT',
        abortSignal: abortController.signal,
      });

      assert.equal(decision.shouldRetry, false);
      assert.ok(decision.reason.includes('cancelled'));
    });

    it('returns shouldRetry: false when maxAttempts is exhausted', async () => {
      const engine = new RetryPolicyEngine({ maxAttempts: 2 });
      const decision = await engine.evaluateDecision({
        projectId: '00000000-0000-0000-0000-000000000001',
        testRunId: '00000000-0000-0000-0000-000000000002',
        currentAttemptNumber: 2,
        failureCategory: 'TIMEOUT',
      });

      assert.equal(decision.shouldRetry, false);
      assert.ok(decision.reason.includes('exhausted'));
      assert.equal(decision.remainingAttempts, 0);
    });

    it('blocks assertion failures from retrying when retryOnAssertionFailure is false', async () => {
      const engine = new RetryPolicyEngine({ retryOnAssertionFailure: false });
      const decision = await engine.evaluateDecision({
        projectId: '00000000-0000-0000-0000-000000000001',
        testRunId: '00000000-0000-0000-0000-000000000002',
        currentAttemptNumber: 1,
        failureCategory: 'ASSERTION_FAILURE',
      });

      assert.equal(decision.shouldRetry, false);
      assert.ok(decision.reason.includes('Assertion failure occurred'));
    });

    it('approves transient timeout for retry with bounded exponential backoff', async () => {
      const engine = new RetryPolicyEngine({
        maxAttempts: 3,
        retryDelayMs: 1000,
        backoffMultiplier: 2.0,
      });

      // Attempt 1 -> Attempt 2: delay = 1000 * 2^0 = 1000ms
      const decision1 = await engine.evaluateDecision({
        projectId: '00000000-0000-0000-0000-000000000001',
        testRunId: '00000000-0000-0000-0000-000000000002',
        currentAttemptNumber: 1,
        failureCategory: 'TIMEOUT',
      });

      assert.equal(decision1.shouldRetry, true);
      assert.equal(decision1.delayMs, 1000);
      assert.equal(decision1.remainingAttempts, 2);

      // Attempt 2 -> Attempt 3: delay = 1000 * 2^1 = 2000ms
      const decision2 = await engine.evaluateDecision({
        projectId: '00000000-0000-0000-0000-000000000001',
        testRunId: '00000000-0000-0000-0000-000000000002',
        currentAttemptNumber: 2,
        failureCategory: 'TIMEOUT',
      });

      assert.equal(decision2.shouldRetry, true);
      assert.equal(decision2.delayMs, 2000);
      assert.equal(decision2.remainingAttempts, 1);
    });
  });
});
