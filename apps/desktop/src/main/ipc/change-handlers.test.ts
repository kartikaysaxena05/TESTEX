import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleGetChanges, handleRefreshChanges } from './change-handlers.js';
import type { ChangeService } from '@ai-quality/core';

describe('Change Handlers Unit Tests', () => {
  const dummyChangeSet = {
    sourceId: 'src-1',
    baselineSnapshotId: 'snap-1',
    baselineLabel: 'Sprint 12 Baseline',
    currentIndexRunId: 'run-1',
    comparisonVersion: 1,
    isStale: false,
    totalChanges: 1,
    addedCount: 0,
    modifiedCount: 1,
    deletedCount: 0,
    renamedCount: 0,
    unchangedCount: 5,
    changesByClassification: { SOURCE: 1 },
    changesByLanguage: { TypeScript: 1 },
    changes: [
      {
        changeType: 'MODIFIED' as const,
        previousPath: 'src/main.ts',
        currentPath: 'src/main.ts',
        previousHash: 'hash-old',
        currentHash: 'hash-new',
        language: 'TypeScript',
        classification: 'SOURCE',
        directImporters: ['src/app.ts'],
      },
    ],
    comparedAt: new Date().toISOString(),
    warnings: [],
  };

  const mockService = {
    getChanges: async () => dummyChangeSet,
    refreshChanges: async () => dummyChangeSet,
  } as unknown as ChangeService;

  const validUuid = '11111111-1111-4111-8111-111111111111';

  it('should get changes with valid projectId', async () => {
    const res = await handleGetChanges(validUuid, mockService);
    assert.deepStrictEqual(res, dummyChangeSet);
  });

  it('should refresh changes with valid projectId', async () => {
    const res = await handleRefreshChanges(validUuid, mockService);
    assert.deepStrictEqual(res, dummyChangeSet);
  });

  it('should reject invalid projectId', async () => {
    await assert.rejects(async () => {
      await handleGetChanges('not-uuid', mockService);
    });
  });
});
