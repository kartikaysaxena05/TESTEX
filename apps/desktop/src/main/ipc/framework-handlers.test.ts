import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleGetFrameworkProfile, handleRefreshFrameworkProfile } from './framework-handlers.js';
import type { FrameworkProfileDto } from '@ai-quality/contracts';
import type { FrameworkProfileService } from '@ai-quality/core';

describe('Framework Handlers Unit Tests', () => {
  const dummyProfile: FrameworkProfileDto = {
    sourceId: 'source-123',
    primaryEcosystem: 'Node.js',
    packageManager: {
      name: 'pnpm',
      confidence: 'HIGH',
      isAmbiguous: false,
      evidence: ['pnpm-lock.yaml'],
    },
    manifests: [
      {
        relativePath: 'package.json',
        ecosystem: 'Node.js',
        directDependencyCount: 2,
        devDependencyCount: 1,
        scriptNames: ['build', 'test'],
      },
    ],
    frameworks: [
      {
        id: 'nextjs',
        name: 'Next.js',
        category: 'FRAMEWORK',
        confidence: 'HIGH',
        declaredVersion: '^15.0.0',
        resolvedVersion: null,
        evidence: [
          {
            kind: 'DEPENDENCY',
            source: 'package.json',
            detail: 'next: ^15.0.0',
          },
        ],
      },
    ],
    dependencies: [
      {
        name: 'next',
        declaredVersion: '^15.0.0',
        scope: 'RUNTIME',
        ecosystem: 'Node.js',
        sourceManifest: 'package.json',
      },
    ],
    directDependencyCount: 2,
    devDependencyCount: 1,
    analyzedAt: new Date().toISOString(),
    warnings: [],
  };

  const mockService = {
    getFrameworkProfile: async (_projectId: string) => dummyProfile,
    refreshFrameworkProfile: async (_projectId: string) => dummyProfile,
  } as unknown as FrameworkProfileService;

  it('should get framework profile with valid projectId', async () => {
    const validUuid = '11111111-1111-4111-8111-111111111111';
    const result = await handleGetFrameworkProfile(validUuid, mockService);
    assert.deepStrictEqual(result, dummyProfile);
  });

  it('should refresh framework profile with valid projectId', async () => {
    const validUuid = '11111111-1111-4111-8111-111111111111';
    const result = await handleRefreshFrameworkProfile(validUuid, mockService);
    assert.deepStrictEqual(result, dummyProfile);
  });

  it('should reject invalid non-UUID projectId', async () => {
    await assert.rejects(
      async () => {
        await handleGetFrameworkProfile('invalid-uuid', mockService);
      },
      {
        name: 'ZodError',
      },
    );
  });
});
