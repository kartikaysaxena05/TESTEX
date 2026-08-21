/**
 * @file packages/core/src/sources/structure/structure-limits.ts
 * Bounded limits and default safety exclusions for repository structure discovery.
 */

import type { TraversalLimits } from './structure-types.js';

export const DEFAULT_STRUCTURE_LIMITS: TraversalLimits = {
  maxEntries: 50000,
  maxDepth: 50,
  timeoutMs: 15000,
  safetyExclusions: ['.git', 'node_modules'],
} as const;
