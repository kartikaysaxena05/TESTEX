/**
 * @file apps/desktop/src/main/ipc/index-handlers.ts
 * IPC handler functions for repository source indexing and symbol queries.
 */

import {
  projectIdSchema,
  listIndexedFilesSchema,
  searchSymbolsSchema,
  repositoryFileDetailsSchema,
  type RepositoryIndexStatusDto,
  type RepositoryFileDto,
  type RepositoryFileDetailsDto,
  type RepositorySymbolDto,
  type PaginatedResult,
} from '@ai-quality/contracts';
import { RepositoryIndexService } from '@ai-quality/core';

export async function handleGetRepositoryIndexStatus(
  rawProjectId: unknown,
  service: RepositoryIndexService = new RepositoryIndexService(),
): Promise<RepositoryIndexStatusDto> {
  const projectId = projectIdSchema.parse(rawProjectId);
  return await service.getIndexStatus(projectId);
}

export async function handleRefreshRepositoryIndex(
  rawProjectId: unknown,
  service: RepositoryIndexService = new RepositoryIndexService(),
): Promise<RepositoryIndexStatusDto> {
  const projectId = projectIdSchema.parse(rawProjectId);
  return await service.refreshIndex(projectId);
}

export async function handleListIndexedFiles(
  rawInput: unknown,
  service: RepositoryIndexService = new RepositoryIndexService(),
): Promise<PaginatedResult<RepositoryFileDto>> {
  const input = listIndexedFilesSchema.parse(rawInput);
  return await service.listIndexedFiles(input.projectId, input);
}

export async function handleGetFileDetails(
  rawInput: unknown,
  service: RepositoryIndexService = new RepositoryIndexService(),
): Promise<RepositoryFileDetailsDto | null> {
  const input = repositoryFileDetailsSchema.parse(rawInput);
  return await service.getFileDetails(input.projectId, input.relativePath);
}

export async function handleSearchSymbols(
  rawInput: unknown,
  service: RepositoryIndexService = new RepositoryIndexService(),
): Promise<readonly RepositorySymbolDto[]> {
  const input = searchSymbolsSchema.parse(rawInput);
  return await service.searchSymbols(input.projectId, input);
}
