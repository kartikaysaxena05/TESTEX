/**
 * @file apps/desktop/src/main/ipc/rag-handlers.ts
 * IPC handlers for Phase 46 RAG & Requirement Context Retrieval.
 */

import {
  retrieveRequirementContextInputSchema,
  type RequirementContextPackDto,
  type RagRetrievalConfigDto,
} from '@ai-quality/contracts';
import {
  RequirementContextRetrievalService,
  AiInvalidRequestError,
  AiGatewayError,
} from '@ai-quality/core';
import { ZodError } from 'zod';

let defaultRetrievalService: RequirementContextRetrievalService | null = null;

export function getRequirementContextRetrievalService(): RequirementContextRetrievalService {
  if (!defaultRetrievalService) {
    defaultRetrievalService = new RequirementContextRetrievalService();
  }
  return defaultRetrievalService;
}

export function setRetrievalServiceForTest(
  customService: RequirementContextRetrievalService | null,
): void {
  defaultRetrievalService = customService;
}

/**
 * Maps known Zod validation errors to domain AiInvalidRequestError.
 */
export function handleRagServiceError(error: unknown): never {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const message = firstIssue ? firstIssue.message : 'Invalid RAG request payload.';
    throw new AiInvalidRequestError(message);
  }
  if (error instanceof AiGatewayError) {
    throw error;
  }
  throw error;
}

/**
 * Handles RAG requirement context retrieval request.
 */
export async function handleRetrieveRequirementContext(
  rawInput: unknown,
  service: RequirementContextRetrievalService = getRequirementContextRetrievalService(),
): Promise<RequirementContextPackDto> {
  const parseResult = retrieveRequirementContextInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleRagServiceError(parseResult.error);
  }
  return service.retrieveContext(parseResult.data);
}

/**
 * Handles fetching default RAG retrieval configuration.
 */
export async function handleGetRagConfigDefaults(
  service: RequirementContextRetrievalService = getRequirementContextRetrievalService(),
): Promise<RagRetrievalConfigDto> {
  return service.getConfigDefaults();
}
