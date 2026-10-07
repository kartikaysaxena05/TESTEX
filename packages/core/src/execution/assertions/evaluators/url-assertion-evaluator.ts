/**
 * @file packages/core/src/execution/assertions/evaluators/url-assertion-evaluator.ts
 * Evaluates browser URL assertions (URL_EQUALS, URL_CONTAINS, URL_MATCHES).
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

export class UrlAssertionEvaluator extends BaseAssertionEvaluator {
  public readonly supportedTypes: readonly AssertionType[] = [
    'URL_EQUALS',
    'URL_CONTAINS',
    'URL_MATCHES',
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
    const expectedUrl = String(
      resolvedExpected ||
        assertion.target?.route ||
        assertion.target?.name ||
        assertion.expectedValue?.value ||
        '',
    ).trim();

    if (!expectedUrl) {
      throw new InvalidExpectedValueError(
        'Expected URL or route pattern is required for URL assertions.',
      );
    }

    const tStart = performance.now();
    let currentUrl = context.page.url();
    let lastComparison = this.evaluateUrlMatch(operator, expectedUrl, currentUrl, options);

    while (performance.now() - tStart < timeoutMs) {
      currentUrl = context.page.url();
      lastComparison = this.evaluateUrlMatch(operator, expectedUrl, currentUrl, options);
      if (lastComparison.matches) {
        break;
      }
      await new Promise(r => setTimeout(r, 50));
    }

    const targetSummary = `url("${expectedUrl}")`;

    if (lastComparison.matches) {
      return {
        status: 'PASSED',
        expected: this.secretRedactor.redactUrl(String(lastComparison.normalizedExpected)),
        actual: this.secretRedactor.redactUrl(String(lastComparison.normalizedActual)),
        targetSummary,
        message: `Browser URL matched expected pattern "${expectedUrl}".`,
      };
    }

    return {
      status: 'FAILED',
      expected: this.secretRedactor.redactUrl(String(lastComparison.normalizedExpected)),
      actual: this.secretRedactor.redactUrl(String(lastComparison.normalizedActual)),
      targetSummary,
      errorCode: 'ASSERTION_FAILED',
      errorMessage:
        lastComparison.failureReason ||
        `Expected URL to match "${expectedUrl}", but current browser URL is "${this.secretRedactor.redactUrl(currentUrl)}".`,
    };
  }

  private evaluateUrlMatch(
    operator: AssertionOperator,
    expected: string,
    actualUrl: string,
    options?: AssertionOptionsDto,
  ): ReturnType<typeof AssertionComparator.compare> {
    try {
      const u = new URL(actualUrl);
      // Check full URL or pathname+search
      if (operator === 'CONTAINS') {
        const matches =
          actualUrl.includes(expected) ||
          u.pathname.includes(expected) ||
          (u.pathname + u.search).includes(expected);
        return {
          matches,
          normalizedExpected: expected,
          normalizedActual: actualUrl,
          failureReason: matches
            ? undefined
            : `Expected URL "${actualUrl}" to contain "${expected}".`,
        };
      }

      if (operator === 'EQUALS') {
        const matches =
          actualUrl === expected || u.pathname === expected || u.pathname + u.search === expected;
        return {
          matches,
          normalizedExpected: expected,
          normalizedActual: actualUrl,
          failureReason: matches
            ? undefined
            : `Expected URL "${expected}", but observed "${actualUrl}".`,
        };
      }
    } catch {
      // Non-standard URL string fallback
    }

    return AssertionComparator.compare(operator, expected, actualUrl, options);
  }
}
