/**
 * @file packages/core/src/requirements/provenance/requirement-provenance-service.ts
 * Domain service for managing and auditing requirement source provenance.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import type {
  RequirementProvenanceDto,
  RequirementSourceContextDto,
  SourceContextBlockDto,
  SourceIntegrityStatus,
  CandidateDetectionReasonDto,
  DocumentBlockDto,
  CandidateReviewStatus,
} from '@ai-quality/contracts';
import {
  RequirementProvenanceRepository,
  type ProvenanceWithRelations,
} from './requirement-provenance-repository.js';
import { DocumentStorage } from '../document-storage.js';
import { ProjectRepository } from '../../projects/project-repository.js';
import { ProjectNotFoundError } from '../../projects/project-errors.js';
import { ProvenanceNotFoundError } from '../requirement-errors.js';
import { getLogger } from '../../logging/logger.js';

export class RequirementProvenanceService {
  constructor(
    private readonly provenanceRepo: RequirementProvenanceRepository = new RequirementProvenanceRepository(),
    private readonly projectRepo: ProjectRepository = new ProjectRepository(),
    private readonly documentStorage: DocumentStorage = new DocumentStorage(),
  ) {}

  /**
   * Retrieves full provenance for a requirement with real-time integrity verification.
   */
  async getProvenance(projectId: string, requirementId: string): Promise<RequirementProvenanceDto> {
    const project = await this.projectRepo.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project ${projectId} was not found.`);
    }

    let provenance = await this.provenanceRepo.findByRequirementId(projectId, requirementId);

    // If not found, attempt backfill (e.g. for existing requirements)
    if (!provenance) {
      await this.provenanceRepo.backfillMissingProvenances(projectId);
      provenance = await this.provenanceRepo.findByRequirementId(projectId, requirementId);
    }

    if (!provenance) {
      throw new ProvenanceNotFoundError(
        `Provenance record was not found for requirement ${requirementId}.`,
      );
    }

    const { integrityStatus, integrityMessage } = await this.checkIntegrity(projectId, provenance);

    return this.mapToDto(provenance, integrityStatus, integrityMessage);
  }

  /**
   * Retrieves bounded surrounding source context for audit verification.
   */
  async getSourceContext(
    projectId: string,
    requirementId: string,
  ): Promise<RequirementSourceContextDto> {
    const project = await this.projectRepo.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project ${projectId} was not found.`);
    }

    let provenance = await this.provenanceRepo.findByRequirementId(projectId, requirementId);
    if (!provenance) {
      await this.provenanceRepo.backfillMissingProvenances(projectId);
      provenance = await this.provenanceRepo.findByRequirementId(projectId, requirementId);
    }

    if (!provenance) {
      throw new ProvenanceNotFoundError(
        `Provenance record was not found for requirement ${requirementId}.`,
      );
    }

    if (provenance.sourceKind === 'DOCUMENT' && provenance.document) {
      return this.buildDocumentSourceContext(provenance);
    }

    if (provenance.sourceKind === 'PASTED_TEXT') {
      const targetSnippet = provenance.sourceText || provenance.requirement.originalText;
      return {
        requirementId: provenance.requirementId,
        sourceKind: 'PASTED_TEXT',
        targetSnippet,
        highlightedText: targetSnippet,
        precedingBlocks: [],
        targetBlock: {
          id: 'pasted-block',
          type: 'PARAGRAPH',
          text: targetSnippet,
          isTarget: true,
          pageNumber: null,
          lineStart: provenance.lineStart,
          lineEnd: provenance.lineEnd,
        },
        succeedingBlocks: [],
        totalSurroundingBlocks: 1,
      };
    }

    // MANUAL source
    const targetSnippet = provenance.requirement.originalText;
    return {
      requirementId: provenance.requirementId,
      sourceKind: 'MANUAL',
      targetSnippet,
      highlightedText: targetSnippet,
      precedingBlocks: [],
      targetBlock: {
        id: 'manual-block',
        type: 'PARAGRAPH',
        text: targetSnippet,
        isTarget: true,
        pageNumber: null,
        lineStart: null,
        lineEnd: null,
      },
      succeedingBlocks: [],
      totalSurroundingBlocks: 1,
    };
  }

  /**
   * Checks source integrity against managed storage and cryptographic SHA-256 hashes.
   */
  private async checkIntegrity(
    projectId: string,
    provenance: ProvenanceWithRelations,
  ): Promise<{ integrityStatus: SourceIntegrityStatus; integrityMessage: string }> {
    if (provenance.sourceKind === 'MANUAL') {
      return {
        integrityStatus: 'VERIFIED',
        integrityMessage: 'Truthful manual entry origin verified.',
      };
    }

    if (provenance.sourceKind === 'PASTED_TEXT') {
      return {
        integrityStatus: 'VERIFIED',
        integrityMessage: 'Truthful bulk pasted text origin verified.',
      };
    }

    // DOCUMENT source verification
    if (!provenance.document) {
      return {
        integrityStatus: 'SOURCE_RECORD_MISSING',
        integrityMessage: 'Requirement document record is missing from database.',
      };
    }

    const filePath = this.documentStorage.getManagedFilePath(
      projectId,
      provenance.document.storageKey,
    );

    if (!fs.existsSync(filePath)) {
      getLogger().warn('requirement.provenance.missing_file', {
        projectId,
        requirementId: provenance.requirementId,
        documentId: provenance.documentId,
      });
      return {
        integrityStatus: 'MISSING_FILE',
        integrityMessage: 'Managed document file is missing from platform storage.',
      };
    }

    try {
      const fileBytes = await fs.promises.readFile(filePath);
      const actualSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');

      if (actualSha256 !== provenance.sourceSha256 && actualSha256 !== provenance.document.sha256) {
        getLogger().warn('requirement.provenance.hash_mismatch', {
          projectId,
          requirementId: provenance.requirementId,
          expectedSha256: provenance.sourceSha256,
          actualSha256,
        });
        return {
          integrityStatus: 'HASH_MISMATCH',
          integrityMessage:
            'Document integrity check failed: file bytes hash does not match stored SHA-256.',
        };
      }

      return {
        integrityStatus: 'VERIFIED',
        integrityMessage: 'Document hash and managed storage file bytes verified.',
      };
    } catch {
      return {
        integrityStatus: 'MISSING_FILE',
        integrityMessage: 'Failed to access managed document file.',
      };
    }
  }

  /**
   * Builds bounded document surrounding context blocks from extraction.
   */
  private buildDocumentSourceContext(
    provenance: ProvenanceWithRelations,
  ): RequirementSourceContextDto {
    const targetSnippet = provenance.sourceText || provenance.requirement.originalText;
    const targetBlockId = provenance.sourceBlockId;

    let precedingBlocks: SourceContextBlockDto[] = [];
    let targetBlock: SourceContextBlockDto | null = null;
    let succeedingBlocks: SourceContextBlockDto[] = [];

    if (provenance.extraction) {
      // In extraction record, blocks are stored as JSON
      const rawBlocks = (provenance.extraction.blocks as unknown as DocumentBlockDto[]) || [];
      const targetIndex = rawBlocks.findIndex(b => b.id === targetBlockId);

      if (targetIndex !== -1) {
        const tb = rawBlocks[targetIndex]!;
        targetBlock = {
          id: tb.id,
          type: tb.type,
          text: tb.text,
          isTarget: true,
          pageNumber: tb.pageNumber,
          lineStart: tb.lineStart,
          lineEnd: tb.lineEnd,
        };

        if (targetIndex > 0) {
          const pb = rawBlocks[targetIndex - 1]!;
          precedingBlocks = [
            {
              id: pb.id,
              type: pb.type,
              text: pb.text,
              isTarget: false,
              pageNumber: pb.pageNumber,
              lineStart: pb.lineStart,
              lineEnd: pb.lineEnd,
            },
          ];
        }

        if (targetIndex < rawBlocks.length - 1) {
          const sb = rawBlocks[targetIndex + 1]!;
          succeedingBlocks = [
            {
              id: sb.id,
              type: sb.type,
              text: sb.text,
              isTarget: false,
              pageNumber: sb.pageNumber,
              lineStart: sb.lineStart,
              lineEnd: sb.lineEnd,
            },
          ];
        }
      }
    }

    if (!targetBlock) {
      targetBlock = {
        id: targetBlockId || 'candidate-source',
        type: provenance.sourceTableId ? 'TABLE' : 'PARAGRAPH',
        text: targetSnippet,
        isTarget: true,
        pageNumber: provenance.pageNumber,
        lineStart: provenance.lineStart,
        lineEnd: provenance.lineEnd,
      };
    }

    return {
      requirementId: provenance.requirementId,
      sourceKind: 'DOCUMENT',
      targetSnippet,
      highlightedText: provenance.reviewedText || targetSnippet,
      precedingBlocks,
      targetBlock,
      succeedingBlocks,
      totalSurroundingBlocks: precedingBlocks.length + 1 + succeedingBlocks.length,
    };
  }

  /**
   * Maps Prisma provenance to platform-safe DTO.
   */
  private mapToDto(
    p: ProvenanceWithRelations,
    integrityStatus: SourceIntegrityStatus,
    integrityMessage: string,
  ): RequirementProvenanceDto {
    return {
      id: p.id,
      projectId: p.projectId,
      requirementId: p.requirementId,
      requirementKey: p.requirement.requirementKey,
      requirementSourceId: p.requirementSourceId,
      sourceKind: p.sourceKind,
      locationKind: p.locationKind,
      candidateId: p.candidateId,
      documentId: p.documentId,
      extractionId: p.extractionId,
      sourceBlockId: p.sourceBlockId,
      sourceTableId: p.sourceTableId,
      sourceRowIndex: p.sourceRowIndex,
      sectionId: p.sectionId,
      sectionPath: p.sectionPath,
      pageNumber: p.pageNumber,
      lineStart: p.lineStart,
      lineEnd: p.lineEnd,
      startOffset: p.startOffset,
      endOffset: p.endOffset,
      sourceText: p.sourceText,
      reviewedText: p.reviewedText,
      externalRequirementKey: p.externalRequirementKey,
      currentRequirementText: p.requirement.originalText,
      sourceSha256: p.sourceSha256,
      extractorVersion: p.extractorVersion,
      detectorVersion: p.detectorVersion,
      detectionReasons: (p.detectionReasons as unknown as CandidateDetectionReasonDto[]) ?? [],
      detectionScore: p.detectionScore,
      completeness: p.completeness,
      integrityStatus,
      integrityMessage,
      documentMetadata: p.document
        ? {
            id: p.document.id,
            originalFileName: p.document.originalFileName,
            fileExtension: p.document.fileExtension,
            mimeType: p.document.mimeType,
            fileSize: p.document.fileSize,
            sha256: p.document.sha256,
            createdAt: p.document.createdAt.toISOString(),
          }
        : null,
      candidateMetadata: p.candidate
        ? {
            id: p.candidate.id,
            detectorVersion: p.candidate.detectorVersion,
            detectionScore: p.candidate.detectionScore,
            detectionReasons:
              (p.candidate.detectionReasons as unknown as CandidateDetectionReasonDto[]) ?? [],
            reviewStatus: p.candidate.reviewStatus as CandidateReviewStatus,
            reviewedText: p.candidate.reviewedText,
          }
        : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
