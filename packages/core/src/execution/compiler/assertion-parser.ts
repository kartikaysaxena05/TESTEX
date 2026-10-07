/**
 * @file packages/core/src/execution/compiler/assertion-parser.ts
 * Translates step-level and overall expected results into strongly typed ExecutableAssertionDto objects.
 */

import crypto from 'node:crypto';
import type { ExecutableAssertionDto, CompilationDiagnosticDto } from '@ai-quality/contracts';
import { COMPILER_BOUNDS } from './compiler-types.js';

export interface AssertionParseResult {
  readonly assertions: readonly ExecutableAssertionDto[];
  readonly diagnostics: readonly CompilationDiagnosticDto[];
}

/**
 * Phrases that indicate vague or non-testable expectations.
 */
const VAGUE_EXPECTATION_PATTERNS: readonly RegExp[] = [
  /\b(?:responds?|loads?|runs?)\s+(?:quickly|fast|smoothly|properly|efficiently)\b/i,
  /\b(?:works?|functions?|behaves?)\s+(?:as\s+expected|properly|correctly|normally)\b/i,
  /\b(?:handles?|manages?)\s+(?:it|gracefully|well)\b/i,
  /\b(?:user\s+is\s+satisfied|good\s+user\s+experience|high\s+quality)\b/i,
  /\b(?:appropriate|suitable|reasonable)\s+(?:response|result|behavior)\b/i,
];

export class AssertionParser {
  /**
   * Parses an expected result string into one or more strongly typed ExecutableAssertionDto items.
   */
  public parseExpectedResult(
    rawExpected: string | null | undefined,
    stepSequence?: number,
  ): AssertionParseResult {
    const text = (rawExpected || '').trim();
    if (!text) {
      return { assertions: [], diagnostics: [] };
    }

    const diagnostics: CompilationDiagnosticDto[] = [];
    const assertions: ExecutableAssertionDto[] = [];

    // 1. Check for vague/non-executable expectations
    for (const pattern of VAGUE_EXPECTATION_PATTERNS) {
      if (pattern.test(text)) {
        diagnostics.push({
          code: 'NON_EXECUTABLE_EXPECTATION',
          severity: 'WARNING',
          message: `Expected result contains qualitative or vague expectation: '${text.slice(0, 80)}'`,
          reason: `Pattern '${pattern.source}' indicates qualitative requirement that cannot be asserted deterministically.`,
          stepSequence,
          suggestedAction:
            'Clarify the expected result with explicit UI elements, texts, or URL routes.',
        });
      }
    }

    // 2. Split clauses if compound expectation (e.g. "Redirected to /dashboard and Welcome is visible")
    const clauses = this.splitClauses(text);

    for (const clause of clauses) {
      const parsed = this.parseSingleClause(clause, stepSequence);
      if (parsed.assertion) {
        assertions.push(parsed.assertion);
      }
      if (parsed.diagnostic) {
        diagnostics.push(parsed.diagnostic);
      }
    }

    // If no assertions were extracted from non-empty text, generate a fallback visible assertion or diagnostic
    if (assertions.length === 0 && text.length > 0) {
      if (diagnostics.some(d => d.code === 'NON_EXECUTABLE_EXPECTATION')) {
        // Vague text - do not invent false assertions
      } else {
        // Semantic visibility fallback
        assertions.push({
          id: crypto.randomUUID(),
          type: 'VISIBLE',
          target: {
            kind: 'PAGE_REGION',
            semanticHint: text.slice(0, COMPILER_BOUNDS.MAX_TARGET_HINT_LENGTH),
          },
          stepSequence,
          isNegated: false,
          description: text.slice(0, COMPILER_BOUNDS.MAX_PLAN_SUMMARY_LENGTH),
        });
      }
    }

    return { assertions, diagnostics };
  }

  private splitClauses(text: string): readonly string[] {
    // Split on " and " conjunctions or semicolons or periods when separating distinct expectation clauses
    const parts = text
      .split(
        /\s+(?:and\s+then|and\s+also|and\s+additionally|and(?=\s+[A-Z])|and(?=\s+[a-z0-9"']+\s+(?:is|should|displays|shows|appears|disappears|contains|has|redirects)))\s+|;\s*|\.\s+(?=[A-Z])/i,
      )
      .map(p => p.trim())
      .filter(Boolean);

    return parts.length > 0 ? parts : [text];
  }

  private parseSingleClause(
    clause: string,
    stepSequence?: number,
  ): {
    assertion?: ExecutableAssertionDto;
    diagnostic?: CompilationDiagnosticDto;
  } {
    const lower = clause.toLowerCase();

    // 1. URL / Navigation assertions
    const urlMatch =
      clause.match(
        /(?:redirected to|navigates to|url should be|url is)\s+['"`]?([^'"`\s]+)['"`]?/i,
      ) || clause.match(/(?:url|route)\s+(?:contains|should contain)\s+['"`]?([^'"`\s]+)['"`]?/i);

    if (urlMatch && urlMatch[1]) {
      const route = urlMatch[1].trim();
      const isContains = lower.includes('contain');
      return {
        assertion: {
          id: crypto.randomUUID(),
          type: isContains ? 'URL_CONTAINS' : 'URL_EQUALS',
          target: {
            kind: 'ROUTE',
            route,
            semanticHint: route,
          },
          expectedValue: {
            kind: 'LITERAL',
            value: route,
          },
          stepSequence,
          isNegated: false,
          description: clause,
        },
      };
    }

    // 2. Text display assertions
    const textQuoteMatch =
      clause.match(/(?:displays?|shows?|contains?|with text)\s+['"`]([^'"`]+)['"`]/i) ||
      clause.match(/message\s+['"`]([^'"`]+)['"`]\s+(?:is displayed|appears|is shown)/i);

    if (textQuoteMatch && textQuoteMatch[1]) {
      const expectedText = textQuoteMatch[1].trim();
      return {
        assertion: {
          id: crypto.randomUUID(),
          type: lower.includes('exact') ? 'TEXT_EQUALS' : 'TEXT_CONTAINS',
          target: {
            kind: 'ELEMENT',
            semanticHint: expectedText.slice(0, 50),
          },
          expectedValue: {
            kind: 'LITERAL',
            value: expectedText,
          },
          stepSequence,
          isNegated: lower.includes('not ') || lower.includes('should not'),
          description: clause,
        },
      };
    }

    // 3. Checked / Unchecked assertions
    if (lower.includes('checked') || lower.includes('ticked')) {
      const isUnchecked = lower.includes('unchecked') || lower.includes('not checked');
      const targetHint = clause
        .replace(/^(the|a|an)\s+/i, '')
        .replace(/\s+(is|should be)?\s*(checked|unchecked|ticked).*$/i, '')
        .trim();

      return {
        assertion: {
          id: crypto.randomUUID(),
          type: isUnchecked ? 'UNCHECKED' : 'CHECKED',
          target: {
            kind: 'CONTROL',
            role: 'checkbox',
            name: targetHint || 'checkbox',
            semanticHint: targetHint || 'checkbox',
          },
          stepSequence,
          isNegated: isUnchecked,
          description: clause,
        },
      };
    }

    // 4. Enabled / Disabled assertions
    if (lower.includes('enabled') || lower.includes('disabled')) {
      const isDisabled =
        lower.includes('disabled') || lower.includes('not enabled') || lower.includes('inactive');
      const targetHint = clause
        .replace(/^(the|a|an)\s+/i, '')
        .replace(/\s+(is|should be)?\s*(enabled|disabled|inactive).*$/i, '')
        .trim();

      return {
        assertion: {
          id: crypto.randomUUID(),
          type: isDisabled ? 'DISABLED' : 'ENABLED',
          target: {
            kind: 'CONTROL',
            name: targetHint || 'button',
            semanticHint: targetHint || 'control',
          },
          stepSequence,
          isNegated: isDisabled,
          description: clause,
        },
      };
    }

    // 5. Hidden / Disappears assertions
    if (
      lower.includes('hidden') ||
      lower.includes('disappears') ||
      lower.includes('closed') ||
      lower.includes('not visible') ||
      lower.includes('should not be visible')
    ) {
      const targetHint = clause
        .replace(/^(the|a|an)\s+/i, '')
        .replace(/\s+(is|should be)?\s*(hidden|closed|disappears|not visible).*$/i, '')
        .trim();

      return {
        assertion: {
          id: crypto.randomUUID(),
          type: 'HIDDEN',
          target: {
            kind: 'PAGE_REGION',
            semanticHint: targetHint || 'element',
          },
          stepSequence,
          isNegated: true,
          description: clause,
        },
      };
    }

    // 6. Visible / Displayed / Appears assertions
    if (
      lower.includes('visible') ||
      lower.includes('displayed') ||
      lower.includes('appears') ||
      lower.includes('shown') ||
      lower.includes('present')
    ) {
      const targetHint = clause
        .replace(/^(the|a|an)\s+/i, '')
        .replace(
          /\s+(is|should be|must be)?\s*(displayed|visible|shown|present|appears|loaded).*$/i,
          '',
        )
        .trim();

      return {
        assertion: {
          id: crypto.randomUUID(),
          type: 'VISIBLE',
          target: {
            kind: 'PAGE_REGION',
            semanticHint: targetHint || 'element',
          },
          stepSequence,
          isNegated: false,
          description: clause,
        },
      };
    }

    return {};
  }
}
