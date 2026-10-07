/**
 * @file packages/core/src/execution/locators/locator-types.ts
 * Type definitions, bounds, and interfaces for UI Element Resolution & Locator Intelligence (V5 Phase 64).
 */

import type { Page, Locator } from 'playwright';
import type {
  LocatorStrategyType,
  ExecutableTargetDescriptorDto,
  LocatorResolutionResultDto,
} from '@ai-quality/contracts';
import type { BrowserExecutionSession } from '../sessions/session-types.js';

export const LOCATOR_BOUNDS = {
  MAX_CANDIDATE_DIAGNOSTICS: 10,
  MAX_TARGET_TEXT_LENGTH: 512,
  MAX_SELECTOR_LENGTH: 1024,
  MAX_SCOPE_DEPTH: 3,
  DEFAULT_RESOLUTION_TIMEOUT_MS: 5000,
  MIN_RESOLUTION_TIMEOUT_MS: 100,
  MAX_RESOLUTION_TIMEOUT_MS: 60000,
} as const;

/**
 * Standard W3C / ARIA roles supported by Playwright getByRole.
 */
export const ALLOWED_ARIA_ROLES = new Set([
  'alert',
  'alertdialog',
  'application',
  'article',
  'banner',
  'blockquote',
  'button',
  'caption',
  'cell',
  'checkbox',
  'code',
  'columnheader',
  'combobox',
  'complementary',
  'contentinfo',
  'definition',
  'deletion',
  'dialog',
  'directory',
  'document',
  'emphasis',
  'feed',
  'figure',
  'form',
  'generic',
  'grid',
  'gridcell',
  'group',
  'heading',
  'img',
  'insertion',
  'link',
  'list',
  'listbox',
  'listitem',
  'log',
  'main',
  'marquee',
  'math',
  'meter',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'navigation',
  'none',
  'note',
  'option',
  'paragraph',
  'presentation',
  'progressbar',
  'radio',
  'radiogroup',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'scrollbar',
  'search',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'strong',
  'subscript',
  'superscript',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'textbox',
  'time',
  'timer',
  'toolbar',
  'tooltip',
  'tree',
  'treegrid',
  'treeitem',
]);

/**
 * Execution context for locator resolution.
 */
export interface LocatorResolutionContext {
  readonly projectId: string;
  readonly testRunId: string;
  readonly session: BrowserExecutionSession;
  readonly page: Page;
  readonly abortSignal?: AbortSignal;
  readonly timeoutMs?: number;
}

/**
 * Result of building a Playwright locator from strategy.
 */
export interface BuiltLocatorResult {
  readonly locator: Locator;
  readonly strategy: LocatorStrategyType;
  readonly selectorRecipe: string;
  readonly scopeRecipe?: string;
}

/**
 * Authoritative interface for the Locator Resolution Service.
 */
export interface ILocatorResolutionService {
  resolveLocator(
    input: {
      projectId: string;
      testRunId: string;
      target: ExecutableTargetDescriptorDto;
      timeoutMs?: number;
    },
    abortSignal?: AbortSignal,
  ): Promise<LocatorResolutionResultDto>;
}
