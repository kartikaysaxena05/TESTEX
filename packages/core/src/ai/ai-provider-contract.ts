/**
 * @file packages/core/src/ai/ai-provider-contract.ts
 * Core provider contract for AI / LLM adapters.
 */

import type {
  AiProviderId,
  AiProviderCapabilitiesDto,
  AiProviderStatusDto,
  AiGenerationRequestDto,
  AiGenerationResultDto,
  AiEmbeddingRequestDto,
  AiEmbeddingResultDto,
} from '@ai-quality/contracts';

/**
 * Provider-neutral contract implemented by all LLM adapters.
 */
export interface AiProvider {
  readonly id: AiProviderId;

  /**
   * Returns the static capabilities and supported models of the provider.
   */
  getCapabilities(): AiProviderCapabilitiesDto;

  /**
   * Evaluates the health / readiness of the provider (credentials, network).
   */
  healthCheck(signal?: AbortSignal): Promise<AiProviderStatusDto>;

  /**
   * Generates a completion from the underlying LLM provider.
   */
  generate(request: AiGenerationRequestDto, signal?: AbortSignal): Promise<AiGenerationResultDto>;

  /**
   * Generates vector embeddings for a batch of text inputs.
   */
  embed?(request: AiEmbeddingRequestDto, signal?: AbortSignal): Promise<AiEmbeddingResultDto>;
}
