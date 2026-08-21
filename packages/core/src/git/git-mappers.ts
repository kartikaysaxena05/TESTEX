/**
 * @file packages/core/src/git/git-mappers.ts
 * Pure mapper functions transforming Prisma ProjectGitMetadata entities to renderer-safe GitStatusDto.
 */

import type { ProjectGitMetadata as PrismaProjectGitMetadata } from '@prisma/client';
import type { GitStatusDto } from '@ai-quality/contracts';

export function mapProjectGitMetadataToDto(
  metadata: PrismaProjectGitMetadata,
  gitAvailable: boolean,
  gitVersion: string | null,
): GitStatusDto {
  return {
    gitAvailable,
    gitVersion,
    isGitRepository: metadata.isGitRepository,
    repositoryRoot: metadata.repositoryRoot,
    sourceRelationToRepository: metadata.sourceRelationToRepository,
    currentBranch: metadata.currentBranch,
    headCommit: metadata.headCommit,
    isDetachedHead: metadata.isDetachedHead,
    lastCheckedAt: metadata.lastCheckedAt.toISOString(),
  };
}
