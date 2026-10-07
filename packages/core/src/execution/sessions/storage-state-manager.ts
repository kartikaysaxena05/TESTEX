/**
 * @file packages/core/src/execution/sessions/storage-state-manager.ts
 * Manages secure Playwright storage-state persistence, origin boundaries, and integrity checks.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { BrowserContext } from 'playwright';
import { StorageStateInvalidError, StorageStateNotFoundError } from './session-errors.js';
import { SESSION_BOUNDS } from './session-types.js';
import type { ILogger } from '../../logging/index.js';

export interface StorageStateMetadata {
  readonly storageStateKey: string;
  readonly projectId: string;
  readonly profileId?: string;
  readonly cookieCount: number;
  readonly originCount: number;
  readonly fileSizeBytes: number;
  readonly createdAt: Date;
}

export class StorageStateManager {
  private readonly storageRoot: string;
  private readonly logger?: ILogger;

  constructor(storageRoot?: string, logger?: ILogger) {
    this.storageRoot =
      storageRoot ?? path.join(process.cwd(), '.system_generated', 'sessions', 'storage-states');
    this.logger = logger;
  }

  /**
   * Resolves and strictly validates that a storage state key resolves to a safe path inside the managed root.
   */
  public resolveSafePath(storageStateKey: string): string {
    if (!storageStateKey || typeof storageStateKey !== 'string') {
      throw new StorageStateInvalidError('Storage state key cannot be empty.');
    }

    // Prohibit directory traversal characters and absolute paths
    if (
      storageStateKey.includes('..') ||
      storageStateKey.includes('/') ||
      storageStateKey.includes('\\') ||
      path.isAbsolute(storageStateKey)
    ) {
      throw new StorageStateInvalidError(
        `Invalid storage state key '${storageStateKey}'. Arbitrary filesystem paths and directory traversal are prohibited.`,
      );
    }

    const safeFilename = `${storageStateKey.replace(/[^a-zA-Z0-9_-]/g, '')}.json`;
    return path.join(this.storageRoot, safeFilename);
  }

  /**
   * Generates a unique managed storage state key.
   */
  public generateKey(projectId: string, profileName: string): string {
    const sanitizedName = profileName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .slice(0, 30);
    const randomSuffix = crypto.randomBytes(8).toString('hex');
    return `ss_${projectId.slice(0, 8)}_${sanitizedName}_${randomSuffix}`;
  }

  /**
   * Saves storage state from a live BrowserContext into a secure managed file.
   */
  public async saveStorageState(
    context: BrowserContext,
    storageStateKey: string,
    projectId: string,
    profileId?: string,
  ): Promise<StorageStateMetadata> {
    await fs.mkdir(this.storageRoot, { recursive: true });
    const filePath = this.resolveSafePath(storageStateKey);

    const stateObj = await context.storageState();
    const jsonStr = JSON.stringify(stateObj, null, 2);

    const sizeBytes = Buffer.byteLength(jsonStr, 'utf8');
    if (sizeBytes > SESSION_BOUNDS.MAX_STORAGE_STATE_SIZE_BYTES) {
      throw new StorageStateInvalidError(
        `Storage state exceeds maximum permitted size of ${SESSION_BOUNDS.MAX_STORAGE_STATE_SIZE_BYTES} bytes (actual: ${sizeBytes} bytes).`,
      );
    }

    await fs.writeFile(filePath, jsonStr, { encoding: 'utf8', mode: 0o600 });

    const metadata: StorageStateMetadata = {
      storageStateKey,
      projectId,
      profileId,
      cookieCount: stateObj.cookies?.length ?? 0,
      originCount: stateObj.origins?.length ?? 0,
      fileSizeBytes: sizeBytes,
      createdAt: new Date(),
    };

    this.logger?.info('storage_state.saved', {
      storageStateKey,
      projectId,
      profileId,
      cookieCount: metadata.cookieCount,
      originCount: metadata.originCount,
      sizeBytes,
    });

    return metadata;
  }

  /**
   * Loads and validates a managed storage state file.
   */
  public async loadStorageState(storageStateKey: string): Promise<string> {
    const filePath = this.resolveSafePath(storageStateKey);

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(content);

      if (typeof parsed !== 'object' || parsed === null) {
        throw new StorageStateInvalidError('Storage state JSON must be an object.');
      }

      if (!Array.isArray(parsed.cookies)) {
        throw new StorageStateInvalidError("Storage state missing 'cookies' array.");
      }

      return filePath;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageStateNotFoundError(storageStateKey);
      }
      if (err instanceof StorageStateInvalidError) {
        throw err;
      }
      throw new StorageStateInvalidError(
        `Failed to read or parse storage state file: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Deletes a managed storage state file safely.
   */
  public async deleteStorageState(storageStateKey?: string | null): Promise<boolean> {
    if (!storageStateKey) {
      return false;
    }

    try {
      const filePath = this.resolveSafePath(storageStateKey);
      await fs.unlink(filePath);
      return true;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      this.logger?.warn('storage_state.delete_failed', {
        storageStateKey,
        error: String(err),
      });
      return false;
    }
  }
}
