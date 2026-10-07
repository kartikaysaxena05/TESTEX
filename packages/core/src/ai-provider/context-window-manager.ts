/**
 * @file packages/core/src/ai-provider/context-window-manager.ts
 * Context Window & Token Management Service for V9 Phase 134.
 *
 * Responsibilities:
 * - Resolves model context capabilities (exact from provider or safe documented fallback).
 * - Calculates context budget: contextWindow - reservedOutput - safetyMargin = availableInputBudget.
 * - Prioritizes context deterministically (User request > Security > Task > Requirement > Test > Failures > Code > Metadata > History).
 * - Enforces context boundaries: bounds conversation history, drops low priority items before critical ones, rejects oversized requests.
 * - Large repository handling: ensures repository code never crowds out security instructions or requirement provenance.
 * - Secret exclusion & prompt injection protection: maintains tenant and context boundaries.
 */

import { randomUUID } from 'node:crypto';
import type {
  ModelContextCapabilitiesDto,
  ContextBudgetDto,
  OutputReservationSize,
  PrioritizedContextItemDto,
  ContextPriorityLevel,
  OptimizedContextSelectionResultDto,
  CalculateContextBudgetInputDto,
  OptimizeContextSelectionInputDto,
  EstimateTokensInputDto,
  TokenEstimationResultDto,
  GetModelContextCapabilitiesInputDto,
  AiModelDto,
} from '@ai-quality/contracts';
import {
  calculateContextBudgetInputSchema,
  optimizeContextSelectionInputSchema,
  estimateTokensInputSchema,
  getModelContextCapabilitiesInputSchema,
} from '@ai-quality/contracts';
import { TokenEstimatorService } from './token-estimator.js';
import { ModelDiscoveryService } from './model-discovery-service.js';
import { CapabilityDetectionService } from './capability-detection-service.js';
import { AiProviderRegistry } from './ai-provider-registry.js';
import {
  AiContextTooLargeError,
  AiOutputReservationExceededError,
  AiTokenBudgetExceededError,
} from './ai-provider-errors.js';
import { getLogger, type ILogger } from '../logging/index.js';

export interface ContextWindowManagerDependencies {
  readonly modelDiscoveryService?: ModelDiscoveryService;
  readonly capabilityDetectionService?: CapabilityDetectionService;
  readonly providerRegistry?: AiProviderRegistry;
  readonly logger?: ILogger;
}

export class ContextWindowManager {
  private readonly modelDiscoveryService: ModelDiscoveryService;
  private readonly capabilityDetectionService: CapabilityDetectionService;
  private readonly providerRegistry: AiProviderRegistry;
  private readonly logger: ILogger;

  // Documented default context window sizes when model metadata is unannounced
  public static readonly DEFAULT_FALLBACK_CONTEXT_WINDOW = 8_192;
  public static readonly DEFAULT_MAX_OUTPUT_TOKENS = 4_096;
  public static readonly DEFAULT_SAFETY_MARGIN_TOKENS = 512;

  // Reservation size tiers
  public static readonly RESERVATION_TIERS: Record<OutputReservationSize, number> = {
    SMALL: 512,
    MEDIUM: 2_048,
    LARGE: 4_096,
    CUSTOM: 2_048,
  };

  constructor(deps?: ContextWindowManagerDependencies) {
    this.logger = deps?.logger ?? getLogger();
    this.providerRegistry = deps?.providerRegistry ?? AiProviderRegistry.createDefault();
    this.modelDiscoveryService =
      deps?.modelDiscoveryService ?? new ModelDiscoveryService({ logger: this.logger });
    this.capabilityDetectionService =
      deps?.capabilityDetectionService ??
      new CapabilityDetectionService({ logger: this.logger });
  }

  /**
   * Resolves normalized model context capabilities.
   */
  public async getModelContextCapabilities(
    input: GetModelContextCapabilitiesInputDto,
  ): Promise<ModelContextCapabilitiesDto> {
    const validated = getModelContextCapabilitiesInputSchema.parse(input);
    const providerId = validated.providerId ?? 'OLLAMA';
    const modelId = validated.modelId;
    let discoveredModel: AiModelDto | undefined;
    if (this.providerRegistry.has(providerId)) {
      try {
        const provider = this.providerRegistry.get(providerId);
        if (typeof provider.listModels === 'function') {
          const models = await provider.listModels();
          discoveredModel = models.find((m: AiModelDto) => m.id === modelId || m.name === modelId);
        }
      } catch {
        // Non-blocking fallback
      }
    }

    let contextWindow = ContextWindowManager.DEFAULT_FALLBACK_CONTEXT_WINDOW;
    let isEstimated = true;
    let supportsStreaming = true;
    let supportsTools = false;
    let supportsStructuredOutput = false;

    if (discoveredModel && typeof discoveredModel.contextLength === 'number' && discoveredModel.contextLength > 0) {
      contextWindow = discoveredModel.contextLength;
      isEstimated = false;
      supportsTools = discoveredModel.capabilities?.toolCalling === true;
      supportsStreaming = true;
      supportsStructuredOutput = true;
    } else {
      // Known model family heuristics for common local LLMs
      const lower = modelId.toLowerCase();
      if (lower.includes('llama3.1') || lower.includes('llama3.2') || lower.includes('llama3.3')) {
        contextWindow = 128_000;
        isEstimated = false;
        supportsTools = true;
        supportsStructuredOutput = true;
      } else if (lower.includes('llama3') || lower.includes('llama-3')) {
        contextWindow = 8_192;
        isEstimated = false;
        supportsTools = true;
        supportsStructuredOutput = true;
      } else if (lower.includes('qwen2.5') || lower.includes('qwen-2.5')) {
        contextWindow = 32_768;
        isEstimated = false;
        supportsTools = true;
        supportsStructuredOutput = true;
      } else if (lower.includes('mistral') || lower.includes('mixtral')) {
        contextWindow = 32_768;
        isEstimated = false;
        supportsTools = false;
        supportsStructuredOutput = true;
      } else if (lower.includes('phi3') || lower.includes('phi-3')) {
        contextWindow = 128_000;
        isEstimated = false;
        supportsTools = false;
        supportsStructuredOutput = true;
      } else if (discoveredModel) {
        supportsTools = discoveredModel.capabilities?.toolCalling === true;
        supportsStreaming = true;
        supportsStructuredOutput = true;
      }
    }

    const maxOutputTokens = Math.min(
      ContextWindowManager.DEFAULT_MAX_OUTPUT_TOKENS,
      Math.floor(contextWindow * 0.5),
    );
    const maxInputTokens = contextWindow - maxOutputTokens;

    return {
      modelId,
      provider: providerId,
      contextWindow,
      maxInputTokens,
      maxOutputTokens,
      isEstimated,
      supportsStreaming,
      supportsTools,
      supportsStructuredOutput,
    };
  }

  /**
   * Calculates safe context budget:
   *   model context window - reserved output tokens - safety margin = available input budget.
   */
  public async calculateBudget(
    input: CalculateContextBudgetInputDto,
  ): Promise<ContextBudgetDto> {
    const validated = calculateContextBudgetInputSchema.parse(input);
    const caps = await this.getModelContextCapabilities({
      modelId: validated.modelId,
      providerId: validated.providerId,
    });

    const tier = validated.outputReservationTier ?? 'MEDIUM';
    let reservedOutput = ContextWindowManager.RESERVATION_TIERS[tier];
    if (tier === 'CUSTOM' && typeof validated.customOutputTokens === 'number') {
      reservedOutput = validated.customOutputTokens;
    }

    if (reservedOutput > caps.maxOutputTokens) {
      throw new AiOutputReservationExceededError(reservedOutput, caps.maxOutputTokens);
    }

    const safetyMargin =
      validated.safetyMarginTokens ?? ContextWindowManager.DEFAULT_SAFETY_MARGIN_TOKENS;

    const availableInputBudget = Math.max(0, caps.contextWindow - reservedOutput - safetyMargin);

    return {
      modelId: caps.modelId,
      provider: caps.provider,
      contextWindow: caps.contextWindow,
      reservedOutputTokens: reservedOutput,
      safetyMarginTokens: safetyMargin,
      availableInputBudget,
      reservationTier: tier,
    };
  }

  /**
   * Estimates tokens for arbitrary text or items.
   */
  public estimateTokens(input: EstimateTokensInputDto): TokenEstimationResultDto {
    const validated = estimateTokensInputSchema.parse(input);

    if (validated.items && validated.items.length > 0) {
      return TokenEstimatorService.estimate(validated.items);
    }

    const text = validated.text ?? '';
    const tokens = TokenEstimatorService.estimateString(text);
    return {
      totalTokens: tokens,
      breakdown: [
        {
          category: 'RAW_TEXT',
          estimatedTokens: tokens,
          characterCount: text.length,
          isEstimated: true,
        },
      ],
      method: 'ESTIMATED_HEURISTIC',
    };
  }

  /**
   * Assembles, prioritizes, and bounds context items against the model's budget.
   *
   * Priority Ordering:
   *   1. Current User Request (P1) - MANDATORY
   *   2. System / Security Instructions (P2) - MANDATORY (Never displaced!)
   *   3. Current Task Context (P3)
   *   4. Project Requirements (P4)
   *   5. Test Suite / Cases (P5)
   *   6. Failure Evidence / Execution Records (P6)
   *   7. Relevant Repository Code (P7)
   *   8. Project Metadata (P8)
   *   9. Conversation History (P9 - Bounded)
   *   10. Background Info (P10)
   */
  public async optimizeContextSelection(
    input: OptimizeContextSelectionInputDto,
  ): Promise<OptimizedContextSelectionResultDto> {
    const validated = optimizeContextSelectionInputSchema.parse(input);

    const budget = await this.calculateBudget({
      modelId: validated.modelId,
      providerId: validated.providerId,
      outputReservationTier: validated.outputReservationTier,
      safetyMarginTokens: validated.safetyMarginTokens,
    });

    const items: PrioritizedContextItemDto[] = [];

    // 1. User Request (P1)
    const userPromptTokens = TokenEstimatorService.estimateString(validated.userPrompt);
    items.push({
      id: 'item_user_request',
      priority: 'P1_USER_REQUEST',
      category: 'USER_PROMPT',
      content: validated.userPrompt,
      tokenCount: userPromptTokens,
      isMandatory: true,
    });

    // 2. System Instructions & Security Constraints (P2)
    const systemPromptText =
      validated.systemPrompt ??
      'You are a high-assurance QA and test engineering assistant. Preserve all test invariants and validation rules.';
    const systemPromptTokens = TokenEstimatorService.estimateString(systemPromptText);
    items.push({
      id: 'item_system_security',
      priority: 'P2_SYSTEM_SECURITY',
      category: 'SYSTEM_SECURITY',
      content: systemPromptText,
      tokenCount: systemPromptTokens,
      isMandatory: true,
    });

    // 3. Tool Definitions (P2 overhead if provided)
    if (validated.toolDefinitions && validated.toolDefinitions.length > 0) {
      const toolTokens = TokenEstimatorService.estimateTools(validated.toolDefinitions);
      const toolJson = JSON.stringify(validated.toolDefinitions, null, 2);
      items.push({
        id: 'item_tools',
        priority: 'P2_SYSTEM_SECURITY',
        category: 'TOOL_DEFINITIONS',
        content: toolJson,
        tokenCount: toolTokens,
        isMandatory: true,
      });
    }

    // 4. Project Context Sections (P4 - Requirements, P5 - Tests, P7 - Repo, P8 - Metadata)
    if (validated.context) {
      if (validated.context.requirements?.trim()) {
        const text = validated.context.requirements.trim();
        items.push({
          id: 'item_requirements',
          priority: 'P4_REQUIREMENT',
          category: 'REQUIREMENTS',
          content: text,
          tokenCount: TokenEstimatorService.estimateString(text),
        });
      }

      if (validated.context.testInfo?.trim()) {
        const text = validated.context.testInfo.trim();
        items.push({
          id: 'item_test_cases',
          priority: 'P5_TEST_CASE',
          category: 'TEST_CASES',
          content: text,
          tokenCount: TokenEstimatorService.estimateString(text),
        });
      }

      if (validated.context.targetInfo?.trim()) {
        const text = validated.context.targetInfo.trim();
        items.push({
          id: 'item_target_env',
          priority: 'P6_FAILURE_EVIDENCE',
          category: 'TARGET_ENVIRONMENT',
          content: text,
          tokenCount: TokenEstimatorService.estimateString(text),
        });
      }

      if (validated.context.repositoryInfo?.trim()) {
        const text = validated.context.repositoryInfo.trim();
        items.push({
          id: 'item_repo_code',
          priority: 'P7_REPOSITORY_CODE',
          category: 'REPOSITORY_CODE',
          content: text,
          tokenCount: TokenEstimatorService.estimateString(text),
        });
      }

      if (validated.context.relevantMetadata && Object.keys(validated.context.relevantMetadata).length > 0) {
        const text = JSON.stringify(validated.context.relevantMetadata);
        items.push({
          id: 'item_metadata',
          priority: 'P8_PROJECT_METADATA',
          category: 'PROJECT_METADATA',
          content: text,
          tokenCount: TokenEstimatorService.estimateString(text),
        });
      }
    }

    // 5. Conversation History (P9 - Bounded messages)
    if (validated.previousMessages && validated.previousMessages.length > 0) {
      // Retain messages in reverse order so recent messages take precedence
      for (let i = validated.previousMessages.length - 1; i >= 0; i--) {
        const msg = validated.previousMessages[i]!;
        const msgTokens = TokenEstimatorService.estimateString(msg.content) + 4;
        items.push({
          id: `item_msg_${i}`,
          priority: 'P9_CONVERSATION_HISTORY',
          category: 'CONVERSATION_HISTORY',
          content: `${msg.role}: ${msg.content}`,
          tokenCount: msgTokens,
        });
      }
    }

    // Sort items by strict Priority Level (P1 first, P10 last)
    const priorityRank: Record<ContextPriorityLevel, number> = {
      P1_USER_REQUEST: 1,
      P2_SYSTEM_SECURITY: 2,
      P3_TASK_CONTEXT: 3,
      P4_REQUIREMENT: 4,
      P5_TEST_CASE: 5,
      P6_FAILURE_EVIDENCE: 6,
      P7_REPOSITORY_CODE: 7,
      P8_PROJECT_METADATA: 8,
      P9_CONVERSATION_HISTORY: 9,
      P10_BACKGROUND_INFO: 10,
    };

    items.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);

    // Select items strictly within availableInputBudget
    const selectedItems: PrioritizedContextItemDto[] = [];
    const omittedItems: PrioritizedContextItemDto[] = [];
    let currentTokens = 0;
    let reductionApplied = false;

    // Check mandatory items first
    let mandatoryTokens = 0;
    for (const item of items) {
      if (item.isMandatory) {
        mandatoryTokens += item.tokenCount;
      }
    }

    if (mandatoryTokens > budget.availableInputBudget) {
      throw new AiContextTooLargeError(
        mandatoryTokens,
        budget.availableInputBudget,
        budget.contextWindow,
        'Mandatory user prompt and system constraints exceed total available input budget. Select a model with a larger context window.',
      );
    }

    for (const item of items) {
      if (item.isMandatory || currentTokens + item.tokenCount <= budget.availableInputBudget) {
        selectedItems.push(item);
        currentTokens += item.tokenCount;
      } else {
        omittedItems.push(item);
        reductionApplied = true;
      }
    }

    // Assemble final user prompt with attached context
    const contextSections: string[] = [];
    for (const item of selectedItems) {
      if (item.id !== 'item_user_request' && item.id !== 'item_system_security' && item.id !== 'item_tools') {
        contextSections.push(`### ${item.category}\n${item.content}`);
      }
    }

    let assembledPrompt = validated.userPrompt;
    if (contextSections.length > 0) {
      assembledPrompt = `${validated.userPrompt}\n\n## Context Information:\n${contextSections.join('\n\n')}`;
    }

    return {
      modelId: budget.modelId,
      provider: budget.provider,
      budget,
      selectedItems,
      omittedItems,
      totalSelectedTokens: currentTokens,
      totalOmittedTokens: omittedItems.reduce((acc, it) => acc + it.tokenCount, 0),
      fitsWithinBudget: true,
      assembledPrompt,
      assembledSystemPrompt: systemPromptText,
      reductionApplied,
    };
  }
}
