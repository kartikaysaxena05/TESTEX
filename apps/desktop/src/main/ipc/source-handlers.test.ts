import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectSourceDto } from '@ai-quality/contracts';
import {
  handleGetSource,
  handlePickDirectory,
  handleAttachLocalDirectory,
  handleDetachSource,
  handleValidateSource,
  handleRefreshSourceMetadata,
} from './source-handlers.js';
import { SourceService } from '@ai-quality/core';

describe('Source IPC Handlers Unit Tests', () => {
  const sampleSourceDto: ProjectSourceDto = {
    id: 'source-123',
    projectId: '3a773f11-8e6c-470d-8c6a-76f97be584f0',
    kind: 'LOCAL_DIRECTORY',
    displayName: 'test-app',
    rootPath: '/tmp/test-app',
    identityFingerprint: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    activeBaselineSnapshotId: null,
    availability: 'AVAILABLE',
    filesystemCreatedAt: new Date().toISOString(),
    filesystemModifiedAt: new Date().toISOString(),
    metadataRefreshedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastValidatedAt: new Date().toISOString(),
  };

  const mockService = {
    getSource: async (projectId: string) => {
      if (projectId === sampleSourceDto.projectId) {
        return sampleSourceDto;
      }
      return null;
    },
    attachLocalDirectory: async (projectId: string, _path: string) => {
      return { ...sampleSourceDto, projectId };
    },
    detachSource: async (_projectId: string) => {
      return { detached: true as const };
    },
    validateSource: async (projectId: string) => {
      return { ...sampleSourceDto, projectId };
    },
    refreshMetadata: async (projectId: string) => {
      return { ...sampleSourceDto, projectId };
    },
  } as unknown as SourceService;

  it('should handle getSource for a valid project UUID', async () => {
    const result = await handleGetSource(sampleSourceDto.projectId, mockService);
    assert.deepStrictEqual(result, sampleSourceDto);
  });

  it('should reject getSource with malformed UUID input', async () => {
    await assert.rejects(
      async () => await handleGetSource('not-a-uuid', mockService),
      /Project ID must be a valid UUID/,
    );
  });

  it('should handle attachLocalDirectory when dialog is cancelled', async () => {
    const mockCancelledPicker = async () => ({ cancelled: true as const });
    const result = await handleAttachLocalDirectory(
      sampleSourceDto.projectId,
      mockService,
      mockCancelledPicker,
    );

    assert.deepStrictEqual(result, { cancelled: true });
  });

  it('should handle attachLocalDirectory when folder is chosen', async () => {
    const mockSuccessPicker = async () => ({
      cancelled: false as const,
      directoryPath: '/tmp/test-app',
    });
    const result = await handleAttachLocalDirectory(
      sampleSourceDto.projectId,
      mockService,
      mockSuccessPicker,
    );

    assert.strictEqual(result.cancelled, false);
    if (!result.cancelled) {
      assert.strictEqual(result.source.displayName, 'test-app');
      assert.strictEqual(result.source.identityFingerprint, sampleSourceDto.identityFingerprint);
    }
  });

  it('should handle detachSource for a valid project UUID', async () => {
    const result = await handleDetachSource(sampleSourceDto.projectId, mockService);
    assert.deepStrictEqual(result, { detached: true });
  });

  it('should handle validateSource for a valid project UUID', async () => {
    const result = await handleValidateSource(sampleSourceDto.projectId, mockService);
    assert.strictEqual(result.availability, 'AVAILABLE');
  });

  it('should handle refreshMetadata for a valid project UUID', async () => {
    const result = await handleRefreshSourceMetadata(sampleSourceDto.projectId, mockService);
    assert.strictEqual(result.availability, 'AVAILABLE');
    assert.strictEqual(result.identityFingerprint, sampleSourceDto.identityFingerprint);
  });

  it('should handle pickDirectory when cancelled', async () => {
    const mockCancelled = async () => ({ cancelled: true as const });
    const result = await handlePickDirectory(mockCancelled);
    assert.deepStrictEqual(result, { cancelled: true });
  });

  it('should handle pickDirectory when folder is selected', async () => {
    const mockSelected = async () => ({
      cancelled: false as const,
      directoryPath: '/Users/test/my-project',
    });
    const result = await handlePickDirectory(mockSelected);
    assert.deepStrictEqual(result, {
      cancelled: false,
      directoryPath: '/Users/test/my-project',
      folderName: 'my-project',
    });
  });
});

