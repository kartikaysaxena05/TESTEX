/**
 * @file apps/desktop/src/main/ipc/requirement-document-extraction-handlers.test.ts
 * Unit tests for requirement document extraction IPC handlers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  handleExtractRequirementDocument,
  handleGetRequirementDocumentExtraction,
} from './requirement-document-handlers.js';
import type { RequirementDocumentExtractionService } from '@ai-quality/core';
import type {
  RequirementDocumentExtractionDto,
  ExtractRequirementDocumentInput,
  GetRequirementDocumentExtractionInput,
} from '@ai-quality/contracts';

describe('RequirementDocument Extraction IPC Handlers Unit Tests', () => {
  const mockExtraction: RequirementDocumentExtractionDto = {
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    requirementDocumentId: crypto.randomUUID(),
    sourceSha256: 'a'.repeat(64),
    extractorVersion: 'document-extractor-v1',
    format: 'pdf',
    plainText: 'Extracted PDF text.',
    characterCount: 19,
    lineCount: 1,
    pageCount: 1,
    blockCount: 1,
    headingCount: 1,
    sectionCount: 1,
    tableCount: 0,
    status: 'COMPLETED',
    warnings: [],
    blocks: [],
    pages: [],
    headings: [],
    sections: [],
    tables: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('should dispatch extraction to service and return extracted representation', async () => {
    const projectId = crypto.randomUUID();
    const documentId = crypto.randomUUID();

    const mockService = {
      extractDocument: async (input: ExtractRequirementDocumentInput) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.documentId, documentId);
        return mockExtraction;
      },
    } as unknown as RequirementDocumentExtractionService;

    const result = await handleExtractRequirementDocument(
      { projectId, documentId, force: false },
      mockService,
    );

    assert.equal(result.id, mockExtraction.id);
    assert.equal(result.format, 'pdf');
    assert.equal(result.extractorVersion, 'document-extractor-v1');
  });

  it('should retrieve stored extraction for a document', async () => {
    const projectId = crypto.randomUUID();
    const documentId = crypto.randomUUID();

    const mockService = {
      getExtraction: async (input: GetRequirementDocumentExtractionInput) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.documentId, documentId);
        return mockExtraction;
      },
    } as unknown as RequirementDocumentExtractionService;

    const result = await handleGetRequirementDocumentExtraction(
      { projectId, documentId },
      mockService,
    );

    assert.equal(result?.id, mockExtraction.id);
  });

  it('should reject invalid UUIDs in extraction requests', async () => {
    await assert.rejects(
      async () =>
        await handleExtractRequirementDocument({
          projectId: 'not-a-uuid',
          documentId: 'not-a-uuid',
        }),
      (err: unknown) =>
        typeof err === 'object' &&
        err !== null &&
        'name' in err &&
        (err as { name: string }).name === 'ZodError',
    );
  });
});
