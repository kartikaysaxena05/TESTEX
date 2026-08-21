/**
 * @file apps/desktop/src/main/ipc/specification-handlers.ts
 * IPC handlers for Phase 51 Test Specification Enrichment operations.
 */

import {
  enrichTestSpecificationInputSchema,
  getEnrichedTestSpecificationsInputSchema,
  type EnrichTestSpecificationInputDto,
  type GetEnrichedTestSpecificationsInputDto,
  type TestSpecificationEnrichmentResultDto,
} from '@ai-quality/contracts';
import {
  AiInvalidRequestError,
  ProjectNotFoundError,
  TestSpecificationEnrichmentService,
  TestSpecificationsGenerationFailedError,
  TestSpecificationsGroundingFailedError,
  TestSpecificationsProjectMismatchError,
  TestSpecificationsRequirementChangedError,
  TestSpecificationsRequirementNotFoundError,
  TestSpecificationsScenarioNotFoundError,
  TestSpecificationsSchemaValidationFailedError,
  getPrismaClient,
  type AiPromptExecutionService,
  type RequirementContextRetrievalService,
} from '@ai-quality/core';

let serviceInstance: TestSpecificationEnrichmentService | null = null;

export function getTestSpecificationService(
  promptExecutionService?: AiPromptExecutionService,
  retrievalService?: RequirementContextRetrievalService,
): TestSpecificationEnrichmentService {
  if (serviceInstance) return serviceInstance;

  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Database client is not initialized.');
  }

  if (!promptExecutionService || !retrievalService) {
    throw new Error(
      'TestSpecificationEnrichmentService requires promptExecutionService and retrievalService for initialization.',
    );
  }

  serviceInstance = new TestSpecificationEnrichmentService({
    prisma,
    promptExecutionService,
    retrievalService,
  });

  return serviceInstance;
}

export function setTestSpecificationServiceForTest(
  service: TestSpecificationEnrichmentService | null,
): void {
  serviceInstance = service;
}

export async function handleEnrichTestSpecifications(
  payload: unknown,
  service?: TestSpecificationEnrichmentService,
): Promise<TestSpecificationEnrichmentResultDto> {
  const parseResult = enrichTestSpecificationInputSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new AiInvalidRequestError(
      `Invalid enrich test specifications input: ${parseResult.error.message}`,
    );
  }

  const s = service ?? serviceInstance;
  if (!s) {
    throw new Error('TestSpecificationEnrichmentService is not available.');
  }

  const input: EnrichTestSpecificationInputDto = parseResult.data;

  try {
    return await s.enrichTestSpecifications(input);
  } catch (err: unknown) {
    if (
      err instanceof AiInvalidRequestError ||
      err instanceof ProjectNotFoundError ||
      err instanceof TestSpecificationsProjectMismatchError ||
      err instanceof TestSpecificationsRequirementNotFoundError ||
      err instanceof TestSpecificationsScenarioNotFoundError ||
      err instanceof TestSpecificationsGenerationFailedError ||
      err instanceof TestSpecificationsSchemaValidationFailedError ||
      err instanceof TestSpecificationsGroundingFailedError ||
      err instanceof TestSpecificationsRequirementChangedError
    ) {
      throw err;
    }
    throw new TestSpecificationsGenerationFailedError(
      err instanceof Error ? err.message : String(err),
    );
  }
}

export async function handleGetEnrichedTestSpecifications(
  payload: unknown,
  service?: TestSpecificationEnrichmentService,
): Promise<TestSpecificationEnrichmentResultDto | null> {
  const parseResult = getEnrichedTestSpecificationsInputSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new AiInvalidRequestError(
      `Invalid get enriched test specifications input: ${parseResult.error.message}`,
    );
  }

  const s = service ?? serviceInstance;
  if (!s) {
    throw new Error('TestSpecificationEnrichmentService is not available.');
  }

  const input: GetEnrichedTestSpecificationsInputDto = parseResult.data;

  try {
    return await s.getEnrichedTestSpecifications(input);
  } catch (err: unknown) {
    if (
      err instanceof AiInvalidRequestError ||
      err instanceof ProjectNotFoundError ||
      err instanceof TestSpecificationsProjectMismatchError ||
      err instanceof TestSpecificationsRequirementNotFoundError ||
      err instanceof TestSpecificationsScenarioNotFoundError
    ) {
      throw err;
    }
    throw new TestSpecificationsGenerationFailedError(
      err instanceof Error ? err.message : String(err),
    );
  }
}
