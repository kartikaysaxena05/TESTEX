/**
 * @file apps/desktop/src/main/ipc/requirement-handlers.test.ts
 * Unit tests for Requirement IPC handlers with Zod runtime validation and lifecycle actions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleListRequirements,
  handleGetRequirement,
  handleGetRequirementByKey,
  handleGetRequirementSummary,
  handleCreateRequirement,
  handleUpdateRequirement,
  handleActivateRequirement,
  handleDeprecateRequirement,
  handleDraftRequirement,
  handleArchiveRequirement,
  handleRestoreRequirement,
  handleDeleteRequirement,
  handleListRequirementSources,
  handleGetRequirementSource,
  handleParseBulkRequirements,
  handleImportBulkRequirements,
} from './requirement-handlers.js';
import type { RequirementService, RequirementSourceService } from '@ai-quality/core';
import type {
  RequirementDto,
  RequirementSummaryDto,
  RequirementSourceDto,
} from '@ai-quality/contracts';

describe('Requirement IPC Handlers Unit Tests', () => {
  const validUuid = '11111111-1111-4111-8111-111111111111';
  const validReqId = '22222222-2222-4222-8222-222222222222';
  const validSourceId = '33333333-3333-4333-8333-333333333333';

  const dummyRequirement: RequirementDto = {
    id: validReqId,
    projectId: validUuid,
    requirementSourceId: validSourceId,
    requirementSourceName: 'Manual Requirements',
    requirementKey: 'REQ-001',
    title: 'User Login',
    originalText: 'The user shall be able to login.',
    type: 'FUNCTIONAL',
    priority: 'HIGH',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const dummySummary: RequirementSummaryDto = {
    totalCount: 1,
    countsByStatus: { ACTIVE: 1, DRAFT: 0, ARCHIVED: 0, DEPRECATED: 0 },
    countsByType: {
      FUNCTIONAL: 1,
      NON_FUNCTIONAL: 0,
      BUSINESS_RULE: 0,
      SECURITY: 0,
      PERFORMANCE: 0,
      USABILITY: 0,
      DATA: 0,
      INTEGRATION: 0,
      CONSTRAINT: 0,
      UNKNOWN: 0,
    },
    countsByPriority: {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 0,
      LOW: 0,
      UNSPECIFIED: 0,
    },
  };

  const dummySource: RequirementSourceDto = {
    id: validSourceId,
    projectId: validUuid,
    name: 'Manual Requirements',
    sourceType: 'MANUAL',
    status: 'ACTIVE',
    description: null,
    metadata: null,
    requirementCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockReqService = {
    listRequirements: async () => ({
      items: [dummyRequirement],
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    }),
    getRequirement: async () => dummyRequirement,
    getRequirementByKey: async () => dummyRequirement,
    getRequirementSummary: async () => dummySummary,
    createRequirement: async () => dummyRequirement,
    updateRequirement: async () => dummyRequirement,
    activateRequirement: async () => ({ ...dummyRequirement, status: 'ACTIVE' as const }),
    deprecateRequirement: async () => ({ ...dummyRequirement, status: 'DEPRECATED' as const }),
    draftRequirement: async () => ({ ...dummyRequirement, status: 'DRAFT' as const }),
    archiveRequirement: async () => ({ ...dummyRequirement, status: 'ARCHIVED' as const }),
    restoreRequirement: async () => ({ ...dummyRequirement, status: 'ACTIVE' as const }),
    deleteRequirement: async () => ({ deleted: true as const }),
    parseBulkRequirements: async () => ({
      candidates: [
        {
          candidateId: 'candidate-1',
          originalText: 'User shall sign in.',
          title: 'User shall sign in.',
          detectedExternalKey: null,
          lineStart: 1,
          lineEnd: 1,
          parseMethod: 'PLAIN_LINE' as const,
          isDuplicateInBatch: false,
          warnings: [],
        },
      ],
      totalParsed: 1,
      duplicateCount: 0,
      warningCount: 0,
      parseVersion: 'bulk-parser-v1',
    }),
    importBulkRequirements: async () => ({
      requirementSourceId: validSourceId,
      requirementSourceName: 'Bulk Paste Specs',
      importedCount: 1,
      requirements: [dummyRequirement],
    }),
  } as unknown as RequirementService;

  const mockSourceService = {
    listSources: async () => [dummySource],
    getSource: async () => dummySource,
  } as unknown as RequirementSourceService;

  it('should list requirements with valid input', async () => {
    const res = await handleListRequirements({ projectId: validUuid }, mockReqService);
    assert.strictEqual(res.total, 1);
    assert.strictEqual(res.items[0]?.requirementKey, 'REQ-001');
  });

  it('should reject list requirements with invalid UUID', async () => {
    await assert.rejects(
      async () => await handleListRequirements({ projectId: 'not-a-uuid' }, mockReqService),
    );
  });

  it('should get requirement by id with valid input', async () => {
    const res = await handleGetRequirement(
      { projectId: validUuid, requirementId: validReqId },
      mockReqService,
    );
    assert.deepStrictEqual(res, dummyRequirement);
  });

  it('should get requirement by key with valid input', async () => {
    const res = await handleGetRequirementByKey(
      { projectId: validUuid, requirementKey: 'REQ-001' },
      mockReqService,
    );
    assert.deepStrictEqual(res, dummyRequirement);
  });

  it('should get requirement summary with valid projectId', async () => {
    const res = await handleGetRequirementSummary(validUuid, mockReqService);
    assert.deepStrictEqual(res, dummySummary);
  });

  it('should create requirement with valid input', async () => {
    const res = await handleCreateRequirement(
      {
        projectId: validUuid,
        requirementKey: 'REQ-001',
        title: 'User Login',
        originalText: 'The user shall be able to login.',
      },
      mockReqService,
    );
    assert.deepStrictEqual(res, dummyRequirement);
  });

  it('should reject create requirement with missing originalText', async () => {
    await assert.rejects(
      async () =>
        await handleCreateRequirement(
          {
            projectId: validUuid,
            requirementKey: 'REQ-001',
            title: 'User Login',
            originalText: '',
          },
          mockReqService,
        ),
    );
  });

  it('should update requirement with valid input', async () => {
    const res = await handleUpdateRequirement(
      {
        projectId: validUuid,
        requirementId: validReqId,
        title: 'Updated Title',
      },
      mockReqService,
    );
    assert.deepStrictEqual(res, dummyRequirement);
  });

  it('should activate, deprecate, and draft requirement', async () => {
    const activated = await handleActivateRequirement(
      { projectId: validUuid, requirementId: validReqId },
      mockReqService,
    );
    assert.strictEqual(activated.status, 'ACTIVE');

    const deprecated = await handleDeprecateRequirement(
      { projectId: validUuid, requirementId: validReqId },
      mockReqService,
    );
    assert.strictEqual(deprecated.status, 'DEPRECATED');

    const drafted = await handleDraftRequirement(
      { projectId: validUuid, requirementId: validReqId },
      mockReqService,
    );
    assert.strictEqual(drafted.status, 'DRAFT');
  });

  it('should archive, restore, and delete requirement', async () => {
    const archived = await handleArchiveRequirement(
      { projectId: validUuid, requirementId: validReqId },
      mockReqService,
    );
    assert.strictEqual(archived.status, 'ARCHIVED');

    const restored = await handleRestoreRequirement(
      { projectId: validUuid, requirementId: validReqId },
      mockReqService,
    );
    assert.strictEqual(restored.status, 'ACTIVE');

    const deleted = await handleDeleteRequirement(
      { projectId: validUuid, requirementId: validReqId },
      mockReqService,
    );
    assert.strictEqual(deleted.deleted, true);
  });

  it('should list and get requirement sources', async () => {
    const sources = await handleListRequirementSources({ projectId: validUuid }, mockSourceService);
    assert.strictEqual(sources.length, 1);
    assert.strictEqual(sources[0]?.id, validSourceId);

    const source = await handleGetRequirementSource(
      { projectId: validUuid, sourceId: validSourceId },
      mockSourceService,
    );
    assert.deepStrictEqual(source, dummySource);
  });

  it('should parse bulk requirement text with valid input', async () => {
    const res = await handleParseBulkRequirements(
      { rawText: '1. The user shall be able to login.' },
      mockReqService,
    );
    assert.strictEqual(res.totalParsed, 1);
    assert.strictEqual(res.candidates[0]?.originalText, 'User shall sign in.');
  });

  it('should reject parse bulk requirements with empty text', async () => {
    await assert.rejects(
      async () => await handleParseBulkRequirements({ rawText: '' }, mockReqService),
    );
  });

  it('should import bulk requirements with valid payload', async () => {
    const res = await handleImportBulkRequirements(
      {
        projectId: validUuid,
        sourceName: 'Bulk Specs',
        candidates: [{ originalText: 'The user shall be able to login.' }],
      },
      mockReqService,
    );
    assert.strictEqual(res.importedCount, 1);
    assert.strictEqual(res.requirementSourceName, 'Bulk Paste Specs');
  });

  it('should reject import bulk requirements with empty candidate array', async () => {
    await assert.rejects(
      async () =>
        await handleImportBulkRequirements(
          {
            projectId: validUuid,
            candidates: [],
          },
          mockReqService,
        ),
    );
  });
});
