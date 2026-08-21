/**
 * @file packages/core/src/ai/ai-provider-gateway.ts
 * Central AI Provider Gateway orchestrating model generation, validation,
 * timeouts, cancellations, bounded retries, logging, and usage metrics.
 */

import crypto from 'node:crypto';
import type {
  AiGenerationRequestDto,
  AiGenerationResultDto,
  AiEmbeddingRequestDto,
  AiEmbeddingResultDto,
  AiProviderStatusDto,
  GetAiProviderStatusInput,
  AiHealthCheckInput,
} from '@ai-quality/contracts';
import { AiProviderRegistry } from './ai-provider-registry.js';
import {
  AiGatewayError,
  AiInvalidRequestError,
  AiTimeoutError,
  AiCancelledError,
  AiEmbeddingInvalidInputError,
  AiEmbeddingCapabilityUnsupportedError,
} from './ai-errors.js';
import {
  AI_LIMITS,
  EMBEDDING_LIMITS,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_RETRY_POLICY,
  type RetryPolicy,
} from './ai-types.js';
import { VectorValidator } from './vector-validator.js';
import { getLogger, type ILogger } from '../logging/index.js';

export interface AiProviderGatewayOptions {
  readonly registry?: AiProviderRegistry;
  readonly retryPolicy?: RetryPolicy;
  readonly logger?: ILogger;
}

export class AiProviderGateway {
  private readonly registry: AiProviderRegistry;
  private readonly retryPolicy: RetryPolicy;
  private readonly logger: ILogger;

  constructor(options: AiProviderGatewayOptions = {}) {
    this.registry = options.registry ?? AiProviderRegistry.createDefault();
    this.retryPolicy = options.retryPolicy ?? DEFAULT_RETRY_POLICY;
    this.logger = options.logger ?? getLogger();
  }

  /**
   * Returns the underlying provider registry.
   */
  public getRegistry(): AiProviderRegistry {
    return this.registry;
  }

  /**
   * Retrieves status for all or a specific provider.
   */
  public async getProviderStatus(
    input?: GetAiProviderStatusInput,
    signal?: AbortSignal,
  ): Promise<readonly AiProviderStatusDto[]> {
    if (input?.providerId) {
      const status = await this.registry.getStatus(input.providerId, signal);
      return [status];
    }
    return this.registry.getAllStatuses(signal);
  }

  /**
   * Runs an active health check on a specific provider.
   */
  public async healthCheck(
    input: AiHealthCheckInput,
    signal?: AbortSignal,
  ): Promise<AiProviderStatusDto> {
    return this.registry.getStatus(input.providerId, signal);
  }

  /**
   * Primary entry point for AI text / completion generation.
   */
  public async generate(
    request: AiGenerationRequestDto,
    externalSignal?: AbortSignal,
  ): Promise<AiGenerationResultDto> {
    const correlationId = request.requestId ?? crypto.randomUUID();
    const validatedRequest: AiGenerationRequestDto = {
      ...request,
      requestId: correlationId,
    };

    // 1. Validate request bounds and properties
    this.validateRequest(validatedRequest);

    // 2. Resolve target provider adapter
    const provider = this.registry.get(validatedRequest.providerId);

    // 3. Determine effective timeout
    const timeoutMs = Math.min(
      Math.max(
        validatedRequest.timeoutMs ?? AI_LIMITS.DEFAULT_TIMEOUT_MS,
        AI_LIMITS.MIN_TIMEOUT_MS,
      ),
      AI_LIMITS.MAX_TIMEOUT_MS,
    );

    const startTime = performance.now();
    let attempt = 0;
    let lastError: unknown = null;

    this.logger.info('ai.generation.started', {
      requestId: correlationId,
      providerId: validatedRequest.providerId,
      model: validatedRequest.model,
      messageCount: validatedRequest.messages.length,
      timeoutMs,
    });

    while (attempt <= this.retryPolicy.maxRetries) {
      if (externalSignal?.aborted) {
        throw new AiCancelledError(validatedRequest.providerId);
      }

      const timeoutController = new AbortController();
      let timeoutTriggered = false;

      const timeoutHandle = setTimeout(() => {
        timeoutTriggered = true;
        timeoutController.abort();
      }, timeoutMs);

      // Handle external cancellation propagation
      const onExternalAbort = () => {
        timeoutController.abort();
      };
      externalSignal?.addEventListener('abort', onExternalAbort);

      try {
        const result = await provider.generate(validatedRequest, timeoutController.signal);

        const totalDurationMs = Math.round(performance.now() - startTime);

        this.logger.info('ai.generation.success', {
          requestId: correlationId,
          providerId: validatedRequest.providerId,
          modelReported: result.modelReported,
          tokens: result.usage,
          durationMs: totalDurationMs,
          retryCount: attempt,
        });

        return {
          ...result,
          requestId: correlationId,
          durationMs: totalDurationMs,
          retryCount: attempt,
        };
      } catch (err: unknown) {
        lastError = err;

        if (timeoutTriggered) {
          lastError = new AiTimeoutError(timeoutMs, validatedRequest.providerId);
        } else if (externalSignal?.aborted) {
          lastError = new AiCancelledError(validatedRequest.providerId);
        }

        const isRetryable = this.isRetryableError(lastError);
        attempt++;

        if (attempt <= this.retryPolicy.maxRetries && isRetryable && !externalSignal?.aborted) {
          const delayMs =
            this.retryPolicy.initialDelayMs *
            Math.pow(this.retryPolicy.backoffMultiplier, attempt - 1);
          this.logger.warn('ai.generation.retry', {
            requestId: correlationId,
            providerId: validatedRequest.providerId,
            attempt,
            maxRetries: this.retryPolicy.maxRetries,
            delayMs,
            error: lastError instanceof Error ? lastError.message : String(lastError),
          });

          await this.delay(delayMs, externalSignal);
          continue;
        }

        // Non-retryable error or exceeded retry budget
        break;
      } finally {
        clearTimeout(timeoutHandle);
        externalSignal?.removeEventListener('abort', onExternalAbort);
      }
    }

    // Rethrow normalized error
    this.logger.error('ai.generation.failed', lastError, {
      requestId: correlationId,
      providerId: validatedRequest.providerId,
      attempts: attempt,
    });

    if (lastError instanceof AiGatewayError) {
      throw lastError;
    }

    if (lastError instanceof Error) {
      throw new AiGatewayError(lastError.message, 'INTERNAL_ERROR', {
        providerId: validatedRequest.providerId,
        cause: lastError,
      });
    }

    throw new AiGatewayError(String(lastError), 'INTERNAL_ERROR', {
      providerId: validatedRequest.providerId,
    });
  }

  /**
   * Generates vector embeddings for single or batch text inputs with validation,
   * capability checks, timeouts, retries, and dimension verification.
   */
  public async embed(
    request: AiEmbeddingRequestDto,
    signal?: AbortSignal,
  ): Promise<AiEmbeddingResultDto> {
    const correlationId = request.requestId ?? crypto.randomUUID();
    this.validateEmbeddingRequest(request);

    const providerId = request.providerId ?? this.registry.getDefaultProvider().id;
    const provider = this.registry.get(providerId);

    const capabilities = provider.getCapabilities();
    if (!capabilities.embeddings || typeof provider.embed !== 'function') {
      throw new AiEmbeddingCapabilityUnsupportedError(providerId, request.model);
    }

    const model =
      request.model ?? capabilities.supportedEmbeddingModels?.[0] ?? DEFAULT_EMBEDDING_MODEL;
    const dimensions = request.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
    const timeoutMs = request.timeoutMs ?? AI_LIMITS.DEFAULT_TIMEOUT_MS;

    const validatedRequest: AiEmbeddingRequestDto = {
      inputs: [...request.inputs],
      providerId,
      model,
      dimensions,
      requestId: correlationId,
      timeoutMs,
    };

    this.logger.info('ai.embedding.started', {
      requestId: correlationId,
      providerId,
      model,
      inputCount: validatedRequest.inputs.length,
      dimensions,
      timeoutMs,
    });

    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= this.retryPolicy.maxRetries) {
      if (signal?.aborted) {
        throw new AiCancelledError(providerId);
      }

      try {
        const result = await provider.embed(validatedRequest, signal);

        // Validate returned vectors (dimensions, finite values, batch count)
        const validatedEmbeddings = VectorValidator.validateBatch(
          result.embeddings,
          validatedRequest.inputs.length,
          dimensions,
          { providerId, model },
        );

        this.logger.info('ai.embedding.success', {
          requestId: correlationId,
          providerId,
          modelReported: result.modelReported,
          inputCount: validatedRequest.inputs.length,
          dimensions,
          durationMs: result.durationMs,
          retryCount: attempt,
        });

        return {
          embeddings: validatedEmbeddings,
          providerId,
          modelRequested: model,
          modelReported: result.modelReported,
          dimensions,
          usage: result.usage,
          durationMs: result.durationMs,
          requestId: correlationId,
        };
      } catch (err: unknown) {
        lastError = err;

        if (err instanceof AiCancelledError) {
          throw err;
        }

        if (this.isRetryableError(err) && attempt < this.retryPolicy.maxRetries) {
          const delayMs =
            this.retryPolicy.initialDelayMs * Math.pow(this.retryPolicy.backoffMultiplier, attempt);
          this.logger.warn('ai.embedding.retry', {
            requestId: correlationId,
            providerId,
            attempt: attempt + 1,
            delayMs,
            error: err instanceof Error ? err.message : String(err),
          });
          await this.delay(delayMs, signal);
          attempt++;
          continue;
        }

        break;
      }
    }

    this.logger.error('ai.embedding.failed', lastError, {
      requestId: correlationId,
      providerId,
      attempts: attempt,
    });

    if (lastError instanceof AiGatewayError) {
      throw lastError;
    }

    if (lastError instanceof Error) {
      throw new AiGatewayError(lastError.message, 'INTERNAL_ERROR', {
        providerId,
        cause: lastError,
      });
    }

    throw new AiGatewayError(String(lastError), 'INTERNAL_ERROR', {
      providerId,
    });
  }

  /**
   * Validates embedding request inputs and parameters.
   */
  private validateEmbeddingRequest(request: AiEmbeddingRequestDto): void {
    if (!Array.isArray(request.inputs) || request.inputs.length === 0) {
      throw new AiEmbeddingInvalidInputError(
        'Embedding request must contain at least one input string.',
        request.providerId,
      );
    }

    if (request.inputs.length > EMBEDDING_LIMITS.MAX_INPUTS) {
      throw new AiEmbeddingInvalidInputError(
        `Batch size (${request.inputs.length}) exceeds maximum limit (${EMBEDDING_LIMITS.MAX_INPUTS}).`,
        request.providerId,
      );
    }

    for (let i = 0; i < request.inputs.length; i++) {
      const item = request.inputs[i];
      if (typeof item !== 'string' || item.trim().length === 0) {
        throw new AiEmbeddingInvalidInputError(
          `Embedding input at index ${i} cannot be empty or whitespace.`,
          request.providerId,
        );
      }
      if (item.length > EMBEDDING_LIMITS.MAX_CHARS_PER_INPUT) {
        throw new AiEmbeddingInvalidInputError(
          `Embedding input at index ${i} (${item.length} chars) exceeds maximum allowed (${EMBEDDING_LIMITS.MAX_CHARS_PER_INPUT}).`,
          request.providerId,
        );
      }
    }

    if (
      request.dimensions !== undefined &&
      (request.dimensions < 1 || request.dimensions > 16384)
    ) {
      throw new AiEmbeddingInvalidInputError(
        'Dimensions must be a positive integer between 1 and 16,384.',
        request.providerId,
      );
    }
  }

  /**
   * Validates generation request against platform size and semantic limits.
   */
  private validateRequest(request: AiGenerationRequestDto): void {
    if (!request.providerId || request.providerId.trim().length === 0) {
      throw new AiInvalidRequestError('Provider ID is required.');
    }

    if (!request.model || request.model.trim().length === 0) {
      throw new AiInvalidRequestError('Model name is required.', request.providerId);
    }

    if (!Array.isArray(request.messages) || request.messages.length === 0) {
      throw new AiInvalidRequestError('At least one message is required.', request.providerId);
    }

    if (request.messages.length > AI_LIMITS.MAX_MESSAGES) {
      throw new AiInvalidRequestError(
        `Request message count (${request.messages.length}) exceeds maximum limit of ${AI_LIMITS.MAX_MESSAGES}.`,
        request.providerId,
      );
    }

    let totalChars = 0;
    for (let i = 0; i < request.messages.length; i++) {
      const msg = request.messages[i]!;
      if (!msg.role || !['SYSTEM', 'USER', 'ASSISTANT'].includes(msg.role)) {
        throw new AiInvalidRequestError(
          `Message at index ${i} has invalid role '${msg.role}'. Must be SYSTEM, USER, or ASSISTANT.`,
          request.providerId,
        );
      }
      if (typeof msg.content !== 'string' || msg.content.length === 0) {
        throw new AiInvalidRequestError(
          `Message at index ${i} has empty or non-string content.`,
          request.providerId,
        );
      }
      if (msg.content.length > AI_LIMITS.MAX_MESSAGE_CHARS) {
        throw new AiInvalidRequestError(
          `Message at index ${i} character count (${msg.content.length}) exceeds maximum allowed (${AI_LIMITS.MAX_MESSAGE_CHARS}).`,
          request.providerId,
        );
      }
      totalChars += msg.content.length;
    }

    if (totalChars > AI_LIMITS.MAX_PAYLOAD_CHARS) {
      throw new AiInvalidRequestError(
        `Total prompt character count (${totalChars}) exceeds maximum allowed (${AI_LIMITS.MAX_PAYLOAD_CHARS}).`,
        request.providerId,
      );
    }

    if (request.temperature !== undefined && (request.temperature < 0 || request.temperature > 2)) {
      throw new AiInvalidRequestError(
        'Temperature must be between 0.0 and 2.0.',
        request.providerId,
      );
    }

    if (request.maxTokens !== undefined && (request.maxTokens < 1 || request.maxTokens > 32768)) {
      throw new AiInvalidRequestError(
        'Max tokens must be between 1 and 32,768.',
        request.providerId,
      );
    }
  }

  /**
   * Determines whether an error is transient and eligible for bounded retry.
   */
  private isRetryableError(err: unknown): boolean {
    if (err instanceof AiGatewayError) {
      return err.isTransient || this.retryPolicy.retryableErrorCodes.includes(err.code);
    }
    return false;
  }

  private async delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);

      const onAbort = () => {
        cleanup();
        reject(new AiCancelledError());
      };

      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };

      signal?.addEventListener('abort', onAbort);
    });
  }
}
