/**
 * @file packages/core/src/ai-provider/ollama-provider-adapter.ts
 * Isolated provider adapter for Ollama local AI runtime (Phase 126).
 * Encapsulates Ollama-specific wire protocols, NDJSON streaming, and error translations.
 */

import type {
  AiProviderCapabilitiesDto,
  AiProviderStatusDto,
  NormalizedAiRequestDto,
  NormalizedAiResponseDto,
  AiStreamChunkDto,
  OllamaHealthDiagnosticDto,
  AiModelDto,
} from '@ai-quality/contracts';
import type { IAiProvider } from './ai-provider-contract.js';
import {
  AiProviderUnavailableError,
  AiModelUnavailableError,
  AiTimeoutError,
  AiCancelledError,
  AiInvalidResponseError,
  AiProviderError,
} from './ai-provider-errors.js';
import { AiProviderValidator } from './ai-provider-validator.js';
import { OllamaHealthService } from './ollama-health-service.js';
import { OllamaInstallationDetector } from './ollama-installation-detector.js';
import { ModelDiscoveryService } from './model-discovery-service.js';

export interface OllamaAdapterConfig {
  baseUrl?: string;
  endpoint?: string;
  defaultModel?: string;
  requestTimeoutMs?: number;
  connectionTimeout?: number;
  streamingEnabled?: boolean;
  enabled?: boolean;
  healthService?: OllamaHealthService;
  modelDiscoveryService?: ModelDiscoveryService;
}

export class OllamaProviderAdapter implements IAiProvider {
  public readonly id = 'OLLAMA';
  public readonly name = 'Ollama Local Runtime';
  public readonly type = 'LOCAL' as const;

  private baseUrl: string;
  private defaultModel: string;
  private defaultTimeoutMs: number;
  private streamingEnabled: boolean;
  private enabled: boolean;
  private healthService: OllamaHealthService;
  private modelDiscoveryService: ModelDiscoveryService;

  // Active in-flight requests mapped by requestId for deterministic cancellation
  private readonly activeRequests = new Map<string, AbortController>();

  constructor(config?: OllamaAdapterConfig) {
    const rawEndpoint = config?.endpoint ?? config?.baseUrl;
    this.baseUrl = rawEndpoint
      ? AiProviderValidator.validateBaseUrl(rawEndpoint, 'OLLAMA')
      : OllamaInstallationDetector.DEFAULT_LOCAL_ENDPOINT;
    this.defaultModel = config?.defaultModel ?? 'llama3';
    this.defaultTimeoutMs = config?.connectionTimeout ?? config?.requestTimeoutMs ?? 60_000;
    this.streamingEnabled = config?.streamingEnabled ?? true;
    this.enabled = config?.enabled ?? true;
    this.healthService = config?.healthService ?? new OllamaHealthService();
    this.modelDiscoveryService = config?.modelDiscoveryService ?? new ModelDiscoveryService();
  }

  public updateConfig(config: OllamaAdapterConfig): void {
    const rawEndpoint = config.endpoint ?? config.baseUrl;
    if (rawEndpoint !== undefined) {
      this.baseUrl = AiProviderValidator.validateBaseUrl(rawEndpoint, 'OLLAMA');
    }
    if (config.defaultModel !== undefined) {
      this.defaultModel = AiProviderValidator.validateModelIdentifier(config.defaultModel, 'OLLAMA');
    }
    const rawTimeout = config.connectionTimeout ?? config.requestTimeoutMs;
    if (rawTimeout !== undefined) {
      this.defaultTimeoutMs = rawTimeout;
    }
    if (config.streamingEnabled !== undefined) {
      this.streamingEnabled = config.streamingEnabled;
    }
    if (config.enabled !== undefined) {
      this.enabled = config.enabled;
    }
    if (config.healthService !== undefined) {
      this.healthService = config.healthService;
    }
    if (config.modelDiscoveryService !== undefined) {
      this.modelDiscoveryService = config.modelDiscoveryService;
    }
  }

  public getConfig(): Readonly<{
    enabled: boolean;
    baseUrl: string;
    endpoint: string;
    defaultModel: string;
    requestTimeoutMs: number;
    connectionTimeout: number;
    streamingEnabled: boolean;
  }> {
    return {
      enabled: this.enabled,
      baseUrl: this.baseUrl,
      endpoint: this.baseUrl,
      defaultModel: this.defaultModel,
      requestTimeoutMs: this.defaultTimeoutMs,
      connectionTimeout: this.defaultTimeoutMs,
      streamingEnabled: this.streamingEnabled,
    };
  }

  public getCapabilities(): AiProviderCapabilitiesDto {
    return {
      textGeneration: true,
      systemMessages: true,
      tokenUsageReporting: true,
      cancellation: true,
      streaming: this.streamingEnabled,
      defaultModel: this.defaultModel,
      supportedModels: [
        'llama3',
        'llama3:8b',
        'codellama',
        'codellama:7b',
        'qwen2.5-coder',
        'qwen2.5-coder:7b',
        'mistral',
        'deepseek-coder',
      ],
    };
  }

  /**
   * Performs fine-grained health check using OllamaHealthService (Phase 127).
   */
  public async checkOllamaHealth(signal?: AbortSignal): Promise<OllamaHealthDiagnosticDto> {
    return this.healthService.checkHealth({
      endpoint: this.baseUrl,
      timeoutMs: this.defaultTimeoutMs,
      enabled: this.enabled,
      signal,
    });
  }

  /**
   * Contract health check adhering to IAiProvider (Phase 126 & 127).
   */
  public async healthCheck(signal?: AbortSignal): Promise<AiProviderStatusDto> {
    const diagnostic = await this.checkOllamaHealth(signal);
    return {
      providerId: 'OLLAMA',
      configured: this.enabled && diagnostic.state !== 'NOT_CONFIGURED',
      status: diagnostic.state === 'AVAILABLE' ? 'READY' : 'UNAVAILABLE',
      capabilities: this.getCapabilities(),
      verifiedAt: diagnostic.checkedAt,
      message: diagnostic.message,
    };
  }

  /**
   * Discovers and lists installed models using ModelDiscoveryService (Phase 128).
   */
  public async listModels(signal?: AbortSignal): Promise<readonly AiModelDto[]> {
    const res = await this.modelDiscoveryService.listModels(this.baseUrl, {
      timeoutMs: this.defaultTimeoutMs,
      signal,
    });
    return res.models;
  }

  public async generate(
    request: NormalizedAiRequestDto,
    externalSignal?: AbortSignal,
  ): Promise<NormalizedAiResponseDto> {
    const startedAt = new Date();
    const tStart = performance.now();

    const controller = new AbortController();
    this.activeRequests.set(request.requestId, controller);

    let timedOut = false;
    let cancelled = false;

    const timeoutMs = request.parameters?.timeoutMs ?? this.defaultTimeoutMs;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const onExternalAbort = () => {
      cancelled = true;
      controller.abort();
    };

    if (externalSignal) {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const endpoint = `${this.baseUrl}/api/generate`;
      const payload: Record<string, unknown> = {
        model: request.model,
        prompt: request.prompt,
        stream: false,
      };

      if (request.systemPrompt) {
        payload.system = request.systemPrompt;
      }

      if (request.outputFormat === 'json') {
        payload.format = 'json';
      }

      if (request.parameters) {
        payload.options = {
          temperature: request.parameters.temperature,
          top_p: request.parameters.topP,
          num_predict: request.parameters.maxTokens,
          stop: request.parameters.stopSequences,
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new AiModelUnavailableError(request.model, 'OLLAMA');
        }
        const errorText = await res.text().catch(() => '');
        throw new AiProviderError(
          'OLLAMA',
          `Ollama generate failed with status ${res.status}: ${errorText || res.statusText}`,
        );
      }

      let data: any;
      try {
        data = await res.json();
      } catch (err) {
        throw new AiInvalidResponseError('OLLAMA', 'Failed to parse JSON response from Ollama.', err);
      }

      if (!data || typeof data !== 'object') {
        throw new AiInvalidResponseError('OLLAMA', 'Empty or malformed JSON payload returned from Ollama.');
      }

      const durationMs = performance.now() - tStart;
      const completedAt = new Date();

      let structuredOutput: unknown = undefined;
      if (request.outputFormat === 'json' && typeof data.response === 'string') {
        try {
          structuredOutput = JSON.parse(data.response);
        } catch {
          // Keep raw text, leave structuredOutput undefined
        }
      }

      const promptTokens = typeof data.prompt_eval_count === 'number' ? data.prompt_eval_count : null;
      const completionTokens = typeof data.eval_count === 'number' ? data.eval_count : null;
      const totalTokens =
        promptTokens != null && completionTokens != null ? promptTokens + completionTokens : null;

      return {
        requestId: request.requestId,
        providerId: 'OLLAMA',
        model: data.model ?? request.model,
        text: typeof data.response === 'string' ? data.response : '',
        finishReason: data.done ? 'stop' : 'unknown',
        usage: {
          inputTokens: promptTokens,
          outputTokens: completionTokens,
          totalTokens,
        },
        timing: {
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          durationMs: Math.round(durationMs),
        },
        structuredOutput,
        metadata: {
          totalDuration: data.total_duration,
          loadDuration: data.load_duration,
        },
      };
    } catch (err: unknown) {
      if (timedOut) {
        throw new AiTimeoutError(timeoutMs, 'OLLAMA');
      }
      if (cancelled || (err instanceof Error && err.name === 'AbortError')) {
        throw new AiCancelledError('OLLAMA');
      }
      if (err instanceof AiModelUnavailableError || err instanceof AiProviderError || err instanceof AiInvalidResponseError) {
        throw err;
      }
      // Network / connection refused / DNS errors
      throw new AiProviderUnavailableError(
        'OLLAMA',
        `Failed to reach Ollama at ${this.baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
      this.activeRequests.delete(request.requestId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  public async *stream(
    request: NormalizedAiRequestDto,
    externalSignal?: AbortSignal,
  ): AsyncIterable<AiStreamChunkDto> {
    const controller = new AbortController();
    this.activeRequests.set(request.requestId, controller);

    let timedOut = false;
    let cancelled = false;

    const timeoutMs = request.parameters?.timeoutMs ?? this.defaultTimeoutMs;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const onExternalAbort = () => {
      cancelled = true;
      controller.abort();
    };

    if (externalSignal) {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const endpoint = `${this.baseUrl}/api/generate`;
      const payload: Record<string, unknown> = {
        model: request.model,
        prompt: request.prompt,
        stream: true,
      };

      if (request.systemPrompt) {
        payload.system = request.systemPrompt;
      }

      if (request.outputFormat === 'json') {
        payload.format = 'json';
      }

      if (request.parameters) {
        payload.options = {
          temperature: request.parameters.temperature,
          top_p: request.parameters.topP,
          num_predict: request.parameters.maxTokens,
          stop: request.parameters.stopSequences,
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new AiModelUnavailableError(request.model, 'OLLAMA');
        }
        const errorText = await res.text().catch(() => '');
        throw new AiProviderError(
          'OLLAMA',
          `Ollama stream failed with status ${res.status}: ${errorText || res.statusText}`,
        );
      }

      if (!res.body) {
        throw new AiInvalidResponseError('OLLAMA', 'No response body received from Ollama stream.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let chunkData: any;
          try {
            chunkData = JSON.parse(trimmed);
          } catch {
            continue;
          }

          const deltaText = typeof chunkData.response === 'string' ? chunkData.response : '';
          accumulatedText += deltaText;

          const promptTokens = typeof chunkData.prompt_eval_count === 'number' ? chunkData.prompt_eval_count : null;
          const completionTokens = typeof chunkData.eval_count === 'number' ? chunkData.eval_count : null;
          const totalTokens =
            promptTokens != null && completionTokens != null ? promptTokens + completionTokens : null;

          yield {
            requestId: request.requestId,
            deltaText,
            accumulatedText,
            finishReason: chunkData.done ? 'stop' : null,
            usage: chunkData.done
              ? {
                  inputTokens: promptTokens,
                  outputTokens: completionTokens,
                  totalTokens,
                }
              : null,
          };
        }
      }
    } catch (err: unknown) {
      if (timedOut) {
        throw new AiTimeoutError(timeoutMs, 'OLLAMA');
      }
      if (cancelled || (err instanceof Error && err.name === 'AbortError')) {
        throw new AiCancelledError('OLLAMA');
      }
      if (err instanceof AiModelUnavailableError || err instanceof AiProviderError || err instanceof AiInvalidResponseError) {
        throw err;
      }
      throw new AiProviderUnavailableError(
        'OLLAMA',
        `Failed during Ollama streaming at ${this.baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
      this.activeRequests.delete(request.requestId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  public async cancel(requestId: string): Promise<boolean> {
    const controller = this.activeRequests.get(requestId);
    if (!controller) {
      return false;
    }
    controller.abort();
    this.activeRequests.delete(requestId);
    return true;
  }
}
