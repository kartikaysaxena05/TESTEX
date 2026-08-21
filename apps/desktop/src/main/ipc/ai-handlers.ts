import {
  AiProviderGateway,
  AiPromptExecutionService,
  AiInvalidRequestError,
  AiGatewayError,
  DEFAULT_AI_CONFIG,
} from '@ai-quality/core';
import {
  getAiProviderStatusSchema,
  aiHealthCheckSchema,
  aiGenerationRequestSchema,
  aiPromptExecutionInputSchema,
  type AiProviderStatusDto,
  type AiGenerationResultDto,
  type AiGenerationConfigDto,
  type AiStructuredResultDto,
} from '@ai-quality/contracts';
import { ZodError } from 'zod';

let defaultGateway: AiProviderGateway | null = null;
let defaultExecutionService: AiPromptExecutionService | null = null;

export function getAiProviderGateway(): AiProviderGateway {
  if (!defaultGateway) {
    defaultGateway = new AiProviderGateway();
  }
  return defaultGateway;
}

export function setAiProviderGatewayForTest(gateway: AiProviderGateway | null): void {
  defaultGateway = gateway;
}

export function getAiPromptExecutionService(): AiPromptExecutionService {
  if (!defaultExecutionService) {
    defaultExecutionService = new AiPromptExecutionService({
      gateway: getAiProviderGateway(),
    });
  }
  return defaultExecutionService;
}

export function setAiPromptExecutionServiceForTest(service: AiPromptExecutionService | null): void {
  defaultExecutionService = service;
}

/**
 * Maps known Zod validation errors to domain AiInvalidRequestError.
 */
export function handleAiGatewayServiceError(error: unknown): never {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const message = firstIssue ? firstIssue.message : 'Invalid AI request payload.';
    throw new AiInvalidRequestError(message);
  }
  if (error instanceof AiGatewayError) {
    throw error;
  }
  throw error;
}

export async function handleGetAiProviderStatus(
  rawInput?: unknown,
  gateway: AiProviderGateway = getAiProviderGateway(),
): Promise<readonly AiProviderStatusDto[]> {
  const parseResult = getAiProviderStatusSchema.safeParse(rawInput ?? {});
  if (!parseResult.success) {
    handleAiGatewayServiceError(parseResult.error);
  }
  return gateway.getProviderStatus(parseResult.data);
}

export async function handleAiHealthCheck(
  rawInput: unknown,
  gateway: AiProviderGateway = getAiProviderGateway(),
): Promise<AiProviderStatusDto> {
  const parseResult = aiHealthCheckSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleAiGatewayServiceError(parseResult.error);
  }
  return gateway.healthCheck(parseResult.data);
}

export async function handleAiGenerate(
  rawInput: unknown,
  gateway: AiProviderGateway = getAiProviderGateway(),
): Promise<AiGenerationResultDto> {
  const parseResult = aiGenerationRequestSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleAiGatewayServiceError(parseResult.error);
  }
  return gateway.generate(parseResult.data);
}

export async function handleGetAiConfigDefaults(): Promise<AiGenerationConfigDto> {
  return DEFAULT_AI_CONFIG;
}

export async function handleAiExecutePrompt(
  rawInput: unknown,
  service: AiPromptExecutionService = getAiPromptExecutionService(),
): Promise<AiStructuredResultDto<unknown>> {
  const parseResult = aiPromptExecutionInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleAiGatewayServiceError(parseResult.error);
  }
  return service.executePromptFromDto(parseResult.data);
}
