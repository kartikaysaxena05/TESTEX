import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { validateDirectoryPath, checkPathAvailability } from './source-path-validation.js';
import { InvalidDirectoryError, DirectoryNotFoundError } from './source-errors.js';

describe('Source Path Validation Unit Tests', () => {
  let tempDir: string;
  let sampleProjectDir: string;
  let sampleFile: string;
  let symlinkDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-val-test-'));
    sampleProjectDir = path.join(tempDir, 'my-sample-app');
    fs.mkdirSync(sampleProjectDir, { recursive: true });

    sampleFile = path.join(tempDir, 'sample-file.txt');
    fs.writeFileSync(sampleFile, 'hello world', 'utf-8');

    symlinkDir = path.join(tempDir, 'symlinked-app');
    try {
      fs.symlinkSync(sampleProjectDir, symlinkDir, 'dir');
    } catch {
      // Symlinks may not be supported on all test environments, handled gracefully
    }
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('should successfully validate an existing absolute directory', () => {
    const result = validateDirectoryPath(sampleProjectDir);
    assert.strictEqual(result.displayName, 'my-sample-app');
    assert.strictEqual(result.canonicalPath, fs.realpathSync(sampleProjectDir));
  });

  it('should resolve symlinked directories to their canonical real path', () => {
    if (fs.existsSync(symlinkDir)) {
      const result = validateDirectoryPath(symlinkDir);
      assert.strictEqual(result.displayName, 'my-sample-app');
      assert.strictEqual(result.canonicalPath, fs.realpathSync(sampleProjectDir));
    }
  });

  it('should reject relative directory paths', () => {
    assert.throws(() => validateDirectoryPath('./relative/path'), InvalidDirectoryError);
  });

  it('should reject empty or whitespace-only paths', () => {
    assert.throws(() => validateDirectoryPath('   '), InvalidDirectoryError);
    assert.throws(() => validateDirectoryPath(''), InvalidDirectoryError);
  });

  it('should throw DirectoryNotFoundError for non-existent paths', () => {
    const missingPath = path.join(tempDir, 'does-not-exist');
    assert.throws(() => validateDirectoryPath(missingPath), DirectoryNotFoundError);
  });

  it('should throw InvalidDirectoryError if the path points to a file instead of a directory', () => {
    assert.throws(() => validateDirectoryPath(sampleFile), InvalidDirectoryError);
  });

  it('should check path availability accurately without throwing', () => {
    assert.strictEqual(checkPathAvailability(sampleProjectDir), true);
    assert.strictEqual(checkPathAvailability(sampleFile), false);
    assert.strictEqual(checkPathAvailability(path.join(tempDir, 'non-existent')), false);
    assert.strictEqual(checkPathAvailability(''), false);
  });
});
