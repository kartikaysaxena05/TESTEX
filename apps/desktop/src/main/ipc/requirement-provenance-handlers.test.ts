/**
 * @file apps/desktop/src/main/ipc/requirement-provenance-handlers.test.ts
 * Unit tests for Requirement Source Provenance IPC handlers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  handleGetRequirementProvenance,
  handleGetRequirementSourceContext,
} from './requirement-provenance-handlers.js';
import type { RequirementProvenanceService } from '@ai-quality/core';
import type { RequirementProvenanceDto, RequirementSourceContextDto } from '@ai-quality/contracts';

describe('RequirementProvenance IPC Handlers Unit Tests', () => {
  const projectId = crypto.randomUUID();
  const requirementId = crypto.randomUUID();
  const requirementSourceId = crypto.randomUUID();

  const mockProvenance: RequirementProvenanceDto = {
    id: crypto.randomUUID(),
    projectId,
    requirementId,
    requirementKey: 'REQ-001',
    requirementSourceId,
    sourceKind: 'DOCUMENT',
    locationKind: 'DOCUMENT_BLOCK',
    candidateId: crypto.randomUUID(),
    documentId: crypto.randomUUID(),
    extractionId: crypto.randomUUID(),
    sourceBlockId: 'blk-101',
    sourceTableId: null,
    sourceRowIndex: null,
    sectionId: 'sec-1',
    sectionPath: '3.1 Authentication',
    pageNumber: 12,
    lineStart: 45,
    lineEnd: 48,
    startOffset: 1200,
    endOffset: 1280,
    sourceText: 'The system shall verify user tokens.',
    reviewedText: null,
    externalRequirementKey: 'FR-01',
    currentRequirementText: 'The system shall verify user tokens.',
    sourceSha256: 'a'.repeat(64),
    extractorVersion: 'document-extractor-v1',
    detectorVersion: 'requirement-detector-v1',
    detectionReasons: [],
    detectionScore: 5,
    completeness: 'COMPLETE',
    integrityStatus: 'VERIFIED',
    integrityMessage: 'Verified',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockContext: RequirementSourceContextDto = {
    requirementId,
    sourceKind: 'DOCUMENT',
    targetSnippet: 'The system shall verify user tokens.',
    precedingBlocks: [],
    targetBlock: {
      id: 'blk-101',
      type: 'PARAGRAPH',
      text: 'The system shall verify user tokens.',
      isTarget: true,
      pageNumber: 12,
      lineStart: 45,
      lineEnd: 48,
    },
    succeedingBlocks: [],
    totalSurroundingBlocks: 1,
  };

  it('handles getRequirementProvenance successfully with valid schema payload', async () => {
    const mockService = {
      getProvenance: async (pId: string, rId: string) => {
        assert.equal(pId, projectId);
        assert.equal(rId, requirementId);
        return mockProvenance;
      },
    } as unknown as RequirementProvenanceService;

    const result = await handleGetRequirementProvenance(
      {
        projectId,
        requirementId,
      },
      mockService,
    );

    assert.equal(result.requirementId, requirementId);
    assert.equal(result.requirementKey, 'REQ-001');
    assert.equal(result.integrityStatus, 'VERIFIED');
  });

  it('rejects invalid payload for getRequirementProvenance', async () => {
    const mockService = {} as unknown as RequirementProvenanceService;

    await assert.rejects(
      async () => {
        await handleGetRequirementProvenance(
          {
            projectId: 'not-a-uuid',
            requirementId,
          },
          mockService,
        );
      },
      (err: unknown) => {
        assert.equal((err as Error).name, 'ZodError');
        return true;
      },
    );
  });

  it('handles getRequirementSourceContext successfully', async () => {
    const mockService = {
      getSourceContext: async (pId: string, rId: string) => {
        assert.equal(pId, projectId);
        assert.equal(rId, requirementId);
        return mockContext;
      },
    } as unknown as RequirementProvenanceService;

    const result = await handleGetRequirementSourceContext(
      {
        projectId,
        requirementId,
      },
      mockService,
    );

    assert.equal(result.requirementId, requirementId);
    assert.equal(result.targetSnippet, 'The system shall verify user tokens.');
    assert.equal(result.totalSurroundingBlocks, 1);
  });
});
