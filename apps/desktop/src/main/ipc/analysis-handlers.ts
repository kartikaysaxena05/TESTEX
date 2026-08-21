/**
 * @file apps/desktop/src/main/ipc/analysis-handlers.ts
 * IPC handlers for Phase 47 LLM Requirement Analysis & Context-Aware Reasoning.
 */

import {
  analyzeRequirementInputSchema,
  getRequirementAnalysisInputSchema,
  getRequirementAnalysisHistoryInputSchema,
  regenerateRequirementAnalysisInputSchema,
  type RequirementAiAnalysisDto,
} from '@ai-quality/contracts';
import {
  RequirementAnalysisService,
  RequirementContextRetrievalService,
  AiPromptExecutionService,
  AiInvalidRequestError,
  AiGatewayError,
} from '@ai-quality/core';
import { ZodError } from 'zod';

let defaultAnalysisService: RequirementAnalysisService | null = null;

export function getRequirementAnalysisService(): RequirementAnalysisService {
  if (!defaultAnalysisService) {
    defaultAnalysisService = new RequirementAnalysisService({
      retrievalService: new RequirementContextRetrievalService(),
      promptExecutionService: new AiPromptExecutionService(),
    });
  }
  return defaultAnalysisService;
}

export function setAnalysisServiceForTest(customService: RequirementAnalysisService | null): void {
  defaultAnalysisService = customService;
}

/**
 * Maps known Zod validation errors to domain AiInvalidRequestError.
 */
export function handleAnalysisServiceError(error: unknown): never {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const message = firstIssue ? firstIssue.message : 'Invalid analysis request payload.';
    throw new AiInvalidRequestError(message);
  }
  if (error instanceof AiGatewayError) {
    throw error;
  }
  throw error;
}

/**
 * Handles requirement analysis request.
 */
export async function handleAnalyzeRequirement(
  rawInput: unknown,
  service: RequirementAnalysisService = getRequirementAnalysisService(),
): Promise<RequirementAiAnalysisDto> {
  const parseResult = analyzeRequirementInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleAnalysisServiceError(parseResult.error);
  }
  return service.analyzeRequirement(parseResult.data);
}

/**
 * Handles get current requirement analysis request.
 */
export async function handleGetCurrentAnalysis(
  rawInput: unknown,
  service: RequirementAnalysisService = getRequirementAnalysisService(),
): Promise<RequirementAiAnalysisDto | null> {
  const parseResult = getRequirementAnalysisInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleAnalysisServiceError(parseResult.error);
  }
  return service.getCurrentAnalysis(parseResult.data);
}

/**
 * Handles get requirement analysis history request.
 */
export async function handleGetAnalysisHistory(
  rawInput: unknown,
  service: RequirementAnalysisService = getRequirementAnalysisService(),
): Promise<readonly RequirementAiAnalysisDto[]> {
  const parseResult = getRequirementAnalysisHistoryInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleAnalysisServiceError(parseResult.error);
  }
  return service.getAnalysisHistory(parseResult.data);
}

/**
 * Handles regenerate requirement analysis request.
 */
export async function handleRegenerateAnalysis(
  rawInput: unknown,
  service: RequirementAnalysisService = getRequirementAnalysisService(),
): Promise<RequirementAiAnalysisDto> {
  const parseResult = regenerateRequirementAnalysisInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleAnalysisServiceError(parseResult.error);
  }
  return service.regenerateAnalysis(parseResult.data);
}
