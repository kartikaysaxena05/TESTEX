/**
 * @file packages/core/src/ai/vector-embedding-repository.test.ts
 * Integration tests for VectorEmbeddingRepository with PostgreSQL and pgvector.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '../database/client.js';
import { VectorEmbeddingRepository } from './vector-embedding-repository.js';
import { FakeAiProvider } from './fake-ai-provider.js';

describe('VectorEmbeddingRepository Integration Tests', () => {
  const prisma = getPrismaClient()!;
  const repository = new VectorEmbeddingRepository();

  let projectIdA: string;
  let projectIdB: string;
  let requirementIdA1: string;
  let requirementIdA2: string;
  let requirementIdB1: string;

  before(async () => {
    projectIdA = randomUUID();
    projectIdB = randomUUID();
    requirementIdA1 = randomUUID();
    requirementIdA2 = randomUUID();
    requirementIdB1 = randomUUID();

    // Seed test projects
    await prisma.project.create({
      data: {
        id: projectIdA,
        name: 'Vector Test Project A',
      },
    });

    await prisma.project.create({
      data: {
        id: projectIdB,
        name: 'Vector Test Project B',
      },
    });

    // Seed test requirements
    await prisma.requirement.create({
      data: {
        id: requirementIdA1,
        projectId: projectIdA,
        requirementKey: 'REQ-VEC-1',
        title: 'Authentication Module',
        originalText: 'User login with OAuth2',
      },
    });

    await prisma.requirement.create({
      data: {
        id: requirementIdA2,
        projectId: projectIdA,
        requirementKey: 'REQ-VEC-2',
        title: 'Billing Module',
        originalText: 'Stripe credit card payments',
      },
    });

    await prisma.requirement.create({
      data: {
        id: requirementIdB1,
        projectId: projectIdB,
        requirementKey: 'REQ-VEC-B1',
        title: 'User Login Module in Project B',
        originalText: 'Project B authentication system',
      },
    });
  });

  after(async () => {
    try {
      await prisma.vectorEmbedding.deleteMany({
        where: { projectId: { in: [projectIdA, projectIdB] } },
      });
      await prisma.requirement.deleteMany({
        where: { projectId: { in: [projectIdA, projectIdB] } },
      });
      await prisma.project.deleteMany({
        where: { id: { in: [projectIdA, projectIdB] } },
      });
    } catch {
      // Ignore cleanup error
    }
  });

  it('persists vector embedding and queries by subject profile', async () => {
    const vector1 = FakeAiProvider.generateDeterministicVector(
      'Authentication Module User login',
      1536,
    );

    const saved = await repository.saveEmbedding({
      projectId: projectIdA,
      subjectType: 'REQUIREMENT',
      subjectId: requirementIdA1,
      providerId: 'FAKE',
      model: 'fake-embedding-v1',
      dimensions: 1536,
      canonicalizationVersion: 1,
      inputSha256: 'a1b2c3d4e5f600112233445566778899aabbccddeeff00112233445566778899',
      vector: vector1,
      status: 'CURRENT',
      metadata: { key: 'REQ-VEC-1' },
    });

    assert.strictEqual(saved.projectId, projectIdA);
    assert.strictEqual(saved.subjectId, requirementIdA1);
    assert.strictEqual(saved.status, 'CURRENT');

    const found = await repository.findCurrentEmbedding(
      projectIdA,
      'REQUIREMENT',
      requirementIdA1,
      {
        providerId: 'FAKE',
        model: 'fake-embedding-v1',
        dimensions: 1536,
        canonicalizationVersion: 1,
      },
    );

    assert.ok(found);
    assert.strictEqual(found.id, saved.id);
    assert.strictEqual(found.inputSha256, saved.inputSha256);
  });

  it('marks embeddings stale on revision', async () => {
    await repository.markSubjectEmbeddingsStale(projectIdA, 'REQUIREMENT', requirementIdA1);

    const found = await repository.findCurrentEmbedding(
      projectIdA,
      'REQUIREMENT',
      requirementIdA1,
      {
        providerId: 'FAKE',
        model: 'fake-embedding-v1',
        dimensions: 1536,
        canonicalizationVersion: 1,
      },
    );

    assert.strictEqual(found, null);
  });

  it('performs cosine similarity search and enforces project isolation', async () => {
    const vecA1 = FakeAiProvider.generateDeterministicVector('User login and auth module', 1536);
    const vecA2 = FakeAiProvider.generateDeterministicVector(
      'Stripe payments and invoice billing',
      1536,
    );
    const vecB1 = FakeAiProvider.generateDeterministicVector('User login and auth module', 1536);

    // Save embeddings in Project A
    await repository.saveEmbedding({
      projectId: projectIdA,
      subjectType: 'REQUIREMENT',
      subjectId: requirementIdA1,
      providerId: 'FAKE',
      model: 'fake-embedding-v1',
      dimensions: 1536,
      canonicalizationVersion: 1,
      inputSha256: 'hash-a1',
      vector: vecA1,
      status: 'CURRENT',
    });

    await repository.saveEmbedding({
      projectId: projectIdA,
      subjectType: 'REQUIREMENT',
      subjectId: requirementIdA2,
      providerId: 'FAKE',
      model: 'fake-embedding-v1',
      dimensions: 1536,
      canonicalizationVersion: 1,
      inputSha256: 'hash-a2',
      vector: vecA2,
      status: 'CURRENT',
    });

    // Save embedding in Project B (with identical content/vector to test leakage)
    await repository.saveEmbedding({
      projectId: projectIdB,
      subjectType: 'REQUIREMENT',
      subjectId: requirementIdB1,
      providerId: 'FAKE',
      model: 'fake-embedding-v1',
      dimensions: 1536,
      canonicalizationVersion: 1,
      inputSha256: 'hash-b1',
      vector: vecB1,
      status: 'CURRENT',
    });

    // Search within Project A
    const resultsA = await repository.searchSimilar({
      projectId: projectIdA,
      queryVector: vecA1,
      profile: {
        providerId: 'FAKE',
        model: 'fake-embedding-v1',
        dimensions: 1536,
      },
      topK: 5,
    });

    assert.strictEqual(resultsA.length, 2);
    // Highest match should be requirementIdA1 (exact match, similarity approx 1.0)
    assert.strictEqual(resultsA[0]!.subjectId, requirementIdA1);
    assert.ok(resultsA[0]!.similarity >= 0.999);
    assert.strictEqual(resultsA[1]!.subjectId, requirementIdA2);

    // Verify 0 cross-project leakage: project B subject must NOT appear in Project A results
    const leaked = resultsA.find(r => r.subjectId === requirementIdB1);
    assert.strictEqual(leaked, undefined);
  });

  it('retrieves index statistics accurately', async () => {
    const stats = await repository.getIndexStatus(projectIdA, {
      providerId: 'FAKE',
      model: 'fake-embedding-v1',
      dimensions: 1536,
    });

    assert.strictEqual(stats.projectId, projectIdA);
    assert.ok(stats.totalIndexed >= 2);
    assert.ok(stats.totalStale >= 1);
  });
});
