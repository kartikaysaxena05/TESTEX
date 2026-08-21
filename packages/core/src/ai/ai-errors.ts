/**
 * @file packages/core/src/ai/ai-errors.ts
 * Typed error hierarchy for the AI Provider Gateway and LLM infrastructure.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export class AiGatewayError extends Error {
  readonly code: DesktopErrorCode;
  readonly providerId?: string;
  readonly isTransient: boolean;

  constructor(
    message: string,
    code: DesktopErrorCode = 'INTERNAL_ERROR',
    options?: { providerId?: string; isTransient?: boolean; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AiGatewayError';
    this.code = code;
    this.providerId = options?.providerId;
    this.isTransient = options?.isTransient ?? false;
  }
}

export class AiProviderNotConfiguredError extends AiGatewayError {
  constructor(providerId: string, message?: string) {
    super(
      message ?? `AI Provider '${providerId}' is not configured with required credentials.`,
      'PROVIDER_NOT_CONFIGURED',
      { providerId, isTransient: false },
    );
    this.name = 'AiProviderNotConfiguredError';
  }
}

export class AiInvalidRequestError extends AiGatewayError {
  constructor(message: string, providerId?: string) {
    super(message, 'INVALID_REQUEST', { providerId, isTransient: false });
    this.name = 'AiInvalidRequestError';
  }
}

export class AiAuthenticationError extends AiGatewayError {
  constructor(providerId: string, message?: string) {
    super(
      message ??
        `Authentication failed for AI Provider '${providerId}'. Please check your API key.`,
      'AUTHENTICATION_FAILED',
      { providerId, isTransient: false },
    );
    this.name = 'AiAuthenticationError';
  }
}

export class AiPermissionDeniedError extends AiGatewayError {
  constructor(providerId: string, message?: string) {
    super(message ?? `Permission denied for AI Provider '${providerId}'.`, 'PERMISSION_DENIED', {
      providerId,
      isTransient: false,
    });
    this.name = 'AiPermissionDeniedError';
  }
}

export class AiRateLimitError extends AiGatewayError {
  constructor(providerId: string, message?: string) {
    super(message ?? `Rate limit exceeded for AI Provider '${providerId}'.`, 'RATE_LIMITED', {
      providerId,
      isTransient: true,
    });
    this.name = 'AiRateLimitError';
  }
}

export class AiTimeoutError extends AiGatewayError {
  constructor(timeoutMs: number, providerId?: string) {
    super(`AI request timed out after ${timeoutMs}ms.`, 'TIMEOUT', {
      providerId,
      isTransient: true,
    });
    this.name = 'AiTimeoutError';
  }
}

export class AiCancelledError extends AiGatewayError {
  constructor(providerId?: string) {
    super('AI request was cancelled by the caller.', 'CANCELLED', {
      providerId,
      isTransient: false,
    });
    this.name = 'AiCancelledError';
  }
}

export class AiProviderUnavailableError extends AiGatewayError {
  constructor(providerId: string, message?: string) {
    super(
      message ?? `AI Provider '${providerId}' is currently unavailable.`,
      'PROVIDER_UNAVAILABLE',
      { providerId, isTransient: true },
    );
    this.name = 'AiProviderUnavailableError';
  }
}

export class AiNetworkError extends AiGatewayError {
  constructor(providerId: string, message?: string, cause?: unknown) {
    super(
      message ?? `Network connection failed while reaching AI Provider '${providerId}'.`,
      'NETWORK_ERROR',
      { providerId, isTransient: true, cause },
    );
    this.name = 'AiNetworkError';
  }
}

export class AiInvalidProviderResponseError extends AiGatewayError {
  constructor(providerId: string, message?: string) {
    super(
      message ?? `AI Provider '${providerId}' returned an invalid or unparseable response.`,
      'INVALID_PROVIDER_RESPONSE',
      { providerId, isTransient: false },
    );
    this.name = 'AiInvalidProviderResponseError';
  }
}

// ------------------------------------------------------------------------------
// Phase 44: AI Configuration, Prompt Registry & Structured Output Errors
// ------------------------------------------------------------------------------

export class AiConfigurationInvalidError extends AiGatewayError {
  constructor(message: string, providerId?: string) {
    super(message, 'CONFIGURATION_INVALID', { providerId, isTransient: false });
    this.name = 'AiConfigurationInvalidError';
  }
}

export class AiPromptNotFoundError extends AiGatewayError {
  readonly promptId: string;
  constructor(promptId: string) {
    super(`Prompt '${promptId}' was not found in the prompt registry.`, 'PROMPT_NOT_FOUND', {
      isTransient: false,
    });
    this.name = 'AiPromptNotFoundError';
    this.promptId = promptId;
  }
}

export class AiPromptVersionNotFoundError extends AiGatewayError {
  readonly promptId: string;
  readonly version: number;
  constructor(promptId: string, version: number) {
    super(
      `Prompt '${promptId}' version ${version} was not found in the prompt registry.`,
      'PROMPT_VERSION_NOT_FOUND',
      { isTransient: false },
    );
    this.name = 'AiPromptVersionNotFoundError';
    this.promptId = promptId;
    this.version = version;
  }
}

export class AiPromptInputInvalidError extends AiGatewayError {
  readonly promptId: string;
  readonly version: number;
  constructor(promptId: string, version: number, message: string) {
    super(
      `Invalid input variables for prompt '${promptId}@${version}': ${message}`,
      'PROMPT_INPUT_INVALID',
      { isTransient: false },
    );
    this.name = 'AiPromptInputInvalidError';
    this.promptId = promptId;
    this.version = version;
  }
}

export class AiPromptRenderFailedError extends AiGatewayError {
  readonly promptId: string;
  readonly version: number;
  constructor(promptId: string, version: number, message: string) {
    super(
      `Failed to render messages for prompt '${promptId}@${version}': ${message}`,
      'PROMPT_RENDER_FAILED',
      { isTransient: false },
    );
    this.name = 'AiPromptRenderFailedError';
    this.promptId = promptId;
    this.version = version;
  }
}

export class AiStructuredOutputParseError extends AiGatewayError {
  readonly rawText?: string;
  constructor(message: string, rawText?: string, providerId?: string) {
    super(message, 'STRUCTURED_OUTPUT_PARSE_FAILED', { providerId, isTransient: false });
    this.name = 'AiStructuredOutputParseError';
    this.rawText = rawText;
  }
}

export class AiStructuredOutputSchemaError extends AiGatewayError {
  readonly issues?: unknown;
  constructor(message: string, issues?: unknown, providerId?: string) {
    super(message, 'STRUCTURED_OUTPUT_SCHEMA_FAILED', { providerId, isTransient: false });
    this.name = 'AiStructuredOutputSchemaError';
    this.issues = issues;
  }
}

export class AiStructuredOutputRetryExhaustedError extends AiGatewayError {
  constructor(message: string, providerId?: string) {
    super(message, 'STRUCTURED_OUTPUT_RETRY_EXHAUSTED', { providerId, isTransient: false });
    this.name = 'AiStructuredOutputRetryExhaustedError';
  }
}

// ------------------------------------------------------------------------------
// Phase 45 Embedding & Vector Retrieval Errors
// ------------------------------------------------------------------------------

export class AiEmbeddingProviderNotConfiguredError extends AiGatewayError {
  constructor(providerId?: string) {
    super(
      `AI provider '${providerId ?? 'UNKNOWN'}' is not configured for embeddings.`,
      'EMBEDDING_PROVIDER_NOT_CONFIGURED',
      { providerId, isTransient: false },
    );
    this.name = 'AiEmbeddingProviderNotConfiguredError';
  }
}

export class AiEmbeddingCapabilityUnsupportedError extends AiGatewayError {
  constructor(providerId: string, model?: string) {
    super(
      `Provider '${providerId}' does not support embeddings (model: ${model ?? 'unspecified'}).`,
      'EMBEDDING_CAPABILITY_UNSUPPORTED',
      { providerId, isTransient: false },
    );
    this.name = 'AiEmbeddingCapabilityUnsupportedError';
  }
}

export class AiEmbeddingInvalidInputError extends AiGatewayError {
  constructor(message: string, providerId?: string) {
    super(message, 'EMBEDDING_INVALID_INPUT', { providerId, isTransient: false });
    this.name = 'AiEmbeddingInvalidInputError';
  }
}

export class AiEmbeddingDimensionMismatchError extends AiGatewayError {
  readonly expectedDimensions: number;
  readonly actualDimensions: number;
  constructor(expected: number, actual: number, providerId?: string) {
    super(
      `Embedding dimension mismatch: expected ${expected}, got ${actual}.`,
      'EMBEDDING_DIMENSION_MISMATCH',
      { providerId, isTransient: false },
    );
    this.name = 'AiEmbeddingDimensionMismatchError';
    this.expectedDimensions = expected;
    this.actualDimensions = actual;
  }
}

export class AiEmbeddingValidationFailedError extends AiGatewayError {
  constructor(message: string, providerId?: string) {
    super(message, 'EMBEDDING_VALIDATION_FAILED', { providerId, isTransient: false });
    this.name = 'AiEmbeddingValidationFailedError';
  }
}

export class AiVectorSearchInvalidQueryError extends AiGatewayError {
  constructor(message: string) {
    super(message, 'VECTOR_SEARCH_INVALID_QUERY', { isTransient: false });
    this.name = 'AiVectorSearchInvalidQueryError';
  }
}

export class AiVectorSearchProjectMismatchError extends AiGatewayError {
  constructor(message: string) {
    super(message, 'VECTOR_SEARCH_PROJECT_MISMATCH', { isTransient: false });
    this.name = 'AiVectorSearchProjectMismatchError';
  }
}

export class AiVectorIndexUnavailableError extends AiGatewayError {
  constructor(message: string) {
    super(message, 'VECTOR_INDEX_UNAVAILABLE', { isTransient: false });
    this.name = 'AiVectorIndexUnavailableError';
  }
}
