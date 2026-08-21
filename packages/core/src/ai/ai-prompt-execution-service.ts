/**
 * @file packages/core/src/ai/ai-prompt-execution-service.ts
 * Authoritative prompt execution pipeline orchestrating prompt lookup, input validation,
 * deterministic configuration resolution, gateway generation, structured output validation,
 * and immutable provenance metadata recording.
 */

import crypto from 'node:crypto';
import type {
  AiGenerationConfigDto,
  AiStructuredResultDto,
  AiPromptExecutionInputDto,
} from '@ai-quality/contracts';
import { PromptRegistry } from './prompt-registry.js';
import { AiConfigurationResolver } from './ai-configuration.js';
import { AiProviderGateway } from './ai-provider-gateway.js';
import { StructuredOutputParser } from './structured-output.js';
import {
  AiPromptInputInvalidError,
  AiStructuredOutputParseError,
  AiStructuredOutputSchemaError,
  AiCancelledError,
} from './ai-errors.js';
import { getLogger, type ILogger } from '../logging/index.js';

export interface PromptExecutionServiceOptions {
  readonly registry?: PromptRegistry;
  readonly gateway?: AiProviderGateway;
  readonly logger?: ILogger;
  readonly maxStructuredRetries?: number;
}

export interface ExecutePromptOptions<TInput = unknown> {
  readonly promptId: string;
  readonly version?: number;
  readonly input: TInput;
  readonly configOverride?: Partial<AiGenerationConfigDto>;
  readonly projectConfig?: Partial<AiGenerationConfigDto>;
  readonly signal?: AbortSignal;
}

export class AiPromptExecutionService {
  private readonly registry: PromptRegistry;
  private readonly gateway: AiProviderGateway;
  private readonly logger: ILogger;
  private readonly maxStructuredRetries: number;

  constructor(options: PromptExecutionServiceOptions = {}) {
    this.registry = options.registry ?? PromptRegistry.createDefault();
    this.gateway = options.gateway ?? new AiProviderGateway();
    this.logger = options.logger ?? getLogger();
    // Bounded structured retries: at most 1 attempt if configured (default: 0)
    this.maxStructuredRetries = Math.min(Math.max(options.maxStructuredRetries ?? 0, 0), 1);
  }

  public getRegistry(): PromptRegistry {
    return this.registry;
  }

  public getGateway(): AiProviderGateway {
    return this.gateway;
  }

  /**
   * Primary entry point for executing a registered prompt definition end-to-end.
   */
  public async executePrompt<TInput = unknown, TOutput = unknown>(
    options: ExecutePromptOptions<TInput>,
  ): Promise<AiStructuredResultDto<TOutput>> {
    const { promptId, version, input, configOverride, projectConfig, signal } = options;

    if (signal?.aborted) {
      throw new AiCancelledError();
    }

    // 1. Resolve prompt definition from registry
    const promptDef = this.registry.get<TInput, TOutput>(promptId, version);

    // 2. Validate input variables against prompt inputSchema
    const inputValidation = promptDef.inputSchema.safeParse(input);
    if (!inputValidation.success) {
      const issueSummary = inputValidation.error.issues
        .map(i => `[${i.path.join('.') || 'root'}]: ${i.message}`)
        .join('; ');
      throw new AiPromptInputInvalidError(promptDef.id, promptDef.version, issueSummary);
    }
    const validatedInput = inputValidation.data;

    // 3. Resolve AI generation configuration with deterministic precedence
    const resolvedConfig = AiConfigurationResolver.resolve({
      callOverride: configOverride,
      taskDefinitionConfig: promptDef.defaultConfig,
      projectConfig,
    });
    const configSnapshot = AiConfigurationResolver.toSnapshot(resolvedConfig);

    // 4. Render messages deterministically
    const renderedMessages = promptDef.buildMessages(validatedInput);

    // 5. Execute generation via Phase-43 Gateway
    const correlationId = crypto.randomUUID();
    const startTime = performance.now();

    this.logger.info('ai.prompt.execution.started', {
      requestId: correlationId,
      promptId: promptDef.id,
      promptVersion: promptDef.version,
      providerId: resolvedConfig.providerId,
      model: resolvedConfig.model,
      temperature: resolvedConfig.temperature,
    });

    let structuredAttempt = 0;
    let lastError: unknown = null;

    while (structuredAttempt <= this.maxStructuredRetries) {
      if (signal?.aborted) {
        throw new AiCancelledError(resolvedConfig.providerId);
      }

      try {
        const genResult = await this.gateway.generate(
          {
            requestId: correlationId,
            providerId: resolvedConfig.providerId,
            model: resolvedConfig.model,
            messages: renderedMessages,
            temperature: resolvedConfig.temperature,
            maxTokens: resolvedConfig.maxOutputTokens,
            timeoutMs: resolvedConfig.timeoutMs,
            metadata: {
              promptId: promptDef.id,
              promptVersion: String(promptDef.version),
            },
          },
          signal,
        );

        // 6. Extract, parse, and schema-validate structured output
        const validatedOutput = StructuredOutputParser.parseAndValidate(
          genResult.text,
          promptDef.outputSchema,
          {
            providerId: resolvedConfig.providerId,
            promptId: promptDef.id,
            promptVersion: promptDef.version,
          },
        );

        const totalDurationMs = Math.round(performance.now() - startTime);

        this.logger.info('ai.prompt.execution.success', {
          requestId: correlationId,
          promptId: promptDef.id,
          promptVersion: promptDef.version,
          providerId: resolvedConfig.providerId,
          modelReported: genResult.modelReported,
          durationMs: totalDurationMs,
          structuredRetries: structuredAttempt,
        });

        return {
          data: validatedOutput,
          providerId: resolvedConfig.providerId,
          modelRequested: resolvedConfig.model,
          modelReported: genResult.modelReported,
          requestId: correlationId,
          usage: genResult.usage,
          promptId: promptDef.id,
          promptVersion: promptDef.version,
          configSnapshot,
          durationMs: totalDurationMs,
          retryCount: genResult.retryCount + structuredAttempt,
          rawText: genResult.text,
        };
      } catch (err: unknown) {
        lastError = err;

        // Check if error is structured output parse or schema failure and we have remaining retry budget
        const isStructuredFailure =
          err instanceof AiStructuredOutputParseError ||
          err instanceof AiStructuredOutputSchemaError;

        if (
          isStructuredFailure &&
          structuredAttempt < this.maxStructuredRetries &&
          !signal?.aborted
        ) {
          structuredAttempt++;
          this.logger.warn('ai.prompt.execution.structured_retry', {
            requestId: correlationId,
            promptId: promptDef.id,
            promptVersion: promptDef.version,
            attempt: structuredAttempt,
            reason: err instanceof Error ? err.message : String(err),
          });
          continue;
        }

        break;
      }
    }

    this.logger.error('ai.prompt.execution.failed', lastError, {
      requestId: correlationId,
      promptId: promptDef.id,
      promptVersion: promptDef.version,
      providerId: resolvedConfig.providerId,
    });

    throw lastError;
  }

  /**
   * Helper executing prompt from DTO input payload (used by IPC handlers).
   */
  public async executePromptFromDto(
    dto: AiPromptExecutionInputDto,
    signal?: AbortSignal,
  ): Promise<AiStructuredResultDto<unknown>> {
    return this.executePrompt({
      promptId: dto.promptId,
      version: dto.version,
      input: dto.input,
      configOverride: dto.configOverride,
      signal,
    });
  }
}
