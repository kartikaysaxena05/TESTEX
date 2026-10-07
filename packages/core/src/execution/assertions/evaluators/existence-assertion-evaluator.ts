/**
 * @file packages/core/src/execution/assertions/evaluators/existence-assertion-evaluator.ts
 * Evaluates DOM existence assertions (ELEMENT_EXISTS / ELEMENT_NOT_EXISTS) independently from visibility.
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

export class ExistenceAssertionEvaluator extends BaseAssertionEvaluator {
  public readonly supportedTypes: readonly AssertionType[] = [
    'ELEMENT_EXISTS',
    'ELEMENT_NOT_EXISTS',
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
    const locator = await this.resolveTargetLocator(assertion.target, context, {
      strict: false,
    });
    const targetSummary = this.summarizeTarget(assertion.target);

    const expectExists = operator === 'EXISTS' || operator === 'EQUALS';
    const targetState = expectExists ? 'attached' : 'detached';

    let actualExists = false;
    try {
      await locator.waitFor({
        state: targetState,
        timeout: timeoutMs,
      });
      const count = await locator.count();
      actualExists = count > 0;
    } catch {
      const count = await locator.count().catch(() => 0);
      actualExists = count > 0;
    }

    const comparison = AssertionComparator.compare(operator, true, actualExists, options);

    if (comparison.matches) {
      return {
        status: 'PASSED',
        expected: expectExists,
        actual: actualExists,
        targetSummary,
        message: `Element ${targetSummary} ${actualExists ? 'exists in DOM' : 'does not exist in DOM'} as expected.`,
      };
    }

    return {
      status: 'FAILED',
      expected: expectExists,
      actual: actualExists,
      targetSummary,
      errorCode: 'ASSERTION_FAILED',
      errorMessage:
        comparison.failureReason ||
        `Element ${targetSummary} expected ${expectExists ? 'to exist' : 'not to exist'} in DOM, but actual existence is ${actualExists}.`,
    };
  }
}
