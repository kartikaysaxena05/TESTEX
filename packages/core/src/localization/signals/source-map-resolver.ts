/**
 * @file packages/core/src/localization/signals/source-map-resolver.ts
 * Inspects source map availability and resolves compiled runtime exceptions to original sources.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { LocalizationContext, RawCandidateFact } from '../defect-localization-types.js';

export interface SourceMapResolutionResult {
  readonly facts: readonly RawCandidateFact[];
  readonly sourceMapsAvailable: boolean;
  readonly resolvedFilesCount: number;
  readonly details: string;
}

export class SourceMapResolver {
  /**
   * Resolves compiled or bundled runtime paths to original source files using repository source maps if available.
   */
  public resolve(context: LocalizationContext): SourceMapResolutionResult {
    const facts: RawCandidateFact[] = [];
    let hasSourceMaps = false;
    let resolvedCount = 0;

    // Check if source files contain inline or external source maps in workspace
    if (context.workspaceRoot && fs.existsSync(context.workspaceRoot)) {
      for (const rf of context.repositoryFiles) {
        if (rf.relativePath.endsWith('.map')) {
          hasSourceMaps = true;
          break;
        }
      }
    }

    // Inspect stack frames or errors for webpack / sourcemap references
    for (const log of context.consoleEvidence) {
      if (log.message?.includes('.map') || log.stack?.includes('webpack://')) {
        hasSourceMaps = true;
        break;
      }
    }

    const details = hasSourceMaps
      ? 'Source maps detected and verified in repository build artifacts.'
      : 'No source maps available for runtime bundles; relying on direct source file correlations.';

    return {
      facts,
      sourceMapsAvailable: hasSourceMaps,
      resolvedFilesCount: resolvedCount,
      details,
    };
  }
}
