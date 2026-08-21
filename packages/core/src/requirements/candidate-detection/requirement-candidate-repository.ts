/**
 * @file packages/core/src/requirements/candidate-detection/requirement-candidate-repository.ts
 * PostgreSQL repository for persisting and managing requirement candidates.
 */

import { getPrismaClient } from '../../database/client.js';
import type {
  PrismaClient,
  Prisma,
  CandidateReviewStatus as PrismaCandidateReviewStatus,
} from '@prisma/client';
import type {
  RequirementCandidateDto,
  CandidateReviewStatus,
  CandidateDetectionReasonDto,
  CandidateWarningDto,
} from '@ai-quality/contracts';
import type { RawDetectedCandidate } from './detection-types.js';

export class RequirementCandidateRepository {
  constructor(private readonly prisma?: PrismaClient) {}

  private getPrisma(): PrismaClient {
    if (this.prisma) {
      return this.prisma;
    }
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Database client is not configured or unavailable.');
    }
    return client;
  }

  async findById(projectId: string, candidateId: string): Promise<RequirementCandidateDto | null> {
    const prisma = this.getPrisma();
    const record = await prisma.requirementCandidate.findFirst({
      where: {
        id: candidateId,
        projectId,
      },
    });

    if (!record) return null;
    return this.mapToDto(record);
  }

  async listByDocument(
    projectId: string,
    requirementDocumentId: string,
    status?: CandidateReviewStatus | 'ALL',
    search?: string,
  ): Promise<RequirementCandidateDto[]> {
    const prisma = this.getPrisma();
    const where: Prisma.RequirementCandidateWhereInput = {
      projectId,
      requirementDocumentId,
    };

    if (status && status !== 'ALL') {
      where.reviewStatus = status as PrismaCandidateReviewStatus;
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { sourceText: { contains: q, mode: 'insensitive' } },
        { reviewedText: { contains: q, mode: 'insensitive' } },
        { externalKey: { contains: q, mode: 'insensitive' } },
        { sectionPath: { contains: q, mode: 'insensitive' } },
      ];
    }

    const records = await prisma.requirementCandidate.findMany({
      where,
      orderBy: { orderIndex: 'asc' },
    });

    return records.map(r => this.mapToDto(r));
  }

  async countByStatus(
    projectId: string,
    requirementDocumentId: string,
  ): Promise<{
    totalCount: number;
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    importedCount: number;
  }> {
    const prisma = this.getPrisma();
    const records = await prisma.requirementCandidate.findMany({
      where: {
        projectId,
        requirementDocumentId,
      },
      select: {
        reviewStatus: true,
      },
    });

    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let importedCount = 0;

    for (const r of records) {
      switch (r.reviewStatus) {
        case 'PENDING':
          pendingCount++;
          break;
        case 'APPROVED':
          approvedCount++;
          break;
        case 'REJECTED':
          rejectedCount++;
          break;
        case 'IMPORTED':
          importedCount++;
          break;
      }
    }

    return {
      totalCount: records.length,
      pendingCount,
      approvedCount,
      rejectedCount,
      importedCount,
    };
  }

  async saveDetectedCandidates(
    projectId: string,
    requirementDocumentId: string,
    extractionId: string,
    sourceSha256: string,
    detectorVersion: string,
    candidates: RawDetectedCandidate[],
    force = false,
  ): Promise<RequirementCandidateDto[]> {
    const prisma = this.getPrisma();

    // Check existing candidates for this document
    const existing = await prisma.requirementCandidate.findMany({
      where: {
        projectId,
        requirementDocumentId,
      },
    });

    // If existing candidates match same sourceSha256 and detectorVersion, and force is false:
    if (
      !force &&
      existing.length > 0 &&
      existing[0]!.sourceSha256 === sourceSha256 &&
      existing[0]!.detectorVersion === detectorVersion
    ) {
      return existing.map(r => this.mapToDto(r));
    }

    // When regenerating: preserve already reviewed candidates (APPROVED, REJECTED, IMPORTED)
    // and delete unreviewed PENDING ones
    return await prisma.$transaction(async tx => {
      if (force) {
        // Only delete PENDING candidates
        await tx.requirementCandidate.deleteMany({
          where: {
            projectId,
            requirementDocumentId,
            reviewStatus: 'PENDING',
          },
        });
      } else {
        // Initial detection: delete any existing unlinked candidates
        await tx.requirementCandidate.deleteMany({
          where: {
            projectId,
            requirementDocumentId,
          },
        });
      }

      const created = [];
      for (const cand of candidates) {
        const record = await tx.requirementCandidate.create({
          data: {
            projectId,
            requirementDocumentId,
            extractionId,
            sourceBlockId: cand.sourceBlockId,
            sourceTableId: cand.sourceTableId,
            sourceRowIndex: cand.sourceRowIndex,
            sourceText: cand.sourceText,
            reviewedText: null,
            externalKey: cand.externalKey,
            sectionId: cand.sectionId,
            sectionPath: cand.sectionPath,
            pageNumber: cand.pageNumber,
            lineStart: cand.lineStart,
            lineEnd: cand.lineEnd,
            startOffset: cand.startOffset,
            endOffset: cand.endOffset,
            detectionMethod: cand.detectionMethod,
            detectionReasons: cand.detectionReasons as unknown as Prisma.InputJsonValue,
            detectionScore: cand.detectionScore,
            warnings: cand.warnings as unknown as Prisma.InputJsonValue,
            reviewStatus: 'PENDING',
            detectorVersion,
            sourceSha256,
            orderIndex: cand.orderIndex,
          },
        });
        created.push(record);
      }

      return created.map(r => this.mapToDto(r));
    });
  }

  async updateReviewedText(
    projectId: string,
    candidateId: string,
    reviewedText: string,
  ): Promise<RequirementCandidateDto | null> {
    const prisma = this.getPrisma();
    const record = await prisma.requirementCandidate.updateMany({
      where: {
        id: candidateId,
        projectId,
      },
      data: {
        reviewedText,
      },
    });

    if (record.count === 0) return null;
    return this.findById(projectId, candidateId);
  }

  async updateStatusBatch(
    projectId: string,
    candidateIds: string[],
    status: CandidateReviewStatus,
  ): Promise<RequirementCandidateDto[]> {
    const prisma = this.getPrisma();
    await prisma.requirementCandidate.updateMany({
      where: {
        id: { in: candidateIds },
        projectId,
      },
      data: {
        reviewStatus: status as PrismaCandidateReviewStatus,
      },
    });

    const updated = await prisma.requirementCandidate.findMany({
      where: {
        id: { in: candidateIds },
        projectId,
      },
      orderBy: { orderIndex: 'asc' },
    });

    return updated.map(r => this.mapToDto(r));
  }

  async deleteByDocumentId(projectId: string, requirementDocumentId: string): Promise<boolean> {
    const prisma = this.getPrisma();
    const result = await prisma.requirementCandidate.deleteMany({
      where: {
        projectId,
        requirementDocumentId,
      },
    });
    return result.count > 0;
  }

  private mapToDto(record: {
    id: string;
    projectId: string;
    requirementDocumentId: string;
    extractionId: string;
    sourceBlockId: string | null;
    sourceTableId: string | null;
    sourceRowIndex: number | null;
    sourceText: string;
    reviewedText: string | null;
    externalKey: string | null;
    sectionId: string | null;
    sectionPath: string | null;
    pageNumber: number | null;
    lineStart: number | null;
    lineEnd: number | null;
    startOffset: number | null;
    endOffset: number | null;
    detectionMethod: string;
    detectionReasons: Prisma.JsonValue;
    detectionScore: number;
    warnings: Prisma.JsonValue;
    reviewStatus: string;
    importedRequirementId: string | null;
    detectorVersion: string;
    sourceSha256: string;
    orderIndex: number;
    createdAt: Date;
    updatedAt: Date;
  }): RequirementCandidateDto {
    return {
      id: record.id,
      projectId: record.projectId,
      requirementDocumentId: record.requirementDocumentId,
      extractionId: record.extractionId,
      sourceBlockId: record.sourceBlockId,
      sourceTableId: record.sourceTableId,
      sourceRowIndex: record.sourceRowIndex,
      sourceText: record.sourceText,
      reviewedText: record.reviewedText,
      externalKey: record.externalKey,
      sectionId: record.sectionId,
      sectionPath: record.sectionPath,
      pageNumber: record.pageNumber,
      lineStart: record.lineStart,
      lineEnd: record.lineEnd,
      startOffset: record.startOffset,
      endOffset: record.endOffset,
      detectionMethod: record.detectionMethod,
      detectionReasons: Array.isArray(record.detectionReasons)
        ? (record.detectionReasons as unknown as CandidateDetectionReasonDto[])
        : [],
      detectionScore: record.detectionScore,
      warnings: Array.isArray(record.warnings)
        ? (record.warnings as unknown as CandidateWarningDto[])
        : [],
      reviewStatus: record.reviewStatus as CandidateReviewStatus,
      importedRequirementId: record.importedRequirementId,
      detectorVersion: record.detectorVersion,
      sourceSha256: record.sourceSha256,
      orderIndex: record.orderIndex,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
