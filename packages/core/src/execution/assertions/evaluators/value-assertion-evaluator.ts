/**
 * @file packages/core/src/execution/assertions/evaluators/value-assertion-evaluator.ts
 * Evaluates form input/select/textarea value assertions (VALUE_EQUALS / VALUE_CONTAINS).
 */

import type {
  AssertionOperator,
  AssertionOptionsDto,
  AssertionType,
  ExecutableAssertionDto,
} from '@ai-quality/contracts';
import { BaseAssertionEvaluator } from './base-assertion-evaluator.js';
import type { AssertionExecutionContext } from '../assertion-types.js';
import { AssertionComparator } from '../assertion-comparator.js';
import { InvalidExpectedValueError } from '../assertion-errors.js';

export class ValueAssertionEvaluator extends BaseAssertionEvaluator {
  public readonly supportedTypes: readonly AssertionType[] = ['VALUE_EQUALS', 'VALUE_CONTAINS'];

  protected async evaluateInternal(
    assertion: ExecutableAssertionDto,
    operator: AssertionOperator,
    resolvedExpected: unknown,
    context: AssertionExecutionContext,
    timeoutMs: number,
    options?: AssertionOptionsDto,
  ): Promise<{
    status: 'PASSED' | 'FAILED' | 'ERROR' | 'UNSUPPORTED';
    expected?: unknown;
    actual?: unknown;
    targetSummary?: string;
    message?: string;
    errorCode?: string;
    errorMessage?: string;
  }> {
    if (resolvedExpected === undefined || resolvedExpected === null) {
      throw new InvalidExpectedValueError('Expected input value is required for VALUE assertions.');
    }

    const locator = await this.resolveTargetLocator(assertion.target, context);
    const targetSummary = this.summarizeTarget(assertion.target);

    const tStart = performance.now();
    let actualValue = '';
    let lastComparison = AssertionComparator.compare(
      operator,
      resolvedExpected,
      actualValue,
      options,
    );

    while (performance.now() - tStart < timeoutMs) {
      try {
        actualValue = await locator.inputValue({ timeout: 500 });
        lastComparison = AssertionComparator.compare(
          operator,
          resolvedExpected,
          actualValue,
          options,
        );
        if (lastComparison.matches) {
          break;
        }
      } catch {
        // Retry within bounded timeout
      }

      await new Promise(r => setTimeout(r, 50));
    }

    if (lastComparison.matches) {
      return {
        status: 'PASSED',
        expected: lastComparison.normalizedExpected,
        actual: lastComparison.normalizedActual,
        targetSummary,
        message: `Field ${targetSummary} value matched expected "${String(lastComparison.normalizedExpected)}".`,
      };
    }

    return {
      status: 'FAILED',
      expected: lastComparison.normalizedExpected,
      actual: lastComparison.normalizedActual,
      targetSummary,
      errorCode: 'ASSERTION_FAILED',
      errorMessage:
        lastComparison.failureReason ||
        `Field ${targetSummary} expected value "${String(lastComparison.normalizedExpected)}", but observed "${String(lastComparison.normalizedActual)}".`,
    };
  }
}
