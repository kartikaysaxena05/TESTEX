/**
 * @file packages/core/src/sources/frameworks/framework-engine.ts
 * Evidence-based framework and library detection engine.
 */

import type {
  DependencyDto,
  SourceStructureEntryDto,
  FrameworkDetectionDto,
} from '@ai-quality/contracts';
import { FRAMEWORK_RULES, type FrameworkRule } from './framework-registry.js';

export class FrameworkEngine {
  constructor(private readonly rules: readonly FrameworkRule[] = FRAMEWORK_RULES) {}

  detect(
    dependencies: readonly DependencyDto[],
    entries: readonly SourceStructureEntryDto[],
  ): readonly FrameworkDetectionDto[] {
    const results: FrameworkDetectionDto[] = [];

    for (const rule of this.rules) {
      const match = rule.match(dependencies, entries);
      if (match.matched) {
        results.push({
          id: rule.id,
          name: rule.name,
          category: rule.category,
          confidence: match.confidence,
          declaredVersion: match.declaredVersion,
          resolvedVersion: null, // Lockfile exact version resolution can enrich this in future phases
          evidence: match.evidence,
        });
      }
    }

    return results.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });
  }
}
