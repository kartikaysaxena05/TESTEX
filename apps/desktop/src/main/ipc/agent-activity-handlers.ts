/**
 * @file apps/desktop/src/main/ipc/agent-activity-handlers.ts
 * Privileged IPC boundary handlers for V10 Phase 154: Streaming Activity & Tool Progress UI.
 *
 * Exposes strictly typed boundary handlers for:
 * 1. desktop:agent-activity:subscribe
 * 2. desktop:agent-activity:unsubscribe
 * 3. desktop:agent-activity:get-timeline
 *
 * Enforces sender frame validation, authentication, multi-tenant authorization,
 * input schema validation, and safe error mapping.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type AgentActivityTimelineDto,
  type DesktopError,
  type DesktopResult,
  DESKTOP_CHANNELS,
  subscribeAgentActivityInputSchema,
  unsubscribeAgentActivityInputSchema,
  getAgentActivityTimelineInputSchema,
} from '@ai-quality/contracts';
import {
  AgentActivityStreamService,
  AgentActivityError,
  AgentActivityNotFoundError,
  AgentActivityUnauthorizedError,
  AgentActivityInvalidEventError,
  UnauthorizedError,
  getPrismaClient,
} from '@ai-quality/core';
import { ZodError } from 'zod';
import { isTrustedIpcSender } from './sender-validation.js';
import { assertAuthenticated } from './auth-handlers.js';

let defaultActivityService: AgentActivityStreamService | null = null;

export function resolveActivityStreamService(): AgentActivityStreamService {
  if (!defaultActivityService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available for AgentActivityStreamService.');
    }
    defaultActivityService = new AgentActivityStreamService({ prisma });
  }
  return defaultActivityService;
}

export function setActivityStreamServiceForTest(service: AgentActivityStreamService | null): void {
  defaultActivityService = service;
}

// Active subscriptions: key `${webContentsId}:${taskId}` -> unsubscription callback
const activeSubscriptions = new Map<string, () => void>();

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

  if (err instanceof AgentActivityNotFoundError) {
    return {
      code: 'AGENT_ACTIVITY_NOT_FOUND',
      message: err.message,
    };
  }

  if (err instanceof AgentActivityUnauthorizedError || err instanceof UnauthorizedError) {
    return {
      code: 'AGENT_ACTIVITY_UNAUTHORIZED',
      message: err.message,
    };
  }

  if (err instanceof AgentActivityInvalidEventError) {
    return {
      code: 'AGENT_ACTIVITY_INVALID_EVENT',
      message: err.message,
    };
  }

  if (err instanceof AgentActivityError) {
    return {
      code: 'AGENT_ACTIVITY_ERROR',
      message: err.message,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    code: 'AGENT_ACTIVITY_ERROR',
    message,
  };
}

/**
 * 1. Subscribe to real-time agent activity events
 */
export async function handleSubscribeAgentActivity(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<{ readonly subscribed: true }>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }

  try {
    await extractUser(event);
    const parsed = subscribeAgentActivityInputSchema.parse(input);
    const service = resolveActivityStreamService();

    const sender = event.sender;
    const subKey = `${sender.id}:${parsed.taskId}`;

    // Clean up existing subscription for this window and task if any
    const existingUnsub = activeSubscriptions.get(subKey);
    if (existingUnsub) {
      existingUnsub();
      activeSubscriptions.delete(subKey);
    }

    const unsub = service.subscribe(parsed.taskId, activityEvent => {
      if (!sender.isDestroyed()) {
        sender.send(DESKTOP_CHANNELS.AGENT_ACTIVITY_EVENT, activityEvent);
      }
    });

    activeSubscriptions.set(subKey, unsub);

    // Auto-clean on webContents destruction
    const cleanupOnDestroy = () => {
      const active = activeSubscriptions.get(subKey);
      if (active) {
        active();
        activeSubscriptions.delete(subKey);
      }
    };
    sender.once('destroyed', cleanupOnDestroy);

    return { ok: true, data: { subscribed: true } };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

/**
 * 2. Unsubscribe from real-time agent activity events
 */
export async function handleUnsubscribeAgentActivity(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<{ readonly unsubscribed: true }>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }

  try {
    await extractUser(event);
    const parsed = unsubscribeAgentActivityInputSchema.parse(input);

    const subKey = `${event.sender.id}:${parsed.taskId}`;
    const existingUnsub = activeSubscriptions.get(subKey);
    if (existingUnsub) {
      existingUnsub();
      activeSubscriptions.delete(subKey);
    }

    return { ok: true, data: { unsubscribed: true } };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

/**
 * 3. Get persisted task activity timeline (for reconnect / recovery)
 */
export async function handleGetAgentActivityTimeline(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentActivityTimelineDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }

  try {
    const userId = await extractUser(event);
    const parsed = getAgentActivityTimelineInputSchema.parse(input);
    const service = resolveActivityStreamService();

    const timeline = await service.getTaskTimeline(parsed, userId);
    return { ok: true, data: timeline };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

/**
 * Clear subscriptions map for testing
 */
export function clearSubscriptionsForTest(): void {
  for (const unsub of activeSubscriptions.values()) {
    unsub();
  }
  activeSubscriptions.clear();
}
