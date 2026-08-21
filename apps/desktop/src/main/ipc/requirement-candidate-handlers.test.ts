/**
 * @file apps/desktop/src/main/ipc/requirement-candidate-handlers.test.ts
 * Unit tests for Requirement Candidate IPC handlers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  handleDetectRequirementCandidates,
  handleListRequirementCandidates,
  handleUpdateRequirementCandidate,
  handleSetRequirementCandidateStatus,
  handleImportApprovedCandidates,
} from './requirement-candidate-handlers.js';
import type { RequirementCandidateService } from '@ai-quality/core';
import type { RequirementCandidateDto } from '@ai-quality/contracts';

describe('RequirementCandidate IPC Handlers Unit Tests', () => {
  const projectId = crypto.randomUUID();
  const documentId = crypto.randomUUID();
  const candidateId = crypto.randomUUID();

  const mockCandidate: RequirementCandidateDto = {
    id: candidateId,
    projectId,
    requirementDocumentId: documentId,
    extractionId: crypto.randomUUID(),
    sourceBlockId: 'blk-1',
    sourceTableId: null,
    sourceRowIndex: null,
    sourceText: 'The system shall authenticate users.',
    reviewedText: null,
    externalKey: 'FR-01',
    sectionId: null,
    sectionPath: null,
    pageNumber: 1,
    lineStart: 1,
    lineEnd: 2,
    startOffset: 0,
    endOffset: 36,
    detectionMethod: 'RULE_BASED',
    detectionReasons: [
      {
        code: 'EXPLICIT_SHALL',
        description: 'Contains mandatory obligation keyword "shall".',
        score: 4,
      },
    ],
    detectionScore: 4,
    warnings: [],
    reviewStatus: 'PENDING',
    importedRequirementId: null,
    detectorVersion: 'requirement-detector-v1',
    sourceSha256: 'a'.repeat(64),
    orderIndex: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('should handle candidate detection correctly', async () => {
    const mockService = {
      detectCandidates: async () => [mockCandidate],
    } as unknown as RequirementCandidateService;

    const result = await handleDetectRequirementCandidates(
      { projectId, documentId, force: true },
      mockService,
    );

    assert.equal(result.length, 1);
    assert.equal(result[0]!.id, candidateId);
  });

  it('should handle candidate listing correctly', async () => {
    const mockService = {
      listCandidates: async () => ({
        candidates: [mockCandidate],
        totalCount: 1,
        pendingCount: 1,
        approvedCount: 0,
        rejectedCount: 0,
        importedCount: 0,
      }),
    } as unknown as RequirementCandidateService;

    const result = await handleListRequirementCandidates(
      { projectId, documentId, status: 'ALL' },
      mockService,
    );

    assert.equal(result.totalCount, 1);
    assert.equal(result.candidates.length, 1);
  });

  it('should handle candidate updating correctly', async () => {
    const updated = {
      ...mockCandidate,
      reviewedText: 'The system shall securely authenticate users.',
    };
    const mockService = {
      updateCandidate: async () => updated,
    } as unknown as RequirementCandidateService;

    const result = await handleUpdateRequirementCandidate(
      { projectId, candidateId, reviewedText: 'The system shall securely authenticate users.' },
      mockService,
    );

    assert.equal(result.reviewedText, 'The system shall securely authenticate users.');
  });

  it('should handle candidate status batch updates correctly', async () => {
    const approved = { ...mockCandidate, reviewStatus: 'APPROVED' as const };
    const mockService = {
      setCandidateStatus: async () => [approved],
    } as unknown as RequirementCandidateService;

    const result = await handleSetRequirementCandidateStatus(
      { projectId, candidateIds: [candidateId], status: 'APPROVED' },
      mockService,
    );

    assert.equal(result.length, 1);
    assert.equal(result[0]!.reviewStatus, 'APPROVED');
  });

  it('should handle importing approved candidates correctly', async () => {
    const mockService = {
      importApprovedCandidates: async () => ({
        importedCount: 1,
        createdRequirements: [
          {
            id: crypto.randomUUID(),
            requirementKey: 'REQ-001',
            title: '[FR-01] The system shall authenticate users.',
          },
        ],
      }),
    } as unknown as RequirementCandidateService;

    const result = await handleImportApprovedCandidates({ projectId, documentId }, mockService);

    assert.equal(result.importedCount, 1);
    assert.equal(result.createdRequirements[0]!.requirementKey, 'REQ-001');
  });

  it('should reject invalid UUIDs with Zod validation error', async () => {
    const mockService = {} as unknown as RequirementCandidateService;

    await assert.rejects(
      () =>
        handleDetectRequirementCandidates(
          { projectId: 'invalid', documentId: 'not-a-uuid' },
          mockService,
        ),
      (err: unknown) => err instanceof Error,
    );
  });
});
