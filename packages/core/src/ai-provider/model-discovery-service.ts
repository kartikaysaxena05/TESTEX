/**
 * @file packages/core/src/ai-provider/model-discovery-service.ts
 * Application-owned Model Discovery layer for V9 Phase 128.
 * Discovers installed models via the Ollama/AI Provider abstraction, normalizes
 * metadata into stable application contracts, manages controlled TTL caching, and safe refresh.
 */

import type {
  AiModelDto,
  AiModelListDto,
  ListAiModelsInputDto,
  RefreshAiModelsInputDto,
  GetAiModelInputDto,
} from '@ai-quality/contracts';
import {
  AiProviderUnavailableError,
  AiTimeoutError,
  AiInvalidResponseError,
  AiProviderError,
  AiModelNotFoundError,
  AiInvalidRequestError,
} from './ai-provider-errors.js';
import { AiProviderValidator } from './ai-provider-validator.js';
import { OllamaHealthService } from './ollama-health-service.js';
import { getLogger, type ILogger } from '../logging/index.js';

/**
 * Raw Ollama /api/tags response schema types (internal wire types only).
 */
interface RawOllamaModelDetails {
  parent_model?: string;
  format?: string;
  family?: string;
  families?: string[];
  parameter_size?: string;
  quantization_level?: string;
}

interface RawOllamaModelItem {
  name?: string;
  model?: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: RawOllamaModelDetails;
}

interface RawOllamaTagsResponse {
  models?: RawOllamaModelItem[];
}

export interface ModelDiscoveryServiceOptions {
  ttlMs?: number;
  fetchFn?: typeof fetch;
  logger?: ILogger;
}

export class ModelDiscoveryService {
  /**
   * Default controlled cache TTL: 30 seconds.
   * Balances responsiveness with preventing repeated network roundtrips.
   */
  public static readonly DEFAULT_TTL_MS = 30_000;

  private readonly ttlMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly logger: ILogger;

  // Cache mapped by providerKey (e.g. `OLLAMA:<sanitizedEndpoint>`)
  private readonly cache = new Map<
    string,
    {
      data: readonly AiModelDto[];
      timestamp: number;
      endpoint?: string;
    }
  >();

  constructor(options?: ModelDiscoveryServiceOptions) {
    this.ttlMs = options?.ttlMs ?? ModelDiscoveryService.DEFAULT_TTL_MS;
    this.fetchFn = options?.fetchFn ?? fetch;
    this.logger = options?.logger ?? getLogger();
  }

  /**
   * Generates a cache key scoped to the provider and endpoint.
   */
  private getCacheKey(providerId: string, endpoint?: string): string {
    const safeEndpoint = endpoint
      ? OllamaHealthService.sanitizeEndpoint(endpoint)
      : 'default';
    return `${providerId.toUpperCase()}:${safeEndpoint}`;
  }

  /**
   * Discovers and lists models for the specified endpoint/provider.
   * Respects cache unless forceRefresh is set or cache is expired.
   */
  public async listModels(
    endpoint: string,
    options?: {
      timeoutMs?: number;
      forceRefresh?: boolean;
      providerId?: string;
      signal?: AbortSignal;
    },
  ): Promise<AiModelListDto> {
    const providerId = (options?.providerId ?? 'OLLAMA').toUpperCase();
    const validatedBaseUrl = AiProviderValidator.validateBaseUrl(endpoint, providerId);
    const cacheKey = this.getCacheKey(providerId, validatedBaseUrl);
    const now = Date.now();

    const cached = this.cache.get(cacheKey);
    if (!options?.forceRefresh && cached && now - cached.timestamp < this.ttlMs) {
      return {
        provider: providerId,
        models: cached.data,
        total: cached.data.length,
        refreshedAt: new Date(cached.timestamp).toISOString(),
        fromCache: true,
        endpoint: OllamaHealthService.sanitizeEndpoint(validatedBaseUrl),
      };
    }

    // Perform live discovery
    const models = await this.discoverFromOllama(validatedBaseUrl, {
      timeoutMs: options?.timeoutMs ?? 10_000,
      signal: options?.signal,
    });

    this.cache.set(cacheKey, {
      data: models,
      timestamp: now,
      endpoint: validatedBaseUrl,
    });

    return {
      provider: providerId,
      models,
      total: models.length,
      refreshedAt: new Date(now).toISOString(),
      fromCache: false,
      endpoint: OllamaHealthService.sanitizeEndpoint(validatedBaseUrl),
    };
  }

  /**
   * Refreshes the cache on-demand and returns newly discovered models.
   */
  public async refreshModels(
    endpoint: string,
    options?: {
      timeoutMs?: number;
      providerId?: string;
      signal?: AbortSignal;
    },
  ): Promise<AiModelListDto> {
    return this.listModels(endpoint, {
      ...options,
      forceRefresh: true,
    });
  }

  /**
   * Retrieves metadata for a specific model by modelId.
   */
  public async getModel(
    endpoint: string,
    modelId: string,
    options?: {
      timeoutMs?: number;
      providerId?: string;
      signal?: AbortSignal;
    },
  ): Promise<AiModelDto> {
    if (!modelId || !modelId.trim()) {
      throw new AiInvalidRequestError('Model ID is required.');
    }
    const cleanId = modelId.trim();
    const strippedId = cleanId.replace(/^ollama:/i, '');
    const listResult = await this.listModels(endpoint, options);
    const found = listResult.models.find(
      (m) =>
        m.id === cleanId ||
        m.name === cleanId ||
        m.id === strippedId ||
        m.name === strippedId,
    );

    if (!found) {
      throw new AiModelNotFoundError(cleanId, options?.providerId ?? 'OLLAMA');
    }

    return found;
  }

  /**
   * Invalidates cached discovery results (e.g. on Ollama reconnect or endpoint change).
   */
  public invalidateCache(endpointOrProviderId = 'OLLAMA', maybeEndpoint?: string): void {
    let providerId = 'OLLAMA';
    let endpoint: string | undefined = maybeEndpoint;

    if (
      endpointOrProviderId.startsWith('http://') ||
      endpointOrProviderId.startsWith('https://')
    ) {
      endpoint = endpointOrProviderId;
    } else {
      providerId = endpointOrProviderId;
    }

    if (endpoint) {
      const key = this.getCacheKey(providerId, endpoint);
      this.cache.delete(key);
    } else {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${providerId.toUpperCase()}:`)) {
          this.cache.delete(key);
        }
      }
    }
  }

  /**
   * Direct wire discovery from Ollama API (/api/tags) with timeout, error translation,
   * and safe normalization.
   */
  public async discoverFromOllama(
    baseUrl: string,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<readonly AiModelDto[]> {
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const sanitizedEndpoint = OllamaHealthService.sanitizeEndpoint(baseUrl);

    this.logger.info('ai_model_discovery.started', {
      endpoint: sanitizedEndpoint,
      timeoutMs,
    });

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const onExternalAbort = () => controller.abort();
    if (options?.signal) {
      options.signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const url = `${baseUrl.replace(/\/+$/, '')}/api/tags`;
      const response = await this.fetchFn(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new AiProviderError(
            'OLLAMA',
            'Authentication failed when discovering Ollama models.',
          );
        }
        if (response.status >= 500 && response.status !== 503) {
          throw new AiProviderError(
            'OLLAMA',
            `Ollama server error during model discovery (HTTP ${response.status}).`,
          );
        }
        throw new AiProviderUnavailableError(
          'OLLAMA',
          `Ollama model discovery failed with HTTP status ${response.status}.`,
        );
      }

      let parsed: RawOllamaTagsResponse;
      try {
        const text = await response.text();
        parsed = JSON.parse(text) as RawOllamaTagsResponse;
      } catch (parseErr) {
        throw new AiInvalidResponseError(
          'OLLAMA',
          'Ollama returned a malformed or non-JSON response from /api/tags.',
          parseErr,
        );
      }

      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.models)) {
        // Safe degradation: if models array is missing, treat as empty list if valid object, or error if corrupt
        if (parsed && typeof parsed === 'object') {
          return [];
        }
        throw new AiInvalidResponseError(
          'OLLAMA',
          'Ollama response does not contain a valid models list.',
        );
      }

      const normalized = this.normalizeOllamaModels(parsed.models);

      this.logger.info('ai_model_discovery.completed', {
        endpoint: sanitizedEndpoint,
        modelCount: normalized.length,
      });

      return normalized;
    } catch (err) {
      if (timedOut) {
        this.logger.warn('ai_model_discovery.timeout', {
          endpoint: sanitizedEndpoint,
          timeoutMs,
        });
        throw new AiTimeoutError(timeoutMs, 'OLLAMA');
      }

      if (err instanceof AiProviderError || err instanceof AiInvalidResponseError || err instanceof AiProviderUnavailableError) {
        throw err;
      }

      const isConnRefused =
        typeof err === 'object' &&
        err !== null &&
        'cause' in err &&
        typeof (err as { cause?: { code?: string } }).cause === 'object' &&
        (err as { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED';

      if (isConnRefused) {
        throw new AiProviderUnavailableError(
          'OLLAMA',
          'Ollama is not running or connection was refused.',
        );
      }

      throw new AiProviderUnavailableError(
        'OLLAMA',
        err instanceof Error ? err.message : 'Failed to connect to Ollama service.',
      );
    } finally {
      clearTimeout(timer);
      if (options?.signal) {
        options.signal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  /**
   * Normalizes raw wire models into safe application-owned AiModelDto objects.
   */
  public normalizeOllamaModels(
    rawModels: readonly RawOllamaModelItem[],
  ): readonly AiModelDto[] {
    const results: AiModelDto[] = [];

    for (const raw of rawModels) {
      if (!raw || typeof raw !== 'object') continue;

      const rawName = typeof raw.name === 'string' ? raw.name.trim() : typeof raw.model === 'string' ? raw.model.trim() : '';
      if (!rawName) continue;

      // Stable identifier: rawName (e.g. 'llama3:latest', 'mistral:7b')
      const id = rawName;
      const name = rawName;
      const size = typeof raw.size === 'number' && raw.size >= 0 ? raw.size : undefined;
      const modifiedAt = typeof raw.modified_at === 'string' && raw.modified_at.trim() ? raw.modified_at.trim() : undefined;
      const digest = typeof raw.digest === 'string' && raw.digest.trim() ? raw.digest.trim() : undefined;

      const details = raw.details && typeof raw.details === 'object' ? raw.details : {};
      const family = typeof details.family === 'string' && details.family.trim() ? details.family.trim() : undefined;
      const architecture = typeof details.format === 'string' && details.format.trim() ? details.format.trim() : undefined;
      const parameters = typeof details.parameter_size === 'string' && details.parameter_size.trim() ? details.parameter_size.trim() : undefined;
      const quantization = typeof details.quantization_level === 'string' && details.quantization_level.trim() ? details.quantization_level.trim() : undefined;

      // Extract capabilities without guessing runtime abilities
      // Basic heuristic: vision models commonly include 'vision' or 'llava'
      const lower = rawName.toLowerCase();
      const isVision = lower.includes('vision') || lower.includes('llava') || lower.includes('bakllava');
      const isEmbedding = lower.includes('embed') || lower.includes('bge-') || lower.includes('nomic-embed');

      results.push({
        id,
        name,
        provider: 'OLLAMA',
        size,
        modifiedAt,
        digest,
        family,
        architecture,
        parameters,
        quantization,
        capabilities: {
          textGeneration: !isEmbedding,
          embeddings: isEmbedding,
          vision: isVision,
          toolCalling: false, // Established in Phase 129 capability detection
        },
      });
    }

    return results;
  }
}
