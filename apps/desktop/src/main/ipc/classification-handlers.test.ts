import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleGetClassificationProfile,
  handleRefreshClassificationProfile,
} from './classification-handlers.js';
import type { ClassificationProfileDto } from '@ai-quality/contracts';
import type { ClassificationProfileService } from '@ai-quality/core';

describe('Classification Handlers Unit Tests', () => {
  const dummyProfile: ClassificationProfileDto = {
    sourceId: 'source-123',
    summary: {
      totalFiles: 5,
      sourceFiles: 3,
      testFiles: 1,
      configurationFiles: 1,
      buildToolingFiles: 0,
      documentationFiles: 0,
      assetFiles: 0,
      databaseFiles: 0,
      migrationFiles: 0,
      generatedFiles: 0,
      scriptFiles: 0,
      templateFiles: 0,
      unknownFiles: 0,
    },
    files: [
      {
        relativePath: 'src/app.ts',
        category: 'SOURCE',
        confidence: 'HIGH',
        evidence: [{ type: 'DIRECTORY_CONTEXT', detail: 'Located under src/' }],
      },
    ],
    analyzedAt: new Date().toISOString(),
    ruleVersion: 1,
  };

  const mockService = {
    getClassificationProfile: async (_projectId: string) => dummyProfile,
    refreshClassificationProfile: async (_projectId: string) => dummyProfile,
  } as unknown as ClassificationProfileService;

  it('should get classification profile with valid projectId', async () => {
    const validUuid = '11111111-1111-4111-8111-111111111111';
    const result = await handleGetClassificationProfile(validUuid, mockService);
    assert.deepStrictEqual(result, dummyProfile);
  });

  it('should refresh classification profile with valid projectId', async () => {
    const validUuid = '11111111-1111-4111-8111-111111111111';
    const result = await handleRefreshClassificationProfile(validUuid, mockService);
    assert.deepStrictEqual(result, dummyProfile);
  });

  it('should reject invalid non-UUID projectId', async () => {
    await assert.rejects(
      async () => {
        await handleGetClassificationProfile('invalid-uuid', mockService);
      },
      {
        name: 'ZodError',
      },
    );
  });
});
