/**
 * @file packages/core/src/ai-provider/ai-provider-router-service.ts
 * Privileged AI Provider Routing & Fallback Service (V9 Phase 138).
 * Orchestrates deterministic provider selection, health verification, capability-aware routing,
 * controlled retries, request continuity, and safe fallback while strictly enforcing
 * multi-tenant project isolation and V9 privacy/local-only constraints.
 */

import crypto from 'node:crypto';
import type { PrismaClient, AuthAuditAction } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import type {
  AiProviderRegistryItemDto,
  AiFallbackSettingsDto,
  GetAiFallbackSettingsInputDto,
  UpdateAiFallbackSettingsInputDto,
  GetAiProviderRegistryStatusInputDto,
  AiProviderSelectionCriteriaDto,
  AiProviderSelectionResultDto,
  AiFallbackAttemptDto,
  AiFallbackPolicyDto,
  AiProviderFailureReasonDto,
  AiStreamEventDto,
  ModelCapabilityType,
} from '@ai-quality/contracts';
import {
  getAiFallbackSettingsInputSchema,
  updateAiFallbackSettingsInputSchema,
  aiProviderSelectionCriteriaSchema,
} from '@ai-quality/contracts';
import { AiProviderRegistry } from './ai-provider-registry.js';
import type { IAiProvider } from './ai-provider-contract.js';
import {
  AiInvalidRequestError,
  AiProviderUnavailableError,
  AiModelUnavailableError,
  AiTimeoutError,
  AiCancelledError,
  AiRateLimitError,
  AiInvalidResponseError,
  AiProviderError,
  AiConnectionError,
  AiGenerationError,
  AiCrossProjectAccessError,
  AiModelNotFoundError,
  AiCapabilityUnsupportedError,
  AiNoCompatibleModelError,
  AiStructuredValidationError,
  AiStructuredParseError,
  AiStructuredMaxRetriesExceededError,
  AiRemoteProviderBlockedError,
  AiPrivacyViolationError,
  AiFallbackExhaustedError,
  AiFallbackPolicyBlockedError,
} from './ai-provider-errors.js';
import { AiProviderValidator } from './ai-provider-validator.js';
import { AiPrivacyService } from './ai-privacy-service.js';
import { ModelDiscoveryService } from './model-discovery-service.js';
import { CapabilityDetectionService } from './capability-detection-service.js';
import { ModelSelectionService } from './model-selection-service.js';
import { getLogger, type ILogger } from '../logging/index.js';

export interface ProviderMetadata {
  providerId: string;
  displayName: string;
  isLocal: boolean;
  priority: number;
  enabled: boolean;
}

export interface ExecuteWithFallbackOptions<T> {
  readonly requestId?: string;
  readonly projectId?: string | null;
  readonly userId?: string;
  readonly requestedProviderId?: string;
  readonly requestedModelId?: string;
  readonly requiredCapabilities?: readonly ModelCapabilityType[];
  readonly requiresStreaming?: boolean;
  readonly requiresStructuredOutput?: boolean;
  readonly requiresToolCalling?: boolean;
  readonly minContextTokens?: number;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly signal?: AbortSignal;
  readonly execute: (
    provider: IAiProvider,
    modelId: string,
    attempt: number,
    signal?: AbortSignal,
  ) => Promise<T>;
}

export interface ExecuteWithFallbackResult<T> {
  readonly result: T;
  readonly providerId: string;
  readonly modelId: string;
  readonly fallbackApplied: boolean;
  readonly attemptHistory: readonly AiFallbackAttemptDto[];
  readonly originalProviderId: string;
}

export interface StreamWithFallbackOptions {
  readonly requestId?: string;
  readonly projectId?: string | null;
  readonly userId?: string;
  readonly requestedProviderId?: string;
  readonly requestedModelId?: string;
  readonly requiredCapabilities?: readonly ModelCapabilityType[];
  readonly minContextTokens?: number;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly signal?: AbortSignal;
  readonly stream: (
    provider: IAiProvider,
    modelId: string,
    attempt: number,
    signal?: AbortSignal,
  ) => AsyncIterable<AiStreamEventDto>;
}

export interface AiProviderRouterServiceDependencies {
  readonly prisma?: PrismaClient;
  readonly registry?: AiProviderRegistry;
  readonly aiPrivacyService?: AiPrivacyService;
  readonly modelDiscoveryService?: ModelDiscoveryService;
  readonly capabilityDetectionService?: CapabilityDetectionService;
  readonly modelSelectionService?: ModelSelectionService;
  readonly logger?: ILogger;
  readonly assertProjectAccess?: (projectId: string, userId: string) => Promise<void>;
}

export class AiProviderRouterService {
  private readonly prisma: PrismaClient;
  private readonly registry: AiProviderRegistry;
  private readonly aiPrivacyService: AiPrivacyService;
  private readonly modelDiscoveryService: ModelDiscoveryService;
  private readonly capabilityDetectionService: CapabilityDetectionService;
  private readonly modelSelectionService: ModelSelectionService;
  private readonly logger: ILogger;
  private readonly projectAccessAssertion?: (projectId: string, userId: string) => Promise<void>;

  // In-memory provider metadata store
  private readonly metadataStore = new Map<string, ProviderMetadata>();

  constructor(deps?: AiProviderRouterServiceDependencies) {
    this.prisma = deps?.prisma ?? getPrismaClient()!;
    this.registry = deps?.registry ?? AiProviderRegistry.createDefault();
    this.logger = deps?.logger ?? getLogger();
    this.aiPrivacyService =
      deps?.aiPrivacyService ??
      new AiPrivacyService({
        prisma: this.prisma,
        registry: this.registry,
        logger: this.logger,
      });
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
    this.projectAccessAssertion = deps?.assertProjectAccess;

    // Seed default provider metadata
    this.registerProviderMetadata('OLLAMA', {
      displayName: 'Ollama (Local)',
      isLocal: true,
      priority: 1,
      enabled: true,
    });
    this.registerProviderMetadata('OPENAI', {
      displayName: 'OpenAI (Cloud)',
      isLocal: false,
      priority: 10,
      enabled: true,
    });
    this.registerProviderMetadata('ANTHROPIC', {
      displayName: 'Anthropic (Cloud)',
      isLocal: false,
      priority: 20,
      enabled: true,
    });
    this.registerProviderMetadata('EMULATED', {
      displayName: 'Emulated Test Provider',
      isLocal: true,
      priority: 99,
      enabled: true,
    });
  }

  /**
   * Registers or updates metadata for a registered AI provider.
   */
  public registerProviderMetadata(
    providerId: string,
    metadata: Partial<ProviderMetadata>,
  ): void {
    const validatedId = AiProviderValidator.validateProviderId(providerId);
    const existing = this.metadataStore.get(validatedId) ?? {
      providerId: validatedId,
      displayName: validatedId,
      isLocal: validatedId === 'OLLAMA' || validatedId === 'EMULATED',
      priority: 100,
      enabled: true,
    };

    this.metadataStore.set(validatedId, {
      ...existing,
      ...metadata,
      providerId: validatedId,
    });
  }

  /**
   * Lists status and metadata for all registered AI providers.
   */
  public async listProviders(
    projectId?: string | null,
    userId?: string,
  ): Promise<readonly AiProviderRegistryItemDto[]> {
    if (projectId && userId) {
      await this.assertProjectAccess(projectId, userId);
    }

    const providers = this.registry.list();
    const items: AiProviderRegistryItemDto[] = [];

    for (const provider of providers) {
      const status = await this.getProviderStatus(provider.id, projectId, userId);
      items.push(status);
    }

    // Sort by priority ascending (1 is highest priority)
    return items.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Retrieves status, health, capabilities, and models for a specific AI provider.
   */
  public async getProviderStatus(
    providerId: string,
    projectId?: string | null,
    userId?: string,
  ): Promise<AiProviderRegistryItemDto> {
    const validatedId = AiProviderValidator.validateProviderId(providerId);
    const provider = this.registry.get(validatedId);

    if (projectId && userId) {
      await this.assertProjectAccess(projectId, userId);
    }

    const meta = this.metadataStore.get(validatedId) ?? {
      providerId: validatedId,
      displayName: provider.name,
      isLocal: provider.type === 'LOCAL' || provider.type === 'EMULATED',
      priority: 50,
      enabled: true,
    };

    // Health check
    let healthStatus: import('@ai-quality/contracts').AiProviderStatusDto = {
      providerId: provider.id,
      configured: true,
      status: 'READY',
      capabilities: provider.getCapabilities(),
      verifiedAt: new Date().toISOString(),
      message: 'Provider is operational.',
    };

    try {
      const checked = await provider.healthCheck();
      healthStatus = {
        ...checked,
        providerId: provider.id,
      };
    } catch (err) {
      healthStatus = {
        providerId: provider.id,
        configured: true,
        status: 'UNAVAILABLE',
        capabilities: provider.getCapabilities(),
        verifiedAt: new Date().toISOString(),
        message: err instanceof Error ? err.message : 'Provider health check failed.',
      };
    }

    // Models discovery
    let models: readonly import('@ai-quality/contracts').AiModelDto[] = [];
    if (typeof provider.listModels === 'function') {
      try {
        models = await provider.listModels();
      } catch {
        models = [];
      }
    } else {
      const caps = provider.getCapabilities();
      models = caps.supportedModels.map((m) => ({
        id: m,
        name: m,
        provider: provider.id,
        capabilities: {
          textGeneration: true,
          embeddings: false,
          vision: false,
          toolCalling: false,
        },
      }));
    }

    const isAvailable = healthStatus.status === 'READY';

    return {
      providerId: provider.id,
      displayName: meta.displayName,
      enabled: meta.enabled,
      available: isAvailable,
      isLocal: meta.isLocal,
      priority: meta.priority,
      health: healthStatus,
      capabilities: provider.getCapabilities(),
      models,
    };
  }

  /**
   * Retrieves fallback policy and settings for a project or global defaults.
   */
  public async getFallbackSettings(
    input?: GetAiFallbackSettingsInputDto,
    userId?: string,
  ): Promise<AiFallbackSettingsDto> {
    const validated = getAiFallbackSettingsInputSchema.parse(input ?? {});

    if (validated.projectId && userId) {
      await this.assertProjectAccess(validated.projectId, userId);
    }

    if (validated.projectId) {
      const record = await this.prisma.aiFallbackSettings.findUnique({
        where: { projectId: validated.projectId },
      });

      if (record) {
        return {
          id: record.id,
          projectId: record.projectId,
          userId: record.userId,
          preferredProvider: record.preferredProvider,
          preferredModel: record.preferredModel,
          fallbackPolicy: record.fallbackPolicy as AiFallbackPolicyDto,
          fallbackPriority: Array.isArray(record.fallbackPriority)
            ? (record.fallbackPriority as string[])
            : ['OLLAMA'],
          maxRetries: record.maxRetries,
          requestTimeoutMs: record.requestTimeoutMs,
          createdAt: record.createdAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
        };
      }
    }

    // Default safe configuration
    return {
      id: '00000000-0000-0000-0000-000000000138',
      projectId: validated.projectId ?? null,
      userId: userId ?? null,
      preferredProvider: 'OLLAMA',
      preferredModel: null,
      fallbackPolicy: 'LOCAL_ONLY',
      fallbackPriority: ['OLLAMA'],
      maxRetries: 2,
      requestTimeoutMs: 60000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Updates fallback policy and routing preferences for a project.
   */
  public async updateFallbackSettings(
    rawInput: UpdateAiFallbackSettingsInputDto,
    userId?: string,
  ): Promise<AiFallbackSettingsDto> {
    const validated = updateAiFallbackSettingsInputSchema.parse(rawInput);

    if (validated.projectId && userId) {
      await this.assertProjectAccess(validated.projectId, userId);
    }

    const current = await this.getFallbackSettings({ projectId: validated.projectId }, userId);

    const newPreferredProvider = validated.preferredProvider ?? current.preferredProvider;
    const newPreferredModel =
      validated.preferredModel !== undefined ? validated.preferredModel : current.preferredModel;
    const newFallbackPolicy = validated.fallbackPolicy ?? current.fallbackPolicy;
    const newFallbackPriority = validated.fallbackPriority ?? current.fallbackPriority;
    const newMaxRetries = validated.maxRetries ?? current.maxRetries;
    const newRequestTimeoutMs = validated.requestTimeoutMs ?? current.requestTimeoutMs;

    if (validated.projectId) {
      const saved = await this.prisma.aiFallbackSettings.upsert({
        where: { projectId: validated.projectId },
        update: {
          preferredProvider: newPreferredProvider,
          preferredModel: newPreferredModel,
          fallbackPolicy: newFallbackPolicy,
          fallbackPriority: newFallbackPriority,
          maxRetries: newMaxRetries,
          requestTimeoutMs: newRequestTimeoutMs,
          userId: userId ?? null,
        },
        create: {
          projectId: validated.projectId,
          userId: userId ?? null,
          preferredProvider: newPreferredProvider,
          preferredModel: newPreferredModel,
          fallbackPolicy: newFallbackPolicy,
          fallbackPriority: newFallbackPriority,
          maxRetries: newMaxRetries,
          requestTimeoutMs: newRequestTimeoutMs,
        },
      });

      if (userId) {
        await this.recordAuditLog(userId, 'AI_FALLBACK_POLICY_UPDATED' as AuthAuditAction, {
          projectId: validated.projectId,
          fallbackPolicy: newFallbackPolicy,
          preferredProvider: newPreferredProvider,
          maxRetries: newMaxRetries,
        });
      }

      this.logger.info('ai_provider_router.fallback_settings_updated', {
        projectId: validated.projectId,
        userId: userId ?? null,
        fallbackPolicy: newFallbackPolicy,
        preferredProvider: newPreferredProvider,
      });

      return {
        id: saved.id,
        projectId: saved.projectId,
        userId: saved.userId,
        preferredProvider: saved.preferredProvider,
        preferredModel: saved.preferredModel,
        fallbackPolicy: saved.fallbackPolicy as AiFallbackPolicyDto,
        fallbackPriority: Array.isArray(saved.fallbackPriority)
          ? (saved.fallbackPriority as string[])
          : ['OLLAMA'],
        maxRetries: saved.maxRetries,
        requestTimeoutMs: saved.requestTimeoutMs,
        createdAt: saved.createdAt.toISOString(),
        updatedAt: saved.updatedAt.toISOString(),
      };
    }

    return {
      ...current,
      preferredProvider: newPreferredProvider,
      preferredModel: newPreferredModel,
      fallbackPolicy: newFallbackPolicy,
      fallbackPriority: newFallbackPriority,
      maxRetries: newMaxRetries,
      requestTimeoutMs: newRequestTimeoutMs,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Selects an AI provider and model deterministically based on criteria,
   * privacy rules, health, and capability compatibility.
   */
  public async selectProvider(
    rawCriteria: AiProviderSelectionCriteriaDto,
    userId?: string,
  ): Promise<AiProviderSelectionResultDto> {
    const criteria = aiProviderSelectionCriteriaSchema.parse(rawCriteria);

    if (criteria.projectId && userId) {
      await this.assertProjectAccess(criteria.projectId, userId);
    }

    const fallbackSettings = await this.getFallbackSettings(
      { projectId: criteria.projectId },
      userId,
    );

    // 1. Check Privacy Policy constraints
    const privacySettings = await this.aiPrivacyService.getSettings(
      { projectId: criteria.projectId },
      userId,
    );
    const isLocalOnly = privacySettings.privacyMode === 'LOCAL_ONLY';

    const attemptedProviders: string[] = [];

    // 2. Candidate Provider Resolution
    const candidateProviderIds: string[] = [];

    if (criteria.requestedProviderId) {
      const explicitId = criteria.requestedProviderId.toUpperCase();
      candidateProviderIds.push(explicitId);
    } else {
      // Prioritize preferred provider, followed by fallbackPriority, followed by all registered providers
      const preferred = fallbackSettings.preferredProvider.toUpperCase();
      candidateProviderIds.push(preferred);

      for (const p of fallbackSettings.fallbackPriority) {
        const upper = p.toUpperCase();
        if (!candidateProviderIds.includes(upper)) {
          candidateProviderIds.push(upper);
        }
      }

      for (const p of this.registry.list()) {
        const upper = p.id.toUpperCase();
        if (!candidateProviderIds.includes(upper)) {
          candidateProviderIds.push(upper);
        }
      }
    }

    // 3. Evaluate candidate providers in sequence
    for (const providerId of candidateProviderIds) {
      attemptedProviders.push(providerId);

      // Verify registration
      if (!this.registry.has(providerId)) {
        if (criteria.requestedProviderId) {
          throw new AiProviderUnavailableError(
            providerId,
            `AI Provider '${providerId}' is not registered.`,
          );
        }
        continue;
      }

      const provider = this.registry.get(providerId);
      const meta = this.metadataStore.get(providerId) ?? {
        providerId,
        displayName: provider.name,
        isLocal: provider.type === 'LOCAL' || provider.type === 'EMULATED',
        priority: 50,
        enabled: true,
      };

      if (!meta.enabled) {
        continue;
      }

      // Enforce LOCAL_ONLY Privacy mode
      if (isLocalOnly && !meta.isLocal) {
        if (criteria.requestedProviderId) {
          throw new AiRemoteProviderBlockedError(providerId, privacySettings.privacyMode);
        }
        this.logger.warn('ai_provider_router.candidate_skipped_local_only', {
          providerId,
          projectId: criteria.projectId ?? null,
        });
        continue;
      }

      // Capability compatibility evaluation
      const caps = provider.getCapabilities();

      if (criteria.requiresStreaming && !caps.streaming) {
        if (criteria.requestedProviderId) {
          throw new AiCapabilityUnsupportedError(
            criteria.requestedModelId ?? 'default',
            'streaming' as ModelCapabilityType,
            `AI Provider '${providerId}' does not support streaming.`,
          );
        }
        continue;
      }

      // Model Resolution
      let targetModelId = criteria.requestedModelId;
      if (!targetModelId) {
        targetModelId = fallbackSettings.preferredModel ?? caps.defaultModel ?? 'default';
      }

      // Check model availability if provider supports listing models
      if (typeof provider.listModels === 'function' && criteria.requestedModelId) {
        try {
          const models = await provider.listModels();
          const match = models.find(
            (m) => m.id.toLowerCase() === criteria.requestedModelId?.toLowerCase(),
          );
          if (!match && models.length > 0) {
            if (criteria.requestedProviderId) {
              throw new AiModelUnavailableError(
                criteria.requestedModelId,
                providerId,
                `Model '${criteria.requestedModelId}' is not available on provider '${providerId}'.`,
              );
            }
            continue;
          }
        } catch (err) {
          if (err instanceof AiModelUnavailableError) throw err;
          // Ignore model listing probe failures on candidate selection
        }
      }

      // Selection successful
      const isFallback =
        providerId !== (criteria.requestedProviderId ?? fallbackSettings.preferredProvider).toUpperCase();

      this.logger.info('ai_provider_router.provider_selected', {
        providerId,
        modelId: targetModelId,
        isLocal: meta.isLocal,
        isFallback,
        projectId: criteria.projectId ?? null,
      });

      return {
        providerId,
        modelId: targetModelId,
        isLocal: meta.isLocal,
        isFallback,
        selectionReason: isFallback
          ? `Selected as fallback after checking providers [${attemptedProviders.join(', ')}]`
          : 'Selected matching preference and capability criteria',
        attemptedProviders,
      };
    }

    throw new AiProviderUnavailableError(
      criteria.requestedProviderId ?? 'UNKNOWN',
      `No eligible AI provider found matching request constraints. Attempted providers: [${attemptedProviders.join(', ')}]. Local-only active: ${isLocalOnly}.`,
    );
  }

  /**
   * Classifies an arbitrary error into a deterministic provider failure reason.
   * Explicitly avoids classifying user cancellations as provider failures.
   */
  public classifyFailure(err: unknown): AiProviderFailureReasonDto {
    if (
      err instanceof AiCancelledError ||
      (err instanceof Error && (err.name === 'AbortError' || err.message.includes('cancelled')))
    ) {
      return 'CANCELLED';
    }

    if (
      err instanceof AiRemoteProviderBlockedError ||
      err instanceof AiFallbackPolicyBlockedError ||
      err instanceof AiPrivacyViolationError
    ) {
      return 'POLICY_BLOCKED';
    }

    if (err instanceof AiTimeoutError) {
      return 'PROVIDER_TIMEOUT';
    }

    if (
      err instanceof AiCapabilityUnsupportedError ||
      err instanceof AiNoCompatibleModelError
    ) {
      return 'CAPABILITY_UNSUPPORTED';
    }

    if (
      err instanceof AiModelUnavailableError ||
      err instanceof AiModelNotFoundError
    ) {
      return 'MODEL_UNAVAILABLE';
    }

    if (
      err instanceof AiStructuredValidationError ||
      err instanceof AiStructuredParseError ||
      err instanceof AiStructuredMaxRetriesExceededError
    ) {
      return 'STRUCTURED_OUTPUT_FAILURE';
    }

    if (err instanceof AiInvalidResponseError) {
      return 'INVALID_RESPONSE';
    }

    if (err instanceof AiRateLimitError) {
      return 'RATE_LIMITED';
    }

    if (
      err instanceof Error &&
      (err.message.includes('auth') ||
        err.message.includes('unauthorized') ||
        err.message.includes('forbidden') ||
        err.message.includes('401') ||
        err.message.includes('403'))
    ) {
      return 'AUTHENTICATION_FAILURE';
    }

    if (
      err instanceof AiConnectionError ||
      err instanceof AiProviderUnavailableError ||
      err instanceof AiProviderError ||
      (err instanceof Error && (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')))
    ) {
      return 'PROVIDER_UNAVAILABLE';
    }

    return 'PROVIDER_UNAVAILABLE';
  }

  /**
   * Determines whether an error is transient and eligible for limited retry on the same provider.
   */
  public isRetryable(reason: AiProviderFailureReasonDto): boolean {
    switch (reason) {
      case 'PROVIDER_TIMEOUT':
      case 'PROVIDER_UNAVAILABLE':
      case 'RATE_LIMITED':
      case 'STREAM_INTERRUPTED':
        return true;
      case 'CANCELLED':
      case 'POLICY_BLOCKED':
      case 'AUTHENTICATION_FAILURE':
      case 'CAPABILITY_UNSUPPORTED':
      case 'MODEL_UNAVAILABLE':
      case 'INVALID_RESPONSE':
      case 'STRUCTURED_OUTPUT_FAILURE':
      default:
        return false;
    }
  }

  /**
   * Resolves whether fallback to another provider is permitted under current policy.
   */
  public canFallback(
    reason: AiProviderFailureReasonDto,
    policy: AiFallbackPolicyDto,
    privacyMode: string,
  ): boolean {
    // User cancellation or deliberate policy block NEVER triggers provider fallback
    if (reason === 'CANCELLED' || reason === 'POLICY_BLOCKED') {
      return false;
    }

    if (policy === 'DISABLED') {
      return false;
    }

    // In local only mode, fallback can only occur if there is another local provider
    return true;
  }

  /**
   * Executes an AI operation with full routing, transient retries, request continuity,
   * observability, and capability-aware fallback.
   */
  public async executeWithFallback<T>(
    options: ExecuteWithFallbackOptions<T>,
  ): Promise<ExecuteWithFallbackResult<T>> {
    const requestId = options.requestId ?? crypto.randomUUID();
    const tStart = performance.now();

    if (options.projectId && options.userId) {
      await this.assertProjectAccess(options.projectId, options.userId);
    }

    const fallbackSettings = await this.getFallbackSettings(
      { projectId: options.projectId },
      options.userId,
    );
    const privacySettings = await this.aiPrivacyService.getSettings(
      { projectId: options.projectId },
      options.userId,
    );
    const isLocalOnly = privacySettings.privacyMode === 'LOCAL_ONLY';

    const maxRetries = options.maxRetries ?? fallbackSettings.maxRetries;

    // Resolve primary provider
    const primarySelection = await this.selectProvider(
      {
        projectId: options.projectId,
        requestedProviderId: options.requestedProviderId,
        requestedModelId: options.requestedModelId,
        requiredCapabilities: options.requiredCapabilities,
        requiresStreaming: options.requiresStreaming,
        requiresStructuredOutput: options.requiresStructuredOutput,
        requiresToolCalling: options.requiresToolCalling,
        minContextTokens: options.minContextTokens,
      },
      options.userId,
    );

    // Resolve ordered candidate chain
    const candidateProviderIds: string[] = [primarySelection.providerId];

    if (fallbackSettings.fallbackPolicy !== 'DISABLED') {
      for (const p of fallbackSettings.fallbackPriority) {
        const upper = p.toUpperCase();
        if (!candidateProviderIds.includes(upper)) {
          candidateProviderIds.push(upper);
        }
      }
      for (const p of this.registry.list()) {
        const upper = p.id.toUpperCase();
        if (!candidateProviderIds.includes(upper)) {
          candidateProviderIds.push(upper);
        }
      }
    }

    const attemptHistory: AiFallbackAttemptDto[] = [];
    let lastError: unknown = null;

    this.logger.info('ai_provider_router.request_started', {
      requestId,
      primaryProvider: primarySelection.providerId,
      model: primarySelection.modelId,
      fallbackPolicy: fallbackSettings.fallbackPolicy,
      candidateCount: candidateProviderIds.length,
      projectId: options.projectId ?? null,
    });

    for (let pIdx = 0; pIdx < candidateProviderIds.length; pIdx++) {
      const providerId = candidateProviderIds[pIdx]!;

      // Check registration
      if (!this.registry.has(providerId)) {
        continue;
      }
      const provider = this.registry.get(providerId);
      const meta = this.metadataStore.get(providerId) ?? {
        providerId,
        displayName: provider.name,
        isLocal: provider.type === 'LOCAL' || provider.type === 'EMULATED',
        priority: 50,
        enabled: true,
      };

      if (!meta.enabled) continue;

      // Filter local-only
      if (isLocalOnly && !meta.isLocal) {
        this.logger.warn('ai_provider_router.fallback_skipped_local_only', {
          providerId,
          requestId,
        });
        continue;
      }

      // Check capabilities
      const caps = provider.getCapabilities();
      if (options.requiresStreaming && !caps.streaming) {
        continue;
      }

      // Determine model
      let candidateModel = options.requestedModelId ?? caps.defaultModel ?? 'default';
      if (providerId === primarySelection.providerId) {
        candidateModel = primarySelection.modelId;
      }

      const isFallback = providerId !== primarySelection.providerId;

      if (isFallback) {
        this.logger.info('ai_provider_router.fallback_selected', {
          requestId,
          originalProvider: primarySelection.providerId,
          fallbackProvider: providerId,
          attemptNumber: attemptHistory.length + 1,
        });

        if (options.userId) {
          await this.recordAuditLog(
            options.userId,
            'AI_PROVIDER_FALLBACK_TRIGGERED' as AuthAuditAction,
            {
              requestId,
              originalProvider: primarySelection.providerId,
              fallbackProvider: providerId,
              model: candidateModel,
            },
          );
        }
      }

      // Attempt execution on this provider with bounded retries
      let attemptOnProvider = 0;
      const maxAttemptsOnThisProvider = 1 + maxRetries;

      while (attemptOnProvider < maxAttemptsOnThisProvider) {
        attemptOnProvider++;
        const currentAttemptNumber = attemptHistory.length + 1;
        const attemptStart = performance.now();

        // Check external cancellation before dispatching
        if (options.signal?.aborted) {
          const attemptDuration = Math.round(performance.now() - attemptStart);
          attemptHistory.push({
            attemptNumber: currentAttemptNumber,
            providerId,
            modelId: candidateModel,
            timestamp: new Date().toISOString(),
            durationMs: attemptDuration,
            status: 'FAILED',
            failureReason: 'CANCELLED',
            errorMessage: 'Request cancelled by client.',
          });
          throw new AiCancelledError(providerId);
        }

        try {
          const result = await options.execute(
            provider,
            candidateModel,
            currentAttemptNumber,
            options.signal,
          );

          const attemptDuration = Math.round(performance.now() - attemptStart);
          attemptHistory.push({
            attemptNumber: currentAttemptNumber,
            providerId,
            modelId: candidateModel,
            timestamp: new Date().toISOString(),
            durationMs: attemptDuration,
            status: 'SUCCESS',
          });

          this.logger.info('ai_provider_router.request_completed', {
            requestId,
            providerId,
            modelId: candidateModel,
            fallbackApplied: isFallback,
            attemptCount: attemptHistory.length,
            durationMs: Math.round(performance.now() - tStart),
          });

          return {
            result,
            providerId,
            modelId: candidateModel,
            fallbackApplied: isFallback,
            attemptHistory,
            originalProviderId: primarySelection.providerId,
          };
        } catch (err) {
          lastError = err;
          const attemptDuration = Math.round(performance.now() - attemptStart);
          const reason = this.classifyFailure(err);
          const errorMsg = err instanceof Error ? err.message : String(err);

          // User cancellation aborts entire routing immediately
          if (reason === 'CANCELLED') {
            attemptHistory.push({
              attemptNumber: currentAttemptNumber,
              providerId,
              modelId: candidateModel,
              timestamp: new Date().toISOString(),
              durationMs: attemptDuration,
              status: 'FAILED',
              failureReason: 'CANCELLED',
              errorMessage: errorMsg,
            });
            this.logger.info('ai_provider_router.cancelled', {
              requestId,
              providerId,
              durationMs: attemptDuration,
            });
            throw new AiCancelledError(providerId);
          }

          // Policy blocked error aborts immediately without fallback
          if (reason === 'POLICY_BLOCKED') {
            attemptHistory.push({
              attemptNumber: currentAttemptNumber,
              providerId,
              modelId: candidateModel,
              timestamp: new Date().toISOString(),
              durationMs: attemptDuration,
              status: 'FAILED',
              failureReason: 'POLICY_BLOCKED',
              errorMessage: errorMsg,
            });
            throw err;
          }

          const canRetrySame =
            attemptOnProvider < maxAttemptsOnThisProvider && this.isRetryable(reason);

          attemptHistory.push({
            attemptNumber: currentAttemptNumber,
            providerId,
            modelId: candidateModel,
            timestamp: new Date().toISOString(),
            durationMs: attemptDuration,
            status: canRetrySame ? 'RETRYING' : 'FAILED',
            failureReason: reason,
            errorMessage: errorMsg,
          });

          this.logger.warn('ai_provider_router.attempt_failed', {
            requestId,
            providerId,
            attempt: currentAttemptNumber,
            reason,
            error: errorMsg,
            canRetrySame,
          });

          if (options.userId) {
            await this.recordAuditLog(
              options.userId,
              'AI_PROVIDER_ATTEMPT_FAILED' as AuthAuditAction,
              {
                requestId,
                providerId,
                attemptNumber: currentAttemptNumber,
                reason,
              },
            );
          }

          if (canRetrySame) {
            // Linear bounded backoff (50ms, 100ms, max 300ms)
            const backoffMs = Math.min(50 * attemptOnProvider, 300);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          } else {
            // Cannot retry on this provider; break to evaluate fallback
            break;
          }
        }
      }

      // Check if fallback is allowed after provider failure
      const lastReason = attemptHistory[attemptHistory.length - 1]?.failureReason ?? 'PROVIDER_UNAVAILABLE';
      if (!this.canFallback(lastReason, fallbackSettings.fallbackPolicy, privacySettings.privacyMode)) {
        if (fallbackSettings.fallbackPolicy === 'DISABLED') {
          throw new AiFallbackPolicyBlockedError(providerId, 'DISABLED');
        }
        throw lastError;
      }
    }

    // All eligible providers exhausted
    this.logger.error('ai_provider_router.fallback_exhausted', {
      requestId,
      attemptCount: attemptHistory.length,
      primaryProvider: primarySelection.providerId,
    });

    throw new AiFallbackExhaustedError(attemptHistory);
  }

  /**
   * Streams progressive chunks with safe provider switching before meaningful output,
   * clean interruption detection, and preservation of request history.
   */
  public async *streamWithFallback(
    options: StreamWithFallbackOptions,
  ): AsyncIterable<AiStreamEventDto> {
    const requestId = options.requestId ?? crypto.randomUUID();

    if (options.projectId && options.userId) {
      await this.assertProjectAccess(options.projectId, options.userId);
    }

    const fallbackSettings = await this.getFallbackSettings(
      { projectId: options.projectId },
      options.userId,
    );
    const privacySettings = await this.aiPrivacyService.getSettings(
      { projectId: options.projectId },
      options.userId,
    );
    const isLocalOnly = privacySettings.privacyMode === 'LOCAL_ONLY';

    const primarySelection = await this.selectProvider(
      {
        projectId: options.projectId,
        requestedProviderId: options.requestedProviderId,
        requestedModelId: options.requestedModelId,
        requiredCapabilities: options.requiredCapabilities,
        requiresStreaming: true,
        minContextTokens: options.minContextTokens,
      },
      options.userId,
    );

    const candidateProviderIds: string[] = [primarySelection.providerId];

    if (fallbackSettings.fallbackPolicy !== 'DISABLED') {
      for (const p of fallbackSettings.fallbackPriority) {
        const upper = p.toUpperCase();
        if (!candidateProviderIds.includes(upper)) {
          candidateProviderIds.push(upper);
        }
      }
      for (const p of this.registry.list()) {
        const upper = p.id.toUpperCase();
        if (!candidateProviderIds.includes(upper)) {
          candidateProviderIds.push(upper);
        }
      }
    }

    let globalSequence = 0;
    let fallbackTriggered = false;

    for (let pIdx = 0; pIdx < candidateProviderIds.length; pIdx++) {
      const providerId = candidateProviderIds[pIdx]!;

      if (!this.registry.has(providerId)) continue;
      const provider = this.registry.get(providerId);
      const meta = this.metadataStore.get(providerId) ?? {
        providerId,
        displayName: provider.name,
        isLocal: provider.type === 'LOCAL' || provider.type === 'EMULATED',
        priority: 50,
        enabled: true,
      };

      if (!meta.enabled) continue;
      if (isLocalOnly && !meta.isLocal) continue;

      const caps = provider.getCapabilities();
      if (!caps.streaming) continue;

      const candidateModel =
        providerId === primarySelection.providerId
          ? primarySelection.modelId
          : options.requestedModelId ?? caps.defaultModel ?? 'default';

      let accumulatedText = '';
      let chunksReceived = 0;
      let streamFailed = false;
      let streamError: unknown = null;

      try {
        const streamGenerator = options.stream(
          provider,
          candidateModel,
          pIdx + 1,
          options.signal,
        );

        for await (const event of streamGenerator) {
          if (event.type === 'DELTA') {
            chunksReceived++;
            accumulatedText += event.deltaText ?? '';
          }

          // Relay event with unified request sequence
          yield {
            ...event,
            sequence: globalSequence++,
            requestId,
          };
        }

        // Stream completed successfully
        return;
      } catch (err) {
        streamFailed = true;
        streamError = err;
      }

      if (streamFailed) {
        const reason = this.classifyFailure(streamError);

        // If client cancelled, immediately terminate without fallback
        if (reason === 'CANCELLED') {
          yield {
            requestId,
            sequence: globalSequence++,
            type: 'CANCELLED',
            done: true,
            content: accumulatedText,
            deltaText: '',
            accumulatedText,
            error: 'Stream cancelled by user.',
            model: candidateModel,
            provider: provider.id,
            durationMs: 0,
          };
          return;
        }

        // If output was already partially streamed to user:
        // DO NOT silently concatenate tokens from another provider!
        if (chunksReceived > 0 && accumulatedText.length > 0) {
          this.logger.warn('ai_provider_router.stream_interrupted_mid_generation', {
            requestId,
            providerId,
            accumulatedLength: accumulatedText.length,
            error: streamError instanceof Error ? streamError.message : String(streamError),
          });

          yield {
            requestId,
            sequence: globalSequence++,
            type: 'ERROR',
            done: true,
            content: accumulatedText,
            accumulatedText,
            error: `Stream interrupted after partial generation on provider '${providerId}'. Output was not concatenated with another model for integrity.`,
            model: candidateModel,
            provider: provider.id,
            durationMs: 0,
          };
          return;
        }

        // Failed BEFORE meaningful output: can safely fall back to next provider
        if (fallbackSettings.fallbackPolicy === 'DISABLED') {
          yield {
            requestId,
            sequence: globalSequence++,
            type: 'ERROR',
            done: true,
            content: '',
            accumulatedText: '',
            error: streamError instanceof Error ? streamError.message : String(streamError),
            model: candidateModel,
            provider: provider.id,
            durationMs: 0,
          };
          return;
        }

        fallbackTriggered = true;
        this.logger.info('ai_provider_router.stream_pre_output_fallback', {
          requestId,
          failedProvider: providerId,
          nextCandidateIndex: pIdx + 1,
        });
      }
    }

    // If all providers failed before emitting output
    yield {
      requestId,
      sequence: globalSequence++,
      type: 'ERROR',
      done: true,
      content: '',
      accumulatedText: '',
      error: 'All eligible AI providers failed before stream output could be generated.',
      model: 'unknown',
      provider: 'unknown',
      durationMs: 0,
    };
  }

  /**
   * Enforces multi-tenant project isolation.
   */
  private async assertProjectAccess(projectId: string, userId: string): Promise<void> {
    if (this.projectAccessAssertion) {
      await this.projectAccessAssertion(projectId, userId);
      return;
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true },
    });

    if (!project) {
      throw new AiInvalidRequestError(`Project with ID '${projectId}' was not found.`);
    }

    if (project.userId && project.userId !== userId) {
      this.logger.warn('ai_provider_router.cross_project_violation', {
        projectId,
        projectOwnerId: project.userId,
        requestUserId: userId,
      });
      throw new AiCrossProjectAccessError(
        `User '${userId}' does not have permission to access AI routing configuration for project '${projectId}'.`,
      );
    }
  }

  /**
   * Safely records audit log events without leaking prompts or secrets.
   */
  private async recordAuditLog(
    userId: string,
    action: AuthAuditAction,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.authAuditEvent.create({
        data: {
          userId,
          action,
          metadata: metadata as import('@prisma/client').Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.warn('ai_provider_router.audit_failed', {
        action,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
