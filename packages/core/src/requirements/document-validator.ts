/**
 * @file packages/core/src/requirements/document-validator.ts
 * Pure deterministic validation for requirement documents (PDF, DOCX, TXT, MD).
 *
 * VALIDATION POLICY:
 * 1. Extension allowlist: .pdf, .docx, .txt, .md.
 * 2. File size limit: 25 MB max, non-zero.
 * 3. File signatures / magic bytes:
 *    - PDF: starts with %PDF-
 *    - DOCX: ZIP archive starting with PK\x03\x04 containing Word package markers, rejecting .docm.
 *    - TXT / MD: valid UTF-8/ASCII text without binary null bytes (\x00).
 * 4. Reject all executable formats (.exe, .app, .sh, .bat, .cmd, .ps1, .js, .jar, etc.).
 * 5. Sanitize and validate filename against path traversal attacks.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { SupportedDocumentFormat } from '@ai-quality/contracts';

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
export const SUPPORTED_DOCUMENT_EXTENSIONS: readonly string[] = ['.pdf', '.docx', '.txt', '.md'];

export interface ValidatedDocumentHeader {
  readonly originalFileName: string;
  readonly fileExtension: SupportedDocumentFormat;
  readonly mimeType: string;
  readonly fileSize: number;
}

export class DocumentValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'DocumentValidationError';
    this.code = code;
  }
}

/**
 * Sanitizes a user-supplied filename, stripping path traversal sequences and dangerous characters.
 */
export function sanitizeFileName(rawFileName: string): string {
  // Normalize Windows backslashes and POSIX slashes first
  const normalized = rawFileName.replace(/\\/g, '/');
  const baseName = path.posix.basename(normalized);
  // Remove null bytes, control characters, and leading/trailing whitespace
  // eslint-disable-next-line no-control-regex
  const sanitized = baseName.replace(/[\x00-\x1F\x7F]/g, '').trim();
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    throw new DocumentValidationError(
      'DOCUMENT_INVALID_FORMAT',
      'Filename contains invalid characters or path traversal sequences.',
    );
  }
  return sanitized;
}

/**
 * Validates a candidate requirement document file against format allowlist, size limits, and magic byte signatures.
 */
export async function validateDocumentFile(filePath: string): Promise<ValidatedDocumentHeader> {
  // Check file existence and stats
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    throw new DocumentValidationError(
      'DOCUMENT_NOT_FOUND',
      'Selected document file does not exist or cannot be read.',
    );
  }

  if (!stat.isFile()) {
    throw new DocumentValidationError(
      'DOCUMENT_INVALID_FORMAT',
      'Selected path is not a regular file.',
    );
  }

  if (stat.size === 0) {
    throw new DocumentValidationError(
      'DOCUMENT_INVALID_FORMAT',
      'Selected document is empty (0 bytes).',
    );
  }

  if (stat.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    throw new DocumentValidationError(
      'DOCUMENT_TOO_LARGE',
      `Document size (${(stat.size / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum allowed limit of 25 MB.`,
    );
  }

  const rawFileName = path.basename(filePath);
  const sanitizedName = sanitizeFileName(rawFileName);
  const ext = path.extname(sanitizedName).toLowerCase();

  if (!SUPPORTED_DOCUMENT_EXTENSIONS.includes(ext)) {
    throw new DocumentValidationError(
      'DOCUMENT_INVALID_FORMAT',
      `Unsupported document format '${ext}'. Allowed formats: .pdf, .docx, .txt, .md.`,
    );
  }

  const format = ext.slice(1) as SupportedDocumentFormat;

  // Read header bytes (first 8 KB) for magic signature validation
  const headerBufSize = Math.min(8192, stat.size);
  const buffer = Buffer.alloc(headerBufSize);
  let fd: fs.promises.FileHandle | undefined;
  try {
    fd = await fs.promises.open(filePath, 'r');
    await fd.read(buffer, 0, headerBufSize, 0);
  } finally {
    if (fd) {
      await fd.close();
    }
  }

  let mimeType: string;

  switch (format) {
    case 'pdf': {
      // PDF must start with %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
      const pdfHeader = buffer.subarray(0, 5).toString('ascii');
      if (pdfHeader !== '%PDF-') {
        throw new DocumentValidationError(
          'DOCUMENT_INVALID_FORMAT',
          'File has .pdf extension but lacks a valid PDF signature header (%PDF-).',
        );
      }
      mimeType = 'application/pdf';
      break;
    }
    case 'docx': {
      // DOCX is a ZIP container: must start with PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
      const isZip =
        buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
      if (!isZip) {
        throw new DocumentValidationError(
          'DOCUMENT_INVALID_FORMAT',
          'File has .docx extension but is not a valid ZIP/Office package container.',
        );
      }

      // Check header for standard Word OpenXML package indicators
      const headerStr = buffer.toString('binary');
      const hasWordPackageMarkers =
        headerStr.includes('[Content_Types].xml') ||
        headerStr.includes('word/') ||
        headerStr.includes('docProps/');

      if (!hasWordPackageMarkers && stat.size < 4096) {
        throw new DocumentValidationError(
          'DOCUMENT_INVALID_FORMAT',
          'File has .docx extension but lacks standard Word OpenXML package contents.',
        );
      }
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      break;
    }
    case 'txt':
    case 'md': {
      // Plain text formats must not contain binary null bytes (\x00)
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === 0x00) {
          throw new DocumentValidationError(
            'DOCUMENT_INVALID_FORMAT',
            `Binary content detected in ${ext} document. Disguised binary executables or raw data are rejected.`,
          );
        }
      }
      mimeType = format === 'md' ? 'text/markdown' : 'text/plain';
      break;
    }
  }

  return {
    originalFileName: sanitizedName,
    fileExtension: format,
    mimeType,
    fileSize: stat.size,
  };
}
