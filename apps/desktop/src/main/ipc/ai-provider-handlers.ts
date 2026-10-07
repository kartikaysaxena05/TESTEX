/**
 * @file apps/desktop/src/main/ipc/ai-provider-handlers.ts
 * Privileged IPC handlers for V9 Phase 126 AI Provider Abstraction.
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
  listAiProvidersInputSchema,
  getAiProviderInputSchema,
  validateAiRequestInputSchema,
  updateAiProviderConfigSchema,
  type ListAiProvidersInputDto,
  type GetAiProviderInputDto,
  type ValidateAiRequestInputDto,
  type UpdateAiProviderConfigInput,
  type AiProviderDescriptorDto,
  type AiProviderConfigDto,
  type NormalizedAiRequestDto,
  type DesktopResult,
  type DesktopErrorCode,
} from '@ai-quality/contracts';
import { ZodError, z } from 'zod';
import { assertAuthenticated } from './auth-handlers.js';
import { isTrustedIpcSender } from './sender-validation.js';

let defaultAiProviderService: AiProviderService | null = null;

export function getAiProviderService(): AiProviderService {
  if (!defaultAiProviderService) {
    defaultAiProviderService = new AiProviderService();
  }
  return defaultAiProviderService;
}

export function setAiProviderServiceForTest(service: AiProviderService | null): void {
  defaultAiProviderService = service;
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

export async function handleListAiProviders(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getAiProviderService(),
): Promise<DesktopResult<readonly AiProviderDescriptorDto[]>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = listAiProvidersInputSchema.parse(rawInput ?? {}) as ListAiProvidersInputDto;
    const providers = await service.listProviders(parsed.projectId, userId);
    return { ok: true, data: providers };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleGetAiProvider(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getAiProviderService(),
): Promise<DesktopResult<AiProviderDescriptorDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = getAiProviderInputSchema.parse(rawInput) as GetAiProviderInputDto;
    const provider = await service.getProvider(parsed.providerId, parsed.projectId, userId);
    return { ok: true, data: provider };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleValidateAiRequest(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getAiProviderService(),
): Promise<DesktopResult<NormalizedAiRequestDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = validateAiRequestInputSchema.parse(rawInput) as ValidateAiRequestInputDto;
    const request = await service.validateRequest(parsed, userId);
    return { ok: true, data: request };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

const getAiProviderConfigSchema = z.object({
  providerId: z.string().min(1).max(64),
  projectId: z.string().uuid().nullable().optional(),
});

export async function handleGetAiProviderConfig(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getAiProviderService(),
): Promise<DesktopResult<AiProviderConfigDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = getAiProviderConfigSchema.parse(rawInput);
    const config = await service.getConfig(parsed.providerId, parsed.projectId, userId);
    return { ok: true, data: config };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleUpdateAiProviderConfig(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getAiProviderService(),
): Promise<DesktopResult<AiProviderConfigDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = updateAiProviderConfigSchema.parse(rawInput) as UpdateAiProviderConfigInput;
    const config = await service.updateConfig(parsed, userId);
    return { ok: true, data: config };
  } catch (err) {
    return mapErrorToResult(err);
  }
}
