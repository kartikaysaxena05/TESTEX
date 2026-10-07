/**
 * @file packages/core/src/failures/root-cause/repository-reference-validator.ts
 * Strict anti-hallucination validator for AI-proposed repository file and symbol references (V6 Phase 83).
 */

import type { RootCauseRepositoryReferenceDto } from '@ai-quality/contracts';
import { ROOT_CAUSE_BOUNDS } from './root-cause-types.js';

export interface RepositoryFileRecord {
  readonly id: string;
  readonly relativePath: string;
  readonly symbols?: readonly {
    readonly id: string;
    readonly name: string;
    readonly kind?: string | null;
    readonly startLine?: number | null;
    readonly endLine?: number | null;
  }[];
}

export interface ProposedRepositoryReference {
  readonly filePath: string;
  readonly symbolName?: string;
  readonly symbolKind?: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly relevance: string;
}

export interface RepositoryReferenceValidationResult {
  readonly validatedReferences: readonly RootCauseRepositoryReferenceDto[];
  readonly omittedHallucinationsCount: number;
  readonly rejectionReasons: readonly string[];
}

export class RepositoryReferenceValidator {
  /**
   * Normalizes a file path string for consistent comparison.
   */
  public static normalizePath(filePath: string): string {
    return filePath
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/^\//, '')
      .toLowerCase();
  }

  /**
   * Validates AI-proposed repository references against actual verified repository records.
   * Hallucinated or speculative files are strictly rejected and omitted from authoritative records.
   */
  public validateReferences(
    proposedReferences: readonly ProposedRepositoryReference[],
    repositoryFiles: readonly RepositoryFileRecord[],
  ): RepositoryReferenceValidationResult {
    if (!proposedReferences || proposedReferences.length === 0) {
      return {
        validatedReferences: [],
        omittedHallucinationsCount: 0,
        rejectionReasons: [],
      };
    }

    // If no repository context is available in DB, all proposed references are rejected as hallucinated
    if (!repositoryFiles || repositoryFiles.length === 0) {
      return {
        validatedReferences: [],
        omittedHallucinationsCount: proposedReferences.length,
        rejectionReasons: proposedReferences.map(
          ref =>
            `Rejected '${ref.filePath}': project has no connected repository context (live web target).`,
        ),
      };
    }

    // Build lookup maps for fast matching
    const fileByNormalizedPath = new Map<string, RepositoryFileRecord>();
    const fileByExactPath = new Map<string, RepositoryFileRecord>();

    for (const file of repositoryFiles) {
      fileByExactPath.set(file.relativePath, file);
      fileByNormalizedPath.set(RepositoryReferenceValidator.normalizePath(file.relativePath), file);
    }

    const validated: RootCauseRepositoryReferenceDto[] = [];
    const rejectionReasons: string[] = [];
    let omittedCount = 0;

    for (const proposed of proposedReferences) {
      if (!proposed.filePath || typeof proposed.filePath !== 'string') {
        omittedCount++;
        rejectionReasons.push('Rejected repository reference with empty or non-string filePath.');
        continue;
      }

      const normalizedProposed = RepositoryReferenceValidator.normalizePath(proposed.filePath);
      const matchedFile =
        fileByExactPath.get(proposed.filePath.trim()) ??
        fileByNormalizedPath.get(normalizedProposed);

      if (!matchedFile) {
        omittedCount++;
        rejectionReasons.push(
          `Hallucination rejected: File '${proposed.filePath}' was not found in indexed repository files.`,
        );
        continue;
      }

      // File is verified in repository
      let matchedSymbolId: string | undefined;
      let matchedSymbolName: string | undefined;
      let matchedSymbolKind: string | undefined = proposed.symbolKind;
      let matchedStartLine: number | undefined = proposed.startLine;
      let matchedEndLine: number | undefined = proposed.endLine;

      if (proposed.symbolName && typeof proposed.symbolName === 'string') {
        const targetSymbolName = proposed.symbolName.trim().toLowerCase();
        const foundSymbol = (matchedFile.symbols ?? []).find(
          s => s.name.trim().toLowerCase() === targetSymbolName,
        );

        if (foundSymbol) {
          matchedSymbolId = foundSymbol.id;
          matchedSymbolName = foundSymbol.name;
          matchedSymbolKind = foundSymbol.kind ?? proposed.symbolKind;
          matchedStartLine = foundSymbol.startLine ?? proposed.startLine;
          matchedEndLine = foundSymbol.endLine ?? proposed.endLine;
        } else {
          // Symbol was not found in the verified file; keep file reference but omit hallucinated symbol
          rejectionReasons.push(
            `Symbol '${proposed.symbolName}' not verified in '${matchedFile.relativePath}'; degraded to file-level reference.`,
          );
        }
      }

      const relevanceStr =
        typeof proposed.relevance === 'string' && proposed.relevance.trim().length > 0
          ? proposed.relevance.trim()
          : `Relevant file identified during failure root-cause analysis.`;

      validated.push({
        fileId: matchedFile.id,
        filePath: matchedFile.relativePath,
        symbolId: matchedSymbolId,
        symbolName: matchedSymbolName,
        symbolKind: matchedSymbolKind,
        startLine: matchedStartLine,
        endLine: matchedEndLine,
        relevance: relevanceStr,
      });

      if (validated.length >= ROOT_CAUSE_BOUNDS.MAX_REPOSITORY_REFERENCES) {
        break;
      }
    }

    return {
      validatedReferences: Object.freeze(validated),
      omittedHallucinationsCount: omittedCount,
      rejectionReasons: Object.freeze(rejectionReasons),
    };
  }
}
