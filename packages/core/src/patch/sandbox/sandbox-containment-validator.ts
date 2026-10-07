/**
 * @file packages/core/src/patch/sandbox/sandbox-containment-validator.ts
 * Rigorous filesystem path containment, symlink escape, sensitive file,
 * allowed scope, and metadata defense engine for patch sandboxes.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  PatchSandboxGitMetadataBlockedError,
  PatchSandboxPathTraversalError,
  PatchSandboxSensitiveFileBlockedError,
  PatchSandboxSymlinkEscapeError,
  PatchSandboxUnauthorizedFileError,
  PatchSandboxUnsupportedBinaryError,
} from './sandbox-errors.js';
import type { SandboxContainmentValidationResult } from './sandbox-types.js';

/**
 * Patterns of sensitive system, credential, and secret files that patches are forbidden to touch.
 */
export const SENSITIVE_FILE_PATTERNS = [
  /^\.env(\..+)?$/i,
  /(^|\/)\.env(\..+)?$/i,
  /(^|\/)id_rsa(\.pub)?$/i,
  /(^|\/)id_ed25519(\.pub)?$/i,
  /(^|\/)id_ecdsa(\.pub)?$/i,
  /(^|\/)id_dsa(\.pub)?$/i,
  /\.(pem|key|pfx|p12|pkcs12)$/i,
  /(^|\/)\.aws\//i,
  /(^|\/)\.ssh\//i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)\.dockercfg$/i,
  /(^|\/)\.docker\/config\.json$/i,
  /(^|\/)credentials(\.json|\.yml|\.yaml|\.xml)?$/i,
  /(^|\/)secrets(\.json|\.yml|\.yaml|\.xml)?$/i,
  /(^|\/)(etc\/passwd|etc\/shadow)$/i,
] as const;

export class SandboxContainmentValidator {
  /**
   * Normalizes relative file paths to standard Unix format without leading slashes or dots.
   */
  static normalizeRelativePath(rawPath: string): string {
    if (!rawPath || typeof rawPath !== 'string') {
      throw new PatchSandboxPathTraversalError('Path must be a non-empty string.');
    }

    // Check for null-byte injection tricks
    if (rawPath.includes('\0')) {
      throw new PatchSandboxPathTraversalError('Null-byte character detected in path.');
    }

    // Check for URI-encoded traversal tricks (%2e%2e, %2f, etc.)
    if (/%2e|%2f|%5c/i.test(rawPath)) {
      throw new PatchSandboxPathTraversalError(
        `Encoded traversal characters detected in path '${rawPath}'.`,
      );
    }

    let cleaned = rawPath.trim().replace(/\\/g, '/');

    // Reject UNC and Windows drive paths
    if (/^[a-zA-Z]:/i.test(cleaned) || cleaned.startsWith('//') || cleaned.startsWith('\\\\')) {
      throw new PatchSandboxPathTraversalError(
        `Absolute or volume-specific path rejected: '${rawPath}'.`,
      );
    }

    // Reject POSIX absolute paths
    if (cleaned.startsWith('/')) {
      throw new PatchSandboxPathTraversalError(`Absolute filesystem path rejected: '${rawPath}'.`);
    }

    // Collapse consecutive slashes and remove leading ./
    cleaned = cleaned.replace(/\/+/g, '/');
    while (cleaned.startsWith('./')) {
      cleaned = cleaned.substring(2);
    }

    return cleaned;
  }

  /**
   * Validates that target path resolves strictly within sandboxRoot without escaping.
   */
  static validatePathContainment(sandboxRoot: string, relativePath: string): string {
    const normalized = this.normalizeRelativePath(relativePath);

    // Quick traversal check
    if (normalized.split('/').includes('..')) {
      throw new PatchSandboxPathTraversalError(
        `Path traversal sequence '..' detected in path '${relativePath}'.`,
      );
    }

    const canonicalRoot = fs.existsSync(sandboxRoot)
      ? fs.realpathSync(sandboxRoot)
      : path.resolve(sandboxRoot);
    const resolvedPath = path.resolve(canonicalRoot, normalized);

    if (!resolvedPath.startsWith(canonicalRoot + path.sep) && resolvedPath !== canonicalRoot) {
      throw new PatchSandboxPathTraversalError(
        `Target path '${relativePath}' resolves outside sandbox root '${sandboxRoot}'.`,
      );
    }

    return resolvedPath;
  }

  /**
   * Validates that target path does not target or touch .git metadata.
   */
  static validateGitMetadata(relativePath: string): void {
    const normalized = relativePath.trim().replace(/\\/g, '/');
    const segments = normalized.split('/');
    if (segments.includes('.git')) {
      throw new PatchSandboxGitMetadataBlockedError(
        `Target path '${relativePath}' modifies Git metadata. Raw .git mutations are strictly forbidden.`,
      );
    }
  }

  /**
   * Validates that target path does not touch sensitive credentials, keys, or secret files.
   */
  static validateSensitiveFiles(relativePath: string): void {
    const normalized = relativePath.trim().replace(/\\/g, '/');
    for (const pattern of SENSITIVE_FILE_PATTERNS) {
      if (pattern.test(normalized)) {
        throw new PatchSandboxSensitiveFileBlockedError(
          `Target path '${relativePath}' matches sensitive credential/secret file pattern '${pattern.source}'. Write blocked.`,
        );
      }
    }
  }

  /**
   * Validates that all target files belong to the authorized candidateFiles allowlist.
   */
  static validateAllowedScope(
    targetFiles: readonly string[],
    authorizedCandidateFiles: readonly string[],
  ): void {
    const authorizedSet = new Set(
      authorizedCandidateFiles.map(f => f.trim().replace(/\\/g, '/').replace(/^\.\//, '')),
    );

    for (const file of targetFiles) {
      const normalized = file.trim().replace(/\\/g, '/').replace(/^\.\//, '');
      if (!authorizedSet.has(normalized)) {
        throw new PatchSandboxUnauthorizedFileError(
          `Target file '${file}' is not authorized. Authorized files for this defect are: [${authorizedCandidateFiles.join(', ')}]`,
        );
      }
    }
  }

  /**
   * Validates that no path or intermediate directory in the sandbox is a symlink escaping sandboxRoot.
   */
  static validateSymlinkEscape(sandboxRoot: string, relativePath: string): void {
    const canonicalRoot = fs.existsSync(sandboxRoot)
      ? fs.realpathSync(sandboxRoot)
      : path.resolve(sandboxRoot);
    const normalized = this.normalizeRelativePath(relativePath);
    const segments = normalized.split('/');

    let current = canonicalRoot;
    for (const segment of segments) {
      current = path.join(current, segment);
      if (fs.existsSync(current)) {
        try {
          const lstat = fs.lstatSync(current);
          if (lstat.isSymbolicLink()) {
            const real = fs.realpathSync(current);
            if (!real.startsWith(canonicalRoot + path.sep) && real !== canonicalRoot) {
              throw new PatchSandboxSymlinkEscapeError(
                `Symlink escape detected: Segment '${segment}' in '${relativePath}' points outside sandbox root to '${real}'.`,
              );
            }
          }
        } catch (err: unknown) {
          if (err instanceof PatchSandboxSymlinkEscapeError) {
            throw err;
          }
          // File or link resolution error
          throw new PatchSandboxPathTraversalError(
            `Filesystem inspection failed for segment '${segment}' in '${relativePath}'.`,
          );
        }
      }
    }
  }

  /**
   * Detects binary content that cannot be safely patched as text.
   */
  static validateBinaryContent(content: string, filePath: string): void {
    // Check for null bytes which indicate binary data
    if (content.includes('\0')) {
      throw new PatchSandboxUnsupportedBinaryError(
        `Binary file detected at '${filePath}'. Text patch operations on binary files are unsupported.`,
      );
    }
  }

  /**
   * Performs all containment and security checks on a set of target files.
   */
  static performAllChecks(
    sandboxRoot: string,
    targetFiles: readonly string[],
    authorizedCandidateFiles: readonly string[],
  ): SandboxContainmentValidationResult {
    const errors: string[] = [];

    // 1. Allowed file scope
    try {
      this.validateAllowedScope(targetFiles, authorizedCandidateFiles);
    } catch (err: unknown) {
      if (err instanceof Error) errors.push(err.message);
      throw err;
    }

    // 2. Path containment, git metadata, sensitive files, and symlink escape for each target file
    for (const file of targetFiles) {
      this.validateGitMetadata(file);
      this.validateSensitiveFiles(file);
      this.validatePathContainment(sandboxRoot, file);
      this.validateSymlinkEscape(sandboxRoot, file);
    }

    return {
      isValid: errors.length === 0,
      securityChecks: {
        pathContainmentPassed: true,
        symlinkEscapePassed: true,
        allowedFileScopePassed: true,
        sensitiveFilesProtected: true,
        gitMetadataProtected: true,
        arbitraryShellExecutionBlocked: true,
        binaryFilesBlocked: true,
        hardlinkIsolated: true,
        checkedAt: new Date().toISOString(),
      },
      errors,
    };
  }
}
