/**
 * @file packages/core/src/ai/fake-ai-provider.ts
 * Deterministic test/fake AI provider for unit and integration testing without external API calls.
 */

import crypto from 'node:crypto';
import type {
  AiProviderId,
  AiProviderCapabilitiesDto,
  AiProviderStatusDto,
  AiGenerationRequestDto,
  AiGenerationResultDto,
  AiEmbeddingRequestDto,
  AiEmbeddingResultDto,
} from '@ai-quality/contracts';
import type { AiProvider } from './ai-provider-contract.js';
import {
  AiAuthenticationError,
  AiRateLimitError,
  AiTimeoutError,
  AiCancelledError,
  AiProviderUnavailableError,
  AiNetworkError,
  AiInvalidProviderResponseError,
  AiProviderNotConfiguredError,
} from './ai-errors.js';
import {
  DEFAULT_FAKE_MODEL,
  DEFAULT_FAKE_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_DIMENSIONS,
} from './ai-types.js';

export interface FakeAiProviderOptions {
  readonly defaultResponse?: string;
  readonly defaultEmbeddings?: readonly (readonly number[])[];
  readonly delayMs?: number;
  readonly generateDelayMs?: number;
  readonly simulateError?:
    | 'AUTHENTICATION_FAILED'
    | 'RATE_LIMITED'
    | 'TIMEOUT'
    | 'CANCELLED'
    | 'PROVIDER_UNAVAILABLE'
    | 'NETWORK_ERROR'
    | 'INVALID_PROVIDER_RESPONSE';
  readonly transientFailureCount?: number;
  readonly customUsage?: { inputTokens: number; outputTokens: number };
  readonly isConfigured?: boolean;
}

export class FakeAiProvider implements AiProvider {
  readonly id: AiProviderId = 'FAKE';

  private defaultResponse: string;
  private defaultEmbeddings?: readonly (readonly number[])[];
  private delayMs: number;
  private generateDelayMs: number;
  private simulateError?: string;
  private transientFailureCount: number;
  private currentFailureCount = 0;
  private customUsage?: { inputTokens: number; outputTokens: number };
  private isConfigured: boolean;

  // Telemetry for test assertion
  public callCount = 0;
  public embedCallCount = 0;
  public lastRequest?: AiGenerationRequestDto;
  public lastEmbeddingRequest?: AiEmbeddingRequestDto;

  constructor(options: FakeAiProviderOptions = {}) {
    this.defaultResponse = options.defaultResponse ?? 'Simulated completion from FakeAiProvider.';
    this.defaultEmbeddings = options.defaultEmbeddings;
    this.delayMs = options.delayMs ?? 0;
    this.generateDelayMs = options.generateDelayMs ?? 0;
    this.simulateError = options.simulateError;
    this.transientFailureCount = options.transientFailureCount ?? 0;
    this.customUsage = options.customUsage;
    this.isConfigured = options.isConfigured ?? true;
  }

  public setOptions(options: Partial<FakeAiProviderOptions>): void {
    if (options.defaultResponse !== undefined) this.defaultResponse = options.defaultResponse;
    if (options.defaultEmbeddings !== undefined) this.defaultEmbeddings = options.defaultEmbeddings;
    if (options.delayMs !== undefined) this.delayMs = options.delayMs;
    if (options.generateDelayMs !== undefined) this.generateDelayMs = options.generateDelayMs;
    if (options.simulateError !== undefined) this.simulateError = options.simulateError;
    if (options.transientFailureCount !== undefined) {
      this.transientFailureCount = options.transientFailureCount;
      this.currentFailureCount = 0;
    }
    if (options.customUsage !== undefined) this.customUsage = options.customUsage;
    if (options.isConfigured !== undefined) this.isConfigured = options.isConfigured;
  }

  public resetTelemetry(): void {
    this.callCount = 0;
    this.embedCallCount = 0;
    this.currentFailureCount = 0;
    this.lastRequest = undefined;
    this.lastEmbeddingRequest = undefined;
  }

  getCapabilities(): AiProviderCapabilitiesDto {
    return {
      textGeneration: true,
      systemMessages: true,
      tokenUsageReporting: true,
      cancellation: true,
      embeddings: true,
      maxContextTokens: 32_768,
      defaultModel: DEFAULT_FAKE_MODEL,
      supportedModels: [DEFAULT_FAKE_MODEL, 'fake-model-v2'],
      supportedEmbeddingModels: [DEFAULT_FAKE_EMBEDDING_MODEL],
    };
  }

  async healthCheck(signal?: AbortSignal): Promise<AiProviderStatusDto> {
    if (signal?.aborted) {
      throw new AiCancelledError(this.id);
    }

    if (!this.isConfigured) {
      return {
        providerId: this.id,
        configured: false,
        status: 'NOT_CONFIGURED',
        capabilities: this.getCapabilities(),
        message: 'Fake provider is marked unconfigured.',
      };
    }

    if (this.simulateError === 'AUTHENTICATION_FAILED') {
      return {
        providerId: this.id,
        configured: true,
        status: 'AUTHENTICATION_FAILED',
        capabilities: this.getCapabilities(),
        message: 'Fake provider simulated authentication failure.',
      };
    }

    if (this.simulateError === 'PROVIDER_UNAVAILABLE') {
      return {
        providerId: this.id,
        configured: true,
        status: 'UNAVAILABLE',
        capabilities: this.getCapabilities(),
        message: 'Fake provider simulated unavailable state.',
      };
    }

    return {
      providerId: this.id,
      configured: true,
      status: 'READY',
      capabilities: this.getCapabilities(),
      verifiedAt: new Date().toISOString(),
      message: 'Fake provider ready for testing.',
    };
  }

  async generate(
    request: AiGenerationRequestDto,
    signal?: AbortSignal,
  ): Promise<AiGenerationResultDto> {
    const startTime = performance.now();
    this.callCount++;
    this.lastRequest = request;

    if (signal?.aborted) {
      throw new AiCancelledError(this.id);
    }

    // Handle simulated delay with cancellation checking
    const effectiveDelay = Math.max(this.delayMs, this.generateDelayMs);
    if (effectiveDelay > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          resolve();
        }, effectiveDelay);

        const onAbort = () => {
          cleanup();
          reject(new AiCancelledError(this.id));
        };

        const cleanup = () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
        };

        signal?.addEventListener('abort', onAbort);
      });
    }

    // Check transient failure count for retry testing
    if (this.transientFailureCount > 0 && this.currentFailureCount < this.transientFailureCount) {
      this.currentFailureCount++;
      throw new AiNetworkError(
        this.id,
        `Simulated transient failure (${this.currentFailureCount}/${this.transientFailureCount})`,
      );
    }

    // Handle simulated permanent errors
    if (this.simulateError) {
      switch (this.simulateError) {
        case 'AUTHENTICATION_FAILED':
          throw new AiAuthenticationError(this.id, 'Simulated invalid API key.');
        case 'RATE_LIMITED':
          throw new AiRateLimitError(this.id, 'Simulated 429 rate limit exceeded.');
        case 'TIMEOUT':
          throw new AiTimeoutError(this.delayMs || 5000, this.id);
        case 'CANCELLED':
          throw new AiCancelledError(this.id);
        case 'PROVIDER_UNAVAILABLE':
          throw new AiProviderUnavailableError(this.id, 'Simulated 503 service unavailable.');
        case 'NETWORK_ERROR':
          throw new AiNetworkError(this.id, 'Simulated connection reset.');
        case 'INVALID_PROVIDER_RESPONSE':
          throw new AiInvalidProviderResponseError(this.id, 'Simulated unparseable response.');
      }
    }

    const durationMs = Math.round(performance.now() - startTime);

    // Calculate deterministic tokens
    const totalCharsInput = request.messages.reduce((acc, m) => acc + m.content.length, 0);
    const inputTokens =
      this.customUsage?.inputTokens ?? Math.max(1, Math.ceil(totalCharsInput / 4));
    const outputTokens =
      this.customUsage?.outputTokens ?? Math.max(1, Math.ceil(this.defaultResponse.length / 4));

    return {
      requestId: request.requestId ?? crypto.randomUUID(),
      providerId: this.id,
      modelRequested: request.model,
      modelReported: request.model,
      text: this.defaultResponse,
      finishReason: 'stop',
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      providerRequestId: `fake-req-${crypto.randomUUID().slice(0, 8)}`,
      durationMs,
      retryCount: this.currentFailureCount,
    };
  }

  async embed(request: AiEmbeddingRequestDto, signal?: AbortSignal): Promise<AiEmbeddingResultDto> {
    const startTime = performance.now();
    this.embedCallCount++;
    this.lastEmbeddingRequest = request;

    if (!this.isConfigured) {
      throw new AiProviderNotConfiguredError(this.id);
    }

    if (signal?.aborted) {
      throw new AiCancelledError(this.id);
    }

    // Handle simulated delay with cancellation checking
    if (this.delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          resolve();
        }, this.delayMs);

        const onAbort = () => {
          cleanup();
          reject(new AiCancelledError(this.id));
        };

        const cleanup = () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
        };

        signal?.addEventListener('abort', onAbort);
      });
    }

    // Handle simulated errors
    if (this.simulateError) {
      switch (this.simulateError) {
        case 'AUTHENTICATION_FAILED':
          throw new AiAuthenticationError(this.id, 'Simulated invalid API key.');
        case 'RATE_LIMITED':
          throw new AiRateLimitError(this.id, 'Simulated 429 rate limit exceeded.');
        case 'TIMEOUT':
          throw new AiTimeoutError(this.delayMs || 5000, this.id);
        case 'CANCELLED':
          throw new AiCancelledError(this.id);
        case 'PROVIDER_UNAVAILABLE':
          throw new AiProviderUnavailableError(this.id, 'Simulated 503 service unavailable.');
        case 'NETWORK_ERROR':
          throw new AiNetworkError(this.id, 'Simulated connection reset.');
        case 'INVALID_PROVIDER_RESPONSE':
          throw new AiInvalidProviderResponseError(this.id, 'Simulated unparseable response.');
      }
    }

    const model = request.model ?? DEFAULT_FAKE_EMBEDDING_MODEL;
    const dimensions = request.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
    const durationMs = Math.round(performance.now() - startTime);

    let embeddings: readonly (readonly number[])[];
    if (this.defaultEmbeddings) {
      embeddings = this.defaultEmbeddings;
    } else {
      embeddings = request.inputs.map(input =>
        FakeAiProvider.generateDeterministicVector(input, dimensions),
      );
    }

    const totalChars = request.inputs.reduce((acc, str) => acc + str.length, 0);
    const inputTokens = this.customUsage?.inputTokens ?? Math.max(1, Math.ceil(totalChars / 4));

    return {
      embeddings,
      providerId: this.id,
      modelRequested: model,
      modelReported: model,
      dimensions,
      usage: {
        inputTokens,
        outputTokens: 0,
        totalTokens: inputTokens,
      },
      durationMs,
      requestId: request.requestId ?? crypto.randomUUID(),
    };
  }

  /**
   * Generates a deterministic unit-norm vector of specified dimensions from a string input.
   */
  public static generateDeterministicVector(
    input: string,
    dimensions: number = DEFAULT_EMBEDDING_DIMENSIONS,
  ): readonly number[] {
    const hash = crypto.createHash('sha256').update(input, 'utf8').digest();
    const vector: number[] = new Array(dimensions);
    let sumSq = 0;

    for (let i = 0; i < dimensions; i++) {
      // Deterministically derive 32-bit integer from hash and dimension index
      const byteIdx = (i * 4) % (hash.length - 4);
      const rawInt = hash.readInt32LE(byteIdx);
      // Map to float in range [-1, 1]
      const floatVal = Math.sin((rawInt + i * 31) * 0.0001);
      vector[i] = floatVal;
      sumSq += floatVal * floatVal;
    }

    // Normalize to unit vector for cosine distance calculations
    const norm = Math.sqrt(sumSq) || 1;
    for (let i = 0; i < dimensions; i++) {
      vector[i] = vector[i]! / norm;
    }

    return Object.freeze(vector);
  }
}
