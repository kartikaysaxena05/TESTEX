/**
 * @file packages/core/src/requirements/extraction/extractor-registry.ts
 * Registry for format-specific requirement document extractors.
 */

import type { SupportedDocumentFormat } from '@ai-quality/contracts';
import type { RequirementDocumentExtractor } from './extraction-types.js';
import { TextRequirementDocumentExtractor } from './extractors/text-extractor.js';
import { MarkdownRequirementDocumentExtractor } from './extractors/markdown-extractor.js';
import { DocxRequirementDocumentExtractor } from './extractors/docx-extractor.js';
import { PdfRequirementDocumentExtractor } from './extractors/pdf-extractor.js';
import { DocumentFormatError } from '../requirement-errors.js';

export class ExtractorRegistry {
  private readonly extractors: Map<SupportedDocumentFormat, RequirementDocumentExtractor> =
    new Map();

  constructor() {
    this.register(new TextRequirementDocumentExtractor());
    this.register(new MarkdownRequirementDocumentExtractor());
    this.register(new DocxRequirementDocumentExtractor());
    this.register(new PdfRequirementDocumentExtractor());
  }

  register(extractor: RequirementDocumentExtractor): void {
    this.extractors.set(extractor.format, extractor);
  }

  getExtractor(format: string): RequirementDocumentExtractor {
    const normalized = format.toLowerCase().replace(/^\./, '') as SupportedDocumentFormat;
    const extractor = this.extractors.get(normalized);
    if (!extractor) {
      throw new DocumentFormatError(`No extractor registered for document format '${format}'.`);
    }
    return extractor;
  }
}
