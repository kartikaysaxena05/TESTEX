/**
 * @file apps/desktop/src/main/ipc/agent-runtime-handlers.ts
 * Privileged IPC handlers for V10 Phase 141 Agent Runtime Foundation.
 * Handles task creation, retrieval, cancellation, and event queries.
 * Enforces authenticated sender verification and project tenant isolation.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  AgentRuntimeService,
  AgentRuntimeError,
  AgentInvalidStateTransitionError,
  AgentTimeoutError,
  AgentCancelledError,
  AgentMalformedResponseError,
  AgentUnauthorizedToolError,
  AiCrossProjectAccessError,
  AiInvalidRequestError,
  AiProviderService,
  UnauthorizedError,
} from '@ai-quality/core';
import {
  createAgentRuntimeTaskInputSchema,
  getAgentRuntimeTaskInputSchema,
  cancelAgentRuntimeTaskInputSchema,
  getAgentRuntimeTaskEventsInputSchema,
  type CreateAgentRuntimeTaskInputDto,
  type GetAgentRuntimeTaskInputDto,
  type CancelAgentRuntimeTaskInputDto,
  type GetAgentRuntimeTaskEventsInputDto,
  type AgentRuntimeTaskDto,
  type AgentRuntimeTaskEventDto,
  type DesktopResult,
  type DesktopErrorCode,
} from '@ai-quality/contracts';
import { ZodError } from 'zod';
import { assertAuthenticated } from './auth-handlers.js';
import { isTrustedIpcSender } from './sender-validation.js';

let defaultAgentRuntimeService: AgentRuntimeService | null = null;

export function getAgentRuntimeService(): AgentRuntimeService {
  if (!defaultAgentRuntimeService) {
    const aiProviderService = new AiProviderService();
    defaultAgentRuntimeService = new AgentRuntimeService(aiProviderService);
  }
  return defaultAgentRuntimeService;
}

export function setAgentRuntimeServiceForTest(service: AgentRuntimeService | null): void {
  defaultAgentRuntimeService = service;
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
  let message = 'An unexpected error occurred in agent runtime.';

  if (err instanceof AgentTimeoutError) {
    code = 'AGENT_TIMEOUT';
    message = err.message;
  } else if (err instanceof AgentCancelledError) {
    code = 'AGENT_CANCELLED';
    message = err.message;
  } else if (err instanceof AgentInvalidStateTransitionError) {
    code = 'AGENT_INVALID_STATE';
    message = err.message;
  } else if (err instanceof AgentMalformedResponseError) {
    code = 'AGENT_MALFORMED_RESPONSE';
    message = err.message;
  } else if (err instanceof AgentUnauthorizedToolError) {
    code = 'AGENT_UNAUTHORIZED_TOOL';
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
    message = err.errors.map((e) => e.message).join(' ');
  } else if (err instanceof AgentRuntimeError) {
    code = (err.code as DesktopErrorCode) || 'AGENT_RUNTIME_ERROR';
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

export async function handleCreateAgentRuntimeTask(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentRuntimeService = getAgentRuntimeService(),
): Promise<DesktopResult<AgentRuntimeTaskDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = createAgentRuntimeTaskInputSchema.parse(rawInput) as CreateAgentRuntimeTaskInputDto;
    const task = await service.createTask(parsed, userId);
    return { ok: true, data: task };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleGetAgentRuntimeTask(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentRuntimeService = getAgentRuntimeService(),
): Promise<DesktopResult<AgentRuntimeTaskDto | null>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = getAgentRuntimeTaskInputSchema.parse(rawInput) as GetAgentRuntimeTaskInputDto;
    const task = await service.getTask(parsed, userId);
    return { ok: true, data: task };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleCancelAgentRuntimeTask(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentRuntimeService = getAgentRuntimeService(),
): Promise<DesktopResult<AgentRuntimeTaskDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = cancelAgentRuntimeTaskInputSchema.parse(rawInput) as CancelAgentRuntimeTaskInputDto;
    const task = await service.cancelTask(parsed, userId);
    return { ok: true, data: task };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleGetAgentRuntimeTaskEvents(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentRuntimeService = getAgentRuntimeService(),
): Promise<DesktopResult<readonly AgentRuntimeTaskEventDto[]>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = getAgentRuntimeTaskEventsInputSchema.parse(rawInput) as GetAgentRuntimeTaskEventsInputDto;
    const events = await service.getTaskEvents(parsed, userId);
    return { ok: true, data: events };
  } catch (err) {
    return mapErrorToResult(err);
  }
}
