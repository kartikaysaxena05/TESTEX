/**
 * @file packages/core/src/execution/compiler/assertion-parser.test.ts
 * Unit tests for AssertionParser: semantic mapping, compound clauses, and vague expectation handling.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AssertionParser } from './assertion-parser.js';

describe('AssertionParser', () => {
  const parser = new AssertionParser();

  it('parses VISIBLE assertion from natural expected result', () => {
    const result = parser.parseExpectedResult('Dashboard should be displayed', 1);
    assert.equal(result.assertions.length, 1);
    const assertion = result.assertions[0]!;
    assert.equal(assertion.type, 'VISIBLE');
    assert.equal(assertion.target.kind, 'PAGE_REGION');
    assert.equal(assertion.stepSequence, 1);
    assert.equal(assertion.isNegated, false);
    assert.equal(result.diagnostics.length, 0);
  });

  it('parses TEXT_CONTAINS assertion with expected string', () => {
    const result = parser.parseExpectedResult('Message "Welcome back, Alice!" is displayed', 2);
    assert.equal(result.assertions.length, 1);
    const assertion = result.assertions[0]!;
    assert.equal(assertion.type, 'TEXT_CONTAINS');
    assert.equal(assertion.expectedValue?.kind, 'LITERAL');
    assert.equal(assertion.expectedValue?.value, 'Welcome back, Alice!');
  });

  it('parses URL_EQUALS assertion for route redirection', () => {
    const result = parser.parseExpectedResult('User is redirected to /dashboard', 3);
    assert.equal(result.assertions.length, 1);
    const assertion = result.assertions[0]!;
    assert.equal(assertion.type, 'URL_EQUALS');
    assert.equal(assertion.target.kind, 'ROUTE');
    assert.equal(assertion.target.route, '/dashboard');
  });

  it('parses HIDDEN assertion for modal closure or loading completion', () => {
    const result = parser.parseExpectedResult('Loading spinner disappears', 4);
    assert.equal(result.assertions.length, 1);
    const assertion = result.assertions[0]!;
    assert.equal(assertion.type, 'HIDDEN');
    assert.equal(assertion.isNegated, true);
  });

  it('parses CHECKED and UNCHECKED assertions', () => {
    const checkedRes = parser.parseExpectedResult('Terms checkbox is checked', 5);
    assert.equal(checkedRes.assertions.length, 1);
    assert.equal(checkedRes.assertions[0]!.type, 'CHECKED');

    const uncheckedRes = parser.parseExpectedResult('Newsletter checkbox is unchecked', 6);
    assert.equal(uncheckedRes.assertions.length, 1);
    assert.equal(uncheckedRes.assertions[0]!.type, 'UNCHECKED');
  });

  it('parses ENABLED and DISABLED assertions', () => {
    const enabledRes = parser.parseExpectedResult('Submit button is enabled', 7);
    assert.equal(enabledRes.assertions.length, 1);
    assert.equal(enabledRes.assertions[0]!.type, 'ENABLED');

    const disabledRes = parser.parseExpectedResult('Save button should be disabled', 8);
    assert.equal(disabledRes.assertions.length, 1);
    assert.equal(disabledRes.assertions[0]!.type, 'DISABLED');
  });

  it('splits compound expected results into multiple structured assertions', () => {
    const compound = 'User is redirected to /dashboard and then Welcome banner is visible';
    const result = parser.parseExpectedResult(compound, 9);
    assert.equal(result.assertions.length, 2);
    assert.equal(result.assertions[0]!.type, 'URL_EQUALS');
    assert.equal(result.assertions[1]!.type, 'VISIBLE');
  });

  it('detects vague/qualitative expectations and issues NON_EXECUTABLE_EXPECTATION warning without inventing fake assertions', () => {
    const vagueText = 'The page should load quickly and respond properly';
    const result = parser.parseExpectedResult(vagueText, 10);

    const vagueDiag = result.diagnostics.find(d => d.code === 'NON_EXECUTABLE_EXPECTATION');
    assert.ok(vagueDiag);
    assert.equal(vagueDiag?.severity, 'WARNING');

    // Confirm that the compiler did NOT invent a fake response time or selector
    const inventedSla = result.assertions.some(a => a.description.includes('2 seconds'));
    assert.equal(inventedSla, false);
  });
});
