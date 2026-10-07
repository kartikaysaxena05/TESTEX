/**
 * @file packages/core/src/execution/retry/retry-policy-engine.ts
 * Centralized, bounded retry decision engine for autonomous web test execution.
 */

import type { RetryPolicyConfigDto, RetryDecisionDto, RetryCategory } from '@ai-quality/contracts';
import {
  DEFAULT_EXECUTION_RETRY_POLICY,
  RETRY_BOUNDS,
  type IRetryPolicyEngine,
  type RetryEvaluationContext,
} from './retry-types.js';
import { SideEffectSafetyAnalyzer } from './side-effect-safety-analyzer.js';
import { RetryPolicyValidationError } from './retry-errors.js';
import type { ILogger } from '../../logging/index.js';

export class RetryPolicyEngine implements IRetryPolicyEngine {
  public readonly config: RetryPolicyConfigDto;
  private readonly safetyAnalyzer: SideEffectSafetyAnalyzer;
  private readonly logger?: ILogger;

  constructor(config?: Partial<RetryPolicyConfigDto>, logger?: ILogger) {
    this.config = this.validateAndNormalizeConfig(config);
    this.safetyAnalyzer = new SideEffectSafetyAnalyzer();
    this.logger = logger;
  }

  /**
   * Validates and normalizes retry policy configuration with hard upper and lower bounds.
   */
  private validateAndNormalizeConfig(
    partialConfig?: Partial<RetryPolicyConfigDto>,
  ): RetryPolicyConfigDto {
    const raw = { ...DEFAULT_EXECUTION_RETRY_POLICY, ...(partialConfig ?? {}) };

    if (
      typeof raw.maxAttempts !== 'number' ||
      isNaN(raw.maxAttempts) ||
      !isFinite(raw.maxAttempts) ||
      raw.maxAttempts < RETRY_BOUNDS.MIN_ATTEMPTS ||
      raw.maxAttempts > RETRY_BOUNDS.MAX_ATTEMPTS
    ) {
      throw new RetryPolicyValidationError(
        `Invalid maxAttempts '${raw.maxAttempts}'. Must be an integer between ${RETRY_BOUNDS.MIN_ATTEMPTS} and ${RETRY_BOUNDS.MAX_ATTEMPTS}.`,
      );
    }

    if (
      typeof raw.retryDelayMs !== 'number' ||
      isNaN(raw.retryDelayMs) ||
      !isFinite(raw.retryDelayMs) ||
      raw.retryDelayMs < RETRY_BOUNDS.MIN_DELAY_MS ||
      raw.retryDelayMs > RETRY_BOUNDS.MAX_DELAY_MS
    ) {
      throw new RetryPolicyValidationError(
        `Invalid retryDelayMs '${raw.retryDelayMs}'. Must be between ${RETRY_BOUNDS.MIN_DELAY_MS} and ${RETRY_BOUNDS.MAX_DELAY_MS}ms.`,
      );
    }

    if (
      typeof raw.backoffMultiplier !== 'number' ||
      isNaN(raw.backoffMultiplier) ||
      !isFinite(raw.backoffMultiplier) ||
      raw.backoffMultiplier < RETRY_BOUNDS.MIN_BACKOFF_MULTIPLIER ||
      raw.backoffMultiplier > RETRY_BOUNDS.MAX_BACKOFF_MULTIPLIER
    ) {
      throw new RetryPolicyValidationError(
        `Invalid backoffMultiplier '${raw.backoffMultiplier}'. Must be between ${RETRY_BOUNDS.MIN_BACKOFF_MULTIPLIER} and ${RETRY_BOUNDS.MAX_BACKOFF_MULTIPLIER}.`,
      );
    }

    return {
      enabled: Boolean(raw.enabled),
      maxAttempts: Math.floor(raw.maxAttempts),
      retryDelayMs: Math.floor(raw.retryDelayMs),
      backoffMultiplier: Number(raw.backoffMultiplier),
      retryOnAssertionFailure: Boolean(raw.retryOnAssertionFailure),
      retryableCategories: Array.isArray(raw.retryableCategories)
        ? raw.retryableCategories
        : DEFAULT_EXECUTION_RETRY_POLICY.retryableCategories,
      freshContextOnRetry: raw.freshContextOnRetry ?? 'ALWAYS',
      sideEffectSafetyPolicy: raw.sideEffectSafetyPolicy ?? 'SAFE_ONLY',
    };
  }

  /**
   * Classifies an error into a standard RetryCategory based on message, error code, and error type.
   */
  public classifyFailureCategory(error: unknown, errorCode?: string | null): RetryCategory {
    const errorStr = error instanceof Error ? error.message : String(error ?? '');
    const code = errorCode ?? (error as any)?.code ?? '';

    // 1. Explicit Error Codes
    if (code === 'NAVIGATION_TIMEOUT' || code === 'WAIT_TIMEOUT' || code === 'ACTION_TIMEOUT') {
      return 'TIMEOUT';
    }
    if (code === 'BROWSER_CRASHED' || code === 'BROWSER_DISCONNECTED') {
      return 'BROWSER_CRASH';
    }
    if (code === 'CONTEXT_CLOSED' || code === 'SESSION_CLOSED') {
      return 'CONTEXT_CLOSED';
    }
    if (code === 'ASSERTION_FAILED') {
      return 'ASSERTION_FAILURE';
    }

    // 2. Pattern Matching on Error Text
    if (/timeout|timed out|exceeded \d+ms/i.test(errorStr)) {
      return 'TIMEOUT';
    }
    if (
      /browser has been closed|browser closed|target closed|crash|crashed|disconnected/i.test(
        errorStr,
      )
    ) {
      return 'BROWSER_CRASH';
    }
    if (/context closed|page closed|execution context was destroyed/i.test(errorStr)) {
      return 'CONTEXT_CLOSED';
    }
    if (
      /net::ERR_|connection reset|fetch failed|ECONNREFUSED|ENOTFOUND|network error|DNS/i.test(
        errorStr,
      )
    ) {
      return 'NETWORK_ERROR';
    }
    if (
      /element is not attached|detached from DOM|Node is detached|not visible|stale element/i.test(
        errorStr,
      )
    ) {
      return 'TRANSIENT_DOM_ERROR';
    }
    if (
      /assertion failed|expected .* to (?:be|equal|contain|have|match)|assertion error/i.test(
        errorStr,
      )
    ) {
      return 'ASSERTION_FAILURE';
    }

    return 'AUTOMATION_ERROR';
  }

  /**
   * Evaluates whether a failed execution attempt is eligible for retry under current policy and safety rules.
   */
  public async evaluateDecision(context: RetryEvaluationContext): Promise<RetryDecisionDto> {
    const remainingAttempts = Math.max(0, this.config.maxAttempts - context.currentAttemptNumber);

    // 1. Check if policy is disabled
    if (!this.config.enabled) {
      return {
        shouldRetry: false,
        reason: 'Retry policy is globally disabled in configuration.',
        category: context.failureCategory,
        attemptNumber: context.currentAttemptNumber,
        remainingAttempts,
        safetyLevel: 'UNKNOWN',
        delayMs: 0,
      };
    }

    // 2. Cooperative Cancellation Check: Cancellation ALWAYS preempts retry
    if (context.abortSignal?.aborted) {
      return {
        shouldRetry: false,
        reason: 'Execution was cancelled by user request; subsequent retries preempted.',
        category: context.failureCategory,
        attemptNumber: context.currentAttemptNumber,
        remainingAttempts: 0,
        safetyLevel: 'SAFE_TO_RETRY',
        delayMs: 0,
      };
    }

    // 3. Attempt Limit Check
    if (context.currentAttemptNumber >= this.config.maxAttempts) {
      return {
        shouldRetry: false,
        reason: `Maximum configured attempts (${this.config.maxAttempts}) exhausted for this execution.`,
        category: context.failureCategory,
        attemptNumber: context.currentAttemptNumber,
        remainingAttempts: 0,
        safetyLevel: 'UNKNOWN',
        delayMs: 0,
      };
    }

    // 4. Failure Category Eligibility Check
    if (context.failureCategory === 'ASSERTION_FAILURE' && !this.config.retryOnAssertionFailure) {
      return {
        shouldRetry: false,
        reason:
          'Assertion failure occurred; automatic retry on assertion mismatches is disabled to prevent duplicate side effects.',
        category: context.failureCategory,
        attemptNumber: context.currentAttemptNumber,
        remainingAttempts,
        safetyLevel: 'NOT_SAFE_TO_RETRY',
        delayMs: 0,
      };
    }

    if (!this.config.retryableCategories.includes(context.failureCategory)) {
      return {
        shouldRetry: false,
        reason: `Failure category '${context.failureCategory}' is not in the configured retryable failure categories.`,
        category: context.failureCategory,
        attemptNumber: context.currentAttemptNumber,
        remainingAttempts,
        safetyLevel: 'UNKNOWN',
        delayMs: 0,
      };
    }

    // 5. Side-Effect Safety Analysis
    let safetyLevel: import('@ai-quality/contracts').SideEffectSafetyLevel = 'SAFE_TO_RETRY';
    if (context.planSteps && context.planSteps.length > 0) {
      const safety = this.safetyAnalyzer.analyzePlan(context.planSteps, context.failedStepIndex);
      safetyLevel = safety.safetyLevel;

      if (!safety.isSafe && this.config.sideEffectSafetyPolicy === 'SAFE_ONLY') {
        return {
          shouldRetry: false,
          reason: `Retry blocked by side-effect safety policy: ${safety.reason}`,
          category: context.failureCategory,
          attemptNumber: context.currentAttemptNumber,
          remainingAttempts,
          safetyLevel,
          delayMs: 0,
        };
      }
    }

    // 6. Compute Exponential Backoff Delay
    const exponent = Math.max(0, context.currentAttemptNumber - 1);
    const calculatedDelay = Math.round(
      this.config.retryDelayMs * Math.pow(this.config.backoffMultiplier, exponent),
    );
    const delayMs = Math.min(RETRY_BOUNDS.MAX_DELAY_MS, calculatedDelay);

    this.logger?.info('retry_policy.decision_eligible', {
      testRunId: context.testRunId,
      currentAttempt: context.currentAttemptNumber,
      nextAttempt: context.currentAttemptNumber + 1,
      category: context.failureCategory,
      delayMs,
    });

    return {
      shouldRetry: true,
      reason: `Attempt ${context.currentAttemptNumber} failed with retryable category '${context.failureCategory}'. Scheduling attempt ${context.currentAttemptNumber + 1} with ${delayMs}ms delay.`,
      category: context.failureCategory,
      attemptNumber: context.currentAttemptNumber,
      remainingAttempts,
      safetyLevel,
      delayMs,
    };
  }
}
