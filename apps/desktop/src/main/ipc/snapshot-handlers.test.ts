import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleListSnapshots,
  handleCreateSnapshot,
  handleSetBaseline,
  handleDeleteSnapshot,
} from './snapshot-handlers.js';
import type { SnapshotService } from '@ai-quality/core';

describe('Snapshot Handlers Unit Tests', () => {
  const dummySnapshot = {
    id: '22222222-2222-4222-8222-222222222222',
    sourceId: 'src-1',
    indexRunId: 'run-1',
    label: 'Baseline 1',
    kind: 'MANUAL_BASELINE' as const,
    status: 'COMPLETE' as const,
    snapshotVersion: 1,
    fingerprint: 'fp-123',
    fileCount: 10,
    sourceFileCount: 8,
    testFileCount: 2,
    isBaseline: true,
    gitHeadCommit: null,
    gitBranch: null,
    createdAt: new Date().toISOString(),
  };

  const mockService = {
    listSnapshots: async () => [dummySnapshot],
    createSnapshot: async () => dummySnapshot,
    setBaseline: async () => dummySnapshot,
    deleteSnapshot: async () => {},
  } as unknown as SnapshotService;

  const validProjectUuid = '11111111-1111-4111-8111-111111111111';
  const validSnapshotUuid = '22222222-2222-4222-8222-222222222222';

  it('should list snapshots with valid projectId', async () => {
    const res = await handleListSnapshots(validProjectUuid, mockService);
    assert.deepStrictEqual(res, [dummySnapshot]);
  });

  it('should create snapshot with valid input', async () => {
    const res = await handleCreateSnapshot(
      { projectId: validProjectUuid, label: 'New Baseline' },
      mockService,
    );
    assert.deepStrictEqual(res, dummySnapshot);
  });

  it('should set baseline with valid input', async () => {
    const res = await handleSetBaseline(
      { projectId: validProjectUuid, snapshotId: validSnapshotUuid },
      mockService,
    );
    assert.deepStrictEqual(res, dummySnapshot);
  });

  it('should delete snapshot with valid input', async () => {
    const res = await handleDeleteSnapshot(
      { projectId: validProjectUuid, snapshotId: validSnapshotUuid },
      mockService,
    );
    assert.deepStrictEqual(res, { deleted: true });
  });

  it('should reject invalid UUIDs', async () => {
    await assert.rejects(async () => {
      await handleListSnapshots('invalid-uuid', mockService);
    });
  });
});
