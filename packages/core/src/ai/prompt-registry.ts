/**
 * @file packages/core/src/ai/prompt-registry.ts
 * Central registry for versioned, immutable prompt definitions and foundation fixtures.
 */

import { z } from 'zod';
import type { PromptDefinition } from './prompt-types.js';
import {
  AiPromptNotFoundError,
  AiPromptVersionNotFoundError,
  AiConfigurationInvalidError,
} from './ai-errors.js';
import { PromptRenderer } from './prompt-renderer.js';
import { createRequirementAnalysisPromptDefinition } from './analysis/analysis-prompt-definition.js';
import { createTestDesignPromptDefinition } from './test-design/test-design-prompt-definition.js';
import { createScenarioGenerationPromptDefinition } from './scenarios/scenario-prompt-definition.js';
import { createCategorizedTestPromptDefinition } from './categorized-tests/categorized-test-prompt-definition.js';
import { createTestSpecificationPromptDefinition } from './specifications/specification-prompt-definition.js';

export class PromptRegistry {
  // Map key: `${id}@${version}`
  private readonly definitions = new Map<string, PromptDefinition<unknown, unknown>>();
  // Map key: id -> sorted list of versions [1, 2, ...]
  private readonly versionIndex = new Map<string, number[]>();

  constructor(initialDefinitions: readonly PromptDefinition<unknown, unknown>[] = []) {
    for (const def of initialDefinitions) {
      this.register(def);
    }
  }

  /**
   * Registers a versioned prompt definition.
   * Enforces immutability: once registered, a specific (id, version) cannot be mutated.
   */
  public register<TInput, TOutput>(definition: PromptDefinition<TInput, TOutput>): void {
    this.validateDefinition(definition);

    const key = this.buildKey(definition.id, definition.version);

    if (this.definitions.has(key)) {
      throw new AiConfigurationInvalidError(
        `Prompt '${definition.id}@${definition.version}' is already registered and cannot be redefined (Immutability Invariant).`,
      );
    }

    this.definitions.set(key, definition as PromptDefinition<unknown, unknown>);

    const versions = this.versionIndex.get(definition.id) ?? [];
    versions.push(definition.version);
    versions.sort((a, b) => a - b);
    this.versionIndex.set(definition.id, versions);
  }

  /**
   * Retrieves a prompt definition by ID and optional version.
   * If version is omitted, returns the latest registered version.
   */
  public get<TInput = unknown, TOutput = unknown>(
    id: string,
    version?: number,
  ): PromptDefinition<TInput, TOutput> {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new AiPromptNotFoundError(String(id));
    }

    const trimmedId = id.trim();
    const versions = this.versionIndex.get(trimmedId);

    if (!versions || versions.length === 0) {
      throw new AiPromptNotFoundError(trimmedId);
    }

    const resolvedVersion = version ?? versions[versions.length - 1]!;
    const key = this.buildKey(trimmedId, resolvedVersion);

    const definition = this.definitions.get(key);
    if (!definition) {
      throw new AiPromptVersionNotFoundError(trimmedId, resolvedVersion);
    }

    return definition as PromptDefinition<TInput, TOutput>;
  }

  /**
   * Checks whether a prompt definition exists for the given ID and optional version.
   */
  public has(id: string, version?: number): boolean {
    if (!id || typeof id !== 'string') return false;
    const trimmedId = id.trim();
    const versions = this.versionIndex.get(trimmedId);
    if (!versions || versions.length === 0) return false;

    if (version !== undefined) {
      return this.definitions.has(this.buildKey(trimmedId, version));
    }
    return true;
  }

  /**
   * Returns all registered versions for a given prompt ID.
   */
  public getVersions(id: string): readonly number[] {
    const versions = this.versionIndex.get(id.trim());
    return versions ? Object.freeze([...versions]) : [];
  }

  /**
   * Lists summary metadata for all registered prompts and versions.
   */
  public list(): readonly { id: string; version: number; description: string }[] {
    const results: { id: string; version: number; description: string }[] = [];
    for (const def of this.definitions.values()) {
      results.push({
        id: def.id,
        version: def.version,
        description: def.description,
      });
    }
    return Object.freeze(results.sort((a, b) => a.id.localeCompare(b.id) || a.version - b.version));
  }

  /**
   * Creates a default PromptRegistry preloaded with Phase 44 foundation test fixtures.
   * NOTE: Does NOT include future domain prompts (embeddings, RAG, requirement analysis, test gen).
   */
  public static createDefault(): PromptRegistry {
    const registry = new PromptRegistry();

    // 1. Fixture: System Health Check v1
    registry.register({
      id: 'fixture.system.health',
      version: 1,
      description: 'Controlled foundation fixture for verifying structured health output contract.',
      inputSchema: z.object({
        checkTarget: z.string().min(1).max(100),
      }),
      outputSchema: z
        .object({
          status: z.enum(['HEALTHY', 'DEGRADED', 'UNHEALTHY']),
          latencyMs: z.number().int().nonnegative(),
          notes: z.string().optional(),
        })
        .strict(),
      defaultConfig: {
        temperature: 0.0,
        maxOutputTokens: 256,
      },
      buildMessages: input => [
        {
          role: 'SYSTEM',
          content:
            'You are a system health evaluation fixture. Always return valid JSON conforming to the requested schema.',
        },
        {
          role: 'USER',
          content: PromptRenderer.wrapUntrustedData('check_target', input.checkTarget),
        },
      ],
    });

    // 2. Fixture: Structured Evaluation v1
    registry.register({
      id: 'fixture.structured.eval',
      version: 1,
      description:
        'Controlled foundation fixture for testing structured parsing and schema validation.',
      inputSchema: z.object({
        text: z.string().min(1).max(10_000),
        domain: z.string().max(100).optional(),
      }),
      outputSchema: z
        .object({
          score: z.number().min(0).max(100),
          category: z.string().min(1).max(64),
          tags: z.array(z.string().min(1).max(32)),
        })
        .strict(),
      defaultConfig: {
        temperature: 0.1,
        maxOutputTokens: 512,
      },
      buildMessages: input => [
        {
          role: 'SYSTEM',
          content:
            'Evaluate the text provided in the domain payload. Return structured JSON with score, category, and tags.',
        },
        {
          role: 'USER',
          content: `${PromptRenderer.wrapUntrustedData('input_text', input.text)}\nDomain: ${input.domain ?? 'general'}`,
        },
      ],
    });

    // 3. Fixture: Structured Evaluation v2 (Version Evolution Example)
    registry.register({
      id: 'fixture.structured.eval',
      version: 2,
      description:
        'Controlled foundation fixture v2 demonstrating schema evolution with confidence field.',
      inputSchema: z.object({
        text: z.string().min(1).max(10_000),
        domain: z.string().min(1).max(100),
        strictMode: z.boolean(),
      }),
      outputSchema: z
        .object({
          score: z.number().min(0).max(100),
          category: z.string().min(1).max(64),
          tags: z.array(z.string().min(1).max(32)),
          confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
        })
        .strict(),
      defaultConfig: {
        temperature: 0.1,
        maxOutputTokens: 512,
      },
      buildMessages: input => [
        {
          role: 'SYSTEM',
          content:
            'Evaluate the text v2 with strict mode and confidence rating. Return structured JSON.',
        },
        {
          role: 'USER',
          content: `${PromptRenderer.wrapUntrustedData('input_text', input.text)}\nDomain: ${input.domain}\nStrictMode: ${String(input.strictMode)}`,
        },
      ],
    });

    // 4. Fixture: Bounded Retry Fixture v1
    registry.register({
      id: 'fixture.bounded.retry',
      version: 1,
      description: 'Controlled foundation fixture for verifying retry behavior on schema failures.',
      inputSchema: z.object({
        testName: z.string().min(1).max(128),
      }),
      outputSchema: z
        .object({
          success: z.boolean(),
          executionId: z.string().min(1),
        })
        .strict(),
      defaultConfig: {
        temperature: 0.0,
        maxOutputTokens: 256,
      },
      buildMessages: input => [
        {
          role: 'SYSTEM',
          content: 'Return success and executionId JSON payload.',
        },
        {
          role: 'USER',
          content: PromptRenderer.wrapUntrustedData('test_name', input.testName),
        },
      ],
    });

    // 5. Phase 47: LLM Requirement Analysis Prompt v1
    registry.register(createRequirementAnalysisPromptDefinition());

    // 6. Phase 48: Test Design Intelligence Prompt v1
    registry.register(createTestDesignPromptDefinition());

    // 7. Phase 49: Requirement-to-Test Scenario Generation Prompt v1
    registry.register(createScenarioGenerationPromptDefinition());

    // 8. Phase 50: Categorized Test Generation Prompt v1
    registry.register(createCategorizedTestPromptDefinition());

    // 9. Phase 51: Test Specification Enrichment Prompt v1
    registry.register(createTestSpecificationPromptDefinition());

    return registry;
  }

  private buildKey(id: string, version: number): string {
    return `${id}@${version}`;
  }

  private validateDefinition(def: PromptDefinition<unknown, unknown>): void {
    if (!def || typeof def !== 'object') {
      throw new AiConfigurationInvalidError('Prompt definition must be a valid object.');
    }
    if (!def.id || typeof def.id !== 'string' || def.id.trim().length === 0) {
      throw new AiConfigurationInvalidError('Prompt definition requires a non-empty string ID.');
    }
    if (typeof def.version !== 'number' || !Number.isInteger(def.version) || def.version < 1) {
      throw new AiConfigurationInvalidError(
        `Prompt '${def.id}' version must be a positive integer (got ${String(def.version)}).`,
      );
    }
    if (!def.inputSchema || typeof def.inputSchema.safeParse !== 'function') {
      throw new AiConfigurationInvalidError(
        `Prompt '${def.id}@${def.version}' requires a valid Zod input schema.`,
      );
    }
    if (!def.outputSchema || typeof def.outputSchema.safeParse !== 'function') {
      throw new AiConfigurationInvalidError(
        `Prompt '${def.id}@${def.version}' requires a valid Zod output schema.`,
      );
    }
    if (typeof def.buildMessages !== 'function') {
      throw new AiConfigurationInvalidError(
        `Prompt '${def.id}@${def.version}' requires a buildMessages() function.`,
      );
    }
  }
}
