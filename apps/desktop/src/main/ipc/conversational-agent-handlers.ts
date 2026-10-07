/**
 * @file apps/desktop/src/main/ipc/conversational-agent-handlers.ts
 * Privileged IPC handlers for V8 Phase 124 Conversational AI Testing Agent, Run Controls & Evidence Review.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  ConversationalAgentService,
  AgentSessionNotFoundError,
  AgentAccessDeniedError,
  AgentInvalidRequestError,
  AgentToolFailedError,
  AgentApprovalRequiredError,
  AgentRunNotFoundError,
  AgentEvidenceNotFoundError,
  AgentExecutionFailedError,
  UnauthorizedError,
} from '@ai-quality/core';
import {
  createAgentSessionInputSchema,
  getAgentSessionInputSchema,
  listAgentSessionsInputSchema,
  deleteAgentSessionInputSchema,
  sendAgentMessageInputSchema,
  approveAgentActionInputSchema,
  agentRunControlInputSchema,
  getAgentEvidenceInputSchema,
  type CreateAgentSessionInputDto,
  type GetAgentSessionInputDto,
  type ListAgentSessionsInputDto,
  type DeleteAgentSessionInputDto,
  type SendAgentMessageInputDto,
  type ApproveAgentActionInputDto,
  type AgentRunControlInputDto,
  type GetAgentEvidenceInputDto,
  type AgentSessionDto,
  type AgentMessageResponseDto,
  type AgentActionApprovalResultDto,
  type AgentRunControlResultDto,
  type AgentEvidenceQueryResultDto,
  type DesktopResult,
  type DesktopErrorCode,
} from '@ai-quality/contracts';
import { ZodError } from 'zod';
import { assertAuthenticated } from './auth-handlers.js';
import { isTrustedIpcSender } from './sender-validation.js';

let defaultAgentService: ConversationalAgentService | null = null;

export function getConversationalAgentService(): ConversationalAgentService {
  if (!defaultAgentService) {
    defaultAgentService = new ConversationalAgentService();
  }
  return defaultAgentService;
}

export function setConversationalAgentServiceForTest(service: ConversationalAgentService | null): void {
  defaultAgentService = service;
}

function isIpcEvent(val: unknown): val is IpcMainInvokeEvent {
  return typeof val === 'object' && val !== null && 'senderFrame' in val;
}

async function extractUser(event?: IpcMainInvokeEvent): Promise<string> {
  if (!event) {
    throw new UnauthorizedError('Authentication required.');
  }
  const user = await assertAuthenticated(event);
  return user.userId;
}

function mapErrorToResult<T>(err: unknown): DesktopResult<T> {
  let code: DesktopErrorCode = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred.';

  if (err instanceof AgentSessionNotFoundError) {
    code = 'AGENT_SESSION_NOT_FOUND';
    message = err.message;
  } else if (err instanceof AgentAccessDeniedError) {
    code = 'AGENT_ACCESS_DENIED';
    message = err.message;
  } else if (err instanceof AgentInvalidRequestError) {
    code = 'AGENT_INVALID_REQUEST';
    message = err.message;
  } else if (err instanceof AgentToolFailedError) {
    code = 'AGENT_TOOL_FAILED';
    message = err.message;
  } else if (err instanceof AgentApprovalRequiredError) {
    code = 'AGENT_APPROVAL_REQUIRED';
    message = err.message;
  } else if (err instanceof AgentRunNotFoundError) {
    code = 'AGENT_RUN_NOT_FOUND';
    message = err.message;
  } else if (err instanceof AgentEvidenceNotFoundError) {
    code = 'AGENT_EVIDENCE_NOT_FOUND';
    message = err.message;
  } else if (err instanceof AgentExecutionFailedError) {
    code = 'AGENT_EXECUTION_FAILED';
    message = err.message;
  } else if (err instanceof UnauthorizedError) {
    code = 'UNAUTHORIZED';
    message = err.message;
  } else if (err instanceof ZodError) {
    code = 'AGENT_INVALID_REQUEST';
    message = err.issues.map((i) => i.message).join('; ');
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

export async function handleCreateAgentSession(
  eventOrInput: IpcMainInvokeEvent | CreateAgentSessionInputDto,
  maybeInput?: CreateAgentSessionInputDto,
): Promise<DesktopResult<AgentSessionDto>> {
  try {
    let event: IpcMainInvokeEvent | undefined;
    let rawInput: unknown;

    if (isIpcEvent(eventOrInput)) {
      event = eventOrInput;
      if (!isTrustedIpcSender(event)) {
        return { ok: false, error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame' } };
      }
      rawInput = maybeInput;
    } else {
      rawInput = eventOrInput;
    }

    const userId = await extractUser(event);
    const parsed = createAgentSessionInputSchema.parse(rawInput);
    const service = getConversationalAgentService();
    const session = await service.createSession(parsed, userId);

    return { ok: true, data: session };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleGetAgentSession(
  eventOrInput: IpcMainInvokeEvent | GetAgentSessionInputDto,
  maybeInput?: GetAgentSessionInputDto,
): Promise<DesktopResult<AgentSessionDto>> {
  try {
    let event: IpcMainInvokeEvent | undefined;
    let rawInput: unknown;

    if (isIpcEvent(eventOrInput)) {
      event = eventOrInput;
      if (!isTrustedIpcSender(event)) {
        return { ok: false, error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame' } };
      }
      rawInput = maybeInput;
    } else {
      rawInput = eventOrInput;
    }

    const userId = await extractUser(event);
    const parsed = getAgentSessionInputSchema.parse(rawInput);
    const service = getConversationalAgentService();
    const session = await service.getSession(parsed, userId);

    return { ok: true, data: session };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleListAgentSessions(
  eventOrInput: IpcMainInvokeEvent | ListAgentSessionsInputDto,
  maybeInput?: ListAgentSessionsInputDto,
): Promise<DesktopResult<readonly AgentSessionDto[]>> {
  try {
    let event: IpcMainInvokeEvent | undefined;
    let rawInput: unknown;

    if (isIpcEvent(eventOrInput)) {
      event = eventOrInput;
      if (!isTrustedIpcSender(event)) {
        return { ok: false, error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame' } };
      }
      rawInput = maybeInput;
    } else {
      rawInput = eventOrInput;
    }

    const userId = await extractUser(event);
    const parsed = listAgentSessionsInputSchema.parse(rawInput);
    const service = getConversationalAgentService();
    const sessions = await service.listSessions(parsed, userId);

    return { ok: true, data: sessions };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleDeleteAgentSession(
  eventOrInput: IpcMainInvokeEvent | DeleteAgentSessionInputDto,
  maybeInput?: DeleteAgentSessionInputDto,
): Promise<DesktopResult<{ readonly success: boolean; readonly sessionId: string }>> {
  try {
    let event: IpcMainInvokeEvent | undefined;
    let rawInput: unknown;

    if (isIpcEvent(eventOrInput)) {
      event = eventOrInput;
      if (!isTrustedIpcSender(event)) {
        return { ok: false, error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame' } };
      }
      rawInput = maybeInput;
    } else {
      rawInput = eventOrInput;
    }

    const userId = await extractUser(event);
    const parsed = deleteAgentSessionInputSchema.parse(rawInput);
    const service = getConversationalAgentService();
    await service.deleteSession(parsed.sessionId, parsed.projectId, userId);

    return { ok: true, data: { success: true, sessionId: parsed.sessionId } };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleSendAgentMessage(
  eventOrInput: IpcMainInvokeEvent | SendAgentMessageInputDto,
  maybeInput?: SendAgentMessageInputDto,
): Promise<DesktopResult<AgentMessageResponseDto>> {
  try {
    let event: IpcMainInvokeEvent | undefined;
    let rawInput: unknown;

    if (isIpcEvent(eventOrInput)) {
      event = eventOrInput;
      if (!isTrustedIpcSender(event)) {
        return { ok: false, error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame' } };
      }
      rawInput = maybeInput;
    } else {
      rawInput = eventOrInput;
    }

    const userId = await extractUser(event);
    const parsed = sendAgentMessageInputSchema.parse(rawInput);
    const service = getConversationalAgentService();
    const response = await service.handleUserMessage(parsed, userId);

    return { ok: true, data: response };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleApproveAgentAction(
  eventOrInput: IpcMainInvokeEvent | ApproveAgentActionInputDto,
  maybeInput?: ApproveAgentActionInputDto,
): Promise<DesktopResult<AgentActionApprovalResultDto>> {
  try {
    let event: IpcMainInvokeEvent | undefined;
    let rawInput: unknown;

    if (isIpcEvent(eventOrInput)) {
      event = eventOrInput;
      if (!isTrustedIpcSender(event)) {
        return { ok: false, error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame' } };
      }
      rawInput = maybeInput;
    } else {
      rawInput = eventOrInput;
    }

    const userId = await extractUser(event);
    const parsed = approveAgentActionInputSchema.parse(rawInput);
    const service = getConversationalAgentService();
    const result = await service.handleApproval(parsed, userId);

    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleAgentRunControl(
  eventOrInput: IpcMainInvokeEvent | AgentRunControlInputDto,
  maybeInput?: AgentRunControlInputDto,
): Promise<DesktopResult<AgentRunControlResultDto>> {
  try {
    let event: IpcMainInvokeEvent | undefined;
    let rawInput: unknown;

    if (isIpcEvent(eventOrInput)) {
      event = eventOrInput;
      if (!isTrustedIpcSender(event)) {
        return { ok: false, error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame' } };
      }
      rawInput = maybeInput;
    } else {
      rawInput = eventOrInput;
    }

    const userId = await extractUser(event);
    const parsed = agentRunControlInputSchema.parse(rawInput);
    const service = getConversationalAgentService();
    const result = await service.handleRunControl(parsed, userId);

    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleGetAgentEvidence(
  eventOrInput: IpcMainInvokeEvent | GetAgentEvidenceInputDto,
  maybeInput?: GetAgentEvidenceInputDto,
): Promise<DesktopResult<AgentEvidenceQueryResultDto>> {
  try {
    let event: IpcMainInvokeEvent | undefined;
    let rawInput: unknown;

    if (isIpcEvent(eventOrInput)) {
      event = eventOrInput;
      if (!isTrustedIpcSender(event)) {
        return { ok: false, error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame' } };
      }
      rawInput = maybeInput;
    } else {
      rawInput = eventOrInput;
    }

    const userId = await extractUser(event);
    const parsed = getAgentEvidenceInputSchema.parse(rawInput);
    const service = getConversationalAgentService();
    const result = await service.queryEvidence(parsed, userId);

    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult(err);
  }
}
