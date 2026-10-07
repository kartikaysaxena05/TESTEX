/**
 * @file packages/core/src/ai-provider/ai-provider-registry.ts
 * Central registry and lifecycle management for AI Provider adapters (Phase 126).
 */

import type { IAiProvider } from './ai-provider-contract.js';
import { OllamaProviderAdapter } from './ollama-provider-adapter.js';
import {
  AiInvalidRequestError,
  AiProviderUnavailableError,
} from './ai-provider-errors.js';
import { AiProviderValidator } from './ai-provider-validator.js';

export class AiProviderRegistry {
  private readonly providers = new Map<string, IAiProvider>();

  constructor(initialProviders: readonly IAiProvider[] = []) {
    for (const provider of initialProviders) {
      this.register(provider);
    }
  }

  /**
   * Factory creating a registry with the default Ollama provider adapter.
   */
  public static createDefault(): AiProviderRegistry {
    return new AiProviderRegistry([new OllamaProviderAdapter()]);
  }

  /**
   * Registers a provider adapter in the registry.
   * Enforces provider ID validation and prevents accidental overwrites without explicit unregister.
   */
  public register(provider: IAiProvider): void {
    if (!provider || !provider.id) {
      throw new AiInvalidRequestError('Cannot register a provider without an ID.');
    }
    const validatedId = AiProviderValidator.validateProviderId(provider.id);
    if (this.providers.has(validatedId)) {
      throw new AiInvalidRequestError(
        `AI Provider '${validatedId}' is already registered. Unregister the existing adapter first.`,
        validatedId,
      );
    }
    this.providers.set(validatedId, provider);
  }

  /**
   * Unregisters a provider adapter from the registry.
   */
  public unregister(providerId: string): boolean {
    const validatedId = AiProviderValidator.validateProviderId(providerId);
    return this.providers.delete(validatedId);
  }

  /**
   * Checks whether a provider with the given ID is registered.
   */
  public has(providerId: string): boolean {
    try {
      const validatedId = AiProviderValidator.validateProviderId(providerId);
      return this.providers.has(validatedId);
    } catch {
      return false;
    }
  }

  /**
   * Resolves a provider adapter by its ID.
   * Throws AiProviderUnavailableError if not found.
   */
  public get(providerId: string): IAiProvider {
    const validatedId = AiProviderValidator.validateProviderId(providerId);
    const provider = this.providers.get(validatedId);
    if (!provider) {
      const available = Array.from(this.providers.keys()).join(', ');
      throw new AiProviderUnavailableError(
        validatedId,
        `AI Provider '${validatedId}' is not registered. Available providers: [${available || 'none'}].`,
      );
    }
    return provider;
  }

  /**
   * Returns a list of all registered provider adapters.
   */
  public list(): readonly IAiProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Returns the count of registered providers.
   */
  public count(): number {
    return this.providers.size;
  }
}
