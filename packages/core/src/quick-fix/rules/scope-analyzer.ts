/**
 * @file packages/core/src/quick-fix/rules/scope-analyzer.ts
 * Extracts and analyzes candidate files and symbols from technical localization and root cause analysis.
 */

import type { QuickFixCandidateSymbol } from '../quick-fix-types.js';

export interface ScopeAnalysisInput {
  readonly localization?: {
    readonly matchedFilePath?: string | null;
    readonly matchedSymbolName?: string | null;
    readonly matchedLineNumber?: number | null;
    readonly secondaryTargets?: unknown;
  } | null;
  readonly rootCause?: {
    readonly repositoryReferences?: unknown;
    readonly probableComponent?: string | null;
  } | null;
}

export interface ScopeAnalysisResult {
  readonly candidateFiles: readonly string[];
  readonly candidateSymbols: readonly QuickFixCandidateSymbol[];
  readonly isLargeScope: boolean;
}

export class ScopeAnalyzer {
  public analyzeScope(input: ScopeAnalysisInput): ScopeAnalysisResult {
    const fileSet = new Set<string>();
    const symbolMap = new Map<string, QuickFixCandidateSymbol>();

    // 1. Ingest primary localization target
    if (
      input.localization?.matchedFilePath &&
      typeof input.localization.matchedFilePath === 'string'
    ) {
      const filePath = input.localization.matchedFilePath.trim();
      if (filePath.length > 0) {
        fileSet.add(filePath);

        if (input.localization.matchedSymbolName) {
          const key = `${filePath}:${input.localization.matchedSymbolName}`;
          symbolMap.set(key, {
            filePath,
            symbolName: input.localization.matchedSymbolName,
            symbolType: 'FUNCTION',
            line: input.localization.matchedLineNumber ?? undefined,
          });
        }
      }
    }

    // 2. Ingest secondary localization targets
    if (Array.isArray(input.localization?.secondaryTargets)) {
      for (const target of input.localization.secondaryTargets) {
        if (!target || typeof target !== 'object') continue;
        const targetObj = target as Record<string, unknown>;
        const filePath = typeof targetObj.filePath === 'string' ? targetObj.filePath.trim() : null;
        if (filePath && filePath.length > 0) {
          fileSet.add(filePath);
          const symbolName =
            typeof targetObj.symbolName === 'string' ? targetObj.symbolName.trim() : null;
          if (symbolName) {
            const key = `${filePath}:${symbolName}`;
            symbolMap.set(key, {
              filePath,
              symbolName,
              symbolType:
                typeof targetObj.symbolType === 'string' ? targetObj.symbolType : 'IDENTIFIER',
              line: typeof targetObj.line === 'number' ? targetObj.line : undefined,
            });
          }
        }
      }
    }

    // 3. Ingest root-cause repository references
    if (Array.isArray(input.rootCause?.repositoryReferences)) {
      for (const ref of input.rootCause.repositoryReferences) {
        if (!ref || typeof ref !== 'object') continue;
        const refObj = ref as Record<string, unknown>;
        const filePath = typeof refObj.filePath === 'string' ? refObj.filePath.trim() : null;
        if (filePath && filePath.length > 0) {
          fileSet.add(filePath);
          const symbolName = typeof refObj.symbol === 'string' ? refObj.symbol.trim() : null;
          if (symbolName) {
            const key = `${filePath}:${symbolName}`;
            if (!symbolMap.has(key)) {
              symbolMap.set(key, {
                filePath,
                symbolName,
                symbolType: typeof refObj.symbolType === 'string' ? refObj.symbolType : 'FUNCTION',
                line: typeof refObj.line === 'number' ? refObj.line : undefined,
              });
            }
          }
        }
      }
    }

    const candidateFiles = Array.from(fileSet).sort();
    const candidateSymbols = Array.from(symbolMap.values());
    const isLargeScope = candidateFiles.length > 3 || candidateSymbols.length > 5;

    return {
      candidateFiles,
      candidateSymbols,
      isLargeScope,
    };
  }
}
