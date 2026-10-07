/**
 * @file apps/desktop/src/main/ipc/agent-tool-permission-handlers.ts
 * Privileged IPC handlers for V10 Phase 144 Tool Permission System.
 *
 * Exposes:
 * - List approvals
 * - Get approval
 * - Decide approval (APPROVE / REJECT)
 * - List tool audit logs
 *
 * Enforces authenticated sender verification, project tenant isolation, and strict input/output validation.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  AgentPermissionService,
  AgentPermissionError,
  AgentToolPermissionDeniedError,
  AgentToolApprovalRequiredError,
  AgentToolApprovalNotFoundError,
  AgentToolApprovalAlreadyDecidedError,
  AiCrossProjectAccessError,
  AiInvalidRequestError,
  UnauthorizedError,
} from '@ai-quality/core';
import {
  listAgentToolApprovalsInputSchema,
  getAgentToolApprovalInputSchema,
  decideAgentToolApprovalInputSchema,
  listAgentToolAuditLogsInputSchema,
  type ListAgentToolApprovalsInputDto,
  type GetAgentToolApprovalInputDto,
  type DecideAgentToolApprovalInputDto,
  type ListAgentToolAuditLogsInputDto,
  type AgentToolApprovalDto,
  type AgentToolAuditLogDto,
  type DesktopResult,
  type DesktopErrorCode,
} from '@ai-quality/contracts';
import { ZodError } from 'zod';
import { assertAuthenticated } from './auth-handlers.js';
import { isTrustedIpcSender } from './sender-validation.js';

let defaultAgentPermissionService: AgentPermissionService | null = null;

export function getAgentPermissionService(): AgentPermissionService {
  if (!defaultAgentPermissionService) {
    defaultAgentPermissionService = new AgentPermissionService();
  }
  return defaultAgentPermissionService;
}

export function setAgentPermissionServiceForTest(service: AgentPermissionService | null): void {
  defaultAgentPermissionService = service;
}

async function extractUser(event?: IpcMainInvokeEvent): Promise<string> {
  if (!event) {
    throw new UnauthorizedError('Authentication required.');
  }
  const user = await assertAuthenticated(event);
  return user.userId;
}

function mapErrorToResult<T>(err: unknown): DesktopResult<T> {
  let code: DesktopErrorCode = 'AGENT_RUNTIME_ERROR';
  let message = 'An unexpected error occurred in tool permission system.';

  if (err instanceof AgentToolPermissionDeniedError) {
    code = 'TOOL_PERMISSION_DENIED';
    message = err.message;
  } else if (err instanceof AgentToolApprovalRequiredError) {
    code = 'TOOL_APPROVAL_REQUIRED';
    message = err.message;
  } else if (err instanceof AgentToolApprovalNotFoundError) {
    code = 'TOOL_APPROVAL_NOT_FOUND';
    message = err.message;
  } else if (err instanceof AgentToolApprovalAlreadyDecidedError) {
    code = 'TOOL_APPROVAL_ALREADY_DECIDED';
    message = err.message;
  } else if (err instanceof AiCrossProjectAccessError) {
    code = 'AI_CROSS_PROJECT_ACCESS';
    message = err.message;
  } else if (err instanceof AiInvalidRequestError) {
    code = 'AI_INVALID_REQUEST';
    message = err.message;
  } else if (err instanceof UnauthorizedError) {
    code = 'AUTHENTICATION_FAILED';
    message = err.message;
  } else if (err instanceof ZodError) {
    code = 'VALIDATION_ERROR';
    message = err.errors.map(e => e.message).join(' ');
  } else if (err instanceof AgentPermissionError) {
    code = err.code || 'AGENT_RUNTIME_ERROR';
    message = err.message;
  } else if (err instanceof Error) {
    message = err.message;
  }

  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}

export async function handleListToolApprovals(
  event: IpcMainInvokeEvent,
  input: ListAgentToolApprovalsInputDto,
): Promise<DesktopResult<readonly AgentToolApprovalDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const validated = listAgentToolApprovalsInputSchema.parse(input);
    const service = getAgentPermissionService();
    const data = await service.listApprovals(validated, userId);
    return { ok: true, data };
  } catch (err: unknown) {
    return mapErrorToResult(err);
  }
}

export async function handleGetToolApproval(
  event: IpcMainInvokeEvent,
  input: GetAgentToolApprovalInputDto,
): Promise<DesktopResult<AgentToolApprovalDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const validated = getAgentToolApprovalInputSchema.parse(input);
    const service = getAgentPermissionService();
    const data = await service.getApproval(validated, userId);
    return { ok: true, data };
  } catch (err: unknown) {
    return mapErrorToResult(err);
  }
}

export async function handleDecideToolApproval(
  event: IpcMainInvokeEvent,
  input: DecideAgentToolApprovalInputDto,
): Promise<DesktopResult<AgentToolApprovalDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const validated = decideAgentToolApprovalInputSchema.parse(input);
    const service = getAgentPermissionService();
    const data = await service.decideApproval(validated, userId);
    return { ok: true, data };
  } catch (err: unknown) {
    return mapErrorToResult(err);
  }
}

export async function handleListToolAuditLogs(
  event: IpcMainInvokeEvent,
  input: ListAgentToolAuditLogsInputDto,
): Promise<DesktopResult<readonly AgentToolAuditLogDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const validated = listAgentToolAuditLogsInputSchema.parse(input);
    const service = getAgentPermissionService();
    const data = await service.listAuditLogs(validated, userId);
    return { ok: true, data };
  } catch (err: unknown) {
    return mapErrorToResult(err);
  }
}
