/**
 * @file packages/core/src/ai/vector-search-service.test.ts
 * Integration tests for VectorSearchService: similarity search, text queries, topK bounding, and project isolation.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '../database/client.js';
import { VectorIndexService } from './vector-index-service.js';
import { VectorSearchService } from './vector-search-service.js';
import { AiProviderGateway } from './ai-provider-gateway.js';
import { AiProviderRegistry } from './ai-provider-registry.js';
import { FakeAiProvider } from './fake-ai-provider.js';
import { AiVectorSearchInvalidQueryError } from './ai-errors.js';

describe('VectorSearchService Integration Tests', () => {
  const prisma = getPrismaClient()!;
  let fakeProvider: FakeAiProvider;
  let gateway: AiProviderGateway;
  let indexService: VectorIndexService;
  let searchService: VectorSearchService;

  let projectIdA: string;
  let projectIdB: string;
  let reqA1: string;
  let reqA2: string;
  let reqB1: string;

  before(async () => {
    fakeProvider = new FakeAiProvider();
    const registry = new AiProviderRegistry([fakeProvider]);
    gateway = new AiProviderGateway({ registry });
    indexService = new VectorIndexService({ prisma, gateway });
    searchService = new VectorSearchService({ prisma, gateway });

    projectIdA = randomUUID();
    projectIdB = randomUUID();
    reqA1 = randomUUID();
    reqA2 = randomUUID();
    reqB1 = randomUUID();

    await prisma.project.create({
      data: { id: projectIdA, name: 'Search Test Project A' },
    });
    await prisma.project.create({
      data: { id: projectIdB, name: 'Search Test Project B' },
    });

    await prisma.requirement.create({
      data: {
        id: reqA1,
        projectId: projectIdA,
        requirementKey: 'REQ-SCH-1',
        title: 'User Authentication System',
        originalText: 'System shall allow secure login with MFA tokens.',
      },
    });

    await prisma.requirement.create({
      data: {
        id: reqA2,
        projectId: projectIdA,
        requirementKey: 'REQ-SCH-2',
        title: 'Payment Invoicing System',
        originalText: 'System shall generate PDF receipts for all transactions.',
      },
    });

    await prisma.requirement.create({
      data: {
        id: reqB1,
        projectId: projectIdB,
        requirementKey: 'REQ-SCH-B1',
        title: 'User Authentication System in B',
        originalText: 'System shall allow secure login with MFA tokens.',
      },
    });

    // Index both projects
    await indexService.indexSubjects({ projectId: projectIdA, subjectType: 'REQUIREMENT' });
    await indexService.indexSubjects({ projectId: projectIdB, subjectType: 'REQUIREMENT' });
  });

  after(async () => {
    try {
      await prisma.vectorEmbedding.deleteMany({
        where: { projectId: { in: [projectIdA, projectIdB] } },
      });
      await prisma.requirement.deleteMany({
        where: { projectId: { in: [projectIdA, projectIdB] } },
      });
      await prisma.project.deleteMany({ where: { id: { in: [projectIdA, projectIdB] } } });
    } catch {
      // Ignore cleanup error
    }
  });

  it('searches similar requirements by natural language queryText', async () => {
    const results = await searchService.searchSimilar({
      projectId: projectIdA,
      queryText: 'User Authentication System',
      topK: 10,
    });

    assert.strictEqual(results.length, 2);
    assert.ok(results[0]);
    assert.ok(typeof results[0].similarity === 'number');
    assert.ok(typeof results[0].distance === 'number');
    assert.ok(results[0].metadata);
  });

  it('bounds and clamps topK properly', async () => {
    const results = await searchService.searchSimilar({
      projectId: projectIdA,
      queryText: 'System requirement',
      topK: 1,
    });

    assert.strictEqual(results.length, 1);
  });

  it('searches by explicit queryVector with exact match high similarity', async () => {
    // Find the vector stored for reqA1
    const storedA1 = await prisma.vectorEmbedding.findFirst({
      where: { projectId: projectIdA, subjectId: reqA1 },
    });
    assert.ok(storedA1);

    // Get the vector for reqA1 via repository findCurrentEmbedding
    const current = await indexService['repository'].findCurrentEmbedding(
      projectIdA,
      'REQUIREMENT',
      reqA1,
      indexService.getEffectiveProfile(),
    );
    assert.ok(current);

    // Search with exact queryVector
    const profile = searchService.getEffectiveProfile();
    const exactQueryVector = FakeAiProvider.generateDeterministicVector(
      'custom-exact-vector',
      1536,
    );
    // Save embedding for reqA1 with exactQueryVector matching effective profile
    await indexService['repository'].saveEmbedding({
      projectId: projectIdA,
      subjectType: 'REQUIREMENT',
      subjectId: reqA1,
      providerId: profile.providerId,
      model: profile.model,
      dimensions: profile.dimensions,
      canonicalizationVersion: profile.canonicalizationVersion,
      inputSha256: 'exact-sha',
      vector: exactQueryVector,
      status: 'CURRENT',
      metadata: { key: 'EXACT' },
    });

    const results = await searchService.searchSimilar({
      projectId: projectIdA,
      queryVector: exactQueryVector,
      minimumSimilarity: 0.999,
      topK: 5,
    });

    assert.ok(results.length >= 1);
    assert.strictEqual(results[0]!.subjectId, reqA1);
    assert.ok(results[0]!.similarity >= 0.999);
  });

  it('strictly enforces project isolation during search', async () => {
    const results = await searchService.searchSimilar({
      projectId: projectIdA,
      queryText: 'User Authentication System',
      topK: 10,
    });

    const crossProjectMatch = results.find(r => r.subjectId === reqB1);
    assert.strictEqual(crossProjectMatch, undefined);
  });

  it('rejects query without text or vector', async () => {
    await assert.rejects(
      async () =>
        searchService.searchSimilar({
          projectId: projectIdA,
        }),
      AiVectorSearchInvalidQueryError,
    );
  });
});
