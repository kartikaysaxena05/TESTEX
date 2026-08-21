/**
 * @file packages/core/src/sources/source-repository.ts
 * Prisma repository for ProjectSource persistence and transactional relational queries.
 */

import type { ProjectSource as PrismaProjectSource, ProjectSourceKind } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { DatabaseError } from '../database/errors.js';

export interface UpsertSourceData {
  readonly kind: ProjectSourceKind;
  readonly displayName: string;
  readonly rootPath: string;
  readonly identityFingerprint?: string | null;
  readonly filesystemCreatedAt?: Date | null;
  readonly filesystemModifiedAt?: Date | null;
  readonly metadataRefreshedAt?: Date | null;
  readonly lastValidatedAt?: Date | null;
}

export interface UpdateSourceMetadataData {
  readonly identityFingerprint?: string | null;
  readonly filesystemCreatedAt?: Date | null;
  readonly filesystemModifiedAt?: Date | null;
  readonly metadataRefreshedAt?: Date | null;
  readonly lastValidatedAt?: Date | null;
}

export class SourceRepository {
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
   * Retrieves a single ProjectSource record by its parent projectId.
   */
  async getSourceByProjectId(projectId: string): Promise<PrismaProjectSource | null> {
    const prisma = this.getPrisma();
    return prisma.projectSource.findUnique({
      where: { projectId },
    });
  }

  /**
   * Transactionally creates or updates the ProjectSource record for a project.
   */
  async upsertSource(projectId: string, data: UpsertSourceData): Promise<PrismaProjectSource> {
    const prisma = this.getPrisma();
    const now = new Date();
    return prisma.projectSource.upsert({
      where: { projectId },
      create: {
        projectId,
        kind: data.kind,
        displayName: data.displayName,
        rootPath: data.rootPath,
        identityFingerprint: data.identityFingerprint ?? null,
        filesystemCreatedAt: data.filesystemCreatedAt ?? null,
        filesystemModifiedAt: data.filesystemModifiedAt ?? null,
        metadataRefreshedAt: data.metadataRefreshedAt ?? now,
        lastValidatedAt: data.lastValidatedAt ?? now,
      },
      update: {
        kind: data.kind,
        displayName: data.displayName,
        rootPath: data.rootPath,
        identityFingerprint: data.identityFingerprint ?? null,
        filesystemCreatedAt: data.filesystemCreatedAt ?? null,
        filesystemModifiedAt: data.filesystemModifiedAt ?? null,
        metadataRefreshedAt: data.metadataRefreshedAt ?? now,
        lastValidatedAt: data.lastValidatedAt ?? now,
      },
    });
  }

  /**
   * Updates metadata fields for an existing ProjectSource record.
   */
  async updateSourceMetadata(
    projectId: string,
    data: UpdateSourceMetadataData,
  ): Promise<PrismaProjectSource | null> {
    const prisma = this.getPrisma();
    try {
      return await prisma.projectSource.update({
        where: { projectId },
        data: {
          ...(data.identityFingerprint !== undefined && {
            identityFingerprint: data.identityFingerprint,
          }),
          ...(data.filesystemCreatedAt !== undefined && {
            filesystemCreatedAt: data.filesystemCreatedAt,
          }),
          ...(data.filesystemModifiedAt !== undefined && {
            filesystemModifiedAt: data.filesystemModifiedAt,
          }),
          ...(data.metadataRefreshedAt !== undefined && {
            metadataRefreshedAt: data.metadataRefreshedAt,
          }),
          ...(data.lastValidatedAt !== undefined && {
            lastValidatedAt: data.lastValidatedAt,
          }),
        },
      });
    } catch {
      return null;
    }
  }

  /**
   * Deletes the ProjectSource record associated with a project.
   */
  async deleteSourceByProjectId(projectId: string): Promise<PrismaProjectSource | null> {
    const prisma = this.getPrisma();
    try {
      return await prisma.projectSource.delete({
        where: { projectId },
      });
    } catch {
      return null;
    }
  }

  /**
   * Updates the lastValidatedAt timestamp for a ProjectSource record.
   */
  async updateLastValidatedAt(
    projectId: string,
    lastValidatedAt: Date,
  ): Promise<PrismaProjectSource | null> {
    const prisma = this.getPrisma();
    try {
      return await prisma.projectSource.update({
        where: { projectId },
        data: { lastValidatedAt },
      });
    } catch {
      return null;
    }
  }
}
