/**
 * @file packages/core/src/execution/assertions/assertion-types.ts
 * Type definitions, execution contexts, bounds, and interfaces for the Phase 67 Assertion Engine.
 */

import type { Page, BrowserContext } from 'playwright';
import type {
  AssertionType,
  AssertionOperator,
  AssertionOptionsDto,
  AssertionResultDto,
  ExecutableAssertionDto,
} from '@ai-quality/contracts';
import type { BrowserExecutionSession } from '../sessions/session-types.js';

export const ASSERTION_BOUNDS = {
  DEFAULT_TIMEOUT_MS: 5000,
  MIN_TIMEOUT_MS: 100,
  MAX_TIMEOUT_MS: 60000,
  MAX_TEXT_CAPTURE_LENGTH: 4096,
  MAX_SUMMARY_LENGTH: 256,
} as const;

export interface AssertionExecutionContext {
  readonly projectId: string;
  readonly testRunId: string;
  readonly stepId?: string;
  readonly page: Page;
  readonly browserContext?: BrowserContext;
  readonly session?: BrowserExecutionSession;
  readonly variables?: Record<string, unknown>;
  readonly secrets?: Record<string, string>;
  readonly abortSignal?: AbortSignal;
}

export interface IAssertionEvaluator {
  readonly supportedTypes: readonly AssertionType[];
  evaluate(
    assertion: ExecutableAssertionDto,
    context: AssertionExecutionContext,
    options?: AssertionOptionsDto,
  ): Promise<AssertionResultDto>;
}

/**
 * Matrix of allowed assertion operators for each assertion type.
 */
export const ALLOWED_OPERATORS_BY_TYPE: Record<AssertionType, readonly AssertionOperator[]> = {
  VISIBLE: ['VISIBLE', 'HIDDEN', 'EQUALS', 'NOT_EQUALS'],
  HIDDEN: ['HIDDEN', 'VISIBLE', 'EQUALS', 'NOT_EQUALS'],
  ELEMENT_VISIBLE: ['VISIBLE', 'HIDDEN', 'EQUALS', 'NOT_EQUALS'],
  ELEMENT_HIDDEN: ['HIDDEN', 'VISIBLE', 'EQUALS', 'NOT_EQUALS'],
  ELEMENT_EXISTS: ['EXISTS', 'NOT_EXISTS', 'EQUALS', 'NOT_EQUALS'],
  ELEMENT_NOT_EXISTS: ['NOT_EXISTS', 'EXISTS', 'EQUALS', 'NOT_EQUALS'],
  ENABLED: ['ENABLED', 'DISABLED', 'EQUALS', 'NOT_EQUALS'],
  DISABLED: ['DISABLED', 'ENABLED', 'EQUALS', 'NOT_EQUALS'],
  ELEMENT_ENABLED: ['ENABLED', 'DISABLED', 'EQUALS', 'NOT_EQUALS'],
  ELEMENT_DISABLED: ['DISABLED', 'ENABLED', 'EQUALS', 'NOT_EQUALS'],
  CHECKED: ['CHECKED', 'UNCHECKED', 'EQUALS', 'NOT_EQUALS'],
  UNCHECKED: ['UNCHECKED', 'CHECKED', 'EQUALS', 'NOT_EQUALS'],
  ELEMENT_CHECKED: ['CHECKED', 'UNCHECKED', 'EQUALS', 'NOT_EQUALS'],
  ELEMENT_UNCHECKED: ['UNCHECKED', 'CHECKED', 'EQUALS', 'NOT_EQUALS'],
  TEXT_EQUALS: ['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'NOT_CONTAINS', 'MATCHES'],
  TEXT_CONTAINS: ['CONTAINS', 'NOT_CONTAINS', 'EQUALS', 'NOT_EQUALS', 'MATCHES'],
  TEXT_MATCHES: ['MATCHES', 'EQUALS', 'NOT_EQUALS'],
  VALUE_EQUALS: ['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'NOT_CONTAINS', 'MATCHES'],
  VALUE_CONTAINS: ['CONTAINS', 'NOT_CONTAINS', 'EQUALS', 'NOT_EQUALS', 'MATCHES'],
  URL_EQUALS: ['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'NOT_CONTAINS', 'MATCHES'],
  URL_CONTAINS: ['CONTAINS', 'NOT_CONTAINS', 'EQUALS', 'NOT_EQUALS', 'MATCHES'],
  URL_MATCHES: ['MATCHES', 'EQUALS', 'NOT_EQUALS'],
  TITLE_EQUALS: ['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'NOT_CONTAINS', 'MATCHES'],
  PAGE_TITLE_EQUALS: ['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'NOT_CONTAINS', 'MATCHES'],
  PAGE_TITLE_CONTAINS: ['CONTAINS', 'NOT_CONTAINS', 'EQUALS', 'NOT_EQUALS', 'MATCHES'],
  COUNT_EQUALS: [
    'EQUALS',
    'NOT_EQUALS',
    'GREATER_THAN',
    'GREATER_THAN_OR_EQUAL',
    'LESS_THAN',
    'LESS_THAN_OR_EQUAL',
  ],
  ELEMENT_COUNT_EQUALS: [
    'EQUALS',
    'NOT_EQUALS',
    'GREATER_THAN',
    'GREATER_THAN_OR_EQUAL',
    'LESS_THAN',
    'LESS_THAN_OR_EQUAL',
  ],
  ELEMENT_COUNT_GREATER_THAN: [
    'GREATER_THAN',
    'GREATER_THAN_OR_EQUAL',
    'EQUALS',
    'NOT_EQUALS',
    'LESS_THAN',
  ],
  ELEMENT_COUNT_LESS_THAN: [
    'LESS_THAN',
    'LESS_THAN_OR_EQUAL',
    'EQUALS',
    'NOT_EQUALS',
    'GREATER_THAN',
  ],
  ATTRIBUTE_EQUALS: ['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'NOT_CONTAINS', 'MATCHES'],
  ATTRIBUTE_CONTAINS: ['CONTAINS', 'NOT_CONTAINS', 'EQUALS', 'NOT_EQUALS', 'MATCHES'],
  RESPONSE_STATUS: ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN'],
  CUSTOM_CONDITION: ['EQUALS', 'NOT_EQUALS', 'EXISTS', 'NOT_EXISTS', 'VISIBLE', 'HIDDEN'],
};

/**
 * Infers the primary default operator for a given assertion type.
 */
export function getDefaultOperatorForType(type: AssertionType): AssertionOperator {
  switch (type) {
    case 'VISIBLE':
    case 'ELEMENT_VISIBLE':
      return 'VISIBLE';
    case 'HIDDEN':
    case 'ELEMENT_HIDDEN':
      return 'HIDDEN';
    case 'ELEMENT_EXISTS':
      return 'EXISTS';
    case 'ELEMENT_NOT_EXISTS':
      return 'NOT_EXISTS';
    case 'ENABLED':
    case 'ELEMENT_ENABLED':
      return 'ENABLED';
    case 'DISABLED':
    case 'ELEMENT_DISABLED':
      return 'DISABLED';
    case 'CHECKED':
    case 'ELEMENT_CHECKED':
      return 'CHECKED';
    case 'UNCHECKED':
    case 'ELEMENT_UNCHECKED':
      return 'UNCHECKED';
    case 'TEXT_CONTAINS':
    case 'VALUE_CONTAINS':
    case 'URL_CONTAINS':
    case 'PAGE_TITLE_CONTAINS':
    case 'ATTRIBUTE_CONTAINS':
      return 'CONTAINS';
    case 'TEXT_MATCHES':
    case 'URL_MATCHES':
      return 'MATCHES';
    case 'ELEMENT_COUNT_GREATER_THAN':
      return 'GREATER_THAN';
    case 'ELEMENT_COUNT_LESS_THAN':
      return 'LESS_THAN';
    default:
      return 'EQUALS';
  }
}
