/**
 * @file packages/core/src/ai-provider/ollama-health-service.ts
 * Deterministic Ollama health detection service for V9 Phase 127.
 * Distinguishes AVAILABLE, UNAVAILABLE, TIMEOUT, INVALID_ENDPOINT, UNAUTHORIZED, ERROR, NOT_CONFIGURED.
 * Strictly redacts sensitive credentials and emits structured audit/diagnostic logs.
 */

import type {
  OllamaHealthDiagnosticDto,
  OllamaHealthState,
} from '@ai-quality/contracts';
import { AiProviderValidator } from './ai-provider-validator.js';
import { getLogger, type ILogger } from '../logging/index.js';

export interface OllamaHealthCheckOptions {
  endpoint: string;
  timeoutMs?: number;
  enabled?: boolean;
  signal?: AbortSignal;
}

export interface OllamaHealthServiceDependencies {
  logger?: ILogger;
  fetchFn?: typeof fetch;
}

export class OllamaHealthService {
  private readonly logger: ILogger;
  private readonly fetchFn: typeof fetch;

  public static readonly DEFAULT_TIMEOUT_MS = 5_000;

  constructor(deps?: OllamaHealthServiceDependencies) {
    this.logger = deps?.logger ?? getLogger();
    this.fetchFn = deps?.fetchFn ?? fetch;
  }

  /**
   * Sanitizes an endpoint string for safe logging and reporting.
   * Strips credentials, auth query params, and paths.
   */
  public static sanitizeEndpoint(rawUrl: string): string {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return '';
    }
    try {
      const parsed = new URL(rawUrl.trim());
      parsed.username = '';
      parsed.password = '';
      parsed.search = '';
      parsed.hash = '';
      return parsed.origin;
    } catch {
      return rawUrl.slice(0, 128).replace(/[^\w.:/-]/g, '');
    }
  }

  /**
   * Performs an active, deterministic health check on an Ollama endpoint.
   */
  public async checkHealth(options: OllamaHealthCheckOptions): Promise<OllamaHealthDiagnosticDto> {
    const checkedAt = new Date().toISOString();
    const { endpoint, timeoutMs = OllamaHealthService.DEFAULT_TIMEOUT_MS, enabled = true, signal } = options;

    // 1. Not Configured / Disabled check
    if (!enabled) {
      return {
        state: 'NOT_CONFIGURED',
        message: 'Ollama AI provider is currently disabled.',
        endpoint: OllamaHealthService.sanitizeEndpoint(endpoint),
        checkedAt,
      };
    }

    if (!endpoint || !endpoint.trim()) {
      return {
        state: 'NOT_CONFIGURED',
        message: 'Ollama endpoint is not configured.',
        endpoint: '',
        checkedAt,
      };
    }

    // 2. Endpoint validation and SSRF boundary check
    let validatedBaseUrl: string;
    try {
      validatedBaseUrl = AiProviderValidator.validateBaseUrl(endpoint, 'OLLAMA');
    } catch (err) {
      const safeMessage = err instanceof Error ? err.message : 'Invalid endpoint specification.';
      this.logger.warn('ai_ollama.health_check_failed', {
        state: 'INVALID_ENDPOINT',
        endpoint: OllamaHealthService.sanitizeEndpoint(endpoint),
        error: safeMessage,
      });
      return {
        state: 'INVALID_ENDPOINT',
        message: 'Configured Ollama endpoint is invalid or blocked by application security policy.',
        errorDetails: safeMessage,
        endpoint: OllamaHealthService.sanitizeEndpoint(endpoint),
        checkedAt,
      };
    }

    const sanitizedEndpoint = OllamaHealthService.sanitizeEndpoint(validatedBaseUrl);

    this.logger.info('ai_ollama.health_check_started', {
      endpoint: sanitizedEndpoint,
      timeoutMs,
    });

    const controller = new AbortController();
    let timedOut = false;
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const onExternalAbort = () => controller.abort();
    if (signal) {
      signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    const tStart = performance.now();

    try {
      // First probe /api/version (lightweight Ollama version endpoint)
      let targetUrl = `${validatedBaseUrl}/api/version`;
      let res: Response;

      try {
        res = await this.fetchFn(targetUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        // If 404, fallback to standard /api/tags
        if (res.status === 404) {
          targetUrl = `${validatedBaseUrl}/api/tags`;
          res = await this.fetchFn(targetUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });
        }
      } catch (firstErr) {
        throw firstErr;
      }

      const latencyMs = Math.max(1, Math.round(performance.now() - tStart));

      // 3. Evaluate HTTP response status codes deterministically
      if (res.status === 401 || res.status === 403) {
        this.logger.warn('ai_ollama.health_check_failed', {
          endpoint: sanitizedEndpoint,
          state: 'UNAUTHORIZED',
          httpStatusCode: res.status,
        });
        return {
          state: 'UNAUTHORIZED',
          message: 'Authentication rejected by Ollama endpoint (HTTP 401/403).',
          httpStatusCode: res.status,
          latencyMs,
          endpoint: sanitizedEndpoint,
          checkedAt,
        };
      }

      if (res.status >= 500) {
        this.logger.warn('ai_ollama.health_check_failed', {
          endpoint: sanitizedEndpoint,
          state: 'ERROR',
          httpStatusCode: res.status,
        });
        return {
          state: 'ERROR',
          message: `Ollama service encountered an internal server error (HTTP ${res.status}).`,
          httpStatusCode: res.status,
          latencyMs,
          endpoint: sanitizedEndpoint,
          checkedAt,
        };
      }

      if (res.ok) {
        this.logger.info('ai_ollama.health_check_succeeded', {
          endpoint: sanitizedEndpoint,
          latencyMs,
          httpStatusCode: res.status,
        });
        return {
          state: 'AVAILABLE',
          message: 'Ollama local runtime is reachable and ready.',
          httpStatusCode: res.status,
          latencyMs,
          endpoint: sanitizedEndpoint,
          checkedAt,
        };
      }

      // Unexpected HTTP status (e.g. 400, 405)
      this.logger.warn('ai_ollama.health_check_failed', {
        endpoint: sanitizedEndpoint,
        state: 'ERROR',
        httpStatusCode: res.status,
      });
      return {
        state: 'ERROR',
        message: `Ollama endpoint returned unexpected status HTTP ${res.status}.`,
        httpStatusCode: res.status,
        latencyMs,
        endpoint: sanitizedEndpoint,
        checkedAt,
      };
    } catch (err: unknown) {
      const latencyMs = Math.max(1, Math.round(performance.now() - tStart));

      if (timedOut) {
        this.logger.warn('ai_ollama.health_check_failed', {
          endpoint: sanitizedEndpoint,
          state: 'TIMEOUT',
          timeoutMs,
        });
        return {
          state: 'TIMEOUT',
          message: `Connection to Ollama endpoint timed out after ${timeoutMs}ms.`,
          latencyMs,
          endpoint: sanitizedEndpoint,
          checkedAt,
        };
      }

      if (signal?.aborted) {
        return {
          state: 'UNAVAILABLE',
          message: 'Health check was cancelled.',
          latencyMs,
          endpoint: sanitizedEndpoint,
          checkedAt,
        };
      }

      const errMsg = err instanceof Error ? err.message : String(err);
      const isConnRefused =
        errMsg.includes('ECONNREFUSED') ||
        errMsg.includes('connection refused') ||
        errMsg.includes('Failed to fetch') ||
        (err as { cause?: { code?: string } })?.cause?.code === 'ECONNREFUSED';

      const isDnsNotFound =
        errMsg.includes('ENOTFOUND') ||
        errMsg.includes('getaddrinfo') ||
        (err as { cause?: { code?: string } })?.cause?.code === 'ENOTFOUND';

      if (isConnRefused) {
        this.logger.warn('ai_ollama.health_check_failed', {
          endpoint: sanitizedEndpoint,
          state: 'UNAVAILABLE',
          reason: 'connection_refused',
        });
        return {
          state: 'UNAVAILABLE',
          message: 'Ollama is not running or connection was refused.',
          errorDetails: 'Connection refused (ECONNREFUSED)',
          latencyMs,
          endpoint: sanitizedEndpoint,
          checkedAt,
        };
      }

      if (isDnsNotFound) {
        this.logger.warn('ai_ollama.health_check_failed', {
          endpoint: sanitizedEndpoint,
          state: 'UNAVAILABLE',
          reason: 'dns_not_found',
        });
        return {
          state: 'UNAVAILABLE',
          message: 'Unable to resolve host for configured Ollama endpoint.',
          errorDetails: 'Host not found (ENOTFOUND)',
          latencyMs,
          endpoint: sanitizedEndpoint,
          checkedAt,
        };
      }

      this.logger.warn('ai_ollama.health_check_failed', {
        endpoint: sanitizedEndpoint,
        state: 'UNAVAILABLE',
        error: errMsg,
      });

      return {
        state: 'UNAVAILABLE',
        message: 'Unable to connect to the configured Ollama endpoint.',
        errorDetails: errMsg.slice(0, 256),
        latencyMs,
        endpoint: sanitizedEndpoint,
        checkedAt,
      };
    } finally {
      clearTimeout(timeoutTimer);
      if (signal) {
        signal.removeEventListener('abort', onExternalAbort);
      }
    }
  }
}
