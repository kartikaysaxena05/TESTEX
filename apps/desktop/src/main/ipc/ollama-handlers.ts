/**
 * @file apps/desktop/src/main/ipc/ollama-handlers.ts
 * Privileged IPC handlers for V9 Phase 127 Ollama Connection & Health Detection.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  AiProviderService,
  AiProviderUnavailableError,
  AiProviderAuthError,
  AiModelUnavailableError,
  AiInvalidRequestError,
  AiTimeoutError,
  AiCancelledError,
  AiRateLimitError,
  AiInvalidResponseError,
  AiProviderError,
  AiUnknownError,
  AiCrossProjectAccessError,
  AiConfigInvalidError,
  AiConfigNotFoundError,
  UnauthorizedError,
} from '@ai-quality/core';
import {
  getOllamaStatusInputSchema,
  healthCheckOllamaInputSchema,
  getOllamaConfigInputSchema,
  setOllamaConfigInputSchema,
  type OllamaStatusDto,
  type OllamaHealthDiagnosticDto,
  type OllamaConfigDto,
  type DesktopResult,
  type DesktopErrorCode,
} from '@ai-quality/contracts';
import { ZodError } from 'zod';
import { assertAuthenticated } from './auth-handlers.js';
import { isTrustedIpcSender } from './sender-validation.js';

let defaultAiProviderService: AiProviderService | null = null;

export function getOllamaAiProviderService(): AiProviderService {
  if (!defaultAiProviderService) {
    defaultAiProviderService = new AiProviderService();
  }
  return defaultAiProviderService;
}

export function setOllamaAiProviderServiceForTest(service: AiProviderService | null): void {
  defaultAiProviderService = service;
}

async function extractUser(event?: IpcMainInvokeEvent): Promise<string> {
  if (!event) {
    throw new UnauthorizedError('Authentication required.');
  }
  const user = await assertAuthenticated(event);
  return user.userId;
}

function mapErrorToResult<T>(err: unknown): DesktopResult<T> {
  let code: DesktopErrorCode = 'AI_PROVIDER_ERROR';
  let message = 'An unexpected error occurred.';

  if (err instanceof AiProviderUnavailableError) {
    code = 'PROVIDER_UNAVAILABLE';
    message = err.message;
  } else if (err instanceof AiProviderAuthError) {
    code = 'PROVIDER_AUTH_ERROR';
    message = err.message;
  } else if (err instanceof AiModelUnavailableError) {
    code = 'MODEL_UNAVAILABLE';
    message = err.message;
  } else if (err instanceof AiInvalidRequestError) {
    code = 'INVALID_REQUEST';
    message = err.message;
  } else if (err instanceof AiTimeoutError) {
    code = 'TIMEOUT';
    message = err.message;
  } else if (err instanceof AiCancelledError) {
    code = 'CANCELLED';
    message = err.message;
  } else if (err instanceof AiRateLimitError) {
    code = 'RATE_LIMITED';
    message = err.message;
  } else if (err instanceof AiInvalidResponseError) {
    code = 'INVALID_RESPONSE';
    message = err.message;
  } else if (err instanceof AiProviderError) {
    code = 'PROVIDER_ERROR';
    message = err.message;
  } else if (err instanceof AiUnknownError) {
    code = 'UNKNOWN';
    message = err.message;
  } else if (err instanceof AiCrossProjectAccessError) {
    code = 'PERMISSION_DENIED';
    message = err.message;
  } else if (err instanceof AiConfigInvalidError) {
    code = 'CONFIGURATION_INVALID';
    message = err.message;
  } else if (err instanceof AiConfigNotFoundError) {
    code = 'AI_CONFIG_NOT_FOUND';
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

export async function handleGetOllamaStatus(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getOllamaAiProviderService(),
): Promise<DesktopResult<OllamaStatusDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = getOllamaStatusInputSchema.parse(rawInput);
    const result = await service.getOllamaStatus(parsed?.projectId, userId);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<OllamaStatusDto>(err);
  }
}

export async function handleHealthCheckOllama(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getOllamaAiProviderService(),
): Promise<DesktopResult<OllamaHealthDiagnosticDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = healthCheckOllamaInputSchema.parse(rawInput);
    const result = await service.healthCheckOllama(parsed, userId);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<OllamaHealthDiagnosticDto>(err);
  }
}

export async function handleGetOllamaConfig(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getOllamaAiProviderService(),
): Promise<DesktopResult<OllamaConfigDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = getOllamaConfigInputSchema.parse(rawInput);
    const result = await service.getOllamaConfig(parsed?.projectId, userId);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<OllamaConfigDto>(err);
  }
}

export async function handleSetOllamaConfig(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getOllamaAiProviderService(),
): Promise<DesktopResult<OllamaConfigDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = setOllamaConfigInputSchema.parse(rawInput);
    const result = await service.setOllamaConfig(parsed, userId);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<OllamaConfigDto>(err);
  }
}
