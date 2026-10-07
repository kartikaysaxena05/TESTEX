/**
 * @file packages/core/src/local-folders/secure-project-root-guard.ts
 * Security guard for resolving, canonicalizing, and containing filesystem paths within an authorized project root.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  LocalFolderPathTraversalError,
  LocalFolderSymlinkEscapeError,
  LocalFolderInvalidPathError,
  LocalFolderNotFoundError,
} from './local-folder-errors.js';

export interface SecurePathResolution {
  /** The verified canonical root directory of the project */
  readonly canonicalRoot: string;
  /** The target path resolved within the project root */
  readonly resolvedPath: string;
  /** The real canonical path after resolving all symlinks and junctions */
  readonly canonicalResolvedPath: string;
  /** The canonical relative path from canonicalRoot (forward slashes, or '.' for root) */
  readonly relativePath: string;
  /** Whether the target currently exists on disk */
  readonly exists: boolean;
}

export class SecureProjectRootGuard {
  readonly canonicalRoot: string;

  constructor(rawProjectRoot: string) {
    if (!rawProjectRoot || typeof rawProjectRoot !== 'string' || rawProjectRoot.trim().length === 0) {
      throw new LocalFolderInvalidPathError('Project root directory is required.');
    }

    const trimmed = rawProjectRoot.trim();
    if (!path.isAbsolute(trimmed)) {
      throw new LocalFolderInvalidPathError('Project root directory must be an absolute path.');
    }

    if (!fs.existsSync(trimmed)) {
      throw new LocalFolderNotFoundError(`Project root directory does not exist: "${trimmed}"`);
    }

    try {
      this.canonicalRoot = fs.realpathSync(trimmed);
      const stat = fs.statSync(this.canonicalRoot);
      if (!stat.isDirectory()) {
        throw new LocalFolderInvalidPathError(`Project root path is not a directory: "${this.canonicalRoot}"`);
      }
    } catch (err: unknown) {
      if (err instanceof LocalFolderNotFoundError || err instanceof LocalFolderInvalidPathError) {
        throw err;
      }
      throw new LocalFolderInvalidPathError(
        `Failed to resolve canonical project root: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Resolves and secures a user- or agent-supplied relative path against this project root.
   * Strictly enforces path traversal, URL-encoding, Windows/macOS escape, and symlink containment defenses.
   */
  resolveSecurePath(rawPath: string): SecurePathResolution {
    if (typeof rawPath !== 'string') {
      throw new LocalFolderInvalidPathError('Supplied path must be a string.');
    }

    const trimmed = rawPath.trim();

    // 1. Reject NUL bytes
    if (trimmed.includes('\0')) {
      throw new LocalFolderPathTraversalError('Path contains prohibited null byte character.');
    }

    // 2. Reject URL protocols and file: schemes
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
      throw new LocalFolderPathTraversalError('Protocol URIs and scheme prefixes are strictly prohibited.');
    }

    // 3. Reject Windows drive letters (e.g. C:, D:)
    if (/^[a-zA-Z]:/.test(trimmed)) {
      throw new LocalFolderPathTraversalError('Absolute Windows drive letters are strictly prohibited.');
    }

    // 4. Reject UNC network shares and double slashes
    if (trimmed.startsWith('//') || trimmed.startsWith('\\\\')) {
      throw new LocalFolderPathTraversalError('UNC network shares and double-slash prefixes are prohibited.');
    }

    // 5. Multi-pass URL decoding check for encoded traversals (e.g. %2e%2e, %252e%252e)
    let decoded = trimmed;
    for (let pass = 0; pass < 3; pass++) {
      try {
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      } catch {
        throw new LocalFolderInvalidPathError('Malformed URL-encoded path provided.');
      }
    }

    if (
      decoded.includes('..') &&
      (/(^|[/\\])\.\.([/\\]|$)/.test(decoded) || decoded.startsWith('..'))
    ) {
      throw new LocalFolderPathTraversalError('Path contains encoded directory traversal sequence.');
    }

    // 6. Direct traversal checks on raw input
    if (
      trimmed === '..' ||
      trimmed.startsWith('../') ||
      trimmed.startsWith('..\\') ||
      trimmed.includes('/../') ||
      trimmed.includes('\\..\\') ||
      trimmed.includes('/..\\') ||
      trimmed.includes('\\../') ||
      trimmed.endsWith('/..') ||
      trimmed.endsWith('\\..')
    ) {
      throw new LocalFolderPathTraversalError('Relative directory traversal sequence (..) is prohibited.');
    }

    // 7. Check for alternate data streams (e.g. filename:stream)
    if (trimmed.includes(':')) {
      throw new LocalFolderInvalidPathError('Alternate data stream identifiers are prohibited.');
    }

    // 8. Normalization
    // If empty or "." or "./", point directly to project root
    const normalizedInput = trimmed.replace(/\\/g, '/');
    if (normalizedInput === '' || normalizedInput === '.' || normalizedInput === './') {
      return {
        canonicalRoot: this.canonicalRoot,
        resolvedPath: this.canonicalRoot,
        canonicalResolvedPath: this.canonicalRoot,
        relativePath: '.',
        exists: true,
      };
    }

    // Reject absolute paths escaping root
    if (trimmed.startsWith('/') || trimmed.startsWith('\\')) {
      // Disallow absolute paths outside root
      const directResolved = path.resolve(trimmed);
      const relToRoot = path.relative(this.canonicalRoot, directResolved);
      if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
        throw new LocalFolderPathTraversalError('Absolute filesystem path escapes authorized project root.');
      }
    }

    const posixNormalized = path.posix.normalize(normalizedInput);
    if (posixNormalized === '..' || posixNormalized.startsWith('../')) {
      throw new LocalFolderPathTraversalError('Normalized path escapes authorized project root.');
    }

    const resolvedPath = path.resolve(this.canonicalRoot, posixNormalized);

    // 9. Root containment check
    const relFromRoot = path.relative(this.canonicalRoot, resolvedPath);
    if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) {
      throw new LocalFolderPathTraversalError('Resolved path escapes authorized project root.');
    }

    // 10. Symlink and junction escape check
    let canonicalResolvedPath: string;

    if (fs.existsSync(resolvedPath)) {
      try {
        canonicalResolvedPath = fs.realpathSync(resolvedPath);
      } catch (err: unknown) {
        throw new LocalFolderInvalidPathError(
          `Failed to resolve realpath: ${err instanceof Error ? err.message : 'Filesystem error'}`,
        );
      }

      const relCanonical = path.relative(this.canonicalRoot, canonicalResolvedPath);
      if (relCanonical.startsWith('..') || path.isAbsolute(relCanonical)) {
        throw new LocalFolderSymlinkEscapeError(
          `Symlink or junction target "${canonicalResolvedPath}" escapes authorized project root.`,
        );
      }

      return {
        canonicalRoot: this.canonicalRoot,
        resolvedPath,
        canonicalResolvedPath,
        relativePath: relCanonical.replace(/\\/g, '/') || '.',
        exists: true,
      };
    } else {
      // Path does not exist. Ensure ancestor directories don't escape via symlinks
      let currentAncestor = path.dirname(resolvedPath);
      while (currentAncestor.length >= this.canonicalRoot.length) {
        if (fs.existsSync(currentAncestor)) {
          try {
            const canonicalAncestor = fs.realpathSync(currentAncestor);
            const relAncestor = path.relative(this.canonicalRoot, canonicalAncestor);
            if (relAncestor.startsWith('..') || path.isAbsolute(relAncestor)) {
              throw new LocalFolderSymlinkEscapeError(
                `Parent directory symlink "${canonicalAncestor}" escapes authorized project root.`,
              );
            }
          } catch (err: unknown) {
            if (err instanceof LocalFolderSymlinkEscapeError) throw err;
          }
          break;
        }
        const parent = path.dirname(currentAncestor);
        if (parent === currentAncestor) break;
        currentAncestor = parent;
      }

      return {
        canonicalRoot: this.canonicalRoot,
        resolvedPath,
        canonicalResolvedPath: resolvedPath,
        relativePath: relFromRoot.replace(/\\/g, '/') || '.',
        exists: false,
      };
    }
  }
}
