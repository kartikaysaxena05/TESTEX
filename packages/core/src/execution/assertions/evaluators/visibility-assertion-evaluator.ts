/**
 * @file packages/core/src/execution/assertions/evaluators/visibility-assertion-evaluator.ts
 * Evaluates visibility assertions (ELEMENT_VISIBLE / ELEMENT_HIDDEN) using Playwright visibility semantics.
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

export class VisibilityAssertionEvaluator extends BaseAssertionEvaluator {
  public readonly supportedTypes: readonly AssertionType[] = [
    'VISIBLE',
    'HIDDEN',
    'ELEMENT_VISIBLE',
    'ELEMENT_HIDDEN',
  ];

  protected async evaluateInternal(
    assertion: ExecutableAssertionDto,
    operator: AssertionOperator,
    _resolvedExpected: unknown,
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
    const locator = await this.resolveTargetLocator(assertion.target, context);
    const targetSummary = this.summarizeTarget(assertion.target);

    const expectVisible = operator === 'VISIBLE' || operator === 'EQUALS';
    const targetState = expectVisible ? 'visible' : 'hidden';

    let actualVisible = false;
    try {
      await locator.waitFor({
        state: targetState,
        timeout: timeoutMs,
      });
      actualVisible = await locator.isVisible();
    } catch {
      actualVisible = await locator.isVisible().catch(() => false);
    }

    const comparison = AssertionComparator.compare(operator, true, actualVisible, options);

    if (comparison.matches) {
      return {
        status: 'PASSED',
        expected: expectVisible,
        actual: actualVisible,
        targetSummary,
        message: `Element ${targetSummary} is ${actualVisible ? 'visible' : 'hidden'} as expected.`,
      };
    }

    return {
      status: 'FAILED',
      expected: expectVisible,
      actual: actualVisible,
      targetSummary,
      errorCode: 'ASSERTION_FAILED',
      errorMessage:
        comparison.failureReason ||
        `Element ${targetSummary} expected to be ${targetState}, but actual visibility is ${actualVisible}.`,
    };
  }
}
