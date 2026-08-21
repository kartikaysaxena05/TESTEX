/**
 * @file packages/core/src/ai/ai-provider-registry.ts
 * Registry and resolver for AI providers.
 * Enforces explicit provider registration and prevents silent cross-provider fallbacks.
 */

import type { AiProviderId, AiProviderStatusDto } from '@ai-quality/contracts';
import type { AiProvider } from './ai-provider-contract.js';
import { AiInvalidRequestError } from './ai-errors.js';
import { OpenAiProviderAdapter } from './openai-provider-adapter.js';
import { FakeAiProvider } from './fake-ai-provider.js';

export class AiProviderRegistry {
  private readonly providers = new Map<string, AiProvider>();

  constructor(initialProviders: readonly AiProvider[] = []) {
    for (const provider of initialProviders) {
      this.register(provider);
    }
  }

  /**
   * Registers a provider adapter in the registry.
   */
  public register(provider: AiProvider): void {
    this.providers.set(provider.id.toUpperCase(), provider);
  }

  /**
   * Unregisters a provider adapter from the registry.
   */
  public unregister(providerId: AiProviderId): boolean {
    return this.providers.delete(providerId.toUpperCase());
  }

  /**
   * Checks if a provider with the given ID is registered.
   */
  public has(providerId: AiProviderId): boolean {
    return this.providers.has(providerId.toUpperCase());
  }

  /**
   * Resolves a provider adapter by ID. Throws AiInvalidRequestError if not registered.
   */
  public get(providerId: AiProviderId): AiProvider {
    const key = providerId.toUpperCase();
    const provider = this.providers.get(key);
    if (!provider) {
      const available = Array.from(this.providers.keys()).join(', ');
      throw new AiInvalidRequestError(
        `Unknown AI provider '${providerId}'. Available registered providers: [${available}]`,
        providerId,
      );
    }
    return provider;
  }

  /**
   * Resolves the default provider (prefers configured OPENAI, then FAKE).
   */
  public getDefaultProvider(): AiProvider {
    if (this.has('OPENAI')) {
      const openAi = this.get('OPENAI');
      if (typeof (openAi as any).isConfigured === 'function' && (openAi as any).isConfigured()) {
        return openAi;
      }
    }
    if (this.has('FAKE')) {
      return this.get('FAKE');
    }
    const first = Array.from(this.providers.values())[0];
    if (!first) {
      throw new AiInvalidRequestError('No AI providers registered.');
    }
    return first;
  }

  /**
   * Lists the IDs of all registered providers.
   */
  public listProviders(): readonly AiProviderId[] {
    return Array.from(this.providers.values()).map(p => p.id);
  }

  /**
   * Retrieves status for all registered providers concurrently.
   */
  public async getAllStatuses(signal?: AbortSignal): Promise<readonly AiProviderStatusDto[]> {
    const promises = Array.from(this.providers.values()).map(provider =>
      provider.healthCheck(signal).catch((err: unknown) => ({
        providerId: provider.id,
        configured: false,
        status: 'UNAVAILABLE' as const,
        capabilities: provider.getCapabilities(),
        message: err instanceof Error ? err.message : String(err),
      })),
    );
    return Promise.all(promises);
  }

  /**
   * Retrieves status for a single provider.
   */
  public async getStatus(
    providerId: AiProviderId,
    signal?: AbortSignal,
  ): Promise<AiProviderStatusDto> {
    const provider = this.get(providerId);
    return provider.healthCheck(signal);
  }

  /**
   * Factory creating a registry populated with default platform adapters (OpenAI and Fake).
   */
  public static createDefault(
    options: {
      openAiApiKey?: string;
      fakeOptions?: ConstructorParameters<typeof FakeAiProvider>[0];
    } = {},
  ): AiProviderRegistry {
    const registry = new AiProviderRegistry();
    registry.register(new OpenAiProviderAdapter({ apiKey: options.openAiApiKey }));
    registry.register(new FakeAiProvider(options.fakeOptions));
    return registry;
  }
}
