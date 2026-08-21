/**
 * @file packages/core/src/sources/snapshots/snapshot-repository.ts
 * Prisma repository for RepositorySnapshot and RepositorySnapshotFile relational persistence.
 */

import { getPrismaClient } from '../../database/client.js';
import { DatabaseError } from '../../database/errors.js';
import type { RepositorySnapshot, RepositorySnapshotFile } from '@prisma/client';
import type { SnapshotKind, SnapshotStatus } from '@ai-quality/contracts';
import { DB_SNAPSHOT_BATCH_SIZE } from './snapshot-types.js';

export class SnapshotRepository {
  private getPrisma() {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new DatabaseError(
        'Database connection is not configured or unavailable.',
        'DATABASE_UNAVAILABLE',
      );
    }
    return prisma;
  }

  /**
   * Lists all snapshots for a given source, ordered latest first.
   */
  async listSnapshotsForSource(sourceId: string): Promise<RepositorySnapshot[]> {
    const prisma = this.getPrisma();
    return await prisma.repositorySnapshot.findMany({
      where: { sourceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Retrieves a single snapshot by ID.
   */
  async getSnapshotById(snapshotId: string): Promise<RepositorySnapshot | null> {
    const prisma = this.getPrisma();
    return await prisma.repositorySnapshot.findUnique({
      where: { id: snapshotId },
    });
  }

  /**
   * Retrieves all snapshot file records for a given snapshot ID.
   */
  async getSnapshotFiles(snapshotId: string): Promise<RepositorySnapshotFile[]> {
    const prisma = this.getPrisma();
    return await prisma.repositorySnapshotFile.findMany({
      where: { snapshotId },
      orderBy: { relativePath: 'asc' },
    });
  }

  /**
   * Persists a snapshot header and batches of snapshot files atomically in a database transaction.
   */
  async createSnapshotWithFiles(
    sourceId: string,
    header: {
      indexRunId: string | null;
      label: string | null;
      kind: SnapshotKind;
      status: SnapshotStatus;
      snapshotVersion: number;
      fingerprint: string;
      fileCount: number;
      sourceFileCount: number;
      testFileCount: number;
      gitHeadCommit: string | null;
      gitBranch: string | null;
    },
    files: readonly {
      relativePath: string;
      contentHash: string | null;
      language: string | null;
      classification: string;
      sizeBytes: number;
    }[],
  ): Promise<RepositorySnapshot> {
    const prisma = this.getPrisma();

    return await prisma.$transaction(async tx => {
      const snapshot = await tx.repositorySnapshot.create({
        data: {
          sourceId,
          ...header,
        },
      });

      // Batch insert snapshot files
      for (let i = 0; i < files.length; i += DB_SNAPSHOT_BATCH_SIZE) {
        const batch = files.slice(i, i + DB_SNAPSHOT_BATCH_SIZE).map(f => ({
          snapshotId: snapshot.id,
          relativePath: f.relativePath,
          contentHash: f.contentHash,
          language: f.language,
          classification: f.classification,
          sizeBytes: f.sizeBytes,
        }));

        await tx.repositorySnapshotFile.createMany({
          data: batch,
        });
      }

      return snapshot;
    });
  }

  /**
   * Sets the active baseline snapshot on the ProjectSource record.
   */
  async setActiveBaseline(sourceId: string, snapshotId: string): Promise<void> {
    const prisma = this.getPrisma();
    await prisma.projectSource.update({
      where: { id: sourceId },
      data: { activeBaselineSnapshotId: snapshotId },
    });
  }

  /**
   * Deletes a snapshot by ID with cascading delete of its file records.
   */
  async deleteSnapshot(sourceId: string, snapshotId: string): Promise<void> {
    const prisma = this.getPrisma();
    await prisma.$transaction(async tx => {
      // If deleted snapshot was active baseline, clear pointer
      const source = await tx.projectSource.findUnique({
        where: { id: sourceId },
      });
      if (source?.activeBaselineSnapshotId === snapshotId) {
        await tx.projectSource.update({
          where: { id: sourceId },
          data: { activeBaselineSnapshotId: null },
        });
      }

      await tx.repositorySnapshot.delete({
        where: { id: snapshotId },
      });
    });
  }
}
