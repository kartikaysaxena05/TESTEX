/**
 * @file apps/desktop/src/main/ipc/agent-tool-handlers.ts
 * Privileged IPC handlers for V10 Phase 143 Tool Registry & Invocation.
 * Exposes listing, definition retrieval, and controlled tool invocation APIs.
 * Enforces authenticated sender verification, project tenant isolation, and strict input/output validation.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  ToolRegistryService,
  AgentToolError,
  AgentToolNotFoundError,
  AgentToolDuplicateError,
  AgentToolDisabledError,
  AgentToolValidationError,
  AgentToolInvocationError,
  AgentToolPermissionDeniedError,
  AgentToolOutputInvalidError,
  AiCrossProjectAccessError,
  AiInvalidRequestError,
  UnauthorizedError,
} from '@ai-quality/core';
import {
  listAgentToolsInputSchema,
  getAgentToolInputSchema,
  invokeAgentToolInputSchema,
  type ListAgentToolsInputDto,
  type GetAgentToolInputDto,
  type InvokeAgentToolInputDto,
  type AgentToolDefinitionDto,
  type AgentToolInvocationResultDto,
  type DesktopResult,
  type DesktopErrorCode,
} from '@ai-quality/contracts';
import { ZodError } from 'zod';
import { assertAuthenticated } from './auth-handlers.js';
import { isTrustedIpcSender } from './sender-validation.js';

let defaultToolRegistryService: ToolRegistryService | null = null;

export function getToolRegistryService(): ToolRegistryService {
  if (!defaultToolRegistryService) {
    defaultToolRegistryService = new ToolRegistryService();
  }
  return defaultToolRegistryService;
}

export function setToolRegistryServiceForTest(service: ToolRegistryService | null): void {
  defaultToolRegistryService = service;
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
  let message = 'An unexpected error occurred in tool registry.';

  if (err instanceof AgentToolNotFoundError) {
    code = 'TOOL_REGISTRY_NOT_FOUND';
    message = err.message;
  } else if (err instanceof AgentToolDuplicateError) {
    code = 'TOOL_REGISTRY_DUPLICATE';
    message = err.message;
  } else if (err instanceof AgentToolDisabledError) {
    code = 'TOOL_REGISTRY_DISABLED';
    message = err.message;
  } else if (err instanceof AgentToolValidationError) {
    code = 'TOOL_REGISTRY_VALIDATION_ERROR';
    message = err.message;
  } else if (err instanceof AgentToolInvocationError) {
    code = 'TOOL_REGISTRY_INVOCATION_FAILED';
    message = err.message;
  } else if (err instanceof AgentToolPermissionDeniedError) {
    code = 'TOOL_REGISTRY_PERMISSION_DENIED';
    message = err.message;
  } else if (err instanceof AgentToolOutputInvalidError) {
    code = 'TOOL_REGISTRY_OUTPUT_INVALID';
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
  } else if (err instanceof AgentToolError) {
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

// ============================================================================
// Tool Registry Handlers
// ============================================================================

export async function handleListAgentTools(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: ToolRegistryService = getToolRegistryService(),
): Promise<DesktopResult<readonly AgentToolDefinitionDto[]>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: {
          code: 'UNAUTHORIZED_SENDER',
          message: 'Untrusted IPC sender rejected.',
        },
      };
    }

    const userId = await extractUser(event);
    const parsed = listAgentToolsInputSchema.parse(rawInput) as ListAgentToolsInputDto;

    const tools = await service.listTools(parsed, userId);
    return { ok: true, data: tools };
  } catch (err) {
    return mapErrorToResult<readonly AgentToolDefinitionDto[]>(err);
  }
}

export async function handleGetAgentTool(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: ToolRegistryService = getToolRegistryService(),
): Promise<DesktopResult<AgentToolDefinitionDto | null>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: {
          code: 'UNAUTHORIZED_SENDER',
          message: 'Untrusted IPC sender rejected.',
        },
      };
    }

    const userId = await extractUser(event);
    const parsed = getAgentToolInputSchema.parse(rawInput) as GetAgentToolInputDto;

    const tool = await service.getTool(parsed, userId);
    return { ok: true, data: tool };
  } catch (err) {
    return mapErrorToResult<AgentToolDefinitionDto | null>(err);
  }
}

export async function handleInvokeAgentTool(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: ToolRegistryService = getToolRegistryService(),
): Promise<DesktopResult<AgentToolInvocationResultDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: {
          code: 'UNAUTHORIZED_SENDER',
          message: 'Untrusted IPC sender rejected.',
        },
      };
    }

    const userId = await extractUser(event);
    const parsed = invokeAgentToolInputSchema.parse(rawInput) as InvokeAgentToolInputDto;

    const result = await service.invoke(parsed, {
      projectId: parsed.projectId,
      userId,
      taskId: parsed.taskId,
      stepId: parsed.stepId,
    });
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<AgentToolInvocationResultDto>(err);
  }
}
