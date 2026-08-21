/**
 * @file packages/core/src/requirements/extraction/extractors/docx-extractor.ts
 * Deterministic DOCX requirement document extractor using safe in-memory ZIP and XML parsing.
 */

import crypto from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
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
import { SafeZipReader } from '../zip-reader.js';
import {
  DocumentFormatError,
  DocumentExtractionLimitExceededError,
} from '../../requirement-errors.js';

interface XmlNode {
  [key: string]: unknown;
}

export class DocxRequirementDocumentExtractor implements RequirementDocumentExtractor {
  readonly format: SupportedDocumentFormat = 'docx';

  async extract(input: ExtractorInput): Promise<ExtractedDocument> {
    const warnings: ExtractionWarningDto[] = [];
    const zip = new SafeZipReader(input.fileBuffer);

    const docEntry = zip.getEntry('word/document.xml');
    if (!docEntry) {
      throw new DocumentFormatError('Invalid DOCX document: missing word/document.xml.');
    }

    const docXmlBuffer = docEntry.getData();
    const docXmlString = docXmlBuffer.toString('utf8');

    // Safe XML parser with zero external entity resolution
    const xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      processEntities: false,
      htmlEntities: false,
      textNodeName: '#text',
    });

    let parsedXml: XmlNode;
    try {
      parsedXml = xmlParser.parse(docXmlString) as XmlNode;
    } catch (err: unknown) {
      throw new DocumentFormatError(
        `Failed to parse document XML: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const body = (parsedXml['w:document'] as XmlNode)?.['w:body'] as XmlNode;
    if (!body) {
      warnings.push({
        code: 'NO_EXTRACTABLE_TEXT',
        message: 'The DOCX document body is empty or missing.',
      });
      return {
        extractorVersion: EXTRACTOR_VERSION,
        format: this.format,
        plainText: '',
        characterCount: 0,
        lineCount: 0,
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

    const blocks: DocumentBlockDto[] = [];
    const headings: DocumentHeadingDto[] = [];
    const sections: DocumentSectionDto[] = [];
    const tables: DocumentTableDto[] = [];
    const plainTextChunks: string[] = [];

    const sectionStack: { level: number; sectionId: string }[] = [];
    let currentSectionId: string | null = null;
    let currentOffset = 0;
    let currentLine = 1;

    // Body contains an array or object of children (w:p, w:tbl, etc.)
    const children = this.normalizeBodyChildren(body);

    for (const item of children) {
      if (item.tag === 'w:p') {
        const paragraphNode = item.node as XmlNode;
        const pText = this.extractTextFromParagraph(paragraphNode);
        if (!pText.trim()) {
          continue;
        }

        const headingLevel = this.getHeadingLevel(paragraphNode);
        const isList = this.isListParagraph(paragraphNode);
        const pLines = pText.split('\n');
        const startOffset = currentOffset;
        const endOffset = currentOffset + pText.length;
        const lineStart = currentLine;
        const lineEnd = currentLine + pLines.length - 1;

        if (headingLevel !== null) {
          // It's a heading
          while (
            sectionStack.length > 0 &&
            sectionStack[sectionStack.length - 1]!.level >= headingLevel
          ) {
            sectionStack.pop();
          }
          const parentSectionId =
            sectionStack.length > 0 ? sectionStack[sectionStack.length - 1]!.sectionId : null;

          const sectionId = crypto.randomUUID();
          const headingId = crypto.randomUUID();
          const blockId = crypto.randomUUID();

          sectionStack.push({ level: headingLevel, sectionId });
          currentSectionId = sectionId;

          headings.push({
            id: headingId,
            text: pText,
            level: headingLevel,
            orderIndex: headings.length + 1,
            startOffset,
            endOffset,
            pageNumber: null, // Strictly null for DOCX
            sectionId,
          });

          sections.push({
            id: sectionId,
            title: pText,
            level: headingLevel,
            orderIndex: sections.length + 1,
            parentSectionId,
            headingId,
            blockIds: [blockId],
            lineStart,
            lineEnd,
            pageNumber: null,
          });

          blocks.push({
            id: blockId,
            orderIndex: blocks.length + 1,
            type: 'HEADING',
            text: pText,
            pageNumber: null,
            lineStart,
            lineEnd,
            startOffset,
            endOffset,
            headingLevel,
            sectionId,
          });
        } else {
          // Standard Paragraph or List Item
          const blockId = crypto.randomUUID();
          const blockType = isList ? 'LIST_ITEM' : 'PARAGRAPH';

          blocks.push({
            id: blockId,
            orderIndex: blocks.length + 1,
            type: blockType,
            text: pText,
            pageNumber: null,
            lineStart,
            lineEnd,
            startOffset,
            endOffset,
            sectionId: currentSectionId,
          });

          if (currentSectionId) {
            const sec = sections.find(s => s.id === currentSectionId);
            if (sec) {
              (sec.blockIds as string[]).push(blockId);
            }
          }
        }

        plainTextChunks.push(pText);
        currentOffset += pText.length + 1; // +1 for newline separation
        currentLine += pLines.length;
      } else if (item.tag === 'w:tbl') {
        const tableNode = item.node as XmlNode;
        const parsedTable = this.extractTable(tableNode, tables.length + 1, currentSectionId);
        if (parsedTable && parsedTable.table.rows.length > 0) {
          const tableText = parsedTable.rawText;
          const tableLines = tableText.split('\n');
          const startOffset = currentOffset;
          const endOffset = currentOffset + tableText.length;
          const lineStart = currentLine;
          const lineEnd = currentLine + tableLines.length - 1;
          const blockId = crypto.randomUUID();

          tables.push(parsedTable.table);

          blocks.push({
            id: blockId,
            orderIndex: blocks.length + 1,
            type: 'TABLE',
            text: tableText,
            pageNumber: null,
            lineStart,
            lineEnd,
            startOffset,
            endOffset,
            sectionId: currentSectionId,
            metadata: {
              tableId: parsedTable.table.id,
              rowCount: parsedTable.table.rowCount,
              columnCount: parsedTable.table.columnCount,
            },
          });

          if (currentSectionId) {
            const sec = sections.find(s => s.id === currentSectionId);
            if (sec) {
              (sec.blockIds as string[]).push(blockId);
            }
          }

          plainTextChunks.push(tableText);
          currentOffset += tableText.length + 1;
          currentLine += tableLines.length;
        }
      }
    }

    const plainText = plainTextChunks.join('\n');

    if (plainText.length > EXTRACTION_LIMITS.maxCharacters) {
      throw new DocumentExtractionLimitExceededError(
        `Extracted DOCX character count (${plainText.length}) exceeds safety limit of ${EXTRACTION_LIMITS.maxCharacters}.`,
      );
    }
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

    if (!plainText.trim()) {
      warnings.push({
        code: 'NO_EXTRACTABLE_TEXT',
        message: 'The DOCX document contains no extractable text content.',
      });
    }

    // Update section end lines
    for (let s = 0; s < sections.length; s++) {
      const sec = sections[s]!;
      const nextSec = sections[s + 1];
      const secLineEnd = nextSec ? nextSec.lineStart - 1 : currentLine - 1;
      (sec as { lineEnd: number }).lineEnd = Math.max(sec.lineStart, secLineEnd);
    }

    return {
      extractorVersion: EXTRACTOR_VERSION,
      format: this.format,
      plainText,
      characterCount: plainText.length,
      lineCount: plainText ? plainText.split('\n').length : 0,
      pageCount: null, // Strictly null for DOCX
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

  private normalizeBodyChildren(body: XmlNode): { tag: string; node: unknown }[] {
    const results: { tag: string; node: unknown }[] = [];

    for (const key of Object.keys(body)) {
      if (key === 'w:p') {
        const val = body[key];
        if (Array.isArray(val)) {
          for (const item of val) results.push({ tag: 'w:p', node: item });
        } else if (val && typeof val === 'object') {
          results.push({ tag: 'w:p', node: val });
        }
      } else if (key === 'w:tbl') {
        const val = body[key];
        if (Array.isArray(val)) {
          for (const item of val) results.push({ tag: 'w:tbl', node: item });
        } else if (val && typeof val === 'object') {
          results.push({ tag: 'w:tbl', node: val });
        }
      }
    }

    return results;
  }

  private extractTextFromParagraph(pNode: XmlNode): string {
    const textPieces: string[] = [];

    const recurse = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const obj = node as XmlNode;

      for (const key of Object.keys(obj)) {
        if (key === 'w:t') {
          const tVal = obj[key];
          if (typeof tVal === 'string') {
            textPieces.push(tVal);
          } else if (tVal && typeof tVal === 'object' && '#text' in (tVal as XmlNode)) {
            textPieces.push(String((tVal as XmlNode)['#text']));
          }
        } else if (key === 'w:tab') {
          textPieces.push('\t');
        } else if (key === 'w:br') {
          textPieces.push('\n');
        } else {
          const child = obj[key];
          if (Array.isArray(child)) {
            for (const c of child) recurse(c);
          } else if (typeof child === 'object') {
            recurse(child);
          }
        }
      }
    };

    recurse(pNode);
    return textPieces.join('').trim();
  }

  private getHeadingLevel(pNode: XmlNode): number | null {
    const pPr = pNode['w:pPr'] as XmlNode;
    if (!pPr) return null;

    const pStyle = pPr['w:pStyle'] as XmlNode;
    if (!pStyle) return null;

    const styleVal = String(pStyle['@_w:val'] || '');
    const lower = styleVal.toLowerCase();

    const match = /(?:heading|h)\s*([1-6])/i.exec(lower);
    if (match) {
      return parseInt(match[1]!, 10);
    }
    if (/^[1-6]$/.test(styleVal)) {
      return parseInt(styleVal, 10);
    }

    return null;
  }

  private isListParagraph(pNode: XmlNode): boolean {
    const pPr = pNode['w:pPr'] as XmlNode;
    if (!pPr) return false;
    return 'w:numPr' in pPr;
  }

  private extractTable(
    tblNode: XmlNode,
    orderIndex: number,
    sectionId: string | null,
  ): { table: DocumentTableDto; rawText: string } | null {
    const rows: DocumentTableRowDto[] = [];
    const textLines: string[] = [];

    const trNodes = Array.isArray(tblNode['w:tr'])
      ? (tblNode['w:tr'] as XmlNode[])
      : tblNode['w:tr'] && typeof tblNode['w:tr'] === 'object'
        ? [tblNode['w:tr'] as XmlNode]
        : [];

    let rowIdx = 0;
    for (const tr of trNodes) {
      const tcNodes = Array.isArray(tr['w:tc'])
        ? (tr['w:tc'] as XmlNode[])
        : tr['w:tc'] && typeof tr['w:tc'] === 'object'
          ? [tr['w:tc'] as XmlNode]
          : [];

      const cells: DocumentTableCellDto[] = [];
      const cellTexts: string[] = [];

      let colIdx = 0;
      for (const tc of tcNodes) {
        // Collect text from paragraphs inside cell
        const pNodes = Array.isArray(tc['w:p'])
          ? (tc['w:p'] as XmlNode[])
          : tc['w:p'] && typeof tc['w:p'] === 'object'
            ? [tc['w:p'] as XmlNode]
            : [];

        const cellPTexts = pNodes.map(p => this.extractTextFromParagraph(p)).filter(Boolean);
        const cellText = cellPTexts.join(' ').trim();

        cells.push({
          rowIndex: rowIdx,
          columnIndex: colIdx,
          text: cellText,
          isHeader: rowIdx === 0,
        });
        cellTexts.push(cellText);
        colIdx++;
      }

      rows.push({
        rowIndex: rowIdx,
        cells,
      });

      textLines.push(`| ${cellTexts.join(' | ')} |`);
      rowIdx++;
    }

    if (rows.length === 0) return null;

    const colCount = rows.length > 0 ? rows[0]!.cells.length : 0;
    const tableId = crypto.randomUUID();

    return {
      table: {
        id: tableId,
        orderIndex,
        pageNumber: null,
        sectionId,
        rowCount: rows.length,
        columnCount: colCount,
        rows,
      },
      rawText: textLines.join('\n'),
    };
  }
}
