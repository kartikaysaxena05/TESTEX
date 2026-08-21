/**
 * @file apps/desktop/src/main/ipc/requirement-evidence-handlers.test.ts
 * Unit tests for requirement repository evidence IPC handlers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleMatchRepositoryEvidence,
  handleGetRepositoryEvidence,
  handleReviewRepositoryEvidence,
  handleCreateManualRepositoryEvidence,
  handleDeleteRepositoryEvidence,
  handlePreviewRepositoryEvidence,
} from './requirement-evidence-handlers.js';
import type { RequirementRepositoryEvidenceService } from '@ai-quality/core';
import type {
  MatchRepositoryEvidenceResultDto,
  RequirementRepositoryEvidenceDto,
  EvidencePreviewDto,
} from '@ai-quality/contracts';

describe('Requirement Repository Evidence IPC Handlers Unit Tests', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const requirementId = '22222222-2222-2222-2222-222222222222';
  const evidenceId = '33333333-3333-3333-3333-333333333333';
  const sourceId = '44444444-4444-4444-4444-444444444444';
  const fileId = '55555555-5555-5555-5555-555555555555';

  const mockEvidence: RequirementRepositoryEvidenceDto = {
    id: evidenceId,
    projectId,
    requirementId,
    requirementKey: 'REQ-001',
    projectSourceId: sourceId,
    repositorySnapshotId: 'snap-1',
    indexedFileId: fileId,
    symbolId: 'sym-1',
    evidenceType: 'SERVICE',
    filePath: 'src/services/auth.service.ts',
    symbolName: 'AuthService',
    lineStart: 10,
    lineEnd: 50,
    fileContentHash: 'hash-1',
    evidenceScore: 9,
    reasonCodes: ['EXACT_SYMBOL_NAME'],
    matchMethod: 'EXACT_SYMBOL',
    status: 'CANDIDATE',
    sourceRequirementTextSha256: 'a'.repeat(64),
    matcherVersion: 'requirement-repository-matcher-v1',
    reviewRationale: null,
    isStale: false,
    isMissingInSnapshot: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockMatchResult: MatchRepositoryEvidenceResultDto = {
    matchedCount: 1,
    candidateEvidence: [mockEvidence],
    snapshotFingerprint: 'fingerprint-1',
    isIndexed: true,
  };

  const mockPreviewResult: EvidencePreviewDto = {
    filePath: 'src/services/auth.service.ts',
    content: 'export class AuthService {}',
    lineStart: 10,
    lineEnd: 50,
    totalLines: 100,
    isTruncated: false,
    language: 'TypeScript',
  };

  it('handles match repository evidence successfully', async () => {
    const mockService = {
      matchRepositoryEvidence: async (input: { projectId: string; requirementId: string }) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.requirementId, requirementId);
        return mockMatchResult;
      },
    } as unknown as RequirementRepositoryEvidenceService;

    const result = await handleMatchRepositoryEvidence({ projectId, requirementId }, mockService);

    assert.deepEqual(result, mockMatchResult);
  });

  it('handles get repository evidence successfully', async () => {
    const mockService = {
      getRepositoryEvidence: async (input: { projectId: string; requirementId: string }) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.requirementId, requirementId);
        return [mockEvidence];
      },
    } as unknown as RequirementRepositoryEvidenceService;

    const result = await handleGetRepositoryEvidence({ projectId, requirementId }, mockService);

    assert.deepEqual(result, [mockEvidence]);
  });

  it('handles review repository evidence successfully', async () => {
    const mockService = {
      reviewRepositoryEvidence: async (input: {
        projectId: string;
        evidenceId: string;
        status: string;
      }) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.evidenceId, evidenceId);
        assert.equal(input.status, 'CONFIRMED');
        return { ...mockEvidence, status: 'CONFIRMED' };
      },
    } as unknown as RequirementRepositoryEvidenceService;

    const result = await handleReviewRepositoryEvidence(
      {
        projectId,
        evidenceId,
        status: 'CONFIRMED',
      },
      mockService,
    );

    assert.equal(result.status, 'CONFIRMED');
  });

  it('handles create manual repository evidence successfully', async () => {
    const mockService = {
      createManualRepositoryEvidence: async (input: {
        projectId: string;
        requirementId: string;
        projectSourceId: string;
        indexedFileId: string;
        evidenceType: string;
      }) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.requirementId, requirementId);
        assert.equal(input.projectSourceId, sourceId);
        assert.equal(input.indexedFileId, fileId);
        return { ...mockEvidence, matchMethod: 'MANUAL', status: 'CONFIRMED' };
      },
    } as unknown as RequirementRepositoryEvidenceService;

    const result = await handleCreateManualRepositoryEvidence(
      {
        projectId,
        requirementId,
        projectSourceId: sourceId,
        indexedFileId: fileId,
        evidenceType: 'SERVICE',
      },
      mockService,
    );

    assert.equal(result.status, 'CONFIRMED');
    assert.equal(result.matchMethod, 'MANUAL');
  });

  it('handles delete repository evidence successfully', async () => {
    const mockService = {
      deleteRepositoryEvidence: async (input: { projectId: string; evidenceId: string }) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.evidenceId, evidenceId);
        return { deleted: true as const };
      },
    } as unknown as RequirementRepositoryEvidenceService;

    const result = await handleDeleteRepositoryEvidence(
      {
        projectId,
        evidenceId,
      },
      mockService,
    );

    assert.deepEqual(result, { deleted: true });
  });

  it('handles preview repository evidence successfully', async () => {
    const mockService = {
      previewRepositoryEvidence: async (input: { projectId: string; evidenceId: string }) => {
        assert.equal(input.projectId, projectId);
        assert.equal(input.evidenceId, evidenceId);
        return mockPreviewResult;
      },
    } as unknown as RequirementRepositoryEvidenceService;

    const result = await handlePreviewRepositoryEvidence(
      {
        projectId,
        evidenceId,
      },
      mockService,
    );

    assert.deepEqual(result, mockPreviewResult);
  });
});
