/**
 * @file packages/core/src/requirements/extraction/document-extractors.test.ts
 * Unit tests for format-specific extractors (TXT, Markdown, DOCX, PDF) and security invariants.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { TextRequirementDocumentExtractor } from './extractors/text-extractor.js';
import { MarkdownRequirementDocumentExtractor } from './extractors/markdown-extractor.js';
import { DocxRequirementDocumentExtractor } from './extractors/docx-extractor.js';
import { PdfRequirementDocumentExtractor } from './extractors/pdf-extractor.js';
import { ExtractorRegistry } from './extractor-registry.js';
import { DocumentEncryptedError, DocumentFormatError } from '../requirement-errors.js';

describe('Document Extractors Unit Tests', () => {
  // --------------------------------------------------------------------------
  // 1. Text Extractor Tests
  // --------------------------------------------------------------------------
  describe('TextRequirementDocumentExtractor', () => {
    const textExtractor = new TextRequirementDocumentExtractor();

    it('should extract UTF-8 plain text with paragraphs, lists, line bounds, and offsets', async () => {
      const content =
        'First paragraph with some text.\n\n- Bullet item 1\n- Bullet item 2\n\nThird paragraph.';
      const buf = Buffer.from(content, 'utf8');

      const result = await textExtractor.extract({
        filePath: '/tmp/test.txt',
        fileBuffer: buf,
        fileName: 'test.txt',
        mimeType: 'text/plain',
        documentId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
      });

      assert.equal(result.format, 'txt');
      assert.equal(result.extractorVersion, 'document-extractor-v1');
      assert.equal(result.plainText, content);
      assert.equal(result.characterCount, content.length);
      assert.equal(result.pageCount, null);
      assert.equal(result.blockCount, 3);
      assert.equal(result.blocks[0]!.type, 'PARAGRAPH');
      assert.equal(result.blocks[0]!.text, 'First paragraph with some text.');
      assert.equal(result.blocks[0]!.lineStart, 1);
      assert.equal(result.blocks[0]!.lineEnd, 1);
      assert.equal(result.blocks[1]!.type, 'LIST_ITEM');
      assert.equal(result.blocks[1]!.text, '- Bullet item 1\n- Bullet item 2');
      assert.equal(result.blocks[2]!.type, 'PARAGRAPH');
      assert.equal(result.blocks[2]!.text, 'Third paragraph.');
      assert.equal(result.status, 'COMPLETED');
      assert.equal(result.warnings.length, 0);
    });

    it('should handle UTF-8 with BOM and UTF-16LE encodings safely', async () => {
      const content = 'Header line\n\nBody content with Unicode ₹500 and €100.';
      const bomBuffer = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from(content, 'utf8'),
      ]);

      const resultBom = await textExtractor.extract({
        filePath: '/tmp/bom.txt',
        fileBuffer: bomBuffer,
        fileName: 'bom.txt',
        mimeType: 'text/plain',
        documentId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
      });

      assert.equal(resultBom.plainText, content);

      // UTF-16LE
      const utf16Buffer = Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from(content, 'utf16le'),
      ]);
      const resultUtf16 = await textExtractor.extract({
        filePath: '/tmp/utf16.txt',
        fileBuffer: utf16Buffer,
        fileName: 'utf16.txt',
        mimeType: 'text/plain',
        documentId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
      });

      assert.equal(resultUtf16.plainText, content);
    });

    it('should return NO_EXTRACTABLE_TEXT warning for empty text', async () => {
      const result = await textExtractor.extract({
        filePath: '/tmp/empty.txt',
        fileBuffer: Buffer.from('   \n\n\t  ', 'utf8'),
        fileName: 'empty.txt',
        mimeType: 'text/plain',
        documentId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
      });

      assert.equal(result.status, 'WARNINGS');
      assert.equal(result.warnings.length, 1);
      assert.equal(result.warnings[0]!.code, 'NO_EXTRACTABLE_TEXT');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Markdown Extractor Tests
  // --------------------------------------------------------------------------
  describe('MarkdownRequirementDocumentExtractor', () => {
    const mdExtractor = new MarkdownRequirementDocumentExtractor();

    it('should extract headings hierarchy, sections, code blocks, lists, and tables', async () => {
      const mdContent = [
        '# 1. System Requirements',
        'This is the introduction.',
        '',
        '## 1.1 Authentication Module',
        '- Must support OAuth2.',
        '- Must enforce MFA.',
        '',
        '```typescript',
        'const user = authenticate();',
        '```',
        '',
        '### 1.1.1 Session Lifetime',
        'Sessions expire after 30 minutes.',
        '',
        '| Role | Permissions |',
        '| --- | --- |',
        '| Admin | Full Access |',
        '| User | Read Only |',
      ].join('\n');

      const result = await mdExtractor.extract({
        filePath: '/tmp/spec.md',
        fileBuffer: Buffer.from(mdContent, 'utf8'),
        fileName: 'spec.md',
        mimeType: 'text/markdown',
        documentId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
      });

      assert.equal(result.format, 'md');
      assert.equal(result.headingCount, 3);
      assert.equal(result.sectionCount, 3);
      assert.equal(result.tableCount, 1);
      assert.equal(result.pageCount, null); // DOCX/MD/TXT pageCount is strictly null

      // Verify headings hierarchy
      assert.equal(result.headings[0]!.text, '1. System Requirements');
      assert.equal(result.headings[0]!.level, 1);
      assert.equal(result.headings[1]!.text, '1.1 Authentication Module');
      assert.equal(result.headings[1]!.level, 2);
      assert.equal(result.headings[2]!.text, '1.1.1 Session Lifetime');
      assert.equal(result.headings[2]!.level, 3);

      // Verify section parent-child relationship
      const rootSec = result.sections[0]!;
      const subSec = result.sections[1]!;
      const deepSec = result.sections[2]!;

      assert.equal(rootSec.parentSectionId, null);
      assert.equal(subSec.parentSectionId, rootSec.id);
      assert.equal(deepSec.parentSectionId, subSec.id);

      // Verify table rows and cells
      const table = result.tables[0]!;
      assert.equal(table.rowCount, 3);
      assert.equal(table.columnCount, 2);
      assert.equal(table.rows[0]!.cells[0]!.text, 'Role');
      assert.equal(table.rows[0]!.cells[0]!.isHeader, true);
      assert.equal(table.rows[1]!.cells[0]!.text, 'Admin');
      assert.equal(table.rows[1]!.cells[1]!.text, 'Full Access');
    });

    it('should return empty headings and sections when markdown has no headings', async () => {
      const mdContent = 'Just a paragraph without any headings.\n\nAnother simple paragraph.';
      const result = await mdExtractor.extract({
        filePath: '/tmp/no_headings.md',
        fileBuffer: Buffer.from(mdContent, 'utf8'),
        fileName: 'no_headings.md',
        mimeType: 'text/markdown',
        documentId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
      });

      assert.equal(result.headingCount, 0);
      assert.equal(result.sectionCount, 0);
      assert.equal(result.headings.length, 0);
      assert.equal(result.sections.length, 0);
      assert.equal(result.blockCount, 2);
    });
  });

  // --------------------------------------------------------------------------
  // 3. DOCX Extractor Tests
  // --------------------------------------------------------------------------
  describe('DocxRequirementDocumentExtractor', () => {
    const docxExtractor = new DocxRequirementDocumentExtractor();

    function createSyntheticDocxBuffer(documentXml: string): Buffer {
      const deflatedXml = zlib.deflateRawSync(Buffer.from(documentXml, 'utf8'));
      const entryName = 'word/document.xml';
      const nameBuffer = Buffer.from(entryName, 'utf8');

      // Local File Header (30 bytes + name + deflated data)
      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4); // version
      localHeader.writeUInt16LE(0, 6); // flags
      localHeader.writeUInt16LE(8, 8); // compression = deflate
      localHeader.writeUInt16LE(0, 10);
      localHeader.writeUInt16LE(0, 12);
      localHeader.writeUInt32LE(0, 14); // crc32
      localHeader.writeUInt32LE(deflatedXml.length, 18); // compressed size
      localHeader.writeUInt32LE(Buffer.byteLength(documentXml), 22); // uncompressed size
      localHeader.writeUInt16LE(nameBuffer.length, 26);
      localHeader.writeUInt16LE(0, 28);

      const localRecord = Buffer.concat([localHeader, nameBuffer, deflatedXml]);

      // Central Directory Header (46 bytes + name)
      const cdHeader = Buffer.alloc(46);
      cdHeader.writeUInt32LE(0x02014b50, 0);
      cdHeader.writeUInt16LE(20, 4);
      cdHeader.writeUInt16LE(20, 6);
      cdHeader.writeUInt16LE(0, 8);
      cdHeader.writeUInt16LE(8, 10);
      cdHeader.writeUInt16LE(0, 12);
      cdHeader.writeUInt16LE(0, 14);
      cdHeader.writeUInt32LE(0, 16);
      cdHeader.writeUInt32LE(deflatedXml.length, 20);
      cdHeader.writeUInt32LE(Buffer.byteLength(documentXml), 24);
      cdHeader.writeUInt16LE(nameBuffer.length, 28);
      cdHeader.writeUInt16LE(0, 30);
      cdHeader.writeUInt16LE(0, 32);
      cdHeader.writeUInt16LE(0, 34);
      cdHeader.writeUInt16LE(0, 36);
      cdHeader.writeUInt32LE(0, 38);
      cdHeader.writeUInt32LE(0, 42); // local header offset = 0

      const cdRecord = Buffer.concat([cdHeader, nameBuffer]);

      // End of Central Directory Record (22 bytes)
      const eocd = Buffer.alloc(22);
      eocd.writeUInt32LE(0x06054b50, 0);
      eocd.writeUInt16LE(0, 4);
      eocd.writeUInt16LE(0, 6);
      eocd.writeUInt16LE(1, 8); // total entries on disk
      eocd.writeUInt16LE(1, 10); // total entries
      eocd.writeUInt32LE(cdRecord.length, 12); // cd size
      eocd.writeUInt32LE(localRecord.length, 16); // cd offset
      eocd.writeUInt16LE(0, 20);

      return Buffer.concat([localRecord, cdRecord, eocd]);
    }

    it('should extract DOCX headings, paragraphs, lists, and tables with NO fabricated page numbers', async () => {
      const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>System Overview</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>The platform enables automated test verification.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr>
      <w:r><w:t>Deterministic extraction pipeline.</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Feature</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Status</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Document Parser</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Active</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

      const docxBuf = createSyntheticDocxBuffer(docXml);

      const result = await docxExtractor.extract({
        filePath: '/tmp/doc.docx',
        fileBuffer: docxBuf,
        fileName: 'doc.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        documentId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
      });

      assert.equal(result.format, 'docx');
      assert.equal(result.pageCount, null); // Strictly null for DOCX
      assert.equal(result.headingCount, 1);
      assert.equal(result.headings[0]!.text, 'System Overview');
      assert.equal(result.headings[0]!.pageNumber, null); // No fabricated page number
      assert.equal(result.tableCount, 1);
      assert.equal(result.tables[0]!.rowCount, 2);
      assert.equal(result.tables[0]!.columnCount, 2);
      assert.equal(result.blocks[2]!.type, 'LIST_ITEM');
    });

    it('should reject malicious ZIP slip archive entries', async () => {
      // Create ZIP with evil ../../etc/passwd entry name
      const evilName = '../../evil.xml';
      const nameBuffer = Buffer.from(evilName, 'utf8');
      const deflatedXml = zlib.deflateRawSync(Buffer.from('<w:document/>', 'utf8'));

      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(0, 6);
      localHeader.writeUInt16LE(8, 8);
      localHeader.writeUInt32LE(deflatedXml.length, 18);
      localHeader.writeUInt32LE(12, 22);
      localHeader.writeUInt16LE(nameBuffer.length, 26);
      localHeader.writeUInt16LE(0, 28);

      const evilZip = Buffer.concat([localHeader, nameBuffer, deflatedXml]);

      await assert.rejects(
        async () =>
          await docxExtractor.extract({
            filePath: '/tmp/evil.docx',
            fileBuffer: evilZip,
            fileName: 'evil.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            documentId: crypto.randomUUID(),
            projectId: crypto.randomUUID(),
          }),
        (err: unknown) =>
          err instanceof DocumentFormatError && err.message.includes('Malicious entry name'),
      );
    });
  });

  // --------------------------------------------------------------------------
  // 4. PDF Extractor Tests
  // --------------------------------------------------------------------------
  describe('PdfRequirementDocumentExtractor', () => {
    const pdfExtractor = new PdfRequirementDocumentExtractor();

    function createSyntheticMultiPagePdfBuffer(): Buffer {
      // Construct a valid multi-page PDF with 2 pages and stream operators
      const page1Stream =
        'BT /F1 12 Tf 50 750 Td (1. System Architecture) Tj ET\nBT /F1 10 Tf 50 700 Td (Page 1 requirement description.) Tj ET';
      const page2Stream =
        'BT /F1 12 Tf 50 750 Td (2. User Management) Tj ET\nBT /F1 10 Tf 50 700 Td (Page 2 authentication requirement.) Tj ET';

      const deflated1 = zlib.deflateSync(Buffer.from(page1Stream, 'binary'));
      const deflated2 = zlib.deflateSync(Buffer.from(page2Stream, 'binary'));

      const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Page /Parent 2 0 R /Contents 6 0 R >>
endobj
5 0 obj
<< /Length ${deflated1.length} /Filter /FlateDecode >>
stream
${deflated1.toString('binary')}
endstream
endobj
6 0 obj
<< /Length ${deflated2.length} /Filter /FlateDecode >>
stream
${deflated2.toString('binary')}
endstream
endobj
xref
0 7
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000121 00000 n 
0000000185 00000 n 
0000000249 00000 n 
0000000350 00000 n 
trailer
<< /Size 7 /Root 1 0 R >>
startxref
500
%%EOF`;

      return Buffer.from(pdf, 'binary');
    }

    it('should extract text from multi-page PDF preserving physical 1-based page numbers', async () => {
      const pdfBuf = createSyntheticMultiPagePdfBuffer();

      const result = await pdfExtractor.extract({
        filePath: '/tmp/sample.pdf',
        fileBuffer: pdfBuf,
        fileName: 'sample.pdf',
        mimeType: 'application/pdf',
        documentId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
      });

      assert.equal(result.format, 'pdf');
      assert.equal(result.pageCount, 2);
      assert.equal(result.pages.length, 2);

      // Verify physical page numbers on pages array
      assert.equal(result.pages[0]!.pageNumber, 1);
      assert.ok(result.pages[0]!.text.includes('1. System Architecture'));
      assert.equal(result.pages[1]!.pageNumber, 2);
      assert.ok(result.pages[1]!.text.includes('2. User Management'));

      // Verify page provenance on blocks
      const page1Blocks = result.blocks.filter(b => b.pageNumber === 1);
      const page2Blocks = result.blocks.filter(b => b.pageNumber === 2);
      assert.ok(page1Blocks.length > 0);
      assert.ok(page2Blocks.length > 0);

      // Page 1 heading
      assert.equal(result.headings[0]!.text, '1. System Architecture');
      assert.equal(result.headings[0]!.pageNumber, 1);

      // Page 2 heading
      assert.equal(result.headings[1]!.text, '2. User Management');
      assert.equal(result.headings[1]!.pageNumber, 2);
    });

    it('should reject password-protected or encrypted PDFs', async () => {
      const encryptedPdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
trailer
<< /Size 3 /Root 1 0 R /Encrypt 3 0 R >>
%%EOF`;

      await assert.rejects(
        async () =>
          await pdfExtractor.extract({
            filePath: '/tmp/encrypted.pdf',
            fileBuffer: Buffer.from(encryptedPdf, 'binary'),
            fileName: 'encrypted.pdf',
            mimeType: 'application/pdf',
            documentId: crypto.randomUUID(),
            projectId: crypto.randomUUID(),
          }),
        (err: unknown) =>
          err instanceof DocumentEncryptedError && err.code === 'DOCUMENT_ENCRYPTED',
      );
    });

    it('should report NO_EXTRACTABLE_TEXT warning for scanned image PDFs without OCR', async () => {
      const scannedPdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
trailer
<< /Size 4 /Root 1 0 R >>
%%EOF`;

      const result = await pdfExtractor.extract({
        filePath: '/tmp/scanned.pdf',
        fileBuffer: Buffer.from(scannedPdf, 'binary'),
        fileName: 'scanned.pdf',
        mimeType: 'application/pdf',
        documentId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
      });

      assert.equal(result.status, 'WARNINGS');
      assert.equal(result.warnings.length, 1);
      assert.equal(result.warnings[0]!.code, 'NO_EXTRACTABLE_TEXT');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Extractor Registry Tests
  // --------------------------------------------------------------------------
  describe('ExtractorRegistry', () => {
    const registry = new ExtractorRegistry();

    it('should dispatch correct extractor by extension format', () => {
      assert.equal(registry.getExtractor('pdf').format, 'pdf');
      assert.equal(registry.getExtractor('.PDF').format, 'pdf');
      assert.equal(registry.getExtractor('docx').format, 'docx');
      assert.equal(registry.getExtractor('TXT').format, 'txt');
      assert.equal(registry.getExtractor('md').format, 'md');
    });

    it('should throw DocumentFormatError for unknown formats', () => {
      assert.throws(
        () => registry.getExtractor('exe'),
        (err: unknown) => err instanceof DocumentFormatError,
      );
    });
  });
});
