/**
 * @file packages/core/src/sources/content/source-content-policy.ts
 * Policy enforcement for binary inspection, sensitive files, and path validation.
 */

import path from 'node:path';
import { isSensitiveFile } from './sensitive-file-rules.js';

const BINARY_EXTENSIONS = new Set<string>([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.tiff',
  '.avif',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.mp4',
  '.mp3',
  '.wav',
  '.webm',
  '.ogg',
  '.mov',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.rar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.class',
  '.jar',
  '.war',
  '.pyc',
  '.pyo',
  '.pyd',
  '.wasm',
  '.sqlite',
  '.sqlite3',
  '.db',
  '.bin',
]);

export class SourceContentPolicy {
  /**
   * Validates relative path structure against traversal, URL, and platform escape edge cases.
   */
  static validateRelativePath(relativePath: string): boolean {
    if (!relativePath || typeof relativePath !== 'string') return false;
    const trimmed = relativePath.trim();
    if (trimmed.length === 0 || trimmed.length > 1024) return false;

    // Reject NUL bytes
    if (trimmed.includes('\0')) return false;

    // Reject absolute paths (POSIX, Windows drive letters, UNC shares)
    if (
      trimmed.startsWith('/') ||
      trimmed.startsWith('\\') ||
      /^[a-zA-Z]:/.test(trimmed) ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('\\\\') ||
      trimmed.startsWith('file:')
    ) {
      return false;
    }

    // Normalize and check for path traversal
    const normalized = path.posix.normalize(trimmed.replace(/\\/g, '/'));
    if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
      return false;
    }

    return true;
  }

  /**
   * Checks if the filename is sensitive / secret-bearing.
   */
  static isSensitive(fileName: string): boolean {
    return isSensitiveFile(fileName);
  }

  /**
   * Checks if an extension is a known binary / non-text format.
   */
  static isBinaryExtension(extension: string): boolean {
    return BINARY_EXTENSIONS.has(extension.toLowerCase());
  }

  /**
   * Inspects a buffer sample for binary NUL bytes (0x00).
   */
  static containsBinaryNullBytes(buffer: Buffer): boolean {
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }
    return false;
  }
}
