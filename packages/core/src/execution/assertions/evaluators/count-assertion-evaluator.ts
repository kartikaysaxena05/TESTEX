/**
 * @file packages/core/src/execution/assertions/evaluators/count-assertion-evaluator.ts
 * Evaluates collection count assertions (ELEMENT_COUNT_EQUALS / GREATER_THAN / LESS_THAN).
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

export class CountAssertionEvaluator extends BaseAssertionEvaluator {
  public readonly supportedTypes: readonly AssertionType[] = [
    'COUNT_EQUALS',
    'ELEMENT_COUNT_EQUALS',
    'ELEMENT_COUNT_GREATER_THAN',
    'ELEMENT_COUNT_LESS_THAN',
  ];

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
    const rawExpected = resolvedExpected ?? assertion.expectedValue?.value;
    const numExpected = Number(rawExpected);

    if (
      rawExpected === undefined ||
      rawExpected === null ||
      isNaN(numExpected) ||
      !Number.isInteger(numExpected)
    ) {
      throw new InvalidExpectedValueError(
        `Expected count must be an integer, but got: '${String(rawExpected)}'.`,
      );
    }

    const locator = await this.resolveTargetLocator(assertion.target, context, {
      strict: false,
    });
    const targetSummary = this.summarizeTarget(assertion.target);

    const tStart = performance.now();
    let actualCount = 0;
    let lastComparison = AssertionComparator.compare(operator, numExpected, actualCount, options);

    while (performance.now() - tStart < timeoutMs) {
      try {
        actualCount = await locator.count();
        lastComparison = AssertionComparator.compare(operator, numExpected, actualCount, options);
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
        expected: numExpected,
        actual: actualCount,
        targetSummary,
        message: `Element count for ${targetSummary} matched ${operator.toLowerCase()} ${numExpected} (observed ${actualCount}).`,
      };
    }

    return {
      status: 'FAILED',
      expected: numExpected,
      actual: actualCount,
      targetSummary,
      errorCode: 'ASSERTION_FAILED',
      errorMessage:
        lastComparison.failureReason ||
        `Element count for ${targetSummary} expected ${operator.toLowerCase()} ${numExpected}, but observed ${actualCount}.`,
    };
  }
}
