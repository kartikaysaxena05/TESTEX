/**
 * @file packages/core/src/execution/locators/locator-target-validator.test.ts
 * Unit tests for LocatorTargetValidator covering bounds, ARIA role validation, selector syntax, and injection defense.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LocatorTargetValidator } from './locator-target-validator.js';
import { LocatorInvalidTargetError } from './locator-errors.js';

describe('LocatorTargetValidator Unit & Security Tests', () => {
  it('validates a well-formed semantic target descriptor', () => {
    assert.doesNotThrow(() => {
      LocatorTargetValidator.validate({
        kind: 'CONTROL',
        role: 'button',
        name: 'Submit Order',
        testId: 'submit-btn',
        exact: true,
      });
    });
  });

  it('rejects missing or empty target descriptors', () => {
    assert.throws(
      () => LocatorTargetValidator.validate(null as any),
      (err: any) => err instanceof LocatorInvalidTargetError,
    );

    assert.throws(
      () => LocatorTargetValidator.validate({} as any),
      (err: any) => err instanceof LocatorInvalidTargetError,
    );
  });

  it('validates standard ARIA roles and rejects invalid strings', () => {
    assert.doesNotThrow(() => {
      LocatorTargetValidator.validate({
        kind: 'CONTROL',
        role: 'combobox',
        name: 'Country',
      });
    });

    assert.throws(
      () => {
        LocatorTargetValidator.validate({
          kind: 'CONTROL',
          role: 'not_a_valid_aria_role_123',
          name: 'Invalid',
        });
      },
      (err: any) =>
        err instanceof LocatorInvalidTargetError && err.message.includes('Invalid ARIA role'),
    );
  });

  it('rejects negative target ordinals', () => {
    assert.throws(
      () => {
        LocatorTargetValidator.validate({
          kind: 'CONTROL',
          name: 'Submit',
          ordinal: -1,
        });
      },
      (err: any) =>
        err instanceof LocatorInvalidTargetError && err.message.includes('non-negative integer'),
    );
  });

  it('validates CSS selector syntax and catches unbalanced brackets or unclosed quotes', () => {
    assert.doesNotThrow(() => {
      LocatorTargetValidator.validate({
        kind: 'ELEMENT',
        css: 'div.container > button[data-action="save"]',
      });
    });

    assert.throws(
      () => {
        LocatorTargetValidator.validate({
          kind: 'ELEMENT',
          css: 'button[data-action="save"',
        });
      },
      (err: any) =>
        err instanceof LocatorInvalidTargetError && err.message.includes('Malformed CSS selector'),
    );

    assert.throws(
      () => {
        LocatorTargetValidator.validate({
          kind: 'ELEMENT',
          css: "button[data-action='save]",
        });
      },
      (err: any) =>
        err instanceof LocatorInvalidTargetError && err.message.includes('Malformed CSS selector'),
    );
  });

  it('validates XPath syntax and catches unbalanced brackets', () => {
    assert.doesNotThrow(() => {
      LocatorTargetValidator.validate({
        kind: 'ELEMENT',
        xpath: '//button[@id="submit" and contains(text(), "Save")]',
      });
    });

    assert.throws(
      () => {
        LocatorTargetValidator.validate({
          kind: 'ELEMENT',
          xpath: '//button[@id="submit"',
        });
      },
      (err: any) =>
        err instanceof LocatorInvalidTargetError &&
        err.message.includes('Malformed XPath expression'),
    );
  });

  it('blocks script-like injection attacks in target fields', () => {
    assert.throws(
      () => {
        LocatorTargetValidator.validate({
          kind: 'CONTROL',
          name: 'javascript:alert(1)',
        });
      },
      (err: any) =>
        err instanceof LocatorInvalidTargetError &&
        err.message.includes('prohibited executable script'),
    );

    assert.throws(
      () => {
        LocatorTargetValidator.validate({
          kind: 'FIELD',
          placeholder: '<script>alert("pwned")</script>',
        });
      },
      (err: any) =>
        err instanceof LocatorInvalidTargetError &&
        err.message.includes('prohibited executable script'),
    );

    assert.throws(
      () => {
        LocatorTargetValidator.validate({
          kind: 'ELEMENT',
          css: 'document.querySelector("#btn")',
        });
      },
      (err: any) =>
        err instanceof LocatorInvalidTargetError &&
        err.message.includes('prohibited executable script'),
    );
  });

  it('enforces maximum length bounds across all target descriptor fields', () => {
    const hugeText = 'a'.repeat(600);
    assert.throws(
      () => {
        LocatorTargetValidator.validate({
          kind: 'CONTROL',
          name: hugeText,
        });
      },
      (err: any) =>
        err instanceof LocatorInvalidTargetError &&
        err.message.includes('exceeds maximum allowed length'),
    );
  });

  it('validates scope descriptors and rejects invalid scope selectors', () => {
    assert.doesNotThrow(() => {
      LocatorTargetValidator.validate({
        kind: 'CONTROL',
        name: 'Confirm',
        scope: {
          type: 'DIALOG',
          name: 'Delete Item Modal',
        },
      });
    });

    assert.throws(
      () => {
        LocatorTargetValidator.validate({
          kind: 'CONTROL',
          name: 'Confirm',
          scope: {
            type: 'CONTAINER',
            selector: 'div[class="open"',
          },
        });
      },
      (err: any) =>
        err instanceof LocatorInvalidTargetError && err.message.includes('Malformed CSS selector'),
    );
  });
});
