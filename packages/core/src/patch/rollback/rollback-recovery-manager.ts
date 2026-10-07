/**
 * @file packages/core/src/patch/rollback/rollback-recovery-manager.ts
 * Content-addressed recovery point manager for V7 Phase 105 Patch Rollback & Recovery.
 * Provides pre-mutation backup, atomic restoration upon failure, and crash recovery.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PatchRollbackRecoveryFailedError } from './rollback-errors.js';
import type { RecoveryPointSnapshot } from './rollback-types.js';

export class RollbackRecoveryManager {
  private static readonly RECOVERY_DIR = '.ai-recovery';

  /**
   * Creates a content-addressed recovery point of target files prior to disk mutation.
   */
  public static createRecoveryPoint(
    workspaceRoot: string,
    targetFiles: string[],
  ): RecoveryPointSnapshot {
    const recoveryPointId = `rp_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const storeDir = path.resolve(workspaceRoot, this.RECOVERY_DIR, recoveryPointId);

    fs.mkdirSync(storeDir, { recursive: true });

    const snapshot: RecoveryPointSnapshot = {
      recoveryPointId,
      createdAt: new Date().toISOString(),
      workspaceRoot,
      files: {},
    };

    for (const relFile of targetFiles) {
      const normalized = path.normalize(relFile).replace(/\\/g, '/').replace(/^\.\//, '');
      const absPath = path.resolve(workspaceRoot, normalized);

      if (!fs.existsSync(absPath)) {
        continue;
      }

      const content = fs.readFileSync(absPath, 'utf8');
      const sha256 = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
      const backupFilePath = path.resolve(storeDir, encodeURIComponent(normalized));

      fs.writeFileSync(backupFilePath, content, 'utf8');

      snapshot.files[normalized] = {
        sha256,
        content,
        byteSize: Buffer.byteLength(content, 'utf8'),
      };
    }

    // Persist manifest into recovery store
    const manifestPath = path.resolve(storeDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(snapshot, null, 2), 'utf8');

    return snapshot;
  }

  /**
   * Restores files to their exact pre-rollback state from the snapshot.
   */
  public static restoreFromRecoveryPoint(
    workspaceRoot: string,
    snapshotOrId: RecoveryPointSnapshot | string,
  ): string[] {
    let snapshot: RecoveryPointSnapshot;

    if (typeof snapshotOrId === 'string') {
      const storeDir = path.resolve(workspaceRoot, this.RECOVERY_DIR, snapshotOrId);
      const manifestPath = path.resolve(storeDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        throw new PatchRollbackRecoveryFailedError(
          `Recovery manifest for ID '${snapshotOrId}' not found at '${manifestPath}'.`,
        );
      }
      try {
        snapshot = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch (err: any) {
        throw new PatchRollbackRecoveryFailedError(
          `Failed to read recovery manifest: ${err.message}`,
        );
      }
    } else {
      snapshot = snapshotOrId;
    }

    const restoredFiles: string[] = [];

    for (const [relFile, fileInfo] of Object.entries(snapshot.files)) {
      const absPath = path.resolve(workspaceRoot, relFile);
      const dir = path.dirname(absPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(absPath, fileInfo.content, 'utf8');
      restoredFiles.push(relFile);
    }

    return restoredFiles;
  }

  /**
   * Safely cleans up the on-disk recovery point after successful completion.
   */
  public static cleanupRecoveryPoint(workspaceRoot: string, recoveryPointId: string): void {
    const storeDir = path.resolve(workspaceRoot, this.RECOVERY_DIR, recoveryPointId);
    if (fs.existsSync(storeDir)) {
      try {
        fs.rmSync(storeDir, { recursive: true, force: true });
      } catch {
        // Non-fatal cleanup warning
      }
    }
  }

  /**
   * Checks if an interrupted recovery point exists in the workspace.
   */
  public static findPendingRecoveryPoints(workspaceRoot: string): string[] {
    const recoveryRoot = path.resolve(workspaceRoot, this.RECOVERY_DIR);
    if (!fs.existsSync(recoveryRoot)) {
      return [];
    }

    const entries = fs.readdirSync(recoveryRoot, { withFileTypes: true });
    return entries.filter(e => e.isDirectory() && e.name.startsWith('rp_')).map(e => e.name);
  }
}
