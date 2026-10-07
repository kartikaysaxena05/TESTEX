/**
 * @file packages/core/src/execution/actions/locator-resolver.ts
 * Deterministic locator resolution consuming Phase 64 LocatorTargetValidator, ScopeResolver, and LocatorStrategyResolver.
 */

import type { Page, Locator } from 'playwright';
import type { ExecutableTargetDescriptorDto } from '@ai-quality/contracts';
import {
  TargetAmbiguousError,
  InvalidActionError,
  TargetNotResolvedError,
} from './action-errors.js';
import { LocatorTargetValidator } from '../locators/locator-target-validator.js';
import { ScopeResolver } from '../locators/scope-resolver.js';
import { LocatorStrategyResolver } from '../locators/locator-strategy-resolver.js';

export interface ResolveLocatorOptions {
  /**
   * If true, checks if multiple elements match and throws TargetAmbiguousError when count > 1.
   * Default: true.
   */
  readonly strict?: boolean;
}

export class LocatorResolver {
  private readonly scopeResolver: ScopeResolver;
  private readonly strategyResolver: LocatorStrategyResolver;

  constructor(scopeResolver?: ScopeResolver, strategyResolver?: LocatorStrategyResolver) {
    this.scopeResolver = scopeResolver ?? new ScopeResolver();
    this.strategyResolver = strategyResolver ?? new LocatorStrategyResolver();
  }

  /**
   * Resolves an ExecutableTargetDescriptorDto into a Playwright Locator with strict ambiguity validation.
   */
  public async resolve(
    page: Page,
    target?: ExecutableTargetDescriptorDto,
    options?: ResolveLocatorOptions,
  ): Promise<Locator> {
    if (!target) {
      throw new InvalidActionError('Target descriptor is missing for element-targeting action.');
    }

    // 1. Validate target structure, bounds, and injection payloads
    LocatorTargetValidator.validate(target);

    // 2. Build candidate locator with scope and strategy
    const locator = await this.buildLocator(page, target);

    const isStrict = options?.strict ?? true;
    if (isStrict) {
      try {
        const count = await locator.count();
        if (count > 1 && target.ordinal === undefined) {
          const targetSummary = this.summarizeTarget(target);
          throw new TargetAmbiguousError(targetSummary, count);
        }
      } catch (err) {
        if (err instanceof TargetAmbiguousError) {
          throw err;
        }
        // If count() fails due to dynamic page state, let Playwright handle actionability
      }
    }

    if (target.ordinal !== undefined && target.ordinal >= 0) {
      return locator.nth(target.ordinal);
    }

    return locator;
  }

  /**
   * Builds the Playwright Locator utilizing ScopeResolver and LocatorStrategyResolver.
   */
  public async buildLocator(page: Page, target: ExecutableTargetDescriptorDto): Promise<Locator> {
    try {
      const scopeResult = await this.scopeResolver.resolveScope(page, target);
      const builtResult = this.strategyResolver.buildLocator(
        scopeResult.root,
        target,
        scopeResult.scopeRecipe,
      );
      return builtResult.locator;
    } catch (err: unknown) {
      if (err instanceof Error && err.name.startsWith('Locator')) {
        throw new TargetNotResolvedError(this.summarizeTarget(target), err.message);
      }
      throw err;
    }
  }

  /**
   * Generates a readable human summary of the target descriptor.
   */
  public summarizeTarget(target?: ExecutableTargetDescriptorDto): string {
    if (!target) return 'UNKNOWN_TARGET';
    const parts: string[] = [];
    if (target.strategy) parts.push(`strategy=${target.strategy}`);
    if (target.kind) parts.push(`kind=${target.kind}`);
    if (target.role) parts.push(`role=${target.role}`);
    if (target.name) parts.push(`name="${target.name}"`);
    if (target.label) parts.push(`label="${target.label}"`);
    if (target.placeholder) parts.push(`placeholder="${target.placeholder}"`);
    if (target.testId) parts.push(`testId="${target.testId}"`);
    if (target.text) parts.push(`text="${target.text}"`);
    if (target.altText) parts.push(`altText="${target.altText}"`);
    if (target.title) parts.push(`title="${target.title}"`);
    if (target.css) parts.push(`css="${target.css}"`);
    if (target.xpath) parts.push(`xpath="${target.xpath}"`);
    if (target.route) parts.push(`route="${target.route}"`);
    if (target.scope) parts.push(`scope=${target.scope.type}`);
    if (target.ordinal !== undefined) parts.push(`ordinal=${target.ordinal}`);
    if (target.locatorHints && target.locatorHints.length > 0) {
      parts.push(`hints=[${target.locatorHints.join(', ')}]`);
    }
    return parts.join(' ') || 'UNKNOWN_TARGET';
  }
}
