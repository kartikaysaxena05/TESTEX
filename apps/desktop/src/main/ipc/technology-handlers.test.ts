import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { TechnologyProfileDto } from '@ai-quality/contracts';
import {
  handleGetTechnologyProfile,
  handleRefreshTechnologyProfile,
} from './technology-handlers.js';
import { TechnologyProfileService } from '@ai-quality/core';

describe('Technology IPC Handlers Unit Tests', () => {
  const sampleProfileDto: TechnologyProfileDto = {
    sourceId: '3a773f11-8e6c-470d-8c6a-76f97be584f0',
    detectedLanguages: [
      {
        language: 'TypeScript',
        category: 'PROGRAMMING',
        fileCount: 10,
        percentage: 80,
        confidence: 'HIGH',
        evidenceExtensions: ['.ts', '.tsx'],
      },
      {
        language: 'CSS',
        category: 'STYLE',
        fileCount: 2,
        percentage: 20,
        confidence: 'HIGH',
        evidenceExtensions: ['.css'],
      },
    ],
    dominantLanguage: 'TypeScript',
    technologySignals: [
      {
        technology: 'Node.js Ecosystem',
        category: 'Runtime / Ecosystem',
        confidence: 'HIGH',
        evidence: ['package.json'],
      },
    ],
    totalIncludedFiles: 12,
    totalLanguageFiles: 12,
    unknownFiles: 0,
    analyzedAt: new Date().toISOString(),
  };

  const validProjectId = '3a773f11-8e6c-470d-8c6a-76f97be584f0';

  const mockService = {
    getTechnologyProfile: async (projectId: string) => {
      if (projectId === validProjectId) {
        return sampleProfileDto;
      }
      return null;
    },
    refreshTechnologyProfile: async (projectId: string) => {
      if (projectId === validProjectId) {
        return sampleProfileDto;
      }
      throw new Error('Project not found');
    },
  } as unknown as TechnologyProfileService;

  it('should handle getTechnologyProfile for a valid project UUID', async () => {
    const result = await handleGetTechnologyProfile(validProjectId, mockService);
    assert.deepStrictEqual(result, sampleProfileDto);
  });

  it('should reject getTechnologyProfile with malformed UUID', async () => {
    await assert.rejects(
      async () => await handleGetTechnologyProfile('bad-uuid', mockService),
      /Project ID must be a valid UUID/,
    );
  });

  it('should handle refreshTechnologyProfile for a valid project UUID', async () => {
    const result = await handleRefreshTechnologyProfile(validProjectId, mockService);
    assert.deepStrictEqual(result, sampleProfileDto);
  });

  it('should reject refreshTechnologyProfile with malformed UUID', async () => {
    await assert.rejects(
      async () => await handleRefreshTechnologyProfile('bad-uuid-format', mockService),
      /Project ID must be a valid UUID/,
    );
  });
});
