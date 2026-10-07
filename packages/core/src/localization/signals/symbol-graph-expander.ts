/**
 * @file packages/core/src/localization/signals/symbol-graph-expander.ts
 * Bounded traversal of the repository symbol and import graph to discover related components, services, and models.
 */

import {
  DEFECT_LOCALIZATION_BOUNDS,
  type LocalizationContext,
  type RawCandidateFact,
} from '../defect-localization-types.js';

export interface SymbolGraphExpansionResult {
  readonly facts: readonly RawCandidateFact[];
  readonly nodesExplored: number;
  readonly maxDepthReached: number;
  readonly relatedFiles: readonly string[];
  readonly relatedSymbols: readonly string[];
}

export class SymbolGraphExpander {
  /**
   * Expands initial direct candidate files into their immediate imports and callers up to MAX_GRAPH_DEPTH.
   */
  public expand(
    initialCandidates: readonly {
      readonly filePath: string;
      readonly symbolName?: string | null;
    }[],
    context: LocalizationContext,
  ): SymbolGraphExpansionResult {
    const facts: RawCandidateFact[] = [];
    const visitedFiles = new Set<string>();
    const relatedFiles = new Set<string>();
    const relatedSymbols = new Set<string>();

    let currentLevel = new Set<string>(initialCandidates.map(c => c.filePath));
    let depth = 0;
    let nodesExplored = 0;

    // File lookup map
    const fileByPath = new Map<string, (typeof context.repositoryFiles)[0]>();
    for (const f of context.repositoryFiles) {
      fileByPath.set(f.relativePath, f);
    }

    while (
      currentLevel.size > 0 &&
      depth < DEFECT_LOCALIZATION_BOUNDS.MAX_GRAPH_DEPTH &&
      visitedFiles.size < DEFECT_LOCALIZATION_BOUNDS.MAX_CANDIDATE_FILES
    ) {
      depth++;
      const nextLevel = new Set<string>();

      for (const filePath of currentLevel) {
        if (visitedFiles.has(filePath)) continue;
        visitedFiles.add(filePath);
        nodesExplored++;

        const fileRecord = fileByPath.get(filePath);
        if (!fileRecord) continue;

        // 1. Traverse imported local files
        for (const imp of fileRecord.imports) {
          if (imp.isExternal || !imp.resolvedRelativePath) continue;

          const targetFile = fileByPath.get(imp.resolvedRelativePath);
          if (!targetFile || visitedFiles.has(targetFile.relativePath)) continue;

          relatedFiles.add(targetFile.relativePath);
          nextLevel.add(targetFile.relativePath);

          // Find exported symbol in target file if matching import specifier
          const targetSymbol = targetFile.symbols.find(s => s.isExported);
          if (targetSymbol) relatedSymbols.add(targetSymbol.name);

          const lowerTarget = targetFile.relativePath.toLowerCase();
          const candidateType = lowerTarget.includes('repository')
            ? 'REPOSITORY'
            : lowerTarget.includes('service')
              ? 'SERVICE'
              : lowerTarget.includes('model') || lowerTarget.includes('schema')
                ? 'VALIDATION_SCHEMA'
                : 'FUNCTION';

          facts.push({
            filePath: targetFile.relativePath,
            symbolName: targetSymbol?.name ?? null,
            symbolKind: targetSymbol?.kind ?? null,
            candidateType,
            startLine: targetSymbol?.startLine ?? null,
            endLine: targetSymbol?.endLine ?? null,
            signal: 'SYMBOL_GRAPH_IMPORT',
            strength: depth === 1 ? 'MODERATE' : 'WEAK',
            description: `Imported by candidate '${filePath}' at depth ${depth} (specifier: '${imp.specifier}').`,
            provenance: `AST import graph from ${filePath}:${imp.lineNumber}`,
            rawReference: imp.specifier,
          });
        }

        // 2. Traverse files that import THIS file (callers)
        for (const candidateFile of context.repositoryFiles) {
          if (candidateFile.relativePath === filePath) continue;
          const importsThis = candidateFile.imports.some(i => i.resolvedRelativePath === filePath);
          if (importsThis && !visitedFiles.has(candidateFile.relativePath)) {
            relatedFiles.add(candidateFile.relativePath);
            nextLevel.add(candidateFile.relativePath);

            facts.push({
              filePath: candidateFile.relativePath,
              symbolName: candidateFile.symbols[0]?.name ?? null,
              symbolKind: candidateFile.symbols[0]?.kind ?? null,
              candidateType: 'CONTROLLER',
              startLine: candidateFile.symbols[0]?.startLine ?? null,
              endLine: candidateFile.symbols[0]?.endLine ?? null,
              signal: 'SYMBOL_GRAPH_CALLER',
              strength: 'WEAK',
              description: `Dependent caller '${candidateFile.relativePath}' imports candidate '${filePath}'.`,
              provenance: `Reverse AST import graph from ${candidateFile.relativePath}`,
              rawReference: filePath,
            });
          }
        }
      }

      currentLevel = nextLevel;
    }

    return {
      facts,
      nodesExplored,
      maxDepthReached: depth,
      relatedFiles: Array.from(relatedFiles),
      relatedSymbols: Array.from(relatedSymbols),
    };
  }
}
