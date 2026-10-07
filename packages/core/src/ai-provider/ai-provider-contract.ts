/**
 * @file packages/core/src/ai-provider/ai-provider-contract.ts
 * Provider-independent AI runtime interface for V9 Phase 126.
 */

import type {
  AiProviderType,
  AiProviderCapabilitiesDto,
  AiProviderStatusDto,
  NormalizedAiRequestDto,
  NormalizedAiResponseDto,
  AiStreamChunkDto,
} from '@ai-quality/contracts';

/**
 * Universal contract implemented by all V9/V10 AI runtime adapters (Ollama, cloud, emulated).
 * The higher application layers (autonomous agent, test generators, analysis) interact
 * exclusively through this interface without direct dependency on Ollama or provider-specific APIs.
 */
export interface IAiProvider {
  /**
   * Unique uppercase provider identifier (e.g. 'OLLAMA', 'OPENAI', 'EMULATED').
   */
  readonly id: string;

  /**
   * Human-readable provider name for display.
   */
  readonly name: string;

  /**
   * Provider execution tier ('LOCAL', 'CLOUD', 'EMULATED').
   */
  readonly type: AiProviderType;

  /**
   * Returns static and dynamic capabilities of the provider.
   */
  getCapabilities(): AiProviderCapabilitiesDto;

  /**
   * Verifies provider connectivity and operational readiness.
   */
  healthCheck(signal?: AbortSignal): Promise<AiProviderStatusDto>;

  /**
   * Generates a complete AI response for a normalized request.
   */
  generate(
    request: NormalizedAiRequestDto,
    signal?: AbortSignal,
  ): Promise<NormalizedAiResponseDto>;

  /**
   * Streams progressive chunks of an AI response for a normalized request.
   */
  stream(
    request: NormalizedAiRequestDto,
    signal?: AbortSignal,
  ): AsyncIterable<AiStreamChunkDto>;

  /**
   * Requests cancellation of an in-flight operation by its request ID.
   * Returns true if an active operation was found and aborted, false otherwise.
   */
  cancel(requestId: string): Promise<boolean>;

  /**
   * Discovers and lists all installed AI models available on this provider (Phase 128).
   */
  listModels?(signal?: AbortSignal): Promise<readonly import('@ai-quality/contracts').AiModelDto[]>;
}
