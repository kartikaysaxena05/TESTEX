/**
 * @file packages/core/src/sources/source-mappers.ts
 * Pure mapper functions transforming Prisma ProjectSource entities to renderer-safe DTOs.
 */

import type { ProjectSource as PrismaProjectSource } from '@prisma/client';
import type { ProjectSourceDto, SourceAvailability } from '@ai-quality/contracts';

/**
 * Maps a Prisma ProjectSource record to a renderer-safe ProjectSourceDto with explicit availability state.
 */
export function mapProjectSourceToDto(
  source: PrismaProjectSource,
  availability: SourceAvailability,
): ProjectSourceDto {
  return {
    id: source.id,
    projectId: source.projectId,
    kind: source.kind,
    displayName: source.displayName,
    rootPath: source.rootPath,
    identityFingerprint: source.identityFingerprint,
    activeBaselineSnapshotId: source.activeBaselineSnapshotId,
    availability,
    filesystemCreatedAt: source.filesystemCreatedAt
      ? source.filesystemCreatedAt.toISOString()
      : null,
    filesystemModifiedAt: source.filesystemModifiedAt
      ? source.filesystemModifiedAt.toISOString()
      : null,
    metadataRefreshedAt: source.metadataRefreshedAt
      ? source.metadataRefreshedAt.toISOString()
      : null,
    lastValidatedAt: source.lastValidatedAt ? source.lastValidatedAt.toISOString() : null,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}
