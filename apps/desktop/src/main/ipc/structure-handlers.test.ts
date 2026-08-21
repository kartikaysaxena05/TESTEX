import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SourceStructureDto } from '@ai-quality/contracts';
import { handleGetSourceStructure, handleRefreshSourceStructure } from './structure-handlers.js';
import { SourceStructureService } from '@ai-quality/core';

describe('Source Structure IPC Handlers Unit Tests', () => {
  const sampleStructureDto: SourceStructureDto = {
    sourceId: '3a773f11-8e6c-470d-8c6a-76f97be584f0',
    rootName: 'web-client',
    entries: [
      { relativePath: 'src', name: 'src', kind: 'DIRECTORY', depth: 1 },
      { relativePath: 'src/index.ts', name: 'index.ts', kind: 'FILE', depth: 2 },
    ],
    summary: {
      filesDiscovered: 1,
      directoriesDiscovered: 1,
      symlinksDiscovered: 0,
      totalDiscovered: 2,
      includedFiles: 1,
      includedDirectories: 1,
      totalIncluded: 2,
      ignoredEntries: 0,
      safetyExcludedEntries: 0,
      earlyPrunedDirectories: 0,
      ignoreFilesLoaded: 0,
      ignoreRulesLoaded: 0,
      warnings: [],
    },
    truncated: false,
    truncationReason: null,
    scannedAt: new Date().toISOString(),
  };

  const validProjectId = '3a773f11-8e6c-470d-8c6a-76f97be584f0';

  const mockService = {
    getSourceStructure: async (projectId: string) => {
      if (projectId === validProjectId) {
        return sampleStructureDto;
      }
      return null;
    },
    refreshStructure: async (projectId: string) => {
      if (projectId === validProjectId) {
        return sampleStructureDto;
      }
      throw new Error('Project not found');
    },
  } as unknown as SourceStructureService;

  it('should handle getSourceStructure for a valid project UUID', async () => {
    const result = await handleGetSourceStructure(validProjectId, mockService);
    assert.deepStrictEqual(result, sampleStructureDto);
  });

  it('should reject getSourceStructure with malformed UUID', async () => {
    await assert.rejects(
      async () => await handleGetSourceStructure('bad-uuid', mockService),
      /Project ID must be a valid UUID/,
    );
  });

  it('should handle refreshStructure for a valid project UUID', async () => {
    const result = await handleRefreshSourceStructure(validProjectId, mockService);
    assert.deepStrictEqual(result, sampleStructureDto);
  });

  it('should reject refreshStructure with malformed UUID', async () => {
    await assert.rejects(
      async () => await handleRefreshSourceStructure('bad-uuid-format', mockService),
      /Project ID must be a valid UUID/,
    );
  });
});
