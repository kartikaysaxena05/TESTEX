/**
 * @file packages/core/src/execution/assertions/assertion-engine.ts
 * Authoritative Assertion & Expected-vs-Actual Verification Engine.
 */

import type {
  AssertionOptionsDto,
  AssertionResultDto,
  ExecutableAssertionDto,
  StepAssertionEvaluationResultDto,
} from '@ai-quality/contracts';
import { type AssertionExecutionContext } from './assertion-types.js';
import { AssertionEvaluatorRegistry } from './assertion-evaluator-registry.js';
import { SecretRedactor } from '../sessions/secret-redactor.js';
import type { ILogger } from '../../logging/index.js';

export class AssertionEngine {
  private readonly registry: AssertionEvaluatorRegistry;
  private readonly secretRedactor: SecretRedactor;
  private readonly logger?: ILogger;

  constructor(
    registry?: AssertionEvaluatorRegistry,
    secretRedactor?: SecretRedactor,
    logger?: ILogger,
  ) {
    this.registry = registry ?? new AssertionEvaluatorRegistry();
    this.secretRedactor = secretRedactor ?? new SecretRedactor();
    this.logger = logger;
  }

  /**
   * Evaluates a single assertion deterministically against the execution context.
   */
  public async evaluateAssertion(
    assertion: ExecutableAssertionDto,
    context: AssertionExecutionContext,
    options?: AssertionOptionsDto,
  ): Promise<AssertionResultDto> {
    const evaluator = this.registry.getEvaluator(assertion.type);

    this.logger?.info('assertion_engine.evaluation_started', {
      testRunId: context.testRunId,
      assertionId: assertion.id,
      assertionType: assertion.type,
      stepId: context.stepId,
    });

    const result = await evaluator.evaluate(assertion, context, options);

    this.logger?.info('assertion_engine.evaluation_completed', {
      testRunId: context.testRunId,
      assertionId: assertion.id,
      status: result.status,
      durationMs: result.durationMs,
      errorCode: result.errorCode,
    });

    return result;
  }

  /**
   * Evaluates all assertions configured for a single test step in deterministic sequence.
   * Enforces hard vs soft assertion policy (hard assertions halt step evaluation on failure).
   */
  public async evaluateStepAssertions(
    stepId: string,
    assertions: readonly ExecutableAssertionDto[],
    context: AssertionExecutionContext,
    options?: AssertionOptionsDto,
  ): Promise<StepAssertionEvaluationResultDto> {
    const tStart = performance.now();
    const results: AssertionResultDto[] = [];
    let passedCount = 0;
    let failedCount = 0;
    let errorCount = 0;

    for (const assertion of assertions) {
      // 1. Check if execution was cancelled before evaluating assertion
      if (context.abortSignal?.aborted) {
        const cancelledResult: AssertionResultDto = {
          assertionId: assertion.id,
          stepId,
          testRunId: context.testRunId,
          projectId: context.projectId,
          assertionType: assertion.type,
          operator: 'EQUALS',
          status: 'CANCELLED',
          isHard: options?.isHard ?? true,
          durationMs: 0,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          errorMessage: 'Step assertion evaluation cancelled by user request.',
          errorCode: 'ACTION_CANCELLED',
        };
        results.push(cancelledResult);
        break;
      }

      // 2. Evaluate individual assertion
      const result = await this.evaluateAssertion(assertion, { ...context, stepId }, options);
      results.push(result);

      if (result.status === 'PASSED') {
        passedCount++;
      } else if (result.status === 'FAILED') {
        failedCount++;
      } else if (result.status === 'ERROR') {
        errorCount++;
      }

      // 3. Hard vs Soft Assertion Policy:
      // Hard assertions stop sequence on failure/error
      const isHard = result.isHard;
      if (isHard && (result.status === 'FAILED' || result.status === 'ERROR')) {
        this.logger?.warn('assertion_engine.step_assertions_halted_on_hard_failure', {
          stepId,
          testRunId: context.testRunId,
          failedAssertionId: assertion.id,
          status: result.status,
        });
        break;
      }
    }

    const durationMs = Math.max(0, Math.round(performance.now() - tStart));

    // Derive aggregated step assertion status
    let status: StepAssertionEvaluationResultDto['status'] = 'PASSED';
    let errorMessage: string | undefined;

    if (errorCount > 0) {
      status = 'ERROR';
      const firstError = results.find(r => r.status === 'ERROR');
      errorMessage = firstError?.errorMessage || 'Step assertion encountered an automation error.';
    } else if (failedCount > 0) {
      status = 'FAILED';
      const firstFailure = results.find(r => r.status === 'FAILED');
      errorMessage = firstFailure?.errorMessage || 'One or more required assertions failed.';
    } else if (results.some(r => r.status === 'CANCELLED')) {
      status = 'CANCELLED';
      errorMessage = 'Step assertions were cancelled.';
    }

    return {
      stepId,
      status,
      results,
      passedCount,
      failedCount,
      errorCount,
      durationMs,
      errorMessage,
    };
  }
}

let singletonAssertionEngine: AssertionEngine | null = null;

export function getAssertionEngine(): AssertionEngine {
  if (!singletonAssertionEngine) {
    singletonAssertionEngine = new AssertionEngine();
  }
  return singletonAssertionEngine;
}

export function setAssertionEngineForTest(engine: AssertionEngine | null): void {
  singletonAssertionEngine = engine;
}
