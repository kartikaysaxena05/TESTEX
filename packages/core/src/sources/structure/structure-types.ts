/**
 * @file packages/core/src/sources/structure/structure-types.ts
 * Internal domain types for safe directory traversal and structure discovery.
 */

import type { StructureEntryKind, StructureTruncationReason } from '@ai-quality/contracts';

export interface TraversalLimits {
  readonly maxEntries: number;
  readonly maxDepth: number;
  readonly timeoutMs: number;
  readonly safetyExclusions: readonly string[];
}

export interface DiscoveredEntry {
  readonly relativePath: string;
  readonly name: string;
  readonly kind: StructureEntryKind;
  readonly depth: number;
}

export interface RawStructureResult {
  readonly authorizedRoot: string;
  readonly rootName: string;
  readonly entries: readonly DiscoveredEntry[];
  readonly filesDiscovered: number;
  readonly directoriesDiscovered: number;
  readonly symlinksDiscovered: number;
  readonly totalDiscovered: number;
  readonly includedFiles: number;
  readonly includedDirectories: number;
  readonly totalIncluded: number;
  readonly ignoredEntries: number;
  readonly safetyExcludedEntries: number;
  readonly earlyPrunedDirectories: number;
  readonly ignoreFilesLoaded: number;
  readonly ignoreRulesLoaded: number;
  readonly warnings: readonly string[];
  readonly truncated: boolean;
  readonly truncationReason: StructureTruncationReason | null;
  readonly durationMs: number;
  readonly scannedAt: Date;
}
