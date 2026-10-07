/**
 * @file apps/desktop/src/main/ipc/terminal-handlers.ts
 * Privileged IPC handlers for V10 Phase 151: Sandboxed Terminal Command Gateway.
 *
 * Exposes strictly typed boundary handlers for:
 * 1. execute terminal command
 * 2. get terminal execution
 * 3. list terminal executions
 * 4. approve terminal execution
 * 5. reject terminal execution
 * 6. cancel terminal execution
 *
 * Validates every input at the IPC boundary and enforces sender origin verification.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type AgentTerminalExecutionDto,
  type DesktopError,
  type DesktopResult,
  terminalExecuteInputSchema,
  getTerminalExecutionInputSchema,
  listTerminalExecutionsInputSchema,
  approveTerminalExecutionInputSchema,
  rejectTerminalExecutionInputSchema,
  cancelTerminalExecutionInputSchema,
} from '@ai-quality/contracts';
import {
  TerminalCommandGateway,
  TerminalGatewayError,
  AiCrossProjectAccessError,
  AiInvalidRequestError,
  UnauthorizedError,
  getPrismaClient,
} from '@ai-quality/core';
import { ZodError } from 'zod';
import { isTrustedIpcSender } from './sender-validation.js';
import { assertAuthenticated } from './auth-handlers.js';

let defaultTerminalGateway: TerminalCommandGateway | null = null;

export function resolveTerminalGateway(): TerminalCommandGateway {
  if (!defaultTerminalGateway) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available for TerminalCommandGateway.');
    }
    defaultTerminalGateway = new TerminalCommandGateway({ prisma });
  }
  return defaultTerminalGateway;
}

export function setTerminalGatewayForTest(gateway: TerminalCommandGateway | null): void {
  defaultTerminalGateway = gateway;
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

  if (err instanceof TerminalGatewayError) {
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
 * 1. Execute terminal command
 */
export async function handleExecuteTerminal(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentTerminalExecutionDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = terminalExecuteInputSchema.parse(input);
    const gateway = resolveTerminalGateway();
    const result = await gateway.executeCommand(parsed, userId);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

/**
 * 2. Get terminal execution
 */
export async function handleGetTerminalExecution(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentTerminalExecutionDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = getTerminalExecutionInputSchema.parse(input);
    const gateway = resolveTerminalGateway();
    const result = await gateway.getExecution(parsed, userId);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

/**
 * 3. List terminal executions
 */
export async function handleListTerminalExecutions(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly AgentTerminalExecutionDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = listTerminalExecutionsInputSchema.parse(input);
    const gateway = resolveTerminalGateway();
    const result = await gateway.listExecutions(parsed, userId);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

/**
 * 4. Approve terminal execution
 */
export async function handleApproveTerminalExecution(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentTerminalExecutionDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = approveTerminalExecutionInputSchema.parse(input);
    const gateway = resolveTerminalGateway();
    const result = await gateway.approveExecution(parsed, userId);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

/**
 * 5. Reject terminal execution
 */
export async function handleRejectTerminalExecution(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentTerminalExecutionDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = rejectTerminalExecutionInputSchema.parse(input);
    const gateway = resolveTerminalGateway();
    const result = await gateway.rejectExecution(parsed, userId);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}

/**
 * 6. Cancel terminal execution
 */
export async function handleCancelTerminalExecution(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentTerminalExecutionDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = cancelTerminalExecutionInputSchema.parse(input);
    const gateway = resolveTerminalGateway();
    const result = await gateway.cancelExecution(parsed, userId);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeError(err) };
  }
}
