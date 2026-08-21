/**
 * @file packages/core/src/sources/indexing/import-resolver.ts
 * Deterministic local module import resolution against known repository structure.
 */

import path from 'node:path';

export interface ResolvedImportInfo {
  readonly specifier: string;
  readonly isExternal: boolean;
  readonly resolvedRelativePath: string | null;
}

export class ImportResolver {
  /**
   * Resolves a module specifier from an importing file against the set of known repository files.
   */
  static resolve(
    fromRelativePath: string,
    specifier: string,
    knownRelativePaths: Set<string>,
  ): ResolvedImportInfo {
    // 1. External packages (e.g., 'react', '@prisma/client', 'os')
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
      return {
        specifier,
        isExternal: true,
        resolvedRelativePath: null,
      };
    }

    // 2. Relative local paths (e.g. './user-repository', '../db')
    const baseDir = path.posix.dirname(fromRelativePath);
    const candidatePath = path.posix.normalize(path.posix.join(baseDir, specifier));

    // Try candidate variations
    const candidates = [
      candidatePath,
      `${candidatePath}.ts`,
      `${candidatePath}.tsx`,
      `${candidatePath}.js`,
      `${candidatePath}.jsx`,
      `${candidatePath}.mts`,
      `${candidatePath}.cts`,
      `${candidatePath}.mjs`,
      `${candidatePath}.cjs`,
      `${candidatePath}.py`,
      `${candidatePath}/index.ts`,
      `${candidatePath}/index.tsx`,
      `${candidatePath}/index.js`,
      `${candidatePath}/index.jsx`,
      `${candidatePath}/__init__.py`,
    ];

    for (const cand of candidates) {
      if (knownRelativePaths.has(cand)) {
        return {
          specifier,
          isExternal: false,
          resolvedRelativePath: cand,
        };
      }
    }

    return {
      specifier,
      isExternal: false,
      resolvedRelativePath: null,
    };
  }
}
