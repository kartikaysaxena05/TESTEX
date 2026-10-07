/**
 * @file packages/core/src/execution/evidence/evidence-storage-service.ts
 * Application-managed filesystem storage service for execution evidence artifacts.
 *
 * CRITICAL SECURITY & STORAGE INVARIANTS:
 * 1. Storage files are kept in application-managed directory (<evidenceRoot>/<projectId>/<runId>/<executionId>/<storageIdentity>).
 * 2. Client-supplied filenames and paths are NEVER trusted for storage locations. Storage identities are backend UUID tokens.
 * 3. Path traversal attacks (../, \.., /absolute, %2e%2e, null bytes) are strictly validated and rejected.
 * 4. Staging files are used during write, computing SHA-256 and byte counts, with guaranteed cleanup on any failure.
 * 5. Finalized evidence artifacts are set to read-only (0o444) for forensic immutability.
 * 6. Cryptographic SHA-256 integrity verification detects tampering/corruption on read.
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as os from 'node:os';
import {
  EVIDENCE_BOUNDS,
  ALLOWED_EVIDENCE_MIME_TYPES,
  type IEvidenceStorageService,
  type StageArtifactInput,
  type StagedArtifactResult,
} from './evidence-types.js';
import {
  EvidenceDomainError,
  EvidencePathTraversalError,
  EvidenceSizeLimitExceededError,
  EvidenceInvalidMimeTypeError,
  EvidenceStorageError,
  EvidenceIntegrityMismatchError,
} from './evidence-errors.js';
import type { ILogger } from '../../logging/index.js';

export class EvidenceStorageService implements IEvidenceStorageService {
  private readonly evidenceRoot: string;
  private readonly stagingRoot: string;
  private readonly logger?: ILogger;

  constructor(customStorageRoot?: string, logger?: ILogger) {
    const base =
      customStorageRoot ||
      process.env['AI_QUALITY_EVIDENCE_STORAGE_PATH'] ||
      process.env['COLLAGE_STORAGE_PATH'] ||
      path.join(os.homedir(), '.ai-quality', 'storage');

    this.evidenceRoot = path.resolve(path.join(base, 'execution-evidence'));
    this.stagingRoot = path.resolve(path.join(base, 'staging', 'evidence'));
    this.logger = logger;
  }

  /**
   * Resolves and strictly validates that path components remain within the application-managed storage root.
   */
  public resolveManagedPath(
    projectId: string,
    testRunId: string,
    executionId: string,
    storageIdentity: string,
  ): string {
    this.validatePathSegment('projectId', projectId);
    this.validatePathSegment('testRunId', testRunId);
    this.validatePathSegment('executionId', executionId);
    this.validatePathSegment('storageIdentity', storageIdentity);

    const resolved = path.resolve(
      this.evidenceRoot,
      projectId,
      testRunId,
      executionId,
      storageIdentity,
    );

    // Verify resolved path strictly starts within evidenceRoot
    if (!resolved.startsWith(this.evidenceRoot)) {
      throw new EvidencePathTraversalError(storageIdentity);
    }

    return resolved;
  }

  /**
   * Stages incoming content to a temporary file while streaming SHA-256 and byte counts.
   */
  public async stageArtifact(input: StageArtifactInput): Promise<StagedArtifactResult> {
    this.validatePathSegment('projectId', input.projectId);
    this.validatePathSegment('testRunId', input.testRunId);
    this.validatePathSegment('executionId', input.executionId);

    // Validate MIME type
    const normalizedMime = (input.mimeType || '').trim().toLowerCase();
    if (!ALLOWED_EVIDENCE_MIME_TYPES.has(normalizedMime)) {
      throw new EvidenceInvalidMimeTypeError(input.mimeType);
    }

    await fs.mkdir(this.stagingRoot, { recursive: true });

    // Generate safe storage identity token
    const uniqueToken = crypto.randomUUID();
    const ext = this.resolveSafeExtension(input.originalLogicalName, normalizedMime);
    const storageIdentity = `art_${uniqueToken}${ext}`;

    const stagingFileName = `stage_${uniqueToken}.tmp`;
    const stagingFilePath = path.join(this.stagingRoot, stagingFileName);

    let byteSize = 0;
    const hash = crypto.createHash('sha256');

    try {
      if (typeof input.content === 'string') {
        const buffer = Buffer.from(input.content, 'utf-8');
        byteSize = buffer.length;
        if (byteSize > EVIDENCE_BOUNDS.MAX_ARTIFACT_BYTE_SIZE) {
          throw new EvidenceSizeLimitExceededError(
            byteSize,
            EVIDENCE_BOUNDS.MAX_ARTIFACT_BYTE_SIZE,
          );
        }
        hash.update(buffer);
        await fs.writeFile(stagingFilePath, buffer);
      } else {
        const buffer = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content);
        byteSize = buffer.length;
        if (byteSize > EVIDENCE_BOUNDS.MAX_ARTIFACT_BYTE_SIZE) {
          throw new EvidenceSizeLimitExceededError(
            byteSize,
            EVIDENCE_BOUNDS.MAX_ARTIFACT_BYTE_SIZE,
          );
        }
        hash.update(buffer);
        await fs.writeFile(stagingFilePath, buffer);
      }

      const sha256 = hash.digest('hex');

      return {
        stagingFilePath,
        storageIdentity,
        byteSize,
        sha256,
        mimeType: normalizedMime,
      };
    } catch (err) {
      // Clean up staging on any failure
      await this.cleanupStagingFile(stagingFilePath).catch(() => {});
      if (err instanceof EvidenceDomainError) {
        throw err;
      }
      throw new EvidenceStorageError(
        `Failed to stage evidence artifact: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  /**
   * Promotes a staged artifact file to the final managed storage location with read-only permissions (0o444).
   */
  public async promoteStagedArtifact(
    stagingFilePath: string,
    projectId: string,
    testRunId: string,
    executionId: string,
    storageIdentity: string,
  ): Promise<string> {
    const destinationPath = this.resolveManagedPath(
      projectId,
      testRunId,
      executionId,
      storageIdentity,
    );

    try {
      // Ensure destination directory exists
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });

      // Move from staging to managed location
      await fs.rename(stagingFilePath, destinationPath).catch(async () => {
        // Fallback to copy & unlink across filesystems/devices
        await fs.copyFile(stagingFilePath, destinationPath);
        await fs.unlink(stagingFilePath);
      });

      // Set file to read-only (0o444) for forensic immutability
      await fs.chmod(destinationPath, 0o444).catch(() => {});

      return destinationPath;
    } catch (err) {
      await this.cleanupStagingFile(stagingFilePath).catch(() => {});
      throw new EvidenceStorageError(
        `Failed to promote staged artifact to managed storage: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  /**
   * Cleans up temporary staging file if an operation fails or rolls back.
   */
  public async cleanupStagingFile(stagingFilePath: string): Promise<void> {
    try {
      if (stagingFilePath && fsSync.existsSync(stagingFilePath)) {
        await fs.unlink(stagingFilePath);
      }
    } catch {
      // Ignored
    }
  }

  /**
   * Reads an artifact from managed storage, optionally validating its expected SHA-256 hash.
   */
  public async readArtifact(input: {
    readonly projectId: string;
    readonly testRunId: string;
    readonly executionId: string;
    readonly storageIdentity: string;
    readonly expectedSha256?: string;
  }): Promise<{ readonly buffer: Buffer; readonly byteSize: number; readonly sha256: string }> {
    const filePath = this.resolveManagedPath(
      input.projectId,
      input.testRunId,
      input.executionId,
      input.storageIdentity,
    );

    try {
      const buffer = await fs.readFile(filePath);
      const actualSha256 = crypto.createHash('sha256').update(buffer).digest('hex');

      if (input.expectedSha256 && actualSha256 !== input.expectedSha256) {
        throw new EvidenceIntegrityMismatchError(
          input.storageIdentity,
          input.expectedSha256,
          actualSha256,
        );
      }

      return {
        buffer,
        byteSize: buffer.length,
        sha256: actualSha256,
      };
    } catch (err) {
      if (err instanceof EvidenceDomainError) {
        throw err;
      }
      throw new EvidenceStorageError(
        `Failed to read evidence artifact '${input.storageIdentity}': ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  /**
   * Verifies the cryptographic SHA-256 integrity of a stored artifact.
   */
  public async verifyArtifactIntegrity(input: {
    readonly projectId: string;
    readonly testRunId: string;
    readonly executionId: string;
    readonly storageIdentity: string;
    readonly expectedSha256: string;
  }): Promise<{
    readonly isValid: boolean;
    readonly expectedSha256: string;
    readonly actualSha256: string;
    readonly byteSize: number;
  }> {
    const filePath = this.resolveManagedPath(
      input.projectId,
      input.testRunId,
      input.executionId,
      input.storageIdentity,
    );

    try {
      const buffer = await fs.readFile(filePath);
      const actualSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      const isValid = actualSha256 === input.expectedSha256;

      return {
        isValid,
        expectedSha256: input.expectedSha256,
        actualSha256,
        byteSize: buffer.length,
      };
    } catch (err) {
      throw new EvidenceStorageError(
        `Failed to verify evidence artifact integrity: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  /**
   * Deletes an artifact file from managed storage.
   */
  public async deleteArtifactFile(
    projectId: string,
    testRunId: string,
    executionId: string,
    storageIdentity: string,
  ): Promise<boolean> {
    const filePath = this.resolveManagedPath(projectId, testRunId, executionId, storageIdentity);

    try {
      if (fsSync.existsSync(filePath)) {
        // Change permissions back to writable before removing
        await fs.chmod(filePath, 0o644).catch(() => {});
        await fs.unlink(filePath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Deletes all artifact files for an execution directory.
   */
  public async deleteExecutionDirectory(
    projectId: string,
    testRunId: string,
    executionId: string,
  ): Promise<boolean> {
    this.validatePathSegment('projectId', projectId);
    this.validatePathSegment('testRunId', testRunId);
    this.validatePathSegment('executionId', executionId);

    const dirPath = path.resolve(this.evidenceRoot, projectId, testRunId, executionId);
    if (!dirPath.startsWith(this.evidenceRoot)) {
      throw new EvidencePathTraversalError(executionId);
    }

    try {
      if (fsSync.existsSync(dirPath)) {
        await fs.rm(dirPath, { recursive: true, force: true });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Strictly validates path segments against directory traversal attacks and invalid characters.
   */
  private validatePathSegment(name: string, value: string): void {
    if (!value || typeof value !== 'string') {
      throw new EvidencePathTraversalError(`Empty or missing ${name}`);
    }

    const trimmed = value.trim();
    if (
      trimmed.includes('..') ||
      trimmed.includes('/') ||
      trimmed.includes('\\') ||
      trimmed.includes('\0') ||
      trimmed.includes('%2e%2e') ||
      trimmed.includes('%2E%2E') ||
      trimmed.includes(':') ||
      path.isAbsolute(trimmed)
    ) {
      throw new EvidencePathTraversalError(`${name}: '${value}'`);
    }
  }

  /**
   * Derives a safe file extension from logical name or MIME type.
   */
  private resolveSafeExtension(logicalName: string, mimeType: string): string {
    const parsedExt = path
      .extname(logicalName || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (parsedExt && parsedExt.length <= 8) {
      return `.${parsedExt}`;
    }

    switch (mimeType) {
      case 'image/png':
        return '.png';
      case 'image/jpeg':
        return '.jpg';
      case 'image/webp':
        return '.webp';
      case 'application/zip':
        return '.zip';
      case 'application/json':
        return '.json';
      case 'text/plain':
        return '.txt';
      case 'text/html':
        return '.html';
      case 'text/csv':
        return '.csv';
      case 'application/pdf':
        return '.pdf';
      case 'video/webm':
        return '.webm';
      case 'video/mp4':
        return '.mp4';
      default:
        return '.bin';
    }
  }
}
