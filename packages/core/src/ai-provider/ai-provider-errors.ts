/**
 * @file packages/core/src/ai-provider/ai-provider-errors.ts
 * Deterministic AI runtime errors for V9 Phase 126 AI Provider Abstraction.
 */

import {
  AiGatewayError,
  AiProviderUnavailableError,
  AiTimeoutError,
  AiCancelledError,
  AiInvalidRequestError,
  AiRateLimitError,
} from '../ai/ai-errors.js';
import type {
  DesktopErrorCode,
  ModelCapabilityType,
  ModelSelectionTask,
} from '@ai-quality/contracts';

// Re-export common base error and unified error types from existing AI infrastructure
export {
  AiGatewayError as AiRuntimeError,
  AiProviderUnavailableError,
  AiTimeoutError,
  AiCancelledError,
  AiInvalidRequestError,
  AiRateLimitError,
};

/**
 * Thrown when authentication or credentials for the AI provider fail.
 */
export class AiProviderAuthError extends AiGatewayError {
  constructor(providerId: string, message?: string, cause?: unknown) {
    super(
      message ?? `Authentication failed for AI Provider '${providerId}'.`,
      'PROVIDER_AUTH_ERROR',
      { providerId, isTransient: false, cause },
    );
    this.name = 'AiProviderAuthError';
  }
}

/**
 * Thrown when the requested model is not found, not pulled, or unsupported by the provider.
 */
export class AiModelUnavailableError extends AiGatewayError {
  readonly model: string;

  constructor(model: string, providerId?: string, message?: string) {
    super(
      message ?? `AI model '${model}' is unavailable on provider '${providerId ?? 'UNKNOWN'}'.`,
      'MODEL_UNAVAILABLE',
      { providerId, isTransient: false },
    );
    this.name = 'AiModelUnavailableError';
    this.model = model;
  }
}

/**
 * Thrown when the provider returns a malformed, empty, or unparseable response payload.
 */
export class AiInvalidResponseError extends AiGatewayError {
  constructor(providerId: string, message?: string, cause?: unknown) {
    super(
      message ?? `AI Provider '${providerId}' returned an invalid or unparseable response.`,
      'INVALID_RESPONSE',
      { providerId, isTransient: false, cause },
    );
    this.name = 'AiInvalidResponseError';
  }
}

/**
 * Thrown when an internal provider error or unhandled status occurs.
 */
export class AiProviderError extends AiGatewayError {
  constructor(providerId: string, message?: string, cause?: unknown) {
    super(
      message ?? `An error occurred while communicating with AI Provider '${providerId}'.`,
      'PROVIDER_ERROR',
      { providerId, isTransient: false, cause },
    );
    this.name = 'AiProviderError';
  }
}

/**
 * Thrown when an unexpected or unclassified AI runtime error occurs.
 */
export class AiUnknownError extends AiGatewayError {
  constructor(message?: string, cause?: unknown) {
    super(message ?? 'An unknown AI runtime error occurred.', 'UNKNOWN', {
      isTransient: false,
      cause,
    });
    this.name = 'AiUnknownError';
  }
}

/**
 * Thrown when a user attempts to access or mutate AI configuration for a project they do not own.
 */
export class AiCrossProjectAccessError extends AiGatewayError {
  constructor(message?: string) {
    super(
      message ?? 'Cross-project AI configuration access is forbidden.',
      'AI_CROSS_PROJECT_ACCESS',
      { isTransient: false },
    );
    this.name = 'AiCrossProjectAccessError';
  }
}

/**
 * Thrown when AI configuration fails schema or security validation.
 */
export class AiConfigInvalidError extends AiGatewayError {
  constructor(message: string, providerId?: string) {
    super(message, 'AI_CONFIG_INVALID', { providerId, isTransient: false });
    this.name = 'AiConfigInvalidError';
  }
}

/**
 * Thrown when requested AI configuration is not found.
 */
export class AiConfigNotFoundError extends AiGatewayError {
  constructor(providerId: string, projectId?: string | null) {
    super(
      `AI configuration for provider '${providerId}' was not found${projectId ? ` in project '${projectId}'` : ''}.`,
      'AI_CONFIG_NOT_FOUND',
      { providerId, isTransient: false },
    );
    this.name = 'AiConfigNotFoundError';
  }
}

/**
 * Thrown when requested AI model is not found in discovered models.
 */
export class AiModelNotFoundError extends AiGatewayError {
  constructor(modelId: string, providerId?: string) {
    super(
      `AI model '${modelId}' was not found on provider '${providerId ?? 'UNKNOWN'}'.`,
      'AI_MODEL_NOT_FOUND',
      { providerId, isTransient: false },
    );
    this.name = 'AiModelNotFoundError';
  }
}

/**
 * Thrown when no installed model satisfies the required task capabilities or context bounds (Phase 129).
 */
export class AiNoCompatibleModelError extends AiGatewayError {
  readonly task: ModelSelectionTask;
  readonly missingCapabilities: readonly ModelCapabilityType[];

  constructor(
    task: ModelSelectionTask,
    missingCapabilities: readonly ModelCapabilityType[],
    message?: string,
  ) {
    const detail = missingCapabilities.length > 0
      ? ` (missing: ${missingCapabilities.join(', ')})`
      : '';
    super(
      message ?? `No compatible AI model found for task '${task}'${detail}.`,
      'NO_COMPATIBLE_MODEL',
      { isTransient: false },
    );
    this.name = 'AiNoCompatibleModelError';
    this.task = task;
    this.missingCapabilities = missingCapabilities;
  }
}

/**
 * Thrown when an AI model explicitly does not support a required capability (Phase 129).
 */
export class AiCapabilityUnsupportedError extends AiGatewayError {
  readonly modelId: string;
  readonly capability: ModelCapabilityType;

  constructor(modelId: string, capability: ModelCapabilityType, message?: string) {
    super(
      message ?? `Model '${modelId}' does not support required capability '${capability}'.`,
      'CAPABILITY_UNSUPPORTED',
      { isTransient: false },
    );
    this.name = 'AiCapabilityUnsupportedError';
    this.modelId = modelId;
    this.capability = capability;
  }
}

/**
 * Thrown when a required capability cannot be verified or determined (Phase 129).
 */
export class AiCapabilityUnknownError extends AiGatewayError {
  readonly modelId: string;
  readonly capability: ModelCapabilityType;

  constructor(modelId: string, capability: ModelCapabilityType, message?: string) {
    super(
      message ?? `Capability '${capability}' for model '${modelId}' is unknown and unverified.`,
      'CAPABILITY_UNKNOWN',
      { isTransient: false },
    );
    this.name = 'AiCapabilityUnknownError';
    this.modelId = modelId;
    this.capability = capability;
  }
}

/**
 * Thrown when a capability probe execution exceeds the timeout threshold (Phase 129).
 */
export class AiCapabilityProbeTimeoutError extends AiGatewayError {
  readonly modelId: string;
  readonly capability: ModelCapabilityType;
  readonly timeoutMs: number;

  constructor(modelId: string, capability: ModelCapabilityType, timeoutMs: number) {
    super(
      `Capability probe '${capability}' for model '${modelId}' timed out after ${timeoutMs}ms.`,
      'CAPABILITY_PROBE_TIMEOUT',
      { isTransient: true },
    );
    this.name = 'AiCapabilityProbeTimeoutError';
    this.modelId = modelId;
    this.capability = capability;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Thrown when a capability verification probe fails execution or produces invalid outputs (Phase 129).
 */
export class AiCapabilityProbeFailedError extends AiGatewayError {
  readonly modelId: string;
  readonly capability: ModelCapabilityType;
  readonly reason: string;

  constructor(
    modelId: string,
    capability: ModelCapabilityType,
    reason: string,
    cause?: unknown,
  ) {
    super(
      `Capability probe '${capability}' failed for model '${modelId}': ${reason}`,
      'CAPABILITY_PROBE_FAILED',
      { isTransient: false, cause },
    );
    this.name = 'AiCapabilityProbeFailedError';
    this.modelId = modelId;
    this.capability = capability;
    this.reason = reason;
  }
}

/**
 * Thrown when an invalid model selection request is provided (Phase 129).
 */
export class AiSelectionInvalidError extends AiGatewayError {
  constructor(reason: string) {
    super(`Model selection invalid: ${reason}`, 'SELECTION_INVALID', {
      isTransient: false,
    });
    this.name = 'AiSelectionInvalidError';
  }
}

/**
 * Thrown when low-level network or socket connection fails during generation runtime (Phase 130).
 */
export class AiConnectionError extends AiGatewayError {
  constructor(providerId: string, message?: string, cause?: unknown) {
    super(
      message ?? `Connection to AI Provider '${providerId}' failed or was interrupted.`,
      'CONNECTION_ERROR',
      { providerId, isTransient: true, cause },
    );
    this.name = 'AiConnectionError';
  }
}

/**
 * Thrown when an unrecoverable model generation execution failure occurs (Phase 130).
 */
export class AiGenerationError extends AiGatewayError {
  constructor(message: string, providerId?: string, cause?: unknown) {
    super(message, 'GENERATION_ERROR', { providerId, isTransient: false, cause });
    this.name = 'AiGenerationError';
  }
}

/**
 * Thrown when an unknown schema or schema version is requested (Phase 132).
 */
export class AiStructuredSchemaInvalidError extends AiGatewayError {
  readonly schemaName: string;
  readonly schemaVersion?: number;

  constructor(schemaName: string, message?: string, schemaVersion?: number) {
    super(
      message ?? `Structured output schema '${schemaName}' (v${schemaVersion ?? 1}) is invalid or not registered.`,
      'STRUCTURED_SCHEMA_INVALID',
      { isTransient: false },
    );
    this.name = 'AiStructuredSchemaInvalidError';
    this.schemaName = schemaName;
    this.schemaVersion = schemaVersion;
  }
}

/**
 * Thrown when raw model output cannot be parsed as JSON or delimited JSON (Phase 132).
 */
export class AiStructuredParseError extends AiGatewayError {
  readonly rawContent: string;

  constructor(message: string, rawContent: string, providerId?: string) {
    super(message, 'STRUCTURED_PARSE_ERROR', { providerId, isTransient: false });
    this.name = 'AiStructuredParseError';
    this.rawContent = rawContent;
  }
}

/**
 * Thrown when parsed model output violates schema constraints (Phase 132).
 */
export class AiStructuredValidationError extends AiGatewayError {
  readonly schemaName: string;
  readonly validationErrors: readonly { path: string; message: string }[];

  constructor(
    schemaName: string,
    validationErrors: readonly { path: string; message: string }[],
    providerId?: string,
  ) {
    const errorDetails = validationErrors.map((e) => `${e.path}: ${e.message}`).join('; ');
    super(
      `Structured output validation failed for schema '${schemaName}': ${errorDetails}`,
      'STRUCTURED_VALIDATION_FAILED',
      { providerId, isTransient: false },
    );
    this.name = 'AiStructuredValidationError';
    this.schemaName = schemaName;
    this.validationErrors = validationErrors;
  }
}

/**
 * Thrown when bounded retry attempts are exhausted without obtaining valid structured output (Phase 132).
 */
export class AiStructuredMaxRetriesExceededError extends AiGatewayError {
  readonly attempts: number;
  readonly lastError: string;

  constructor(attempts: number, lastError: string, providerId?: string) {
    super(
      `Structured output generation exceeded max retries (${attempts}). Last error: ${lastError}`,
      'STRUCTURED_MAX_RETRIES_EXCEEDED',
      { providerId, isTransient: false },
    );
    this.name = 'AiStructuredMaxRetriesExceededError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

/**
 * Thrown when requested structured payload exceeds character limits or nesting depth limits (Phase 132).
 */
export class AiStructuredSecurityViolationError extends AiGatewayError {
  constructor(message: string, code: 'STRUCTURED_PAYLOAD_TOO_LARGE' | 'STRUCTURED_NESTING_TOO_DEEP') {
    super(message, code, { isTransient: false });
    this.name = 'AiStructuredSecurityViolationError';
  }
}

// ============================================================================
// Phase 133: Tool-Calling Compatibility Layer Errors
// ============================================================================

/**
 * Thrown when a requested tool does not exist in the registry (Phase 133).
 */
export class AiToolNotFoundError extends AiGatewayError {
  readonly toolName: string;

  constructor(toolName: string, projectId?: string | null) {
    super(
      `Tool '${toolName}' is not registered${projectId ? ` for project '${projectId}'` : ''}.`,
      'TOOL_NOT_FOUND',
      { isTransient: false },
    );
    this.name = 'AiToolNotFoundError';
    this.toolName = toolName;
  }
}

/**
 * Thrown when registering a tool with duplicate name or conflicting version (Phase 133).
 */
export class AiToolDuplicateError extends AiGatewayError {
  readonly toolName: string;

  constructor(toolName: string) {
    super(
      `Tool '${toolName}' is already registered in this registry.`,
      'TOOL_DUPLICATE',
      { isTransient: false },
    );
    this.name = 'AiToolDuplicateError';
    this.toolName = toolName;
  }
}

/**
 * Thrown when a tool definition schema fails syntax or security validation (Phase 133).
 */
export class AiToolSchemaInvalidError extends AiGatewayError {
  readonly toolName: string;

  constructor(toolName: string, message: string) {
    super(
      `Tool '${toolName}' definition schema is invalid: ${message}`,
      'TOOL_SCHEMA_INVALID',
      { isTransient: false },
    );
    this.name = 'AiToolSchemaInvalidError';
    this.toolName = toolName;
  }
}

/**
 * Thrown when tool call arguments violate the tool's input schema (Phase 133).
 */
export class AiToolArgumentsInvalidError extends AiGatewayError {
  readonly toolName: string;
  readonly errors: readonly { path: string; message: string }[];

  constructor(toolName: string, errors: readonly { path: string; message: string }[]) {
    const details = errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    super(
      `Tool call arguments for '${toolName}' failed schema validation: ${details}`,
      'TOOL_ARGUMENTS_INVALID',
      { isTransient: false },
    );
    this.name = 'AiToolArgumentsInvalidError';
    this.toolName = toolName;
    this.errors = errors;
  }
}

/**
 * Thrown when model output cannot be parsed into structured tool calls (Phase 133).
 */
export class AiToolCallParseError extends AiGatewayError {
  readonly rawContent: string;

  constructor(message: string, rawContent: string) {
    super(message, 'TOOL_CALL_PARSE_ERROR', { isTransient: false });
    this.name = 'AiToolCallParseError';
    this.rawContent = rawContent;
  }
}

/**
 * Thrown when tool execution is attempted in Phase 133 (Phase 133 stops at validated ToolCall boundary).
 */
export class AiToolExecutionProhibitedError extends AiGatewayError {
  readonly toolName: string;

  constructor(toolName: string) {
    super(
      `Autonomous execution of tool '${toolName}' is strictly prohibited in Phase 133 (reserved for V10 executor).`,
      'TOOL_EXECUTION_PROHIBITED',
      { isTransient: false },
    );
    this.name = 'AiToolExecutionProhibitedError';
    this.toolName = toolName;
  }
}

// ============================================================================
// Phase 134: Context Window & Token Management Errors
// ============================================================================

/**
 * Thrown when requested context tokens exceed the model's available input budget (Phase 134).
 */
export class AiContextTooLargeError extends AiGatewayError {
  readonly requiredTokens: number;
  readonly availableTokens: number;
  readonly contextWindow: number;
  readonly suggestedAction: string;

  constructor(
    requiredTokens: number,
    availableTokens: number,
    contextWindow: number,
    suggestedAction = 'Reduce repository context, truncate conversation history, or select a larger context model.',
  ) {
    super(
      `Context size (${requiredTokens} tokens) exceeds available model input budget (${availableTokens} of ${contextWindow} tokens). ${suggestedAction}`,
      'CONTEXT_TOO_LARGE',
      { isTransient: false },
    );
    this.name = 'AiContextTooLargeError';
    this.requiredTokens = requiredTokens;
    this.availableTokens = availableTokens;
    this.contextWindow = contextWindow;
    this.suggestedAction = suggestedAction;
  }
}

/**
 * Thrown when output reservation exceeds safe bounds or model capability (Phase 134).
 */
export class AiOutputReservationExceededError extends AiGatewayError {
  readonly requestedReservation: number;
  readonly maxOutputTokens: number;

  constructor(requestedReservation: number, maxOutputTokens: number) {
    super(
      `Output token reservation (${requestedReservation}) exceeds maximum supported output tokens (${maxOutputTokens}).`,
      'OUTPUT_RESERVATION_EXCEEDED',
      { isTransient: false },
    );
    this.name = 'AiOutputReservationExceededError';
    this.requestedReservation = requestedReservation;
    this.maxOutputTokens = maxOutputTokens;
  }
}

/**
 * Thrown when token estimation or budget calculation fails (Phase 134).
 */
export class AiTokenBudgetExceededError extends AiGatewayError {
  constructor(message: string) {
    super(message, 'TOKEN_BUDGET_EXCEEDED', { isTransient: false });
    this.name = 'AiTokenBudgetExceededError';
  }
}

/**
 * Thrown when a remote AI provider is invoked while LOCAL_ONLY privacy mode is active (Phase 137).
 */
export class AiRemoteProviderBlockedError extends AiGatewayError {
  override readonly providerId: string;
  readonly privacyMode: string;

  constructor(
    providerId: string,
    privacyMode = 'LOCAL_ONLY',
    message?: string,
  ) {
    super(
      message ??
        `AI Provider '${providerId}' is blocked: Local-only privacy mode is active for this project. Only local providers (e.g. Ollama) are permitted.`,
      'AI_REMOTE_PROVIDER_BLOCKED',
      { providerId, isTransient: false },
    );
    this.name = 'AiRemoteProviderBlockedError';
    this.providerId = providerId;
    this.privacyMode = privacyMode;
  }
}

/**
 * Thrown when an AI request violates project privacy or context firewall policies (Phase 137).
 */
export class AiPrivacyViolationError extends AiGatewayError {
  readonly reason: string;

  constructor(reason: string, message?: string) {
    super(
      message ?? `AI privacy policy violation: ${reason}`,
      'AI_PRIVACY_VIOLATION',
      { isTransient: false },
    );
    this.name = 'AiPrivacyViolationError';
    this.reason = reason;
  }
}

/**
 * Thrown when an unredacted secret or prohibited credential is intentionally detected (Phase 137).
 */
export class AiSecretDetectedError extends AiGatewayError {
  readonly secretType: string;

  constructor(secretType: string, message?: string) {
    super(
      message ??
        `Sensitive credential (${secretType}) detected in AI request payload. Secret transmission is prohibited.`,
      'AI_SECRET_DETECTED',
      { isTransient: false },
    );
    this.name = 'AiSecretDetectedError';
    this.secretType = secretType;
  }
}

// ============================================================================
// Phase 138: AI Provider Switching & Fallback Errors
// ============================================================================

/**
 * Thrown when all eligible AI providers in the fallback chain have been attempted and failed (Phase 138).
 */
export class AiFallbackExhaustedError extends AiGatewayError {
  readonly attempts: readonly import('@ai-quality/contracts').AiFallbackAttemptDto[];

  constructor(
    attempts: readonly import('@ai-quality/contracts').AiFallbackAttemptDto[],
    message?: string,
  ) {
    super(
      message ??
        `AI Provider fallback chain exhausted after ${attempts.length} attempts. No operational fallback provider could satisfy request requirements.`,
      'AI_FALLBACK_EXHAUSTED',
      { isTransient: false },
    );
    this.name = 'AiFallbackExhaustedError';
    this.attempts = attempts;
  }
}

/**
 * Thrown when fallback is requested or required, but forbidden by configured fallback policy (Phase 138).
 */
export class AiFallbackPolicyBlockedError extends AiGatewayError {
  readonly primaryProviderId: string;
  readonly policy: string;

  constructor(
    primaryProviderId: string,
    policy: string,
    message?: string,
  ) {
    super(
      message ??
        `Fallback from AI Provider '${primaryProviderId}' is blocked by configured fallback policy '${policy}'.`,
      'AI_FALLBACK_POLICY_BLOCKED',
      { providerId: primaryProviderId, isTransient: false },
    );
    this.name = 'AiFallbackPolicyBlockedError';
    this.primaryProviderId = primaryProviderId;
    this.policy = policy;
  }
}

/**
 * Thrown when an AI stream encounters inactivity or chunk arrival exceeds timeout threshold (Phase 139).
 */
export class AiStreamTimeoutError extends AiGatewayError {
  override readonly providerId: string;
  readonly inactivityMs: number;

  constructor(inactivityMs: number, providerId: string, message?: string) {
    super(
      message ?? `AI streaming connection timed out after ${inactivityMs}ms of inactivity from provider '${providerId}'.`,
      'AI_STREAM_TIMEOUT',
      { providerId, isTransient: true },
    );
    this.name = 'AiStreamTimeoutError';
    this.providerId = providerId;
    this.inactivityMs = inactivityMs;
  }
}

/**
 * Thrown when an AI request was interrupted by process restart or system failure and requires recovery (Phase 139).
 */
export class AiRuntimeRecoveryRequiredError extends AiGatewayError {
  readonly requestId: string;

  constructor(requestId: string, message?: string) {
    super(
      message ?? `AI generation request '${requestId}' was interrupted and requires runtime recovery.`,
      'AI_RUNTIME_RECOVERY_REQUIRED',
      { isTransient: false },
    );
    this.name = 'AiRuntimeRecoveryRequiredError';
    this.requestId = requestId;
  }
}

/**
 * Thrown when concurrent request threshold is exceeded (Phase 139).
 */
export class AiConcurrencyLimitExceededError extends AiGatewayError {
  readonly maxConcurrent: number;

  constructor(maxConcurrent: number, message?: string) {
    super(
      message ?? `AI runtime concurrency limit of ${maxConcurrent} active requests reached. Request was rejected to prevent resource starvation.`,
      'VALIDATION_ERROR',
      { isTransient: true },
    );
    this.name = 'AiConcurrencyLimitExceededError';
    this.maxConcurrent = maxConcurrent;
  }
}
