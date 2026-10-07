/**
 * @file apps/desktop/src/main/ipc/agent-loop-handlers.ts
 * Privileged IPC handlers for V10 Phase 153: Agent Execution Loop.
 *
 * Exposes strictly typed boundary handlers for:
 * 1. startAgentLoop
 * 2. resumeAgentLoop
 * 3. cancelAgentLoop
 * 4. getAgentLoopStatus
 *
 * Validates inputs at the boundary, enforces trusted sender origin, and maps domain errors.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type AgentLoopRunResultDto,
  type AgentLoopStateDto,
  type DesktopError,
  type DesktopResult,
  startAgentLoopInputSchema,
  resumeAgentLoopInputSchema,
  cancelAgentLoopInputSchema,
  getAgentLoopStatusInputSchema,
} from '@ai-quality/contracts';
import {
  AgentLoop,
  AgentLoopError,
  AgentLoopNotFoundError,
  AgentLoopInvalidStateError,
  AgentLoopConcurrentExecutionError,
  AgentLoopSafetyLimitExceededError,
  AgentLoopTimeoutError,
  AgentLoopCancelledError,
  AgentLoopApprovalRequiredError,
  AgentLoopToolExecutionError,
  AgentLoopPlannerError,
  AgentLoopCrossProjectAccessError,
  UnauthorizedError,
  getPrismaClient,
} from '@ai-quality/core';
import { ZodError } from 'zod';
import { isTrustedIpcSender } from './sender-validation.js';
import { assertAuthenticated } from './auth-handlers.js';

let defaultAgentLoop: AgentLoop | null = null;

export function resolveAgentLoop(): AgentLoop {
  if (!defaultAgentLoop) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available for AgentLoop.');
    }
    defaultAgentLoop = new AgentLoop({ prisma });
  }
  return defaultAgentLoop;
}

export function setAgentLoopForTest(loop: AgentLoop | null): void {
  defaultAgentLoop = loop;
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

  if (err instanceof AgentLoopNotFoundError) {
    return { code: 'AGENT_LOOP_NOT_FOUND', message: err.message };
  }
  if (err instanceof AgentLoopInvalidStateError) {
    return { code: 'AGENT_LOOP_INVALID_STATE', message: err.message };
  }
  if (err instanceof AgentLoopConcurrentExecutionError) {
    return { code: 'AGENT_LOOP_CONCURRENT_EXECUTION', message: err.message };
  }
  if (err instanceof AgentLoopSafetyLimitExceededError) {
    return { code: 'AGENT_LOOP_SAFETY_LIMIT_EXCEEDED', message: err.message };
  }
  if (err instanceof AgentLoopTimeoutError) {
    return { code: 'AGENT_LOOP_TIMEOUT', message: err.message };
  }
  if (err instanceof AgentLoopCancelledError) {
    return { code: 'AGENT_LOOP_CANCELLED', message: err.message };
  }
  if (err instanceof AgentLoopApprovalRequiredError) {
    return { code: 'AGENT_LOOP_APPROVAL_REQUIRED', message: err.message };
  }
  if (err instanceof AgentLoopToolExecutionError) {
    return { code: 'AGENT_LOOP_EXECUTION_FAILED', message: err.message };
  }
  if (err instanceof AgentLoopPlannerError) {
    return { code: 'AGENT_LOOP_PLANNER_FAILED', message: err.message };
  }
  if (err instanceof AgentLoopCrossProjectAccessError) {
    return { code: 'AGENT_LOOP_CROSS_PROJECT_ACCESS', message: err.message };
  }
  if (err instanceof UnauthorizedError) {
    return { code: 'AUTHENTICATION_FAILED', message: err.message };
  }
  if (err instanceof AgentLoopError) {
    return {
      code: (err.code as DesktopError['code']) || 'INTERNAL_ERROR',
      message: err.message,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    code: 'INTERNAL_ERROR',
    message,
  };
}

export async function handleAgentLoopStart(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentLoopRunResultDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const validated = startAgentLoopInputSchema.parse(input);
    const result = await resolveAgentLoop().run(validated, userId);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleAgentLoopResume(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentLoopRunResultDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const validated = resumeAgentLoopInputSchema.parse(input);
    const result = await resolveAgentLoop().resume(validated, userId);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleAgentLoopCancel(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentLoopRunResultDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const validated = cancelAgentLoopInputSchema.parse(input);
    const result = await resolveAgentLoop().cancel(validated, userId);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleAgentLoopGetStatus(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentLoopStateDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const validated = getAgentLoopStatusInputSchema.parse(input);
    const result = await resolveAgentLoop().getStatus(validated, userId);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}
