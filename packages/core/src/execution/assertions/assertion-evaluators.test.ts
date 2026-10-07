/**
 * @file packages/core/src/execution/assertions/assertion-evaluators.test.ts
 * Unit tests for comparator, normalization, regex safety, variable resolution, and evaluator matrix.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  AssertionComparator,
  AssertionEvaluatorRegistry,
  AssertionEngine,
  MalformedRegexError,
  InvalidAssertionOperatorError,
  InvalidAssertionTypeError,
} from './index.js';
import type { ExecutableAssertionDto } from '@ai-quality/contracts';

describe('Phase 67 — Assertion Comparator & Normalization Unit Tests', () => {
  describe('Strict Equality & Text Operators', () => {
    it('evaluates EQUALS with exact match and case sensitivity', () => {
      const match = AssertionComparator.compare('EQUALS', 'Dashboard', 'Dashboard', {
        isCaseSensitive: true,
      });
      assert.equal(match.matches, true);

      const mismatch = AssertionComparator.compare('EQUALS', 'Dashboard', 'dashboard', {
        isCaseSensitive: true,
      });
      assert.equal(mismatch.matches, false);
      assert.ok(mismatch.failureReason?.includes('Expected text'));
    });

    it('evaluates EQUALS case-insensitively when isCaseSensitive=false', () => {
      const match = AssertionComparator.compare('EQUALS', 'Welcome User', 'welcome user', {
        isCaseSensitive: false,
      });
      assert.equal(match.matches, true);
    });

    it('evaluates CONTAINS and NOT_CONTAINS with whitespace trimming', () => {
      const match = AssertionComparator.compare('CONTAINS', 'Success', '  Payment Success  ', {
        trimWhitespace: true,
      });
      assert.equal(match.matches, true);

      const notContains = AssertionComparator.compare('NOT_CONTAINS', 'Error', 'Payment Success');
      assert.equal(notContains.matches, true);

      const failNotContains = AssertionComparator.compare(
        'NOT_CONTAINS',
        'Success',
        'Payment Success',
      );
      assert.equal(failNotContains.matches, false);
    });

    it('normalizes CRLF to LF and collapses whitespace when configured', () => {
      const res = AssertionComparator.normalizeString('Hello \r\n   World  ', {
        trimWhitespace: true,
        normalizeWhitespace: true,
      });
      assert.equal(res, 'Hello World');
    });
  });

  describe('Boolean & State Operators', () => {
    it('evaluates VISIBLE, HIDDEN, EXISTS, NOT_EXISTS, ENABLED, DISABLED', () => {
      assert.equal(AssertionComparator.compare('VISIBLE', true, true).matches, true);
      assert.equal(AssertionComparator.compare('VISIBLE', true, false).matches, false);

      assert.equal(AssertionComparator.compare('HIDDEN', false, false).matches, true);
      assert.equal(AssertionComparator.compare('HIDDEN', false, true).matches, false);

      assert.equal(AssertionComparator.compare('EXISTS', true, true).matches, true);
      assert.equal(AssertionComparator.compare('NOT_EXISTS', false, false).matches, true);

      assert.equal(AssertionComparator.compare('ENABLED', true, true).matches, true);
      assert.equal(AssertionComparator.compare('DISABLED', false, false).matches, true);

      assert.equal(AssertionComparator.compare('CHECKED', true, true).matches, true);
      assert.equal(AssertionComparator.compare('UNCHECKED', false, false).matches, true);
    });
  });

  describe('Numeric & Count Operators', () => {
    it('evaluates numeric comparisons: GREATER_THAN, LESS_THAN, GREATER_THAN_OR_EQUAL, LESS_THAN_OR_EQUAL', () => {
      assert.equal(AssertionComparator.compare('GREATER_THAN', 5, 10).matches, true);
      assert.equal(AssertionComparator.compare('GREATER_THAN', 10, 5).matches, false);

      assert.equal(AssertionComparator.compare('LESS_THAN', 10, 5).matches, true);
      assert.equal(AssertionComparator.compare('LESS_THAN', 5, 10).matches, false);

      assert.equal(AssertionComparator.compare('GREATER_THAN_OR_EQUAL', 5, 5).matches, true);
      assert.equal(AssertionComparator.compare('LESS_THAN_OR_EQUAL', 5, 5).matches, true);
    });
  });

  describe('Safe Regular Expression Matching', () => {
    it('evaluates MATCHES with valid regex string and pattern', () => {
      const match = AssertionComparator.compare('MATCHES', '^Order #\\d{4}$', 'Order #1234');
      assert.equal(match.matches, true);

      const mismatch = AssertionComparator.compare('MATCHES', '^Order #\\d{4}$', 'Order #ABC');
      assert.equal(mismatch.matches, false);
    });

    it('rejects dangerous patterns exceeding safe length limit', () => {
      const hugePattern = 'a'.repeat(501);
      assert.throws(
        () => AssertionComparator.compileSafeRegex(hugePattern),
        err => err instanceof MalformedRegexError,
      );
    });

    it('rejects malformed regex syntax with MalformedRegexError', () => {
      assert.throws(
        () => AssertionComparator.compileSafeRegex('[unclosed-bracket'),
        err => err instanceof MalformedRegexError,
      );
    });
  });
});

describe('Phase 67 — Evaluator Registry & Type Matrix Tests', () => {
  const registry = new AssertionEvaluatorRegistry();

  it('retrieves specialized evaluator for all supported assertion types', () => {
    assert.ok(registry.getEvaluator('VISIBLE'));
    assert.ok(registry.getEvaluator('ELEMENT_VISIBLE'));
    assert.ok(registry.getEvaluator('ELEMENT_EXISTS'));
    assert.ok(registry.getEvaluator('ELEMENT_ENABLED'));
    assert.ok(registry.getEvaluator('ELEMENT_CHECKED'));
    assert.ok(registry.getEvaluator('TEXT_EQUALS'));
    assert.ok(registry.getEvaluator('TEXT_CONTAINS'));
    assert.ok(registry.getEvaluator('VALUE_EQUALS'));
    assert.ok(registry.getEvaluator('URL_EQUALS'));
    assert.ok(registry.getEvaluator('PAGE_TITLE_EQUALS'));
    assert.ok(registry.getEvaluator('ELEMENT_COUNT_EQUALS'));
    assert.ok(registry.getEvaluator('ATTRIBUTE_EQUALS'));
  });

  it('throws InvalidAssertionTypeError for unknown assertion type', () => {
    assert.throws(
      () => registry.getEvaluator('UNKNOWN_TYPE' as unknown as any),
      err => err instanceof InvalidAssertionTypeError,
    );
  });

  it('validates operator compatibility and handles InvalidAssertionOperatorError', async () => {
    const textEvaluator = registry.getEvaluator('TEXT_EQUALS');
    assert.throws(
      () => (textEvaluator as any).validateOperator('TEXT_EQUALS', 'CHECKED'),
      err => err instanceof InvalidAssertionOperatorError,
    );

    const result = await textEvaluator.evaluate(
      {
        id: crypto.randomUUID(),
        type: 'TEXT_EQUALS',
        target: { kind: 'PAGE_REGION' },
        description: 'Illegal operator test',
      },
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page: { isClosed: () => false } as unknown as any,
      },
      { operator: 'CHECKED' },
    );
    assert.equal(result.status, 'ERROR');
    assert.equal(result.errorCode, 'INVALID_ASSERTION_OPERATOR');
  });

  it('throws InvalidExpectedValueError when expected value is missing for TEXT_EQUALS', async () => {
    const textEvaluator = registry.getEvaluator('TEXT_EQUALS');
    const result = await textEvaluator.evaluate(
      {
        id: crypto.randomUUID(),
        type: 'TEXT_EQUALS',
        target: { kind: 'PAGE_REGION' },
        description: 'Missing expected value',
      },
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page: { isClosed: () => false } as unknown as any,
      },
    );
    assert.equal(result.status, 'ERROR');
    assert.equal(result.errorCode, 'INVALID_EXPECTED_VALUE');
  });

  it('resolves variables and throws UnresolvedVariableError on missing context variable', async () => {
    const textEvaluator = registry.getEvaluator('TEXT_EQUALS');
    const result = await textEvaluator.evaluate(
      {
        id: crypto.randomUUID(),
        type: 'TEXT_EQUALS',
        target: { kind: 'PAGE_REGION' },
        expectedValue: { kind: 'LITERAL', value: '{{nonExistentVar}}' },
        description: 'Template variable test',
      },
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page: { isClosed: () => false } as unknown as any,
        variables: {},
      },
    );
    assert.equal(result.status, 'ERROR');
    assert.equal(result.errorCode, 'UNRESOLVED_VARIABLE');
  });
});

describe('Phase 67 — Step Aggregator & Hard/Soft Assertions Tests', () => {
  const engine = new AssertionEngine();

  it('stops step execution on first hard failure but continues on soft failure', async () => {
    const hardFailAssertion: ExecutableAssertionDto = {
      id: crypto.randomUUID(),
      type: 'TEXT_EQUALS',
      target: { kind: 'PAGE_REGION' },
      expectedValue: { kind: 'LITERAL', value: 'Expected Text That Does Not Exist' },
      description: 'Hard assertion that will fail',
    };

    const nextAssertion: ExecutableAssertionDto = {
      id: crypto.randomUUID(),
      type: 'TEXT_EQUALS',
      target: { kind: 'PAGE_REGION' },
      expectedValue: { kind: 'LITERAL', value: 'Any' },
      description: 'Subsequent assertion that should not be evaluated if previous was hard failure',
    };

    const mockPage: any = {
      isClosed: () => false,
      textContent: async () => 'Actual Body Content',
    };

    const hardResult = await engine.evaluateStepAssertions(
      crypto.randomUUID(),
      [hardFailAssertion, nextAssertion],
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page: mockPage,
      },
      { isHard: true, timeoutMs: 100 },
    );

    assert.equal(hardResult.status, 'FAILED');
    assert.equal(hardResult.failedCount, 1);
    assert.equal(hardResult.results.length, 1); // Second assertion was skipped!

    // Now test soft assertion (isHard = false)
    const softResult = await engine.evaluateStepAssertions(
      crypto.randomUUID(),
      [hardFailAssertion, nextAssertion],
      {
        projectId: crypto.randomUUID(),
        testRunId: crypto.randomUUID(),
        page: mockPage,
      },
      { isHard: false, timeoutMs: 100 },
    );

    assert.equal(softResult.status, 'FAILED');
    assert.equal(softResult.failedCount, 2);
    assert.equal(softResult.results.length, 2); // Both assertions were evaluated!
  });
});
