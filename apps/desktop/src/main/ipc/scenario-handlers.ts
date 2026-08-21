/**
 * @file apps/desktop/src/main/ipc/scenario-handlers.ts
 * IPC handlers for Phase 49 Requirement-to-Test Scenario Generation.
 */

import {
  generateScenariosInputSchema,
  getRequirementScenariosHistoryInputSchema,
  getRequirementScenariosInputSchema,
  regenerateRequirementScenariosInputSchema,
  type RequirementScenarioGenerationDto,
} from '@ai-quality/contracts';
import {
  AiGatewayError,
  AiInvalidRequestError,
  AiPromptExecutionService,
  RequirementContextRetrievalService,
  ScenarioGenerationError,
  ScenarioGenerationService,
} from '@ai-quality/core';
import { ZodError } from 'zod';

let defaultScenarioService: ScenarioGenerationService | null = null;

export function getScenarioService(): ScenarioGenerationService {
  if (!defaultScenarioService) {
    defaultScenarioService = new ScenarioGenerationService({
      retrievalService: new RequirementContextRetrievalService(),
      promptExecutionService: new AiPromptExecutionService(),
    });
  }
  return defaultScenarioService;
}

export function setScenarioServiceForTest(customService: ScenarioGenerationService | null): void {
  defaultScenarioService = customService;
}

/**
 * Maps known Zod validation errors to domain AiInvalidRequestError.
 */
export function handleScenarioServiceError(error: unknown): never {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const message = firstIssue
      ? firstIssue.message
      : 'Invalid scenario generation request payload.';
    throw new AiInvalidRequestError(message);
  }
  if (error instanceof ScenarioGenerationError || error instanceof AiGatewayError) {
    throw error;
  }
  throw error;
}

/**
 * Handles scenario generation request.
 */
export async function handleGenerateScenarios(
  rawInput: unknown,
  service: ScenarioGenerationService = getScenarioService(),
): Promise<RequirementScenarioGenerationDto> {
  const parseResult = generateScenariosInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleScenarioServiceError(parseResult.error);
  }
  return service.generateScenarios(parseResult.data);
}

/**
 * Handles get current scenarios request.
 */
export async function handleGetCurrentScenarios(
  rawInput: unknown,
  service: ScenarioGenerationService = getScenarioService(),
): Promise<RequirementScenarioGenerationDto | null> {
  const parseResult = getRequirementScenariosInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleScenarioServiceError(parseResult.error);
  }
  return service.getCurrentScenarios(parseResult.data);
}

/**
 * Handles get scenarios history request.
 */
export async function handleGetScenariosHistory(
  rawInput: unknown,
  service: ScenarioGenerationService = getScenarioService(),
): Promise<readonly RequirementScenarioGenerationDto[]> {
  const parseResult = getRequirementScenariosHistoryInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleScenarioServiceError(parseResult.error);
  }
  return service.getScenariosHistory(parseResult.data);
}

/**
 * Handles regenerate scenarios request.
 */
export async function handleRegenerateScenarios(
  rawInput: unknown,
  service: ScenarioGenerationService = getScenarioService(),
): Promise<RequirementScenarioGenerationDto> {
  const parseResult = regenerateRequirementScenariosInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleScenarioServiceError(parseResult.error);
  }
  return service.regenerateScenarios(parseResult.data);
}
