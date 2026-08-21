/**
 * @file apps/desktop/src/main/ipc/categorized-test-handlers.ts
 * IPC handlers for Phase 50 Positive, Negative, Boundary & Validation Test Generation.
 */

import {
  generateCategorizedTestsInputSchema,
  getCategorizedTestsInputSchema,
  type CategorizedTestGenerationResultDto,
} from '@ai-quality/contracts';
import {
  AiGatewayError,
  AiInvalidRequestError,
  AiPromptExecutionService,
  CategorizedTestError,
  CategorizedTestService,
  RequirementContextRetrievalService,
} from '@ai-quality/core';
import { ZodError } from 'zod';

let defaultCategorizedTestService: CategorizedTestService | null = null;

export function getCategorizedTestService(): CategorizedTestService {
  if (!defaultCategorizedTestService) {
    defaultCategorizedTestService = new CategorizedTestService({
      retrievalService: new RequirementContextRetrievalService(),
      promptExecutionService: new AiPromptExecutionService(),
    });
  }
  return defaultCategorizedTestService;
}

export function setCategorizedTestServiceForTest(
  customService: CategorizedTestService | null,
): void {
  defaultCategorizedTestService = customService;
}

/**
 * Maps known Zod validation errors to domain AiInvalidRequestError.
 */
export function handleCategorizedTestServiceError(error: unknown): never {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const message = firstIssue
      ? firstIssue.message
      : 'Invalid categorized test generation request payload.';
    throw new AiInvalidRequestError(message);
  }
  if (error instanceof CategorizedTestError || error instanceof AiGatewayError) {
    throw error;
  }
  throw error;
}

/**
 * Handles categorized test generation request.
 */
export async function handleGenerateCategorizedTests(
  rawInput: unknown,
  service: CategorizedTestService = getCategorizedTestService(),
): Promise<CategorizedTestGenerationResultDto> {
  const parseResult = generateCategorizedTestsInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleCategorizedTestServiceError(parseResult.error);
  }
  return service.generateCategorizedTests(parseResult.data);
}

/**
 * Handles get current categorized tests request.
 */
export async function handleGetCategorizedTests(
  rawInput: unknown,
  service: CategorizedTestService = getCategorizedTestService(),
): Promise<CategorizedTestGenerationResultDto | null> {
  const parseResult = getCategorizedTestsInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleCategorizedTestServiceError(parseResult.error);
  }
  return service.getCategorizedTests(parseResult.data);
}
