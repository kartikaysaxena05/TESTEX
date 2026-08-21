/**
 * @file packages/core/src/sources/structure/structure-mappers.ts
 * Pure mapper functions transforming raw directory discovery results to renderer-safe SourceStructureDto.
 */

import type { SourceStructureDto } from '@ai-quality/contracts';
import type { RawStructureResult } from './structure-types.js';

export function mapRawStructureToDto(
  sourceId: string,
  raw: RawStructureResult,
): SourceStructureDto {
  return {
    sourceId,
    rootName: raw.rootName,
    entries: raw.entries.map(entry => ({
      relativePath: entry.relativePath,
      name: entry.name,
      kind: entry.kind,
      depth: entry.depth,
    })),
    summary: {
      filesDiscovered: raw.filesDiscovered,
      directoriesDiscovered: raw.directoriesDiscovered,
      symlinksDiscovered: raw.symlinksDiscovered,
      totalDiscovered: raw.totalDiscovered,
      includedFiles: raw.includedFiles,
      includedDirectories: raw.includedDirectories,
      totalIncluded: raw.totalIncluded,
      ignoredEntries: raw.ignoredEntries,
      safetyExcludedEntries: raw.safetyExcludedEntries,
      earlyPrunedDirectories: raw.earlyPrunedDirectories,
      ignoreFilesLoaded: raw.ignoreFilesLoaded,
      ignoreRulesLoaded: raw.ignoreRulesLoaded,
      warnings: raw.warnings,
    },
    truncated: raw.truncated,
    truncationReason: raw.truncationReason,
    scannedAt: raw.scannedAt.toISOString(),
  };
}
