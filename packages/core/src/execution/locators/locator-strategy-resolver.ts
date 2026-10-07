/**
 * @file packages/core/src/execution/locators/locator-strategy-resolver.ts
 * Strategy resolver applying accessibility-first precedence, strategy selection, filter composition, and ordinal targeting.
 */

import type { Page, FrameLocator, Locator } from 'playwright';
import type { ExecutableTargetDescriptorDto, LocatorStrategyType } from '@ai-quality/contracts';
import { BuiltLocatorResult } from './locator-types.js';
import { LocatorInvalidTargetError, LocatorUnsupportedStrategyError } from './locator-errors.js';

export class LocatorStrategyResolver {
  /**
   * Resolves an ExecutableTargetDescriptorDto into a Playwright Locator with strategy tagging and recipe derivation.
   */
  public buildLocator(
    container: Page | FrameLocator | Locator,
    target: ExecutableTargetDescriptorDto,
    scopeRecipe = 'page',
  ): BuiltLocatorResult {
    const exact = target.exact !== false;

    // 1. Explicit Strategy provided
    if (target.strategy) {
      return this.buildExplicitStrategy(container, target, target.strategy, exact, scopeRecipe);
    }

    // 2. Accessibility-First Default Hierarchy
    // 2.1 Explicit testId
    if (target.testId && target.testId.trim()) {
      const testId = target.testId.trim();
      let loc = (container as any).getByTestId(testId);
      loc = this.applyFilters(loc, target);
      return {
        locator: loc,
        strategy: 'TEST_ID',
        selectorRecipe: `${scopeRecipe}.getByTestId(${JSON.stringify(testId)})`,
      };
    }

    // 2.2 Explicit Role + Name
    if (target.role && target.role.trim()) {
      const role = target.role.trim().toLowerCase();
      const name = target.name?.trim();
      let loc = (container as any).getByRole(role as any, {
        name: name || undefined,
        exact,
      });
      loc = this.applyFilters(loc, target);
      const nameArg = name ? `, { name: ${JSON.stringify(name)}, exact: ${exact} }` : '';
      return {
        locator: loc,
        strategy: 'ROLE',
        selectorRecipe: `${scopeRecipe}.getByRole(${JSON.stringify(role)}${nameArg})`,
      };
    }

    // 2.3 Explicit Label
    if (target.label && target.label.trim()) {
      const label = target.label.trim();
      let loc = (container as any).getByLabel(label, { exact });
      loc = this.applyFilters(loc, target);
      return {
        locator: loc,
        strategy: 'LABEL',
        selectorRecipe: `${scopeRecipe}.getByLabel(${JSON.stringify(label)}, { exact: ${exact} })`,
      };
    }

    // 2.4 Explicit Placeholder
    if (target.placeholder && target.placeholder.trim()) {
      const placeholder = target.placeholder.trim();
      let loc = (container as any).getByPlaceholder(placeholder, { exact });
      loc = this.applyFilters(loc, target);
      return {
        locator: loc,
        strategy: 'PLACEHOLDER',
        selectorRecipe: `${scopeRecipe}.getByPlaceholder(${JSON.stringify(placeholder)}, { exact: ${exact} })`,
      };
    }

    // 2.5 Form Field semantic kind
    if (target.kind === 'FIELD' && target.name && target.name.trim()) {
      const nameTrimmed = target.name.trim();
      const css = `input[name="${nameTrimmed}"], textarea[name="${nameTrimmed}"], select[name="${nameTrimmed}"], [name="${nameTrimmed}"]`;
      let loc = (container as any).locator(css);
      loc = this.applyFilters(loc, target);
      return {
        locator: loc,
        strategy: 'CSS',
        selectorRecipe: `${scopeRecipe}.locator(${JSON.stringify(css)})`,
      };
    }

    // 2.6 Control semantic kind
    if (target.kind === 'CONTROL' && target.name && target.name.trim()) {
      const name = target.name.trim();
      let loc = (container as any)
        .getByRole('button', { name, exact })
        .or((container as any).getByRole('link', { name, exact }))
        .or((container as any).getByRole('menuitem', { name, exact }))
        .or((container as any).getByRole('tab', { name, exact }));
      loc = this.applyFilters(loc, target);
      return {
        locator: loc,
        strategy: 'ROLE',
        selectorRecipe: `${scopeRecipe}.getByRole('button', { name: ${JSON.stringify(name)}, exact: ${exact} })`,
      };
    }

    // 2.7 Alt Text
    if (target.altText && target.altText.trim()) {
      const alt = target.altText.trim();
      let loc = (container as any).getByAltText(alt, { exact });
      loc = this.applyFilters(loc, target);
      return {
        locator: loc,
        strategy: 'ALT_TEXT',
        selectorRecipe: `${scopeRecipe}.getByAltText(${JSON.stringify(alt)}, { exact: ${exact} })`,
      };
    }

    // 2.8 Title
    if (target.title && target.title.trim()) {
      const title = target.title.trim();
      let loc = (container as any).getByTitle(title, { exact });
      loc = this.applyFilters(loc, target);
      return {
        locator: loc,
        strategy: 'TITLE',
        selectorRecipe: `${scopeRecipe}.getByTitle(${JSON.stringify(title)}, { exact: ${exact} })`,
      };
    }

    // 2.9 Text / Semantic Hint / Name
    const textQuery = (target.text || target.name || target.semanticHint)?.trim();
    if (textQuery) {
      let loc = (container as any).getByText(textQuery, { exact });
      loc = this.applyFilters(loc, target);
      return {
        locator: loc,
        strategy: 'TEXT',
        selectorRecipe: `${scopeRecipe}.getByText(${JSON.stringify(textQuery)}, { exact: ${exact} })`,
      };
    }

    // 2.10 CSS / XPath Hints
    if (target.css && target.css.trim()) {
      let loc = (container as any).locator(target.css.trim());
      loc = this.applyFilters(loc, target);
      return {
        locator: loc,
        strategy: 'CSS',
        selectorRecipe: `${scopeRecipe}.locator(${JSON.stringify(target.css.trim())})`,
      };
    }

    if (target.xpath && target.xpath.trim()) {
      let loc = (container as any).locator(target.xpath.trim());
      loc = this.applyFilters(loc, target);
      return {
        locator: loc,
        strategy: 'XPATH',
        selectorRecipe: `${scopeRecipe}.locator(${JSON.stringify(target.xpath.trim())})`,
      };
    }

    if (target.locatorHints && target.locatorHints.length > 0) {
      const hint = target.locatorHints.find(h => h && h.trim().length > 0)?.trim();
      if (hint) {
        const isXPath = hint.startsWith('/') || hint.startsWith('xpath=');
        let loc = (container as any).locator(hint);
        loc = this.applyFilters(loc, target);
        return {
          locator: loc,
          strategy: isXPath ? 'XPATH' : 'CSS',
          selectorRecipe: `${scopeRecipe}.locator(${JSON.stringify(hint)})`,
        };
      }
    }

    if (target.route && target.route.trim()) {
      const routeCss = `a[href*="${target.route.trim()}"]`;
      let loc = (container as any).locator(routeCss);
      loc = this.applyFilters(loc, target);
      return {
        locator: loc,
        strategy: 'CSS',
        selectorRecipe: `${scopeRecipe}.locator(${JSON.stringify(routeCss)})`,
      };
    }

    throw new LocatorInvalidTargetError(
      `Unable to build locator from target descriptor: ${JSON.stringify(target)}`,
    );
  }

  private buildExplicitStrategy(
    container: Page | FrameLocator | Locator,
    target: ExecutableTargetDescriptorDto,
    strategy: LocatorStrategyType,
    exact: boolean,
    scopeRecipe: string,
  ): BuiltLocatorResult {
    let loc: Locator;
    let recipe = '';

    switch (strategy) {
      case 'TEST_ID': {
        const id = (target.testId || target.name || '').trim();
        if (!id)
          throw new LocatorInvalidTargetError('TEST_ID strategy requires a non-empty testId.');
        loc = (container as any).getByTestId(id);
        recipe = `${scopeRecipe}.getByTestId(${JSON.stringify(id)})`;
        break;
      }
      case 'ROLE': {
        const role = (target.role || '').trim().toLowerCase();
        if (!role) throw new LocatorInvalidTargetError('ROLE strategy requires a non-empty role.');
        const name = target.name?.trim();
        loc = (container as any).getByRole(role as any, { name: name || undefined, exact });
        const nameArg = name ? `, { name: ${JSON.stringify(name)}, exact: ${exact} }` : '';
        recipe = `${scopeRecipe}.getByRole(${JSON.stringify(role)}${nameArg})`;
        break;
      }
      case 'LABEL': {
        const label = (target.label || target.name || '').trim();
        if (!label)
          throw new LocatorInvalidTargetError('LABEL strategy requires a non-empty label.');
        loc = (container as any).getByLabel(label, { exact });
        recipe = `${scopeRecipe}.getByLabel(${JSON.stringify(label)}, { exact: ${exact} })`;
        break;
      }
      case 'PLACEHOLDER': {
        const placeholder = (target.placeholder || target.name || '').trim();
        if (!placeholder)
          throw new LocatorInvalidTargetError(
            'PLACEHOLDER strategy requires a non-empty placeholder.',
          );
        loc = (container as any).getByPlaceholder(placeholder, { exact });
        recipe = `${scopeRecipe}.getByPlaceholder(${JSON.stringify(placeholder)}, { exact: ${exact} })`;
        break;
      }
      case 'TEXT': {
        const text = (target.text || target.name || target.semanticHint || '').trim();
        if (!text) throw new LocatorInvalidTargetError('TEXT strategy requires non-empty text.');
        loc = (container as any).getByText(text, { exact });
        recipe = `${scopeRecipe}.getByText(${JSON.stringify(text)}, { exact: ${exact} })`;
        break;
      }
      case 'ALT_TEXT': {
        const alt = (target.altText || target.name || '').trim();
        if (!alt)
          throw new LocatorInvalidTargetError('ALT_TEXT strategy requires non-empty altText.');
        loc = (container as any).getByAltText(alt, { exact });
        recipe = `${scopeRecipe}.getByAltText(${JSON.stringify(alt)}, { exact: ${exact} })`;
        break;
      }
      case 'TITLE': {
        const title = (target.title || target.name || '').trim();
        if (!title) throw new LocatorInvalidTargetError('TITLE strategy requires non-empty title.');
        loc = (container as any).getByTitle(title, { exact });
        recipe = `${scopeRecipe}.getByTitle(${JSON.stringify(title)}, { exact: ${exact} })`;
        break;
      }
      case 'CSS': {
        const css = (target.css || target.locatorHints?.[0] || '').trim();
        if (!css)
          throw new LocatorInvalidTargetError('CSS strategy requires non-empty css selector.');
        loc = (container as any).locator(css);
        recipe = `${scopeRecipe}.locator(${JSON.stringify(css)})`;
        break;
      }
      case 'XPATH': {
        const xpath = (target.xpath || target.locatorHints?.[0] || '').trim();
        if (!xpath)
          throw new LocatorInvalidTargetError(
            'XPATH strategy requires non-empty xpath expression.',
          );
        loc = (container as any).locator(xpath);
        recipe = `${scopeRecipe}.locator(${JSON.stringify(xpath)})`;
        break;
      }
      default:
        throw new LocatorUnsupportedStrategyError(strategy);
    }

    loc = this.applyFilters(loc, target);
    return {
      locator: loc,
      strategy,
      selectorRecipe: recipe,
    };
  }

  private applyFilters(loc: Locator, target: ExecutableTargetDescriptorDto): Locator {
    let result = loc;
    if (target.filter) {
      if (target.filter.hasText && target.filter.hasText.trim()) {
        result = result.filter({ hasText: target.filter.hasText.trim() });
      }
      if (target.filter.hasNotText && target.filter.hasNotText.trim()) {
        result = result.filter({ hasNotText: target.filter.hasNotText.trim() });
      }
    }
    return result;
  }
}
