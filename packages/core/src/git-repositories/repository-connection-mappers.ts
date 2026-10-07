/**
 * @file packages/core/src/git-repositories/repository-connection-mappers.ts
 * Pure mapping functions translating database entities to client DTOs and snapshots with strict credential redacting.
 */

import type { RepositoryConnection } from '@prisma/client';
import type {
  RepositoryConnectionSummary,
  RepositoryConnectionDetails,
  RepositoryConnectionSnapshot,
  GitProviderType,
  RepositoryConnectionStatus,
  RepositoryImportStatus,
  RepositoryVisibility,
} from '@ai-quality/contracts';

/**
 * Maps a Prisma RepositoryConnection to a safe summary DTO.
 */
export function toRepositoryConnectionSummary(
  conn: RepositoryConnection,
): RepositoryConnectionSummary {
  return {
    id: conn.id,
    projectId: conn.projectId,
    provider: conn.provider as GitProviderType,
    repositoryIdentifier: conn.repositoryIdentifier,
    repositoryName: conn.repositoryName,
    owner: conn.owner,
    repositoryUrl: conn.repositoryUrl,
    displayName: conn.displayName,
    visibility: conn.visibility as RepositoryVisibility,
    defaultBranch: conn.defaultBranch,
    selectedBranch: conn.selectedBranch,
    selectedRevision: conn.selectedRevision,
    importedRevision: conn.importedRevision,
    connectionStatus: conn.connectionStatus as RepositoryConnectionStatus,
    importStatus: conn.importStatus as RepositoryImportStatus,
    isActive: conn.isActive,
    localPath: conn.localPath,
    lastVerifiedAt: conn.lastVerifiedAt ? conn.lastVerifiedAt.toISOString() : null,
    lastImportedAt: conn.lastImportedAt ? conn.lastImportedAt.toISOString() : null,
    fileCount: conn.fileCount,
    totalSizeBytes: Number(conn.totalSizeBytes),
    createdAt: conn.createdAt.toISOString(),
    updatedAt: conn.updatedAt.toISOString(),
  };
}

/**
 * Maps a Prisma RepositoryConnection to a detailed DTO without exposing encrypted credentials.
 */
export function toRepositoryConnectionDetails(
  conn: RepositoryConnection,
): RepositoryConnectionDetails {
  const summary = toRepositoryConnectionSummary(conn);
  return {
    ...summary,
    lastFailureReason: conn.lastFailureReason,
    hasCredentials: Boolean(conn.encryptedCredentials && conn.encryptedCredentials.length > 0),
  };
}

/**
 * Creates an immutable snapshot of a repository connection for execution runs.
 */
export function toRepositoryConnectionSnapshot(
  conn: RepositoryConnection,
): RepositoryConnectionSnapshot {
  return {
    connectionId: conn.id,
    projectId: conn.projectId,
    provider: conn.provider as GitProviderType,
    repositoryIdentifier: conn.repositoryIdentifier,
    repositoryName: conn.repositoryName,
    owner: conn.owner,
    repositoryUrl: conn.repositoryUrl,
    branch: conn.selectedBranch,
    revision: conn.importedRevision ?? conn.selectedRevision ?? 'HEAD',
    localPath: conn.localPath,
    snapshotTimestamp: new Date().toISOString(),
  };
}
