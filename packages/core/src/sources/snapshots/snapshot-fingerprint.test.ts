import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotFingerprintCalculator } from './snapshot-fingerprint.js';

describe('SnapshotFingerprintCalculator Unit Tests', () => {
  it('should compute deterministic SHA-256 fingerprint regardless of input sorting order', () => {
    const listA = [
      { relativePath: 'src/main.ts', contentHash: 'hash1' },
      { relativePath: 'src/app.ts', contentHash: 'hash2' },
      { relativePath: 'package.json', contentHash: 'hash3' },
    ];

    const listB = [
      { relativePath: 'package.json', contentHash: 'hash3' },
      { relativePath: 'src/app.ts', contentHash: 'hash2' },
      { relativePath: 'src/main.ts', contentHash: 'hash1' },
    ];

    const fpA = SnapshotFingerprintCalculator.computeFingerprint(listA);
    const fpB = SnapshotFingerprintCalculator.computeFingerprint(listB);

    assert.strictEqual(fpA, fpB, 'Fingerprint must be independent of entry order');
    assert.strictEqual(fpA.length, 64, 'Must be a 64-character SHA-256 hex string');
  });

  it('should produce a different fingerprint when a single file hash changes', () => {
    const listA = [{ relativePath: 'src/main.ts', contentHash: 'hash1' }];
    const listB = [{ relativePath: 'src/main.ts', contentHash: 'hash2' }];

    const fpA = SnapshotFingerprintCalculator.computeFingerprint(listA);
    const fpB = SnapshotFingerprintCalculator.computeFingerprint(listB);

    assert.notStrictEqual(fpA, fpB);
  });
});
