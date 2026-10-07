/**
 * @file packages/core/src/ai-provider/local-generation-runtime.ts
 * Privileged AI Generation Runtime service for V9 Phase 130.
 * Orchestrates:
 *   V8 Project Context -> V9 AI Provider -> Ollama -> Selected Local Model -> Normalized AI Response
 *
 * Enforces:
 *   - Strict request lifecycle state machine: IDLE -> VALIDATING -> QUEUED/RUNNING -> COMPLETED | CANCELLED | TIMEOUT | PROVIDER_ERROR | INVALID_RESPONSE
 *   - Model resolution: explicit model verification or automated fallback to Phase 129 selected model
 *   - Bounded and sanitized project context (max 50,000 characters)
 *   - Cancellation propagation to provider AbortController
 *   - Bounded timeout with deterministic resource cleanup (preventing orphaned requests)
 *   - Provider-independent normalized results and classified error mapping
 */

import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  type LocalGenerationRequestInputDto,
  type LocalGenerationResultDto,
  type LocalGenerationStatusDto,
  type AiGenerationLifecycleState,
  type AiProjectContextDto,
  type AiStreamEventDto,
  localGenerationRequestSchema,
} from '@ai-quality/contracts';
import { AiProviderRegistry } from './ai-provider-registry.js';
import type { IAiProvider } from './ai-provider-contract.js';
import {
  AiInvalidRequestError,
  AiProviderUnavailableError,
  AiModelUnavailableError,
  AiTimeoutError,
  AiCancelledError,
  AiInvalidResponseError,
  AiProviderError,
  AiConnectionError,
  AiGenerationError,
  AiCrossProjectAccessError,
} from './ai-provider-errors.js';
import { AiProviderValidator } from './ai-provider-validator.js';
import { ModelDiscoveryService } from './model-discovery-service.js';
import { CapabilityDetectionService } from './capability-detection-service.js';
import { ModelSelectionService } from './model-selection-service.js';
import { AiPrivacyService } from './ai-privacy-service.js';
import { AiLifecycleManager } from './ai-lifecycle-manager.js';
import { getLogger, type ILogger } from '../logging/index.js';

export interface LocalGenerationRuntimeDependencies {
  readonly prisma?: PrismaClient;
  readonly registry?: AiProviderRegistry;
  readonly modelDiscoveryService?: ModelDiscoveryService;
  readonly capabilityDetectionService?: CapabilityDetectionService;
  readonly modelSelectionService?: ModelSelectionService;
  readonly aiPrivacyService?: AiPrivacyService;
  readonly aiLifecycleManager?: AiLifecycleManager;
  readonly logger?: ILogger;
  readonly defaultTimeoutMs?: number;
  readonly maxContextChars?: number;
  readonly assertProjectAccess?: (projectId: string, userId: string) => Promise<void>;
}

interface ActiveRequestRecord {
  readonly requestId: string;
  readonly projectId?: string | null;
  readonly providerId: string;
  readonly modelId: string;
  state: AiGenerationLifecycleState;
  readonly startedAt: Date;
  readonly abortController: AbortController;
  timer?: NodeJS.Timeout;
  durationMs?: number;
  error?: string | null;
  timedOut?: boolean;
  cancelled?: boolean;
}

export class LocalGenerationRuntimeService {
  private readonly prisma?: PrismaClient;
  private readonly registry: AiProviderRegistry;
  private readonly modelDiscoveryService: ModelDiscoveryService;
  private readonly capabilityDetectionService: CapabilityDetectionService;
  private readonly modelSelectionService: ModelSelectionService;
  private readonly aiPrivacyService?: AiPrivacyService;
  private readonly aiLifecycleManager: AiLifecycleManager;
  private readonly logger: ILogger;
  private readonly defaultTimeoutMs: number;
  private readonly maxContextChars: number;
  private readonly projectAccessAssertion?: (projectId: string, userId: string) => Promise<void>;

  // In-flight active generations
  private readonly activeRequests = new Map<string, ActiveRequestRecord>();
  // Bounded terminal status history for recent requests (up to 100 entries)
  private readonly statusHistory = new Map<string, LocalGenerationStatusDto>();
  private static readonly MAX_HISTORY_SIZE = 100;

  constructor(deps?: LocalGenerationRuntimeDependencies) {
    this.prisma = deps?.prisma;
    this.registry = deps?.registry ?? AiProviderRegistry.createDefault();
    this.logger = deps?.logger ?? getLogger();
    this.modelDiscoveryService =
      deps?.modelDiscoveryService ?? new ModelDiscoveryService({ logger: this.logger });
    this.capabilityDetectionService =
      deps?.capabilityDetectionService ??
      new CapabilityDetectionService({ logger: this.logger });
    this.modelSelectionService =
      deps?.modelSelectionService ??
      new ModelSelectionService({
        prisma: this.prisma,
        capabilityService: this.capabilityDetectionService,
        logger: this.logger,
      });
    this.aiPrivacyService = deps?.aiPrivacyService;
    this.aiLifecycleManager =
      deps?.aiLifecycleManager ??
      new AiLifecycleManager({
        prisma: this.prisma,
        logger: this.logger,
        assertProjectAccess: deps?.assertProjectAccess,
      });
    this.defaultTimeoutMs = deps?.defaultTimeoutMs ?? 60_000;
    this.maxContextChars = deps?.maxContextChars ?? 50_000;
    this.projectAccessAssertion = deps?.assertProjectAccess;
  }

  public getLifecycleManager(): AiLifecycleManager {
    return this.aiLifecycleManager;
  }

  /**
   * Main entry point for generating AI responses using local model runtime.
   */
  public async generate(
    rawInput: LocalGenerationRequestInputDto,
    userId?: string,
    externalSignal?: AbortSignal,
  ): Promise<LocalGenerationResultDto> {
    const tStart = performance.now();

    // 1. Validate request structure and parameters
    const parsed = localGenerationRequestSchema.safeParse(rawInput);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new AiInvalidRequestError(`Invalid generation request parameters: ${issues}`);
    }
    const input = parsed.data;

    const requestId = input.requestId ?? crypto.randomUUID();

    // 2. Project isolation & access check
    if (input.projectId && userId && this.projectAccessAssertion) {
      await this.projectAccessAssertion(input.projectId, userId);
    }

    // 3. Bounded Project Context Validation
    const formattedContext = this.formatAndValidateContext(input.context);

    // 4. Provider Resolution & Privacy Policy Enforcement
    const providerId = (input.providerId ?? 'OLLAMA').toUpperCase();
    if (this.aiPrivacyService) {
      await this.aiPrivacyService.assertProviderAllowed(providerId, input.projectId, userId);
    }
    if (!this.registry.has(providerId)) {
      throw new AiInvalidRequestError(`AI Provider '${providerId}' is not registered or supported.`);
    }
    const provider = this.registry.get(providerId);

    // 4b. AI Context Firewall Check & Secret Redaction
    let effectivePrompt = input.prompt;
    let effectiveSystemPrompt = input.systemPrompt;
    if (this.aiPrivacyService) {
      const firewall = await this.aiPrivacyService.checkFirewall(
        {
          projectId: input.projectId,
          providerId: provider.id,
          prompt: input.prompt,
          systemPrompt: input.systemPrompt,
          context: input.context,
        },
        userId,
      );
      effectivePrompt = firewall.sanitizedPrompt;
      effectiveSystemPrompt = firewall.sanitizedSystemPrompt ?? undefined;
    }

    // 5. Provider Operational Readiness Check
    await this.checkProviderReadiness(provider);

    // 6. Model Resolution
    const resolvedModelId = await this.resolveModel(provider, input.modelId, input.projectId, userId);

    // 7. Request Lifecycle Tracking Registration
    const abortController = new AbortController();
    const timeoutMs = input.timeoutMs ?? this.defaultTimeoutMs;

    const activeRecord: ActiveRequestRecord = {
      requestId,
      projectId: input.projectId,
      providerId: provider.id,
      modelId: resolvedModelId,
      state: 'RUNNING',
      startedAt: new Date(),
      abortController,
      timedOut: false,
      cancelled: false,
    };

    activeRecord.timer = setTimeout(() => {
      activeRecord.timedOut = true;
      activeRecord.state = 'TIMEOUT';
      activeRecord.error = `Request timed out after ${timeoutMs}ms.`;
      abortController.abort();
    }, timeoutMs);

    const onExternalAbort = () => {
      activeRecord.cancelled = true;
      activeRecord.state = 'CANCELLED';
      activeRecord.error = 'Request cancelled by client.';
      abortController.abort();
    };

    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(activeRecord.timer);
        activeRecord.state = 'CANCELLED';
        this.archiveStatus(activeRecord);
        throw new AiCancelledError(provider.id);
      }
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    this.activeRequests.set(requestId, activeRecord);

    try {
      this.logger.info('ai_generation.started', {
        requestId,
        provider: provider.id,
        model: resolvedModelId,
        projectId: input.projectId ?? null,
      });

      // Construct normalized prompt incorporating bounded context
      const compositePrompt = formattedContext
        ? `${formattedContext}\n\n[USER INSTRUCTION]\n${effectivePrompt}`
        : effectivePrompt;

      const normalizedRequest = {
        requestId,
        projectId: input.projectId ?? '00000000-0000-0000-0000-000000000000',
        providerId: provider.id,
        model: resolvedModelId,
        prompt: compositePrompt,
        systemPrompt: effectiveSystemPrompt ?? undefined,
        parameters: {
          temperature: input.parameters?.temperature,
          topP: input.parameters?.topP,
          maxTokens: input.parameters?.maxTokens,
          stopSequences: input.parameters?.stopSequences ? [...input.parameters.stopSequences] : undefined,
          timeoutMs,
        },
      };

      // Dispatched through IAiProvider contract
      const rawResult = await provider.generate(normalizedRequest, abortController.signal);

      const durationMs = Math.round(performance.now() - tStart);
      activeRecord.state = 'COMPLETED';
      activeRecord.durationMs = durationMs;

      const normalizedResult: LocalGenerationResultDto = {
        requestId,
        provider: provider.id,
        model: rawResult.model ?? resolvedModelId,
        content: rawResult.text,
        finishReason: rawResult.finishReason ?? 'stop',
        durationMs,
        usage: rawResult.usage
          ? {
              inputTokens: rawResult.usage.inputTokens ?? null,
              outputTokens: rawResult.usage.outputTokens ?? null,
              totalTokens: rawResult.usage.totalTokens ?? null,
            }
          : null,
        metadata: this.sanitizeMetadata(rawResult.metadata),
        state: 'COMPLETED',
      };

      this.logger.info('ai_generation.completed', {
        requestId,
        provider: provider.id,
        model: resolvedModelId,
        durationMs,
        status: 'COMPLETED',
      });

      this.archiveStatus(activeRecord);
      return normalizedResult;
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - tStart);
      activeRecord.durationMs = durationMs;

      // Classify error and update lifecycle state
      if (activeRecord.timedOut || err instanceof AiTimeoutError) {
        activeRecord.state = 'TIMEOUT';
        activeRecord.error = `Generation timed out after ${timeoutMs}ms.`;
        this.archiveStatus(activeRecord);
        this.logger.warn('ai_generation.timeout', { requestId, provider: provider.id, durationMs });
        throw new AiTimeoutError(timeoutMs, provider.id);
      }

      if (activeRecord.cancelled || err instanceof AiCancelledError || (err instanceof Error && err.name === 'AbortError')) {
        activeRecord.state = 'CANCELLED';
        activeRecord.error = 'Generation cancelled by user.';
        this.archiveStatus(activeRecord);
        this.logger.info('ai_generation.cancelled', { requestId, provider: provider.id, durationMs });
        throw new AiCancelledError(provider.id);
      }

      if (err instanceof AiInvalidResponseError) {
        activeRecord.state = 'INVALID_RESPONSE';
        activeRecord.error = err.message;
        this.archiveStatus(activeRecord);
        this.logger.warn('ai_generation.invalid_response', { requestId, provider: provider.id, error: err.message });
        throw err;
      }

      if (err instanceof AiModelUnavailableError || err instanceof AiProviderUnavailableError) {
        activeRecord.state = 'PROVIDER_ERROR';
        activeRecord.error = err.message;
        this.archiveStatus(activeRecord);
        this.logger.warn('ai_generation.provider_unavailable', { requestId, provider: provider.id, error: err.message });
        throw err;
      }

      // Map network / socket dropouts
      if (this.isNetworkOrSocketError(err)) {
        activeRecord.state = 'PROVIDER_ERROR';
        const msg = `Connection to AI Provider '${provider.id}' failed or was interrupted: ${err instanceof Error ? err.message : String(err)}`;
        activeRecord.error = msg;
        this.archiveStatus(activeRecord);
        this.logger.warn('ai_generation.connection_error', { requestId, provider: provider.id, error: msg });
        throw new AiConnectionError(provider.id, msg, err);
      }

      // Generic runtime failure
      activeRecord.state = 'PROVIDER_ERROR';
      const errorMsg = err instanceof Error ? err.message : String(err);
      activeRecord.error = errorMsg;
      this.archiveStatus(activeRecord);
      this.logger.error('ai_generation.failed', { requestId, provider: provider.id, error: errorMsg });

      if (err instanceof AiProviderError) {
        throw err;
      }

      throw new AiGenerationError(
        `AI generation failed on provider '${provider.id}': ${errorMsg}`,
        provider.id,
        err,
      );
    } finally {
      if (activeRecord.timer) {
        clearTimeout(activeRecord.timer);
      }
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * Streams progressive AI response chunks using local model runtime (Phase 131).
   * Yields normalized events: START -> DELTA ... -> COMPLETE (or ERROR / CANCELLED).
   */
  public async *generateStream(
    rawInput: LocalGenerationRequestInputDto,
    userId?: string,
    externalSignal?: AbortSignal,
  ): AsyncIterable<AiStreamEventDto> {
    const tStart = performance.now();
    let sequence = 0;
    const fallbackId = rawInput?.requestId ?? crypto.randomUUID();

    // 1. Validate request structure and parameters
    const parsed = localGenerationRequestSchema.safeParse(rawInput);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new AiInvalidRequestError(`Invalid generation request parameters: ${issues}`);
    }
    const input = parsed.data;
    const requestId = input.requestId ?? fallbackId;

    // 2. Project isolation & access check
    if (input.projectId && userId && this.projectAccessAssertion) {
      await this.projectAccessAssertion(input.projectId, userId);
    }

    // 3. Bounded Project Context Validation
    const formattedContext = this.formatAndValidateContext(input.context);

    // 4. Provider Resolution & Privacy Policy Enforcement
    const providerId = (input.providerId ?? 'OLLAMA').toUpperCase();
    if (this.aiPrivacyService) {
      await this.aiPrivacyService.assertProviderAllowed(providerId, input.projectId, userId);
    }
    if (!this.registry.has(providerId)) {
      throw new AiInvalidRequestError(`AI Provider '${providerId}' is not registered or supported.`);
    }
    const provider = this.registry.get(providerId);

    // 4b. AI Context Firewall Check & Secret Redaction
    let effectivePrompt = input.prompt;
    let effectiveSystemPrompt = input.systemPrompt;
    if (this.aiPrivacyService) {
      const firewall = await this.aiPrivacyService.checkFirewall(
        {
          projectId: input.projectId,
          providerId: provider.id,
          prompt: input.prompt,
          systemPrompt: input.systemPrompt,
          context: input.context,
        },
        userId,
      );
      effectivePrompt = firewall.sanitizedPrompt;
      effectiveSystemPrompt = firewall.sanitizedSystemPrompt ?? undefined;
    }

    let resolvedModelId = input.modelId ?? 'unknown';
    const abortController = new AbortController();
    const timeoutMs = input.timeoutMs ?? this.defaultTimeoutMs;

    let activeRecord: ActiveRequestRecord | null = null;
    let timer: NodeJS.Timeout | undefined;

    const onExternalAbort = () => {
      if (activeRecord) {
        activeRecord.cancelled = true;
        activeRecord.state = 'CANCELLED';
        activeRecord.error = 'Request cancelled by client.';
      }
      abortController.abort();
    };

    let accumulatedText = '';
    let lastFinishReason: string | null = null;
    let lastUsage: {
      readonly inputTokens?: number | null;
      readonly outputTokens?: number | null;
      readonly totalTokens?: number | null;
    } | null = null;

    try {
      // 5. Provider Operational Readiness Check
      await this.checkProviderReadiness(provider);

      // 6. Model Resolution
      resolvedModelId = await this.resolveModel(provider, input.modelId, input.projectId, userId);

      // 7. Request Lifecycle Tracking Registration
      activeRecord = {
        requestId,
        projectId: input.projectId,
        providerId: provider.id,
        modelId: resolvedModelId,
        state: 'RUNNING',
        startedAt: new Date(),
        abortController,
        timedOut: false,
        cancelled: false,
      };

      timer = setTimeout(() => {
        if (activeRecord) {
          activeRecord.timedOut = true;
          activeRecord.state = 'TIMEOUT';
          activeRecord.error = `Request timed out after ${timeoutMs}ms.`;
        }
        abortController.abort();
      }, timeoutMs);
      activeRecord.timer = timer;

      if (externalSignal) {
        if (externalSignal.aborted) {
          clearTimeout(timer);
          activeRecord.state = 'CANCELLED';
          this.archiveStatus(activeRecord);
          yield {
            requestId,
            projectId: input.projectId,
            sequence: sequence++,
            type: 'CANCELLED',
            done: true,
            content: '',
            deltaText: '',
            accumulatedText: '',
            model: resolvedModelId,
            provider: provider.id,
            error: 'Request cancelled by client.',
            durationMs: 0,
          };
          return;
        }
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }

      this.activeRequests.set(requestId, activeRecord);

      this.logger.info('ai_stream.started', {
        requestId,
        provider: provider.id,
        model: resolvedModelId,
        projectId: input.projectId ?? null,
      });

      // Emit START event
      yield {
        requestId,
        projectId: input.projectId,
        sequence: sequence++,
        type: 'START',
        content: '',
        deltaText: '',
        accumulatedText: '',
        done: false,
        model: resolvedModelId,
        provider: provider.id,
      };

      // Construct normalized prompt incorporating bounded context
      const compositePrompt = formattedContext
        ? `${formattedContext}\n\n[USER INSTRUCTION]\n${effectivePrompt}`
        : effectivePrompt;

      const normalizedRequest = {
        requestId,
        projectId: input.projectId ?? '00000000-0000-0000-0000-000000000000',
        providerId: provider.id,
        model: resolvedModelId,
        prompt: compositePrompt,
        systemPrompt: effectiveSystemPrompt ?? undefined,
        parameters: {
          temperature: input.parameters?.temperature,
          topP: input.parameters?.topP,
          maxTokens: input.parameters?.maxTokens,
          stopSequences: input.parameters?.stopSequences ? [...input.parameters.stopSequences] : undefined,
          timeoutMs,
        },
      };

      // Dispatched through IAiProvider.stream contract
      for await (const chunk of provider.stream(normalizedRequest, abortController.signal)) {
        if (activeRecord?.cancelled || activeRecord?.timedOut) {
          break;
        }

        const delta = chunk.deltaText ?? '';
        accumulatedText += delta;

        if (chunk.finishReason) {
          lastFinishReason = chunk.finishReason;
        }
        if (chunk.usage) {
          lastUsage = {
            inputTokens: chunk.usage.inputTokens ?? null,
            outputTokens: chunk.usage.outputTokens ?? null,
            totalTokens: chunk.usage.totalTokens ?? null,
          };
        }

        // Emit DELTA event (suppress empty delta unless finishReason is present)
        if (delta.length > 0 || chunk.finishReason) {
          yield {
            requestId,
            projectId: input.projectId,
            sequence: sequence++,
            type: 'DELTA',
            content: delta,
            deltaText: delta,
            accumulatedText,
            done: false,
            model: resolvedModelId,
            provider: provider.id,
            finishReason: chunk.finishReason ?? null,
            usage: lastUsage,
          };
        }
      }

      // Check if aborted during stream iteration
      if (activeRecord?.cancelled || abortController.signal.aborted) {
        throw new AiCancelledError(provider.id);
      }
      if (activeRecord?.timedOut) {
        throw new AiTimeoutError(timeoutMs, provider.id);
      }

      const durationMs = Math.round(performance.now() - tStart);
      if (activeRecord) {
        activeRecord.state = 'COMPLETED';
        activeRecord.durationMs = durationMs;
      }

      // Emit COMPLETE event
      yield {
        requestId,
        projectId: input.projectId,
        sequence: sequence++,
        type: 'COMPLETE',
        content: accumulatedText,
        deltaText: '',
        accumulatedText,
        done: true,
        model: resolvedModelId,
        provider: provider.id,
        finishReason: lastFinishReason ?? 'stop',
        durationMs,
        usage: lastUsage,
      };

      this.logger.info('ai_stream.completed', {
        requestId,
        provider: provider.id,
        model: resolvedModelId,
        durationMs,
        accumulatedLength: accumulatedText.length,
      });

      if (activeRecord) {
        this.archiveStatus(activeRecord);
      }
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - tStart);
      if (activeRecord) {
        activeRecord.durationMs = durationMs;
      }

      if (activeRecord?.timedOut || err instanceof AiTimeoutError) {
        if (activeRecord) {
          activeRecord.state = 'TIMEOUT';
          activeRecord.error = `Generation timed out after ${timeoutMs}ms.`;
          this.archiveStatus(activeRecord);
        }
        this.logger.warn('ai_stream.timeout', { requestId, provider: provider.id, durationMs });
        yield {
          requestId,
          projectId: input.projectId,
          sequence: sequence++,
          type: 'ERROR',
          done: true,
          content: accumulatedText,
          accumulatedText,
          error: `Generation timed out after ${timeoutMs}ms.`,
          model: resolvedModelId,
          provider: provider.id,
          durationMs,
        };
        return;
      }

      if (
        activeRecord?.cancelled ||
        err instanceof AiCancelledError ||
        abortController.signal.aborted ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        if (activeRecord) {
          activeRecord.state = 'CANCELLED';
          activeRecord.error = 'Generation cancelled by user.';
          this.archiveStatus(activeRecord);
        }
        this.logger.info('ai_stream.cancelled', { requestId, provider: provider.id, durationMs });
        yield {
          requestId,
          projectId: input.projectId,
          sequence: sequence++,
          type: 'CANCELLED',
          done: true,
          content: accumulatedText,
          accumulatedText,
          error: 'Generation cancelled by user.',
          model: resolvedModelId,
          provider: provider.id,
          durationMs,
        };
        return;
      }

      let errorMsg = 'An unexpected stream error occurred.';
      if (err instanceof AiInvalidResponseError) {
        if (activeRecord) activeRecord.state = 'INVALID_RESPONSE';
        errorMsg = err.message;
      } else if (err instanceof AiModelUnavailableError || err instanceof AiProviderUnavailableError) {
        if (activeRecord) activeRecord.state = 'PROVIDER_ERROR';
        errorMsg = err.message;
      } else if (this.isNetworkOrSocketError(err)) {
        if (activeRecord) activeRecord.state = 'PROVIDER_ERROR';
        errorMsg = `Connection to AI Provider '${provider.id}' failed or was interrupted: ${err instanceof Error ? err.message : String(err)}`;
      } else if (err instanceof AiProviderError) {
        if (activeRecord) activeRecord.state = 'PROVIDER_ERROR';
        errorMsg = err.message;
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }

      if (activeRecord) {
        activeRecord.error = errorMsg;
        this.archiveStatus(activeRecord);
      } else {
        this.statusHistory.set(requestId, {
          requestId,
          state: 'PROVIDER_ERROR',
          modelId: resolvedModelId,
          startedAt: new Date(tStart).toISOString(),
          durationMs,
          error: errorMsg,
        });
      }
      this.logger.warn('ai_stream.error', { requestId, provider: provider.id, error: errorMsg });

      yield {
        requestId,
        projectId: input.projectId,
        sequence: sequence++,
        type: 'ERROR',
        done: true,
        content: accumulatedText,
        accumulatedText,
        error: errorMsg,
        model: resolvedModelId,
        provider: provider.id,
        durationMs,
      };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
      this.activeRequests.delete(requestId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  /**
   * Cooperatively cancels an active generation operation.
   */
  public async cancel(requestId: string): Promise<boolean> {
    AiProviderValidator.validateUuid(requestId, 'Request ID');
    const record = this.activeRequests.get(requestId);
    if (!record) {
      return false;
    }

    if (record.state === 'COMPLETED' || record.state === 'CANCELLED' || record.state === 'TIMEOUT') {
      return false;
    }

    record.cancelled = true;
    record.state = 'CANCELLED';
    record.error = 'Request cancelled by user.';
    if (record.timer) {
      clearTimeout(record.timer);
    }

    record.abortController.abort();

    // Propagate cancellation to underlying provider
    if (this.registry.has(record.providerId)) {
      const provider = this.registry.get(record.providerId);
      await provider.cancel(requestId).catch(() => {});
    }

    this.archiveStatus(record);
    this.activeRequests.delete(requestId);

    // Notify central lifecycle manager
    await this.aiLifecycleManager.cancelRequest(requestId, 'Request cancelled by user.').catch(() => {});

    this.logger.info('ai_generation.cancelled_via_manager', { requestId });
    return true;
  }

  /**
   * Retrieves deterministic lifecycle status for a request ID.
   */
  public getStatus(requestId: string): LocalGenerationStatusDto {
    AiProviderValidator.validateUuid(requestId, 'Request ID');

    const active = this.activeRequests.get(requestId);
    if (active) {
      return {
        requestId: active.requestId,
        state: active.state,
        modelId: active.modelId,
        startedAt: active.startedAt.toISOString(),
        durationMs: active.durationMs ?? Math.round(performance.now() - active.startedAt.getTime()),
        error: active.error ?? null,
      };
    }

    const archived = this.statusHistory.get(requestId);
    if (archived) {
      return archived;
    }

    return {
      requestId,
      state: 'IDLE',
      error: null,
    };
  }

  /**
   * Resolves the target AI model: validates explicitly requested model, or resolves
   * through Phase 129 ModelSelectionService / installed models.
   */
  private async resolveModel(
    provider: IAiProvider,
    requestedModelId?: string,
    projectId?: string | null,
    userId?: string,
  ): Promise<string> {
    if (requestedModelId) {
      const sanitized = AiProviderValidator.validateModelIdentifier(requestedModelId, provider.id);

      // Verify availability against discovered models if provider supports listing
      if (typeof provider.listModels === 'function') {
        const models = await provider.listModels().catch(() => []);
        if (models.length > 0) {
          const match = models.find(
            (m) =>
              m.id.toLowerCase() === sanitized.toLowerCase() ||
              m.name.toLowerCase() === sanitized.toLowerCase() ||
              m.id.toLowerCase().startsWith(sanitized.toLowerCase()),
          );
          if (!match) {
            throw new AiModelUnavailableError(
              sanitized,
              provider.id,
              `AI model '${sanitized}' is not installed or available on provider '${provider.id}'.`,
            );
          }
          return match.id;
        }
      }

      return sanitized;
    }

    // No model specified: auto-resolve via ModelSelectionService (Phase 129)
    if (typeof provider.listModels === 'function') {
      const discovered = await provider.listModels().catch(() => []);
      if (discovered.length === 0) {
        throw new AiModelUnavailableError(
          'default',
          provider.id,
          `No models are installed on local provider '${provider.id}'. Please install a model in Ollama.`,
        );
      }

      // Check persistent project selection or default selection
      if (projectId) {
        const projectSelection = await this.modelSelectionService
          .getModelSelection({ projectId, selectionType: 'DEFAULT' }, discovered, userId)
          .catch(() => null);

        if (projectSelection?.selectedModel) {
          return projectSelection.selectedModel.id;
        }
      }

      // Resolve best default model for general generation task
      const taskResolution = await this.modelSelectionService
        .resolveModelForTask({ task: 'default', projectId }, discovered, userId)
        .catch(() => null);

      if (taskResolution?.selectedModel) {
        return taskResolution.selectedModel.id;
      }

      // Fallback to first available model from provider
      const firstModel = discovered[0];
      if (firstModel) {
        return firstModel.id;
      }
    }

    throw new AiModelUnavailableError(
      'default',
      provider.id,
      `No model specified and provider '${provider.id}' does not support model discovery.`,
    );
  }

  /**
   * Pre-flight readiness check to fail immediately if provider/daemon is offline.
   */
  private async checkProviderReadiness(provider: IAiProvider): Promise<void> {
    try {
      const status = await provider.healthCheck();
      if (status.status !== 'READY') {
        throw new AiProviderUnavailableError(
          provider.id,
          `AI Provider '${provider.id}' is not ready or daemon is offline. Status: ${status.status}`,
        );
      }
    } catch (err: unknown) {
      if (err instanceof AiProviderUnavailableError) {
        throw err;
      }
      throw new AiProviderUnavailableError(
        provider.id,
        `AI Provider '${provider.id}' is unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Formats and bounds project context according to configured character limits.
   */
  private formatAndValidateContext(context?: AiProjectContextDto | null): string | null {
    if (!context) {
      return null;
    }

    let totalChars = 0;
    const sections: string[] = [];

    if (context.repositoryInfo?.trim()) {
      const text = context.repositoryInfo.trim();
      totalChars += text.length;
      sections.push(`### Repository Information\n${text}`);
    }

    if (context.requirements?.trim()) {
      const text = context.requirements.trim();
      totalChars += text.length;
      sections.push(`### Project Requirements\n${text}`);
    }

    if (context.testInfo?.trim()) {
      const text = context.testInfo.trim();
      totalChars += text.length;
      sections.push(`### Test Suite Context\n${text}`);
    }

    if (context.targetInfo?.trim()) {
      const text = context.targetInfo.trim();
      totalChars += text.length;
      sections.push(`### Target Environment Information\n${text}`);
    }

    if (context.relevantMetadata && Object.keys(context.relevantMetadata).length > 0) {
      const serialized = JSON.stringify(context.relevantMetadata, null, 2);
      totalChars += serialized.length;
      sections.push(`### Metadata\n${serialized}`);
    }

    if (totalChars > this.maxContextChars) {
      throw new AiInvalidRequestError(
        `Project context size (${totalChars} characters) exceeds the maximum allowed limit of ${this.maxContextChars} characters.`,
      );
    }

    if (sections.length === 0) {
      return null;
    }

    return `[PROJECT CONTEXT]\n${sections.join('\n\n')}`;
  }

  /**
   * Redacts sensitive fields and returns safe metadata for desktop consumption.
   */
  private sanitizeMetadata(raw?: Record<string, unknown>): Record<string, unknown> | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const safe: Record<string, unknown> = {};
    const disallowedKeys = ['key', 'token', 'secret', 'password', 'credential', 'auth', 'cookie'];

    for (const [k, v] of Object.entries(raw)) {
      const lowerKey = k.toLowerCase();
      if (disallowedKeys.some((blocked) => lowerKey.includes(blocked))) {
        continue;
      }
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        safe[k] = v;
      }
    }
    return Object.keys(safe).length > 0 ? safe : null;
  }

  /**
   * Helper to detect network connection / socket dropouts.
   */
  private isNetworkOrSocketError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    return (
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('fetch failed') ||
      msg.includes('network error') ||
      msg.includes('socket disconnected') ||
      msg.includes('broken pipe')
    );
  }

  /**
   * Archives a completed/terminated request into bounded status history.
   */
  private archiveStatus(record: ActiveRequestRecord): void {
    if (this.statusHistory.size >= LocalGenerationRuntimeService.MAX_HISTORY_SIZE) {
      const oldestKey = this.statusHistory.keys().next().value;
      if (oldestKey) {
        this.statusHistory.delete(oldestKey);
      }
    }

    this.statusHistory.set(record.requestId, {
      requestId: record.requestId,
      state: record.state,
      modelId: record.modelId,
      startedAt: record.startedAt.toISOString(),
      durationMs: record.durationMs,
      error: record.error ?? null,
    });
  }
}
