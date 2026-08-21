/**
 * @file packages/core/src/sources/source-path-validation.ts
 * Path validation and canonicalization utilities for local source directory attachment.
 */

import fs from 'node:fs';
import path from 'node:path';
import { InvalidDirectoryError, DirectoryNotFoundError } from './source-errors.js';

export interface ValidatedDirectory {
  readonly canonicalPath: string;
  readonly displayName: string;
}

/**
 * Validates that a raw path is an absolute, existing directory, resolves its canonical realpath,
 * and derives an initial display name.
 */
export function validateDirectoryPath(rawPath: string): ValidatedDirectory {
  if (!rawPath || typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    throw new InvalidDirectoryError('Directory path is required.');
  }

  const trimmed = rawPath.trim();

  if (!path.isAbsolute(trimmed)) {
    throw new InvalidDirectoryError('Directory path must be an absolute path.');
  }

  if (!fs.existsSync(trimmed)) {
    throw new DirectoryNotFoundError(`The directory "${trimmed}" does not exist.`);
  }

  let canonicalPath: string;
  try {
    canonicalPath = fs.realpathSync(trimmed);
  } catch (err: unknown) {
    throw new InvalidDirectoryError(
      `Failed to resolve canonical path: ${err instanceof Error ? err.message : 'Unknown filesystem error'}`,
    );
  }

  try {
    const stats = fs.statSync(canonicalPath);
    if (!stats.isDirectory()) {
      throw new InvalidDirectoryError(`The path "${canonicalPath}" is not a directory.`);
    }
  } catch (err: unknown) {
    if (err instanceof InvalidDirectoryError) {
      throw err;
    }
    throw new InvalidDirectoryError(
      `Failed to inspect path: ${err instanceof Error ? err.message : 'Unknown filesystem error'}`,
    );
  }

  // Derive initial display name from the directory's basename
  let displayName = path.basename(canonicalPath);
  if (!displayName || displayName === '/' || displayName === '\\') {
    displayName = 'root';
  }

  return {
    canonicalPath,
    displayName,
  };
}

/**
 * Non-throwing check to verify if a canonical root directory is currently reachable and exists.
 */
export function checkPathAvailability(rootPath: string): boolean {
  if (!rootPath || typeof rootPath !== 'string') {
    return false;
  }

  try {
    return fs.existsSync(rootPath) && fs.statSync(rootPath).isDirectory();
  } catch {
    return false;
  }
}
