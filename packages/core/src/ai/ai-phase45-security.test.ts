/**
 * @file packages/core/src/ai/ai-phase45-security.test.ts
 * Rigorous security, isolation, and defensive boundary tests for Phase 45 Vector & Retrieval Foundation.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '../database/client.js';
import { VectorEmbeddingRepository } from './vector-embedding-repository.js';
import { VectorSearchService } from './vector-search-service.js';
import { FakeAiProvider } from './fake-ai-provider.js';
import { AiProviderGateway } from './ai-provider-gateway.js';
import { AiProviderRegistry } from './ai-provider-registry.js';
import { VectorValidator } from './vector-validator.js';
import {
  AiEmbeddingValidationFailedError,
  AiEmbeddingDimensionMismatchError,
} from './ai-errors.js';

describe('Phase 45 Security & Isolation Tests', () => {
  const prisma = getPrismaClient()!;
  const repository = new VectorEmbeddingRepository();
  let fakeProvider: FakeAiProvider;
  let gateway: AiProviderGateway;
  let searchService: VectorSearchService;

  let project1Id: string;
  let project2Id: string;
  let req1Id: string;
  let req2Id: string;

  before(async () => {
    fakeProvider = new FakeAiProvider();
    const registry = new AiProviderRegistry([fakeProvider]);
    gateway = new AiProviderGateway({ registry });
    searchService = new VectorSearchService({ prisma, gateway });

    project1Id = randomUUID();
    project2Id = randomUUID();
    req1Id = randomUUID();
    req2Id = randomUUID();

    await prisma.project.create({ data: { id: project1Id, name: 'Security Project 1' } });
    await prisma.project.create({ data: { id: project2Id, name: 'Security Project 2' } });

    await prisma.requirement.create({
      data: {
        id: req1Id,
        projectId: project1Id,
        requirementKey: 'REQ-SEC-1',
        title: 'Project 1 Secret Requirement',
        originalText: 'Confidential project 1 feature details.',
      },
    });

    await prisma.requirement.create({
      data: {
        id: req2Id,
        projectId: project2Id,
        requirementKey: 'REQ-SEC-2',
        title: 'Project 2 Confidential Requirement',
        originalText: 'Confidential project 2 feature details.',
      },
    });

    const vec1 = FakeAiProvider.generateDeterministicVector(
      'Confidential project 1 feature details.',
      1536,
    );
    const vec2 = FakeAiProvider.generateDeterministicVector(
      'Confidential project 2 feature details.',
      1536,
    );

    await repository.saveEmbedding({
      projectId: project1Id,
      subjectType: 'REQUIREMENT',
      subjectId: req1Id,
      providerId: 'FAKE',
      model: 'fake-embedding-v1',
      dimensions: 1536,
      canonicalizationVersion: 1,
      inputSha256: 'sha-p1',
      vector: vec1,
      status: 'CURRENT',
      metadata: { key: 'REQ-SEC-1' },
    });

    await repository.saveEmbedding({
      projectId: project2Id,
      subjectType: 'REQUIREMENT',
      subjectId: req2Id,
      providerId: 'FAKE',
      model: 'fake-embedding-v1',
      dimensions: 1536,
      canonicalizationVersion: 1,
      inputSha256: 'sha-p2',
      vector: vec2,
      status: 'CURRENT',
      metadata: { key: 'REQ-SEC-2' },
    });
  });

  after(async () => {
    try {
      await prisma.vectorEmbedding.deleteMany({
        where: { projectId: { in: [project1Id, project2Id] } },
      });
      await prisma.requirement.deleteMany({
        where: { projectId: { in: [project1Id, project2Id] } },
      });
      await prisma.project.deleteMany({ where: { id: { in: [project1Id, project2Id] } } });
    } catch {
      // Ignore cleanup error
    }
  });

  it('verifies zero credential leakage in persisted vector records and metadata', async () => {
    const rawRows = await prisma.vectorEmbedding.findMany({
      where: { projectId: project1Id },
    });

    for (const row of rawRows) {
      const serialized = JSON.stringify(row);
      assert.strictEqual(serialized.includes('sk-'), false, 'Should not contain API key tokens');
      assert.strictEqual(serialized.includes('Bearer'), false, 'Should not contain Bearer tokens');
      assert.strictEqual(
        serialized.includes('secret'),
        false,
        'Should not contain provider secrets',
      );
      assert.strictEqual(serialized.includes('password'), false, 'Should not contain passwords');
    }
  });

  it('guarantees 0 cross-project vector search results under adversarial queries', async () => {
    // Project 1 searches for exact text of Project 2
    const results = await searchService.searchSimilar({
      projectId: project1Id,
      queryText: 'Confidential project 2 feature details.',
      topK: 10,
    });

    // Zero matches from Project 2
    for (const match of results) {
      assert.notStrictEqual(match.subjectId, req2Id);
    }
  });

  it('rejects vector validation with NaN, Infinity, or string elements', () => {
    assert.throws(
      () => VectorValidator.validateVector([0.5, NaN, -0.2], 3),
      AiEmbeddingValidationFailedError,
    );
    assert.throws(
      () => VectorValidator.validateVector([0.5, Infinity, -0.2], 3),
      AiEmbeddingValidationFailedError,
    );
    assert.throws(
      () => VectorValidator.validateVector([0.5, '0.1' as any, -0.2], 3),
      AiEmbeddingValidationFailedError,
    );
  });

  it('rejects vector dimension mismatch', () => {
    assert.throws(
      () => VectorValidator.validateVector([0.1, 0.2, 0.3], 1536),
      AiEmbeddingDimensionMismatchError,
    );
  });

  it('model profile mismatch prevents cross-model contamination', async () => {
    // Query with non-matching model name 'other-model'
    const results = await repository.searchSimilar({
      projectId: project1Id,
      queryVector: FakeAiProvider.generateDeterministicVector('query', 1536),
      profile: {
        providerId: 'FAKE',
        model: 'different-incompatible-model-v2',
        dimensions: 1536,
      },
      topK: 5,
    });

    // Must return 0 results because model profiles differ
    assert.strictEqual(results.length, 0);
  });
});
