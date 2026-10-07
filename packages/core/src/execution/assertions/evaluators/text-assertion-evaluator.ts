/**
 * @file packages/core/src/execution/assertions/evaluators/text-assertion-evaluator.ts
 * Evaluates text assertions (TEXT_EQUALS, TEXT_CONTAINS, TEXT_MATCHES) against elements or page text.
 */

import type {
  AssertionOperator,
  AssertionOptionsDto,
  AssertionType,
  ExecutableAssertionDto,
} from '@ai-quality/contracts';
import { BaseAssertionEvaluator } from './base-assertion-evaluator.js';
import { type AssertionExecutionContext, ASSERTION_BOUNDS } from '../assertion-types.js';
import { AssertionComparator } from '../assertion-comparator.js';
import { InvalidExpectedValueError, AssertionTargetResolutionError } from '../assertion-errors.js';

export class TextAssertionEvaluator extends BaseAssertionEvaluator {
  public readonly supportedTypes: readonly AssertionType[] = [
    'TEXT_EQUALS',
    'TEXT_CONTAINS',
    'TEXT_MATCHES',
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
    if (resolvedExpected === undefined || resolvedExpected === null) {
      throw new InvalidExpectedValueError('Expected text value is required for text assertions.');
    }

    const targetSummary = this.summarizeTarget(assertion.target);
    const locator =
      assertion.target && assertion.target.kind !== 'PAGE_REGION'
        ? await this.resolveTargetLocator(assertion.target, context)
        : null;

    const tStart = performance.now();
    let actualText = '';
    let lastComparison = AssertionComparator.compare(
      operator,
      resolvedExpected,
      actualText,
      options,
    );

    while (performance.now() - tStart < timeoutMs) {
      try {
        if (locator) {
          try {
            actualText = (await locator.innerText()) || '';
          } catch (err: unknown) {
            const errStr = err instanceof Error ? err.message : String(err);
            if (
              errStr.includes('Unexpected token') ||
              errStr.includes('is not a valid selector') ||
              errStr.includes('SyntaxError')
            ) {
              throw new AssertionTargetResolutionError(
                `Invalid selector syntax for ${targetSummary}: ${errStr}`,
                'LOCATOR_INVALID_TARGET',
              );
            }
            actualText = (await locator.textContent().catch(() => '')) || '';
          }
        } else if (assertion.target?.text) {
          actualText =
            (await context.page
              .locator(`text=${assertion.target.text}`)
              .first()
              .innerText()
              .catch(() => '')) || '';
        } else {
          actualText = (await context.page.textContent('body')) || '';
        }

        actualText = actualText.slice(0, ASSERTION_BOUNDS.MAX_TEXT_CAPTURE_LENGTH);
        lastComparison = AssertionComparator.compare(
          operator,
          resolvedExpected,
          actualText,
          options,
        );
        if (lastComparison.matches) {
          break;
        }
      } catch (err: unknown) {
        if (err instanceof AssertionTargetResolutionError) {
          throw err;
        }
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
        message: `Observed text on ${targetSummary} matched expected "${String(lastComparison.normalizedExpected)}".`,
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
        `Expected text on ${targetSummary} to match "${String(lastComparison.normalizedExpected)}", but observed "${String(lastComparison.normalizedActual)}".`,
    };
  }
}
