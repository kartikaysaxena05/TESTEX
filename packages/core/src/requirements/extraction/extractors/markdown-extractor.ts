/**
 * @file packages/core/src/requirements/extraction/extractors/markdown-extractor.ts
 * Deterministic Markdown requirement document extractor.
 */

import crypto from 'node:crypto';
import type {
  SupportedDocumentFormat,
  DocumentBlockDto,
  DocumentHeadingDto,
  DocumentSectionDto,
  DocumentTableDto,
  DocumentTableRowDto,
  DocumentTableCellDto,
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

export class MarkdownRequirementDocumentExtractor implements RequirementDocumentExtractor {
  readonly format: SupportedDocumentFormat = 'md';

  async extract(input: ExtractorInput): Promise<ExtractedDocument> {
    const warnings: ExtractionWarningDto[] = [];
    const rawText = input.fileBuffer.toString('utf8');
    const normalizedText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    if (normalizedText.length > EXTRACTION_LIMITS.maxCharacters) {
      throw new DocumentExtractionLimitExceededError(
        `Extracted markdown character count (${normalizedText.length}) exceeds safety limit of ${EXTRACTION_LIMITS.maxCharacters}.`,
      );
    }

    if (!normalizedText.trim()) {
      warnings.push({
        code: 'NO_EXTRACTABLE_TEXT',
        message: 'The markdown document contains no non-whitespace characters.',
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

    const lines = normalizedText.split('\n');
    const blocks: DocumentBlockDto[] = [];
    const headings: DocumentHeadingDto[] = [];
    const sections: DocumentSectionDto[] = [];
    const tables: DocumentTableDto[] = [];

    // State for section hierarchy tracking
    // Stack of active sections: { level, sectionId }
    const sectionStack: { level: number; sectionId: string }[] = [];
    let currentSectionId: string | null = null;

    let inCodeBlock = false;
    let codeBlockLines: string[] = [];
    let codeBlockStartLine = 1;
    let codeBlockStartOffset = 0;

    let inTable = false;
    let tableLines: string[] = [];
    let tableStartLine = 1;
    let tableStartOffset = 0;

    let paragraphLines: string[] = [];
    let paragraphStartLine = 1;
    let paragraphStartOffset = 0;

    let currentOffset = 0;

    const flushParagraph = (endLineNum: number) => {
      if (paragraphLines.length === 0) return;
      const text = paragraphLines.join('\n');
      const isList = this.isListItem(paragraphLines[0]!);
      const blockType = isList ? 'LIST_ITEM' : 'PARAGRAPH';
      const endOffset = paragraphStartOffset + text.length;

      const blockId = crypto.randomUUID();
      blocks.push({
        id: blockId,
        orderIndex: blocks.length + 1,
        type: blockType,
        text,
        pageNumber: null,
        lineStart: paragraphStartLine,
        lineEnd: endLineNum,
        startOffset: paragraphStartOffset,
        endOffset,
        sectionId: currentSectionId,
      });

      // Associate with current section if active
      if (currentSectionId) {
        const sec = sections.find(s => s.id === currentSectionId);
        if (sec) {
          (sec.blockIds as string[]).push(blockId);
        }
      }

      paragraphLines = [];
    };

    const flushTable = (endLineNum: number) => {
      if (tableLines.length === 0) return;
      const rawTableText = tableLines.join('\n');
      const endOffset = tableStartOffset + rawTableText.length;

      // Parse markdown table rows
      const rows: DocumentTableRowDto[] = [];
      let parsedRowIdx = 0;

      for (let i = 0; i < tableLines.length; i++) {
        const rowLine = tableLines[i]!.trim();
        // Skip separator rows like |---|---|
        if (/^\|?(\s*:?-+:?\s*\|)+\s*$/.test(rowLine)) {
          continue;
        }

        const rawCells = rowLine.replace(/^\|/, '').replace(/\|$/, '').split('|');

        const cells: DocumentTableCellDto[] = rawCells.map((c, colIdx) => ({
          rowIndex: parsedRowIdx,
          columnIndex: colIdx,
          text: c.trim(),
          isHeader: parsedRowIdx === 0,
        }));

        rows.push({
          rowIndex: parsedRowIdx,
          cells,
        });
        parsedRowIdx++;
      }

      const tableId = crypto.randomUUID();
      const colCount = rows.length > 0 ? rows[0]!.cells.length : 0;

      const docTable: DocumentTableDto = {
        id: tableId,
        orderIndex: tables.length + 1,
        pageNumber: null,
        sectionId: currentSectionId,
        rowCount: rows.length,
        columnCount: colCount,
        rows,
      };

      tables.push(docTable);

      const blockId = crypto.randomUUID();
      blocks.push({
        id: blockId,
        orderIndex: blocks.length + 1,
        type: 'TABLE',
        text: rawTableText,
        pageNumber: null,
        lineStart: tableStartLine,
        lineEnd: endLineNum,
        startOffset: tableStartOffset,
        endOffset,
        sectionId: currentSectionId,
        metadata: {
          tableId,
          rowCount: rows.length,
          columnCount: colCount,
        },
      });

      if (currentSectionId) {
        const sec = sections.find(s => s.id === currentSectionId);
        if (sec) {
          (sec.blockIds as string[]).push(blockId);
        }
      }

      tableLines = [];
      inTable = false;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineNum = i + 1;
      const trimmed = line.trim();

      // Check code block fence
      if (/^```/.test(trimmed)) {
        if (inCodeBlock) {
          // Closing fence
          codeBlockLines.push(line);
          const fullCodeText = codeBlockLines.join('\n');
          const endOffset = codeBlockStartOffset + fullCodeText.length;
          const blockId = crypto.randomUUID();

          blocks.push({
            id: blockId,
            orderIndex: blocks.length + 1,
            type: 'CODE_BLOCK',
            text: fullCodeText,
            pageNumber: null,
            lineStart: codeBlockStartLine,
            lineEnd: lineNum,
            startOffset: codeBlockStartOffset,
            endOffset,
            sectionId: currentSectionId,
          });

          if (currentSectionId) {
            const sec = sections.find(s => s.id === currentSectionId);
            if (sec) {
              (sec.blockIds as string[]).push(blockId);
            }
          }

          codeBlockLines = [];
          inCodeBlock = false;
          currentOffset += line.length + 1;
          continue;
        } else {
          // Opening fence
          flushParagraph(lineNum - 1);
          if (inTable) flushTable(lineNum - 1);
          inCodeBlock = true;
          codeBlockLines = [line];
          codeBlockStartLine = lineNum;
          codeBlockStartOffset = currentOffset;
          currentOffset += line.length + 1;
          continue;
        }
      }

      if (inCodeBlock) {
        codeBlockLines.push(line);
        currentOffset += line.length + 1;
        continue;
      }

      // Check for Table row
      if (this.isTableRow(trimmed)) {
        flushParagraph(lineNum - 1);
        if (!inTable) {
          inTable = true;
          tableLines = [];
          tableStartLine = lineNum;
          tableStartOffset = currentOffset;
        }
        tableLines.push(line);
        currentOffset += line.length + 1;
        continue;
      } else if (inTable) {
        flushTable(lineNum - 1);
      }

      // Check for Heading (#, ##, ###)
      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
      if (headingMatch) {
        flushParagraph(lineNum - 1);

        const hashes = headingMatch[1]!;
        const headingText = headingMatch[2]!.trim();
        const level = hashes.length;
        const headingStartOffset = currentOffset + line.indexOf('#');
        const headingEndOffset = headingStartOffset + line.trim().length;

        // Determine parent section
        while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1]!.level >= level) {
          sectionStack.pop();
        }
        const parentSectionId =
          sectionStack.length > 0 ? sectionStack[sectionStack.length - 1]!.sectionId : null;

        const sectionId = crypto.randomUUID();
        const headingId = crypto.randomUUID();
        const blockId = crypto.randomUUID();

        sectionStack.push({ level, sectionId });
        currentSectionId = sectionId;

        headings.push({
          id: headingId,
          text: headingText,
          level,
          orderIndex: headings.length + 1,
          startOffset: headingStartOffset,
          endOffset: headingEndOffset,
          pageNumber: null,
          sectionId,
        });

        sections.push({
          id: sectionId,
          title: headingText,
          level,
          orderIndex: sections.length + 1,
          parentSectionId,
          headingId,
          blockIds: [blockId],
          lineStart: lineNum,
          lineEnd: lineNum,
          pageNumber: null,
        });

        blocks.push({
          id: blockId,
          orderIndex: blocks.length + 1,
          type: 'HEADING',
          text: headingText,
          pageNumber: null,
          lineStart: lineNum,
          lineEnd: lineNum,
          startOffset: headingStartOffset,
          endOffset: headingEndOffset,
          headingLevel: level,
          sectionId,
        });

        currentOffset += line.length + 1;
        continue;
      }

      // Standard text / empty line / list
      if (trimmed.length === 0) {
        flushParagraph(lineNum - 1);
      } else {
        if (paragraphLines.length === 0) {
          paragraphStartLine = lineNum;
          paragraphStartOffset = currentOffset;
        }
        paragraphLines.push(line);
      }

      currentOffset += line.length + 1;
    }

    // Flush any remaining content
    if (inCodeBlock && codeBlockLines.length > 0) {
      const fullCodeText = codeBlockLines.join('\n');
      const endOffset = codeBlockStartOffset + fullCodeText.length;
      blocks.push({
        id: crypto.randomUUID(),
        orderIndex: blocks.length + 1,
        type: 'CODE_BLOCK',
        text: fullCodeText,
        pageNumber: null,
        lineStart: codeBlockStartLine,
        lineEnd: lines.length,
        startOffset: codeBlockStartOffset,
        endOffset,
        sectionId: currentSectionId,
      });
    } else if (inTable && tableLines.length > 0) {
      flushTable(lines.length);
    } else if (paragraphLines.length > 0) {
      flushParagraph(lines.length);
    }

    // Update section end lines
    for (let s = 0; s < sections.length; s++) {
      const sec = sections[s]!;
      const nextSec = sections[s + 1];
      const secLineEnd = nextSec ? nextSec.lineStart - 1 : lines.length;
      (sec as { lineEnd: number }).lineEnd = Math.max(sec.lineStart, secLineEnd);
    }

    // Check extraction limits
    if (blocks.length > EXTRACTION_LIMITS.maxBlocks) {
      throw new DocumentExtractionLimitExceededError(
        `Extracted block count (${blocks.length}) exceeds safety limit of ${EXTRACTION_LIMITS.maxBlocks}.`,
      );
    }
    if (headings.length > EXTRACTION_LIMITS.maxHeadings) {
      throw new DocumentExtractionLimitExceededError(
        `Extracted heading count (${headings.length}) exceeds safety limit of ${EXTRACTION_LIMITS.maxHeadings}.`,
      );
    }
    if (sections.length > EXTRACTION_LIMITS.maxSections) {
      throw new DocumentExtractionLimitExceededError(
        `Extracted section count (${sections.length}) exceeds safety limit of ${EXTRACTION_LIMITS.maxSections}.`,
      );
    }
    if (tables.length > EXTRACTION_LIMITS.maxTables) {
      throw new DocumentExtractionLimitExceededError(
        `Extracted table count (${tables.length}) exceeds safety limit of ${EXTRACTION_LIMITS.maxTables}.`,
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
      headingCount: headings.length,
      sectionCount: sections.length,
      tableCount: tables.length,
      status: warnings.length > 0 ? 'WARNINGS' : 'COMPLETED',
      warnings,
      blocks,
      pages: [],
      headings,
      sections,
      tables,
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

  private isTableRow(trimmed: string): boolean {
    return (
      (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 1) ||
      (trimmed.includes('|') && /^\|?.*\|.*\|?$/.test(trimmed))
    );
  }
}
