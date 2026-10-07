/**
 * @file packages/core/src/ai-provider/capability-detection-service.ts
 * Deterministic capability detection and safe probing service for V9 Phase 129.
 * Normalizes model capabilities independent of provider internals, represents unverified
 * features as UNKNOWN, and runs safe, bounded capability verification probes.
 */

import { randomUUID } from 'node:crypto';
import type {
  AiModelDto,
  ModelCapabilityType,
  ModelCapabilityDetailDto,
  ModelCapabilitiesMap,
  ModelCapabilitiesProfileDto,
  CapabilitySupportStatus,
  CapabilitySource,
} from '@ai-quality/contracts';
import type { IAiProvider } from './ai-provider-contract.js';
import {
  AiCapabilityProbeTimeoutError,
  AiCapabilityProbeFailedError,
  AiProviderUnavailableError,
} from './ai-provider-errors.js';
import { getLogger, type ILogger } from '../logging/index.js';

export interface CapabilityDetectionServiceOptions {
  readonly defaultProbeTimeoutMs?: number;
  readonly logger?: ILogger;
}

export class CapabilityDetectionService {
  private readonly defaultProbeTimeoutMs: number;
  private readonly logger: ILogger;

  // In-memory cache of verified profiles mapped by cacheKey (`${provider}:${modelId}`)
  private readonly cache = new Map<string, ModelCapabilitiesProfileDto>();

  constructor(options?: CapabilityDetectionServiceOptions) {
    this.defaultProbeTimeoutMs = options?.defaultProbeTimeoutMs ?? 10_000;
    this.logger = options?.logger ?? getLogger();
  }

  private getCacheKey(provider: string, modelId: string): string {
    return `${provider.toUpperCase()}:${modelId}`;
  }

  /**
   * Statically normalizes initial model capabilities based on reliable provider metadata
   * and safe heuristic hints. Features that cannot be verified remain strictly UNKNOWN.
   */
  public detectModelCapabilities(model: AiModelDto): ModelCapabilitiesProfileDto {
    const rawName = (model.name || model.id).toLowerCase();
    const isEmbedding =
      rawName.includes('embed') ||
      rawName.includes('bge-') ||
      rawName.includes('nomic-embed') ||
      model.capabilities?.embeddings === true;

    const isVision =
      rawName.includes('vision') ||
      rawName.includes('llava') ||
      rawName.includes('clip') ||
      rawName.includes('bakllava') ||
      model.capabilities?.vision === true;

    const isCodeSpecialist =
      rawName.includes('coder') ||
      rawName.includes('code') ||
      rawName.includes('deepseek-coder') ||
      rawName.includes('qwen2.5-coder') ||
      rawName.includes('starcoder');

    const knownToolCallingFamilies = [
      'llama3.1',
      'llama3.2',
      'llama3.3',
      'qwen2.5',
      'mistral',
      'mixtral',
      'command-r',
      'firefunction',
      'hermes',
    ];
    const isKnownToolModel = knownToolCallingFamilies.some((fam) =>
      rawName.includes(fam),
    );

    const contextLen = model.contextLength;
    const isLongContext =
      typeof contextLen === 'number' && contextLen >= 32768;

    const createCap = (
      status: CapabilitySupportStatus,
      source: CapabilitySource,
      confidence: number,
      notes?: string,
    ): ModelCapabilityDetailDto => ({
      status,
      source,
      confidence,
      notes,
    });

    const caps: Partial<ModelCapabilitiesMap> = {};

    if (isEmbedding) {
      // Embedding models do not support generative chat/text features
      caps.EMBEDDING = createCap('SUPPORTED', 'METADATA', 1.0);
      caps.TEXT_GENERATION = createCap('UNSUPPORTED', 'METADATA', 1.0, 'Dedicated embedding model');
      caps.CHAT = createCap('UNSUPPORTED', 'METADATA', 1.0, 'Dedicated embedding model');
      caps.STREAMING = createCap('UNSUPPORTED', 'METADATA', 1.0, 'Dedicated embedding model');
      caps.STRUCTURED_OUTPUT = createCap('UNSUPPORTED', 'METADATA', 1.0, 'Dedicated embedding model');
      caps.JSON_OUTPUT = createCap('UNSUPPORTED', 'METADATA', 1.0, 'Dedicated embedding model');
      caps.TOOL_CALLING = createCap('UNSUPPORTED', 'METADATA', 1.0, 'Dedicated embedding model');
      caps.CODE_GENERATION = createCap('UNSUPPORTED', 'METADATA', 1.0, 'Dedicated embedding model');
      caps.CODE_ANALYSIS = createCap('UNSUPPORTED', 'METADATA', 1.0, 'Dedicated embedding model');
      caps.VISION = createCap('UNSUPPORTED', 'METADATA', 1.0, 'Dedicated embedding model');
      caps.LONG_CONTEXT = createCap('UNSUPPORTED', 'METADATA', 1.0, 'Dedicated embedding model');
    } else {
      // Generative models
      caps.EMBEDDING = createCap('UNSUPPORTED', 'METADATA', 1.0);
      caps.TEXT_GENERATION = createCap('SUPPORTED', 'METADATA', 1.0);
      caps.CHAT = createCap('SUPPORTED', 'METADATA', 1.0);
      caps.STREAMING = createCap('UNKNOWN', 'UNKNOWN', 0.0, 'Streaming requires runtime verification probe');

      caps.VISION = isVision
        ? createCap('SUPPORTED', 'METADATA', 0.9)
        : createCap('UNSUPPORTED', 'METADATA', 0.9);

      caps.LONG_CONTEXT = isLongContext
        ? createCap('SUPPORTED', 'METADATA', 0.9)
        : typeof contextLen === 'number' && contextLen < 16384
          ? createCap('UNSUPPORTED', 'METADATA', 0.9)
          : createCap('UNKNOWN', 'UNKNOWN', 0.0, 'Context window limit unconfirmed');

      caps.CODE_GENERATION = isCodeSpecialist
        ? createCap('SUPPORTED', 'METADATA', 0.9)
        : createCap('UNKNOWN', 'UNKNOWN', 0.0, 'General generation model; code specialisation unverified');

      caps.CODE_ANALYSIS = isCodeSpecialist
        ? createCap('SUPPORTED', 'METADATA', 0.9)
        : createCap('UNKNOWN', 'UNKNOWN', 0.0, 'General generation model; code analysis unverified');

      // Structured output and JSON output remain UNKNOWN until verified via probe
      caps.JSON_OUTPUT = createCap('UNKNOWN', 'UNKNOWN', 0.0, 'Requires runtime verification probe');
      caps.STRUCTURED_OUTPUT = createCap('UNKNOWN', 'UNKNOWN', 0.0, 'Requires runtime verification probe');

      // Tool calling is verified only if explicitly reported by provider metadata, else remains UNKNOWN until probed
      caps.TOOL_CALLING = model.capabilities?.toolCalling === true
        ? createCap('SUPPORTED', 'METADATA', 1.0, 'Explicitly declared tool calling support')
        : createCap('UNKNOWN', 'UNKNOWN', 0.0, 'Tool calling support unverified');
    }

    return {
      modelId: model.id,
      modelName: model.name,
      provider: model.provider,
      availability: true,
      contextLength: model.contextLength,
      capabilities: caps as ModelCapabilitiesMap,
    };
  }

  /**
   * Retrieves the current capability profile for a model (returns cached verification if available).
   */
  public getCapabilityProfile(model: AiModelDto): ModelCapabilitiesProfileDto {
    const key = this.getCacheKey(model.provider, model.id);
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }
    return this.detectModelCapabilities(model);
  }

  /**
   * Executes safe, bounded capability probes to verify capabilities where metadata is insufficient.
   * Probes:
   * - TEXT_GENERATION: bounded generation test
   * - STREAMING: bounded async stream test
   * - JSON_OUTPUT / STRUCTURED_OUTPUT: bounded JSON compliance test
   * - TOOL_CALLING: bounded tool call invocation test
   */
  public async verifyModelCapabilities(
    model: AiModelDto,
    options?: {
      provider?: IAiProvider;
      capabilities?: readonly ModelCapabilityType[];
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ): Promise<ModelCapabilitiesProfileDto> {
    const provider = options?.provider;
    if (!provider) {
      throw new AiProviderUnavailableError(
        model.provider,
        `Cannot probe capabilities for '${model.id}' without an active provider adapter.`,
      );
    }

    const timeoutMs = options?.timeoutMs ?? this.defaultProbeTimeoutMs;
    const requested = options?.capabilities ?? [
      'TEXT_GENERATION',
      'STREAMING',
      'JSON_OUTPUT',
      'STRUCTURED_OUTPUT',
      'TOOL_CALLING',
    ];

    // Start with current profile (or detected baseline)
    const baseline = this.getCapabilityProfile(model);
    const updatedCaps: ModelCapabilitiesMap = { ...baseline.capabilities };
    const now = new Date().toISOString();

    for (const cap of requested) {
      if (options?.signal?.aborted) {
        break;
      }

      try {
        switch (cap) {
          case 'TEXT_GENERATION': {
            const probeResult = await this.probeTextGeneration(
              provider,
              model.id,
              timeoutMs,
              options?.signal,
            );
            updatedCaps.TEXT_GENERATION = {
              status: probeResult ? 'SUPPORTED' : 'UNSUPPORTED',
              source: 'PROBE',
              confidence: 1.0,
              verifiedAt: now,
              notes: probeResult ? 'Verified via bounded text completion probe' : 'Text generation probe returned empty output',
            };
            break;
          }

          case 'STREAMING': {
            const probeResult = await this.probeStreaming(
              provider,
              model.id,
              timeoutMs,
              options?.signal,
            );
            updatedCaps.STREAMING = {
              status: probeResult ? 'SUPPORTED' : 'UNSUPPORTED',
              source: 'PROBE',
              confidence: 1.0,
              verifiedAt: now,
              notes: probeResult ? 'Verified via progressive chunk streaming probe' : 'Streaming probe yielded no chunks',
            };
            break;
          }

          case 'JSON_OUTPUT':
          case 'STRUCTURED_OUTPUT': {
            const probeResult = await this.probeJsonOutput(
              provider,
              model.id,
              timeoutMs,
              options?.signal,
            );
            const status: CapabilitySupportStatus = probeResult ? 'SUPPORTED' : 'UNSUPPORTED';
            const notes = probeResult
              ? 'Verified via bounded valid JSON object probe'
              : 'Failed to produce valid JSON syntax under JSON format constraints';

            updatedCaps.JSON_OUTPUT = {
              status,
              source: 'PROBE',
              confidence: 1.0,
              verifiedAt: now,
              notes,
            };
            updatedCaps.STRUCTURED_OUTPUT = {
              status,
              source: 'PROBE',
              confidence: 1.0,
              verifiedAt: now,
              notes,
            };
            break;
          }

          case 'TOOL_CALLING': {
            const probeResult = await this.probeToolCalling(
              provider,
              model.id,
              timeoutMs,
              options?.signal,
            );
            updatedCaps.TOOL_CALLING = {
              status: probeResult ? 'SUPPORTED' : 'UNSUPPORTED',
              source: 'PROBE',
              confidence: 1.0,
              verifiedAt: now,
              notes: probeResult
                ? 'Verified via tool execution format probe'
                : 'Model failed or refused structured tool format',
            };
            break;
          }

          default:
            // Other capabilities (VISION, EMBEDDING, LONG_CONTEXT) are determined via metadata
            break;
        }
      } catch (err) {
        if (err instanceof AiCapabilityProbeTimeoutError) {
          throw err;
        }
        this.logger.warn('capability_probe.failed', {
          modelId: model.id,
          capability: cap,
          error: err instanceof Error ? err.message : String(err),
        });
        updatedCaps[cap] = {
          status: 'UNSUPPORTED',
          source: 'PROBE',
          confidence: 0.9,
          verifiedAt: now,
          notes: `Probe execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        };
      }
    }

    const verifiedProfile: ModelCapabilitiesProfileDto = {
      modelId: model.id,
      modelName: model.name,
      provider: model.provider,
      availability: true,
      contextLength: model.contextLength,
      capabilities: updatedCaps,
      verifiedAt: now,
    };

    const key = this.getCacheKey(model.provider, model.id);
    this.cache.set(key, verifiedProfile);

    return verifiedProfile;
  }

  /**
   * Probes bounded text generation.
   */
  private async probeTextGeneration(
    provider: IAiProvider,
    modelId: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    try {
      const response = await provider.generate(
        {
          requestId: randomUUID(),
          projectId: '00000000-0000-0000-0000-000000000000',
          providerId: provider.id,
          model: modelId,
          prompt: 'Respond with exactly one word: OK',
          parameters: {
            maxTokens: 5,
            temperature: 0.0,
            timeoutMs,
          },
        },
        controller.signal,
      );

      return Boolean(response.text && response.text.trim().length > 0);
    } catch (err) {
      if (timedOut) {
        throw new AiCapabilityProbeTimeoutError(modelId, 'TEXT_GENERATION', timeoutMs);
      }
      return false;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  /**
   * Probes progressive chunk streaming.
   */
  private async probeStreaming(
    provider: IAiProvider,
    modelId: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    try {
      const stream = provider.stream(
        {
          requestId: randomUUID(),
          projectId: '00000000-0000-0000-0000-000000000000',
          providerId: provider.id,
          model: modelId,
          prompt: 'Count to 3: 1 2 3',
          parameters: {
            maxTokens: 10,
            temperature: 0.0,
            timeoutMs,
          },
        },
        controller.signal,
      );

      let chunkCount = 0;
      for await (const chunk of stream) {
        if (chunk.deltaText) chunkCount++;
        if (chunkCount >= 1) break;
      }

      return chunkCount > 0;
    } catch (err) {
      if (timedOut) {
        throw new AiCapabilityProbeTimeoutError(modelId, 'STREAMING', timeoutMs);
      }
      return false;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  /**
   * Probes valid JSON output format constraint.
   */
  private async probeJsonOutput(
    provider: IAiProvider,
    modelId: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    try {
      const response = await provider.generate(
        {
          requestId: randomUUID(),
          projectId: '00000000-0000-0000-0000-000000000000',
          providerId: provider.id,
          model: modelId,
          prompt: 'Respond strictly with valid JSON: {"status":"ok"}',
          outputFormat: 'json',
          parameters: {
            maxTokens: 20,
            temperature: 0.0,
            timeoutMs,
          },
        },
        controller.signal,
      );

      if (!response.text) return false;

      const trimmed = response.text.trim();
      const parsed = JSON.parse(trimmed);
      return typeof parsed === 'object' && parsed !== null && parsed.status === 'ok';
    } catch (err) {
      if (timedOut) {
        throw new AiCapabilityProbeTimeoutError(modelId, 'JSON_OUTPUT', timeoutMs);
      }
      return false;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  /**
   * Probes tool-calling structured generation format.
   */
  private async probeToolCalling(
    provider: IAiProvider,
    modelId: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    try {
      // Bounded tool call simulation prompt
      const response = await provider.generate(
        {
          requestId: randomUUID(),
          projectId: '00000000-0000-0000-0000-000000000000',
          providerId: provider.id,
          model: modelId,
          systemPrompt:
            'You are a tool execution engine. Available tools: [get_status()]. Call get_status() using format: {"tool_call":{"name":"get_status","arguments":{}}}',
          prompt: 'Check system status using your tool.',
          outputFormat: 'json',
          parameters: {
            maxTokens: 30,
            temperature: 0.0,
            timeoutMs,
          },
        },
        controller.signal,
      );

      if (!response.text) return false;
      const parsed = JSON.parse(response.text.trim());
      return Boolean(
        parsed?.tool_call?.name === 'get_status' ||
          parsed?.name === 'get_status' ||
          response.metadata?.toolCalls,
      );
    } catch (err) {
      if (timedOut) {
        throw new AiCapabilityProbeTimeoutError(modelId, 'TOOL_CALLING', timeoutMs);
      }
      return false;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  /**
   * Clears cached verification profiles.
   */
  public clearCache(modelId?: string, provider?: string): void {
    if (modelId && provider) {
      this.cache.delete(this.getCacheKey(provider, modelId));
    } else {
      this.cache.clear();
    }
  }
}
