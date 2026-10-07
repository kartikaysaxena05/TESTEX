/**
 * @file apps/desktop/src/main/ipc/git-review-handlers.ts
 * Privileged IPC handlers for V10 Phase 150: Git Diff & Change Review.
 *
 * Exposes strictly typed boundary handlers for:
 * 1. get current Git status
 * 2. get diff (working tree, staged, commits)
 * 3. create change review
 * 4. retrieve review
 * 5. approve review
 * 6. reject review
 *
 * Validates every input at the IPC boundary and enforces sender origin verification.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type GitWorkingStatusDto,
  type GitDiffResultDto,
  type AgentGitChangeReviewDto,
  type DesktopError,
  type DesktopResult,
  gitDiffGetStatusInputSchema,
  gitDiffGetInputSchema,
  createGitChangeReviewInputSchema,
  getGitChangeReviewInputSchema,
  approveGitChangeReviewInputSchema,
  rejectGitChangeReviewInputSchema,
} from '@ai-quality/contracts';
import {
  GitChangeReviewService,
  GitReviewError,
  AiCrossProjectAccessError,
  AiInvalidRequestError,
  UnauthorizedError,
  getPrismaClient,
} from '@ai-quality/core';
import { ZodError } from 'zod';
import { isTrustedIpcSender } from './sender-validation.js';
import { assertAuthenticated } from './auth-handlers.js';

let defaultGitChangeReviewService: GitChangeReviewService | null = null;

export function resolveGitChangeReviewService(): GitChangeReviewService {
  if (!defaultGitChangeReviewService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available for GitChangeReviewService.');
    }
    defaultGitChangeReviewService = new GitChangeReviewService({ prisma });
  }
  return defaultGitChangeReviewService;
}

export function setGitChangeReviewServiceForTest(service: GitChangeReviewService | null): void {
  defaultGitChangeReviewService = service;
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
      message: err.errors.map((e) => e.message).join(' '),
    };
  }

  if (err instanceof GitReviewError) {
    return {
      code: 'INVALID_REQUEST',
      message: err.message,
    };
  }

  if (err instanceof AiCrossProjectAccessError) {
    return {
      code: 'AI_CROSS_PROJECT_ACCESS',
      message: err.message,
    };
  }

  if (err instanceof AiInvalidRequestError) {
    return {
      code: 'AI_INVALID_REQUEST',
      message: err.message,
    };
  }

  if (err instanceof UnauthorizedError) {
    return {
      code: 'AUTHENTICATION_FAILED',
      message: err.message,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    code: 'INTERNAL_ERROR',
    message,
  };
}

/**
 * 1. Get current Git status
 */
export async function handleGetGitWorkingStatus(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<GitWorkingStatusDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = gitDiffGetStatusInputSchema.parse(input);
    const service = resolveGitChangeReviewService();
    const result = await service.getStatus(parsed, userId);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

/**
 * 2. Get Git diff
 */
export async function handleGetGitDiff(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<GitDiffResultDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = gitDiffGetInputSchema.parse(input);
    const service = resolveGitChangeReviewService();
    const result = await service.getDiff(parsed, userId);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

/**
 * 3. Create Change Review
 */
export async function handleCreateGitChangeReview(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentGitChangeReviewDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = createGitChangeReviewInputSchema.parse(input);
    const service = resolveGitChangeReviewService();
    const result = await service.createReview(parsed, userId);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

/**
 * 4. Retrieve Change Review
 */
export async function handleGetGitChangeReview(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentGitChangeReviewDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = getGitChangeReviewInputSchema.parse(input);
    const service = resolveGitChangeReviewService();
    const result = await service.getReview(parsed, userId);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

/**
 * 5. Approve Change Review
 */
export async function handleApproveGitChangeReview(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentGitChangeReviewDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = approveGitChangeReviewInputSchema.parse(input);
    const service = resolveGitChangeReviewService();
    const result = await service.approveReview(parsed, userId);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

/**
 * 6. Reject Change Review
 */
export async function handleRejectGitChangeReview(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentGitChangeReviewDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = rejectGitChangeReviewInputSchema.parse(input);
    const service = resolveGitChangeReviewService();
    const result = await service.rejectReview(parsed, userId);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}
