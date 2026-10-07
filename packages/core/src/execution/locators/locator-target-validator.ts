/**
 * @file packages/core/src/execution/locators/locator-target-validator.ts
 * Strict runtime validation for semantic locator target descriptors, preventing malformed inputs and selector injection.
 */

import type { ExecutableTargetDescriptorDto } from '@ai-quality/contracts';
import { LOCATOR_BOUNDS, ALLOWED_ARIA_ROLES } from './locator-types.js';
import { LocatorInvalidTargetError } from './locator-errors.js';

const FORBIDDEN_INJECTION_PATTERNS = [
  /javascript\s*:/i,
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<\s*script/i,
  /\bdocument\.(?:querySelector|getElementById|getElementsBy|evaluate|execCommand)\b/i,
  /\bwindow\.(?:eval|location|document)\b/i,
  /\bpage\.evaluate\b/i,
];

export class LocatorTargetValidator {
  /**
   * Validates an ExecutableTargetDescriptorDto at runtime.
   * Throws LocatorInvalidTargetError if the descriptor violates bounds, syntax rules, or security invariants.
   */
  public static validate(target: ExecutableTargetDescriptorDto): void {
    if (!target) {
      throw new LocatorInvalidTargetError('Target descriptor cannot be null or undefined.');
    }

    if (!target.kind) {
      throw new LocatorInvalidTargetError('Target descriptor must specify a valid kind.');
    }

    // 1. Validate String Length Bounds
    this.validateStringBounds('name', target.name, LOCATOR_BOUNDS.MAX_TARGET_TEXT_LENGTH);
    this.validateStringBounds('label', target.label, LOCATOR_BOUNDS.MAX_TARGET_TEXT_LENGTH);
    this.validateStringBounds(
      'placeholder',
      target.placeholder,
      LOCATOR_BOUNDS.MAX_TARGET_TEXT_LENGTH,
    );
    this.validateStringBounds('text', target.text, LOCATOR_BOUNDS.MAX_TARGET_TEXT_LENGTH);
    this.validateStringBounds('altText', target.altText, LOCATOR_BOUNDS.MAX_TARGET_TEXT_LENGTH);
    this.validateStringBounds('title', target.title, LOCATOR_BOUNDS.MAX_TARGET_TEXT_LENGTH);
    this.validateStringBounds(
      'semanticHint',
      target.semanticHint,
      LOCATOR_BOUNDS.MAX_TARGET_TEXT_LENGTH,
    );
    this.validateStringBounds('testId', target.testId, 128);
    this.validateStringBounds('css', target.css, LOCATOR_BOUNDS.MAX_SELECTOR_LENGTH);
    this.validateStringBounds('xpath', target.xpath, LOCATOR_BOUNDS.MAX_SELECTOR_LENGTH);

    // 2. Validate Injection Safety across all text fields
    this.checkInjectionSafety('name', target.name);
    this.checkInjectionSafety('label', target.label);
    this.checkInjectionSafety('placeholder', target.placeholder);
    this.checkInjectionSafety('text', target.text);
    this.checkInjectionSafety('altText', target.altText);
    this.checkInjectionSafety('title', target.title);
    this.checkInjectionSafety('semanticHint', target.semanticHint);
    this.checkInjectionSafety('css', target.css);
    this.checkInjectionSafety('xpath', target.xpath);

    // 3. Validate Role
    if (target.role !== undefined && target.role !== null) {
      const normalizedRole = target.role.trim().toLowerCase();
      if (!normalizedRole) {
        throw new LocatorInvalidTargetError('Role cannot be empty when specified.');
      }
      if (!ALLOWED_ARIA_ROLES.has(normalizedRole)) {
        throw new LocatorInvalidTargetError(
          `Invalid ARIA role: '${target.role}'. Must be a valid standard W3C ARIA role.`,
          { role: target.role },
        );
      }
    }

    // 4. Validate Ordinal / Index
    if (target.ordinal !== undefined && target.ordinal !== null) {
      if (!Number.isInteger(target.ordinal) || target.ordinal < 0) {
        throw new LocatorInvalidTargetError(
          `Invalid target ordinal: ${target.ordinal}. Must be a non-negative integer.`,
          { ordinal: target.ordinal },
        );
      }
    }

    // 5. Validate CSS Selector Syntax
    if (target.css) {
      this.validateCssSyntax(target.css);
    }

    // 6. Validate XPath Syntax
    if (target.xpath) {
      this.validateXPathSyntax(target.xpath);
    }

    // 7. Validate Locator Hints
    if (target.locatorHints) {
      if (!Array.isArray(target.locatorHints)) {
        throw new LocatorInvalidTargetError('locatorHints must be an array of selector strings.');
      }
      for (const hint of target.locatorHints) {
        this.validateStringBounds('locatorHint', hint, LOCATOR_BOUNDS.MAX_SELECTOR_LENGTH);
        this.checkInjectionSafety('locatorHint', hint);
        if (hint && (hint.startsWith('/') || hint.startsWith('xpath='))) {
          this.validateXPathSyntax(hint.replace(/^xpath=/, ''));
        } else if (hint) {
          this.validateCssSyntax(hint);
        }
      }
    }

    // 8. Validate Scope
    if (target.scope) {
      this.validateScope(target.scope);
    }

    // 9. Validate Filter
    if (target.filter) {
      this.validateStringBounds(
        'filter.hasText',
        target.filter.hasText,
        LOCATOR_BOUNDS.MAX_TARGET_TEXT_LENGTH,
      );
      this.validateStringBounds(
        'filter.hasNotText',
        target.filter.hasNotText,
        LOCATOR_BOUNDS.MAX_TARGET_TEXT_LENGTH,
      );
      this.checkInjectionSafety('filter.hasText', target.filter.hasText);
      this.checkInjectionSafety('filter.hasNotText', target.filter.hasNotText);
    }

    // 10. Validate Frame
    if (target.frame) {
      this.validateStringBounds(
        'frame.selector',
        target.frame.selector,
        LOCATOR_BOUNDS.MAX_SELECTOR_LENGTH,
      );
      this.validateStringBounds(
        'frame.name',
        target.frame.name,
        LOCATOR_BOUNDS.MAX_TARGET_TEXT_LENGTH,
      );
      this.validateStringBounds('frame.testId', target.frame.testId, 128);
      this.checkInjectionSafety('frame.selector', target.frame.selector);
      this.checkInjectionSafety('frame.name', target.frame.name);
      if (target.frame.selector) {
        this.validateCssSyntax(target.frame.selector);
      }
    }

    // 11. Ensure at least one identifying property exists
    const hasIdentifier = Boolean(
      target.testId ||
      target.role ||
      target.name ||
      target.label ||
      target.placeholder ||
      target.text ||
      target.altText ||
      target.title ||
      target.css ||
      target.xpath ||
      target.semanticHint ||
      target.route ||
      (target.locatorHints && target.locatorHints.length > 0),
    );

    if (!hasIdentifier) {
      throw new LocatorInvalidTargetError(
        'Target descriptor must specify at least one identifying property (testId, role, name, label, placeholder, text, altText, title, css, xpath, or locatorHints).',
      );
    }
  }

  private static validateStringBounds(field: string, val: unknown, maxLen: number): void {
    if (val !== undefined && val !== null) {
      if (typeof val !== 'string') {
        throw new LocatorInvalidTargetError(`Field '${field}' must be a string.`);
      }
      if (val.length > maxLen) {
        throw new LocatorInvalidTargetError(
          `Field '${field}' length (${val.length}) exceeds maximum allowed length of ${maxLen} characters.`,
          { field, length: val.length, maxLen },
        );
      }
    }
  }

  private static checkInjectionSafety(field: string, val?: string): void {
    if (!val || typeof val !== 'string') return;

    for (const pattern of FORBIDDEN_INJECTION_PATTERNS) {
      if (pattern.test(val)) {
        throw new LocatorInvalidTargetError(
          `Field '${field}' contains prohibited executable script or injection pattern.`,
          { field },
        );
      }
    }
  }

  private static validateCssSyntax(selector: string): void {
    const trimmed = selector.trim();
    if (!trimmed) {
      throw new LocatorInvalidTargetError('CSS selector cannot be empty.');
    }

    // Check for unbalanced brackets, parentheses, or unclosed quotes
    let brackets = 0;
    let parens = 0;
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];
      const prev = i > 0 ? trimmed[i - 1] : '';

      if (char === "'" && !inDouble && prev !== '\\') {
        inSingle = !inSingle;
      } else if (char === '"' && !inSingle && prev !== '\\') {
        inDouble = !inDouble;
      } else if (!inSingle && !inDouble) {
        if (char === '[') brackets++;
        else if (char === ']') brackets--;
        else if (char === '(') parens++;
        else if (char === ')') parens--;
      }

      if (brackets < 0 || parens < 0) {
        throw new LocatorInvalidTargetError(
          `Malformed CSS selector: unbalanced closing bracket or parenthesis in '${selector}'.`,
          { selector },
        );
      }
    }

    if (brackets !== 0 || parens !== 0 || inSingle || inDouble) {
      throw new LocatorInvalidTargetError(
        `Malformed CSS selector: unclosed quote, bracket, or parenthesis in '${selector}'.`,
        { selector },
      );
    }
  }

  private static validateXPathSyntax(xpath: string): void {
    const trimmed = xpath.trim();
    if (!trimmed) {
      throw new LocatorInvalidTargetError('XPath expression cannot be empty.');
    }

    let brackets = 0;
    let parens = 0;
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];
      const prev = i > 0 ? trimmed[i - 1] : '';

      if (char === "'" && !inDouble && prev !== '\\') {
        inSingle = !inSingle;
      } else if (char === '"' && !inSingle && prev !== '\\') {
        inDouble = !inDouble;
      } else if (!inSingle && !inDouble) {
        if (char === '[') brackets++;
        else if (char === ']') brackets--;
        else if (char === '(') parens++;
        else if (char === ')') parens--;
      }

      if (brackets < 0 || parens < 0) {
        throw new LocatorInvalidTargetError(
          `Malformed XPath expression: unbalanced bracket or parenthesis in '${xpath}'.`,
          { xpath },
        );
      }
    }

    if (brackets !== 0 || parens !== 0 || inSingle || inDouble) {
      throw new LocatorInvalidTargetError(
        `Malformed XPath expression: unclosed quote, bracket, or parenthesis in '${xpath}'.`,
        { xpath },
      );
    }
  }

  private static validateScope(scope: any): void {
    if (!scope.type) {
      throw new LocatorInvalidTargetError('Scope must specify a type.');
    }

    this.validateStringBounds('scope.name', scope.name, LOCATOR_BOUNDS.MAX_TARGET_TEXT_LENGTH);
    this.validateStringBounds('scope.selector', scope.selector, LOCATOR_BOUNDS.MAX_SELECTOR_LENGTH);
    this.validateStringBounds('scope.testId', scope.testId, 128);
    this.validateStringBounds(
      'scope.hasText',
      scope.hasText,
      LOCATOR_BOUNDS.MAX_TARGET_TEXT_LENGTH,
    );

    this.checkInjectionSafety('scope.name', scope.name);
    this.checkInjectionSafety('scope.selector', scope.selector);
    this.checkInjectionSafety('scope.hasText', scope.hasText);

    if (scope.selector) {
      this.validateCssSyntax(scope.selector);
    }
  }
}
