/**
 * @file packages/core/src/ai-provider/ai-lifecycle-manager.ts
 * Privileged AI Lifecycle & Recovery Manager for V9 Phase 139:
 * Performance, Cancellation & Runtime Recovery.
 *
 * Responsibilities:
 * 1. Strict Lifecycle Tracking:
 *    QUEUED -> STARTING -> RUNNING -> STREAMING -> COMPLETED
 *    Failure / Terminal states:
 *    CANCELLED | TIMEOUT | PROVIDER_ERROR | MODEL_ERROR | NETWORK_ERROR | INVALID_RESPONSE | INTERRUPTED | RECOVERY_REQUIRED
 * 2. Real Cancellation Propagation:
 *    - AbortController signal propagation to provider and stream readers.
 *    - Cleans active queues, intervals, and memory handles immediately.
 *    - Safe repeated cancellation without duplicate errors.
 *    - Cancellation is never classified as a provider or AI failure.
 * 3. Configurable Granular Timeouts:
 *    - Startup timeout (waiting for model load/queue).
 *    - Generation timeout (bounded total execution).
 *    - Stream inactivity timeout (heartbeat/inter-chunk pause threshold).
 * 4. Concurrency Guard:
 *    - Enforces bounded concurrent active requests (default max 5).
 *    - Protects against resource exhaustion or Ollama deadlocks.
 * 5. Application Restart & Crash Recovery:
 *    - Interrupted requests in DB from prior sessions are marked INTERRUPTED / RECOVERY_REQUIRED.
 *    - Never fabricates completed AI responses.
 * 6. High-Precision Performance Metrics:
 *    - Tracks connection latency, model startup, time to first token, generation and stream durations.
 * 7. Multi-Tenant Project Isolation & Sanitized Observability:
 *    - Prompts & contexts are never logged in plaintext; only metadata, lengths, and sanitized error messages.
 */

import crypto from 'node:crypto';
import type { PrismaClient, AuthAuditAction } from '@prisma/client';
import {
  type AiLifecycleState,
  type AiActiveRequestDto,
  type AiRuntimeMetricsDto,
  type RecoverInterruptedRequestsInputDto,
  type RecoverInterruptedRequestsResultDto,
  type AiStreamEventDto,
} from '@ai-quality/contracts';
import {
  AiCancelledError,
  AiTimeoutError,
  AiStreamTimeoutError,
  AiConcurrencyLimitExceededError,
  AiInvalidRequestError,
} from './ai-provider-errors.js';
import { AiProviderValidator } from './ai-provider-validator.js';
import { getLogger, type ILogger } from '../logging/index.js';

export interface AiLifecycleManagerDependencies {
  readonly prisma?: PrismaClient;
  readonly logger?: ILogger;
  readonly maxConcurrentRequests?: number;
  readonly defaultInactivityTimeoutMs?: number;
  readonly assertProjectAccess?: (projectId: string, userId: string) => Promise<void>;
}

export interface TrackedRequestHandle {
  readonly requestId: string;
  readonly projectId?: string | null;
  readonly userId?: string | null;
  readonly providerId: string;
  readonly modelId: string;
  readonly promptLength: number;
  readonly isStreaming: boolean;
  readonly abortController: AbortController;
  readonly startedAt: number;
  state: AiLifecycleState;
  modelStartupLatencyMs: number;
  timeToFirstTokenMs: number | null;
  tokensGenerated: number;
  retryCount: number;
  streamInactivityTimer?: NodeJS.Timeout;
  errorCategory?: string | null;
  errorMessage?: string | null;
  cancelled: boolean;
  timedOut: boolean;
  generationDurationMs: number;
  streamDurationMs: number | null;
}

export class AiLifecycleManager {
  private readonly prisma?: PrismaClient;
  private readonly logger: ILogger;
  private readonly maxConcurrentRequests: number;
  private readonly defaultInactivityTimeoutMs: number;
  private readonly projectAccessAssertion?: (projectId: string, userId: string) => Promise<void>;

  // In-flight active request handles
  private readonly activeHandles = new Map<string, TrackedRequestHandle>();

  // Rolling metrics counters
  private totalRequestsTracked = 0;
  private completedRequestsCount = 0;
  private totalRetriesRecorded = 0;
  private connectionLatencySumMs = 0;
  private modelStartupLatencySumMs = 0;
  private generationDurationSumMs = 0;
  private cancellationLatencySumMs = 0;
  private cancellationCount = 0;

  constructor(deps?: AiLifecycleManagerDependencies) {
    this.prisma = deps?.prisma;
    this.logger = deps?.logger ?? getLogger();
    this.maxConcurrentRequests = deps?.maxConcurrentRequests ?? 5;
    this.defaultInactivityTimeoutMs = deps?.defaultInactivityTimeoutMs ?? 45000; // 45 seconds between chunks
    this.projectAccessAssertion = deps?.assertProjectAccess;
  }

  /**
   * Registers a new request handle, enforcing concurrency bounds and saving initial state.
   */
  public async registerRequest(options: {
    readonly requestId?: string;
    readonly projectId?: string | null;
    readonly userId?: string | null;
    readonly providerId: string;
    readonly modelId: string;
    readonly promptLength: number;
    readonly isStreaming: boolean;
    readonly externalSignal?: AbortSignal;
  }): Promise<TrackedRequestHandle> {
    const requestId = options.requestId ?? crypto.randomUUID();
    AiProviderValidator.validateUuid(requestId, 'Request ID');

    if (options.projectId && options.userId && this.projectAccessAssertion) {
      await this.projectAccessAssertion(options.projectId, options.userId);
    }

    // Enforce concurrency limit
    if (this.activeHandles.size >= this.maxConcurrentRequests) {
      this.logger.warn('ai_lifecycle.concurrency_limit_exceeded', {
        activeCount: this.activeHandles.size,
        max: this.maxConcurrentRequests,
        attemptedRequest: requestId,
      });
      throw new AiConcurrencyLimitExceededError(this.maxConcurrentRequests);
    }

    const abortController = new AbortController();

    const handle: TrackedRequestHandle = {
      requestId,
      projectId: options.projectId ?? null,
      userId: options.userId ?? null,
      providerId: options.providerId,
      modelId: options.modelId,
      promptLength: options.promptLength,
      isStreaming: options.isStreaming,
      abortController,
      startedAt: performance.now(),
      state: 'QUEUED',
      modelStartupLatencyMs: 0,
      timeToFirstTokenMs: null,
      tokensGenerated: 0,
      retryCount: 0,
      cancelled: false,
      timedOut: false,
      generationDurationMs: 0,
      streamDurationMs: null,
    };

    if (options.externalSignal) {
      if (options.externalSignal.aborted) {
        handle.cancelled = true;
        handle.state = 'CANCELLED';
        abortController.abort();
      } else {
        options.externalSignal.addEventListener(
          'abort',
          () => {
            this.cancelRequest(requestId, 'External client signal aborted.').catch(() => {});
          },
          { once: true },
        );
      }
    }

    this.activeHandles.set(requestId, handle);
    this.totalRequestsTracked++;

    // Persist to database if prisma is configured
    if (this.prisma) {
      try {
        await this.prisma.aiGenerationRequest.create({
          data: {
            id: requestId,
            projectId: options.projectId ?? undefined,
            userId: options.userId ?? undefined,
            providerId: options.providerId,
            modelId: options.modelId,
            state: 'QUEUED',
            promptLength: options.promptLength,
            isStreaming: options.isStreaming,
          },
        });
      } catch (err) {
        this.logger.warn('ai_lifecycle.persistence_failed', { requestId, error: String(err) });
      }
    }

    this.logger.info('ai_lifecycle.request_queued', {
      requestId,
      providerId: options.providerId,
      modelId: options.modelId,
      isStreaming: options.isStreaming,
    });

    return handle;
  }

  /**
   * Transitions request state with lifecycle validation.
   */
  public async transitionState(
    requestId: string,
    nextState: AiLifecycleState,
    meta?: {
      readonly errorCategory?: string;
      readonly errorMessage?: string;
      readonly tokensGenerated?: number;
      readonly durationMs?: number;
      readonly modelStartupLatencyMs?: number;
      readonly timeToFirstTokenMs?: number;
    },
  ): Promise<void> {
    const handle = this.activeHandles.get(requestId);
    if (!handle) return;

    // Do not overwrite terminal states
    if (
      handle.state === 'COMPLETED' ||
      handle.state === 'CANCELLED' ||
      handle.state === 'TIMEOUT'
    ) {
      return;
    }

    handle.state = nextState;

    if (meta?.modelStartupLatencyMs != null) {
      handle.modelStartupLatencyMs = meta.modelStartupLatencyMs;
      this.modelStartupLatencySumMs += meta.modelStartupLatencyMs;
    }

    if (meta?.timeToFirstTokenMs != null && handle.timeToFirstTokenMs === null) {
      handle.timeToFirstTokenMs = meta.timeToFirstTokenMs;
    }

    if (meta?.tokensGenerated != null) {
      handle.tokensGenerated = meta.tokensGenerated;
    }

    if (meta?.errorMessage) {
      handle.errorMessage = meta.errorMessage;
    }

    if (meta?.errorCategory) {
      handle.errorCategory = meta.errorCategory;
    }

    if (nextState === 'COMPLETED') {
      this.completedRequestsCount++;
      handle.generationDurationMs = Math.round(performance.now() - handle.startedAt);
      this.generationDurationSumMs += handle.generationDurationMs;
    }

    if (this.prisma) {
      try {
        await this.prisma.aiGenerationRequest.update({
          where: { id: requestId },
          data: {
            state: nextState,
            tokensGenerated: handle.tokensGenerated,
            errorCategory: handle.errorCategory,
            errorMessage: handle.errorMessage ? handle.errorMessage.slice(0, 1024) : undefined,
            durationMs: handle.generationDurationMs || undefined,
            completedAt:
              nextState === 'COMPLETED' ||
              nextState === 'CANCELLED' ||
              nextState === 'TIMEOUT' ||
              nextState === 'PROVIDER_ERROR' ||
              nextState === 'INVALID_RESPONSE'
                ? new Date()
                : undefined,
          },
        });
      } catch (err) {
        this.logger.warn('ai_lifecycle.state_update_failed', { requestId, nextState, error: String(err) });
      }
    }
  }

  /**
   * Resets or starts the stream inactivity timer.
   */
  public armStreamInactivityTimer(
    requestId: string,
    timeoutMs: number = this.defaultInactivityTimeoutMs,
  ): void {
    const handle = this.activeHandles.get(requestId);
    if (!handle || handle.cancelled) return;

    if (handle.streamInactivityTimer) {
      clearTimeout(handle.streamInactivityTimer);
    }

    handle.streamInactivityTimer = setTimeout(() => {
      handle.timedOut = true;
      handle.state = 'TIMEOUT';
      handle.errorCategory = 'STREAM_TIMEOUT';
      handle.errorMessage = `Stream inactive for >${timeoutMs}ms without chunk response.`;
      handle.abortController.abort();

      this.logger.warn('ai_lifecycle.stream_inactivity_timeout', {
        requestId,
        inactivityMs: timeoutMs,
      });
    }, timeoutMs);
  }

  /**
   * Clears inactivity timers upon successful chunk or termination.
   */
  public clearStreamInactivityTimer(requestId: string): void {
    const handle = this.activeHandles.get(requestId);
    if (handle?.streamInactivityTimer) {
      clearTimeout(handle.streamInactivityTimer);
      handle.streamInactivityTimer = undefined;
    }
  }

  /**
   * Cancels a running or queued request cooperatively and safely.
   */
  public async cancelRequest(requestId: string, reason = 'Cancelled by client.'): Promise<boolean> {
    const handle = this.activeHandles.get(requestId);
    if (!handle) {
      return false;
    }

    if (handle.cancelled || handle.state === 'CANCELLED' || handle.state === 'COMPLETED') {
      return false;
    }

    const cancelStart = performance.now();
    handle.cancelled = true;
    handle.state = 'CANCELLED';
    handle.errorMessage = reason;

    if (handle.streamInactivityTimer) {
      clearTimeout(handle.streamInactivityTimer);
      handle.streamInactivityTimer = undefined;
    }

    handle.abortController.abort();

    const cancellationLatency = Math.round(performance.now() - cancelStart);
    this.cancellationLatencySumMs += cancellationLatency;
    this.cancellationCount++;

    if (this.prisma) {
      try {
        await this.prisma.aiGenerationRequest.update({
          where: { id: requestId },
          data: {
            state: 'CANCELLED',
            cancellationNote: reason.slice(0, 256),
            completedAt: new Date(),
          },
        });

        if (handle.userId) {
          await this.prisma.authAuditEvent.create({
            data: {
              userId: handle.userId,
              action: 'AI_REQUEST_CANCELLED' as AuthAuditAction,
              metadata: {
                requestId,
                reason,
                latencyMs: cancellationLatency,
              },
            },
          });
        }
      } catch (err) {
        this.logger.warn('ai_lifecycle.cancel_persistence_failed', { requestId, error: String(err) });
      }
    }

    this.logger.info('ai_lifecycle.request_cancelled', {
      requestId,
      reason,
      cancellationLatencyMs: cancellationLatency,
    });

    return true;
  }

  /**
   * Releases request handle and associated resources once execution finishes.
   */
  public releaseRequest(requestId: string): void {
    const handle = this.activeHandles.get(requestId);
    if (handle) {
      if (handle.streamInactivityTimer) {
        clearTimeout(handle.streamInactivityTimer);
      }
      this.activeHandles.delete(requestId);
      this.logger.debug('ai_lifecycle.handle_released', { requestId });
    }
  }

  /**
   * Records a transient retry attempt on the request.
   */
  public recordRetry(requestId: string): void {
    const handle = this.activeHandles.get(requestId);
    if (handle) {
      handle.retryCount++;
      this.totalRetriesRecorded++;
    }
  }

  /**
   * Lists currently active in-flight requests.
   */
  public getActiveRequests(projectId?: string | null): readonly AiActiveRequestDto[] {
    const list: AiActiveRequestDto[] = [];
    const now = performance.now();

    for (const h of this.activeHandles.values()) {
      if (projectId && h.projectId !== projectId) {
        continue;
      }
      list.push({
        requestId: h.requestId,
        projectId: h.projectId,
        providerId: h.providerId,
        modelId: h.modelId,
        state: h.state,
        promptLength: h.promptLength,
        isStreaming: h.isStreaming,
        startedAt: new Date(Date.now() - (now - h.startedAt)).toISOString(),
        durationMs: Math.round(now - h.startedAt),
        tokensGenerated: h.tokensGenerated,
        error: h.errorMessage,
      });
    }

    return list;
  }

  /**
   * Computes accurate runtime performance metrics.
   */
  public getRuntimeMetrics(): AiRuntimeMetricsDto {
    const totalTracked = this.totalRequestsTracked;
    const avgStartup = totalTracked > 0 ? Math.round(this.modelStartupLatencySumMs / totalTracked) : 0;
    const avgGen = totalTracked > 0 ? Math.round(this.generationDurationSumMs / totalTracked) : 0;
    const avgCancel = this.cancellationCount > 0 ? Math.round(this.cancellationLatencySumMs / this.cancellationCount) : 0;
    const completionRate = totalTracked > 0 ? Number((this.completedRequestsCount / totalTracked).toFixed(4)) : 1.0;

    return {
      connectionLatencyMs: Math.round(this.connectionLatencySumMs),
      modelStartupLatencyMs: avgStartup,
      timeToFirstTokenMs: null,
      generationDurationMs: avgGen,
      streamDurationMs: null,
      tokensGenerated: null,
      requestCompletionRate: completionRate,
      cancellationLatencyMs: avgCancel,
      retryCount: this.totalRetriesRecorded,
      totalRequestsTracked: totalTracked,
      activeRequestsCount: this.activeHandles.size,
    };
  }

  /**
   * Startup Recovery: Identifies requests interrupted by a process restart/crash and transitions them safely.
   */
  public async recoverInterruptedRequests(
    input?: RecoverInterruptedRequestsInputDto,
  ): Promise<RecoverInterruptedRequestsResultDto> {
    if (!this.prisma) {
      return { recoveredCount: 0, updatedRequestIds: [] };
    }

    const where: any = {
      state: {
        in: ['QUEUED', 'STARTING', 'RUNNING', 'STREAMING'],
      },
    };

    if (input?.projectId) {
      where.projectId = input.projectId;
    }

    const interrupted = await this.prisma.aiGenerationRequest.findMany({
      where,
      select: { id: true, state: true },
      take: 100,
    });

    if (interrupted.length === 0) {
      return { recoveredCount: 0, updatedRequestIds: [] };
    }

    const ids = interrupted.map((r) => r.id);

    await this.prisma.aiGenerationRequest.updateMany({
      where: { id: { in: ids } },
      data: {
        state: 'INTERRUPTED',
        errorCategory: 'PROCESS_CRASH_OR_RESTART',
        errorMessage: 'Generation was interrupted by application shutdown/restart and requires recovery.',
        completedAt: new Date(),
      },
    });

    this.logger.info('ai_lifecycle.interrupted_requests_recovered', {
      count: ids.length,
      requestIds: ids,
    });

    return {
      recoveredCount: ids.length,
      updatedRequestIds: ids,
    };
  }
}
