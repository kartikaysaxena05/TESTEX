/**
 * @file apps/desktop/src/main/ipc/embedding-handlers.test.ts
 * Unit tests for Embedding & Vector Retrieval IPC handlers.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  handleGetEmbeddingIndexStatus,
  handleIndexSubjects,
  handleVectorSearchSimilar,
  handleReindexStaleEmbeddings,
  setVectorServicesForTesting,
} from './embedding-handlers.js';
import { AiInvalidRequestError } from '@ai-quality/core';

describe('Embedding IPC Handlers Unit Tests', () => {
  let mockIndexService: any;
  let mockSearchService: any;
  const testProjectId = randomUUID();

  beforeEach(() => {
    mockIndexService = {
      getIndexStatus: async (projectId: string) => ({
        projectId,
        providerId: 'FAKE',
        model: 'fake-embedding-v1',
        dimensions: 1536,
        totalIndexed: 5,
        totalStale: 1,
        totalFailed: 0,
        lastIndexedAt: new Date().toISOString(),
      }),
      indexSubjects: async (input: any) => ({
        projectId: input.projectId,
        totalProcessed: 2,
        succeededCount: 2,
        skippedCount: 0,
        failedCount: 0,
        durationMs: 15,
      }),
      reindexStale: async (projectId: string) => ({
        projectId,
        totalProcessed: 1,
        succeededCount: 1,
        skippedCount: 0,
        failedCount: 0,
        durationMs: 10,
      }),
    };

    mockSearchService = {
      searchSimilar: async (_query: any) => [
        {
          subjectId: randomUUID(),
          subjectType: 'REQUIREMENT',
          similarity: 0.985,
          distance: 0.015,
          embeddingId: randomUUID(),
          inputSha256: 'test-sha',
          metadata: { key: 'REQ-1' },
        },
      ],
    };

    setVectorServicesForTesting(mockIndexService as any, mockSearchService as any);
  });

  afterEach(() => {
    setVectorServicesForTesting(null, null);
  });

  describe('handleGetEmbeddingIndexStatus', () => {
    it('returns index status for valid project ID', async () => {
      const result = await handleGetEmbeddingIndexStatus(
        { projectId: testProjectId },
        mockIndexService,
      );
      assert.strictEqual(result.projectId, testProjectId);
      assert.strictEqual(result.totalIndexed, 5);
    });

    it('rejects invalid project ID with Zod validation error', async () => {
      await assert.rejects(
        async () => handleGetEmbeddingIndexStatus({ projectId: 'not-a-uuid' }, mockIndexService),
        AiInvalidRequestError,
      );
    });
  });

  describe('handleIndexSubjects', () => {
    it('executes subject indexing for valid payload', async () => {
      const result = await handleIndexSubjects(
        {
          projectId: testProjectId,
          subjectType: 'REQUIREMENT',
          forceReindex: true,
        },
        mockIndexService,
      );

      assert.strictEqual(result.projectId, testProjectId);
      assert.strictEqual(result.succeededCount, 2);
    });

    it('rejects invalid subjectType', async () => {
      await assert.rejects(
        async () =>
          handleIndexSubjects(
            {
              projectId: testProjectId,
              subjectType: 'INVALID_SUBJECT_TYPE' as any,
            },
            mockIndexService,
          ),
        AiInvalidRequestError,
      );
    });
  });

  describe('handleVectorSearchSimilar', () => {
    it('executes similarity search for valid query', async () => {
      const matches = await handleVectorSearchSimilar(
        {
          projectId: testProjectId,
          queryText: 'Search for authentication requirements',
          topK: 5,
        },
        mockSearchService,
      );

      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0]!.subjectType, 'REQUIREMENT');
      assert.ok(matches[0]!.similarity > 0.9);
    });

    it('rejects query without project ID', async () => {
      await assert.rejects(
        async () =>
          handleVectorSearchSimilar(
            {
              queryText: 'Missing project ID query',
            } as any,
            mockSearchService,
          ),
        AiInvalidRequestError,
      );
    });
  });

  describe('handleReindexStaleEmbeddings', () => {
    it('reindexes stale embeddings for project', async () => {
      const result = await handleReindexStaleEmbeddings(
        { projectId: testProjectId },
        mockIndexService,
      );

      assert.strictEqual(result.projectId, testProjectId);
      assert.strictEqual(result.succeededCount, 1);
    });
  });
});
