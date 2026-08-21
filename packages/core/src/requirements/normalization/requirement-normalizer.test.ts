/**
 * @file packages/core/src/requirements/normalization/requirement-normalizer.test.ts
 * Unit tests for pure deterministic requirement normalizer and clause extraction.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RequirementNormalizer } from './requirement-normalizer.js';
import { NORMALIZER_VERSION } from './normalization-types.js';

describe('RequirementNormalizer Unit Tests', () => {
  it('111: parses simple SHALL requirement', () => {
    const input = 'The system shall allow registered users to log in.';
    const draft = RequirementNormalizer.normalize(input);

    assert.equal(draft.normalizerVersion, NORMALIZER_VERSION);
    assert.equal(draft.normalizedText, 'The system shall allow registered users to log in.');
    assert.equal(draft.actor, 'system');
    assert.equal(draft.modality, 'SHALL');
    assert.equal(draft.negated, false);
    assert.equal(draft.action, 'allow');
    assert.equal(draft.object, 'registered users to log in');
    assert.deepEqual(draft.conditions, []);
  });

  it('112: parses MUST requirement', () => {
    const input = 'The application must encrypt stored credentials.';
    const draft = RequirementNormalizer.normalize(input);

    assert.equal(draft.actor, 'application');
    assert.equal(draft.modality, 'MUST');
    assert.equal(draft.negated, false);
    assert.equal(draft.action, 'encrypt');
    assert.equal(draft.object, 'stored credentials');
  });

  it('113: preserves negative modality semantics (SHALL_NOT)', () => {
    const input = 'The system shall not store plaintext passwords.';
    const draft = RequirementNormalizer.normalize(input);

    assert.equal(draft.actor, 'system');
    assert.equal(draft.modality, 'SHALL_NOT');
    assert.equal(draft.negated, true);
    assert.equal(draft.action, 'store');
    assert.equal(draft.object, 'plaintext passwords');
  });

  it('114: extracts IF condition', () => {
    const input = 'If five login attempts fail, the system shall lock the account.';
    const draft = RequirementNormalizer.normalize(input);

    assert.equal(draft.actor, 'system');
    assert.equal(draft.modality, 'SHALL');
    assert.equal(draft.negated, false);
    assert.equal(draft.action, 'lock');
    assert.equal(draft.object, 'the account');
    assert.equal(draft.conditions.length, 1);
    assert.equal(draft.conditions[0]?.type, 'IF');
    assert.equal(draft.conditions[0]?.text, 'five login attempts fail');
    assert.ok(draft.quantitativeValues.length >= 1);
  });

  it('115: extracts temporal WHEN condition', () => {
    const input = 'When the reset token expires, the system shall reject it.';
    const draft = RequirementNormalizer.normalize(input);

    assert.equal(draft.actor, 'system');
    assert.equal(draft.modality, 'SHALL');
    assert.equal(draft.action, 'reject');
    assert.equal(draft.object, 'it');
    assert.equal(draft.conditions.length, 1);
    assert.equal(draft.conditions[0]?.type, 'WHEN');
    assert.equal(draft.conditions[0]?.text, 'the reset token expires');
  });

  it('116: parses quantitative duration constraint (WITHIN)', () => {
    const input = 'The dashboard shall load within 2 seconds.';
    const draft = RequirementNormalizer.normalize(input);

    assert.equal(draft.modality, 'SHALL');
    const within = draft.quantitativeValues.find(q => q.operator === 'WITHIN');
    assert.ok(within);
    assert.equal(within.value, 2);
    assert.equal(within.unit, 'seconds');
    assert.ok(draft.constraints.some(c => c.text.includes('within 2 seconds')));
  });

  it('117: parses RANGE quantitative value (between 8 and 64 characters)', () => {
    const input = 'Passwords shall contain between 8 and 64 characters.';
    const draft = RequirementNormalizer.normalize(input);

    const range = draft.quantitativeValues.find(q => q.operator === 'RANGE');
    assert.ok(range);
    assert.equal(range.minimum, 8);
    assert.equal(range.maximum, 64);
    assert.equal(range.unit, 'characters');
  });

  it('118: parses MINIMUM quantitative value (at least 8 characters)', () => {
    const input = 'Passwords must contain at least 8 characters.';
    const draft = RequirementNormalizer.normalize(input);

    const min = draft.quantitativeValues.find(q => q.operator === 'MINIMUM');
    assert.ok(min);
    assert.equal(min.minimum, 8);
    assert.equal(min.value, 8);
    assert.equal(min.unit, 'characters');
  });

  it('119: parses MAXIMUM quantitative value (maximum 5 active sessions)', () => {
    const input = 'Users shall have a maximum of 5 active sessions.';
    const draft = RequirementNormalizer.normalize(input);

    assert.equal(draft.actor, 'users');
    const max = draft.quantitativeValues.find(q => q.operator === 'MAXIMUM');
    assert.ok(max);
    assert.equal(max.maximum, 5);
    assert.equal(max.value, 5);
    assert.equal(max.unit, 'active sessions');
  });

  it('120: parses PERCENTAGE quantitative value (99.9% availability)', () => {
    const input = 'The service shall maintain 99.9% availability.';
    const draft = RequirementNormalizer.normalize(input);

    assert.equal(draft.actor, 'service');
    assert.equal(draft.modality, 'SHALL');
    const pct = draft.quantitativeValues.find(q => q.operator === 'PERCENTAGE');
    assert.ok(pct);
    assert.equal(pct.value, 99.9);
    assert.equal(pct.unit, 'percent');
  });

  it('121: parses Agile User Story structure', () => {
    const input =
      'As an administrator, I want to disable a user account so that terminated employees cannot log in.';
    const draft = RequirementNormalizer.normalize(input);

    assert.equal(draft.actor, 'administrator');
    assert.equal(draft.modality, 'REQUIRED_TO');
    assert.equal(draft.action, 'disable a user account');
    assert.equal(draft.expectedOutcome, 'terminated employees cannot log in');
  });

  it('122: handles compound requirements without splitting records', () => {
    const input = 'The system shall validate credentials and create an authenticated session.';
    const draft = RequirementNormalizer.normalize(input);

    assert.equal(draft.actor, 'system');
    assert.equal(draft.modality, 'SHALL');
    assert.ok(draft.warnings.includes('COMPLEX_COMPOUND_REQUIREMENT'));
  });

  it('123: extracts structured fields from vague text without inventing structure', () => {
    const input = 'The system shall be fast and user friendly.';
    const draft = RequirementNormalizer.normalize(input);

    assert.equal(draft.actor, 'system');
    assert.equal(draft.modality, 'SHALL');
    assert.equal(draft.action, 'be');
    assert.equal(draft.object, 'fast and user friendly');
  });

  it('124: preserves null actor when passive voice has no active actor', () => {
    const input = 'Invoices must be approved before payment.';
    const draft = RequirementNormalizer.normalize(input);

    // "Invoices" is passive subject, not an active agent role
    assert.equal(draft.actor, null);
    assert.equal(draft.modality, 'MUST');
    assert.ok(draft.warnings.includes('ACTOR_NOT_DETECTED'));
  });

  it('125: handles Unicode currency (₹), smart quotes, and accents safely', () => {
    const input = 'Transactions above ₹100,000 shall require “secondary” approval.';
    const draft = RequirementNormalizer.normalize(input);

    assert.equal(draft.modality, 'SHALL');
    assert.ok(draft.normalizedText.includes('"secondary"'));
    const curr = draft.quantitativeValues.find(q => q.unit === 'INR');
    assert.ok(curr);
    assert.equal(curr.value, 100000);
  });

  it('126: is 100% deterministic across 100 iterations', () => {
    const input =
      'If five consecutive authentication attempts fail, the system shall lock the user account within 2 seconds.';
    const firstResult = RequirementNormalizer.normalize(input);

    for (let i = 0; i < 100; i++) {
      const iterResult = RequirementNormalizer.normalize(input);
      assert.deepEqual(iterResult, firstResult);
    }
  });

  it('127: preserves non-empty normalized text for valid non-empty requirement', () => {
    const inputs = [
      'Simple requirement.',
      '   Spaced   requirement   ',
      'The system shall respond.\r\n',
    ];

    for (const raw of inputs) {
      const draft = RequirementNormalizer.normalize(raw);
      assert.ok(draft.normalizedText.length > 0);
    }
  });
});
