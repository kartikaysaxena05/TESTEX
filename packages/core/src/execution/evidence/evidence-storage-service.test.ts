/**
 * @file packages/core/src/execution/evidence/evidence-storage-service.test.ts
 * Unit tests for EvidenceStorageService (V5 Phase 69).
 * Tests safe path resolution, path traversal defense, streaming SHA-256, read-only permissions, and tampering detection.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { EvidenceStorageService } from './evidence-storage-service.js';
import {
  EvidencePathTraversalError,
  EvidenceSizeLimitExceededError,
  EvidenceInvalidMimeTypeError,
  EvidenceIntegrityMismatchError,
} from './evidence-errors.js';

describe('EvidenceStorageService Unit & Security Tests (V5 Phase 69)', () => {
  let tempStorageDir: string;
  let service: EvidenceStorageService;

  const testProjectId = crypto.randomUUID();
  const testRunId = crypto.randomUUID();
  const testExecutionId = crypto.randomUUID();

  beforeEach(async () => {
    tempStorageDir = path.join(os.tmpdir(), `evidence-test-${crypto.randomUUID()}`);
    await fs.mkdir(tempStorageDir, { recursive: true });
    service = new EvidenceStorageService(tempStorageDir);
  });

  afterEach(async () => {
    try {
      if (fsSync.existsSync(tempStorageDir)) {
        await fs.rm(tempStorageDir, { recursive: true, force: true });
      }
    } catch {
      // Ignored
    }
  });

  describe('1. Path Traversal & Path Injection Protection', () => {
    it('rejects path traversal sequences in projectId, testRunId, executionId, and storageIdentity', () => {
      const maliciousInputs = [
        '../secret.txt',
        '..\\..\\secret.txt',
        '/etc/passwd',
        'C:\\Windows\\system.ini',
        'nested/../../escape',
        '%2e%2e/evil',
        '%2E%2E/evil',
        'foo\0bar',
        'foo:bar',
        '',
      ];

      for (const malicious of maliciousInputs) {
        assert.throws(
          () => service.resolveManagedPath(malicious, testRunId, testExecutionId, 'art_123.png'),
          (err: unknown) => err instanceof EvidencePathTraversalError,
        );

        assert.throws(
          () =>
            service.resolveManagedPath(testProjectId, malicious, testExecutionId, 'art_123.png'),
          (err: unknown) => err instanceof EvidencePathTraversalError,
        );

        assert.throws(
          () => service.resolveManagedPath(testProjectId, testRunId, malicious, 'art_123.png'),
          (err: unknown) => err instanceof EvidencePathTraversalError,
        );

        assert.throws(
          () => service.resolveManagedPath(testProjectId, testRunId, testExecutionId, malicious),
          (err: unknown) => err instanceof EvidencePathTraversalError,
        );
      }
    });

    it('resolves safe canonical managed path within application evidence root', () => {
      const resolved = service.resolveManagedPath(
        testProjectId,
        testRunId,
        testExecutionId,
        'art_valid-identity-123.png',
      );

      assert.ok(resolved.startsWith(path.join(tempStorageDir, 'execution-evidence')));
      assert.ok(resolved.endsWith('art_valid-identity-123.png'));
    });
  });

  describe('2. Staging, SHA-256 Calculation & Byte Sizing', () => {
    it('stages string content while computing cryptographic SHA-256 and byte size', async () => {
      const content = 'Console error log output: Uncaught TypeError in main.js';
      const expectedHash = crypto.createHash('sha256').update(content).digest('hex');

      const staged = await service.stageArtifact({
        projectId: testProjectId,
        testRunId,
        executionId: testExecutionId,
        content,
        mimeType: 'text/plain',
        originalLogicalName: 'console.log',
      });

      assert.ok(staged.stagingFilePath);
      assert.ok(staged.storageIdentity.startsWith('art_'));
      assert.ok(staged.storageIdentity.endsWith('.log') || staged.storageIdentity.endsWith('.txt'));
      assert.equal(staged.byteSize, Buffer.byteLength(content, 'utf-8'));
      assert.equal(staged.sha256, expectedHash);
      assert.equal(staged.mimeType, 'text/plain');

      // Verify staged file exists on disk
      assert.equal(fsSync.existsSync(staged.stagingFilePath), true);

      // Cleanup
      await service.cleanupStagingFile(staged.stagingFilePath);
      assert.equal(fsSync.existsSync(staged.stagingFilePath), false);
    });

    it('stages binary Buffer content accurately', async () => {
      const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG magic bytes
      const expectedHash = crypto.createHash('sha256').update(binaryData).digest('hex');

      const staged = await service.stageArtifact({
        projectId: testProjectId,
        testRunId,
        executionId: testExecutionId,
        content: binaryData,
        mimeType: 'image/png',
        originalLogicalName: 'failure_screenshot.png',
      });

      assert.equal(staged.byteSize, 8);
      assert.equal(staged.sha256, expectedHash);
      assert.ok(staged.storageIdentity.endsWith('.png'));

      await service.cleanupStagingFile(staged.stagingFilePath);
    });

    it('rejects oversized content exceeding MAX_ARTIFACT_BYTE_SIZE with EvidenceSizeLimitExceededError', async () => {
      const oversizedBuffer = Buffer.alloc(50 * 1024 * 1024 + 1); // 50MB + 1 byte
      await assert.rejects(
        async () => {
          await service.stageArtifact({
            projectId: testProjectId,
            testRunId,
            executionId: testExecutionId,
            content: oversizedBuffer,
            mimeType: 'application/octet-stream',
            originalLogicalName: 'oversized.bin',
          });
        },
        (err: unknown) => err instanceof EvidenceSizeLimitExceededError,
      );
    });

    it('rejects unauthorized MIME types with EvidenceInvalidMimeTypeError', async () => {
      await assert.rejects(
        async () => {
          await service.stageArtifact({
            projectId: testProjectId,
            testRunId,
            executionId: testExecutionId,
            content: 'malicious payload',
            mimeType: 'application/x-msdownload',
            originalLogicalName: 'malware.exe',
          });
        },
        (err: unknown) => err instanceof EvidenceInvalidMimeTypeError,
      );
    });
  });

  describe('3. Atomic Promotion & Forensic Immutability (0o444)', () => {
    it('promotes staged artifact to managed destination and applies read-only permissions', async () => {
      const content = JSON.stringify({ error: 'Network 500 Internal Server Error' });
      const staged = await service.stageArtifact({
        projectId: testProjectId,
        testRunId,
        executionId: testExecutionId,
        content,
        mimeType: 'application/json',
        originalLogicalName: 'network-details.json',
      });

      const managedPath = await service.promoteStagedArtifact(
        staged.stagingFilePath,
        testProjectId,
        testRunId,
        testExecutionId,
        staged.storageIdentity,
      );

      assert.equal(fsSync.existsSync(staged.stagingFilePath), false);
      assert.equal(fsSync.existsSync(managedPath), true);

      // Verify file mode (read-only)
      const stat = await fs.stat(managedPath);
      // On POSIX systems, 0o444 ensures read-only (no write bits)
      assert.equal((stat.mode & 0o222) === 0, true);
    });
  });

  describe('4. Read Verification & Tamper Detection', () => {
    it('reads artifact successfully when SHA-256 hash matches', async () => {
      const content = 'DOM Snapshot content: <button id="submit">Submit</button>';
      const staged = await service.stageArtifact({
        projectId: testProjectId,
        testRunId,
        executionId: testExecutionId,
        content,
        mimeType: 'text/html',
        originalLogicalName: 'dom.html',
      });

      await service.promoteStagedArtifact(
        staged.stagingFilePath,
        testProjectId,
        testRunId,
        testExecutionId,
        staged.storageIdentity,
      );

      const readResult = await service.readArtifact({
        projectId: testProjectId,
        testRunId,
        executionId: testExecutionId,
        storageIdentity: staged.storageIdentity,
        expectedSha256: staged.sha256,
      });

      assert.equal(readResult.buffer.toString('utf-8'), content);
      assert.equal(readResult.byteSize, Buffer.byteLength(content, 'utf-8'));
      assert.equal(readResult.sha256, staged.sha256);
    });

    it('detects byte-level tampering and throws EvidenceIntegrityMismatchError', async () => {
      const content = 'Original untampered error log';
      const staged = await service.stageArtifact({
        projectId: testProjectId,
        testRunId,
        executionId: testExecutionId,
        content,
        mimeType: 'text/plain',
        originalLogicalName: 'tamper-test.log',
      });

      const managedPath = await service.promoteStagedArtifact(
        staged.stagingFilePath,
        testProjectId,
        testRunId,
        testExecutionId,
        staged.storageIdentity,
      );

      // Tamper with bytes directly on disk
      await fs.chmod(managedPath, 0o644);
      await fs.writeFile(managedPath, 'Tampered modified content!');
      await fs.chmod(managedPath, 0o444);

      // Attempt read with expected SHA-256
      await assert.rejects(
        async () => {
          await service.readArtifact({
            projectId: testProjectId,
            testRunId,
            executionId: testExecutionId,
            storageIdentity: staged.storageIdentity,
            expectedSha256: staged.sha256,
          });
        },
        (err: unknown) => err instanceof EvidenceIntegrityMismatchError,
      );

      // Verify integrity check method also returns isValid: false
      const integrityCheck = await service.verifyArtifactIntegrity({
        projectId: testProjectId,
        testRunId,
        executionId: testExecutionId,
        storageIdentity: staged.storageIdentity,
        expectedSha256: staged.sha256,
      });

      assert.equal(integrityCheck.isValid, false);
      assert.notEqual(integrityCheck.actualSha256, staged.sha256);
    });
  });

  describe('5. Safe Deletion Primitives', () => {
    it('deletes specific artifact file and entire execution directory cleanly', async () => {
      const staged1 = await service.stageArtifact({
        projectId: testProjectId,
        testRunId,
        executionId: testExecutionId,
        content: 'File 1',
        mimeType: 'text/plain',
        originalLogicalName: 'f1.txt',
      });
      await service.promoteStagedArtifact(
        staged1.stagingFilePath,
        testProjectId,
        testRunId,
        testExecutionId,
        staged1.storageIdentity,
      );

      const staged2 = await service.stageArtifact({
        projectId: testProjectId,
        testRunId,
        executionId: testExecutionId,
        content: 'File 2',
        mimeType: 'text/plain',
        originalLogicalName: 'f2.txt',
      });
      await service.promoteStagedArtifact(
        staged2.stagingFilePath,
        testProjectId,
        testRunId,
        testExecutionId,
        staged2.storageIdentity,
      );

      // Delete file 1
      const deleted1 = await service.deleteArtifactFile(
        testProjectId,
        testRunId,
        testExecutionId,
        staged1.storageIdentity,
      );
      assert.equal(deleted1, true);

      // Delete entire execution directory
      const deletedDir = await service.deleteExecutionDirectory(
        testProjectId,
        testRunId,
        testExecutionId,
      );
      assert.equal(deletedDir, true);

      const dirPath = service.resolveManagedPath(
        testProjectId,
        testRunId,
        testExecutionId,
        'f2.txt',
      );
      assert.equal(fsSync.existsSync(path.dirname(dirPath)), false);
    });
  });
});
