/**
 * @file packages/core/src/git/git-repository.ts
 * Prisma repository for ProjectGitMetadata persistence.
 */

import type {
  ProjectGitMetadata as PrismaProjectGitMetadata,
  GitSourceRelation,
} from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { DatabaseError } from '../database/errors.js';

export interface UpsertGitMetadataData {
  readonly isGitRepository: boolean;
  readonly repositoryRoot?: string | null;
  readonly sourceRelationToRepository?: GitSourceRelation;
  readonly currentBranch?: string | null;
  readonly headCommit?: string | null;
  readonly isDetachedHead?: boolean;
  readonly lastCheckedAt?: Date;
}

export class GitRepository {
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
   * Retrieves ProjectGitMetadata for a source by sourceId.
   */
  async getGitMetadataBySourceId(sourceId: string): Promise<PrismaProjectGitMetadata | null> {
    const prisma = this.getPrisma();
    return prisma.projectGitMetadata.findUnique({
      where: { sourceId },
    });
  }

  /**
   * Upserts the ProjectGitMetadata record for a source.
   */
  async upsertGitMetadata(
    sourceId: string,
    data: UpsertGitMetadataData,
  ): Promise<PrismaProjectGitMetadata> {
    const prisma = this.getPrisma();
    const now = new Date();
    return prisma.projectGitMetadata.upsert({
      where: { sourceId },
      create: {
        sourceId,
        isGitRepository: data.isGitRepository,
        repositoryRoot: data.repositoryRoot ?? null,
        sourceRelationToRepository: data.sourceRelationToRepository ?? 'UNKNOWN',
        currentBranch: data.currentBranch ?? null,
        headCommit: data.headCommit ?? null,
        isDetachedHead: data.isDetachedHead ?? false,
        lastCheckedAt: data.lastCheckedAt ?? now,
      },
      update: {
        isGitRepository: data.isGitRepository,
        repositoryRoot: data.repositoryRoot ?? null,
        sourceRelationToRepository: data.sourceRelationToRepository ?? 'UNKNOWN',
        currentBranch: data.currentBranch ?? null,
        headCommit: data.headCommit ?? null,
        isDetachedHead: data.isDetachedHead ?? false,
        lastCheckedAt: data.lastCheckedAt ?? now,
      },
    });
  }

  /**
   * Deletes the ProjectGitMetadata record by sourceId.
   */
  async deleteGitMetadataBySourceId(sourceId: string): Promise<PrismaProjectGitMetadata | null> {
    const prisma = this.getPrisma();
    try {
      return await prisma.projectGitMetadata.delete({
        where: { sourceId },
      });
    } catch {
      return null;
    }
  }
}
