/**
 * @file packages/core/src/git-repositories/import-safety-validator.ts
 * Rigorous path traversal defense, archive safety, size bounds, and symlink protection for repository imports.
 */

import path from 'node:path';
import fs from 'node:fs';
import {
  RepositoryPathTraversalError,
  RepositoryOversizedError,
} from './git-repository-errors.js';

export const IMPORT_SAFETY_LIMITS = {
  MAX_SINGLE_FILE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_TOTAL_REPOSITORY_BYTES: 100 * 1024 * 1024, // 100 MB
  MAX_FILE_COUNT: 10_000,
  DEFAULT_TIMEOUT_MS: 30_000,
} as const;

export class ImportSafetyValidator {
  /**
   * Validates and canonicalizes a relative file path within an imported repository.
   * Strictly prevents directory traversal, null-byte injection, and absolute paths.
   */
  static validateRelativePath(rawRelativePath: string, targetRootDir: string): string {
    if (!rawRelativePath || typeof rawRelativePath !== 'string') {
      throw new RepositoryPathTraversalError('Path must be a non-empty string.');
    }

    // 1. Null-byte injection check
    if (rawRelativePath.includes('\0')) {
      throw new RepositoryPathTraversalError('Null-byte character detected in archive path.');
    }

    // 2. Encoded traversal characters (%2e%2e, %2f, %5c)
    if (/%2e|%2f|%5c/i.test(rawRelativePath)) {
      throw new RepositoryPathTraversalError(
        `Encoded traversal characters detected in path '${rawRelativePath}'.`,
      );
    }

    // 3. Absolute path checks (POSIX and Windows)
    if (path.isAbsolute(rawRelativePath) || /^[a-zA-Z]:[/\\]/.test(rawRelativePath)) {
      throw new RepositoryPathTraversalError(
        `Absolute path not permitted in repository archive: '${rawRelativePath}'.`,
      );
    }

    // 4. Normalize separators
    const normalized = rawRelativePath.replace(/\\/g, '/');

    // 5. Segment-level traversal detection
    const segments = normalized.split('/');
    if (segments.some((segment) => segment === '..')) {
      throw new RepositoryPathTraversalError(
        `Path traversal ('..') detected in archive path: '${rawRelativePath}'.`,
      );
    }

    // 6. Absolute resolution boundary containment check
    const resolvedTarget = path.resolve(targetRootDir, normalized);
    const resolvedRoot = path.resolve(targetRootDir);

    if (
      resolvedTarget !== resolvedRoot &&
      !resolvedTarget.startsWith(resolvedRoot + path.sep) &&
      !resolvedTarget.startsWith(resolvedRoot + '/')
    ) {
      throw new RepositoryPathTraversalError(
        `Resolved path '${resolvedTarget}' escapes repository root '${resolvedRoot}'.`,
      );
    }

    return normalized;
  }

  /**
   * Validates that an incoming file does not exceed the single-file size limit or total repository limit.
   */
  static validateFileSize(
    fileSizeBytes: number,
    currentCumulativeBytes: number,
    limits = IMPORT_SAFETY_LIMITS,
  ): void {
    if (fileSizeBytes > limits.MAX_SINGLE_FILE_BYTES) {
      throw new RepositoryOversizedError(
        `File size (${fileSizeBytes} bytes) exceeds maximum allowable limit of ${limits.MAX_SINGLE_FILE_BYTES} bytes.`,
      );
    }

    if (currentCumulativeBytes + fileSizeBytes > limits.MAX_TOTAL_REPOSITORY_BYTES) {
      throw new RepositoryOversizedError(
        `Total repository size (${currentCumulativeBytes + fileSizeBytes} bytes) exceeds maximum allowable limit of ${limits.MAX_TOTAL_REPOSITORY_BYTES} bytes.`,
      );
    }
  }

  /**
   * Validates file count bound.
   */
  static validateFileCount(currentCount: number, limits = IMPORT_SAFETY_LIMITS): void {
    if (currentCount >= limits.MAX_FILE_COUNT) {
      throw new RepositoryOversizedError(
        `Repository file count (${currentCount + 1}) exceeds maximum limit of ${limits.MAX_FILE_COUNT} files.`,
      );
    }
  }

  /**
   * Checks for symlink containment escapes.
   */
  static validateSymlinkTarget(symlinkTarget: string, targetRootDir: string): void {
    if (!symlinkTarget || typeof symlinkTarget !== 'string') {
      return;
    }

    if (path.isAbsolute(symlinkTarget)) {
      throw new RepositoryPathTraversalError(
        `Absolute symlink targets are forbidden in repository imports: '${symlinkTarget}'.`,
      );
    }

    if (symlinkTarget.includes('..')) {
      const resolvedTarget = path.resolve(targetRootDir, symlinkTarget);
      const resolvedRoot = path.resolve(targetRootDir);
      if (!resolvedTarget.startsWith(resolvedRoot + path.sep)) {
        throw new RepositoryPathTraversalError(
          `Symlink target '${symlinkTarget}' escapes repository root.`,
        );
      }
    }
  }
}
