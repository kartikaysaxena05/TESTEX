/**
 * @file packages/core/src/auth/email-canonicalizer.ts
 * Deterministic email canonicalization and validation for V8 Phase 113.
 */

import { AUTH_BOUNDS } from './auth-types.js';
import { InvalidAuthInputError } from './auth-errors.js';

// Standard RFC 5322 compliant regex for robust email validation
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export class EmailCanonicalizer {
  /**
   * Canonicalizes an email address deterministically:
   * 1. Trims leading and trailing whitespace
   * 2. Validates string type and non-emptiness
   * 3. Enforces length boundary (<= 255)
   * 4. Validates email structure using RFC 5322 pattern
   * 5. Performs lowercase case-folding
   */
  public static canonicalize(email: unknown): string {
    if (typeof email !== 'string') {
      throw new InvalidAuthInputError('Email must be a valid string.');
    }

    const trimmed = email.trim();

    if (trimmed.length === 0) {
      throw new InvalidAuthInputError('Email address cannot be empty.');
    }

    if (trimmed.length > AUTH_BOUNDS.MAX_EMAIL_LENGTH) {
      throw new InvalidAuthInputError(
        `Email address exceeds maximum allowed length of ${AUTH_BOUNDS.MAX_EMAIL_LENGTH} characters.`,
      );
    }

    if (!EMAIL_REGEX.test(trimmed)) {
      throw new InvalidAuthInputError('Invalid email address format.');
    }

    return trimmed.toLowerCase();
  }

  /**
   * Safe check returning boolean without throwing.
   */
  public static isValid(email: unknown): boolean {
    try {
      EmailCanonicalizer.canonicalize(email);
      return true;
    } catch {
      return false;
    }
  }
}
