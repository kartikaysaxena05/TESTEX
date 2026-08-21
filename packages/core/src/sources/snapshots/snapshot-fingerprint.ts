/**
 * @file packages/core/src/sources/snapshots/snapshot-fingerprint.ts
 * Deterministic aggregate SHA-256 fingerprint calculator over sorted repository snapshot files.
 */

import crypto from 'node:crypto';

export interface FingerprintEntry {
  readonly relativePath: string;
  readonly contentHash: string | null;
}

export class SnapshotFingerprintCalculator {
  /**
   * Computes a deterministic SHA-256 fingerprint of the snapshot files regardless of input order.
   */
  static computeFingerprint(entries: readonly FingerprintEntry[]): string {
    const sorted = [...entries].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const hash = crypto.createHash('sha256');

    for (const entry of sorted) {
      hash.update(`${entry.relativePath}:${entry.contentHash ?? ''}\n`, 'utf-8');
    }

    return hash.digest('hex');
  }
}
