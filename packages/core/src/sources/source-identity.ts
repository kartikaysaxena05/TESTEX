/**
 * @file packages/core/src/sources/source-identity.ts
 * Source identity extraction and deterministic root fingerprinting for local software projects.
 *
 * ARCHITECTURAL RULE:
 * This module inspects ONLY the root directory itself (constant time O(1)).
 * It must NEVER recursively scan files, parse code, or run Git.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { ProjectSourceKind } from '@ai-quality/contracts';
import { InvalidDirectoryError } from './source-errors.js';

export interface SourceRootMetadata {
  readonly canonicalPath: string;
  readonly displayName: string;
  readonly identityFingerprint: string;
  readonly filesystemCreatedAt: Date | null;
  readonly filesystemModifiedAt: Date | null;
  readonly metadataRefreshedAt: Date;
  readonly isAccessible: boolean;
}

/**
 * Calculates a stable, deterministic root identity fingerprint and safe filesystem metadata.
 * Does NOT perform recursive repository scanning.
 */
export function calculateSourceRootIdentity(
  canonicalPath: string,
  kind: ProjectSourceKind = 'LOCAL_DIRECTORY',
): SourceRootMetadata {
  const normalizedPath = path.normalize(canonicalPath);

  if (!fs.existsSync(normalizedPath)) {
    throw new InvalidDirectoryError(`Source root directory does not exist: "${normalizedPath}"`);
  }

  let stats: fs.Stats;
  try {
    stats = fs.statSync(normalizedPath);
  } catch (err: unknown) {
    throw new InvalidDirectoryError(
      `Failed to inspect source root: ${err instanceof Error ? err.message : 'Filesystem error'}`,
    );
  }

  if (!stats.isDirectory()) {
    throw new InvalidDirectoryError(`Path is not a directory: "${normalizedPath}"`);
  }

  // Derive initial display name
  let displayName = path.basename(normalizedPath);
  if (!displayName || displayName === '/' || displayName === '\\') {
    displayName = 'root';
  }

  // Safe timestamp derivation (platform-neutral)
  let filesystemCreatedAt: Date | null = null;
  if (stats.birthtime && stats.birthtime.getTime() > 0) {
    filesystemCreatedAt = stats.birthtime;
  } else if (stats.ctime && stats.ctime.getTime() > 0) {
    filesystemCreatedAt = stats.ctime;
  }

  const filesystemModifiedAt = stats.mtime && stats.mtime.getTime() > 0 ? stats.mtime : null;

  // Normalized identity payload for deterministic SHA-256 fingerprinting
  const identityPayload = {
    kind,
    canonicalPath: normalizedPath,
    dev: typeof stats.dev === 'number' ? stats.dev : 0,
    ino: typeof stats.ino === 'number' ? stats.ino : 0,
    birthtimeMs: filesystemCreatedAt ? filesystemCreatedAt.getTime() : null,
  };

  const identityFingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify(identityPayload))
    .digest('hex');

  const now = new Date();

  return {
    canonicalPath: normalizedPath,
    displayName,
    identityFingerprint,
    filesystemCreatedAt,
    filesystemModifiedAt,
    metadataRefreshedAt: now,
    isAccessible: true,
  };
}
