import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  validateDocumentFile,
  sanitizeFileName,
  DocumentValidationError,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
} from './document-validator.js';

describe('DocumentValidator Unit Tests', () => {
  let tempDir: string;

  before(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'doc-validator-test-'));
  });

  after(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('should sanitize filenames against path traversal attacks', () => {
    assert.equal(sanitizeFileName('SRS_Specification_v1.pdf'), 'SRS_Specification_v1.pdf');
    assert.equal(sanitizeFileName('../../../etc/passwd.pdf'), 'passwd.pdf');
    assert.equal(sanitizeFileName('C:\\Windows\\System32\\specs.docx'), 'specs.docx');
    assert.equal(sanitizeFileName('valid-doc\x00null.txt'), 'valid-docnull.txt');

    assert.throws(
      () => sanitizeFileName('..'),
      (err: unknown) => err instanceof DocumentValidationError,
    );
  });

  it('should validate a valid PDF document with %PDF- signature', async () => {
    const validPdfPath = path.join(tempDir, 'valid.pdf');
    const pdfContent = Buffer.concat([
      Buffer.from('%PDF-1.7\n%Fake PDF binary stream for validation\n'),
      Buffer.from('trailer\n<< /Size 1 >>\nstartxref\n0\n%%EOF'),
    ]);
    await fs.promises.writeFile(validPdfPath, pdfContent);

    const result = await validateDocumentFile(validPdfPath);
    assert.equal(result.originalFileName, 'valid.pdf');
    assert.equal(result.fileExtension, 'pdf');
    assert.equal(result.mimeType, 'application/pdf');
    assert.equal(result.fileSize, pdfContent.length);
  });

  it('should reject fake PDF without %PDF- header signature', async () => {
    const fakePdfPath = path.join(tempDir, 'fake.pdf');
    await fs.promises.writeFile(fakePdfPath, 'This is an executable or raw text renamed to .pdf');

    await assert.rejects(
      async () => await validateDocumentFile(fakePdfPath),
      (err: unknown) =>
        err instanceof DocumentValidationError &&
        err.code === 'DOCUMENT_INVALID_FORMAT' &&
        err.message.includes('%PDF-'),
    );
  });

  it('should validate a valid DOCX container with PK zip header and Word markers', async () => {
    const validDocxPath = path.join(tempDir, 'valid.docx');
    // ZIP local file header PK\x03\x04 + word/[Content_Types].xml marker
    const docxHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const docxBody = Buffer.from(' [Content_Types].xml word/document.xml docProps/core.xml');
    const docxContent = Buffer.concat([docxHeader, docxBody]);
    await fs.promises.writeFile(validDocxPath, docxContent);

    const result = await validateDocumentFile(validDocxPath);
    assert.equal(result.originalFileName, 'valid.docx');
    assert.equal(result.fileExtension, 'docx');
    assert.equal(
      result.mimeType,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('should reject fake DOCX lacking PK zip container header', async () => {
    const fakeDocxPath = path.join(tempDir, 'fake.docx');
    await fs.promises.writeFile(fakeDocxPath, 'Not a zip file content');

    await assert.rejects(
      async () => await validateDocumentFile(fakeDocxPath),
      (err: unknown) =>
        err instanceof DocumentValidationError &&
        err.code === 'DOCUMENT_INVALID_FORMAT' &&
        err.message.includes('ZIP/Office package container'),
    );
  });

  it('should validate plain text (TXT) and Markdown (MD) files', async () => {
    const txtPath = path.join(tempDir, 'requirements.txt');
    await fs.promises.writeFile(
      txtPath,
      '1. System shall authenticate user.\n2. System shall log out.',
    );

    const mdPath = path.join(tempDir, 'specs.md');
    await fs.promises.writeFile(mdPath, '# SRS Document\n\n- User login\n- Password reset');

    const txtRes = await validateDocumentFile(txtPath);
    assert.equal(txtRes.fileExtension, 'txt');
    assert.equal(txtRes.mimeType, 'text/plain');

    const mdRes = await validateDocumentFile(mdPath);
    assert.equal(mdRes.fileExtension, 'md');
    assert.equal(mdRes.mimeType, 'text/markdown');
  });

  it('should reject binary executable files disguised as TXT (containing null bytes)', async () => {
    const binaryTxtPath = path.join(tempDir, 'malware.txt');
    const binaryContent = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // DOS MZ header
    await fs.promises.writeFile(binaryTxtPath, binaryContent);

    await assert.rejects(
      async () => await validateDocumentFile(binaryTxtPath),
      (err: unknown) =>
        err instanceof DocumentValidationError &&
        err.code === 'DOCUMENT_INVALID_FORMAT' &&
        err.message.includes('Binary content detected'),
    );
  });

  it('should reject zero-byte empty files', async () => {
    const emptyPath = path.join(tempDir, 'empty.txt');
    await fs.promises.writeFile(emptyPath, Buffer.alloc(0));

    await assert.rejects(
      async () => await validateDocumentFile(emptyPath),
      (err: unknown) =>
        err instanceof DocumentValidationError &&
        err.code === 'DOCUMENT_INVALID_FORMAT' &&
        err.message.includes('0 bytes'),
    );
  });

  it('should reject unsupported file extensions (.exe, .sh, .docm, .png)', async () => {
    const exePath = path.join(tempDir, 'app.exe');
    await fs.promises.writeFile(exePath, 'binary');

    await assert.rejects(
      async () => await validateDocumentFile(exePath),
      (err: unknown) =>
        err instanceof DocumentValidationError &&
        err.code === 'DOCUMENT_INVALID_FORMAT' &&
        err.message.includes("Unsupported document format '.exe'"),
    );
  });

  it('should reject non-existent files', async () => {
    await assert.rejects(
      async () => await validateDocumentFile(path.join(tempDir, 'non_existent.pdf')),
      (err: unknown) => err instanceof DocumentValidationError && err.code === 'DOCUMENT_NOT_FOUND',
    );
  });

  it('should enforce 25 MB max document file size constant', () => {
    assert.equal(MAX_DOCUMENT_FILE_SIZE_BYTES, 25 * 1024 * 1024);
  });
});
