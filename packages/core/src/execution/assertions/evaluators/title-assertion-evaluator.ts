/**
 * @file packages/core/src/execution/assertions/evaluators/title-assertion-evaluator.ts
 * Evaluates document page title assertions (PAGE_TITLE_EQUALS / PAGE_TITLE_CONTAINS).
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

export class TitleAssertionEvaluator extends BaseAssertionEvaluator {
  public readonly supportedTypes: readonly AssertionType[] = [
    'TITLE_EQUALS',
    'PAGE_TITLE_EQUALS',
    'PAGE_TITLE_CONTAINS',
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
    const expectedTitle = String(
      resolvedExpected ||
        assertion.target?.title ||
        assertion.target?.name ||
        assertion.expectedValue?.value ||
        '',
    ).trim();

    if (!expectedTitle) {
      throw new InvalidExpectedValueError('Expected page title is required for title assertions.');
    }

    const tStart = performance.now();
    let actualTitle = '';
    let lastComparison = AssertionComparator.compare(operator, expectedTitle, actualTitle, options);

    while (performance.now() - tStart < timeoutMs) {
      try {
        actualTitle = await context.page.title();
        lastComparison = AssertionComparator.compare(operator, expectedTitle, actualTitle, options);
        if (lastComparison.matches) {
          break;
        }
      } catch {
        // Retry within bounded timeout
      }
      await new Promise(r => setTimeout(r, 50));
    }

    const targetSummary = `page_title("${expectedTitle}")`;

    if (lastComparison.matches) {
      return {
        status: 'PASSED',
        expected: lastComparison.normalizedExpected,
        actual: lastComparison.normalizedActual,
        targetSummary,
        message: `Page title matched expected "${expectedTitle}".`,
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
        `Expected page title "${expectedTitle}", but observed actual title "${actualTitle}".`,
    };
  }
}
