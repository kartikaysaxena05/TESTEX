/**
 * @file apps/desktop/src/main/ipc/file-review-handlers.ts
 * Privileged IPC boundary handlers for V10 Phase 156: File & Diff Review Workspace.
 *
 * Implements:
 * 1. desktop:file-review:create (fileReview.create)
 * 2. desktop:file-review:get (fileReview.get)
 * 3. desktop:file-review:list (fileReview.list)
 * 4. desktop:file-review:approve (fileReview.approve)
 * 5. desktop:file-review:reject (fileReview.reject)
 * 6. desktop:file-review:cancel (fileReview.cancel)
 * 7. desktop:file-review:apply (fileReview.apply)
 * 8. desktop:file-review:get-file-content (fileReview.getFileContent)
 *
 * Security:
 * - Sender frame verification (isTrustedIpcSender)
 * - User authentication (assertAuthenticated)
 * - Multi-tenant authorization (userId -> projectId -> threadId -> taskId -> reviewId)
 * - Strict Zod schema input validation
 * - Safe error mapping to DesktopResult
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type FileDiffReviewDto,
  type ApplyFileReviewResultDto,
  type FileReviewContentDto,
  type DesktopError,
  type DesktopErrorCode,
  type DesktopResult,
  DESKTOP_CHANNELS,
  createFileReviewInputSchema,
  getFileReviewInputSchema,
  listFileReviewsInputSchema,
  approveFileReviewInputSchema,
  rejectFileReviewInputSchema,
  cancelFileReviewInputSchema,
  applyFileReviewInputSchema,
  getFileReviewContentInputSchema,
} from '@ai-quality/contracts';
import {
  FileReviewService,
  FileReviewError,
  FileReviewNotFoundError,
  FileReviewAlreadyDecidedError,
  FileReviewNotApprovedError,
  FileReviewAlreadyAppliedError,
  FileReviewInvalidStateTransitionError,
  FileReviewPathTraversalError,
  FileReviewFileNotFoundError,
  FileReviewFileTooLargeError,
  FileReviewUnauthorizedError,
  FileReviewValidationError,
  FileReviewApplyFailedError,
  FileReviewChecksumMismatchError,
  UnauthorizedError,
  getPrismaClient,
} from '@ai-quality/core';
import { ZodError } from 'zod';
import { isTrustedIpcSender } from './sender-validation.js';
import { assertAuthenticated } from './auth-handlers.js';

let defaultFileReviewService: FileReviewService | null = null;

export function resolveFileReviewService(): FileReviewService {
  if (!defaultFileReviewService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available for FileReviewService.');
    }
    defaultFileReviewService = new FileReviewService({ prisma });
  }
  return defaultFileReviewService;
}

export function setFileReviewServiceForTest(service: FileReviewService | null): void {
  defaultFileReviewService = service;
}

async function extractUser(event?: IpcMainInvokeEvent): Promise<string> {
  if (!event) {
    throw new UnauthorizedError('Authentication required.');
  }
  const user = await assertAuthenticated(event);
  return user.userId;
}

function sanitizeError(err: unknown): DesktopError {
  if (err instanceof ZodError) {
    return {
      code: 'VALIDATION_ERROR',
      message: `IPC validation failed: ${err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
    };
  }

  if (err instanceof FileReviewNotFoundError) {
    return {
      code: 'FILE_REVIEW_NOT_FOUND',
      message: err.message,
    };
  }

  if (err instanceof FileReviewAlreadyDecidedError) {
    return {
      code: 'FILE_REVIEW_ALREADY_DECIDED',
      message: err.message,
    };
  }

  if (err instanceof FileReviewNotApprovedError) {
    return {
      code: 'FILE_REVIEW_NOT_APPROVED',
      message: err.message,
    };
  }

  if (err instanceof FileReviewAlreadyAppliedError) {
    return {
      code: 'FILE_REVIEW_ALREADY_APPLIED',
      message: err.message,
    };
  }

  if (err instanceof FileReviewInvalidStateTransitionError) {
    return {
      code: 'FILE_REVIEW_INVALID_STATE_TRANSITION',
      message: err.message,
    };
  }

  if (err instanceof FileReviewPathTraversalError) {
    return {
      code: 'FILE_REVIEW_PATH_TRAVERSAL',
      message: err.message,
    };
  }

  if (err instanceof FileReviewFileNotFoundError) {
    return {
      code: 'FILE_REVIEW_FILE_NOT_FOUND',
      message: err.message,
    };
  }

  if (err instanceof FileReviewFileTooLargeError) {
    return {
      code: 'FILE_REVIEW_FILE_TOO_LARGE',
      message: err.message,
    };
  }

  if (err instanceof FileReviewUnauthorizedError) {
    return {
      code: 'FILE_REVIEW_UNAUTHORIZED',
      message: err.message,
    };
  }

  if (err instanceof FileReviewValidationError) {
    return {
      code: 'FILE_REVIEW_VALIDATION_ERROR',
      message: err.message,
    };
  }

  if (err instanceof FileReviewApplyFailedError) {
    return {
      code: 'FILE_REVIEW_APPLY_FAILED',
      message: err.message,
    };
  }

  if (err instanceof FileReviewChecksumMismatchError) {
    return {
      code: 'FILE_REVIEW_CHECKSUM_MISMATCH',
      message: err.message,
    };
  }

  if (err instanceof UnauthorizedError) {
    return {
      code: 'UNAUTHORIZED',
      message: err.message,
    };
  }

  if (err instanceof FileReviewError) {
    return {
      code: (err.code as DesktopErrorCode) ?? 'INTERNAL_ERROR',
      message: err.message,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: err instanceof Error ? err.message : 'An unexpected error occurred.',
  };
}

export async function handleCreateFileReview(
  event: IpcMainInvokeEvent,
  rawInput: unknown,
): Promise<DesktopResult<FileDiffReviewDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const parsed = createFileReviewInputSchema.parse(rawInput);
    const service = resolveFileReviewService();
    const data = await service.createReview(parsed, userId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetFileReview(
  event: IpcMainInvokeEvent,
  rawInput: unknown,
): Promise<DesktopResult<FileDiffReviewDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const parsed = getFileReviewInputSchema.parse(rawInput);
    const service = resolveFileReviewService();
    const data = await service.getReview(parsed, userId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListFileReviews(
  event: IpcMainInvokeEvent,
  rawInput: unknown,
): Promise<DesktopResult<readonly FileDiffReviewDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const parsed = listFileReviewsInputSchema.parse(rawInput);
    const service = resolveFileReviewService();
    const data = await service.listReviews(parsed, userId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleApproveFileReview(
  event: IpcMainInvokeEvent,
  rawInput: unknown,
): Promise<DesktopResult<FileDiffReviewDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const parsed = approveFileReviewInputSchema.parse(rawInput);
    const service = resolveFileReviewService();
    const data = await service.approveReview(parsed, userId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleRejectFileReview(
  event: IpcMainInvokeEvent,
  rawInput: unknown,
): Promise<DesktopResult<FileDiffReviewDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const parsed = rejectFileReviewInputSchema.parse(rawInput);
    const service = resolveFileReviewService();
    const data = await service.rejectReview(parsed, userId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleCancelFileReview(
  event: IpcMainInvokeEvent,
  rawInput: unknown,
): Promise<DesktopResult<FileDiffReviewDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const parsed = cancelFileReviewInputSchema.parse(rawInput);
    const service = resolveFileReviewService();
    const data = await service.cancelReview(parsed, userId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleApplyFileReview(
  event: IpcMainInvokeEvent,
  rawInput: unknown,
): Promise<DesktopResult<ApplyFileReviewResultDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const parsed = applyFileReviewInputSchema.parse(rawInput);
    const service = resolveFileReviewService();
    const data = await service.applyReview(parsed, userId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetFileReviewContent(
  event: IpcMainInvokeEvent,
  rawInput: unknown,
): Promise<DesktopResult<FileReviewContentDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const parsed = getFileReviewContentInputSchema.parse(rawInput);
    const service = resolveFileReviewService();
    const data = await service.getFileContent(parsed, userId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export function registerFileReviewHandlers(ipc: Electron.IpcMain): () => void {
  const channelPairs = [
    [DESKTOP_CHANNELS.FILE_REVIEW_CREATE, handleCreateFileReview],
    ['fileReview.create', handleCreateFileReview],
    [DESKTOP_CHANNELS.FILE_REVIEW_GET, handleGetFileReview],
    ['fileReview.get', handleGetFileReview],
    [DESKTOP_CHANNELS.FILE_REVIEW_LIST, handleListFileReviews],
    ['fileReview.list', handleListFileReviews],
    [DESKTOP_CHANNELS.FILE_REVIEW_APPROVE, handleApproveFileReview],
    ['fileReview.approve', handleApproveFileReview],
    [DESKTOP_CHANNELS.FILE_REVIEW_REJECT, handleRejectFileReview],
    ['fileReview.reject', handleRejectFileReview],
    [DESKTOP_CHANNELS.FILE_REVIEW_CANCEL, handleCancelFileReview],
    ['fileReview.cancel', handleCancelFileReview],
    [DESKTOP_CHANNELS.FILE_REVIEW_APPLY, handleApplyFileReview],
    ['fileReview.apply', handleApplyFileReview],
    [DESKTOP_CHANNELS.FILE_REVIEW_GET_FILE_CONTENT, handleGetFileReviewContent],
    ['fileReview.getFileContent', handleGetFileReviewContent],
  ] as const;

  for (const [channel, handler] of channelPairs) {
    ipc.handle(channel, (event, input) => handler(event, input));
  }

  return () => {
    for (const [channel] of channelPairs) {
      ipc.removeHandler(channel);
    }
  };
}
