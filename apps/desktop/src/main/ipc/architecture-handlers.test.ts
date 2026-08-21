import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleGetArchitectureProfile,
  handleRefreshArchitectureProfile,
} from './architecture-handlers.js';
import type { ApplicationArchitectureProfileDto } from '@ai-quality/contracts';
import type { ArchitectureService } from '@ai-quality/core';

describe('Architecture Handlers Unit Tests', () => {
  const dummyProfile: ApplicationArchitectureProfileDto = {
    sourceId: 'src-123',
    status: 'CURRENT',
    architectureVersion: 1,
    primaryKind: 'WEB_FRONTEND',
    confidence: 'HIGH',
    applicationKinds: [
      {
        kind: 'WEB_FRONTEND',
        confidence: 'HIGH',
        evidence: [{ kind: 'FRAMEWORK', source: 'React', detail: 'React detected' }],
      },
    ],
    applicationUnits: [],
    entryCandidates: [
      {
        relativePath: 'src/main.tsx',
        kind: 'CLIENT',
        confidence: 'HIGH',
        rank: 1,
        evidence: [{ kind: 'FILE_PATH', source: 'src/main.tsx', detail: 'Vite main client entry' }],
      },
    ],
    primaryEntryCandidate: {
      relativePath: 'src/main.tsx',
      kind: 'CLIENT',
      confidence: 'HIGH',
      rank: 1,
      evidence: [{ kind: 'FILE_PATH', source: 'src/main.tsx', detail: 'Vite main client entry' }],
    },
    structuralAreas: [
      {
        relativePath: 'src',
        name: 'src',
        role: 'APPLICATION',
        fileCount: 5,
        primaryLanguages: ['TypeScript'],
        evidence: [],
      },
    ],
    architectureSignals: [],
    moduleHubs: [],
    analyzedAt: new Date().toISOString(),
    warnings: [],
  };

  const mockService = {
    getArchitectureProfile: async (_id: string) => dummyProfile,
    refreshArchitectureProfile: async (_id: string) => dummyProfile,
  } as unknown as ArchitectureService;

  const validUuid = '11111111-1111-4111-8111-111111111111';

  it('should get architecture profile with valid projectId', async () => {
    const res = await handleGetArchitectureProfile(validUuid, mockService);
    assert.deepStrictEqual(res, dummyProfile);
  });

  it('should refresh architecture profile with valid projectId', async () => {
    const res = await handleRefreshArchitectureProfile(validUuid, mockService);
    assert.deepStrictEqual(res, dummyProfile);
  });

  it('should reject invalid projectId', async () => {
    await assert.rejects(
      async () => {
        await handleGetArchitectureProfile('not-a-uuid', mockService);
      },
      {
        name: 'ZodError',
      },
    );
  });
});
