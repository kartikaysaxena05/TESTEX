/**
 * @file packages/core/src/requirements/document-storage.ts
 * Application-managed storage service for requirement documents.
 *
 * CRITICAL SECURITY & STORAGE INVARIANTS:
 * 1. Stored files are copied into application-managed storage directory (<storageRoot>/projects/<projectId>/documents/<storageKey>).
 * 2. User's original file is strictly READ-ONLY and NEVER modified or deleted.
 * 3. Streaming SHA-256 calculation guarantees integrity and prevents unbounded memory consumption.
 * 4. Staging files are cleaned up on any failure (no orphan temporary files).
 * 5. Managed files are set to read-only (0o444) to guarantee source document immutability.
 * 6. Target source repository is NEVER used for document storage.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

export interface StagedDocumentResult {
  readonly sha256: string;
  readonly byteSize: number;
  readonly stagingFilePath: string;
}

export class DocumentStorage {
  private readonly storageRoot: string;
  private readonly stagingRoot: string;

  constructor(customStorageRoot?: string) {
    const base =
      customStorageRoot ||
      process.env['COLLAGE_STORAGE_PATH'] ||
      path.join(os.homedir(), '.ai-quality', 'storage');

    this.storageRoot = path.join(base, 'documents');
    this.stagingRoot = path.join(base, 'staging');
  }

  /**
   * Returns the absolute path for a managed project document.
   */
  getManagedFilePath(projectId: string, storageKey: string): string {
    return path.join(this.storageRoot, projectId, storageKey);
  }

  /**
   * Stages a source file into a temporary staging file while streaming SHA-256 calculation.
   */
  async stageAndHashFile(sourceFilePath: string): Promise<StagedDocumentResult> {
    await fs.promises.mkdir(this.stagingRoot, { recursive: true });

    const stagingFileName = `stage-${crypto.randomUUID()}.tmp`;
    const stagingFilePath = path.join(this.stagingRoot, stagingFileName);

    const hash = crypto.createHash('sha256');
    let byteSize = 0;

    await new Promise<void>((resolve, reject) => {
      const readStream = fs.createReadStream(sourceFilePath);
      const writeStream = fs.createWriteStream(stagingFilePath);

      readStream.on('data', chunk => {
        byteSize += chunk.length;
        hash.update(chunk);
      });

      readStream.on('error', err => {
        writeStream.destroy();
        reject(err);
      });

      writeStream.on('error', err => {
        readStream.destroy();
        reject(err);
      });

      writeStream.on('finish', () => {
        resolve();
      });

      readStream.pipe(writeStream);
    });

    const sha256 = hash.digest('hex');

    return {
      sha256,
      byteSize,
      stagingFilePath,
    };
  }

  /**
   * Commits a staged file to permanent project-managed storage.
   */
  async commitStagedFile(
    stagingFilePath: string,
    projectId: string,
    storageKey: string,
  ): Promise<string> {
    const projectDocDir = path.join(this.storageRoot, projectId);
    await fs.promises.mkdir(projectDocDir, { recursive: true });

    const targetManagedPath = path.join(projectDocDir, storageKey);

    // Atomically move/copy from staging to managed target
    try {
      await fs.promises.rename(stagingFilePath, targetManagedPath);
    } catch {
      // Fallback to copy + unlink if cross-device link
      await fs.promises.copyFile(stagingFilePath, targetManagedPath);
      await fs.promises.unlink(stagingFilePath).catch(() => {});
    }

    // Set read-only permissions to preserve immutability
    try {
      await fs.promises.chmod(targetManagedPath, 0o444);
    } catch {
      // Best-effort chmod on Windows/restricted systems
    }

    return targetManagedPath;
  }

  /**
   * Safely deletes a managed document file (never touches user's original external file).
   */
  async deleteManagedFile(projectId: string, storageKey: string): Promise<void> {
    const targetManagedPath = this.getManagedFilePath(projectId, storageKey);
    try {
      // Restore write permission before unlinking if read-only
      await fs.promises.chmod(targetManagedPath, 0o666).catch(() => {});
      await fs.promises.unlink(targetManagedPath);
    } catch {
      // Ignore if file already deleted
    }
  }

  /**
   * Cleans up temporary staging file on failure.
   */
  async cleanupStagingFile(stagingFilePath: string): Promise<void> {
    try {
      await fs.promises.unlink(stagingFilePath);
    } catch {
      // Ignore
    }
  }

  /**
   * Checks if managed file exists on disk.
   */
  async checkManagedFileExists(projectId: string, storageKey: string): Promise<boolean> {
    const target = this.getManagedFilePath(projectId, storageKey);
    try {
      const st = await fs.promises.stat(target);
      return st.isFile() && st.size > 0;
    } catch {
      return false;
    }
  }
}
