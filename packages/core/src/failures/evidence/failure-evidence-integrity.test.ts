/**
 * @file packages/core/src/failures/evidence/failure-evidence-integrity.test.ts
 * Cryptographic and file-backed integrity validation tests (V6 Phase 75).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { EvidenceStorageService } from '../../execution/evidence/evidence-storage-service.js';
import { FailureEvidenceIntegrityVerifier } from './failure-evidence-integrity-verifier.js';

describe('FailureEvidenceIntegrityVerifier (Phase 75)', () => {
  let tempDir: string;
  let storageService: EvidenceStorageService;
  let verifier: FailureEvidenceIntegrityVerifier;

  const projectId = '11111111-1111-1111-1111-111111111111';
  const testRunId = '22222222-2222-2222-2222-222222222222';
  const executionId = '33333333-3333-3333-3333-333333333333';

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'evidence-integrity-test-'));
    storageService = new EvidenceStorageService(tempDir);
    verifier = new FailureEvidenceIntegrityVerifier(storageService);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup best effort
    }
  });

  it('validates a correct artifact file with exact SHA-256 match', async () => {
    const fileContent = Buffer.from('console log data test content 12345');
    const sha256 = crypto.createHash('sha256').update(fileContent).digest('hex');

    const executionDir = path.join(
      tempDir,
      'execution-evidence',
      projectId,
      testRunId,
      executionId,
    );
    await fs.mkdir(executionDir, { recursive: true });

    const storageIdentity = 'console_log_001.txt';
    const filePath = path.join(executionDir, storageIdentity);
    await fs.writeFile(filePath, fileContent);

    const report = await verifier.verifyReference({
      id: 'ref-1',
      projectId,
      testRunId,
      executionId,
      storageIdentity,
      logicalName: 'console.log',
      artifactType: 'CONSOLE_LOG',
      byteSize: fileContent.length,
      sha256,
    });

    assert.equal(report.status, 'VERIFIED');
    assert.equal(report.details, null);
  });

  it('detects SHA-256 digest mismatch when file bytes have been altered', async () => {
    const originalContent = Buffer.from('original unaltered evidence');
    const alteredContent = Buffer.from('tampered malicious evidence content');
    const expectedSha256 = crypto.createHash('sha256').update(originalContent).digest('hex');

    const executionDir = path.join(
      tempDir,
      'execution-evidence',
      projectId,
      testRunId,
      executionId,
    );
    await fs.mkdir(executionDir, { recursive: true });

    const storageIdentity = 'tampered_artifact.txt';
    const filePath = path.join(executionDir, storageIdentity);
    await fs.writeFile(filePath, alteredContent);

    const report = await verifier.verifyReference({
      id: 'ref-tampered',
      projectId,
      testRunId,
      executionId,
      storageIdentity,
      logicalName: 'audit.txt',
      artifactType: 'CONSOLE_LOG',
      byteSize: alteredContent.length,
      sha256: expectedSha256, // Stored hash is for original content
    });

    assert.equal(report.status, 'MISMATCH');
    assert.ok(report.details?.includes('SHA-256 digest mismatch'));
  });

  it('returns MISSING when evidence file is absent from disk', async () => {
    const report = await verifier.verifyReference({
      id: 'ref-missing',
      projectId,
      testRunId,
      executionId,
      storageIdentity: 'non_existent_file.png',
      logicalName: 'missing.png',
      artifactType: 'SCREENSHOT',
      byteSize: 1024,
      sha256: 'deadbeef1234',
    });

    assert.equal(report.status, 'MISSING');
    assert.ok(report.details?.includes('missing from managed storage'));
  });

  it('returns CORRUPT when storage identity attempts illegal path traversal', async () => {
    const report = await verifier.verifyReference({
      id: 'ref-traversal',
      projectId,
      testRunId,
      executionId,
      storageIdentity: '../../../../etc/passwd',
      logicalName: 'passwd',
      artifactType: 'CONSOLE_LOG',
    });

    assert.equal(report.status, 'CORRUPT');
    assert.ok(report.details?.includes('Integrity check failed'));
  });

  it('verifies batch of mixed evidence references and aggregates overall status truthfully', async () => {
    const fileContent = Buffer.from('screenshot bytes mock');
    const validSha = crypto.createHash('sha256').update(fileContent).digest('hex');

    const executionDir = path.join(
      tempDir,
      'execution-evidence',
      projectId,
      testRunId,
      executionId,
    );
    await fs.mkdir(executionDir, { recursive: true });
    await fs.writeFile(path.join(executionDir, 'valid.png'), fileContent);

    const refs = [
      {
        id: 'ref-valid',
        projectId,
        testRunId,
        executionId,
        storageIdentity: 'valid.png',
        logicalName: 'valid.png',
        artifactType: 'SCREENSHOT',
        sha256: validSha,
      },
      {
        id: 'ref-missing',
        projectId,
        testRunId,
        executionId,
        storageIdentity: 'missing.png',
        logicalName: 'missing.png',
        artifactType: 'SCREENSHOT',
        sha256: 'some-hash',
      },
    ];

    const batch = await verifier.verifyBatch(projectId, 'case-123', refs);
    assert.equal(batch.overallIntegrity, 'MISSING');
    assert.equal(batch.itemsVerified, 1);
    assert.equal(batch.itemsMissing, 1);
    assert.equal(batch.itemsCorrupt, 0);
  });
});
