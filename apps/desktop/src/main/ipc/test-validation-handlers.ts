/**
 * @file apps/desktop/src/main/ipc/test-validation-handlers.ts
 * IPC handlers for Phase 53 AI Test Generation Validation & Hallucination Controls.
 */

import {
  validateTestCaseInputSchema,
  validateSpecificationInputSchema,
  validateTestBatchInputSchema,
  getLatestValidationInputSchema,
  listValidationHistoryInputSchema,
  type ValidateTestCaseInputDto,
  type ValidateSpecificationInputDto,
  type ValidateTestBatchInputDto,
  type GetLatestValidationInputDto,
  type ListValidationHistoryInputDto,
  type TestCaseValidationDto,
  type BatchValidationResultDto,
} from '@ai-quality/contracts';
import {
  getPrismaClient,
  TestGenerationValidationService,
  TestValidationError,
  TestValidationExecutionError,
} from '@ai-quality/core';

let serviceInstance: TestGenerationValidationService | null = null;

export function getTestGenerationValidationService(): TestGenerationValidationService {
  if (serviceInstance) return serviceInstance;

  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Database client is not initialized.');
  }

  serviceInstance = new TestGenerationValidationService(prisma);
  return serviceInstance;
}

export function setTestGenerationValidationServiceForTest(
  service: TestGenerationValidationService | null,
): void {
  serviceInstance = service;
}

export async function handleValidateTestCase(
  payload: unknown,
  service?: TestGenerationValidationService,
): Promise<TestCaseValidationDto> {
  const parseResult = validateTestCaseInputSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new TestValidationError(`Invalid validate test case input: ${parseResult.error.message}`);
  }

  const s = service ?? getTestGenerationValidationService();
  const input: ValidateTestCaseInputDto = parseResult.data;

  try {
    return await s.validateTestCase(input);
  } catch (err: unknown) {
    if (err instanceof TestValidationError) {
      throw err;
    }
    throw new TestValidationExecutionError(err instanceof Error ? err.message : String(err));
  }
}

export async function handleValidateSpecification(
  payload: unknown,
  service?: TestGenerationValidationService,
): Promise<TestCaseValidationDto> {
  const parseResult = validateSpecificationInputSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new TestValidationError(
      `Invalid validate specification input: ${parseResult.error.message}`,
    );
  }

  const s = service ?? getTestGenerationValidationService();
  const input: ValidateSpecificationInputDto = parseResult.data;

  try {
    return await s.validateSpecification(input);
  } catch (err: unknown) {
    if (err instanceof TestValidationError) {
      throw err;
    }
    throw new TestValidationExecutionError(err instanceof Error ? err.message : String(err));
  }
}

export async function handleValidateBatch(
  payload: unknown,
  service?: TestGenerationValidationService,
): Promise<BatchValidationResultDto> {
  const parseResult = validateTestBatchInputSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new TestValidationError(`Invalid validate batch input: ${parseResult.error.message}`);
  }

  const s = service ?? getTestGenerationValidationService();
  const input: ValidateTestBatchInputDto = parseResult.data;

  try {
    return await s.validateBatch(input);
  } catch (err: unknown) {
    if (err instanceof TestValidationError) {
      throw err;
    }
    throw new TestValidationExecutionError(err instanceof Error ? err.message : String(err));
  }
}

export async function handleGetLatestValidation(
  payload: unknown,
  service?: TestGenerationValidationService,
): Promise<TestCaseValidationDto | null> {
  const parseResult = getLatestValidationInputSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new TestValidationError(
      `Invalid get latest validation input: ${parseResult.error.message}`,
    );
  }

  const s = service ?? getTestGenerationValidationService();
  const input: GetLatestValidationInputDto = parseResult.data;

  try {
    return await s.getLatestValidation(input);
  } catch (err: unknown) {
    if (err instanceof TestValidationError) {
      throw err;
    }
    throw new TestValidationExecutionError(err instanceof Error ? err.message : String(err));
  }
}

export async function handleListValidationHistory(
  payload: unknown,
  service?: TestGenerationValidationService,
): Promise<readonly TestCaseValidationDto[]> {
  const parseResult = listValidationHistoryInputSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new TestValidationError(
      `Invalid list validation history input: ${parseResult.error.message}`,
    );
  }

  const s = service ?? getTestGenerationValidationService();
  const input: ListValidationHistoryInputDto = parseResult.data;

  try {
    return await s.listValidationHistory(input);
  } catch (err: unknown) {
    if (err instanceof TestValidationError) {
      throw err;
    }
    throw new TestValidationExecutionError(err instanceof Error ? err.message : String(err));
  }
}
