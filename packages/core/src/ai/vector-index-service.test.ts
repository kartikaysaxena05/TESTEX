/**
 * @file packages/core/src/ai/vector-index-service.test.ts
 * Integration tests for VectorIndexService: idempotency, staleness, revisions, and lifecycle.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '../database/client.js';
import { VectorIndexService } from './vector-index-service.js';
import { AiProviderGateway } from './ai-provider-gateway.js';
import { AiProviderRegistry } from './ai-provider-registry.js';
import { FakeAiProvider } from './fake-ai-provider.js';

describe('VectorIndexService Integration Tests', () => {
  const prisma = getPrismaClient()!;
  let fakeProvider: FakeAiProvider;
  let gateway: AiProviderGateway;
  let indexService: VectorIndexService;

  let projectId: string;
  let reqId1: string;
  let reqId2: string;

  before(async () => {
    fakeProvider = new FakeAiProvider();
    const registry = new AiProviderRegistry([fakeProvider]);
    gateway = new AiProviderGateway({ registry });
    indexService = new VectorIndexService({ prisma, gateway });

    projectId = randomUUID();
    reqId1 = randomUUID();
    reqId2 = randomUUID();

    await prisma.project.create({
      data: {
        id: projectId,
        name: 'Vector Index Service Test Project',
      },
    });

    await prisma.requirement.create({
      data: {
        id: reqId1,
        projectId,
        requirementKey: 'REQ-IDX-1',
        title: 'Single Sign On',
        originalText: 'System shall support SAML and OAuth SSO.',
        type: 'SECURITY',
        priority: 'HIGH',
      },
    });

    await prisma.requirement.create({
      data: {
        id: reqId2,
        projectId,
        requirementKey: 'REQ-IDX-2',
        title: 'Export Audit Logs',
        originalText: 'System shall allow administrators to export CSV logs.',
        type: 'FUNCTIONAL',
        priority: 'MEDIUM',
      },
    });
  });

  after(async () => {
    try {
      await prisma.vectorEmbedding.deleteMany({ where: { projectId } });
      await prisma.requirement.deleteMany({ where: { projectId } });
      await prisma.project.deleteMany({ where: { id: projectId } });
    } catch {
      // Ignore cleanup error
    }
  });

  it('indexes requirements and verifies idempotency on second run', async () => {
    fakeProvider.resetTelemetry();

    // First indexing run
    const result1 = await indexService.indexSubjects({
      projectId,
      subjectType: 'REQUIREMENT',
    });

    assert.strictEqual(result1.totalProcessed, 2);
    assert.strictEqual(result1.succeededCount, 2);
    assert.strictEqual(result1.skippedCount, 0);
    assert.strictEqual(result1.failedCount, 0);
    assert.strictEqual(fakeProvider.embedCallCount, 2);

    // Second run with unchanged requirements -> MUST skip calling provider embedding API (Idempotency)
    fakeProvider.resetTelemetry();
    const result2 = await indexService.indexSubjects({
      projectId,
      subjectType: 'REQUIREMENT',
    });

    assert.strictEqual(result2.totalProcessed, 2);
    assert.strictEqual(result2.succeededCount, 0);
    assert.strictEqual(result2.skippedCount, 2);
    assert.strictEqual(result2.failedCount, 0);
    assert.strictEqual(fakeProvider.embedCallCount, 0);
  });

  it('forces re-indexing when forceReindex is true', async () => {
    fakeProvider.resetTelemetry();

    const result = await indexService.indexSubjects({
      projectId,
      subjectType: 'REQUIREMENT',
      forceReindex: true,
    });

    assert.strictEqual(result.succeededCount, 2);
    assert.strictEqual(result.skippedCount, 0);
    assert.strictEqual(fakeProvider.embedCallCount, 2);
  });

  it('re-indexes requirement when content changes, marking previous embedding STALE', async () => {
    // Update requirement 1 text
    await prisma.requirement.update({
      where: { id: reqId1 },
      data: {
        originalText: 'System shall support SAML, OAuth SSO, and Passkeys.',
      },
    });

    fakeProvider.resetTelemetry();
    const result = await indexService.indexSubjects({
      projectId,
      subjectType: 'REQUIREMENT',
    });

    // reqId1 changed -> re-indexed; reqId2 unchanged -> skipped
    assert.strictEqual(result.succeededCount, 1);
    assert.strictEqual(result.skippedCount, 1);
    assert.strictEqual(fakeProvider.embedCallCount, 1);

    // Verify STALE record count in DB
    const staleEmbeddings = await prisma.vectorEmbedding.findMany({
      where: {
        projectId,
        subjectId: reqId1,
        status: 'STALE',
      },
    });

    assert.ok(staleEmbeddings.length >= 1);
    assert.ok(staleEmbeddings[0]!.staleAt instanceof Date);
  });
});
