/**
 * @file apps/desktop/src/main/ipc/approval-handlers.ts
 * Privileged IPC boundary handlers for V10 Phase 155: Human Approval Gates.
 *
 * Implements:
 * 1. desktop:approval:create (approval.create)
 * 2. desktop:approval:get (approval.get)
 * 3. desktop:approval:list (approval.list)
 * 4. desktop:approval:approve (approval.approve)
 * 5. desktop:approval:reject (approval.reject)
 * 6. desktop:approval:cancel (approval.cancel)
 * 7. desktop:approval:get-pending (approval.getPending)
 * 8. desktop:approval:get-audit-history
 *
 * Security:
 * - Sender frame verification (isTrustedIpcSender)
 * - User authentication (assertAuthenticated)
 * - Multi-tenant authorization (User -> Project -> Thread -> Task -> Approval)
 * - Strict Zod schema input validation
 * - Safe error mapping to DesktopResult
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type ApprovalRequestDto,
  type ApprovalAuditLogDto,
  type DesktopError,
  type DesktopResult,
  DESKTOP_CHANNELS,
  createApprovalInputSchema,
  getApprovalInputSchema,
  listApprovalsInputSchema,
  approveApprovalInputSchema,
  rejectApprovalInputSchema,
  cancelApprovalInputSchema,
  getPendingApprovalInputSchema,
} from '@ai-quality/contracts';
import {
  ApprovalService,
  ApprovalError,
  ApprovalNotFoundError,
  ApprovalAlreadyDecidedError,
  ApprovalExpiredError,
  ApprovalCancelledError,
  ApprovalActionModifiedError,
  ApprovalUnauthorizedError,
  ApprovalValidationError,
  ApprovalConflictError,
  UnauthorizedError,
  getPrismaClient,
} from '@ai-quality/core';
import { ZodError } from 'zod';
import { isTrustedIpcSender } from './sender-validation.js';
import { assertAuthenticated } from './auth-handlers.js';

let defaultApprovalService: ApprovalService | null = null;

export function resolveApprovalService(): ApprovalService {
  if (!defaultApprovalService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available for ApprovalService.');
    }
    defaultApprovalService = new ApprovalService({ prisma });
  }
  return defaultApprovalService;
}

export function setApprovalServiceForTest(service: ApprovalService | null): void {
  defaultApprovalService = service;
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

  if (err instanceof ApprovalNotFoundError) {
    return {
      code: 'APPROVAL_NOT_FOUND',
      message: err.message,
    };
  }

  if (err instanceof ApprovalAlreadyDecidedError) {
    return {
      code: 'APPROVAL_ALREADY_DECIDED',
      message: err.message,
    };
  }

  if (err instanceof ApprovalExpiredError) {
    return {
      code: 'APPROVAL_EXPIRED',
      message: err.message,
    };
  }

  if (err instanceof ApprovalCancelledError) {
    return {
      code: 'APPROVAL_CANCELLED',
      message: err.message,
    };
  }

  if (err instanceof ApprovalActionModifiedError) {
    return {
      code: 'APPROVAL_ACTION_MODIFIED',
      message: err.message,
    };
  }

  if (err instanceof ApprovalUnauthorizedError || err instanceof UnauthorizedError) {
    return {
      code: 'APPROVAL_UNAUTHORIZED',
      message: err.message,
    };
  }

  if (err instanceof ApprovalValidationError) {
    return {
      code: 'APPROVAL_VALIDATION_ERROR',
      message: err.message,
    };
  }

  if (err instanceof ApprovalConflictError) {
    return {
      code: 'APPROVAL_CONFLICT',
      message: err.message,
    };
  }

  if (err instanceof ApprovalError) {
    return {
      code: 'INTERNAL_ERROR',
      message: err.message,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: err instanceof Error ? err.message : 'An unexpected error occurred.',
  };
}

export async function handleCreateApproval(
  event: IpcMainInvokeEvent,
  rawInput: unknown,
): Promise<DesktopResult<ApprovalRequestDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = createApprovalInputSchema.parse(rawInput);
    const service = resolveApprovalService();
    const result = await service.createRequest(parsed, userId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetApproval(
  event: IpcMainInvokeEvent,
  rawInput: unknown,
): Promise<DesktopResult<ApprovalRequestDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = getApprovalInputSchema.parse(rawInput);
    const service = resolveApprovalService();
    const result = await service.getRequest(parsed, userId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListApprovals(
  event: IpcMainInvokeEvent,
  rawInput: unknown,
): Promise<DesktopResult<readonly ApprovalRequestDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = listApprovalsInputSchema.parse(rawInput);
    const service = resolveApprovalService();
    const result = await service.listRequests(parsed, userId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleApproveApproval(
  event: IpcMainInvokeEvent,
  rawInput: unknown,
): Promise<DesktopResult<ApprovalRequestDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = approveApprovalInputSchema.parse(rawInput);
    const service = resolveApprovalService();
    const result = await service.approve(parsed, userId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleRejectApproval(
  event: IpcMainInvokeEvent,
  rawInput: unknown,
): Promise<DesktopResult<ApprovalRequestDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = rejectApprovalInputSchema.parse(rawInput);
    const service = resolveApprovalService();
    const result = await service.reject(parsed, userId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleCancelApproval(
  event: IpcMainInvokeEvent,
  rawInput: unknown,
): Promise<DesktopResult<ApprovalRequestDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = cancelApprovalInputSchema.parse(rawInput);
    const service = resolveApprovalService();
    const result = await service.cancel(parsed, userId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetPendingApproval(
  event: IpcMainInvokeEvent,
  rawInput: unknown,
): Promise<DesktopResult<ApprovalRequestDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = getPendingApprovalInputSchema.parse(rawInput);
    const service = resolveApprovalService();
    const result = await service.getPendingRequest(parsed, userId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetApprovalAuditHistory(
  event: IpcMainInvokeEvent,
  rawInput: unknown,
): Promise<DesktopResult<readonly ApprovalAuditLogDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = getApprovalInputSchema.parse(rawInput);
    const service = resolveApprovalService();
    const result = await service.getAuditHistory(parsed, userId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export function registerApprovalIpcHandlers(ipcMain: Electron.IpcMain): () => void {
  const channelPairs = [
    [DESKTOP_CHANNELS.APPROVAL_CREATE, handleCreateApproval],
    ['approval.create', handleCreateApproval],
    [DESKTOP_CHANNELS.APPROVAL_GET, handleGetApproval],
    ['approval.get', handleGetApproval],
    [DESKTOP_CHANNELS.APPROVAL_LIST, handleListApprovals],
    ['approval.list', handleListApprovals],
    [DESKTOP_CHANNELS.APPROVAL_APPROVE, handleApproveApproval],
    ['approval.approve', handleApproveApproval],
    [DESKTOP_CHANNELS.APPROVAL_REJECT, handleRejectApproval],
    ['approval.reject', handleRejectApproval],
    [DESKTOP_CHANNELS.APPROVAL_CANCEL, handleCancelApproval],
    ['approval.cancel', handleCancelApproval],
    [DESKTOP_CHANNELS.APPROVAL_GET_PENDING, handleGetPendingApproval],
    ['approval.getPending', handleGetPendingApproval],
    [DESKTOP_CHANNELS.APPROVAL_GET_AUDIT_HISTORY, handleGetApprovalAuditHistory],
  ] as const;

  for (const [channel, handler] of channelPairs) {
    ipcMain.handle(channel, (event, input) => handler(event, input));
  }

  return () => {
    for (const [channel] of channelPairs) {
      ipcMain.removeHandler(channel);
    }
  };
}
