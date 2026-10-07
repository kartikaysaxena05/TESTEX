/**
 * @file packages/core/src/git-repositories/repository-importer.ts
 * Atomic, bounds-checked repository source importer with staging promotion and rollback.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { RepositoryImportResultDto, RepositoryImportStatus } from '@ai-quality/contracts';
import {
  ImportSafetyValidator,
  IMPORT_SAFETY_LIMITS,
} from './import-safety-validator.js';
import {
  RepositoryImportError,
  RepositoryImportCancelledError,
  RepositoryImportTimeoutError,
} from './git-repository-errors.js';
import type { DownloadedFileEntry } from './git-provider-client.js';

export interface RepositoryImportOptions {
  readonly projectId: string;
  readonly connectionId: string;
  readonly branch: string;
  readonly revision: string;
  readonly files: readonly DownloadedFileEntry[];
  readonly storageRoot?: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export class RepositoryImporter {
  private readonly defaultStorageRoot: string;

  constructor(customStorageRoot?: string) {
    this.defaultStorageRoot =
      customStorageRoot ??
      process.env.PLATFORM_REPOSITORY_STORAGE_PATH ??
      path.join(os.homedir(), '.ai-quality-platform', 'repositories');
  }

  /**
   * Resolves the canonical directory path where a project's repository is stored.
   */
  public resolveRepositoryPath(projectId: string, connectionId: string): string {
    return path.join(this.defaultStorageRoot, 'projects', projectId, connectionId);
  }

  /**
   * Atomically imports files into the target repository directory with staging, bounds checking, and rollback.
   */
  public async importFiles(options: RepositoryImportOptions): Promise<RepositoryImportResultDto> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? IMPORT_SAFETY_LIMITS.DEFAULT_TIMEOUT_MS;
    const targetDir = this.resolveRepositoryPath(options.projectId, options.connectionId);
    const parentDir = path.dirname(targetDir);
    const stagingDir = `${targetDir}.staging.${Date.now()}`;

    // Verify cancellation before starting
    if (options.signal?.aborted) {
      throw new RepositoryImportCancelledError('Import was cancelled prior to execution.');
    }

    // Ensure parent storage directory exists
    fs.mkdirSync(parentDir, { recursive: true });
    fs.mkdirSync(stagingDir, { recursive: true });

    let cumulativeBytes = 0;
    let fileCount = 0;

    try {
      for (const file of options.files) {
        // 1. Check cancellation signal
        if (options.signal?.aborted) {
          throw new RepositoryImportCancelledError('Import was cancelled by user.');
        }

        // 2. Check elapsed time against timeout
        if (Date.now() - startTime > timeoutMs) {
          throw new RepositoryImportTimeoutError(
            `Import timed out after ${timeoutMs}ms while writing files.`,
          );
        }

        // 3. Path traversal defense
        const safeRelativePath = ImportSafetyValidator.validateRelativePath(
          file.relativePath,
          stagingDir,
        );

        // 4. File size and count bounds
        const fileBytes = file.content.length;
        ImportSafetyValidator.validateFileSize(fileBytes, cumulativeBytes);
        ImportSafetyValidator.validateFileCount(fileCount);

        // 5. Ensure parent directories exist within staging
        const destinationFilePath = path.join(stagingDir, safeRelativePath);
        fs.mkdirSync(path.dirname(destinationFilePath), { recursive: true });

        // 6. Write file contents to disk
        fs.writeFileSync(destinationFilePath, file.content);

        cumulativeBytes += fileBytes;
        fileCount += 1;
      }

      // Check cancellation before atomic promotion
      if (options.signal?.aborted) {
        throw new RepositoryImportCancelledError('Import was cancelled before final commit.');
      }

      // 7. Atomic commit: Replace old target directory with staging directory
      if (fs.existsSync(targetDir)) {
        const backupDir = `${targetDir}.old.${Date.now()}`;
        fs.renameSync(targetDir, backupDir);
        fs.renameSync(stagingDir, targetDir);
        fs.rmSync(backupDir, { recursive: true, force: true });
      } else {
        fs.renameSync(stagingDir, targetDir);
      }

      const durationMs = Date.now() - startTime;

      return {
        connectionId: options.connectionId,
        status: 'IMPORTED' as RepositoryImportStatus,
        branch: options.branch,
        revision: options.revision,
        fileCount,
        totalSizeBytes: cumulativeBytes,
        durationMs,
        localPath: targetDir,
        errorMessage: null,
      };
    } catch (err: unknown) {
      // Clean up staging directory on any failure
      if (fs.existsSync(stagingDir)) {
        try {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        } catch {
          // ignore cleanup errors on failure
        }
      }

      if (
        err instanceof RepositoryImportCancelledError ||
        err instanceof RepositoryImportTimeoutError
      ) {
        throw err;
      }

      if (err instanceof Error) {
        throw err;
      }

      throw new RepositoryImportError('Unknown filesystem error during repository import.');
    }
  }

  /**
   * Safely deletes local repository storage on disk.
   */
  public deleteRepositoryStorage(projectId: string, connectionId: string): void {
    const targetDir = this.resolveRepositoryPath(projectId, connectionId);
    if (fs.existsSync(targetDir)) {
      try {
        fs.rmSync(targetDir, { recursive: true, force: true });
      } catch {
        // ignore errors
      }
    }
  }
}
