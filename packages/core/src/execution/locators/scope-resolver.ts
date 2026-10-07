/**
 * @file packages/core/src/execution/locators/scope-resolver.ts
 * Resolves semantic scopes, containers, modal dialogs, table rows, and iframes for scoped element targeting.
 */

import type { Page, FrameLocator, Locator } from 'playwright';
import type {
  ExecutableTargetDescriptorDto,
  LocatorScopeDescriptorDto,
  LocatorFrameDescriptorDto,
} from '@ai-quality/contracts';
import {
  LocatorScopeNotFoundError,
  LocatorFrameNotFoundError,
  LocatorFrameAmbiguousError,
} from './locator-errors.js';

export interface ResolvedScopeContainer {
  readonly root: Page | FrameLocator | Locator;
  readonly scopeRecipe: string;
}

export class ScopeResolver {
  /**
   * Resolves the enclosing scope or frame for a target descriptor.
   */
  public async resolveScope(
    page: Page,
    target: ExecutableTargetDescriptorDto,
  ): Promise<ResolvedScopeContainer> {
    // 1. Resolve Frame / IFrame if specified
    let currentContainer: Page | FrameLocator | Locator = page;
    let currentRecipe = 'page';

    if (target.frame) {
      const frameResult = await this.resolveFrame(page, target.frame);
      currentContainer = frameResult.frameLocator;
      currentRecipe = frameResult.recipe;
    }

    // 2. Resolve Semantic Scope if specified
    if (target.scope) {
      const scopeResult = await this.resolveSemanticScope(currentContainer, target.scope);
      currentContainer = scopeResult.locator;
      currentRecipe = `${currentRecipe}.${scopeResult.recipe}`;
    }

    return {
      root: currentContainer,
      scopeRecipe: currentRecipe,
    };
  }

  /**
   * Resolves an iframe/frame using Playwright FrameLocator with ambiguity & presence validation.
   */
  public async resolveFrame(
    page: Page,
    frame: LocatorFrameDescriptorDto,
  ): Promise<{ frameLocator: FrameLocator; recipe: string }> {
    let selector = '';
    let recipe = '';

    if (frame.selector) {
      selector = frame.selector.trim();
      recipe = `frameLocator(${JSON.stringify(selector)})`;
    } else if (frame.testId) {
      selector = `iframe[data-testid="${frame.testId.trim()}"]`;
      recipe = `frameLocator('iframe[data-testid="${frame.testId.trim()}"]')`;
    } else if (frame.name) {
      selector = `iframe[name="${frame.name.trim()}"], frame[name="${frame.name.trim()}"]`;
      recipe = `frameLocator('iframe[name="${frame.name.trim()}"]')`;
    } else {
      selector = 'iframe, frame';
      recipe = `frameLocator('iframe')`;
    }

    // Check count of matching frame elements in DOM for ambiguity / existence
    const frameElementLocator = page.locator(selector);
    const count = await frameElementLocator.count();

    if (count === 0) {
      const desc = frame.selector || frame.name || frame.testId || 'default iframe';
      throw new LocatorFrameNotFoundError(desc);
    }

    if (count > 1) {
      const desc = frame.selector || frame.name || frame.testId || 'iframe';
      throw new LocatorFrameAmbiguousError(desc, count);
    }

    return {
      frameLocator: page.frameLocator(selector),
      recipe,
    };
  }

  /**
   * Resolves a semantic scope container (dialog, form, table row, region, etc.).
   */
  public async resolveSemanticScope(
    container: Page | FrameLocator | Locator,
    scope: LocatorScopeDescriptorDto,
  ): Promise<{ locator: Locator; recipe: string }> {
    let locator: Locator;
    let recipe: string;
    const name = scope.name?.trim();
    const hasText = scope.hasText?.trim();

    switch (scope.type) {
      case 'DIALOG':
      case 'MODAL': {
        if (name) {
          locator = (container as any).getByRole('dialog', { name, exact: false });
          recipe = `getByRole('dialog', { name: ${JSON.stringify(name)} })`;
        } else if (hasText) {
          locator = (container as any)
            .locator('dialog, [role="dialog"], [aria-modal="true"]')
            .filter({ hasText });
          recipe = `locator('dialog, [role="dialog"]').filter({ hasText: ${JSON.stringify(hasText)} })`;
        } else if (scope.selector) {
          locator = (container as any).locator(scope.selector);
          recipe = `locator(${JSON.stringify(scope.selector)})`;
        } else {
          locator = (container as any).locator('dialog, [role="dialog"], [aria-modal="true"]');
          recipe = `locator('dialog, [role="dialog"]')`;
        }
        break;
      }

      case 'FORM': {
        if (name) {
          locator = (container as any)
            .locator(`form[name="${name}"], form#${name}, form[data-testid="${name}"]`)
            .or((container as any).getByRole('form', { name, exact: false }));
          recipe = `locator('form[name="${name}"]').or(getByRole('form', { name: ${JSON.stringify(name)} }))`;
        } else if (hasText) {
          locator = (container as any).locator('form').filter({ hasText });
          recipe = `locator('form').filter({ hasText: ${JSON.stringify(hasText)} })`;
        } else if (scope.selector) {
          locator = (container as any).locator(scope.selector);
          recipe = `locator(${JSON.stringify(scope.selector)})`;
        } else {
          locator = (container as any).locator('form');
          recipe = `locator('form')`;
        }
        break;
      }

      case 'TABLE_ROW': {
        const textQuery = hasText || name;
        if (textQuery) {
          locator = (container as any).getByRole('row').filter({ hasText: textQuery });
          recipe = `getByRole('row').filter({ hasText: ${JSON.stringify(textQuery)} })`;
        } else if (scope.selector) {
          locator = (container as any).locator(scope.selector);
          recipe = `locator(${JSON.stringify(scope.selector)})`;
        } else {
          locator = (container as any).getByRole('row');
          recipe = `getByRole('row')`;
        }
        break;
      }

      case 'TABLE': {
        if (name) {
          locator = (container as any).getByRole('table', { name, exact: false });
          recipe = `getByRole('table', { name: ${JSON.stringify(name)} })`;
        } else if (scope.selector) {
          locator = (container as any).locator(scope.selector);
          recipe = `locator(${JSON.stringify(scope.selector)})`;
        } else {
          locator = (container as any).locator('table');
          recipe = `locator('table')`;
        }
        break;
      }

      case 'REGION':
      case 'SECTION': {
        if (name) {
          locator = (container as any).getByRole('region', { name, exact: false });
          recipe = `getByRole('region', { name: ${JSON.stringify(name)} })`;
        } else if (hasText) {
          locator = (container as any).locator('section, [role="region"]').filter({ hasText });
          recipe = `locator('section').filter({ hasText: ${JSON.stringify(hasText)} })`;
        } else if (scope.selector) {
          locator = (container as any).locator(scope.selector);
          recipe = `locator(${JSON.stringify(scope.selector)})`;
        } else {
          locator = (container as any).locator('section, [role="region"]');
          recipe = `locator('section')`;
        }
        break;
      }

      case 'CONTAINER':
      default: {
        if (scope.selector) {
          locator = (container as any).locator(scope.selector);
          recipe = `locator(${JSON.stringify(scope.selector)})`;
        } else if (scope.testId) {
          locator = (container as any).getByTestId(scope.testId);
          recipe = `getByTestId(${JSON.stringify(scope.testId)})`;
        } else if (hasText) {
          locator = (container as any).locator('div, section, article').filter({ hasText });
          recipe = `locator('div, section').filter({ hasText: ${JSON.stringify(hasText)} })`;
        } else {
          locator = (container as any).locator('body');
          recipe = `locator('body')`;
        }
        break;
      }
    }

    // Verify scope exists in DOM
    const count = await locator.count().catch(() => 0);
    if (count === 0) {
      throw new LocatorScopeNotFoundError(
        scope.type,
        scope.name || scope.selector || scope.hasText,
      );
    }

    return { locator, recipe };
  }
}
