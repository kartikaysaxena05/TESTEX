import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { DocumentStorage } from './document-storage.js';

describe('DocumentStorage Unit Tests', () => {
  let tempStorageDir: string;
  let documentStorage: DocumentStorage;

  before(async () => {
    tempStorageDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'doc-storage-test-'));
    documentStorage = new DocumentStorage(tempStorageDir);
  });

  after(async () => {
    try {
      await fs.promises.rm(tempStorageDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('should stream-stage file, calculate exact SHA-256 hash and byte size', async () => {
    const originalFile = path.join(tempStorageDir, 'original-spec.txt');
    const content = 'Requirement 1: Secure Ingestion\nRequirement 2: Immutability';
    await fs.promises.writeFile(originalFile, content, 'utf8');

    const expectedSha256 = crypto.createHash('sha256').update(content).digest('hex');

    const staged = await documentStorage.stageAndHashFile(originalFile);
    assert.equal(staged.sha256, expectedSha256);
    assert.equal(staged.byteSize, Buffer.byteLength(content));
    assert.ok(fs.existsSync(staged.stagingFilePath));

    // Verify original file was not modified
    const originalAfter = await fs.promises.readFile(originalFile, 'utf8');
    assert.equal(originalAfter, content);

    // Clean up staged file
    await documentStorage.cleanupStagingFile(staged.stagingFilePath);
    assert.ok(!fs.existsSync(staged.stagingFilePath));
  });

  it('should commit staged file to permanent managed storage', async () => {
    const originalFile = path.join(tempStorageDir, 'sample-srs.txt');
    await fs.promises.writeFile(originalFile, 'SRS Content for project commit', 'utf8');

    const staged = await documentStorage.stageAndHashFile(originalFile);
    const projectId = 'proj-12345';
    const storageKey = 'doc-abcde.txt';

    const managedPath = await documentStorage.commitStagedFile(
      staged.stagingFilePath,
      projectId,
      storageKey,
    );

    assert.ok(fs.existsSync(managedPath));
    assert.ok(!fs.existsSync(staged.stagingFilePath)); // Staged file moved

    const managedExists = await documentStorage.checkManagedFileExists(projectId, storageKey);
    assert.equal(managedExists, true);

    // Delete managed file and ensure it is removed
    await documentStorage.deleteManagedFile(projectId, storageKey);
    const managedExistsAfter = await documentStorage.checkManagedFileExists(projectId, storageKey);
    assert.equal(managedExistsAfter, false);

    // Original file still intact
    assert.ok(fs.existsSync(originalFile));
  });
});
