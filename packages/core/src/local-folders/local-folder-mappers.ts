/**
 * @file packages/core/src/local-folders/local-folder-mappers.ts
 * Serializable DTO mappers for Local Project Folder Connections.
 */

import type { ProjectSource, ProjectGitMetadata } from '@prisma/client';
import type { LocalFolderConnectionDto, LocalFolderAvailability, LocalFolderStatus } from '@ai-quality/contracts';
import fs from 'node:fs';

export function toLocalFolderDto(
  source: ProjectSource & { gitMetadata?: ProjectGitMetadata | null },
  forcedAvailability?: LocalFolderAvailability,
): LocalFolderConnectionDto {
  let isAvailable = false;
  let status: LocalFolderStatus = 'DISCONNECTED';

  if (forcedAvailability) {
    isAvailable = forcedAvailability === 'AVAILABLE';
    status = isAvailable ? 'CONNECTED' : 'MISSING';
  } else {
    try {
      if (fs.existsSync(source.rootPath) && fs.statSync(source.rootPath).isDirectory()) {
        isAvailable = true;
        status = 'CONNECTED';
      } else {
        isAvailable = false;
        status = 'MISSING';
      }
    } catch (err: unknown) {
      isAvailable = false;
      const code = (err as { code?: string })?.code;
      status = code === 'EACCES' || code === 'EPERM' ? 'PERMISSION_DENIED' : 'MISSING';
    }
  }

  const git = source.gitMetadata;

  return {
    id: source.id,
    projectId: source.projectId,
    displayName: source.displayName,
    rootPath: source.rootPath,
    availability: isAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
    status,
    isGitRepository: git?.isGitRepository ?? false,
    currentBranch: git?.currentBranch ?? null,
    headCommit: git?.headCommit ?? null,
    identityFingerprint: source.identityFingerprint,
    filesystemCreatedAt: source.filesystemCreatedAt ? source.filesystemCreatedAt.toISOString() : null,
    filesystemModifiedAt: source.filesystemModifiedAt ? source.filesystemModifiedAt.toISOString() : null,
    lastValidatedAt: source.lastValidatedAt ? source.lastValidatedAt.toISOString() : null,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}
