/**
 * @file packages/core/src/execution/assertions/evaluators/state-assertion-evaluator.ts
 * Evaluates real interactive states: enabled/disabled, checked/unchecked for buttons, inputs, checkboxes.
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

export class StateAssertionEvaluator extends BaseAssertionEvaluator {
  public readonly supportedTypes: readonly AssertionType[] = [
    'ENABLED',
    'DISABLED',
    'ELEMENT_ENABLED',
    'ELEMENT_DISABLED',
    'CHECKED',
    'UNCHECKED',
    'ELEMENT_CHECKED',
    'ELEMENT_UNCHECKED',
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

    const isCheckType =
      assertion.type.includes('CHECKED') || operator === 'CHECKED' || operator === 'UNCHECKED';

    const tStart = performance.now();
    let actualState = false;

    if (isCheckType) {
      const expectChecked = operator === 'CHECKED' || operator === 'EQUALS';
      while (performance.now() - tStart < timeoutMs) {
        try {
          actualState = await locator.isChecked();
          if (actualState === expectChecked) break;
        } catch {
          // Retry within bounded timeout
        }
        await new Promise(r => setTimeout(r, 50));
      }

      const comparison = AssertionComparator.compare(operator, true, actualState, options);
      if (comparison.matches) {
        return {
          status: 'PASSED',
          expected: expectChecked,
          actual: actualState,
          targetSummary,
          message: `Control ${targetSummary} is ${actualState ? 'checked' : 'unchecked'} as expected.`,
        };
      }

      return {
        status: 'FAILED',
        expected: expectChecked,
        actual: actualState,
        targetSummary,
        errorCode: 'ASSERTION_FAILED',
        errorMessage:
          comparison.failureReason ||
          `Control ${targetSummary} expected to be ${expectChecked ? 'checked' : 'unchecked'}, but actual is ${actualState}.`,
      };
    }

    // Enabled / Disabled check
    const expectEnabled = operator === 'ENABLED' || operator === 'EQUALS';
    while (performance.now() - tStart < timeoutMs) {
      try {
        actualState = await locator.isEnabled();
        if (actualState === expectEnabled) break;
      } catch {
        // Retry within bounded timeout
      }
      await new Promise(r => setTimeout(r, 50));
    }

    const comparison = AssertionComparator.compare(operator, true, actualState, options);
    if (comparison.matches) {
      return {
        status: 'PASSED',
        expected: expectEnabled,
        actual: actualState,
        targetSummary,
        message: `Control ${targetSummary} is ${actualState ? 'enabled' : 'disabled'} as expected.`,
      };
    }

    return {
      status: 'FAILED',
      expected: expectEnabled,
      actual: actualState,
      targetSummary,
      errorCode: 'ASSERTION_FAILED',
      errorMessage:
        comparison.failureReason ||
        `Control ${targetSummary} expected to be ${expectEnabled ? 'enabled' : 'disabled'}, but actual is ${actualState}.`,
    };
  }
}
