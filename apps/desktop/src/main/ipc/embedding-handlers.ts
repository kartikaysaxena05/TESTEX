/**
 * @file apps/desktop/src/main/ipc/embedding-handlers.ts
 * IPC handlers for Phase 45 Embedding & Vector Retrieval operations.
 */

import {
  getEmbeddingIndexStatusInputSchema,
  indexSubjectsInputSchema,
  vectorSearchQuerySchema,
  reindexStaleInputSchema,
  type EmbeddingIndexStatusDto,
  type IndexSubjectsResultDto,
  type VectorMatchDto,
} from '@ai-quality/contracts';
import {
  VectorIndexService,
  VectorSearchService,
  AiInvalidRequestError,
  AiGatewayError,
} from '@ai-quality/core';
import { ZodError } from 'zod';

let defaultIndexService: VectorIndexService | null = null;
let defaultSearchService: VectorSearchService | null = null;

export function getVectorIndexService(): VectorIndexService {
  if (!defaultIndexService) {
    defaultIndexService = new VectorIndexService();
  }
  return defaultIndexService;
}

export function getVectorSearchService(): VectorSearchService {
  if (!defaultSearchService) {
    defaultSearchService = new VectorSearchService();
  }
  return defaultSearchService;
}

export function setVectorServicesForTesting(
  customIndexService: VectorIndexService | null = null,
  customSearchService: VectorSearchService | null = null,
): void {
  defaultIndexService = customIndexService;
  defaultSearchService = customSearchService;
}

/**
 * Maps known Zod validation errors to domain AiInvalidRequestError.
 */
export function handleEmbeddingServiceError(error: unknown): never {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const message = firstIssue ? firstIssue.message : 'Invalid embedding request payload.';
    throw new AiInvalidRequestError(message);
  }
  if (error instanceof AiGatewayError) {
    throw error;
  }
  throw error;
}

/**
 * Handles fetching vector embedding index status for a project.
 */
export async function handleGetEmbeddingIndexStatus(
  rawInput: unknown,
  service: VectorIndexService = getVectorIndexService(),
): Promise<EmbeddingIndexStatusDto> {
  const parseResult = getEmbeddingIndexStatusInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleEmbeddingServiceError(parseResult.error);
  }
  return service.getIndexStatus(parseResult.data.projectId);
}

/**
 * Handles indexing project subjects into vector embeddings.
 */
export async function handleIndexSubjects(
  rawInput: unknown,
  service: VectorIndexService = getVectorIndexService(),
): Promise<IndexSubjectsResultDto> {
  const parseResult = indexSubjectsInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleEmbeddingServiceError(parseResult.error);
  }
  return service.indexSubjects(parseResult.data);
}

/**
 * Handles project-scoped vector similarity search.
 */
export async function handleVectorSearchSimilar(
  rawInput: unknown,
  service: VectorSearchService = getVectorSearchService(),
): Promise<readonly VectorMatchDto[]> {
  const parseResult = vectorSearchQuerySchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleEmbeddingServiceError(parseResult.error);
  }
  return service.searchSimilar(parseResult.data);
}

/**
 * Handles reindexing stale embeddings for a project.
 */
export async function handleReindexStaleEmbeddings(
  rawInput: unknown,
  service: VectorIndexService = getVectorIndexService(),
): Promise<IndexSubjectsResultDto> {
  const parseResult = reindexStaleInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleEmbeddingServiceError(parseResult.error);
  }
  return service.reindexStale(parseResult.data.projectId);
}
