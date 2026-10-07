/**
 * @file apps/desktop/src/main/ipc/ai-model-handlers.ts
 * Privileged IPC handlers for V9 Phase 128 Installed Model Discovery
 * and Phase 129 Model Selection & Capability Detection.
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
  AiModelNotFoundError,
  AiNoCompatibleModelError,
  AiCapabilityUnsupportedError,
  AiCapabilityUnknownError,
  AiCapabilityProbeTimeoutError,
  AiCapabilityProbeFailedError,
  AiSelectionInvalidError,
  UnauthorizedError,
} from '@ai-quality/core';
import {
  listAiModelsInputSchema,
  refreshAiModelsInputSchema,
  getAiModelInputSchema,
  getModelCapabilitiesInputSchema,
  verifyModelCapabilitiesInputSchema,
  selectModelInputSchema,
  getModelSelectionInputSchema,
  resolveModelForTaskInputSchema,
  type AiModelListDto,
  type AiModelDto,
  type ModelCapabilitiesProfileDto,
  type ModelSelectionResultDto,
  type DesktopResult,
  type DesktopErrorCode,
} from '@ai-quality/contracts';
import { ZodError } from 'zod';
import { assertAuthenticated } from './auth-handlers.js';
import { isTrustedIpcSender } from './sender-validation.js';

let defaultAiProviderService: AiProviderService | null = null;

export function getAiModelProviderService(): AiProviderService {
  if (!defaultAiProviderService) {
    defaultAiProviderService = new AiProviderService();
  }
  return defaultAiProviderService;
}

export function setAiModelProviderServiceForTest(service: AiProviderService | null): void {
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

  if (err instanceof AiNoCompatibleModelError) {
    code = 'NO_COMPATIBLE_MODEL';
    message = err.message;
  } else if (err instanceof AiCapabilityUnsupportedError) {
    code = 'CAPABILITY_UNSUPPORTED';
    message = err.message;
  } else if (err instanceof AiCapabilityUnknownError) {
    code = 'CAPABILITY_UNKNOWN';
    message = err.message;
  } else if (err instanceof AiCapabilityProbeTimeoutError) {
    code = 'CAPABILITY_PROBE_TIMEOUT';
    message = err.message;
  } else if (err instanceof AiCapabilityProbeFailedError) {
    code = 'CAPABILITY_PROBE_FAILED';
    message = err.message;
  } else if (err instanceof AiSelectionInvalidError) {
    code = 'SELECTION_INVALID';
    message = err.message;
  } else if (err instanceof AiProviderUnavailableError) {
    code = 'PROVIDER_UNAVAILABLE';
    message = err.message;
  } else if (err instanceof AiProviderAuthError) {
    code = 'PROVIDER_AUTH_ERROR';
    message = err.message;
  } else if (err instanceof AiModelNotFoundError) {
    code = 'AI_MODEL_NOT_FOUND';
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
    message = err.errors.map((e) => e.message).join(' ');
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

export async function handleListAiModels(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getAiModelProviderService(),
): Promise<DesktopResult<AiModelListDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = listAiModelsInputSchema.parse(rawInput ?? {});
    const result = await service.listAiModels(parsed, userId);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<AiModelListDto>(err);
  }
}

export async function handleRefreshAiModels(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getAiModelProviderService(),
): Promise<DesktopResult<AiModelListDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = refreshAiModelsInputSchema.parse(rawInput ?? {});
    const result = await service.refreshAiModels(parsed, userId);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<AiModelListDto>(err);
  }
}

export async function handleGetAiModel(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getAiModelProviderService(),
): Promise<DesktopResult<AiModelDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = getAiModelInputSchema.parse(rawInput);
    const result = await service.getAiModel(parsed, userId);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<AiModelDto>(err);
  }
}

export async function handleGetModelCapabilities(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getAiModelProviderService(),
): Promise<DesktopResult<ModelCapabilitiesProfileDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = getModelCapabilitiesInputSchema.parse(rawInput);
    const result = await service.getModelCapabilities(parsed, userId);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<ModelCapabilitiesProfileDto>(err);
  }
}

export async function handleVerifyModelCapabilities(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getAiModelProviderService(),
): Promise<DesktopResult<ModelCapabilitiesProfileDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = verifyModelCapabilitiesInputSchema.parse(rawInput);
    const result = await service.verifyModelCapabilities(parsed, userId);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<ModelCapabilitiesProfileDto>(err);
  }
}

export async function handleSelectModel(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getAiModelProviderService(),
): Promise<DesktopResult<ModelSelectionResultDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = selectModelInputSchema.parse(rawInput);
    const result = await service.selectModel(parsed, userId);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<ModelSelectionResultDto>(err);
  }
}

export async function handleGetModelSelection(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getAiModelProviderService(),
): Promise<DesktopResult<ModelSelectionResultDto | null>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = getModelSelectionInputSchema.parse(rawInput ?? {});
    const result = await service.getModelSelection(parsed, userId);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<ModelSelectionResultDto | null>(err);
  }
}

export async function handleResolveModelForTask(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getAiModelProviderService(),
): Promise<DesktopResult<ModelSelectionResultDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = resolveModelForTaskInputSchema.parse(rawInput);
    const result = await service.resolveModelForTask(parsed, userId);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult<ModelSelectionResultDto>(err);
  }
}
