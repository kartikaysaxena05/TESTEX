import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleGetSourceFileContent } from './content-handlers.js';
import type { SourceFileContentDto } from '@ai-quality/contracts';
import type { SourceContentService } from '@ai-quality/core';

describe('Content Handlers Unit Tests', () => {
  const dummyContent: SourceFileContentDto = {
    sourceId: 'source-123',
    relativePath: 'src/app.ts',
    status: 'AVAILABLE',
    category: 'SOURCE',
    language: 'TypeScript',
    sizeBytes: 25,
    encoding: 'UTF-8',
    content: 'export const app = {};',
    readAt: new Date().toISOString(),
  };

  const mockService = {
    readSourceFile: async (_projectId: string, _relativePath: string) => dummyContent,
  } as unknown as SourceContentService;

  it('should get source file content with valid input', async () => {
    const validUuid = '11111111-1111-4111-8111-111111111111';
    const result = await handleGetSourceFileContent(
      {
        projectId: validUuid,
        relativePath: 'src/app.ts',
      },
      mockService,
    );

    assert.deepStrictEqual(result, dummyContent);
  });

  it('should reject invalid non-UUID projectId', async () => {
    await assert.rejects(
      async () => {
        await handleGetSourceFileContent(
          {
            projectId: 'invalid-uuid',
            relativePath: 'src/app.ts',
          },
          mockService,
        );
      },
      {
        name: 'ZodError',
      },
    );
  });

  it('should reject invalid absolute or traversal relativePath', async () => {
    const validUuid = '11111111-1111-4111-8111-111111111111';

    await assert.rejects(
      async () => {
        await handleGetSourceFileContent(
          {
            projectId: validUuid,
            relativePath: '/etc/passwd',
          },
          mockService,
        );
      },
      {
        name: 'ZodError',
      },
    );
  });
});
