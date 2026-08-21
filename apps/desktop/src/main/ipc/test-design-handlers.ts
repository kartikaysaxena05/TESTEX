/**
 * @file apps/desktop/src/main/ipc/test-design-handlers.ts
 * IPC handlers for Phase 48 Test Design Intelligence Foundation.
 */

import {
  analyzeTestDesignInputSchema,
  getTestDesignHistoryInputSchema,
  getTestDesignInputSchema,
  regenerateTestDesignInputSchema,
  type TestDesignPlanDto,
} from '@ai-quality/contracts';
import {
  AiGatewayError,
  AiInvalidRequestError,
  AiPromptExecutionService,
  RequirementContextRetrievalService,
  TestDesignService,
} from '@ai-quality/core';
import { ZodError } from 'zod';

let defaultTestDesignService: TestDesignService | null = null;

export function getTestDesignService(): TestDesignService {
  if (!defaultTestDesignService) {
    defaultTestDesignService = new TestDesignService({
      retrievalService: new RequirementContextRetrievalService(),
      promptExecutionService: new AiPromptExecutionService(),
    });
  }
  return defaultTestDesignService;
}

export function setTestDesignServiceForTest(customService: TestDesignService | null): void {
  defaultTestDesignService = customService;
}

/**
 * Maps known Zod validation errors to domain AiInvalidRequestError.
 */
export function handleTestDesignServiceError(error: unknown): never {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const message = firstIssue ? firstIssue.message : 'Invalid test design request payload.';
    throw new AiInvalidRequestError(message);
  }
  if (error instanceof AiGatewayError) {
    throw error;
  }
  throw error;
}

/**
 * Handles test design analysis request.
 */
export async function handleAnalyzeTestDesign(
  rawInput: unknown,
  service: TestDesignService = getTestDesignService(),
): Promise<TestDesignPlanDto> {
  const parseResult = analyzeTestDesignInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleTestDesignServiceError(parseResult.error);
  }
  return service.analyzeTestDesign(parseResult.data);
}

/**
 * Handles get current test design request.
 */
export async function handleGetCurrentTestDesign(
  rawInput: unknown,
  service: TestDesignService = getTestDesignService(),
): Promise<TestDesignPlanDto | null> {
  const parseResult = getTestDesignInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleTestDesignServiceError(parseResult.error);
  }
  return service.getTestDesign(parseResult.data);
}

/**
 * Handles get test design history request.
 */
export async function handleGetTestDesignHistory(
  rawInput: unknown,
  service: TestDesignService = getTestDesignService(),
): Promise<readonly TestDesignPlanDto[]> {
  const parseResult = getTestDesignHistoryInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleTestDesignServiceError(parseResult.error);
  }
  return service.getTestDesignHistory(parseResult.data);
}

/**
 * Handles regenerate test design request.
 */
export async function handleRegenerateTestDesign(
  rawInput: unknown,
  service: TestDesignService = getTestDesignService(),
): Promise<TestDesignPlanDto> {
  const parseResult = regenerateTestDesignInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleTestDesignServiceError(parseResult.error);
  }
  return service.regenerateTestDesign(parseResult.data);
}
