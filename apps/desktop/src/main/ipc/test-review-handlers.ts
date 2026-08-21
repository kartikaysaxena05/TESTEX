/**
 * @file apps/desktop/src/main/ipc/test-review-handlers.ts
 * IPC handlers for Phase 56 Test Review, Approval, Regeneration & Versioning.
 */

import type { IpcMainInvokeEvent } from 'electron';
import type {
  DesktopResult,
  TestHistoryResultDto,
  TestReviewDetailDto,
  TestReviewQueueResultDto,
  TestVersionDiffDto,
} from '@ai-quality/contracts';
import {
  approveTestVersionInputSchema,
  compareTestVersionsInputSchema,
  editTestCaseInputSchema,
  getTestHistoryInputSchema,
  getTestReviewDetailInputSchema,
  listTestReviewQueueInputSchema,
  regenerateTestCaseInputSchema,
  rejectTestVersionInputSchema,
} from '@ai-quality/contracts';
import {
  AppLogger,
  getPrismaClient,
  TestRegenerationFailedError,
  TestReviewNotFoundError,
  TestReviewProjectMismatchError,
  TestReviewService,
  TestReviewValidationError,
  TestVersionConflictError,
  TestVersionNotFoundError,
} from '@ai-quality/core';

let testReviewServiceInstance: TestReviewService | null = null;

function getTestReviewService(): TestReviewService {
  if (!testReviewServiceInstance) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not initialized.');
    }
    const logger = new AppLogger();
    testReviewServiceInstance = new TestReviewService({ prisma, logger });
  }
  return testReviewServiceInstance;
}

export function setTestReviewServiceForTesting(service: TestReviewService | null): void {
  testReviewServiceInstance = service;
}

export async function handleListTestReviewQueue(
  _event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<TestReviewQueueResultDto>> {
  const parsed = listTestReviewQueueInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'TEST_REVIEW_VALIDATION_FAILED',
        message: parsed.error.issues.map(i => i.message).join('; '),
      },
    };
  }

  try {
    const service = getTestReviewService();
    const data = await service.listReviewQueue(parsed.data);
    return { ok: true, data };
  } catch (err) {
    return mapErrorToDesktopResult(err);
  }
}

export async function handleGetTestReviewDetail(
  _event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<TestReviewDetailDto>> {
  const parsed = getTestReviewDetailInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'TEST_REVIEW_VALIDATION_FAILED',
        message: parsed.error.issues.map(i => i.message).join('; '),
      },
    };
  }

  try {
    const service = getTestReviewService();
    const data = await service.getReviewDetail(parsed.data);
    return { ok: true, data };
  } catch (err) {
    return mapErrorToDesktopResult(err);
  }
}

export async function handleApproveTestVersion(
  _event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<TestReviewDetailDto>> {
  const parsed = approveTestVersionInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'TEST_REVIEW_VALIDATION_FAILED',
        message: parsed.error.issues.map(i => i.message).join('; '),
      },
    };
  }

  try {
    const service = getTestReviewService();
    const data = await service.approveTestVersion(parsed.data);
    return { ok: true, data };
  } catch (err) {
    return mapErrorToDesktopResult(err);
  }
}

export async function handleRejectTestVersion(
  _event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<TestReviewDetailDto>> {
  const parsed = rejectTestVersionInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'TEST_REVIEW_VALIDATION_FAILED',
        message: parsed.error.issues.map(i => i.message).join('; '),
      },
    };
  }

  try {
    const service = getTestReviewService();
    const data = await service.rejectTestVersion(parsed.data);
    return { ok: true, data };
  } catch (err) {
    return mapErrorToDesktopResult(err);
  }
}

export async function handleEditTestCase(
  _event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<TestReviewDetailDto>> {
  const parsed = editTestCaseInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'TEST_REVIEW_VALIDATION_FAILED',
        message: parsed.error.issues.map(i => i.message).join('; '),
      },
    };
  }

  try {
    const service = getTestReviewService();
    const data = await service.editTestCase(parsed.data);
    return { ok: true, data };
  } catch (err) {
    return mapErrorToDesktopResult(err);
  }
}

export async function handleRegenerateTestCase(
  _event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<TestReviewDetailDto>> {
  const parsed = regenerateTestCaseInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'TEST_REVIEW_VALIDATION_FAILED',
        message: parsed.error.issues.map(i => i.message).join('; '),
      },
    };
  }

  try {
    const service = getTestReviewService();
    const data = await service.regenerateTestCase(parsed.data);
    return { ok: true, data };
  } catch (err) {
    return mapErrorToDesktopResult(err);
  }
}

export async function handleGetTestHistory(
  _event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<TestHistoryResultDto>> {
  const parsed = getTestHistoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'TEST_REVIEW_VALIDATION_FAILED',
        message: parsed.error.issues.map(i => i.message).join('; '),
      },
    };
  }

  try {
    const service = getTestReviewService();
    const data = await service.getTestHistory(parsed.data);
    return { ok: true, data };
  } catch (err) {
    return mapErrorToDesktopResult(err);
  }
}

export async function handleCompareTestVersions(
  _event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<TestVersionDiffDto>> {
  const parsed = compareTestVersionsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'TEST_REVIEW_VALIDATION_FAILED',
        message: parsed.error.issues.map(i => i.message).join('; '),
      },
    };
  }

  try {
    const service = getTestReviewService();
    const data = await service.compareTestVersions(parsed.data);
    return { ok: true, data };
  } catch (err) {
    return mapErrorToDesktopResult(err);
  }
}

function mapErrorToDesktopResult(err: unknown): DesktopResult<never> {
  if (err instanceof TestReviewNotFoundError) {
    return {
      ok: false,
      error: { code: 'TEST_REVIEW_NOT_FOUND', message: err.message },
    };
  }
  if (err instanceof TestVersionNotFoundError) {
    return {
      ok: false,
      error: { code: 'TEST_VERSION_NOT_FOUND', message: err.message },
    };
  }
  if (err instanceof TestVersionConflictError) {
    return {
      ok: false,
      error: { code: 'TEST_VERSION_CONFLICT', message: err.message },
    };
  }
  if (err instanceof TestReviewProjectMismatchError) {
    return {
      ok: false,
      error: { code: 'TEST_REVIEW_PROJECT_MISMATCH', message: err.message },
    };
  }
  if (err instanceof TestRegenerationFailedError) {
    return {
      ok: false,
      error: { code: 'TEST_REGENERATION_FAILED', message: err.message },
    };
  }
  if (err instanceof TestReviewValidationError) {
    return {
      ok: false,
      error: { code: 'TEST_REVIEW_VALIDATION_FAILED', message: err.message },
    };
  }

  return {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: err instanceof Error ? err.message : 'An unexpected error occurred.',
    },
  };
}
