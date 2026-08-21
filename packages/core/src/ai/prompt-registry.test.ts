/**
 * @file packages/core/src/ai/prompt-registry.test.ts
 * Unit tests for Prompt Registry, versioning, lookup, immutability, and foundation fixtures.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { PromptRegistry } from './prompt-registry.js';
import {
  AiPromptNotFoundError,
  AiPromptVersionNotFoundError,
  AiConfigurationInvalidError,
} from './ai-errors.js';
import type { PromptDefinition } from './prompt-types.js';

describe('PromptRegistry', () => {
  it('registers and retrieves prompt definitions by exact version', () => {
    const registry = new PromptRegistry();

    const samplePrompt: PromptDefinition<{ name: string }, { greeting: string }> = {
      id: 'test.greeting',
      version: 1,
      description: 'Sample greeting prompt v1',
      inputSchema: z.object({ name: z.string().min(1) }),
      outputSchema: z.object({ greeting: z.string().min(1) }).strict(),
      buildMessages: input => [
        { role: 'SYSTEM', content: 'Say hello' },
        { role: 'USER', content: `Name: ${input.name}` },
      ],
    };

    registry.register(samplePrompt);

    const retrieved = registry.get('test.greeting', 1);
    assert.equal(retrieved.id, 'test.greeting');
    assert.equal(retrieved.version, 1);
    assert.equal(retrieved.description, 'Sample greeting prompt v1');
  });

  it('retrieves the latest version when version parameter is omitted', () => {
    const registry = new PromptRegistry();

    const promptV1: PromptDefinition<{ text: string }, { result: string }> = {
      id: 'test.evolution',
      version: 1,
      description: 'Prompt v1',
      inputSchema: z.object({ text: z.string() }),
      outputSchema: z.object({ result: z.string() }),
      buildMessages: input => [{ role: 'USER', content: input.text }],
    };

    const promptV2: PromptDefinition<
      { text: string; mode: string },
      { result: string; mode: string }
    > = {
      id: 'test.evolution',
      version: 2,
      description: 'Prompt v2 with mode parameter',
      inputSchema: z.object({ text: z.string(), mode: z.string() }),
      outputSchema: z.object({ result: z.string(), mode: z.string() }),
      buildMessages: input => [{ role: 'USER', content: `${input.text} (${input.mode})` }],
    };

    registry.register(promptV1);
    registry.register(promptV2);

    const latest = registry.get('test.evolution');
    assert.equal(latest.version, 2);
    assert.equal(latest.description, 'Prompt v2 with mode parameter');

    const specificV1 = registry.get('test.evolution', 1);
    assert.equal(specificV1.version, 1);
  });

  it('throws AiPromptNotFoundError when prompt ID is unknown', () => {
    const registry = new PromptRegistry();

    assert.throws(
      () => registry.get('non.existent.prompt'),
      (err: unknown) =>
        err instanceof AiPromptNotFoundError && err.promptId === 'non.existent.prompt',
    );
  });

  it('throws AiPromptVersionNotFoundError when prompt exists but requested version does not', () => {
    const registry = new PromptRegistry();

    registry.register({
      id: 'test.versioned',
      version: 1,
      description: 'Only v1 exists',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      buildMessages: () => [{ role: 'USER', content: 'test' }],
    });

    assert.throws(
      () => registry.get('test.versioned', 5),
      (err: unknown) =>
        err instanceof AiPromptVersionNotFoundError &&
        err.promptId === 'test.versioned' &&
        err.version === 5,
    );
  });

  it('enforces Immutability: throws error when attempting to overwrite an existing prompt version', () => {
    const registry = new PromptRegistry();

    const def: PromptDefinition = {
      id: 'test.immutable',
      version: 1,
      description: 'Original definition',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      buildMessages: () => [{ role: 'USER', content: 'v1' }],
    };

    registry.register(def);

    assert.throws(
      () => registry.register({ ...def, description: 'Mutated definition' }),
      (err: unknown) => err instanceof AiConfigurationInvalidError,
    );
  });

  it('correctly tracks versions and checks existence with has()', () => {
    const registry = new PromptRegistry();

    registry.register({
      id: 'test.checker',
      version: 1,
      description: 'v1',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      buildMessages: () => [{ role: 'USER', content: 'test' }],
    });

    registry.register({
      id: 'test.checker',
      version: 3,
      description: 'v3',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      buildMessages: () => [{ role: 'USER', content: 'test' }],
    });

    assert.equal(registry.has('test.checker'), true);
    assert.equal(registry.has('test.checker', 1), true);
    assert.equal(registry.has('test.checker', 2), false);
    assert.equal(registry.has('test.checker', 3), true);
    assert.equal(registry.has('unknown'), false);

    assert.deepEqual(registry.getVersions('test.checker'), [1, 3]);
  });

  it('lists registered prompt summaries in sorted order', () => {
    const registry = new PromptRegistry();

    registry.register({
      id: 'b.prompt',
      version: 1,
      description: 'B v1',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      buildMessages: () => [{ role: 'USER', content: 'b' }],
    });

    registry.register({
      id: 'a.prompt',
      version: 2,
      description: 'A v2',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      buildMessages: () => [{ role: 'USER', content: 'a2' }],
    });

    registry.register({
      id: 'a.prompt',
      version: 1,
      description: 'A v1',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      buildMessages: () => [{ role: 'USER', content: 'a1' }],
    });

    const list = registry.list();
    assert.equal(list.length, 3);
    assert.equal(list[0]?.id, 'a.prompt');
    assert.equal(list[0]?.version, 1);
    assert.equal(list[1]?.id, 'a.prompt');
    assert.equal(list[1]?.version, 2);
    assert.equal(list[2]?.id, 'b.prompt');
  });

  it('creates default registry with preloaded controlled foundation fixtures', () => {
    const defaultRegistry = PromptRegistry.createDefault();

    assert.ok(defaultRegistry.has('fixture.system.health', 1));
    assert.ok(defaultRegistry.has('fixture.structured.eval', 1));
    assert.ok(defaultRegistry.has('fixture.structured.eval', 2));
    assert.ok(defaultRegistry.has('fixture.bounded.retry', 1));

    const healthDef = defaultRegistry.get('fixture.system.health', 1);
    assert.equal(healthDef.id, 'fixture.system.health');
    assert.equal(healthDef.version, 1);

    const evalV1 = defaultRegistry.get('fixture.structured.eval', 1);
    const evalV2 = defaultRegistry.get('fixture.structured.eval', 2);
    assert.equal(evalV1.version, 1);
    assert.equal(evalV2.version, 2);
  });
});
