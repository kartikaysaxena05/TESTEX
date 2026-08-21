/**
 * @file packages/core/src/requirements/extraction/extractors/text-extractor.ts
 * Deterministic plain-text requirement document extractor.
 */

import crypto from 'node:crypto';
import type {
  SupportedDocumentFormat,
  DocumentBlockDto,
  DocumentBlockType,
  ExtractionWarningDto,
} from '@ai-quality/contracts';
import {
  type RequirementDocumentExtractor,
  type ExtractorInput,
  type ExtractedDocument,
  EXTRACTOR_VERSION,
  EXTRACTION_LIMITS,
} from '../extraction-types.js';
import { DocumentExtractionLimitExceededError } from '../../requirement-errors.js';

export class TextRequirementDocumentExtractor implements RequirementDocumentExtractor {
  readonly format: SupportedDocumentFormat = 'txt';

  async extract(input: ExtractorInput): Promise<ExtractedDocument> {
    const warnings: ExtractionWarningDto[] = [];
    const rawBuffer = input.fileBuffer;

    // Decode text respecting BOM or standard encodings
    let text = '';
    if (
      rawBuffer.length >= 3 &&
      rawBuffer[0] === 0xef &&
      rawBuffer[1] === 0xbb &&
      rawBuffer[2] === 0xbf
    ) {
      // UTF-8 BOM
      text = rawBuffer.subarray(3).toString('utf8');
    } else if (rawBuffer.length >= 2 && rawBuffer[0] === 0xff && rawBuffer[1] === 0xfe) {
      // UTF-16 LE
      text = rawBuffer.subarray(2).toString('utf16le');
    } else if (rawBuffer.length >= 2 && rawBuffer[0] === 0xfe && rawBuffer[1] === 0xff) {
      // UTF-16 BE
      const swapped = Buffer.alloc(rawBuffer.length - 2);
      for (let i = 2; i < rawBuffer.length - 1; i += 2) {
        swapped[i - 2] = rawBuffer[i + 1]!;
        swapped[i - 1] = rawBuffer[i]!;
      }
      text = swapped.toString('utf16le');
    } else {
      // Default UTF-8
      text = rawBuffer.toString('utf8');
    }

    // Normalize CRLF to LF
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    if (normalizedText.length > EXTRACTION_LIMITS.maxCharacters) {
      throw new DocumentExtractionLimitExceededError(
        `Extracted plain text character count (${normalizedText.length}) exceeds safety limit of ${EXTRACTION_LIMITS.maxCharacters}.`,
      );
    }

    if (!normalizedText.trim()) {
      warnings.push({
        code: 'NO_EXTRACTABLE_TEXT',
        message: 'The text document contains no non-whitespace characters.',
      });
      return {
        extractorVersion: EXTRACTOR_VERSION,
        format: this.format,
        plainText: normalizedText,
        characterCount: normalizedText.length,
        lineCount: normalizedText.split('\n').length,
        pageCount: null,
        blockCount: 0,
        headingCount: 0,
        sectionCount: 0,
        tableCount: 0,
        status: 'WARNINGS',
        warnings,
        blocks: [],
        pages: [],
        headings: [],
        sections: [],
        tables: [],
      };
    }

    // Split text into paragraphs / blocks
    const lines = normalizedText.split('\n');
    const blocks: DocumentBlockDto[] = [];
    let currentBlockLines: string[] = [];
    let blockStartLine = 1;
    let currentOffset = 0;
    let blockStartOffset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineNum = i + 1;

      if (line.trim().length === 0) {
        // Empty line ends current paragraph block if active
        if (currentBlockLines.length > 0) {
          const blockText = currentBlockLines.join('\n');
          const isList = this.isListItem(currentBlockLines[0]!);
          const blockType: DocumentBlockType = isList ? 'LIST_ITEM' : 'PARAGRAPH';
          const endOffset = blockStartOffset + blockText.length;

          blocks.push({
            id: crypto.randomUUID(),
            orderIndex: blocks.length + 1,
            type: blockType,
            text: blockText,
            pageNumber: null,
            lineStart: blockStartLine,
            lineEnd: lineNum - 1,
            startOffset: blockStartOffset,
            endOffset,
          });

          currentBlockLines = [];
        }
        currentOffset += line.length + 1; // +1 for \n
      } else {
        if (currentBlockLines.length === 0) {
          blockStartLine = lineNum;
          blockStartOffset = currentOffset;
        }
        currentBlockLines.push(line);
        currentOffset += line.length + 1;
      }
    }

    // Flush any remaining trailing block
    if (currentBlockLines.length > 0) {
      const blockText = currentBlockLines.join('\n');
      const isList = this.isListItem(currentBlockLines[0]!);
      const blockType: DocumentBlockType = isList ? 'LIST_ITEM' : 'PARAGRAPH';
      const endOffset = blockStartOffset + blockText.length;

      blocks.push({
        id: crypto.randomUUID(),
        orderIndex: blocks.length + 1,
        type: blockType,
        text: blockText,
        pageNumber: null,
        lineStart: blockStartLine,
        lineEnd: lines.length,
        startOffset: blockStartOffset,
        endOffset,
      });
    }

    if (blocks.length > EXTRACTION_LIMITS.maxBlocks) {
      throw new DocumentExtractionLimitExceededError(
        `Extracted block count (${blocks.length}) exceeds safety limit of ${EXTRACTION_LIMITS.maxBlocks}.`,
      );
    }

    return {
      extractorVersion: EXTRACTOR_VERSION,
      format: this.format,
      plainText: normalizedText,
      characterCount: normalizedText.length,
      lineCount: lines.length,
      pageCount: null,
      blockCount: blocks.length,
      headingCount: 0,
      sectionCount: 0,
      tableCount: 0,
      status: warnings.length > 0 ? 'WARNINGS' : 'COMPLETED',
      warnings,
      blocks,
      pages: [],
      headings: [],
      sections: [],
      tables: [],
    };
  }

  private isListItem(line: string): boolean {
    const trimmed = line.trimStart();
    return (
      /^[-*•+–]\s+/.test(trimmed) ||
      /^\d+[.)]\s+/.test(trimmed) ||
      /^\([0-9a-zA-Z]+\)\s+/.test(trimmed) ||
      /^\[[0-9a-zA-Z]+\]\s+/.test(trimmed)
    );
  }
}
