/**
 * @file packages/core/src/ai-provider/tool-calling-service.ts
 * Privileged business domain service for Tool-Calling Compatibility Layer (V9 Phase 133).
 *
 * Architecture:
 *   AI Model -> Provider Adapter -> V9 Tool-Calling Compatibility Layer -> Validated ToolCall -> STOP.
 *
 * Guarantees:
 * - Provider-independent tool registration and discovery
 * - Schema-driven argument validation
 * - Native vs Compatibility vs Unsupported capability handling
 * - Project tenant isolation
 * - Redaction of sensitive values
 * - Strict non-execution: Never invokes shell, code, files, or V1-V8 execution engines in Phase 133.
 */

import { randomUUID } from 'node:crypto';
import type {
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
  ToolCallingCapability,
  LocalGenerationRequestInputDto,
  AiStreamEventDto,
} from '@ai-quality/contracts';
import {
  generateAiToolCallsInputSchema,
  validateAiToolCallInputSchema,
  parseAiToolCallsInputSchema,
} from '@ai-quality/contracts';
import { AiToolRegistry } from './tool-registry.js';
import { V9ToolCallParser } from './tool-call-parser.js';
import { LocalGenerationRuntimeService } from './local-generation-runtime.js';
import { CapabilityDetectionService } from './capability-detection-service.js';
import { ModelDiscoveryService } from './model-discovery-service.js';
import { AiProviderRegistry } from './ai-provider-registry.js';
import {
  AiToolNotFoundError,
  AiToolExecutionProhibitedError,
  AiInvalidRequestError,
  AiCancelledError,
} from './ai-provider-errors.js';
import { getLogger, type ILogger } from '../logging/index.js';

export interface ToolCallingServiceDependencies {
  readonly runtimeService?: LocalGenerationRuntimeService;
  readonly toolRegistry?: AiToolRegistry;
  readonly capabilityDetectionService?: CapabilityDetectionService;
  readonly modelDiscoveryService?: ModelDiscoveryService;
  readonly providerRegistry?: AiProviderRegistry;
  readonly logger?: ILogger;
}

export class ToolCallingService {
  private readonly runtimeService: LocalGenerationRuntimeService;
  private readonly toolRegistry: AiToolRegistry;
  private readonly capabilityDetectionService: CapabilityDetectionService;
  private readonly modelDiscoveryService: ModelDiscoveryService;
  private readonly providerRegistry: AiProviderRegistry;
  private readonly logger: ILogger;

  constructor(deps?: ToolCallingServiceDependencies) {
    this.logger = deps?.logger ?? getLogger();
    this.toolRegistry = deps?.toolRegistry ?? AiToolRegistry.getDefault();
    this.providerRegistry = deps?.providerRegistry ?? AiProviderRegistry.createDefault();
    this.modelDiscoveryService =
      deps?.modelDiscoveryService ?? new ModelDiscoveryService({ logger: this.logger });
    this.capabilityDetectionService =
      deps?.capabilityDetectionService ??
      new CapabilityDetectionService({ logger: this.logger });
    this.runtimeService =
      deps?.runtimeService ??
      new LocalGenerationRuntimeService({
        registry: this.providerRegistry,
        modelDiscoveryService: this.modelDiscoveryService,
        capabilityDetectionService: this.capabilityDetectionService,
        logger: this.logger,
      });
  }

  /**
   * Returns the underlying tool registry.
   */
  public getToolRegistry(): AiToolRegistry {
    return this.toolRegistry;
  }

  /**
   * Lists available tools in the registry.
   */
  public listTools(input?: ListAiToolsInputDto): readonly AiToolDefinitionDto[] {
    return this.toolRegistry.listTools(input?.projectId, input?.category);
  }

  /**
   * Retrieves a single tool definition.
   */
  public getTool(input: GetAiToolInputDto): AiToolDefinitionDto | null {
    return this.toolRegistry.getTool(input.name, input.projectId);
  }

  /**
   * Discovers tool-calling capabilities of a provider/model pair.
   */
  public async getToolCapabilities(
    input?: GetAiToolCapabilitiesInputDto,
  ): Promise<AiToolCapabilitiesDto> {
    const providerId = input?.providerId ?? 'OLLAMA';
    if (!this.providerRegistry.has(providerId)) {
      return {
        providerId,
        modelId: input?.modelId ?? 'unknown',
        capability: 'UNSUPPORTED',
        supportsStreamingToolCalls: false,
        supportsMultiToolCalls: false,
        description: `Provider '${providerId}' is not registered.`,
      };
    }

    const provider = this.providerRegistry.get(providerId);
    const caps = provider.getCapabilities();

    // Determine capability: NATIVE vs COMPATIBILITY vs UNSUPPORTED
    let capability: ToolCallingCapability = 'COMPATIBILITY';
    const supportsStreaming = Boolean(caps.streaming);

    if (providerId === 'OLLAMA') {
      capability = 'NATIVE';
    } else if (provider.type === 'EMULATED') {
      capability = 'COMPATIBILITY';
    }

    return {
      providerId,
      modelId: input?.modelId ?? caps.defaultModel ?? 'unknown',
      capability,
      supportsStreamingToolCalls: supportsStreaming,
      supportsMultiToolCalls: true,
      description:
        capability === 'NATIVE'
          ? `Provider '${providerId}' natively formats and supports structured tool calls.`
          : `Provider '${providerId}' supports prompt-based tool-calling compatibility mode.`,
    };
  }

  /**
   * Parses raw model text into normalized tool calls without validating arguments.
   */
  public parseToolCalls(input: ParseAiToolCallsInputDto): readonly NormalizedAiToolCallDto[] {
    return V9ToolCallParser.parse(input.rawContent, {
      allowMarkdownFences: input.allowMarkdownFences !== false,
      maxPayloadChars: input.maxPayloadChars,
    });
  }

  /**
   * Validates a single tool call against the registry.
   */
  public validateToolCall(input: ValidateAiToolCallInputDto): ValidatedAiToolCallResultDto {
    const { toolCall, projectId } = input;
    const toolDef = this.toolRegistry.getTool(toolCall.name, projectId);

    if (!toolDef) {
      return {
        toolCall,
        status: 'UNKNOWN_TOOL',
        errors: [{ path: 'name', message: `Tool '${toolCall.name}' is not registered in the registry.` }],
        toolDefinition: null,
      };
    }

    const validation = this.toolRegistry.validateArguments(toolCall.name, toolCall.arguments, projectId);

    if (!validation.valid) {
      return {
        toolCall,
        status: 'INVALID_ARGUMENTS',
        errors: validation.errors,
        toolDefinition: toolDef,
      };
    }

    return {
      toolCall,
      status: 'VALID',
      errors: [],
      toolDefinition: toolDef,
    };
  }

  /**
   * Requests model generation and processes tool calls through the full validation pipeline:
   *   Model Output -> Parse -> Tool Lookup -> Argument Schema Validation -> Validated ToolCall -> STOP.
   */
  public async generateToolCalls(
    input: GenerateAiToolCallsInputDto,
    userId?: string,
    signal?: AbortSignal,
  ): Promise<GenerateAiToolCallsResultDto> {
    const startedAt = performance.now();
    const validatedInput = generateAiToolCallsInputSchema.parse(input);
    const requestId = validatedInput.requestId ?? randomUUID();

    // 1. Resolve available tools to expose to the model
    const toolsToExpose: AiToolDefinitionDto[] = [];
    if (validatedInput.toolNames && validatedInput.toolNames.length > 0) {
      for (const name of validatedInput.toolNames) {
        const tool = this.toolRegistry.getTool(name, validatedInput.projectId);
        if (tool) {
          toolsToExpose.push(tool);
        } else {
          throw new AiToolNotFoundError(name, validatedInput.projectId);
        }
      }
    } else {
      // Default to all registered tools for the scope
      toolsToExpose.push(...this.toolRegistry.listTools(validatedInput.projectId));
    }

    // 2. Resolve capability
    const caps = await this.getToolCapabilities({
      providerId: validatedInput.providerId,
      modelId: validatedInput.modelId,
    });

    // 3. Build system prompt instructing the model on available tools & JSON calling schema
    const promptInstructions = this.buildToolPromptInstructions(toolsToExpose, validatedInput.systemPrompt);

    const generationPayload: LocalGenerationRequestInputDto = {
      requestId,
      projectId: validatedInput.projectId,
      providerId: validatedInput.providerId,
      modelId: validatedInput.modelId,
      prompt: validatedInput.prompt,
      systemPrompt: promptInstructions,
      context: validatedInput.context,
      parameters: validatedInput.parameters,
      timeoutMs: validatedInput.timeoutMs,
    };

    // 4. Generate via runtime service
    const generationResult = await this.runtimeService.generate(generationPayload, userId, signal);

    // 5. Parse tool calls safely
    const tParseStart = performance.now();
    const rawContent = generationResult.content;
    const parsedCalls = V9ToolCallParser.parse(rawContent);
    const parseDurationMs = performance.now() - tParseStart;

    // 6. Validate each tool call against registry
    const tValStart = performance.now();
    const validatedCalls: ValidatedAiToolCallResultDto[] = [];

    for (const call of parsedCalls) {
      const validated = this.validateToolCall({
        toolCall: call,
        projectId: validatedInput.projectId,
      });
      validatedCalls.push(validated);
    }

    const validationDurationMs = performance.now() - tValStart;
    const totalDurationMs = performance.now() - startedAt;

    // Observability logging with secret redaction
    this.logger.info('ai_tool.calls_generated', {
      requestId,
      provider: generationResult.provider,
      model: generationResult.model,
      toolCount: validatedCalls.length,
      validCount: validatedCalls.filter((c) => c.status === 'VALID').length,
      durationMs: Math.round(totalDurationMs),
    });

    return {
      requestId,
      provider: generationResult.provider,
      model: generationResult.model,
      rawContent,
      validatedCalls,
      capabilityUsed: caps.capability,
      durationMs: Math.round(totalDurationMs),
      parseDurationMs: Math.round(parseDurationMs),
      validationDurationMs: Math.round(validationDurationMs),
      usage: generationResult.usage,
      metadata: generationResult.metadata,
    };
  }

  /**
   * Strictly verifies that tool calls are NOT executed in Phase 133.
   * If any caller attempts execution, this method throws AiToolExecutionProhibitedError.
   */
  public executeToolCall(toolCall: NormalizedAiToolCallDto): never {
    throw new AiToolExecutionProhibitedError(toolCall.name);
  }

  /**
   * Helper that builds deterministic system prompt guidance for tool availability.
   */
  private buildToolPromptInstructions(
    tools: readonly AiToolDefinitionDto[],
    customSystemPrompt?: string | null,
  ): string {
    const toolListJson = JSON.stringify(
      tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      })),
      null,
      2,
    );

    const guidance = [
      customSystemPrompt ? customSystemPrompt.trim() : 'You are an AI assistant in the QA intelligence workspace.',
      '',
      'AVAILABLE TOOLS:',
      'You have access to the following structured tools:',
      toolListJson,
      '',
      'TOOL CALLING PROTOCOL:',
      'When requesting a tool, output ONLY a JSON object formatted as:',
      '{',
      '  "tool_calls": [',
      '    {',
      '      "id": "call_1",',
      '      "name": "<tool_name>",',
      '      "arguments": { <parameters> }',
      '    }',
      '  ]',
      '}',
      'Do not include explanatory commentary outside the JSON.',
    ].join('\n');

    return guidance;
  }
}
