/**
 * @file packages/core/src/ai-provider/structured-output-service.ts
 * Privileged business domain service for Structured Output & Schema Validation (V9 Phase 132).
 * Integrates:
 *   AI Request -> Provider Runtime -> Native/Prompted Generation -> Safe Parsing -> Schema Validation -> Controlled Bounded Retries -> Validated Result
 */

import crypto from 'node:crypto';
import type {
  StructuredGenerationRequestInputDto,
  StructuredGenerationResultDto,
  ValidateStructuredInputDto,
  StructuredValidationResultDto,
  StructuredCapabilitiesDto,
  GetStructuredCapabilitiesInputDto,
  StructuredOutputCapability,
  StructuredValidationStatus,
  StructuredValidationErrorDto,
  LocalGenerationRequestInputDto,
  AiStreamEventDto,
} from '@ai-quality/contracts';
import {
  structuredGenerationRequestSchema,
  validateStructuredInputSchema,
} from '@ai-quality/contracts';
import { StructuredOutputRegistry } from './structured-output-registry.js';
import { V9StructuredOutputParser } from './structured-output-parser.js';
import { LocalGenerationRuntimeService } from './local-generation-runtime.js';
import { CapabilityDetectionService } from './capability-detection-service.js';
import { ModelDiscoveryService } from './model-discovery-service.js';
import { AiProviderRegistry } from './ai-provider-registry.js';
import {
  AiStructuredValidationError,
  AiStructuredParseError,
  AiStructuredMaxRetriesExceededError,
  AiInvalidRequestError,
  AiCancelledError,
} from './ai-provider-errors.js';
import { getLogger, type ILogger } from '../logging/index.js';

export interface StructuredOutputServiceDependencies {
  readonly runtimeService?: LocalGenerationRuntimeService;
  readonly schemaRegistry?: StructuredOutputRegistry;
  readonly capabilityDetectionService?: CapabilityDetectionService;
  readonly modelDiscoveryService?: ModelDiscoveryService;
  readonly providerRegistry?: AiProviderRegistry;
  readonly logger?: ILogger;
  readonly defaultMaxRetries?: number;
}

export class StructuredOutputService {
  private readonly runtimeService: LocalGenerationRuntimeService;
  private readonly schemaRegistry: StructuredOutputRegistry;
  private readonly capabilityDetectionService: CapabilityDetectionService;
  private readonly modelDiscoveryService: ModelDiscoveryService;
  private readonly providerRegistry: AiProviderRegistry;
  private readonly logger: ILogger;
  private readonly defaultMaxRetries: number;

  constructor(deps?: StructuredOutputServiceDependencies) {
    this.logger = deps?.logger ?? getLogger();
    this.schemaRegistry = deps?.schemaRegistry ?? StructuredOutputRegistry.getDefault();
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
    this.defaultMaxRetries = deps?.defaultMaxRetries ?? 2;
  }

  /**
   * Resolves the structured generation capability of a provider/model pair.
   */
  public async getStructuredCapabilities(
    input?: GetStructuredCapabilitiesInputDto,
  ): Promise<StructuredCapabilitiesDto> {
    const providerId = input?.providerId ?? 'OLLAMA';
    if (!this.providerRegistry.has(providerId)) {
      return {
        providerId,
        modelId: input?.modelId ?? 'unknown',
        capability: 'UNSUPPORTED',
        supportsJsonFormat: false,
        supportsJsonSchema: false,
        description: `Provider '${providerId}' is not registered.`,
      };
    }

    const provider = this.providerRegistry.get(providerId);

    const caps = provider.getCapabilities();

    // Ollama and Emulated support JSON mode
    const supportsJson = provider.id === 'OLLAMA' || provider.id === 'EMULATED' || provider.id === 'OPENAI';

    return {
      providerId,
      modelId: input?.modelId ?? 'default',
      capability: supportsJson ? 'NATIVE' : 'PROMPTED',
      supportsJsonFormat: supportsJson,
      supportsJsonSchema: false, // Strict json_schema constraint is prompted/hybrid
      description: supportsJson
        ? 'Native JSON mode supported by provider runtime.'
        : 'Constrained prompting with schema instructions applied.',
    };
  }

  /**
   * Validates arbitrary raw text against a registered or supplied JSON schema without invoking AI generation.
   */
  public validateStructured(
    rawInput: ValidateStructuredInputDto,
  ): StructuredValidationResultDto {
    const validatedInput = validateStructuredInputSchema.parse(rawInput);
    const schemaEntry = this.schemaRegistry.resolve(
      validatedInput.schemaName,
      validatedInput.schemaVersion,
    );

    const tParseStart = performance.now();
    const parseRes = V9StructuredOutputParser.parse(validatedInput.rawContent, validatedInput.policy ?? undefined);
    const parseDurationMs = Math.round(performance.now() - tParseStart);

    if (!parseRes.ok || parseRes.data === null) {
      const errList: StructuredValidationErrorDto[] = [
        {
          path: '',
          message: parseRes.error ?? 'Failed to parse JSON content',
          code: parseRes.status,
        },
      ];
      return {
        schemaName: schemaEntry.name,
        schemaVersion: schemaEntry.version,
        status: parseRes.status as StructuredValidationStatus,
        parsedData: null,
        errors: errList,
        parseDurationMs,
        validationDurationMs: 0,
      };
    }

    const tValStart = performance.now();
    const validationRes = schemaEntry.schema.safeParse(parseRes.data);
    const validationDurationMs = Math.round(performance.now() - tValStart);

    if (!validationRes.success) {
      const errors = StructuredOutputRegistry.mapZodError(validationRes.error);
      return {
        schemaName: schemaEntry.name,
        schemaVersion: schemaEntry.version,
        status: 'INVALID',
        parsedData: parseRes.data,
        errors,
        parseDurationMs,
        validationDurationMs,
      };
    }

    return {
      schemaName: schemaEntry.name,
      schemaVersion: schemaEntry.version,
      status: 'VALID',
      parsedData: validationRes.data,
      errors: [],
      parseDurationMs,
      validationDurationMs,
    };
  }

  /**
   * Generates validated structured output with bounded correction retries.
   */
  public async generateStructured(
    rawInput: StructuredGenerationRequestInputDto,
    userId?: string,
    signal?: AbortSignal,
  ): Promise<StructuredGenerationResultDto> {
    const validatedInput = structuredGenerationRequestSchema.parse(rawInput);
    const requestId = validatedInput.requestId ?? crypto.randomUUID();
    const schemaEntry = this.schemaRegistry.resolve(
      validatedInput.schemaName,
      validatedInput.schemaVersion,
    );

    const maxRetries = validatedInput.policy?.maxRetries ?? this.defaultMaxRetries;
    const providerId = validatedInput.providerId ?? 'OLLAMA';
    const capability = (await this.getStructuredCapabilities({
      providerId,
      modelId: validatedInput.modelId,
    })).capability;

    let attempt = 0;
    let accumulatedErrors: StructuredValidationErrorDto[] = [];
    let lastRawContent = '';
    let lastParsedData: unknown | null = null;
    let lastValidationStatus: StructuredValidationStatus = 'INVALID';
    let lastUsage: StructuredGenerationResultDto['usage'] = null;
    let lastModelReported = validatedInput.modelId ?? 'default';

    const tOverallStart = performance.now();
    let totalParseDurationMs = 0;
    let totalValidationDurationMs = 0;

    // Build initial prompt incorporating schema instructions
    let currentPrompt = this.buildPromptWithSchema(
      validatedInput.prompt,
      schemaEntry.name,
      schemaEntry.samplePromptGuidance,
    );

    while (attempt <= maxRetries) {
      if (signal?.aborted) {
        throw new AiCancelledError(requestId);
      }

      this.logger.info('ai_structured.attempt_started', {
        requestId,
        attempt,
        maxRetries,
        schemaName: schemaEntry.name,
      });

      const genReq: LocalGenerationRequestInputDto = {
        requestId,
        projectId: validatedInput.projectId,
        providerId: validatedInput.providerId,
        modelId: validatedInput.modelId,
        prompt: currentPrompt,
        systemPrompt: this.buildSystemPromptWithSchema(
          validatedInput.systemPrompt,
          schemaEntry.name,
        ),
        context: validatedInput.context,
        parameters: validatedInput.parameters,
        timeoutMs: validatedInput.timeoutMs,
      };

      const genResult = await this.runtimeService.generate(genReq, userId, signal);
      lastRawContent = genResult.content;
      lastUsage = genResult.usage;
      lastModelReported = genResult.model;

      // Parse output safely
      const tParse = performance.now();
      const parseRes = V9StructuredOutputParser.parse(
        genResult.content,
        validatedInput.policy ?? undefined,
      );
      totalParseDurationMs += Math.round(performance.now() - tParse);

      if (!parseRes.ok || parseRes.data === null) {
        lastValidationStatus = parseRes.status as StructuredValidationStatus;
        accumulatedErrors = [
          {
            path: '',
            message: parseRes.error ?? 'JSON parsing failed',
            code: parseRes.status,
          },
        ];
      } else {
        lastParsedData = parseRes.data;

        // Validate parsed object against Zod schema
        const tVal = performance.now();
        const valRes = schemaEntry.schema.safeParse(parseRes.data);
        totalValidationDurationMs += Math.round(performance.now() - tVal);

        if (valRes.success) {
          // Success! Valid structured data obtained
          this.logger.info('ai_structured.validation_succeeded', {
            requestId,
            attempt,
            schemaName: schemaEntry.name,
          });

          return {
            requestId,
            provider: genResult.provider,
            model: genResult.model,
            schemaName: schemaEntry.name,
            schemaVersion: schemaEntry.version,
            rawContent: lastRawContent,
            parsedData: valRes.data,
            validationStatus: 'VALID',
            validationErrors: [],
            retryCount: attempt,
            capabilityUsed: capability,
            durationMs: Math.round(performance.now() - tOverallStart),
            parseDurationMs: totalParseDurationMs,
            validationDurationMs: totalValidationDurationMs,
            usage: lastUsage,
            metadata: genResult.metadata,
          };
        } else {
          lastValidationStatus = 'INVALID';
          accumulatedErrors = StructuredOutputRegistry.mapZodError(valRes.error);
        }
      }

      attempt++;

      if (attempt <= maxRetries) {
        this.logger.warn('ai_structured.retry_triggered', {
          requestId,
          attempt,
          errors: accumulatedErrors.map((e) => e.message),
        });

        // Construct bounded correction prompt
        currentPrompt = this.buildCorrectionPrompt(
          validatedInput.prompt,
          lastRawContent,
          accumulatedErrors,
          schemaEntry.samplePromptGuidance,
        );
      }
    }

    // Exhausted retries without valid result
    this.logger.warn('ai_structured.retries_exhausted', {
      requestId,
      attempts: attempt,
      lastValidationStatus,
      errorsCount: accumulatedErrors.length,
    });

    return {
      requestId,
      provider: providerId,
      model: lastModelReported,
      schemaName: schemaEntry.name,
      schemaVersion: schemaEntry.version,
      rawContent: lastRawContent,
      parsedData: lastParsedData,
      validationStatus: lastValidationStatus,
      validationErrors: accumulatedErrors,
      retryCount: attempt - 1,
      capabilityUsed: capability,
      durationMs: Math.round(performance.now() - tOverallStart),
      parseDurationMs: totalParseDurationMs,
      validationDurationMs: totalValidationDurationMs,
      usage: lastUsage,
    };
  }

  /**
   * Accumulates streaming tokens and performs schema validation once generation completes (Phase 131 compatibility).
   */
  public async *streamAndValidate(
    rawInput: StructuredGenerationRequestInputDto,
    userId?: string,
    signal?: AbortSignal,
  ): AsyncIterable<AiStreamEventDto & { structuredResult?: StructuredGenerationResultDto }> {
    const validatedInput = structuredGenerationRequestSchema.parse(rawInput);
    const requestId = validatedInput.requestId ?? crypto.randomUUID();
    const schemaEntry = this.schemaRegistry.resolve(
      validatedInput.schemaName,
      validatedInput.schemaVersion,
    );

    const currentPrompt = this.buildPromptWithSchema(
      validatedInput.prompt,
      schemaEntry.name,
      schemaEntry.samplePromptGuidance,
    );

    const streamReq: LocalGenerationRequestInputDto = {
      requestId,
      projectId: validatedInput.projectId,
      providerId: validatedInput.providerId,
      modelId: validatedInput.modelId,
      prompt: currentPrompt,
      systemPrompt: this.buildSystemPromptWithSchema(
        validatedInput.systemPrompt,
        schemaEntry.name,
      ),
      context: validatedInput.context,
      parameters: validatedInput.parameters,
      timeoutMs: validatedInput.timeoutMs,
    };

    let accumulatedContent = '';
    let lastStreamEvent: AiStreamEventDto | null = null;

    for await (const chunk of this.runtimeService.generateStream(streamReq, userId, signal)) {
      if (chunk.deltaText) {
        accumulatedContent += chunk.deltaText;
      } else if (chunk.content && !accumulatedContent) {
        accumulatedContent = chunk.content;
      }
      lastStreamEvent = chunk;
      yield chunk;
    }

    // When stream completes or is cancelled/errored
    if (lastStreamEvent?.type === 'COMPLETE') {
      const valResult = this.validateStructured({
        schemaName: schemaEntry.name,
        schemaVersion: schemaEntry.version,
        rawContent: accumulatedContent,
        policy: validatedInput.policy,
      });

      const structuredResult: StructuredGenerationResultDto = {
        requestId,
        provider: lastStreamEvent.provider ?? 'OLLAMA',
        model: lastStreamEvent.model ?? 'default',
        schemaName: schemaEntry.name,
        schemaVersion: schemaEntry.version,
        rawContent: accumulatedContent,
        parsedData: valResult.parsedData,
        validationStatus: valResult.status,
        validationErrors: valResult.errors,
        retryCount: 0,
        capabilityUsed: 'NATIVE',
        durationMs: lastStreamEvent.durationMs ?? 0,
        parseDurationMs: valResult.parseDurationMs,
        validationDurationMs: valResult.validationDurationMs,
        usage: lastStreamEvent.usage,
      };

      yield {
        requestId,
        sequence: (lastStreamEvent.sequence ?? 0) + 1,
        type: 'COMPLETE',
        done: true,
        content: accumulatedContent,
        model: lastStreamEvent.model,
        provider: lastStreamEvent.provider,
        structuredResult,
      };
    }
  }

  private buildSystemPromptWithSchema(
    existingSystemPrompt?: string | null,
    schemaName?: string,
  ): string {
    const base = existingSystemPrompt ? `${existingSystemPrompt.trim()}\n\n` : '';
    return `${base}You must respond with strictly valid JSON matching the '${schemaName}' schema. Do not output conversational explanations or code execution blocks outside the JSON object.`;
  }

  private buildPromptWithSchema(
    userPrompt: string,
    schemaName: string,
    sampleGuidance: string,
  ): string {
    return `${userPrompt.trim()}

Respond strictly with valid JSON conforming to the '${schemaName}' schema structure:
\`\`\`json
${sampleGuidance}
\`\`\``;
  }

  private buildCorrectionPrompt(
    originalPrompt: string,
    previousOutput: string,
    errors: readonly StructuredValidationErrorDto[],
    sampleGuidance: string,
  ): string {
    const errorDetails = errors.map((e) => `- Field '${e.path || 'root'}': ${e.message}`).join('\n');
    return `${originalPrompt.trim()}

CORRECTION REQUIRED:
Your previous output failed schema validation with the following errors:
${errorDetails}

Previous Output:
${previousOutput.substring(0, 1000)}

Please correct the errors and output ONLY valid JSON following this format:
\`\`\`json
${sampleGuidance}
\`\`\``;
  }
}
