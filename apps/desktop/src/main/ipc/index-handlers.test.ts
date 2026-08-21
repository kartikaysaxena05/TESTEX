import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleGetRepositoryIndexStatus,
  handleRefreshRepositoryIndex,
  handleListIndexedFiles,
  handleGetFileDetails,
  handleSearchSymbols,
} from './index-handlers.js';
import type {
  RepositoryIndexStatusDto,
  RepositoryFileDto,
  RepositoryFileDetailsDto,
  RepositorySymbolDto,
  PaginatedResult,
} from '@ai-quality/contracts';
import type { RepositoryIndexService } from '@ai-quality/core';

describe('Repository Index Handlers Unit Tests', () => {
  const dummyStatus: RepositoryIndexStatusDto = {
    isIndexed: true,
    isRunning: false,
    schemaVersion: 1,
    parserVersion: 1,
    summary: {
      filesEligible: 10,
      filesIndexed: 10,
      filesSkipped: 0,
      filesFailed: 0,
      symbolsIndexed: 25,
      importsIndexed: 12,
      exportsIndexed: 8,
      unsupportedLanguageFiles: 0,
      durationMs: 45,
      truncated: false,
      warnings: [],
    },
    lastIndexedAt: new Date().toISOString(),
  };

  const dummyFiles: PaginatedResult<RepositoryFileDto> = {
    items: [
      {
        id: 'file-1',
        sourceId: 'src-1',
        relativePath: 'src/app.ts',
        name: 'app.ts',
        extension: '.ts',
        language: 'TypeScript',
        classification: 'SOURCE',
        sizeBytes: 100,
        contentHash: 'hash123',
        indexStatus: 'INDEXED',
        symbolCount: 3,
        importCount: 2,
        indexedAt: new Date().toISOString(),
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  };

  const dummyDetails: RepositoryFileDetailsDto = {
    file: dummyFiles.items[0]!,
    symbols: [
      {
        id: 'sym-1',
        name: 'UserService',
        kind: 'CLASS',
        startLine: 5,
        endLine: 25,
        isExported: true,
      },
    ],
    imports: [
      {
        id: 'imp-1',
        specifier: './db',
        importKind: 'LOCAL',
        resolvedRelativePath: 'src/db.ts',
        isExternal: false,
        lineNumber: 1,
      },
    ],
  };

  const dummySymbols: RepositorySymbolDto[] = [
    {
      id: 'sym-1',
      name: 'UserService',
      kind: 'CLASS',
      startLine: 5,
      endLine: 25,
      isExported: true,
    },
  ];

  const mockService = {
    getIndexStatus: async (_id: string) => dummyStatus,
    refreshIndex: async (_id: string) => dummyStatus,
    listIndexedFiles: async (_id: string, _input: unknown) => dummyFiles,
    getFileDetails: async (_id: string, _rel: string) => dummyDetails,
    searchSymbols: async (_id: string, _input: unknown) => dummySymbols,
  } as unknown as RepositoryIndexService;

  const validUuid = '11111111-1111-4111-8111-111111111111';

  it('should get index status with valid projectId', async () => {
    const res = await handleGetRepositoryIndexStatus(validUuid, mockService);
    assert.deepStrictEqual(res, dummyStatus);
  });

  it('should refresh index with valid projectId', async () => {
    const res = await handleRefreshRepositoryIndex(validUuid, mockService);
    assert.deepStrictEqual(res, dummyStatus);
  });

  it('should list indexed files with valid query', async () => {
    const res = await handleListIndexedFiles(
      {
        projectId: validUuid,
        page: 1,
        pageSize: 20,
      },
      mockService,
    );
    assert.deepStrictEqual(res, dummyFiles);
  });

  it('should get file details with valid relative path', async () => {
    const res = await handleGetFileDetails(
      {
        projectId: validUuid,
        relativePath: 'src/app.ts',
      },
      mockService,
    );
    assert.deepStrictEqual(res, dummyDetails);
  });

  it('should search symbols with query', async () => {
    const res = await handleSearchSymbols(
      {
        projectId: validUuid,
        query: 'User',
      },
      mockService,
    );
    assert.deepStrictEqual(res, dummySymbols);
  });

  it('should reject invalid projectId', async () => {
    await assert.rejects(
      async () => {
        await handleGetRepositoryIndexStatus('not-a-uuid', mockService);
      },
      {
        name: 'ZodError',
      },
    );
  });
});
