/**
 * @file packages/core/src/sources/indexing/source-parser-types.ts
 * Type definitions and interfaces for deterministic source parsers.
 */

import type { SymbolKind, ImportKind } from '@ai-quality/contracts';

export interface ExtractedSymbol {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly startLine: number;
  readonly endLine: number;
  readonly isExported: boolean;
}

export interface ExtractedImport {
  readonly specifier: string;
  readonly importKind: ImportKind;
  readonly lineNumber: number;
  readonly isExternal: boolean;
}

export interface ExtractedExport {
  readonly name: string;
  readonly lineNumber: number;
}

export interface SourceParseInput {
  readonly relativePath: string;
  readonly content: string;
  readonly language: string | null;
}

export interface SourceParseResult {
  readonly symbols: readonly ExtractedSymbol[];
  readonly imports: readonly ExtractedImport[];
  readonly exports: readonly ExtractedExport[];
  readonly isSupported: boolean;
  readonly warnings: readonly string[];
}

export interface SourceParser {
  supports(language: string | null, extension: string): boolean;
  parse(input: SourceParseInput): SourceParseResult;
}
