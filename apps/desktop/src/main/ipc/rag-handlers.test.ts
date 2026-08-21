/**
 * @file apps/desktop/src/main/ipc/rag-handlers.test.ts
 * Tests for RAG IPC handlers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  handleRetrieveRequirementContext,
  handleGetRagConfigDefaults,
  setRetrievalServiceForTest,
} from './rag-handlers.js';
import { type RequirementContextRetrievalService, AiInvalidRequestError } from '@ai-quality/core';
import type {
  RequirementContextPackDto,
  RagRetrievalConfigDto,
  RetrieveRequirementContextInputDto,
} from '@ai-quality/contracts';

describe('RAG IPC Handlers', () => {
  const sampleProjectId = randomUUID();
  const sampleRequirementId = randomUUID();

  const mockPack: RequirementContextPackDto = {
    projectId: sampleProjectId,
    requirementId: sampleRequirementId,
    requirementKey: 'REQ-001',
    requirementVersion: 1,
    purpose: 'GENERAL_REQUIREMENT_REASONING',
    retrieval: {
      strategy: 'requirement-rag-v1',
      strategyVersion: '1.0.0',
      retrievedAt: new Date().toISOString(),
    },
    primaryRequirement: {
      id: sampleRequirementId,
      requirementKey: 'REQ-001',
      title: 'Mock Title',
      originalText: 'Mock original text',
      status: 'ACTIVE',
      versionNumber: 1,
    },
    items: [],
    budget: {
      maxItems: 25,
      includedItems: 0,
      maxCharacters: 32000,
      includedCharacters: 0,
      estimatedTokens: 0,
      truncated: false,
    },
    diagnostics: {
      candidateCount: 0,
      filteredCount: 0,
      deduplicatedCount: 0,
      sourcesConsulted: ['REQUIREMENT'],
      warnings: [],
      durationMs: 5,
    },
  };

  const mockConfig: RagRetrievalConfigDto = {
    defaultStrategy: 'requirement-rag-v1',
    defaultStrategyVersion: '1.0.0',
    defaultPurpose: 'GENERAL_REQUIREMENT_REASONING',
    defaultLimits: {
      maxItems: 25,
      maxCharacters: 32000,
      maxEstimatedTokens: 8000,
      maxRelatedRequirements: 5,
      maxDocumentItems: 5,
      maxRepositoryItems: 5,
      maxRelationshipDepth: 1,
      minimumSimilarity: 0.45,
      includeStale: false,
    },
  };

  it('rejects invalid inputs missing required fields with AiInvalidRequestError', async () => {
    await assert.rejects(
      handleRetrieveRequirementContext({}),
      (err: unknown) => err instanceof AiInvalidRequestError,
    );
    await assert.rejects(
      handleRetrieveRequirementContext({
        projectId: 'not-a-uuid',
        requirementId: sampleRequirementId,
      }),
      (err: unknown) => err instanceof AiInvalidRequestError,
    );
  });

  it('delegates valid input to RequirementContextRetrievalService', async () => {
    let calledWith: RetrieveRequirementContextInputDto | null = null;
    const mockService = {
      retrieveContext: async (input: RetrieveRequirementContextInputDto) => {
        calledWith = input;
        return mockPack;
      },
      getConfigDefaults: () => mockConfig,
    } as unknown as RequirementContextRetrievalService;

    setRetrievalServiceForTest(mockService);

    const result = await handleRetrieveRequirementContext({
      projectId: sampleProjectId,
      requirementId: sampleRequirementId,
      purpose: 'TEST_DESIGN',
    });

    assert.deepEqual(result, mockPack);
    assert.deepEqual(calledWith, {
      projectId: sampleProjectId,
      requirementId: sampleRequirementId,
      purpose: 'TEST_DESIGN',
    });

    setRetrievalServiceForTest(null);
  });

  it('returns RAG configuration defaults', async () => {
    const mockService = {
      retrieveContext: async () => mockPack,
      getConfigDefaults: () => mockConfig,
    } as unknown as RequirementContextRetrievalService;

    setRetrievalServiceForTest(mockService);

    const result = await handleGetRagConfigDefaults();
    assert.deepEqual(result, mockConfig);

    setRetrievalServiceForTest(null);
  });
});
