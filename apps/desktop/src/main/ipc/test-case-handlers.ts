/**
 * @file apps/desktop/src/main/ipc/test-case-handlers.ts
 * IPC handlers for Phase 52 Structured Test Case operations.
 */

import {
  createTestCaseInputSchema,
  persistGeneratedTestCaseInputSchema,
  persistGeneratedTestCasesBatchInputSchema,
  listTestCasesInputSchema,
  getTestCaseByIdInputSchema,
  deleteTestCaseInputSchema,
  type CreateTestCaseInputDto,
  type PersistGeneratedTestCaseInputDto,
  type PersistGeneratedTestCasesBatchInputDto,
  type ListTestCasesInputDto,
  type GetTestCaseByIdInputDto,
  type DeleteTestCaseInputDto,
  type TestCaseDetailDto,
  type TestCaseListResultDto,
  type BatchPersistTestCasesResultDto,
} from '@ai-quality/contracts';
import {
  getPrismaClient,
  TestCaseService,
  TestCaseError,
  TestCaseValidationError,
  TestCasePersistenceError,
} from '@ai-quality/core';

let serviceInstance: TestCaseService | null = null;

export function getTestCaseService(): TestCaseService {
  if (serviceInstance) return serviceInstance;

  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Database client is not initialized.');
  }

  serviceInstance = new TestCaseService(prisma);
  return serviceInstance;
}

export function setTestCaseServiceForTest(service: TestCaseService | null): void {
  serviceInstance = service;
}

export async function handleCreateTestCase(
  payload: unknown,
  service?: TestCaseService,
): Promise<TestCaseDetailDto> {
  const parseResult = createTestCaseInputSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new TestCaseValidationError(`Invalid test case input: ${parseResult.error.message}`);
  }

  const s = service ?? getTestCaseService();
  const input: CreateTestCaseInputDto = parseResult.data;

  try {
    return await s.createTestCase(input);
  } catch (err: unknown) {
    if (err instanceof TestCaseError) {
      throw err;
    }
    throw new TestCasePersistenceError(err instanceof Error ? err.message : String(err), err);
  }
}

export async function handleGetTestCaseById(
  payload: unknown,
  service?: TestCaseService,
): Promise<TestCaseDetailDto | null> {
  const parseResult = getTestCaseByIdInputSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new TestCaseValidationError(`Invalid get test case input: ${parseResult.error.message}`);
  }

  const s = service ?? getTestCaseService();
  const input: GetTestCaseByIdInputDto = parseResult.data;

  try {
    return await s.getTestCaseById(input);
  } catch (err: unknown) {
    if (err instanceof TestCaseError) {
      throw err;
    }
    throw new TestCasePersistenceError(err instanceof Error ? err.message : String(err), err);
  }
}

export async function handleListTestCases(
  payload: unknown,
  service?: TestCaseService,
): Promise<TestCaseListResultDto> {
  const parseResult = listTestCasesInputSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new TestCaseValidationError(
      `Invalid list test cases input: ${parseResult.error.message}`,
    );
  }

  const s = service ?? getTestCaseService();
  const input: ListTestCasesInputDto = parseResult.data;

  try {
    return await s.listTestCases(input);
  } catch (err: unknown) {
    if (err instanceof TestCaseError) {
      throw err;
    }
    throw new TestCasePersistenceError(err instanceof Error ? err.message : String(err), err);
  }
}

export async function handlePersistFromGeneration(
  payload: unknown,
  service?: TestCaseService,
): Promise<TestCaseDetailDto> {
  const parseResult = persistGeneratedTestCaseInputSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new TestCaseValidationError(
      `Invalid persist test case input: ${parseResult.error.message}`,
    );
  }

  const s = service ?? getTestCaseService();
  const input: PersistGeneratedTestCaseInputDto = parseResult.data;

  try {
    return await s.persistFromGeneration(input);
  } catch (err: unknown) {
    if (err instanceof TestCaseError) {
      throw err;
    }
    throw new TestCasePersistenceError(err instanceof Error ? err.message : String(err), err);
  }
}

export async function handlePersistBatchFromGeneration(
  payload: unknown,
  service?: TestCaseService,
): Promise<BatchPersistTestCasesResultDto> {
  const parseResult = persistGeneratedTestCasesBatchInputSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new TestCaseValidationError(
      `Invalid persist batch test cases input: ${parseResult.error.message}`,
    );
  }

  const s = service ?? getTestCaseService();
  const input: PersistGeneratedTestCasesBatchInputDto = parseResult.data;

  try {
    return await s.persistBatchFromGeneration(input);
  } catch (err: unknown) {
    if (err instanceof TestCaseError) {
      throw err;
    }
    throw new TestCasePersistenceError(err instanceof Error ? err.message : String(err), err);
  }
}

export async function handleDeleteTestCase(
  payload: unknown,
  service?: TestCaseService,
): Promise<{ readonly deleted: true }> {
  const parseResult = deleteTestCaseInputSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new TestCaseValidationError(
      `Invalid delete test case input: ${parseResult.error.message}`,
    );
  }

  const s = service ?? getTestCaseService();
  const input: DeleteTestCaseInputDto = parseResult.data;

  try {
    return await s.deleteTestCase(input);
  } catch (err: unknown) {
    if (err instanceof TestCaseError) {
      throw err;
    }
    throw new TestCasePersistenceError(err instanceof Error ? err.message : String(err), err);
  }
}
