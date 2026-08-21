/**
 * @file apps/desktop/src/main/ipc/git-handlers.ts
 * Privileged IPC handlers managing Git repository detection and metadata retrieval.
 */

import { sourceProjectIdSchema, type GitStatusDto } from '@ai-quality/contracts';
import { GitService } from '@ai-quality/core';

let defaultGitService: GitService | null = null;

export function getGitService(): GitService {
  if (!defaultGitService) {
    defaultGitService = new GitService();
  }
  return defaultGitService;
}

export function setGitServiceForTest(service: GitService | null): void {
  defaultGitService = service;
}

/**
 * Handles get Git status request for a project.
 */
export async function handleGetGitStatus(
  projectId: unknown,
  service: GitService = getGitService(),
): Promise<GitStatusDto | null> {
  const validated = sourceProjectIdSchema.parse({ projectId });
  return service.getGitStatus(validated.projectId);
}

/**
 * Handles refresh Git metadata request for a project.
 */
export async function handleRefreshGitMetadata(
  projectId: unknown,
  service: GitService = getGitService(),
): Promise<GitStatusDto> {
  const validated = sourceProjectIdSchema.parse({ projectId });
  return service.refreshGitMetadata(validated.projectId);
}
