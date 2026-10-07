import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PasswordPolicy } from './password-policy.js';
import { PasswordPolicyViolationError, InvalidAuthInputError } from './auth-errors.js';

describe('PasswordPolicy', () => {
  const policy = new PasswordPolicy();

  it('accepts strong compliant passwords', () => {
    const validResult = policy.validate('SuperSecureP@ssw0rd!2026');
    assert.equal(validResult.isValid, true);
    assert.equal(validResult.violations.length, 0);
    assert.doesNotThrow(() => policy.assertValid('SuperSecureP@ssw0rd!2026'));
  });

  it('rejects passwords shorter than 12 characters', () => {
    const result = policy.validate('Short1!');
    assert.equal(result.isValid, false);
    assert.ok(result.violations.some(v => v.includes('at least 12')));
    assert.throws(() => policy.assertValid('Short1!'), PasswordPolicyViolationError);
  });

  it('rejects passwords longer than 128 characters', () => {
    const longPassword = 'A1!' + 'a'.repeat(130);
    const result = policy.validate(longPassword);
    assert.equal(result.isValid, false);
    assert.ok(result.violations.some(v => v.includes('cannot exceed 128')));
  });

  it('rejects common weak passwords', () => {
    const result = policy.validate('password1234');
    assert.equal(result.isValid, false);
    assert.ok(result.violations.some(v => v.includes('too common')));
  });

  it('rejects passwords without lowercase letters', () => {
    const result = policy.validate('PASSWORD1234!');
    assert.equal(result.isValid, false);
    assert.ok(result.violations.some(v => v.includes('lowercase')));
  });

  it('rejects passwords without uppercase letters', () => {
    const result = policy.validate('password1234!');
    assert.equal(result.isValid, false);
    assert.ok(result.violations.some(v => v.includes('uppercase')));
  });

  it('rejects passwords without numbers or special characters', () => {
    const result = policy.validate('PasswordWithoutNumbersOrSymbols');
    assert.equal(result.isValid, false);
    assert.ok(result.violations.some(v => v.includes('number or special character')));
  });

  it('rejects non-string inputs', () => {
    assert.throws(() => policy.assertValid(null), InvalidAuthInputError);
    assert.throws(() => policy.assertValid(undefined), InvalidAuthInputError);
  });
});
