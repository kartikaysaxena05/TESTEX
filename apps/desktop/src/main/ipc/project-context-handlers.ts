/**
 * @file apps/desktop/src/main/ipc/project-context-handlers.ts
 * Privileged IPC handlers for V8 Phase 123 Unified Project Context & Source Detection.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  ProjectContextService,
  ProjectContextNotFoundError,
  ProjectContextAccessDeniedError,
  ProjectContextStaleError,
  ProjectContextInvalidError,
  ProjectContextSourceUnavailableError,
  ProjectContextDetectionFailedError,
  ProjectContextRefreshFailedError,
  UnauthorizedError,
} from '@ai-quality/core';
import {
  getProjectContextInputSchema,
  detectProjectSourcesInputSchema,
  refreshProjectContextInputSchema,
  invalidateProjectContextInputSchema,
  getProjectContextStatusInputSchema,
  type ProjectContextDto,
  type DetectedProjectSourcesDto,
  type ProjectContextStatusDto,
  type DesktopResult,
  type DesktopErrorCode,
} from '@ai-quality/contracts';
import { ZodError } from 'zod';
import { assertAuthenticated } from './auth-handlers.js';
import { isTrustedIpcSender } from './sender-validation.js';

let defaultProjectContextService: ProjectContextService | null = null;

export function getProjectContextService(): ProjectContextService {
  if (!defaultProjectContextService) {
    defaultProjectContextService = new ProjectContextService();
  }
  return defaultProjectContextService;
}

export function setProjectContextServiceForTest(service: ProjectContextService | null): void {
  defaultProjectContextService = service;
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

  if (err instanceof ProjectContextNotFoundError) {
    code = 'PROJECT_CONTEXT_NOT_FOUND';
    message = err.message;
  } else if (err instanceof ProjectContextAccessDeniedError) {
    code = 'PROJECT_CONTEXT_ACCESS_DENIED';
    message = err.message;
  } else if (err instanceof ProjectContextStaleError) {
    code = 'PROJECT_CONTEXT_STALE';
    message = err.message;
  } else if (err instanceof ProjectContextInvalidError) {
    code = 'PROJECT_CONTEXT_INVALID';
    message = err.message;
  } else if (err instanceof ProjectContextSourceUnavailableError) {
    code = 'PROJECT_CONTEXT_SOURCE_UNAVAILABLE';
    message = err.message;
  } else if (err instanceof ProjectContextDetectionFailedError) {
    code = 'PROJECT_CONTEXT_DETECTION_FAILED';
    message = err.message;
  } else if (err instanceof ProjectContextRefreshFailedError) {
    code = 'PROJECT_CONTEXT_REFRESH_FAILED';
    message = err.message;
  } else if (err instanceof UnauthorizedError) {
    code = 'AUTHENTICATION_FAILED';
    message = err.message;
  } else if (err instanceof ZodError) {
    code = 'VALIDATION_ERROR';
    message = err.errors.map(e => e.message).join(' ');
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

/**
 * Retrieves the unified project context for an authorized user.
 */
export async function handleGetProjectContext(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  customService?: ProjectContextService,
): Promise<DesktopResult<ProjectContextDto>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame' },
      };
    }

    const userId = event ? await extractUser(event) : 'system';
    const validated = getProjectContextInputSchema.parse(rawPayload);
    const service = customService ?? getProjectContextService();

    const data = await service.getContext(validated.projectId, userId, validated.forceRefresh);
    return { ok: true, data };
  } catch (err: unknown) {
    return mapErrorToResult<ProjectContextDto>(err);
  }
}

/**
 * Triggers explicit, read-only source detection across project sources.
 */
export async function handleDetectProjectSources(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  customService?: ProjectContextService,
): Promise<DesktopResult<DetectedProjectSourcesDto>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame' },
      };
    }

    const userId = event ? await extractUser(event) : 'system';
    const validated = detectProjectSourcesInputSchema.parse(rawPayload);
    const service = customService ?? getProjectContextService();

    const data = await service.detectSources(validated.projectId, userId);
    return { ok: true, data };
  } catch (err: unknown) {
    return mapErrorToResult<DetectedProjectSourcesDto>(err);
  }
}

/**
 * Forces a re-probe and refresh of the unified project context.
 */
export async function handleRefreshProjectContext(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  customService?: ProjectContextService,
): Promise<DesktopResult<ProjectContextDto>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame' },
      };
    }

    const userId = event ? await extractUser(event) : 'system';
    const validated = refreshProjectContextInputSchema.parse(rawPayload);
    const service = customService ?? getProjectContextService();

    const data = await service.refreshContext(validated.projectId, userId);
    return { ok: true, data };
  } catch (err: unknown) {
    return mapErrorToResult<ProjectContextDto>(err);
  }
}

/**
 * Explicitly invalidates the project context, marking it STALE.
 */
export async function handleInvalidateProjectContext(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  customService?: ProjectContextService,
): Promise<DesktopResult<ProjectContextDto>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame' },
      };
    }

    const userId = event ? await extractUser(event) : 'system';
    const validated = invalidateProjectContextInputSchema.parse(rawPayload);
    const service = customService ?? getProjectContextService();

    const data = await service.invalidateContext(validated.projectId, userId, validated.reason);
    return { ok: true, data };
  } catch (err: unknown) {
    return mapErrorToResult<ProjectContextDto>(err);
  }
}

/**
 * Returns lightweight project context status, lifecycle state, and freshness metrics.
 */
export async function handleGetProjectContextStatus(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  customService?: ProjectContextService,
): Promise<DesktopResult<ProjectContextStatusDto>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender frame' },
      };
    }

    const userId = event ? await extractUser(event) : 'system';
    const validated = getProjectContextStatusInputSchema.parse(rawPayload);
    const service = customService ?? getProjectContextService();

    const data = await service.getStatus(validated.projectId, userId);
    return { ok: true, data };
  } catch (err: unknown) {
    return mapErrorToResult<ProjectContextStatusDto>(err);
  }
}
