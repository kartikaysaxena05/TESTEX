/**
 * @file packages/core/src/ai-provider/ai-provider-service.ts
 * Privileged business domain service for AI Provider Abstraction (V9 Phase 126).
 * Handles multi-tenant project isolation, configuration resolution/persistence,
 * normalized request dispatching, and audit event emission.
 */

import crypto from 'node:crypto';
import type { PrismaClient, AuthAuditAction } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import type {
  AiProviderDescriptorDto,
  AiProviderConfigDto,
  UpdateAiProviderConfigInput,
  NormalizedAiRequestDto,
  ValidateAiRequestInputDto,
  NormalizedAiResponseDto,
  AiStreamChunkDto,
  AiProviderStatusDto,
  OllamaStatusDto,
  OllamaHealthDiagnosticDto,
  OllamaConfigDto,
  SetOllamaConfigInputDto,
} from '@ai-quality/contracts';
import { AiProviderRegistry } from './ai-provider-registry.js';
import type { IAiProvider } from './ai-provider-contract.js';
import {
  AiInvalidRequestError,
  AiCrossProjectAccessError,
} from './ai-provider-errors.js';
import { AiProviderValidator } from './ai-provider-validator.js';
import { OllamaProviderAdapter } from './ollama-provider-adapter.js';
import { OllamaHealthService } from './ollama-health-service.js';
import { OllamaInstallationDetector } from './ollama-installation-detector.js';
import { ModelDiscoveryService } from './model-discovery-service.js';
import { getLogger, type ILogger } from '../logging/index.js';
import type {
  AiModelDto,
  AiModelListDto,
  ListAiModelsInputDto,
  RefreshAiModelsInputDto,
  GetAiModelInputDto,
  ModelCapabilitiesProfileDto,
  ModelSelectionResultDto,
  GetModelCapabilitiesInputDto,
  VerifyModelCapabilitiesInputDto,
  SelectModelInputDto,
  GetModelSelectionInputDto,
  ResolveModelForTaskInputDto,
  LocalGenerationRequestInputDto,
  LocalGenerationResultDto,
  LocalGenerationStatusDto,
  CancelGenerationInputDto,
  GetGenerationStatusInputDto,
  AiStreamEventDto,
  StructuredGenerationRequestInputDto,
  StructuredGenerationResultDto,
  ValidateStructuredInputDto,
  StructuredValidationResultDto,
  GetStructuredCapabilitiesInputDto,
  StructuredCapabilitiesDto,
  AiToolDefinitionDto,
  NormalizedAiToolCallDto,
  ValidatedAiToolCallResultDto,
  AiToolCapabilitiesDto,
  GenerateAiToolCallsInputDto,
  GenerateAiToolCallsResultDto,
  GetAiToolCapabilitiesInputDto,
  ListAiToolsInputDto,
  GetAiToolInputDto,
  ParseAiToolCallsInputDto,
  ValidateAiToolCallInputDto,
  ModelContextCapabilitiesDto,
  ContextBudgetDto,
  TokenEstimationResultDto,
  OptimizedContextSelectionResultDto,
  EstimateTokensInputDto,
  CalculateContextBudgetInputDto,
  OptimizeContextSelectionInputDto,
  GetModelContextCapabilitiesInputDto,
  AiPrivacySettingsDto,
  GetAiPrivacySettingsInputDto,
  UpdateAiPrivacySettingsInputDto,
  CheckAiContextFirewallInputDto,
  AiContextFirewallResultDto,
  AssembleRequirementTestContextInputDto,
  RequirementTestContextResultDto,
  AiProviderRegistryItemDto,
  AiFallbackSettingsDto,
  GetAiFallbackSettingsInputDto,
  UpdateAiFallbackSettingsInputDto,
  AiProviderSelectionCriteriaDto,
  AiProviderSelectionResultDto,
} from '@ai-quality/contracts';
import { CapabilityDetectionService } from './capability-detection-service.js';
import { ModelSelectionService } from './model-selection-service.js';
import { LocalGenerationRuntimeService } from './local-generation-runtime.js';
import { StructuredOutputService } from './structured-output-service.js';
import { StructuredOutputRegistry } from './structured-output-registry.js';
import { ToolCallingService } from './tool-calling-service.js';
import { AiToolRegistry } from './tool-registry.js';
import { ContextWindowManager } from './context-window-manager.js';
import { AiPrivacyService } from './ai-privacy-service.js';
import { RequirementTestContextAdapter } from './requirement-test-context-adapter.js';
import { AiProviderRouterService } from './ai-provider-router-service.js';
import { AiLifecycleManager } from './ai-lifecycle-manager.js';

export interface AiProviderServiceDependencies {
  prisma?: PrismaClient;
  registry?: AiProviderRegistry;
  logger?: ILogger;
  ollamaHealthService?: OllamaHealthService;
  modelDiscoveryService?: ModelDiscoveryService;
  capabilityDetectionService?: CapabilityDetectionService;
  modelSelectionService?: ModelSelectionService;
  localGenerationRuntime?: LocalGenerationRuntimeService;
  structuredOutputService?: StructuredOutputService;
  toolCallingService?: ToolCallingService;
  contextWindowManager?: ContextWindowManager;
  aiPrivacyService?: AiPrivacyService;
  requirementTestContextAdapter?: RequirementTestContextAdapter;
  aiProviderRouterService?: AiProviderRouterService;
  aiLifecycleManager?: AiLifecycleManager;
}

export class AiProviderService {
  private readonly prisma: PrismaClient;
  private readonly registry: AiProviderRegistry;
  private readonly logger: ILogger;
  private readonly ollamaHealthService: OllamaHealthService;
  private readonly modelDiscoveryService: ModelDiscoveryService;
  private readonly capabilityDetectionService: CapabilityDetectionService;
  private readonly modelSelectionService: ModelSelectionService;
  private readonly localGenerationRuntime: LocalGenerationRuntimeService;
  private readonly structuredOutputService: StructuredOutputService;
  private readonly toolCallingService: ToolCallingService;
  private readonly contextWindowManager: ContextWindowManager;
  private readonly aiPrivacyService: AiPrivacyService;
  private readonly requirementTestContextAdapter: RequirementTestContextAdapter;
  private readonly aiProviderRouterService: AiProviderRouterService;
  private readonly aiLifecycleManager: AiLifecycleManager;

  constructor(deps?: AiProviderServiceDependencies) {
    const client = deps?.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database connection is not configured or unavailable.');
    }
    this.prisma = client;
    this.registry = deps?.registry ?? AiProviderRegistry.createDefault();
    this.logger = deps?.logger ?? getLogger();
    this.aiPrivacyService =
      deps?.aiPrivacyService ??
      new AiPrivacyService({
        prisma: this.prisma,
        registry: this.registry,
        logger: this.logger,
      });
    this.ollamaHealthService = deps?.ollamaHealthService ?? new OllamaHealthService({ logger: this.logger });
    this.modelDiscoveryService = deps?.modelDiscoveryService ?? new ModelDiscoveryService({ logger: this.logger });
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
    this.aiLifecycleManager =
      deps?.aiLifecycleManager ??
      new AiLifecycleManager({
        prisma: this.prisma,
        logger: this.logger,
        assertProjectAccess: this.assertProjectAccess.bind(this),
      });
    this.localGenerationRuntime =
      deps?.localGenerationRuntime ??
      new LocalGenerationRuntimeService({
        prisma: this.prisma,
        registry: this.registry,
        modelDiscoveryService: this.modelDiscoveryService,
        capabilityDetectionService: this.capabilityDetectionService,
        modelSelectionService: this.modelSelectionService,
        aiPrivacyService: this.aiPrivacyService,
        aiLifecycleManager: this.aiLifecycleManager,
        logger: this.logger,
        assertProjectAccess: this.assertProjectAccess.bind(this),
      });
    this.structuredOutputService =
      deps?.structuredOutputService ??
      new StructuredOutputService({
        runtimeService: this.localGenerationRuntime,
        providerRegistry: this.registry,
        modelDiscoveryService: this.modelDiscoveryService,
        capabilityDetectionService: this.capabilityDetectionService,
        logger: this.logger,
      });
    this.toolCallingService =
      deps?.toolCallingService ??
      new ToolCallingService({
        runtimeService: this.localGenerationRuntime,
        providerRegistry: this.registry,
        modelDiscoveryService: this.modelDiscoveryService,
        capabilityDetectionService: this.capabilityDetectionService,
        logger: this.logger,
      });
    this.contextWindowManager =
      deps?.contextWindowManager ??
      new ContextWindowManager({
        modelDiscoveryService: this.modelDiscoveryService,
        capabilityDetectionService: this.capabilityDetectionService,
        providerRegistry: this.registry,
        logger: this.logger,
      });
    this.requirementTestContextAdapter =
      deps?.requirementTestContextAdapter ??
      new RequirementTestContextAdapter({
        prisma: this.prisma,
        aiPrivacyService: this.aiPrivacyService,
        logger: this.logger,
      });
    this.aiProviderRouterService =
      deps?.aiProviderRouterService ??
      new AiProviderRouterService({
        prisma: this.prisma,
        registry: this.registry,
        aiPrivacyService: this.aiPrivacyService,
        modelDiscoveryService: this.modelDiscoveryService,
        capabilityDetectionService: this.capabilityDetectionService,
        modelSelectionService: this.modelSelectionService,
        logger: this.logger,
        assertProjectAccess: this.assertProjectAccess.bind(this),
      });
  }

  /**
   * Returns the underlying provider registry.
   */
  public getRegistry(): AiProviderRegistry {
    return this.registry;
  }

  /**
   * Lists safe descriptors for all registered AI providers.
   * Merges persisted configuration if projectId/userId is provided.
   */
  public async listProviders(
    projectId?: string | null,
    userId?: string,
  ): Promise<readonly AiProviderDescriptorDto[]> {
    if (projectId && userId) {
      await this.assertProjectAccess(projectId, userId);
    }

    const providers = this.registry.list();
    const descriptors: AiProviderDescriptorDto[] = [];

    for (const provider of providers) {
      const config = await this.getConfig(provider.id, projectId, userId);
      descriptors.push({
        providerId: provider.id,
        providerName: provider.name,
        providerType: provider.type,
        status: config.enabled ? 'AVAILABLE' : 'UNCONFIGURED',
        capabilities: provider.getCapabilities(),
        configuration: {
          enabled: config.enabled,
          baseUrl: config.baseUrl,
          defaultModel: config.defaultModel,
          requestTimeoutMs: config.requestTimeoutMs,
          streamingEnabled: config.streamingEnabled,
        },
      });
    }

    return descriptors;
  }

  /**
   * Resolves safe descriptor for a specific registered AI provider.
   */
  public async getProvider(
    providerId: string,
    projectId?: string | null,
    userId?: string,
  ): Promise<AiProviderDescriptorDto> {
    const validatedId = AiProviderValidator.validateProviderId(providerId);
    const provider = this.registry.get(validatedId);

    if (projectId && userId) {
      await this.assertProjectAccess(projectId, userId);
    }

    const config = await this.getConfig(validatedId, projectId, userId);
    return {
      providerId: provider.id,
      providerName: provider.name,
      providerType: provider.type,
      status: config.enabled ? 'AVAILABLE' : 'UNCONFIGURED',
      capabilities: provider.getCapabilities(),
      configuration: {
        enabled: config.enabled,
        baseUrl: config.baseUrl,
        defaultModel: config.defaultModel,
        requestTimeoutMs: config.requestTimeoutMs,
        streamingEnabled: config.streamingEnabled,
      },
    };
  }

  /**
   * Retrieves active provider configuration from the database, falling back to defaults.
   */
  public async getConfig(
    providerId: string,
    projectId?: string | null,
    userId?: string,
  ): Promise<AiProviderConfigDto> {
    const validatedId = AiProviderValidator.validateProviderId(providerId);

    if (projectId && userId) {
      await this.assertProjectAccess(projectId, userId);
    }

    let record = null;
    if (projectId) {
      record = await this.prisma.aiProviderConfig.findFirst({
        where: {
          providerId: validatedId,
          projectId,
        },
      });
    }

    // Fallback to user-level or global default record if project-level not found
    if (!record && userId) {
      record = await this.prisma.aiProviderConfig.findFirst({
        where: {
          providerId: validatedId,
          userId,
          projectId: null,
        },
      });
    }

    if (record) {
      return {
        id: record.id,
        projectId: record.projectId,
        providerId: record.providerId,
        enabled: record.enabled,
        baseUrl: record.baseUrl,
        defaultModel: record.defaultModel,
        requestTimeoutMs: record.requestTimeoutMs,
        streamingEnabled: record.streamingEnabled,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      };
    }

    // Fallback to registered provider adapter config if available
    if (this.registry.has(validatedId)) {
      const provider = this.registry.get(validatedId) as unknown as {
        getConfig?: () => {
          enabled?: boolean;
          baseUrl?: string;
          defaultModel?: string;
          requestTimeoutMs?: number;
          streamingEnabled?: boolean;
        };
      };
      if (typeof provider.getConfig === 'function') {
        const adapterConfig = provider.getConfig();
        return {
          providerId: validatedId,
          projectId: projectId ?? null,
          enabled: adapterConfig.enabled ?? true,
          baseUrl: adapterConfig.baseUrl ?? 'http://127.0.0.1:11434',
          defaultModel: adapterConfig.defaultModel ?? 'llama3',
          requestTimeoutMs: adapterConfig.requestTimeoutMs ?? 60_000,
          streamingEnabled: adapterConfig.streamingEnabled ?? true,
        };
      }
    }

    // Built-in safe defaults
    const isOllama = validatedId === 'OLLAMA';
    return {
      providerId: validatedId,
      projectId: projectId ?? null,
      enabled: true,
      baseUrl: isOllama ? 'http://127.0.0.1:11434' : 'http://localhost:8000',
      defaultModel: isOllama ? 'llama3' : 'default-model',
      requestTimeoutMs: 60_000,
      streamingEnabled: true,
    };
  }

  /**
   * Updates and persists AI provider configuration with multi-tenant isolation and SSRF protection.
   */
  public async updateConfig(
    input: UpdateAiProviderConfigInput,
    userId: string,
  ): Promise<AiProviderConfigDto> {
    const validatedId = AiProviderValidator.validateProviderId(input.providerId);

    if (input.projectId) {
      AiProviderValidator.validateUuid(input.projectId, 'Project ID');
      await this.assertProjectAccess(input.projectId, userId);
    }

    if (input.baseUrl) {
      AiProviderValidator.validateBaseUrl(input.baseUrl, validatedId);
    }

    if (input.defaultModel) {
      AiProviderValidator.validateModelIdentifier(input.defaultModel, validatedId);
    }

    if (input.requestTimeoutMs !== undefined) {
      AiProviderValidator.validateParameters({ timeoutMs: input.requestTimeoutMs }, validatedId);
    }

    const currentConfig = await this.getConfig(validatedId, input.projectId, userId);

    const updatedData = {
      enabled: input.enabled !== undefined ? input.enabled : currentConfig.enabled,
      baseUrl: input.baseUrl ? AiProviderValidator.validateBaseUrl(input.baseUrl, validatedId) : currentConfig.baseUrl,
      defaultModel: input.defaultModel
        ? AiProviderValidator.validateModelIdentifier(input.defaultModel, validatedId)
        : currentConfig.defaultModel,
      requestTimeoutMs:
        input.requestTimeoutMs !== undefined ? input.requestTimeoutMs : currentConfig.requestTimeoutMs,
      streamingEnabled:
        input.streamingEnabled !== undefined ? input.streamingEnabled : currentConfig.streamingEnabled,
    };

    // Upsert into database
    let saved;
    if (input.projectId) {
      saved = await this.prisma.aiProviderConfig.upsert({
        where: {
          projectId_providerId: {
            projectId: input.projectId,
            providerId: validatedId,
          },
        },
        create: {
          projectId: input.projectId,
          userId,
          providerId: validatedId,
          ...updatedData,
        },
        update: {
          ...updatedData,
        },
      });
    } else {
      saved = await this.prisma.aiProviderConfig.create({
        data: {
          projectId: null,
          userId,
          providerId: validatedId,
          ...updatedData,
        },
      });
    }

    // Sync in-memory adapter if it's the registered Ollama adapter and this is a global configuration update
    if (!input.projectId && validatedId === 'OLLAMA' && this.registry.has('OLLAMA')) {
      const adapter = this.registry.get('OLLAMA');
      if (adapter instanceof OllamaProviderAdapter) {
        adapter.updateConfig({
          baseUrl: updatedData.baseUrl,
          defaultModel: updatedData.defaultModel,
          requestTimeoutMs: updatedData.requestTimeoutMs,
          streamingEnabled: updatedData.streamingEnabled,
        });
      }
    }

    // Authoritative audit trail logging
    await this.recordAuditLog(userId, 'AI_PROVIDER_CONFIG_UPDATED', {
      projectId: input.projectId ?? null,
      providerId: validatedId,
      enabled: saved.enabled,
      baseUrl: saved.baseUrl,
      defaultModel: saved.defaultModel,
      requestTimeoutMs: saved.requestTimeoutMs,
      streamingEnabled: saved.streamingEnabled,
    });

    this.logger.info('ai_provider.config_updated', {
      userId,
      projectId: input.projectId,
      providerId: validatedId,
    });

    return {
      id: saved.id,
      projectId: saved.projectId,
      providerId: saved.providerId,
      enabled: saved.enabled,
      baseUrl: saved.baseUrl,
      defaultModel: saved.defaultModel,
      requestTimeoutMs: saved.requestTimeoutMs,
      streamingEnabled: saved.streamingEnabled,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  /**
   * Validates and normalizes an incoming AI request payload.
   */
  public async validateRequest(
    input: ValidateAiRequestInputDto,
    userId?: string,
  ): Promise<NormalizedAiRequestDto> {
    const projectId = AiProviderValidator.validateUuid(input.projectId, 'Project ID');
    if (userId) {
      await this.assertProjectAccess(projectId, userId);
    }

    const requestId = input.requestId
      ? AiProviderValidator.validateUuid(input.requestId, 'Request ID')
      : crypto.randomUUID();

    const providerId = input.providerId
      ? AiProviderValidator.validateProviderId(input.providerId)
      : 'OLLAMA';

    const provider = this.registry.get(providerId);
    const config = await this.getConfig(providerId, projectId, userId);

    if (!config.enabled) {
      throw new AiInvalidRequestError(
        `AI Provider '${providerId}' is currently disabled in project configuration.`,
        providerId,
      );
    }

    const model = input.model
      ? AiProviderValidator.validateModelIdentifier(input.model, providerId)
      : config.defaultModel;

    const prompt = AiProviderValidator.validatePrompt(input.prompt, providerId);
    const systemPrompt = AiProviderValidator.validateSystemPrompt(input.systemPrompt, providerId);
    const parameters = AiProviderValidator.validateParameters(input.parameters, providerId);

    return {
      requestId,
      projectId,
      providerId: provider.id,
      model,
      systemPrompt,
      prompt,
      context: input.context,
      parameters: {
        timeoutMs: config.requestTimeoutMs,
        ...parameters,
      },
      outputFormat: input.outputFormat,
      metadata: input.metadata,
    };
  }

  /**
   * Primary entry point for AI text generation.
   */
  public async generate(
    request: NormalizedAiRequestDto,
    userId?: string,
    signal?: AbortSignal,
  ): Promise<NormalizedAiResponseDto> {
    AiProviderValidator.validateUuid(request.projectId, 'Project ID');
    if (userId) {
      await this.assertProjectAccess(request.projectId, userId);
    }

    // Privacy policy and context firewall enforcement
    await this.aiPrivacyService.assertProviderAllowed(request.providerId, request.projectId, userId);
    const firewall = await this.aiPrivacyService.checkFirewall(
      {
        projectId: request.projectId,
        providerId: request.providerId,
        prompt: request.prompt,
        systemPrompt: request.systemPrompt,
      },
      userId,
    );

    const provider = this.registry.get(request.providerId);
    const sanitizedRequest: NormalizedAiRequestDto = {
      ...request,
      prompt: firewall.sanitizedPrompt,
      systemPrompt: firewall.sanitizedSystemPrompt ?? undefined,
    };
    return provider.generate(sanitizedRequest, signal);
  }

  /**
   * Primary entry point for streaming AI text generation.
   */
  public async *stream(
    request: NormalizedAiRequestDto,
    userId?: string,
    signal?: AbortSignal,
  ): AsyncIterable<AiStreamChunkDto> {
    AiProviderValidator.validateUuid(request.projectId, 'Project ID');
    if (userId) {
      await this.assertProjectAccess(request.projectId, userId);
    }

    // Privacy policy and context firewall enforcement
    await this.aiPrivacyService.assertProviderAllowed(request.providerId, request.projectId, userId);
    const firewall = await this.aiPrivacyService.checkFirewall(
      {
        projectId: request.projectId,
        providerId: request.providerId,
        prompt: request.prompt,
        systemPrompt: request.systemPrompt,
      },
      userId,
    );

    const provider = this.registry.get(request.providerId);
    const sanitizedRequest: NormalizedAiRequestDto = {
      ...request,
      prompt: firewall.sanitizedPrompt,
      systemPrompt: firewall.sanitizedSystemPrompt ?? undefined,
    };
    yield* provider.stream(sanitizedRequest, signal);
  }

  /**
   * Cancels an active in-flight request by ID.
   */
  public async cancel(requestId: string): Promise<boolean> {
    AiProviderValidator.validateUuid(requestId, 'Request ID');
    let cancelledAny = false;

    for (const provider of this.registry.list()) {
      const wasCancelled = await provider.cancel(requestId);
      if (wasCancelled) {
        cancelledAny = true;
      }
    }

    return cancelledAny;
  }

  /**
   * Runs an active health check on a specific registered provider.
   */
  public async healthCheck(providerId: string, signal?: AbortSignal): Promise<AiProviderStatusDto> {
    const validatedId = AiProviderValidator.validateProviderId(providerId);
    const provider = this.registry.get(validatedId);
    return provider.healthCheck(signal);
  }

  /**
   * Retrieves comprehensive Ollama provider status including health diagnostic and installation detection (Phase 127).
   */
  public async getOllamaStatus(
    projectId?: string | null,
    userId?: string,
  ): Promise<OllamaStatusDto> {
    if (projectId && userId) {
      await this.assertProjectAccess(projectId, userId);
    }

    const config = await this.getConfig('OLLAMA', projectId, userId);
    const health = await this.ollamaHealthService.checkHealth({
      endpoint: config.baseUrl,
      timeoutMs: config.requestTimeoutMs,
      enabled: config.enabled,
    });

    const isConnected = health.state === 'AVAILABLE';
    const installation = OllamaInstallationDetector.detect(config.baseUrl, isConnected);

    return {
      provider: 'OLLAMA',
      enabled: config.enabled,
      endpoint: config.baseUrl,
      connectionTimeout: config.requestTimeoutMs,
      health,
      installation: {
        state: installation.state,
        detectedPath: installation.detectedPath,
        isCustomEndpoint: installation.isCustomEndpoint,
      },
      isConnected,
      lastCheckedAt: health.checkedAt,
    };
  }

  /**
   * Performs an on-demand health check against Ollama (Phase 127).
   */
  public async healthCheckOllama(
    options?: { projectId?: string | null; endpoint?: string; timeoutMs?: number },
    userId?: string,
    signal?: AbortSignal,
  ): Promise<OllamaHealthDiagnosticDto> {
    if (options?.projectId && userId) {
      await this.assertProjectAccess(options.projectId, userId);
    }

    let targetEndpoint = options?.endpoint;
    let targetTimeout = options?.timeoutMs;
    let targetEnabled = true;

    if (!targetEndpoint) {
      const config = await this.getConfig('OLLAMA', options?.projectId, userId);
      targetEndpoint = config.baseUrl;
      targetTimeout = targetTimeout ?? config.requestTimeoutMs;
      targetEnabled = config.enabled;
    }

    return this.ollamaHealthService.checkHealth({
      endpoint: targetEndpoint,
      timeoutMs: targetTimeout,
      enabled: targetEnabled,
      signal,
    });
  }

  /**
   * Retrieves Ollama configuration for a project or global defaults (Phase 127).
   */
  public async getOllamaConfig(
    projectId?: string | null,
    userId?: string,
  ): Promise<OllamaConfigDto> {
    if (projectId && userId) {
      await this.assertProjectAccess(projectId, userId);
    }

    const config = await this.getConfig('OLLAMA', projectId, userId);

    let isProjectSpecific = false;
    if (projectId) {
      const record = await this.prisma.aiProviderConfig.findFirst({
        where: { providerId: 'OLLAMA', projectId },
      });
      isProjectSpecific = Boolean(record);
    }

    return {
      provider: 'OLLAMA',
      enabled: config.enabled,
      endpoint: config.baseUrl,
      connectionTimeout: config.requestTimeoutMs,
      projectId: config.projectId,
      isProjectSpecific,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  /**
   * Updates Ollama provider configuration with tenant isolation and audit logging (Phase 127).
   */
  public async setOllamaConfig(
    input: SetOllamaConfigInputDto,
    userId: string,
  ): Promise<OllamaConfigDto> {
    if (input.projectId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    if (input.endpoint) {
      AiProviderValidator.validateBaseUrl(input.endpoint, 'OLLAMA');
      const sanitized = OllamaHealthService.sanitizeEndpoint(input.endpoint);
      this.logger.info('ai_ollama.endpoint_changed', {
        userId,
        projectId: input.projectId ?? null,
        endpoint: sanitized,
      });
    }

    if (input.enabled !== undefined) {
      this.logger.info(input.enabled ? 'ai_ollama.provider_enabled' : 'ai_ollama.provider_disabled', {
        userId,
        projectId: input.projectId ?? null,
      });
    }

    const updated = await this.updateConfig(
      {
        providerId: 'OLLAMA',
        projectId: input.projectId,
        enabled: input.enabled,
        baseUrl: input.endpoint,
        requestTimeoutMs: input.connectionTimeout,
      },
      userId,
    );

    return {
      provider: 'OLLAMA',
      enabled: updated.enabled,
      endpoint: updated.baseUrl,
      connectionTimeout: updated.requestTimeoutMs,
      projectId: updated.projectId,
      isProjectSpecific: Boolean(input.projectId),
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Discovers and lists all installed AI models from the configured provider (Phase 128).
   * Transparently resolves project/user endpoint configuration and uses controlled TTL caching.
   */
  public async listAiModels(
    input?: ListAiModelsInputDto,
    userId?: string,
    signal?: AbortSignal,
  ): Promise<AiModelListDto> {
    const providerId = (input?.providerId ?? 'OLLAMA').toUpperCase();

    if (input?.projectId && userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    // Retrieve active provider configuration
    const config = await this.getConfig(providerId, input?.projectId, userId);

    if (!config.enabled) {
      return {
        provider: providerId,
        models: [],
        total: 0,
        refreshedAt: new Date().toISOString(),
        fromCache: false,
        endpoint: config.baseUrl ? OllamaHealthService.sanitizeEndpoint(config.baseUrl) : undefined,
      };
    }

    // For OLLAMA (and any HTTP-based endpoint), discover models via modelDiscoveryService using the configured endpoint
    if (
      providerId === 'OLLAMA' ||
      config.baseUrl.startsWith('http://') ||
      config.baseUrl.startsWith('https://')
    ) {
      return this.modelDiscoveryService.listModels(config.baseUrl, {
        timeoutMs: config.requestTimeoutMs,
        forceRefresh: input?.forceRefresh ?? false,
        providerId,
        signal,
      });
    }

    // Otherwise, if registered adapter implements listModels, use it
    if (this.registry.has(providerId)) {
      const adapter = this.registry.get(providerId);
      if (typeof adapter.listModels === 'function') {
        const models = await adapter.listModels(signal);
        return {
          provider: providerId,
          models,
          total: models.length,
          refreshedAt: new Date().toISOString(),
          fromCache: false,
          endpoint: config.baseUrl
            ? OllamaHealthService.sanitizeEndpoint(config.baseUrl)
            : undefined,
        };
      }
    }

    return this.modelDiscoveryService.listModels(config.baseUrl, {
      timeoutMs: config.requestTimeoutMs,
      forceRefresh: input?.forceRefresh ?? false,
      providerId,
      signal,
    });
  }

  /**
   * Performs an on-demand refresh of installed AI models, bypassing the TTL cache (Phase 128).
   */
  public async refreshAiModels(
    input?: RefreshAiModelsInputDto,
    userId?: string,
    signal?: AbortSignal,
  ): Promise<AiModelListDto> {
    return this.listAiModels(
      {
        projectId: input?.projectId,
        providerId: input?.providerId,
        forceRefresh: true,
      },
      userId,
      signal,
    );
  }

  /**
   * Retrieves detailed normalized metadata for a specific model (Phase 128).
   */
  public async getAiModel(
    input: GetAiModelInputDto,
    userId?: string,
    signal?: AbortSignal,
  ): Promise<AiModelDto> {
    const providerId = (input.providerId ?? 'OLLAMA').toUpperCase();

    if (input.projectId && userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    const config = await this.getConfig(providerId, input.projectId, userId);

    return this.modelDiscoveryService.getModel(config.baseUrl, input.modelId, {
      timeoutMs: config.requestTimeoutMs,
      providerId,
      signal,
    });
  }

  /**
   * Retrieves the normalized capability profile for an installed AI model (Phase 129).
   */
  public async getModelCapabilities(
    input: GetModelCapabilitiesInputDto,
    userId?: string,
    signal?: AbortSignal,
  ): Promise<ModelCapabilitiesProfileDto> {
    const model = await this.getAiModel(input, userId, signal);
    return this.capabilityDetectionService.getCapabilityProfile(model);
  }

  /**
   * Verifies capabilities of an installed AI model via safe, bounded probes (Phase 129).
   */
  public async verifyModelCapabilities(
    input: VerifyModelCapabilitiesInputDto,
    userId?: string,
    signal?: AbortSignal,
  ): Promise<ModelCapabilitiesProfileDto> {
    const providerId = (input.providerId ?? 'OLLAMA').toUpperCase();
    const model = await this.getAiModel(input, userId, signal);
    const provider = this.registry.get(providerId);

    const verified = await this.capabilityDetectionService.verifyModelCapabilities(
      model,
      {
        provider,
        capabilities: input.capabilities,
        timeoutMs: input.timeoutMs,
        signal,
      },
    );

    if (userId) {
      await this.recordAuditLog(userId, 'AI_MODEL_CAPABILITY_VERIFIED', {
        projectId: input.projectId ?? null,
        providerId,
        modelId: model.id,
        capabilities: input.capabilities,
      });
    }

    return verified;
  }

  /**
   * Persists a user's model selection choice for a specific project and task type (Phase 129).
   */
  public async selectModel(
    input: SelectModelInputDto,
    userId: string,
  ): Promise<ModelSelectionResultDto> {
    const listResult = await this.listAiModels(
      { projectId: input.projectId, providerId: input.providerId },
      userId,
    );
    const result = await this.modelSelectionService.selectModel(
      input,
      listResult.models,
      userId,
    );

    await this.recordAuditLog(userId, 'AI_MODEL_SELECTED', {
      projectId: input.projectId ?? null,
      providerId: result.provider,
      modelId: result.selectedModel.id,
      selectionType: result.selectionType,
    });

    return result;
  }

  /**
   * Retrieves an active persistent model selection for a project (Phase 129).
   */
  public async getModelSelection(
    input: GetModelSelectionInputDto,
    userId?: string,
  ): Promise<ModelSelectionResultDto | null> {
    const listResult = await this.listAiModels({ projectId: input.projectId }, userId);
    return this.modelSelectionService.getModelSelection(input, listResult.models, userId);
  }

  /**
   * Resolves the optimal AI model for a given task based on verified capabilities and constraints (Phase 129).
   */
  public async resolveModelForTask(
    input: ResolveModelForTaskInputDto,
    userId?: string,
  ): Promise<ModelSelectionResultDto> {
    const listResult = await this.listAiModels({ projectId: input.projectId }, userId);
    return this.modelSelectionService.resolveModelForTask(
      input,
      listResult.models,
      userId,
    );
  }

  /**
   * Generates AI responses using the production-ready local model runtime (Phase 130).
   */
  public async generateLocal(
    input: LocalGenerationRequestInputDto,
    userId?: string,
    signal?: AbortSignal,
  ): Promise<LocalGenerationResultDto> {
    return this.localGenerationRuntime.generate(input, userId, signal);
  }

  /**
   * Streams progressive AI response chunks using local model runtime (Phase 131).
   */
  public streamLocal(
    input: LocalGenerationRequestInputDto,
    userId?: string,
    signal?: AbortSignal,
  ): AsyncIterable<AiStreamEventDto> {
    return this.localGenerationRuntime.generateStream(input, userId, signal);
  }

  /**
   * Cancels an in-flight local generation request by ID (Phase 130).
   */
  public async cancelLocalGeneration(
    input: CancelGenerationInputDto,
    _userId?: string,
  ): Promise<{ readonly cancelled: boolean; readonly requestId: string }> {
    const cancelled = await this.localGenerationRuntime.cancel(input.requestId);
    return { cancelled, requestId: input.requestId };
  }

  /**
   * Retrieves deterministic lifecycle status for a local generation request (Phase 130).
   */
  public getLocalGenerationStatus(
    input: GetGenerationStatusInputDto,
  ): LocalGenerationStatusDto {
    return this.localGenerationRuntime.getStatus(input.requestId);
  }

  /**
   * Generates validated structured output matching a registered schema (Phase 132).
   */
  public async generateStructured(
    input: StructuredGenerationRequestInputDto,
    userId?: string,
    signal?: AbortSignal,
  ): Promise<StructuredGenerationResultDto> {
    if (input.projectId && userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }
    return this.structuredOutputService.generateStructured(input, userId, signal);
  }

  /**
   * Validates raw text against a registered schema without generating (Phase 132).
   */
  public validateStructured(
    input: ValidateStructuredInputDto,
  ): StructuredValidationResultDto {
    return this.structuredOutputService.validateStructured(input);
  }

  /**
   * Discovers structured output capabilities for a provider/model pair (Phase 132).
   */
  public async getStructuredCapabilities(
    input?: GetStructuredCapabilitiesInputDto,
  ): Promise<StructuredCapabilitiesDto> {
    return this.structuredOutputService.getStructuredCapabilities(input);
  }

  /**
   * Returns the underlying AI tool registry (Phase 133).
   */
  public getToolRegistry(): AiToolRegistry {
    return this.toolCallingService.getToolRegistry();
  }

  /**
   * Lists available tools in the registry for a given project scope (Phase 133).
   */
  public async listTools(
    input?: ListAiToolsInputDto,
    userId?: string,
  ): Promise<readonly AiToolDefinitionDto[]> {
    if (input?.projectId && userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }
    return this.toolCallingService.listTools(input);
  }

  /**
   * Retrieves a single tool definition (Phase 133).
   */
  public async getTool(
    input: GetAiToolInputDto,
    userId?: string,
  ): Promise<AiToolDefinitionDto | null> {
    if (input.projectId && userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }
    return this.toolCallingService.getTool(input);
  }

  /**
   * Parses raw model text into normalized tool calls without validating arguments (Phase 133).
   */
  public parseToolCalls(
    input: ParseAiToolCallsInputDto,
  ): readonly NormalizedAiToolCallDto[] {
    return this.toolCallingService.parseToolCalls(input);
  }

  /**
   * Validates a tool call against the registry (Phase 133).
   */
  public async validateToolCall(
    input: ValidateAiToolCallInputDto,
    userId?: string,
  ): Promise<ValidatedAiToolCallResultDto> {
    if (input.projectId && userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }
    return this.toolCallingService.validateToolCall(input);
  }

  /**
   * Generates and validates tool calls with model interaction (Phase 133).
   */
  public async generateToolCalls(
    input: GenerateAiToolCallsInputDto,
    userId?: string,
    signal?: AbortSignal,
  ): Promise<GenerateAiToolCallsResultDto> {
    if (input.projectId && userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }
    return this.toolCallingService.generateToolCalls(input, userId, signal);
  }

  /**
   * Discovers tool-calling capabilities of a provider/model pair (Phase 133).
   */
  public async getToolCapabilities(
    input?: GetAiToolCapabilitiesInputDto,
  ): Promise<AiToolCapabilitiesDto> {
    return this.toolCallingService.getToolCapabilities(input);
  }

  /**
   * Estimates tokens for text or context items (Phase 134).
   */
  public estimateTokens(input: EstimateTokensInputDto): TokenEstimationResultDto {
    return this.contextWindowManager.estimateTokens(input);
  }

  /**
   * Calculates context budget for a given model (Phase 134).
   */
  public async calculateContextBudget(
    input: CalculateContextBudgetInputDto,
  ): Promise<ContextBudgetDto> {
    return this.contextWindowManager.calculateBudget(input);
  }

  /**
   * Optimizes, prioritizes, and bounds context items against available token budget (Phase 134).
   */
  public async optimizeContextSelection(
    input: OptimizeContextSelectionInputDto,
    userId?: string,
  ): Promise<OptimizedContextSelectionResultDto> {
    if (input.projectId && userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }
    return this.contextWindowManager.optimizeContextSelection(input);
  }

  /**
   * Resolves model context capabilities (Phase 134).
   */
  public async getModelContextCapabilities(
    input: GetModelContextCapabilitiesInputDto,
  ): Promise<ModelContextCapabilitiesDto> {
    return this.contextWindowManager.getModelContextCapabilities(input);
  }

  /**
   * Retrieves effective privacy settings for a project or global default (Phase 137).
   */
  public async getPrivacySettings(
    input?: GetAiPrivacySettingsInputDto,
    userId?: string,
  ): Promise<AiPrivacySettingsDto> {
    return this.aiPrivacyService.getSettings(input, userId);
  }

  /**
   * Updates AI privacy settings with multi-tenant isolation (Phase 137).
   */
  public async updatePrivacySettings(
    input: UpdateAiPrivacySettingsInputDto,
    userId: string,
  ): Promise<AiPrivacySettingsDto> {
    return this.aiPrivacyService.updateSettings(input, userId);
  }

  /**
   * Validates and sanitizes prompt and context against AI Context Firewall (Phase 137).
   */
  public async checkContextFirewall(
    input: CheckAiContextFirewallInputDto,
    userId?: string,
  ): Promise<AiContextFirewallResultDto> {
    return this.aiPrivacyService.checkFirewall(input, userId);
  }

  /**
   * Assembles, sanitizes, formats, and token-bounds requirement and test context (Phase 136).
   */
  public async assembleRequirementTestContext(
    input: AssembleRequirementTestContextInputDto,
    userId?: string,
  ): Promise<RequirementTestContextResultDto> {
    return this.requirementTestContextAdapter.assembleContext(input, userId);
  }

  // ============================================================================
  // Phase 138: AI Provider Switching & Fallback Methods
  // ============================================================================

  /**
   * Retrieves fallback policy and routing preferences for a project.
   */
  public async getFallbackSettings(
    input?: GetAiFallbackSettingsInputDto,
    userId?: string,
  ): Promise<AiFallbackSettingsDto> {
    return this.aiProviderRouterService.getFallbackSettings(input, userId);
  }

  /**
   * Updates fallback policy and routing preferences for a project.
   */
  public async updateFallbackSettings(
    input: UpdateAiFallbackSettingsInputDto,
    userId?: string,
  ): Promise<AiFallbackSettingsDto> {
    return this.aiProviderRouterService.updateFallbackSettings(input, userId);
  }

  /**
   * Lists all registered providers with live availability, capabilities, models, and priority.
   */
  public async listRegisteredProviders(
    projectId?: string | null,
    userId?: string,
  ): Promise<readonly AiProviderRegistryItemDto[]> {
    return this.aiProviderRouterService.listProviders(projectId, userId);
  }

  /**
   * Retrieves status for a specific registered provider.
   */
  public async getRegisteredProviderStatus(
    providerId: string,
    projectId?: string | null,
    userId?: string,
  ): Promise<AiProviderRegistryItemDto> {
    return this.aiProviderRouterService.getProviderStatus(providerId, projectId, userId);
  }

  /**
   * Selects an AI provider and model deterministically based on criteria and privacy policy.
   */
  public async selectProvider(
    criteria: AiProviderSelectionCriteriaDto,
    userId?: string,
  ): Promise<AiProviderSelectionResultDto> {
    return this.aiProviderRouterService.selectProvider(criteria, userId);
  }

  /**
  * Exposes the underlying router service instance.
  */
  public getRouterService(): AiProviderRouterService {
    return this.aiProviderRouterService;
  }

  /**
   * Exposes the underlying lifecycle and recovery manager instance.
   */
  public getLifecycleManager(): AiLifecycleManager {
    return this.aiLifecycleManager;
  }

  /**
   * Lists currently active in-flight AI requests.
   */
  public getActiveRequests(projectId?: string | null): readonly import('@ai-quality/contracts').AiActiveRequestDto[] {
    return this.aiLifecycleManager.getActiveRequests(projectId);
  }

  /**
   * Retrieves high-precision runtime performance metrics.
   */
  public getRuntimeMetrics(): import('@ai-quality/contracts').AiRuntimeMetricsDto {
    return this.aiLifecycleManager.getRuntimeMetrics();
  }

  /**
   * Exposes the underlying privacy and firewall service.
   */
  public getPrivacyService(): AiPrivacyService {
    return this.aiPrivacyService;
  }

  /**
   * Exposes the structured output and JSON schema validation service.
   */
  public getStructuredOutputService(): StructuredOutputService {
    return this.structuredOutputService;
  }

  /**
   * Exposes the tool calling compatibility and validation service.
   */
  public getToolCallingService(): ToolCallingService {
    return this.toolCallingService;
  }

  /**
   * Exposes the context window and token budget manager.
   */
  public getContextWindowManager(): ContextWindowManager {
    return this.contextWindowManager;
  }

  /**
   * Exposes the requirement and test context adapter.
   */
  public getRequirementTestContextAdapter(): RequirementTestContextAdapter {
    return this.requirementTestContextAdapter;
  }

  /**
   * Startup crash recovery: Recovers interrupted requests left over from prior sessions.
   */
  public async recoverInterruptedRequests(
    input?: import('@ai-quality/contracts').RecoverInterruptedRequestsInputDto,
  ): Promise<import('@ai-quality/contracts').RecoverInterruptedRequestsResultDto> {
    return this.aiLifecycleManager.recoverInterruptedRequests(input);
  }

  /**
   * Enforces project tenant isolation: ensures project exists and belongs to the given user.
   */
  private async assertProjectAccess(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true },
    });

    if (!project) {
      throw new AiInvalidRequestError(`Project with ID '${projectId}' was not found.`);
    }

    if (project.userId && project.userId !== userId) {
      this.logger.warn('ai_provider.cross_project_violation', {
        projectId,
        projectOwnerId: project.userId,
        requestUserId: userId,
      });
      throw new AiCrossProjectAccessError(
        `User '${userId}' does not have permission to access AI configuration for project '${projectId}'.`,
      );
    }
  }

  /**
   * Helper to write structured audit logs safely.
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
      this.logger.warn('ai_provider.audit_failed', {
        action,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
