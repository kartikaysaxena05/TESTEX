/**
 * @file packages/core/src/execution/assertions/evaluators/attribute-assertion-evaluator.ts
 * Evaluates element attribute assertions (ATTRIBUTE_EQUALS / ATTRIBUTE_CONTAINS).
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

export class AttributeAssertionEvaluator extends BaseAssertionEvaluator {
  public readonly supportedTypes: readonly AssertionType[] = [
    'ATTRIBUTE_EQUALS',
    'ATTRIBUTE_CONTAINS',
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
    const attrName = (assertion.attributeName || options?.attributeName || '').trim();

    if (!attrName) {
      throw new InvalidExpectedValueError('attributeName is required for attribute assertions.');
    }

    if (resolvedExpected === undefined || resolvedExpected === null) {
      throw new InvalidExpectedValueError(
        `Expected value is required for attribute '${attrName}' assertion.`,
      );
    }

    const locator = await this.resolveTargetLocator(assertion.target, context);
    const targetSummary = `${this.summarizeTarget(assertion.target)}[${attrName}]`;

    const tStart = performance.now();
    let actualAttr: string | null = null;
    let lastComparison = AssertionComparator.compare(
      operator,
      resolvedExpected,
      actualAttr,
      options,
    );

    while (performance.now() - tStart < timeoutMs) {
      try {
        actualAttr = await locator.getAttribute(attrName, { timeout: 500 });
        lastComparison = AssertionComparator.compare(
          operator,
          resolvedExpected,
          actualAttr ?? '',
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
        message: `Attribute [${attrName}] on ${targetSummary} matched expected "${String(lastComparison.normalizedExpected)}".`,
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
        `Attribute [${attrName}] on ${targetSummary} expected "${String(lastComparison.normalizedExpected)}", but observed "${String(actualAttr)}".`,
    };
  }
}
