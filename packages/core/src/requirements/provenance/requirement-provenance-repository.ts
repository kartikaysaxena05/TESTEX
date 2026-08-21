/**
 * @file packages/core/src/requirements/provenance/requirement-provenance-repository.ts
 * PostgreSQL repository for requirement source provenance records.
 */

import { getPrismaClient } from '../../database/client.js';
import type { Prisma } from '@prisma/client';
import type { ProvenanceSourceKind, CandidateDetectionReasonDto } from '@ai-quality/contracts';
import type { RawRequirementProvenanceInput } from './provenance-types.js';
import { ProvenanceValidator } from './provenance-validator.js';
import { RequirementValidationError } from '../requirement-errors.js';

export type ProvenanceWithRelations = Prisma.RequirementProvenanceGetPayload<{
  include: {
    requirement: {
      select: {
        id: true;
        requirementKey: true;
        title: true;
        originalText: true;
      };
    };
    requirementSource: {
      select: {
        id: true;
        name: true;
        sourceType: true;
      };
    };
    document: {
      select: {
        id: true;
        originalFileName: true;
        fileExtension: true;
        mimeType: true;
        fileSize: true;
        sha256: true;
        storageKey: true;
        createdAt: true;
      };
    };
    candidate: {
      select: {
        id: true;
        detectorVersion: true;
        detectionScore: true;
        detectionReasons: true;
        reviewStatus: true;
        reviewedText: true;
        sourceText: true;
      };
    };
    extraction: {
      select: {
        id: true;
        extractorVersion: true;
        format: true;
        sourceSha256: true;
        blocks: true;
      };
    };
  };
}>;

export class RequirementProvenanceRepository {
  private getPrisma() {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }
    return prisma;
  }

  /**
   * Creates a new provenance record atomically.
   */
  async createProvenance(
    input: RawRequirementProvenanceInput,
    txClient?: Prisma.TransactionClient,
  ): Promise<ProvenanceWithRelations> {
    const validation = ProvenanceValidator.validate(input);
    if (!validation.isValid) {
      throw new RequirementValidationError(
        `Invalid provenance data: ${validation.errors.join('; ')}`,
      );
    }

    const locationKind = input.locationKind ?? ProvenanceValidator.deriveLocationKind(input);
    const completeness = input.completeness ?? validation.completeness;

    const prisma = txClient ?? this.getPrisma();

    const created = await prisma.requirementProvenance.create({
      data: {
        projectId: input.projectId,
        requirementId: input.requirementId,
        requirementSourceId: input.requirementSourceId,
        sourceKind: input.sourceKind,
        locationKind,
        candidateId: input.candidateId ?? null,
        documentId: input.documentId ?? null,
        extractionId: input.extractionId ?? null,
        sourceBlockId: input.sourceBlockId ?? null,
        sourceTableId: input.sourceTableId ?? null,
        sourceRowIndex: input.sourceRowIndex ?? null,
        sectionId: input.sectionId ?? null,
        sectionPath: input.sectionPath ?? null,
        pageNumber: input.pageNumber ?? null,
        lineStart: input.lineStart ?? null,
        lineEnd: input.lineEnd ?? null,
        startOffset: input.startOffset ?? null,
        endOffset: input.endOffset ?? null,
        sourceText: input.sourceText ?? null,
        reviewedText: input.reviewedText ?? null,
        externalRequirementKey: input.externalRequirementKey ?? null,
        sourceSha256: input.sourceSha256 ?? null,
        extractorVersion: input.extractorVersion ?? null,
        detectorVersion: input.detectorVersion ?? null,
        detectionReasons: (input.detectionReasons as unknown as Prisma.InputJsonValue) ?? [],
        detectionScore: input.detectionScore ?? null,
        completeness,
      },
      include: {
        requirement: {
          select: {
            id: true,
            requirementKey: true,
            title: true,
            originalText: true,
          },
        },
        requirementSource: {
          select: {
            id: true,
            name: true,
            sourceType: true,
          },
        },
        document: {
          select: {
            id: true,
            originalFileName: true,
            fileExtension: true,
            mimeType: true,
            fileSize: true,
            sha256: true,
            storageKey: true,
            createdAt: true,
          },
        },
        candidate: {
          select: {
            id: true,
            detectorVersion: true,
            detectionScore: true,
            detectionReasons: true,
            reviewStatus: true,
            reviewedText: true,
            sourceText: true,
          },
        },
        extraction: {
          select: {
            id: true,
            extractorVersion: true,
            format: true,
            sourceSha256: true,
            blocks: true,
          },
        },
      },
    });

    return created;
  }

  /**
   * Finds a requirement's provenance by projectId and requirementId.
   */
  async findByRequirementId(
    projectId: string,
    requirementId: string,
  ): Promise<ProvenanceWithRelations | null> {
    const prisma = this.getPrisma();

    return prisma.requirementProvenance.findFirst({
      where: {
        projectId,
        requirementId,
      },
      include: {
        requirement: {
          select: {
            id: true,
            requirementKey: true,
            title: true,
            originalText: true,
          },
        },
        requirementSource: {
          select: {
            id: true,
            name: true,
            sourceType: true,
          },
        },
        document: {
          select: {
            id: true,
            originalFileName: true,
            fileExtension: true,
            mimeType: true,
            fileSize: true,
            sha256: true,
            storageKey: true,
            createdAt: true,
          },
        },
        candidate: {
          select: {
            id: true,
            detectorVersion: true,
            detectionScore: true,
            detectionReasons: true,
            reviewStatus: true,
            reviewedText: true,
            sourceText: true,
          },
        },
        extraction: {
          select: {
            id: true,
            extractorVersion: true,
            format: true,
            sourceSha256: true,
            blocks: true,
          },
        },
      },
    });
  }

  /**
   * Counts requirements by provenance completeness for a project.
   */
  async countByCompleteness(projectId: string): Promise<{
    completeCount: number;
    partialCount: number;
    minimalCount: number;
    totalCount: number;
  }> {
    const prisma = this.getPrisma();

    const counts = await prisma.requirementProvenance.groupBy({
      by: ['completeness'],
      where: { projectId },
      _count: { id: true },
    });

    let completeCount = 0;
    let partialCount = 0;
    let minimalCount = 0;

    for (const group of counts) {
      if (group.completeness === 'COMPLETE') completeCount = group._count.id;
      if (group.completeness === 'PARTIAL') partialCount = group._count.id;
      if (group.completeness === 'MINIMAL') minimalCount = group._count.id;
    }

    return {
      completeCount,
      partialCount,
      minimalCount,
      totalCount: completeCount + partialCount + minimalCount,
    };
  }

  /**
   * Checks if any live provenance record depends on a specific document.
   */
  async hasDependentsOnDocument(documentId: string): Promise<boolean> {
    const prisma = this.getPrisma();
    const count = await prisma.requirementProvenance.count({
      where: { documentId },
    });
    return count > 0;
  }

  /**
   * Checks if any live provenance record depends on a specific requirement source.
   */
  async hasDependentsOnSource(sourceId: string): Promise<boolean> {
    const prisma = this.getPrisma();
    const count = await prisma.requirementProvenance.count({
      where: { requirementSourceId: sourceId },
    });
    return count > 0;
  }

  /**
   * Backfills provenance for any requirements lacking a provenance record.
   */
  async backfillMissingProvenances(
    projectId: string,
  ): Promise<{ backfilledCount: number; skippedCount: number }> {
    const prisma = this.getPrisma();

    // Find requirements in project that do not have a provenance record
    const reqs = await prisma.requirement.findMany({
      where: {
        projectId,
        provenance: null,
      },
      include: {
        requirementSource: true,
        importedCandidates: {
          include: {
            requirementDocument: true,
            extraction: true,
          },
          take: 1,
        },
      },
    });

    let backfilledCount = 0;

    for (const req of reqs) {
      if (!req.requirementSourceId) continue;

      const sourceKind: ProvenanceSourceKind =
        (req.requirementSource?.sourceType as ProvenanceSourceKind) || 'MANUAL';
      const candidate = req.importedCandidates[0];

      if (sourceKind === 'DOCUMENT' && candidate) {
        await this.createProvenance({
          projectId: req.projectId,
          requirementId: req.id,
          requirementSourceId: req.requirementSourceId,
          sourceKind: 'DOCUMENT',
          candidateId: candidate.id,
          documentId: candidate.requirementDocumentId,
          extractionId: candidate.extractionId,
          sourceBlockId: candidate.sourceBlockId,
          sourceTableId: candidate.sourceTableId,
          sourceRowIndex: candidate.sourceRowIndex,
          sectionId: candidate.sectionId,
          sectionPath: candidate.sectionPath,
          pageNumber: candidate.pageNumber,
          lineStart: candidate.lineStart,
          lineEnd: candidate.lineEnd,
          startOffset: candidate.startOffset,
          endOffset: candidate.endOffset,
          sourceText: candidate.sourceText,
          reviewedText: candidate.reviewedText,
          externalRequirementKey: candidate.externalKey,
          sourceSha256: candidate.sourceSha256,
          extractorVersion: candidate.extraction?.extractorVersion ?? null,
          detectorVersion: candidate.detectorVersion,
          detectionReasons:
            (candidate.detectionReasons as unknown as CandidateDetectionReasonDto[]) ?? [],
          detectionScore: candidate.detectionScore,
          completeness: 'COMPLETE',
        });
      } else if (sourceKind === 'PASTED_TEXT') {
        await this.createProvenance({
          projectId: req.projectId,
          requirementId: req.id,
          requirementSourceId: req.requirementSourceId,
          sourceKind: 'PASTED_TEXT',
          sourceText: req.originalText,
          completeness: 'PARTIAL',
        });
      } else {
        await this.createProvenance({
          projectId: req.projectId,
          requirementId: req.id,
          requirementSourceId: req.requirementSourceId,
          sourceKind: 'MANUAL',
          completeness: 'MINIMAL',
        });
      }

      backfilledCount++;
    }

    return {
      backfilledCount,
      skippedCount: 0,
    };
  }
}
