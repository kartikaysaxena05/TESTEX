/**
 * @file packages/core/src/sources/structure/filter-policy.ts
 * 4-tier filtering policy decision engine for repository structure discovery.
 */

import { ScopedIgnoreMatcher } from './ignore-matcher.js';

export type FilterExclusionReason =
  'SECURITY' | 'HARD_EXCLUSION' | 'DEFAULT_EXCLUSION' | 'IGNORE_RULE';

export interface FilterDecision {
  readonly included: boolean;
  readonly reason: 'INCLUDED' | FilterExclusionReason;
}

export const HARD_SECURITY_EXCLUSIONS: readonly string[] = ['.git'] as const;
export const DEFAULT_PRODUCT_EXCLUSIONS: readonly string[] = ['node_modules'] as const;

export class FilterPolicyEngine {
  private readonly hardExclusions = new Set(HARD_SECURITY_EXCLUSIONS);
  private readonly defaultExclusions = new Set(DEFAULT_PRODUCT_EXCLUSIONS);

  /**
   * Evaluates an entry against security boundaries, hard exclusions, default exclusions,
   * and hierarchical .gitignore matchers.
   *
   * SECURITY RULE: Security and hard exclusions ALWAYS take precedence over .gitignore negations.
   */
  evaluate(
    entryName: string,
    repoRelativePath: string,
    isDirectory: boolean,
    matchers: readonly ScopedIgnoreMatcher[],
  ): FilterDecision {
    // Tier 1: Hard Security Exclusions (.git cannot be unignored or bypassed)
    if (
      this.hardExclusions.has(entryName) ||
      repoRelativePath === '.git' ||
      repoRelativePath.startsWith('.git/')
    ) {
      return {
        included: false,
        reason: 'HARD_EXCLUSION',
      };
    }

    // Tier 2: Default Product Exclusions (node_modules early pruned)
    if (
      this.defaultExclusions.has(entryName) ||
      repoRelativePath === 'node_modules' ||
      repoRelativePath.startsWith('node_modules/')
    ) {
      return {
        included: false,
        reason: 'DEFAULT_EXCLUSION',
      };
    }

    // Tier 3: Hierarchical .gitignore matchers (evaluated in order from closest directory scope to root)
    // In Git, rules in deeper directories override higher directories
    for (const matcher of matchers) {
      const result = matcher.test(repoRelativePath, isDirectory);
      if (result.matched) {
        if (result.unignored) {
          return {
            included: true,
            reason: 'INCLUDED',
          };
        }
        if (result.ignored) {
          return {
            included: false,
            reason: 'IGNORE_RULE',
          };
        }
      }
    }

    return {
      included: true,
      reason: 'INCLUDED',
    };
  }
}
