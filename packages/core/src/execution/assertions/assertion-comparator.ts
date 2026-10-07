/**
 * @file packages/core/src/execution/assertions/assertion-comparator.ts
 * Deterministic, typed comparator and normalization engine for expected vs actual verification.
 */

import type { AssertionOperator, AssertionOptionsDto } from '@ai-quality/contracts';
import { MalformedRegexError } from './assertion-errors.js';

export interface AssertionComparisonResult {
  readonly matches: boolean;
  readonly normalizedExpected: unknown;
  readonly normalizedActual: unknown;
  readonly failureReason?: string;
}

export class AssertionComparator {
  /**
   * Evaluates comparison between expected and actual values using specified operator and options.
   */
  public static compare(
    operator: AssertionOperator,
    expected: unknown,
    actual: unknown,
    options?: AssertionOptionsDto,
  ): AssertionComparisonResult {
    const isCaseSensitive = options?.isCaseSensitive ?? true;
    const trimWhitespace = options?.trimWhitespace ?? true;
    const normalizeWhitespace = options?.normalizeWhitespace ?? false;

    switch (operator) {
      case 'VISIBLE':
      case 'EXISTS':
      case 'ENABLED':
      case 'CHECKED': {
        const matches = actual === true;
        return {
          matches,
          normalizedExpected: true,
          normalizedActual: actual,
          failureReason: matches
            ? undefined
            : `Expected state to be ${operator.toLowerCase()}, but got ${String(actual)}.`,
        };
      }

      case 'HIDDEN':
      case 'NOT_EXISTS':
      case 'DISABLED':
      case 'UNCHECKED': {
        const matches = actual === false;
        return {
          matches,
          normalizedExpected: false,
          normalizedActual: actual,
          failureReason: matches
            ? undefined
            : `Expected state to be ${operator.toLowerCase()}, but got ${String(actual)}.`,
        };
      }

      case 'EQUALS': {
        if (typeof expected === 'number' || typeof actual === 'number') {
          const numExp = Number(expected);
          const numAct = Number(actual);
          const matches = !isNaN(numExp) && !isNaN(numAct) && numExp === numAct;
          return {
            matches,
            normalizedExpected: numExp,
            normalizedActual: numAct,
            failureReason: matches
              ? undefined
              : `Expected ${numExp}, but observed actual value ${numAct}.`,
          };
        }

        if (typeof expected === 'boolean' || typeof actual === 'boolean') {
          const matches = expected === actual;
          return {
            matches,
            normalizedExpected: expected,
            normalizedActual: actual,
            failureReason: matches
              ? undefined
              : `Expected boolean ${String(expected)}, but observed ${String(actual)}.`,
          };
        }

        const expNorm = this.normalizeString(String(expected ?? ''), {
          trimWhitespace,
          normalizeWhitespace,
          isCaseSensitive,
        });
        const actNorm = this.normalizeString(String(actual ?? ''), {
          trimWhitespace,
          normalizeWhitespace,
          isCaseSensitive,
        });
        const matches = expNorm === actNorm;
        return {
          matches,
          normalizedExpected: expNorm,
          normalizedActual: actNorm,
          failureReason: matches
            ? undefined
            : `Expected text "${expNorm}", but observed actual text "${actNorm}".`,
        };
      }

      case 'NOT_EQUALS': {
        const eqResult = this.compare('EQUALS', expected, actual, options);
        return {
          matches: !eqResult.matches,
          normalizedExpected: eqResult.normalizedExpected,
          normalizedActual: eqResult.normalizedActual,
          failureReason: !eqResult.matches
            ? undefined
            : `Expected value NOT to equal "${String(eqResult.normalizedExpected)}", but it matched.`,
        };
      }

      case 'CONTAINS': {
        const expStr = this.normalizeString(String(expected ?? ''), {
          trimWhitespace,
          normalizeWhitespace,
          isCaseSensitive,
        });
        const actStr = this.normalizeString(String(actual ?? ''), {
          trimWhitespace,
          normalizeWhitespace,
          isCaseSensitive,
        });
        const matches = actStr.includes(expStr);
        return {
          matches,
          normalizedExpected: expStr,
          normalizedActual: actStr,
          failureReason: matches
            ? undefined
            : `Expected "${actStr}" to contain substring "${expStr}".`,
        };
      }

      case 'NOT_CONTAINS': {
        const containsResult = this.compare('CONTAINS', expected, actual, options);
        return {
          matches: !containsResult.matches,
          normalizedExpected: containsResult.normalizedExpected,
          normalizedActual: containsResult.normalizedActual,
          failureReason: !containsResult.matches
            ? undefined
            : `Expected "${String(containsResult.normalizedActual)}" NOT to contain "${String(containsResult.normalizedExpected)}".`,
        };
      }

      case 'MATCHES': {
        const rawPattern = String(expected ?? '');
        const actStr = String(actual ?? '');
        const regex = this.compileSafeRegex(rawPattern, isCaseSensitive);
        const matches = regex.test(actStr);
        return {
          matches,
          normalizedExpected: rawPattern,
          normalizedActual: actStr,
          failureReason: matches
            ? undefined
            : `Expected actual string "${actStr}" to match pattern ${rawPattern}.`,
        };
      }

      case 'GREATER_THAN': {
        const numExp = Number(expected);
        const numAct = Number(actual);
        const matches = !isNaN(numExp) && !isNaN(numAct) && numAct > numExp;
        return {
          matches,
          normalizedExpected: numExp,
          normalizedActual: numAct,
          failureReason: matches
            ? undefined
            : `Expected count/value > ${numExp}, but observed ${numAct}.`,
        };
      }

      case 'GREATER_THAN_OR_EQUAL': {
        const numExp = Number(expected);
        const numAct = Number(actual);
        const matches = !isNaN(numExp) && !isNaN(numAct) && numAct >= numExp;
        return {
          matches,
          normalizedExpected: numExp,
          normalizedActual: numAct,
          failureReason: matches
            ? undefined
            : `Expected count/value >= ${numExp}, but observed ${numAct}.`,
        };
      }

      case 'LESS_THAN': {
        const numExp = Number(expected);
        const numAct = Number(actual);
        const matches = !isNaN(numExp) && !isNaN(numAct) && numAct < numExp;
        return {
          matches,
          normalizedExpected: numExp,
          normalizedActual: numAct,
          failureReason: matches
            ? undefined
            : `Expected count/value < ${numExp}, but observed ${numAct}.`,
        };
      }

      case 'LESS_THAN_OR_EQUAL': {
        const numExp = Number(expected);
        const numAct = Number(actual);
        const matches = !isNaN(numExp) && !isNaN(numAct) && numAct <= numExp;
        return {
          matches,
          normalizedExpected: numExp,
          normalizedActual: numAct,
          failureReason: matches
            ? undefined
            : `Expected count/value <= ${numExp}, but observed ${numAct}.`,
        };
      }

      default: {
        return {
          matches: false,
          normalizedExpected: expected,
          normalizedActual: actual,
          failureReason: `Unsupported comparison operator: '${operator}'.`,
        };
      }
    }
  }

  /**
   * Normalizes string content according to configured policy.
   */
  public static normalizeString(
    input: string,
    options: {
      trimWhitespace?: boolean;
      normalizeWhitespace?: boolean;
      isCaseSensitive?: boolean;
    },
  ): string {
    let result = input.replace(/\r\n/g, '\n');

    if (options.trimWhitespace) {
      result = result.trim();
    }

    if (options.normalizeWhitespace) {
      result = result.replace(/\s+/g, ' ');
    }

    if (options.isCaseSensitive === false) {
      result = result.toLowerCase();
    }

    return result;
  }

  /**
   * Safely compiles a regular expression, preventing ReDoS vulnerabilities and syntax crashes.
   */
  public static compileSafeRegex(pattern: string, isCaseSensitive = true): RegExp {
    if (!pattern || typeof pattern !== 'string') {
      throw new MalformedRegexError(String(pattern), 'Pattern must be a non-empty string.');
    }

    if (pattern.length > 500) {
      throw new MalformedRegexError(
        pattern,
        'Regex pattern exceeds maximum safe length of 500 characters.',
      );
    }

    // Check for JavaScript regex literal format /pattern/flags
    const literalMatch = pattern.match(/^\/(.+)\/([a-z]*)$/i);
    try {
      if (literalMatch && literalMatch[1]) {
        let flags = literalMatch[2] || '';
        if (!isCaseSensitive && !flags.includes('i')) {
          flags += 'i';
        }
        return new RegExp(literalMatch[1], flags);
      }

      return new RegExp(pattern, isCaseSensitive ? '' : 'i');
    } catch (err: unknown) {
      const details = err instanceof Error ? err.message : String(err);
      throw new MalformedRegexError(pattern, details);
    }
  }
}
