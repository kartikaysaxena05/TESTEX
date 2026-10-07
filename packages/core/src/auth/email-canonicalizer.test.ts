import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EmailCanonicalizer } from './email-canonicalizer.js';
import { InvalidAuthInputError } from './auth-errors.js';

describe('EmailCanonicalizer', () => {
  it('canonicalizes valid email to lowercase and trims whitespace', () => {
    assert.equal(EmailCanonicalizer.canonicalize('  User@Example.COM  '), 'user@example.com');
    assert.equal(
      EmailCanonicalizer.canonicalize('john.doe+test@domain.co.uk'),
      'john.doe+test@domain.co.uk',
    );
  });

  it('rejects empty and whitespace-only emails', () => {
    assert.throws(() => EmailCanonicalizer.canonicalize(''), InvalidAuthInputError);
    assert.throws(() => EmailCanonicalizer.canonicalize('   '), InvalidAuthInputError);
  });

  it('rejects non-string inputs', () => {
    assert.throws(() => EmailCanonicalizer.canonicalize(null), InvalidAuthInputError);
    assert.throws(() => EmailCanonicalizer.canonicalize(undefined), InvalidAuthInputError);
    assert.throws(() => EmailCanonicalizer.canonicalize(123), InvalidAuthInputError);
  });

  it('rejects malformed email formats', () => {
    assert.throws(() => EmailCanonicalizer.canonicalize('not-an-email'), InvalidAuthInputError);
    assert.throws(() => EmailCanonicalizer.canonicalize('@example.com'), InvalidAuthInputError);
    assert.throws(() => EmailCanonicalizer.canonicalize('user@'), InvalidAuthInputError);
    assert.throws(
      () => EmailCanonicalizer.canonicalize('user @example.com'),
      InvalidAuthInputError,
    );
  });

  it('rejects oversized email (> 255 chars)', () => {
    const longLocal = 'a'.repeat(250);
    assert.throws(
      () => EmailCanonicalizer.canonicalize(`${longLocal}@example.com`),
      InvalidAuthInputError,
    );
  });

  it('isValid returns boolean without throwing', () => {
    assert.equal(EmailCanonicalizer.isValid('user@example.com'), true);
    assert.equal(EmailCanonicalizer.isValid('not-an-email'), false);
    assert.equal(EmailCanonicalizer.isValid(null), false);
  });
});
