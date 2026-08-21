/**
 * @file packages/core/src/requirements/extraction/extractors/pdf-extractor.ts
 * Deterministic, offline PDF requirement document extractor preserving physical page provenance.
 */

import crypto from 'node:crypto';
import zlib from 'node:zlib';
import type {
  SupportedDocumentFormat,
  DocumentBlockDto,
  DocumentPageDto,
  DocumentHeadingDto,
  DocumentSectionDto,
  ExtractionWarningDto,
} from '@ai-quality/contracts';
import {
  type RequirementDocumentExtractor,
  type ExtractorInput,
  type ExtractedDocument,
  EXTRACTOR_VERSION,
  EXTRACTION_LIMITS,
} from '../extraction-types.js';
import {
  DocumentEncryptedError,
  DocumentFormatError,
  DocumentExtractionLimitExceededError,
} from '../../requirement-errors.js';

interface RawPdfPage {
  pageNumber: number;
  contentBuffers: Buffer[];
}

export class PdfRequirementDocumentExtractor implements RequirementDocumentExtractor {
  readonly format: SupportedDocumentFormat = 'pdf';

  async extract(input: ExtractorInput): Promise<ExtractedDocument> {
    const warnings: ExtractionWarningDto[] = [];
    const buffer = input.fileBuffer;

    if (buffer.length < 8) {
      throw new DocumentFormatError('Invalid PDF file: file is too small.');
    }

    // Header check
    const headerStr = buffer.subarray(0, 1024).toString('binary');
    if (!headerStr.includes('%PDF-')) {
      throw new DocumentFormatError('Invalid PDF header signature.');
    }

    // Encryption check (/Encrypt dictionary)
    const fileStr = buffer.toString('binary');
    if (fileStr.includes('/Encrypt')) {
      // Check if it is a real dictionary reference in trailer or root
      const trailerIdx = fileStr.lastIndexOf('trailer');
      if (trailerIdx !== -1 && fileStr.indexOf('/Encrypt', trailerIdx) !== -1) {
        throw new DocumentEncryptedError('The PDF document is password-protected or encrypted.');
      } else if (fileStr.includes('/Encrypt ')) {
        throw new DocumentEncryptedError('The PDF document is password-protected or encrypted.');
      }
    }

    // Parse PDF pages and content streams
    const pages = this.parsePdfPages(buffer);

    const docPages: DocumentPageDto[] = [];
    const blocks: DocumentBlockDto[] = [];
    const headings: DocumentHeadingDto[] = [];
    const sections: DocumentSectionDto[] = [];
    const fullTextChunks: string[] = [];

    const sectionStack: { level: number; sectionId: string }[] = [];
    let currentSectionId: string | null = null;
    let currentOffset = 0;
    let currentLine = 1;

    for (const rawPage of pages) {
      const pageTextPieces: string[] = [];

      for (const contentBuf of rawPage.contentBuffers) {
        const textFromStream = this.extractTextFromContentStream(contentBuf);
        if (textFromStream.trim()) {
          pageTextPieces.push(textFromStream);
        }
      }

      const pageText = pageTextPieces.join('\n').trim();
      const pageLines = pageText ? pageText.split('\n') : [];
      let pageBlockCount = 0;

      if (pageText) {
        // Split into paragraphs for this page
        const paragraphs = pageText.split(/\n{2,}/);

        for (const p of paragraphs) {
          const trimmedP = p.trim();
          if (!trimmedP) continue;

          const pLineCount = trimmedP.split('\n').length;
          const startOffset = currentOffset;
          const endOffset = currentOffset + trimmedP.length;
          const lineStart = currentLine;
          const lineEnd = currentLine + pLineCount - 1;

          // Check if this paragraph is a Heading
          const headingMatch = this.matchHeading(trimmedP);
          if (headingMatch) {
            const { level, text: headingText } = headingMatch;

            while (
              sectionStack.length > 0 &&
              sectionStack[sectionStack.length - 1]!.level >= level
            ) {
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
              startOffset,
              endOffset,
              pageNumber: rawPage.pageNumber, // Physical 1-based page number
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
              lineStart,
              lineEnd,
              pageNumber: rawPage.pageNumber,
            });

            blocks.push({
              id: blockId,
              orderIndex: blocks.length + 1,
              type: 'HEADING',
              text: trimmedP,
              pageNumber: rawPage.pageNumber,
              lineStart,
              lineEnd,
              startOffset,
              endOffset,
              headingLevel: level,
              sectionId,
            });
          } else {
            const isList = this.isListItem(trimmedP);
            const blockId = crypto.randomUUID();

            blocks.push({
              id: blockId,
              orderIndex: blocks.length + 1,
              type: isList ? 'LIST_ITEM' : 'PARAGRAPH',
              text: trimmedP,
              pageNumber: rawPage.pageNumber, // Physical page number
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

          pageBlockCount++;
          fullTextChunks.push(trimmedP);
          currentOffset += trimmedP.length + 1;
          currentLine += pLineCount;
        }
      }

      docPages.push({
        pageNumber: rawPage.pageNumber,
        text: pageText,
        characterCount: pageText.length,
        lineCount: pageLines.length,
        blockCount: pageBlockCount,
      });
    }

    const plainText = fullTextChunks.join('\n');

    if (plainText.length > EXTRACTION_LIMITS.maxCharacters) {
      throw new DocumentExtractionLimitExceededError(
        `Extracted PDF character count (${plainText.length}) exceeds safety limit of ${EXTRACTION_LIMITS.maxCharacters}.`,
      );
    }
    if (blocks.length > EXTRACTION_LIMITS.maxBlocks) {
      throw new DocumentExtractionLimitExceededError(
        `Extracted block count (${blocks.length}) exceeds safety limit of ${EXTRACTION_LIMITS.maxBlocks}.`,
      );
    }

    // Scanned / empty PDF warning
    if (!plainText.trim()) {
      warnings.push({
        code: 'NO_EXTRACTABLE_TEXT',
        message:
          'No extractable text was found in this PDF. It may be a scanned image or contain non-standard glyphs without text mappings.',
      });
    }

    // Update section line bounds
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
      pageCount: docPages.length,
      blockCount: blocks.length,
      headingCount: headings.length,
      sectionCount: sections.length,
      tableCount: 0,
      status: warnings.length > 0 ? 'WARNINGS' : 'COMPLETED',
      warnings,
      blocks,
      pages: docPages,
      headings,
      sections,
      tables: [],
    };
  }

  private parsePdfPages(buffer: Buffer): RawPdfPage[] {
    const rawPages: RawPdfPage[] = [];
    const binary = buffer.toString('binary');

    // Find all obj ... endobj definitions
    const objRegex = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
    const objects = new Map<number, { gen: number; content: string; fullOffset: number }>();
    let match: RegExpExecArray | null;

    while ((match = objRegex.exec(binary)) !== null) {
      const objNum = parseInt(match[1]!, 10);
      const genNum = parseInt(match[2]!, 10);
      objects.set(objNum, {
        gen: genNum,
        content: match[3]!,
        fullOffset: match.index,
      });
    }

    // Locate Page objects (/Type /Page)
    const pageObjects: { objNum: number; content: string }[] = [];
    for (const [objNum, obj] of objects.entries()) {
      if (/\/Type\s*\/Page\b/.test(obj.content) && !/\/Type\s*\/Pages\b/.test(obj.content)) {
        pageObjects.push({ objNum, content: obj.content });
      }
    }

    if (pageObjects.length === 0) {
      // Fallback: search for all stream ... endstream blocks if /Page objects aren't standard
      const streamBuffers = this.extractAllStreams(buffer);
      if (streamBuffers.length > 0) {
        rawPages.push({
          pageNumber: 1,
          contentBuffers: streamBuffers,
        });
      }
      return rawPages;
    }

    let pageNum = 1;
    for (const pageObj of pageObjects) {
      const contentBuffers: Buffer[] = [];
      const contentsMatch = /\/Contents\s+(?:(\d+)\s+(\d+)\s+R|\[([^\]]+)\])/.exec(pageObj.content);

      if (contentsMatch) {
        if (contentsMatch[1]) {
          // Single stream reference
          const streamObjNum = parseInt(contentsMatch[1], 10);
          const streamObj = objects.get(streamObjNum);
          if (streamObj) {
            const decompressed = this.decompressStreamObject(buffer, streamObj.content);
            if (decompressed) contentBuffers.push(decompressed);
          }
        } else if (contentsMatch[3]) {
          // Array of stream references: [ 1 0 R  2 0 R ]
          const refs = contentsMatch[3].match(/(\d+)\s+(\d+)\s+R/g) || [];
          for (const ref of refs) {
            const num = parseInt(ref.split(/\s+/)[0]!, 10);
            const streamObj = objects.get(num);
            if (streamObj) {
              const decompressed = this.decompressStreamObject(buffer, streamObj.content);
              if (decompressed) contentBuffers.push(decompressed);
            }
          }
        }
      } else {
        // Direct stream inside page object
        const directDecompressed = this.decompressStreamObject(buffer, pageObj.content);
        if (directDecompressed) contentBuffers.push(directDecompressed);
      }

      rawPages.push({
        pageNumber: pageNum++,
        contentBuffers,
      });
    }

    return rawPages;
  }

  private extractAllStreams(buffer: Buffer): Buffer[] {
    const results: Buffer[] = [];
    const binary = buffer.toString('binary');
    const streamRegex = /stream\r?\n([\s\S]*?)endstream/g;
    let match: RegExpExecArray | null;

    while ((match = streamRegex.exec(binary)) !== null) {
      const streamStart = match.index + match[0].indexOf('\n') + 1;
      const streamEnd = match.index + match[0].lastIndexOf('endstream');
      const rawStream = buffer.subarray(streamStart, streamEnd);

      try {
        const decompressed = zlib.inflateSync(rawStream);
        results.push(decompressed);
      } catch {
        try {
          const rawDecompressed = zlib.inflateRawSync(rawStream);
          results.push(rawDecompressed);
        } catch {
          results.push(rawStream);
        }
      }
    }

    return results;
  }

  private decompressStreamObject(_buffer: Buffer, objContent: string): Buffer | null {
    const streamStartTag = 'stream';
    const streamEndTag = 'endstream';

    const startIdx = objContent.indexOf(streamStartTag);
    const endIdx = objContent.lastIndexOf(streamEndTag);

    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
      return null;
    }

    // Skip newline after stream keyword
    let contentStart = startIdx + streamStartTag.length;
    if (objContent[contentStart] === '\r') contentStart++;
    if (objContent[contentStart] === '\n') contentStart++;

    let contentEnd = endIdx;
    if (contentEnd > contentStart && objContent[contentEnd - 1] === '\n') contentEnd--;
    if (contentEnd > contentStart && objContent[contentEnd - 1] === '\r') contentEnd--;

    const rawStreamSlice = Buffer.from(objContent.substring(contentStart, contentEnd), 'binary');

    const isFlate = /\/Filter\s*\/FlateDecode\b/.test(objContent);
    if (isFlate) {
      try {
        return zlib.inflateSync(rawStreamSlice);
      } catch {
        try {
          return zlib.inflateRawSync(rawStreamSlice);
        } catch {
          return rawStreamSlice;
        }
      }
    }

    return rawStreamSlice;
  }

  private extractTextFromContentStream(streamBuf: Buffer): string {
    const streamText = streamBuf.toString('binary');
    const textPieces: string[] = [];

    // Match text blocks (BT ... ET)
    const btRegex = /BT([\s\S]*?)ET/g;
    let btMatch: RegExpExecArray | null;

    while ((btMatch = btRegex.exec(streamText)) !== null) {
      const blockContent = btMatch[1]!;
      const btPieces: string[] = [];

      // Extract Tj strings: (Hello World) Tj
      const tjRegex = /\((.*?)\)\s*Tj/g;
      let tjMatch: RegExpExecArray | null;
      while ((tjMatch = tjRegex.exec(blockContent)) !== null) {
        btPieces.push(this.decodePdfString(tjMatch[1]!));
      }

      // Extract TJ arrays: [(Hello) 10 (World)] TJ
      const arrayTjRegex = /\[(.*?)\]\s*TJ/g;
      let arrayMatch: RegExpExecArray | null;
      while ((arrayMatch = arrayTjRegex.exec(blockContent)) !== null) {
        const arrayBody = arrayMatch[1]!;
        const innerStrings = arrayBody.match(/\((.*?)\)/g) || [];
        const combined = innerStrings
          .map(s => this.decodePdfString(s.replace(/^\(/, '').replace(/\)$/, '')))
          .join('');
        if (combined.trim()) {
          btPieces.push(combined);
        }
      }

      // Extract ' and " operators: (text)' or (text)"
      const quoteRegex = /\((.*?)\)\s*['"]/g;
      let quoteMatch: RegExpExecArray | null;
      while ((quoteMatch = quoteRegex.exec(blockContent)) !== null) {
        btPieces.push(this.decodePdfString(quoteMatch[1]!));
      }

      const joinedBt = btPieces
        .join(' ')
        .replace(/[^\S\r\n]+/g, ' ')
        .trim();
      if (joinedBt) {
        textPieces.push(joinedBt);
      }
    }

    return textPieces.join('\n\n').trim();
  }

  private decodePdfString(raw: string): string {
    return raw
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\')
      .replace(/\\([0-7]{1,3})/g, (_m, oct) => String.fromCharCode(parseInt(oct, 8)));
  }

  private matchHeading(text: string): { level: number; text: string } | null {
    const singleLine = text.trim();
    if (singleLine.length > 120 || singleLine.includes('\n')) return null;

    // Numbered section e.g. "1. Introduction", "3.2 Authentication", "4.1.2 Session Management"
    const numMatch = /^(\d+(?:\.\d+)*)\.?\s+([A-Z].*)$/.exec(singleLine);
    if (numMatch) {
      const parts = numMatch[1]!.split('.');
      const level = Math.min(6, parts.length);
      return { level, text: singleLine };
    }

    // Markdown-style heading inside PDF stream if any
    const mdMatch = /^(#{1,6})\s+(.+)$/.exec(singleLine);
    if (mdMatch) {
      return { level: mdMatch[1]!.length, text: mdMatch[2]!.trim() };
    }

    return null;
  }

  private isListItem(text: string): boolean {
    const trimmed = text.trimStart();
    return (
      /^[-*•+–]\s+/.test(trimmed) ||
      /^\d+[.)]\s+/.test(trimmed) ||
      /^\([0-9a-zA-Z]+\)\s+/.test(trimmed) ||
      /^\[[0-9a-zA-Z]+\]\s+/.test(trimmed)
    );
  }
}
