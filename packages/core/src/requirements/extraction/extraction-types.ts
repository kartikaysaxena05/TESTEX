/**
 * @file packages/core/src/requirements/extraction/extraction-types.ts
 * Core domain types and limits for the Requirement Document Extraction engine.
 */

import type {
  SupportedDocumentFormat,
  ExtractionStatus,
  DocumentBlockDto,
  DocumentPageDto,
  DocumentHeadingDto,
  DocumentSectionDto,
  DocumentTableDto,
  ExtractionWarningDto,
} from '@ai-quality/contracts';

export const EXTRACTOR_VERSION = 'document-extractor-v1';

export const EXTRACTION_LIMITS = {
  maxCharacters: 10_000_000,
  maxBlocks: 50_000,
  maxHeadings: 5_000,
  maxSections: 5_000,
  maxTables: 1_000,
  maxTableRows: 10_000,
  maxTableCells: 100_000,
  maxDocxDecompressedBytes: 50 * 1024 * 1024,
  maxDocxZipEntries: 1_000,
} as const;

export interface ExtractorInput {
  readonly filePath: string;
  readonly fileBuffer: Buffer;
  readonly fileName: string;
  readonly mimeType: string;
  readonly documentId: string;
  readonly projectId: string;
}

export interface ExtractedDocument {
  readonly extractorVersion: string;
  readonly format: SupportedDocumentFormat;
  readonly plainText: string;
  readonly characterCount: number;
  readonly lineCount: number;
  readonly pageCount: number | null;
  readonly blockCount: number;
  readonly headingCount: number;
  readonly sectionCount: number;
  readonly tableCount: number;
  readonly status: ExtractionStatus;
  readonly warnings: readonly ExtractionWarningDto[];
  readonly blocks: readonly DocumentBlockDto[];
  readonly pages: readonly DocumentPageDto[];
  readonly headings: readonly DocumentHeadingDto[];
  readonly sections: readonly DocumentSectionDto[];
  readonly tables: readonly DocumentTableDto[];
}

export interface RequirementDocumentExtractor {
  readonly format: SupportedDocumentFormat;
  extract(input: ExtractorInput): Promise<ExtractedDocument>;
}
