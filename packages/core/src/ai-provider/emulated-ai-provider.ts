/**
 * @file packages/core/src/ai-provider/emulated-ai-provider.ts
 * Emulated AI provider for deterministic testing of the abstraction and consumers.
 */

import type {
  AiProviderCapabilitiesDto,
  AiProviderStatusDto,
  NormalizedAiRequestDto,
  NormalizedAiResponseDto,
  AiStreamChunkDto,
} from '@ai-quality/contracts';
import type { IAiProvider } from './ai-provider-contract.js';
import {
  AiTimeoutError,
  AiCancelledError,
  AiModelUnavailableError,
} from './ai-provider-errors.js';

export interface EmulatedProviderBehavior {
  defaultResponseText?: string;
  streamChunks?: readonly string[];
  latencyMs?: number;
  simulateTimeout?: boolean;
  simulateError?: Error;
  supportedModels?: readonly string[];
  cancellationDelayMs?: number;
}

export class EmulatedAiProvider implements IAiProvider {
  public readonly id: string;
  public readonly name: string;
  public readonly type = 'EMULATED' as const;

  private behavior: EmulatedProviderBehavior;
  private readonly activeRequests = new Set<string>();

  // Invocations recorded for test assertions
  public readonly generateCalls: NormalizedAiRequestDto[] = [];
  public readonly streamCalls: NormalizedAiRequestDto[] = [];
  public readonly cancelCalls: string[] = [];
  public healthCheckCallCount = 0;

  constructor(id = 'EMULATED', name = 'Emulated Provider for Testing', behavior: EmulatedProviderBehavior = {}) {
    this.id = id.toUpperCase();
    this.name = name;
    this.behavior = {
      defaultResponseText: 'Emulated test response',
      supportedModels: ['mock-model-v1', 'mock-model-v2', 'test-llm'],
      latencyMs: 5,
      ...behavior,
    };
  }

  public setBehavior(behavior: Partial<EmulatedProviderBehavior>): void {
    this.behavior = { ...this.behavior, ...behavior };
  }

  public getCapabilities(): AiProviderCapabilitiesDto {
    return {
      textGeneration: true,
      systemMessages: true,
      tokenUsageReporting: true,
      cancellation: true,
      streaming: true,
      defaultModel: this.behavior.supportedModels?.[0] ?? 'mock-model-v1',
      supportedModels: this.behavior.supportedModels ?? ['mock-model-v1'],
    };
  }

  public async healthCheck(signal?: AbortSignal): Promise<AiProviderStatusDto> {
    this.healthCheckCallCount++;
    if (signal?.aborted) {
      throw new AiCancelledError(this.id);
    }
    return {
      providerId: this.id,
      configured: true,
      status: 'READY',
      capabilities: this.getCapabilities(),
      verifiedAt: new Date().toISOString(),
      message: 'Emulated AI provider is active.',
    };
  }

  public async listModels(signal?: AbortSignal): Promise<readonly import('@ai-quality/contracts').AiModelDto[]> {
    if (signal?.aborted) {
      throw new AiCancelledError(this.id);
    }
    const models = this.behavior.supportedModels ?? ['mock-model-v1'];
    return models.map((name) => ({
      id: name,
      name,
      provider: this.id,
      capabilities: {
        textGeneration: true,
        embeddings: false,
        vision: false,
        toolCalling: false,
      },
    }));
  }

  public async generate(
    request: NormalizedAiRequestDto,
    signal?: AbortSignal,
  ): Promise<NormalizedAiResponseDto> {
    this.generateCalls.push(request);
    this.activeRequests.add(request.requestId);

    const startedAt = new Date();
    const tStart = performance.now();

    try {
      if (this.behavior.simulateError) {
        throw this.behavior.simulateError;
      }

      if (this.behavior.simulateTimeout) {
        throw new AiTimeoutError(request.parameters?.timeoutMs ?? 1000, this.id);
      }

      const supported = this.behavior.supportedModels ?? [];
      if (supported.length > 0 && !supported.includes(request.model)) {
        throw new AiModelUnavailableError(request.model, this.id);
      }

      const latency = this.behavior.latencyMs ?? 5;
      if (latency > 0) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, latency);
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new AiCancelledError(this.id));
            },
            { once: true },
          );
        });
      }

      if (signal?.aborted) {
        throw new AiCancelledError(this.id);
      }

      const responseText = this.behavior.defaultResponseText ?? 'Emulated test response';
      let structuredOutput: unknown = undefined;
      if (request.outputFormat === 'json') {
        try {
          structuredOutput = JSON.parse(responseText);
        } catch {
          // Keep raw
        }
      }

      const durationMs = performance.now() - tStart;
      return {
        requestId: request.requestId,
        providerId: this.id,
        model: request.model,
        text: responseText,
        finishReason: 'stop',
        usage: {
          inputTokens: 15,
          outputTokens: 25,
          totalTokens: 40,
        },
        timing: {
          startedAt: startedAt.toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: Math.round(durationMs),
        },
        structuredOutput,
      };
    } finally {
      this.activeRequests.delete(request.requestId);
    }
  }

  public async *stream(
    request: NormalizedAiRequestDto,
    signal?: AbortSignal,
  ): AsyncIterable<AiStreamChunkDto> {
    this.streamCalls.push(request);
    this.activeRequests.add(request.requestId);

    try {
      if (this.behavior.simulateError) {
        throw this.behavior.simulateError;
      }

      if (this.behavior.simulateTimeout) {
        throw new AiTimeoutError(request.parameters?.timeoutMs ?? 1000, this.id);
      }

      const supported = this.behavior.supportedModels ?? [];
      if (supported.length > 0 && !supported.includes(request.model)) {
        throw new AiModelUnavailableError(request.model, this.id);
      }

      const chunks = this.behavior.streamChunks ?? ['Hello ', 'from ', 'emulated ', 'stream!'];
      let accumulated = '';

      for (let i = 0; i < chunks.length; i++) {
        if (signal?.aborted) {
          throw new AiCancelledError(this.id);
        }

        const chunk = chunks[i] ?? '';
        accumulated += chunk;
        const isLast = i === chunks.length - 1;

        const latency = this.behavior.latencyMs ?? 5;
        if (latency > 0) {
          await new Promise(r => setTimeout(r, latency));
        }

        yield {
          requestId: request.requestId,
          deltaText: chunk,
          accumulatedText: accumulated,
          finishReason: isLast ? 'stop' : null,
          usage: isLast ? { inputTokens: 10, outputTokens: 20, totalTokens: 30 } : null,
        };
      }
    } finally {
      this.activeRequests.delete(request.requestId);
    }
  }

  public async cancel(requestId: string): Promise<boolean> {
    this.cancelCalls.push(requestId);
    if (this.activeRequests.has(requestId)) {
      this.activeRequests.delete(requestId);
      return true;
    }
    return false;
  }
}
