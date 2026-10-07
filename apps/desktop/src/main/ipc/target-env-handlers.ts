/**
 * @file apps/desktop/src/main/ipc/target-env-handlers.ts
 * Privileged IPC handlers for Target Environments, Browser Settings, and Authentication (Phase 122).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  TargetEnvironmentService,
  TargetEnvError,
  TargetEnvNotFoundError,
  TargetEnvAccessDeniedError,
  TargetEnvValidationError,
  TargetEnvUnreachableError,
  TargetEnvAuthFailedError,
  TargetEnvProductionSafetyError,
  UnauthorizedError,
} from '@ai-quality/core';
import {
  saveTargetEnvironmentSchema,
  getTargetEnvironmentSchema,
  listTargetEnvironmentsSchema,
  deleteTargetEnvironmentSchema,
  setActiveTargetEnvironmentSchema,
  testTargetConnectionSchema,
  testTargetAuthSchema,
  resolveTargetEnvironmentSchema,
  type TargetEnvironmentConfigDto,
  type TargetConnectionTestResultDto,
  type TargetAuthTestResultDto,
  type TargetExecutionSnapshotDto,
  type DesktopResult,
  type DesktopErrorCode,
} from '@ai-quality/contracts';
import { ZodError } from 'zod';
import { assertAuthenticated } from './auth-handlers.js';
import { isTrustedIpcSender } from './sender-validation.js';

let defaultTargetEnvService: TargetEnvironmentService | null = null;

export function getTargetEnvironmentService(): TargetEnvironmentService {
  if (!defaultTargetEnvService) {
    defaultTargetEnvService = new TargetEnvironmentService();
  }
  return defaultTargetEnvService;
}

export function setTargetEnvironmentServiceForTest(service: TargetEnvironmentService | null): void {
  defaultTargetEnvService = service;
}

function isIpcEvent(val: unknown): val is IpcMainInvokeEvent {
  return typeof val === 'object' && val !== null && 'senderFrame' in val;
}

async function extractUser(event?: IpcMainInvokeEvent): Promise<string> {
  if (!event) {
    throw new TargetEnvAccessDeniedError('Authentication required.');
  }
  const user = await assertAuthenticated(event);
  return user.userId;
}

function mapErrorToResult<T>(err: unknown): DesktopResult<T> {
  let code: DesktopErrorCode = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred.';

  if (err instanceof TargetEnvNotFoundError) {
    code = 'TARGET_ENV_NOT_FOUND';
    message = err.message;
  } else if (err instanceof TargetEnvAccessDeniedError || err instanceof UnauthorizedError) {
    code = 'TARGET_ENV_ACCESS_DENIED';
    message = err.message;
  } else if (err instanceof TargetEnvValidationError) {
    code = 'TARGET_ENV_VALIDATION_ERROR';
    message = err.message;
  } else if (err instanceof TargetEnvUnreachableError) {
    code = 'TARGET_ENV_UNREACHABLE';
    message = err.message;
  } else if (err instanceof TargetEnvAuthFailedError) {
    code = 'TARGET_ENV_AUTH_FAILED';
    message = err.message;
  } else if (err instanceof TargetEnvProductionSafetyError) {
    code = 'TARGET_ENV_PROD_SAFETY_VIOLATION';
    message = err.message;
  } else if (err instanceof ZodError) {
    code = 'VALIDATION_ERROR';
    message = err.errors.map(e => e.message).join(' ');
  } else if (err instanceof TargetEnvError) {
    code = 'INVALID_REQUEST';
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

export async function handleGetTargetEnvironment(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  service: TargetEnvironmentService = getTargetEnvironmentService(),
): Promise<DesktopResult<TargetEnvironmentConfigDto>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const parsed = getTargetEnvironmentSchema.parse(rawPayload);
    const result = await service.getEnvironment(userId, parsed);

    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<TargetEnvironmentConfigDto>(err);
  }
}

export async function handleListTargetEnvironments(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  service: TargetEnvironmentService = getTargetEnvironmentService(),
): Promise<DesktopResult<readonly TargetEnvironmentConfigDto[]>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const parsed = listTargetEnvironmentsSchema.parse(rawPayload);
    const result = await service.listEnvironments(userId, parsed);

    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<readonly TargetEnvironmentConfigDto[]>(err);
  }
}

export async function handleSaveTargetEnvironment(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  service: TargetEnvironmentService = getTargetEnvironmentService(),
): Promise<DesktopResult<TargetEnvironmentConfigDto>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const parsed = saveTargetEnvironmentSchema.parse(rawPayload);
    const result = await service.saveEnvironment(userId, parsed);

    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<TargetEnvironmentConfigDto>(err);
  }
}

export async function handleDeleteTargetEnvironment(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  service: TargetEnvironmentService = getTargetEnvironmentService(),
): Promise<DesktopResult<boolean>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const parsed = deleteTargetEnvironmentSchema.parse(rawPayload);
    const result = await service.deleteEnvironment(userId, parsed);

    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<boolean>(err);
  }
}

export async function handleSetActiveTargetEnvironment(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  service: TargetEnvironmentService = getTargetEnvironmentService(),
): Promise<DesktopResult<TargetEnvironmentConfigDto>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const parsed = setActiveTargetEnvironmentSchema.parse(rawPayload);
    const result = await service.setActiveEnvironment(userId, parsed);

    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<TargetEnvironmentConfigDto>(err);
  }
}

export async function handleTestTargetConnection(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  service: TargetEnvironmentService = getTargetEnvironmentService(),
): Promise<DesktopResult<TargetConnectionTestResultDto>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const parsed = testTargetConnectionSchema.parse(rawPayload);
    const result = await service.testConnection(userId, parsed);

    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<TargetConnectionTestResultDto>(err);
  }
}

export async function handleTestTargetAuth(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  service: TargetEnvironmentService = getTargetEnvironmentService(),
): Promise<DesktopResult<TargetAuthTestResultDto>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const parsed = testTargetAuthSchema.parse(rawPayload);
    const result = await service.testAuthentication(userId, parsed);

    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<TargetAuthTestResultDto>(err);
  }
}

export async function handleResolveTargetEnvironment(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  service: TargetEnvironmentService = getTargetEnvironmentService(),
): Promise<DesktopResult<TargetExecutionSnapshotDto>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const parsed = resolveTargetEnvironmentSchema.parse(rawPayload);
    const result = await service.resolveExecutionTarget(userId, parsed);

    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<TargetExecutionSnapshotDto>(err);
  }
}
