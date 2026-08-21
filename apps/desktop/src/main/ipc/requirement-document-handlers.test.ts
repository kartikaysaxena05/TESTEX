import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type electron from 'electron';
import {
  handleSelectAndIngestDocument,
  handleListRequirementDocuments,
  handleGetRequirementDocument,
  handleDeleteRequirementDocument,
} from './requirement-document-handlers.js';
import type { RequirementDocumentService } from '@ai-quality/core';
import type {
  RequirementDocumentDto,
  IngestDocumentDirectInput,
  ListRequirementDocumentsInput,
  GetRequirementDocumentInput,
  DeleteRequirementDocumentInput,
} from '@ai-quality/contracts';

describe('RequirementDocument IPC Handlers Unit Tests', () => {
  const mockDoc: RequirementDocumentDto = {
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    requirementSourceId: crypto.randomUUID(),
    originalFileName: 'SRS.pdf',
    storageKey: 'doc-key.pdf',
    fileExtension: 'pdf',
    mimeType: 'application/pdf',
    fileSize: 1024,
    sha256: 'a'.repeat(64),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('should handle picker cancellation gracefully without calling service', async () => {
    const mockDialog = {
      showOpenDialog: async () => ({
        canceled: true,
        filePaths: [] as string[],
      }),
    } as unknown as typeof electron.dialog;

    const mockService = {
      ingestDocument: async () => {
        throw new Error('Should not be called');
      },
    } as unknown as RequirementDocumentService;

    const result = await handleSelectAndIngestDocument(
      { projectId: crypto.randomUUID() },
      mockService,
      mockDialog,
    );

    assert.equal(result.canceled, true);
    assert.equal(result.document, undefined);
  });

  it('should ingest selected file and return document when user selects a file', async () => {
    const projectId = crypto.randomUUID();
    const mockDialog = {
      showOpenDialog: async () => ({
        canceled: false,
        filePaths: ['/Users/user/Documents/SRS_Specification.pdf'],
      }),
    } as unknown as typeof electron.dialog;

    const mockService = {
      ingestDocument: async (input: IngestDocumentDirectInput) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.absoluteSourcePath, '/Users/user/Documents/SRS_Specification.pdf');
        return mockDoc;
      },
    } as unknown as RequirementDocumentService;

    const result = await handleSelectAndIngestDocument({ projectId }, mockService, mockDialog);

    assert.equal(result.canceled, false);
    assert.equal(result.document?.id, mockDoc.id);
  });

  it('should list requirement documents for a valid project', async () => {
    const projectId = crypto.randomUUID();
    const mockService = {
      listDocuments: async (input: ListRequirementDocumentsInput) => {
        assert.equal(input.projectId, projectId);
        return [mockDoc];
      },
    } as unknown as RequirementDocumentService;

    const result = await handleListRequirementDocuments({ projectId }, mockService);

    assert.equal(result.length, 1);
    assert.equal(result[0]!.id, mockDoc.id);
  });

  it('should get a single requirement document by ID', async () => {
    const projectId = crypto.randomUUID();
    const documentId = mockDoc.id;
    const mockService = {
      getDocument: async (input: GetRequirementDocumentInput) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.documentId, documentId);
        return mockDoc;
      },
    } as unknown as RequirementDocumentService;

    const result = await handleGetRequirementDocument({ projectId, documentId }, mockService);

    assert.equal(result?.id, mockDoc.id);
  });

  it('should delete a requirement document by ID', async () => {
    const projectId = crypto.randomUUID();
    const documentId = mockDoc.id;
    const mockService = {
      deleteDocument: async (input: DeleteRequirementDocumentInput) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.documentId, documentId);
        return { deleted: true };
      },
    } as unknown as RequirementDocumentService;

    const result = await handleDeleteRequirementDocument({ projectId, documentId }, mockService);

    assert.equal(result.deleted, true);
  });

  it('should reject invalid project UUID in list request', async () => {
    await assert.rejects(
      async () => await handleListRequirementDocuments({ projectId: 'invalid-uuid' }),
      (err: unknown) =>
        typeof err === 'object' &&
        err !== null &&
        'name' in err &&
        (err as { name: string }).name === 'ZodError',
    );
  });
});
