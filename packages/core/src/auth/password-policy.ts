/**
 * @file packages/core/src/auth/password-policy.ts
 * Deterministic password policy primitives and validation for V8 Phase 113.
 */

import {
  AUTH_BOUNDS,
  type IPasswordPolicy,
  type PasswordPolicyValidationResult,
} from './auth-types.js';
import { PasswordPolicyViolationError, InvalidAuthInputError } from './auth-errors.js';

const COMMON_WEAK_PASSWORDS = new Set([
  'password',
  'password123',
  'password1234',
  '123456789012',
  'qwerty123456',
  'admin1234567',
  'letmein12345',
  'welcome12345',
  'iloveyou1234',
  'changeme1234',
  'monkey123456',
  'football1234',
  'supersecret1',
]);

export class PasswordPolicy implements IPasswordPolicy {
  /**
   * Validates a candidate password against security boundaries and policy rules.
   */
  public validate(password: unknown): PasswordPolicyValidationResult {
    if (typeof password !== 'string') {
      return {
        isValid: false,
        violations: ['Password must be a valid string.'],
      };
    }

    const violations: string[] = [];

    if (password.length < AUTH_BOUNDS.MIN_PASSWORD_LENGTH) {
      violations.push(
        `Password must be at least ${AUTH_BOUNDS.MIN_PASSWORD_LENGTH} characters long.`,
      );
    }

    if (password.length > AUTH_BOUNDS.MAX_PASSWORD_LENGTH) {
      violations.push(`Password cannot exceed ${AUTH_BOUNDS.MAX_PASSWORD_LENGTH} characters.`);
    }

    if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase().trim())) {
      violations.push('Password is too common and easily guessed.');
    }

    // Check for at least one lowercase letter
    if (!/[a-z]/.test(password)) {
      violations.push('Password must include at least one lowercase letter.');
    }

    // Check for at least one uppercase letter
    if (!/[A-Z]/.test(password)) {
      violations.push('Password must include at least one uppercase letter.');
    }

    // Check for at least one number or special character
    if (!/[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
      violations.push('Password must include at least one number or special character.');
    }

    return {
      isValid: violations.length === 0,
      violations,
    };
  }

  /**
   * Validates and asserts compliance; throws PasswordPolicyViolationError or InvalidAuthInputError if invalid.
   */
  public assertValid(password: unknown): void {
    if (typeof password !== 'string') {
      throw new InvalidAuthInputError('Password must be a valid string.');
    }

    const result = this.validate(password);
    if (!result.isValid) {
      throw new PasswordPolicyViolationError(result.violations);
    }
  }
}
