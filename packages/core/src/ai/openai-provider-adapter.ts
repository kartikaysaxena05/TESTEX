/**
 * @file packages/core/src/ai/openai-provider-adapter.ts
 * Production adapter for OpenAI API using the official OpenAI Node.js SDK.
 * Isolates all provider-specific data structures, error types, and SDK methods.
 */

import crypto from 'node:crypto';
import OpenAI from 'openai';
import type {
  AiProviderId,
  AiProviderCapabilitiesDto,
  AiProviderStatusDto,
  AiGenerationRequestDto,
  AiGenerationResultDto,
  AiEmbeddingRequestDto,
  AiEmbeddingResultDto,
  AiMessageDto,
} from '@ai-quality/contracts';
import type { AiProvider } from './ai-provider-contract.js';
import {
  AiProviderNotConfiguredError,
  AiAuthenticationError,
  AiPermissionDeniedError,
  AiRateLimitError,
  AiTimeoutError,
  AiCancelledError,
  AiProviderUnavailableError,
  AiNetworkError,
  AiInvalidRequestError,
  AiInvalidProviderResponseError,
  AiGatewayError,
} from './ai-errors.js';
import {
  DEFAULT_OPENAI_MODEL,
  SUPPORTED_OPENAI_MODELS,
  DEFAULT_EMBEDDING_MODEL,
  SUPPORTED_OPENAI_EMBEDDING_MODELS,
  DEFAULT_EMBEDDING_DIMENSIONS,
} from './ai-types.js';

export interface OpenAiAdapterOptions {
  readonly apiKey?: string;
  readonly client?: OpenAI;
}

export class OpenAiProviderAdapter implements AiProvider {
  readonly id: AiProviderId = 'OPENAI';

  private client: OpenAI | null = null;
  private apiKey: string | null = null;

  constructor(options: OpenAiAdapterOptions = {}) {
    if (options.client) {
      this.client = options.client;
      this.apiKey = 'injected-client';
    } else {
      const key = options.apiKey ?? process.env.OPENAI_API_KEY;
      if (key && key.trim().length > 0) {
        this.apiKey = key.trim();
        this.client = new OpenAI({
          apiKey: this.apiKey,
          maxRetries: 0, // Retries are handled by AiProviderGateway policy
        });
      }
    }
  }

  public isConfigured(): boolean {
    return this.client !== null;
  }

  getCapabilities(): AiProviderCapabilitiesDto {
    return {
      textGeneration: true,
      systemMessages: true,
      tokenUsageReporting: true,
      cancellation: true,
      embeddings: true,
      maxContextTokens: 128_000,
      defaultModel: DEFAULT_OPENAI_MODEL,
      supportedModels: SUPPORTED_OPENAI_MODELS,
      supportedEmbeddingModels: SUPPORTED_OPENAI_EMBEDDING_MODELS,
    };
  }

  async healthCheck(signal?: AbortSignal): Promise<AiProviderStatusDto> {
    if (!this.isConfigured() || !this.client) {
      return {
        providerId: this.id,
        configured: false,
        status: 'NOT_CONFIGURED',
        capabilities: this.getCapabilities(),
        message: 'OpenAI API key is not configured in the environment.',
      };
    }

    if (signal?.aborted) {
      throw new AiCancelledError(this.id);
    }

    try {
      // Execute a lightweight model check to verify API key validity
      await this.client.models.list({ signal });

      return {
        providerId: this.id,
        configured: true,
        status: 'READY',
        capabilities: this.getCapabilities(),
        verifiedAt: new Date().toISOString(),
        message: 'OpenAI API key verified and operational.',
      };
    } catch (err: unknown) {
      const translated = this.mapOpenAiError(err);
      if (translated instanceof AiAuthenticationError) {
        return {
          providerId: this.id,
          configured: true,
          status: 'AUTHENTICATION_FAILED',
          capabilities: this.getCapabilities(),
          message: 'OpenAI API key is invalid or expired.',
        };
      }
      return {
        providerId: this.id,
        configured: true,
        status: 'UNAVAILABLE',
        capabilities: this.getCapabilities(),
        message: translated.message,
      };
    }
  }

  async generate(
    request: AiGenerationRequestDto,
    signal?: AbortSignal,
  ): Promise<AiGenerationResultDto> {
    if (!this.isConfigured() || !this.client) {
      throw new AiProviderNotConfiguredError(this.id);
    }

    if (signal?.aborted) {
      throw new AiCancelledError(this.id);
    }

    const startTime = performance.now();
    const formattedMessages = this.mapMessages(request.messages);

    try {
      const response = await this.client.chat.completions.create(
        {
          model: request.model || DEFAULT_OPENAI_MODEL,
          messages: formattedMessages,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
        },
        { signal },
      );

      const durationMs = Math.round(performance.now() - startTime);
      const choice = response.choices?.[0];

      if (!choice || choice.message?.content === undefined) {
        throw new AiInvalidProviderResponseError(
          this.id,
          'OpenAI returned response with no choices or empty content.',
        );
      }

      const text = choice.message.content ?? '';
      const finishReason = choice.finish_reason ?? null;
      const usage = {
        inputTokens: response.usage?.prompt_tokens ?? null,
        outputTokens: response.usage?.completion_tokens ?? null,
        totalTokens: response.usage?.total_tokens ?? null,
      };

      return {
        requestId: request.requestId ?? crypto.randomUUID(),
        providerId: this.id,
        modelRequested: request.model,
        modelReported: response.model ?? request.model,
        text,
        finishReason,
        usage,
        providerRequestId: response.id ?? null,
        durationMs,
        retryCount: 0,
      };
    } catch (err: unknown) {
      throw this.mapOpenAiError(err);
    }
  }

  async embed(request: AiEmbeddingRequestDto, signal?: AbortSignal): Promise<AiEmbeddingResultDto> {
    if (!this.isConfigured() || !this.client) {
      throw new AiProviderNotConfiguredError(this.id);
    }

    if (signal?.aborted) {
      throw new AiCancelledError(this.id);
    }

    const model = request.model ?? DEFAULT_EMBEDDING_MODEL;
    const dimensions = request.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
    const requestId = request.requestId ?? crypto.randomUUID();
    const startTime = performance.now();

    try {
      const response = await this.client.embeddings.create(
        {
          model,
          input: [...request.inputs],
          dimensions,
        },
        {
          signal,
          timeout: request.timeoutMs ?? 30000,
        },
      );

      const durationMs = Math.round(performance.now() - startTime);
      const embeddings = response.data.map(item => item.embedding);
      const inputTokens = response.usage?.prompt_tokens ?? null;
      const totalTokens = response.usage?.total_tokens ?? inputTokens;

      return {
        embeddings,
        providerId: this.id,
        modelRequested: model,
        modelReported: response.model ?? model,
        dimensions,
        usage: {
          inputTokens,
          outputTokens: 0,
          totalTokens,
        },
        durationMs,
        requestId,
      };
    } catch (err: unknown) {
      throw this.mapOpenAiError(err);
    }
  }

  private mapMessages(
    messages: readonly AiMessageDto[],
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.map(msg => {
      switch (msg.role) {
        case 'SYSTEM':
          return { role: 'system', content: msg.content };
        case 'USER':
          return { role: 'user', content: msg.content };
        case 'ASSISTANT':
          return { role: 'assistant', content: msg.content };
      }
    });
  }

  private mapOpenAiError(err: unknown): Error {
    if (err instanceof AiGatewayError) {
      return err;
    }

    if (err instanceof OpenAI.APIConnectionTimeoutError) {
      return new AiTimeoutError(30_000, this.id);
    }

    if (err instanceof OpenAI.APIConnectionError) {
      return new AiNetworkError(this.id, err.message, err);
    }

    if (err instanceof OpenAI.AuthenticationError) {
      return new AiAuthenticationError(this.id, err.message);
    }

    if (err instanceof OpenAI.PermissionDeniedError) {
      return new AiPermissionDeniedError(this.id, err.message);
    }

    if (err instanceof OpenAI.RateLimitError) {
      return new AiRateLimitError(this.id, err.message);
    }

    if (err instanceof OpenAI.InternalServerError) {
      return new AiProviderUnavailableError(this.id, err.message);
    }

    if (err instanceof OpenAI.BadRequestError) {
      return new AiInvalidRequestError(err.message, this.id);
    }

    if (
      err instanceof OpenAI.APIUserAbortError ||
      (err instanceof Error && err.name === 'AbortError')
    ) {
      return new AiCancelledError(this.id);
    }

    if (err instanceof Error) {
      return new AiGatewayError(err.message, 'UNKNOWN_PROVIDER_ERROR', {
        providerId: this.id,
        cause: err,
      });
    }

    return new AiGatewayError(String(err), 'UNKNOWN_PROVIDER_ERROR', {
      providerId: this.id,
    });
  }
}
