/**
 * @file apps/desktop/src/main/ipc/generation-handlers.ts
 * Privileged IPC handlers for V9 Phase 130 Local Model Chat & Generation Runtime.
 * Enforces sender verification, session authentication, request validation, and error classification.
 */

import crypto from 'node:crypto';
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
  AiConnectionError,
  AiGenerationError,
  AiUnknownError,
  AiCrossProjectAccessError,
  AiConfigInvalidError,
  AiConfigNotFoundError,
  AiModelNotFoundError,
  AiStructuredSchemaInvalidError,
  AiStructuredParseError,
  AiStructuredValidationError,
  AiStructuredMaxRetriesExceededError,
  AiStructuredSecurityViolationError,
  AiToolNotFoundError,
  AiToolDuplicateError,
  AiToolSchemaInvalidError,
  AiToolArgumentsInvalidError,
  AiToolCallParseError,
  AiToolExecutionProhibitedError,
  AiContextTooLargeError,
  AiOutputReservationExceededError,
  AiTokenBudgetExceededError,
  AiRemoteProviderBlockedError,
  AiPrivacyViolationError,
  AiSecretDetectedError,
  AiFallbackExhaustedError,
  AiFallbackPolicyBlockedError,
  AiStreamTimeoutError,
  AiRuntimeRecoveryRequiredError,
  AiConcurrencyLimitExceededError,
  UnauthorizedError,
} from '@ai-quality/core';
import {
  DESKTOP_CHANNELS,
  localGenerationRequestSchema,
  cancelGenerationInputSchema,
  getGenerationStatusInputSchema,
  structuredGenerationRequestSchema,
  validateStructuredInputSchema,
  getStructuredCapabilitiesInputSchema,
  listAiToolsInputSchema,
  getAiToolInputSchema,
  parseAiToolCallsInputSchema,
  validateAiToolCallInputSchema,
  generateAiToolCallsInputSchema,
  getAiToolCapabilitiesInputSchema,
  estimateTokensInputSchema,
  calculateContextBudgetInputSchema,
  optimizeContextSelectionInputSchema,
  getModelContextCapabilitiesInputSchema,
  getAiPrivacySettingsInputSchema,
  updateAiPrivacySettingsInputSchema,
  checkAiContextFirewallInputSchema,
  assembleRequirementTestContextInputSchema,
  getAiFallbackSettingsInputSchema,
  updateAiFallbackSettingsInputSchema,
  getAiProviderRegistryStatusInputSchema,
  aiProviderSelectionCriteriaSchema,
  type LocalGenerationRequestInputDto,
  type LocalGenerationResultDto,
  type LocalGenerationStatusDto,
  type CancelGenerationInputDto,
  type GetGenerationStatusInputDto,
  type AiStreamEventDto,
  type StructuredGenerationRequestInputDto,
  type StructuredGenerationResultDto,
  type ValidateStructuredInputDto,
  type StructuredValidationResultDto,
  type GetStructuredCapabilitiesInputDto,
  type StructuredCapabilitiesDto,
  type AiToolDefinitionDto,
  type NormalizedAiToolCallDto,
  type ValidatedAiToolCallResultDto,
  type AiToolCapabilitiesDto,
  type GenerateAiToolCallsInputDto,
  type GenerateAiToolCallsResultDto,
  type GetAiToolCapabilitiesInputDto,
  type ListAiToolsInputDto,
  type GetAiToolInputDto,
  type ParseAiToolCallsInputDto,
  type ValidateAiToolCallInputDto,
  type EstimateTokensInputDto,
  type TokenEstimationResultDto,
  type CalculateContextBudgetInputDto,
  type ContextBudgetDto,
  type OptimizeContextSelectionInputDto,
  type OptimizedContextSelectionResultDto,
  type GetModelContextCapabilitiesInputDto,
  type ModelContextCapabilitiesDto,
  type AiPrivacySettingsDto,
  type GetAiPrivacySettingsInputDto,
  type UpdateAiPrivacySettingsInputDto,
  type CheckAiContextFirewallInputDto,
  type AiContextFirewallResultDto,
  type AssembleRequirementTestContextInputDto,
  type RequirementTestContextResultDto,
  type AiFallbackSettingsDto,
  type GetAiFallbackSettingsInputDto,
  type UpdateAiFallbackSettingsInputDto,
  type AiProviderRegistryItemDto,
  type AiProviderSelectionCriteriaDto,
  type AiProviderSelectionResultDto,
  recoverInterruptedRequestsInputSchema,
  type AiActiveRequestDto,
  type AiRuntimeMetricsDto,
  type RecoverInterruptedRequestsInputDto,
  type RecoverInterruptedRequestsResultDto,
  type DesktopResult,
  type DesktopErrorCode,
} from '@ai-quality/contracts';
import { ZodError } from 'zod';
import { assertAuthenticated } from './auth-handlers.js';
import { isTrustedIpcSender } from './sender-validation.js';

let defaultAiProviderService: AiProviderService | null = null;

export function getGenerationAiProviderService(): AiProviderService {
  if (!defaultAiProviderService) {
    defaultAiProviderService = new AiProviderService();
  }
  return defaultAiProviderService;
}

export function setGenerationAiProviderServiceForTest(service: AiProviderService | null): void {
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
  let code: DesktopErrorCode = 'GENERATION_ERROR';
  let message = 'An unexpected error occurred during generation.';

  if (err instanceof AiConnectionError) {
    code = 'CONNECTION_ERROR';
    message = err.message;
  } else if (err instanceof AiGenerationError) {
    code = 'GENERATION_ERROR';
    message = err.message;
  } else if (err instanceof AiProviderUnavailableError) {
    code = 'PROVIDER_UNAVAILABLE';
    message = err.message;
  } else if (err instanceof AiModelUnavailableError) {
    code = 'MODEL_UNAVAILABLE';
    message = err.message;
  } else if (err instanceof AiModelNotFoundError) {
    code = 'AI_MODEL_NOT_FOUND';
    message = err.message;
  } else if (err instanceof AiTimeoutError) {
    code = 'TIMEOUT';
    message = err.message;
  } else if (err instanceof AiCancelledError) {
    code = 'CANCELLED';
    message = err.message;
  } else if (err instanceof AiInvalidResponseError) {
    code = 'INVALID_RESPONSE';
    message = err.message;
  } else if (err instanceof AiInvalidRequestError) {
    code = 'INVALID_REQUEST';
    message = err.message;
  } else if (err instanceof AiProviderAuthError) {
    code = 'PROVIDER_AUTH_ERROR';
    message = err.message;
  } else if (err instanceof AiRateLimitError) {
    code = 'RATE_LIMITED';
    message = err.message;
  } else if (err instanceof AiProviderError) {
    code = 'PROVIDER_ERROR';
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
  } else if (err instanceof AiStructuredSchemaInvalidError) {
    code = 'STRUCTURED_SCHEMA_INVALID';
    message = err.message;
  } else if (err instanceof AiStructuredParseError) {
    code = 'STRUCTURED_PARSE_ERROR';
    message = err.message;
  } else if (err instanceof AiStructuredValidationError) {
    code = 'STRUCTURED_VALIDATION_FAILED';
    message = err.message;
  } else if (err instanceof AiStructuredMaxRetriesExceededError) {
    code = 'STRUCTURED_MAX_RETRIES_EXCEEDED';
    message = err.message;
  } else if (err instanceof AiStructuredSecurityViolationError) {
    code = err.code as DesktopErrorCode;
    message = err.message;
  } else if (err instanceof AiToolNotFoundError) {
    code = 'TOOL_NOT_FOUND';
    message = err.message;
  } else if (err instanceof AiToolDuplicateError) {
    code = 'TOOL_DUPLICATE';
    message = err.message;
  } else if (err instanceof AiToolSchemaInvalidError) {
    code = 'TOOL_SCHEMA_INVALID';
    message = err.message;
  } else if (err instanceof AiToolArgumentsInvalidError) {
    code = 'TOOL_ARGUMENTS_INVALID';
    message = err.message;
  } else if (err instanceof AiToolCallParseError) {
    code = 'TOOL_CALL_PARSE_ERROR';
    message = err.message;
  } else if (err instanceof AiToolExecutionProhibitedError) {
    code = 'TOOL_EXECUTION_PROHIBITED';
    message = err.message;
  } else if (err instanceof AiContextTooLargeError) {
    code = 'CONTEXT_TOO_LARGE';
    message = err.message;
  } else if (err instanceof AiOutputReservationExceededError) {
    code = 'OUTPUT_RESERVATION_EXCEEDED';
    message = err.message;
  } else if (err instanceof AiTokenBudgetExceededError) {
    code = 'TOKEN_BUDGET_EXCEEDED';
    message = err.message;
  } else if (err instanceof AiRemoteProviderBlockedError) {
    code = 'AI_REMOTE_PROVIDER_BLOCKED';
    message = err.message;
  } else if (err instanceof AiPrivacyViolationError) {
    code = 'AI_PRIVACY_VIOLATION';
    message = err.message;
  } else if (err instanceof AiSecretDetectedError) {
    code = 'AI_SECRET_DETECTED';
    message = err.message;
  } else if (err instanceof AiFallbackExhaustedError) {
    code = 'AI_FALLBACK_EXHAUSTED';
    message = err.message;
  } else if (err instanceof AiFallbackPolicyBlockedError) {
    code = 'AI_FALLBACK_POLICY_BLOCKED';
    message = err.message;
  } else if (err instanceof AiStreamTimeoutError) {
    code = 'AI_STREAM_TIMEOUT';
    message = err.message;
  } else if (err instanceof AiRuntimeRecoveryRequiredError) {
    code = 'AI_RUNTIME_RECOVERY_REQUIRED';
    message = err.message;
  } else if (err instanceof AiConcurrencyLimitExceededError) {
    code = 'VALIDATION_ERROR';
    message = err.message;
  } else if (err instanceof AiUnknownError) {
    code = 'UNKNOWN';
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

/**
 * Handles 'desktop:ai:generation:generate'.
 */
export async function handleLocalGenerate(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<LocalGenerationResultDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const validatedInput = localGenerationRequestSchema.parse(rawInput);
    const result = await service.generateLocal(validatedInput, userId);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:generation:cancel'.
 */
export async function handleCancelGeneration(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<{ readonly cancelled: boolean; readonly requestId: string }>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const validatedInput = cancelGenerationInputSchema.parse(rawInput);
    const result = await service.cancelLocalGeneration(validatedInput, userId);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:generation:get-status'.
 */
export async function handleGetGenerationStatus(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<LocalGenerationStatusDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    await extractUser(event);
    const validatedInput = getGenerationStatusInputSchema.parse(rawInput);
    const result = service.getLocalGenerationStatus(validatedInput);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:generation:stream'.
 * Initiates streaming response generation for the caller while dispatching
 * progressive AiStreamEventDto events over IPC to the renderer frame.
 */
export async function handleStreamGeneration(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<{ readonly requestId: string }>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const validatedInput = localGenerationRequestSchema.parse(rawInput);
    const requestId = validatedInput.requestId ?? crypto.randomUUID();
    const requestWithId = { ...validatedInput, requestId };

    // Asynchronously consume stream and push events to renderer
    (async () => {
      try {
        for await (const streamEvent of service.streamLocal(requestWithId, userId)) {
          if (!event || event.sender.isDestroyed()) {
            await service.cancelLocalGeneration({ requestId }).catch(() => {});
            break;
          }

          // Emit to unified stream channel
          event.sender.send(DESKTOP_CHANNELS.AI_STREAM_EVENT, streamEvent);

          // Emit to granular stream event channels
          switch (streamEvent.type) {
            case 'START':
              event.sender.send(DESKTOP_CHANNELS.AI_STREAM_START, streamEvent);
              break;
            case 'DELTA':
              event.sender.send(DESKTOP_CHANNELS.AI_STREAM_DELTA, streamEvent);
              break;
            case 'COMPLETE':
              event.sender.send(DESKTOP_CHANNELS.AI_STREAM_COMPLETE, streamEvent);
              break;
            case 'ERROR':
              event.sender.send(DESKTOP_CHANNELS.AI_STREAM_ERROR, streamEvent);
              break;
            case 'CANCELLED':
              event.sender.send(DESKTOP_CHANNELS.AI_STREAM_CANCELLED, streamEvent);
              break;
          }
        }
      } catch (err: unknown) {
        if (event && !event.sender.isDestroyed()) {
          const mapped = mapErrorToResult<unknown>(err);
          const errorMsg = !mapped.ok ? mapped.error.message : 'Stream generation error';
          const errEvent: AiStreamEventDto = {
            requestId,
            projectId: validatedInput.projectId,
            sequence: 999999,
            type: 'ERROR',
            done: true,
            error: errorMsg,
          };
          event.sender.send(DESKTOP_CHANNELS.AI_STREAM_EVENT, errEvent);
          event.sender.send(DESKTOP_CHANNELS.AI_STREAM_ERROR, errEvent);
        }
      }
    })();

    return {
      ok: true,
      data: { requestId },
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:structured:generate' (Phase 132).
 */
export async function handleGenerateStructured(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<StructuredGenerationResultDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const validatedInput = structuredGenerationRequestSchema.parse(rawInput);
    const result = await service.generateStructured(validatedInput, userId);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:structured:validate' (Phase 132).
 */
export async function handleValidateStructured(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<StructuredValidationResultDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    await extractUser(event);
    const validatedInput = validateStructuredInputSchema.parse(rawInput);
    const result = service.validateStructured(validatedInput);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:structured:get-capabilities' (Phase 132).
 */
export async function handleGetStructuredCapabilities(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<StructuredCapabilitiesDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    await extractUser(event);
    const validatedInput = getStructuredCapabilitiesInputSchema.parse(rawInput ?? {});
    const result = await service.getStructuredCapabilities(validatedInput);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:tool:list' (Phase 133).
 */
export async function handleListAiTools(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<readonly AiToolDefinitionDto[]>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const validatedInput = listAiToolsInputSchema.parse(rawInput ?? {});
    const result = await service.listTools(validatedInput, userId);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:tool:get' (Phase 133).
 */
export async function handleGetAiTool(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<AiToolDefinitionDto | null>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const validatedInput = getAiToolInputSchema.parse(rawInput);
    const result = await service.getTool(validatedInput, userId);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:tool:parse-call' (Phase 133).
 */
export async function handleParseAiToolCalls(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<readonly NormalizedAiToolCallDto[]>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    await extractUser(event);
    const validatedInput = parseAiToolCallsInputSchema.parse(rawInput);
    const result = service.parseToolCalls(validatedInput);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:tool:validate-call' (Phase 133).
 */
export async function handleValidateAiToolCall(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<ValidatedAiToolCallResultDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const validatedInput = validateAiToolCallInputSchema.parse(rawInput);
    const result = await service.validateToolCall(validatedInput, userId);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:tool:generate-calls' (Phase 133).
 */
export async function handleGenerateAiToolCalls(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<GenerateAiToolCallsResultDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const validatedInput = generateAiToolCallsInputSchema.parse(rawInput);
    const result = await service.generateToolCalls(validatedInput, userId);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:tool:get-capabilities' (Phase 133).
 */
export async function handleGetAiToolCapabilities(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<AiToolCapabilitiesDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    await extractUser(event);
    const validatedInput = getAiToolCapabilitiesInputSchema.parse(rawInput ?? {});
    const result = await service.getToolCapabilities(validatedInput);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:context:estimate-tokens' (Phase 134).
 */
export async function handleEstimateTokens(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<TokenEstimationResultDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const validatedInput = estimateTokensInputSchema.parse(rawInput);
    const result = service.estimateTokens(validatedInput);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:context:calculate-budget' (Phase 134).
 */
export async function handleCalculateContextBudget(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<ContextBudgetDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const validatedInput = calculateContextBudgetInputSchema.parse(rawInput);
    const result = await service.calculateContextBudget(validatedInput);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:context:optimize-selection' (Phase 134).
 */
export async function handleOptimizeContextSelection(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<OptimizedContextSelectionResultDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const validatedInput = optimizeContextSelectionInputSchema.parse(rawInput);
    const result = await service.optimizeContextSelection(validatedInput, userId);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:context:get-capabilities' (Phase 134).
 */
export async function handleGetModelContextCapabilities(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<ModelContextCapabilitiesDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    await extractUser(event);
    const validatedInput = getModelContextCapabilitiesInputSchema.parse(rawInput);
    const result = await service.getModelContextCapabilities(validatedInput);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:privacy:get-settings' (Phase 137).
 */
export async function handleGetAiPrivacySettings(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<AiPrivacySettingsDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const validatedInput = getAiPrivacySettingsInputSchema.parse(rawInput ?? {});
    const result = await service.getPrivacySettings(validatedInput, userId);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:privacy:update-settings' (Phase 137).
 */
export async function handleUpdateAiPrivacySettings(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<AiPrivacySettingsDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const validatedInput = updateAiPrivacySettingsInputSchema.parse(rawInput);
    const result = await service.updatePrivacySettings(validatedInput, userId);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:privacy:check-firewall' (Phase 137).
 */
export async function handleCheckAiContextFirewall(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<AiContextFirewallResultDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const validatedInput = checkAiContextFirewallInputSchema.parse(rawInput);
    const result = await service.checkContextFirewall(validatedInput, userId);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:context:assemble-req-test' (Phase 136).
 */
export async function handleAssembleRequirementTestContext(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<RequirementTestContextResultDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const validatedInput = assembleRequirementTestContextInputSchema.parse(rawInput);
    const result = await service.assembleRequirementTestContext(validatedInput, userId);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:fallback:get-policy' (Phase 138).
 */
export async function handleGetAiFallbackPolicy(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<AiFallbackSettingsDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const validatedInput = getAiFallbackSettingsInputSchema.parse(rawInput ?? {});
    const result = await service.getFallbackSettings(validatedInput, userId);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}
export const handleGetAiFallbackSettings = handleGetAiFallbackPolicy;

/**
 * Handles 'desktop:ai:fallback:set-policy' (Phase 138).
 */
export async function handleSetAiFallbackPolicy(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<AiFallbackSettingsDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const validatedInput = updateAiFallbackSettingsInputSchema.parse(rawInput);
    const result = await service.updateFallbackSettings(validatedInput, userId);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}
export const handleUpdateAiFallbackSettings = handleSetAiFallbackPolicy;

/**
 * Handles 'desktop:ai:providers:list' (Phase 138).
 */
export async function handleListAiProviderRegistry(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<readonly AiProviderRegistryItemDto[]>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const validatedInput = getAiProviderRegistryStatusInputSchema.parse(rawInput ?? {});
    const result = await service.listRegisteredProviders(validatedInput.projectId, userId);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:providers:status' (Phase 138).
 */
export async function handleGetAiProviderRegistryStatus(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<AiProviderRegistryItemDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const input = (rawInput ?? {}) as { providerId?: string; projectId?: string | null };
    if (!input.providerId || typeof input.providerId !== 'string') {
      return {
        ok: false,
        error: { code: 'INVALID_REQUEST', message: 'Provider ID is required.' },
      };
    }
    const result = await service.getRegisteredProviderStatus(input.providerId, input.projectId, userId);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:providers:select' (Phase 138).
 */
export async function handleSelectAiProvider(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<AiProviderSelectionResultDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const validatedInput = aiProviderSelectionCriteriaSchema.parse(rawInput);
    const result = await service.selectProvider(validatedInput, userId);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:lifecycle:get-active-requests' (Phase 139).
 */
export async function handleGetActiveAiRequests(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<readonly AiActiveRequestDto[]>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    await extractUser(event);
    const input = (rawInput ?? {}) as { projectId?: string | null };
    const requests = service.getActiveRequests(input.projectId);

    return {
      ok: true,
      data: requests,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:lifecycle:get-metrics' (Phase 139).
 */
export async function handleGetAiRuntimeMetrics(
  event?: IpcMainInvokeEvent,
  _rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<AiRuntimeMetricsDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    await extractUser(event);
    const metrics = service.getRuntimeMetrics();

    return {
      ok: true,
      data: metrics,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/**
 * Handles 'desktop:ai:lifecycle:recover-interrupted' (Phase 139).
 */
export async function handleRecoverInterruptedAiRequests(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AiProviderService = getGenerationAiProviderService(),
): Promise<DesktopResult<RecoverInterruptedRequestsResultDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    await extractUser(event);
    const validatedInput = recoverInterruptedRequestsInputSchema.parse(rawInput ?? {});
    const result = await service.recoverInterruptedRequests(validatedInput);

    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

