import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { calculateSourceRootIdentity } from './source-identity.js';
import { InvalidDirectoryError } from './source-errors.js';

describe('Source Identity & Root Metadata Unit Tests', () => {
  let tempDir: string;
  let dirA: string;
  let dirB: string;
  let sampleFile: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-id-test-'));
    dirA = path.join(tempDir, 'project-alpha');
    dirB = path.join(tempDir, 'project-beta');
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });

    sampleFile = path.join(tempDir, 'not-a-dir.txt');
    fs.writeFileSync(sampleFile, 'test file content', 'utf-8');
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should calculate deterministic fingerprint for the same directory root', () => {
    const identity1 = calculateSourceRootIdentity(dirA);
    const identity2 = calculateSourceRootIdentity(dirA);

    assert.strictEqual(identity1.identityFingerprint, identity2.identityFingerprint);
    assert.strictEqual(identity1.canonicalPath, path.normalize(dirA));
    assert.strictEqual(identity1.displayName, 'project-alpha');
    assert.strictEqual(identity1.isAccessible, true);
    assert.ok(
      identity1.identityFingerprint.length === 64,
      'SHA-256 hex string must be 64 characters',
    );
  });

  it('should calculate distinct fingerprints for different directory roots', () => {
    const identityA = calculateSourceRootIdentity(dirA);
    const identityB = calculateSourceRootIdentity(dirB);

    assert.notStrictEqual(identityA.identityFingerprint, identityB.identityFingerprint);
    assert.strictEqual(identityA.displayName, 'project-alpha');
    assert.strictEqual(identityB.displayName, 'project-beta');
  });

  it('should safely extract root directory timestamps without error', () => {
    const identity = calculateSourceRootIdentity(dirA);
    assert.ok(identity.metadataRefreshedAt instanceof Date);
    if (identity.filesystemModifiedAt) {
      assert.ok(identity.filesystemModifiedAt instanceof Date);
    }
    if (identity.filesystemCreatedAt) {
      assert.ok(identity.filesystemCreatedAt instanceof Date);
    }
  });

  it('should throw InvalidDirectoryError if target path is a regular file', () => {
    assert.throws(() => calculateSourceRootIdentity(sampleFile), InvalidDirectoryError);
  });

  it('should throw InvalidDirectoryError if target path does not exist', () => {
    const nonExistent = path.join(tempDir, 'missing-folder');
    assert.throws(() => calculateSourceRootIdentity(nonExistent), InvalidDirectoryError);
  });
});
