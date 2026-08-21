/**
 * @file packages/core/src/requirements/evidence/requirement-repository-evidence-repository.ts
 * Prisma repository for persisting and querying RequirementRepositoryEvidence records.
 */

import { getPrismaClient } from '../../database/client.js';
import { DatabaseError } from '../../database/errors.js';
import type { RequirementRepositoryEvidence, Prisma } from '@prisma/client';
import type { RepositoryEvidenceType, RepositoryEvidenceStatus } from '@ai-quality/contracts';
import { MATCHER_VERSION, type RepositoryEvidenceDraft } from './evidence-types.js';

export type EvidenceWithRelations = RequirementRepositoryEvidence & {
  readonly requirement: {
    readonly id: string;
    readonly requirementKey: string;
    readonly title: string;
    readonly originalText: string;
  };
  readonly projectSource: {
    readonly id: string;
    readonly displayName: string;
    readonly rootPath: string;
  };
  readonly repositorySnapshot: {
    readonly id: string;
    readonly fingerprint: string;
  } | null;
  readonly indexedFile: {
    readonly id: string;
    readonly relativePath: string;
    readonly contentHash: string | null;
  } | null;
  readonly symbol: {
    readonly id: string;
    readonly name: string;
    readonly startLine: number;
    readonly endLine: number;
  } | null;
};

export class RequirementRepositoryEvidenceRepository {
  private getPrisma() {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new DatabaseError(
        'Database connection is not configured or unavailable.',
        'DATABASE_UNAVAILABLE',
      );
    }
    return prisma;
  }

  /**
   * Retrieves all repository evidence items for a requirement.
   */
  async getEvidenceForRequirement(
    projectId: string,
    requirementId: string,
  ): Promise<EvidenceWithRelations[]> {
    try {
      const prisma = this.getPrisma();
      return (await prisma.requirementRepositoryEvidence.findMany({
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
          projectSource: {
            select: {
              id: true,
              displayName: true,
              rootPath: true,
            },
          },
          repositorySnapshot: {
            select: {
              id: true,
              fingerprint: true,
            },
          },
          indexedFile: {
            select: {
              id: true,
              relativePath: true,
              contentHash: true,
            },
          },
          symbol: {
            select: {
              id: true,
              name: true,
              startLine: true,
              endLine: true,
            },
          },
        },
        orderBy: [{ evidenceScore: 'desc' }, { filePath: 'asc' }],
      })) as EvidenceWithRelations[];
    } catch {
      throw new DatabaseError(
        `Failed to retrieve evidence for requirement ${requirementId}`,
        'QUERY_FAILED',
      );
    }
  }

  /**
   * Retrieves a single evidence record by ID.
   */
  async getEvidenceById(id: string): Promise<EvidenceWithRelations | null> {
    try {
      const prisma = this.getPrisma();
      return (await prisma.requirementRepositoryEvidence.findUnique({
        where: { id },
        include: {
          requirement: {
            select: {
              id: true,
              requirementKey: true,
              title: true,
              originalText: true,
            },
          },
          projectSource: {
            select: {
              id: true,
              displayName: true,
              rootPath: true,
            },
          },
          repositorySnapshot: {
            select: {
              id: true,
              fingerprint: true,
            },
          },
          indexedFile: {
            select: {
              id: true,
              relativePath: true,
              contentHash: true,
            },
          },
          symbol: {
            select: {
              id: true,
              name: true,
              startLine: true,
              endLine: true,
            },
          },
        },
      })) as EvidenceWithRelations | null;
    } catch {
      throw new DatabaseError(`Failed to retrieve repository evidence ${id}`, 'QUERY_FAILED');
    }
  }

  /**
   * Atomically saves matched candidate evidence while preserving existing human reviews.
   */
  async saveCandidateEvidence(
    projectId: string,
    requirementId: string,
    candidates: readonly RepositoryEvidenceDraft[],
  ): Promise<void> {
    try {
      const prisma = this.getPrisma();
      await prisma.$transaction(async tx => {
        for (const draft of candidates) {
          const existing = await tx.requirementRepositoryEvidence.findUnique({
            where: {
              requirementId_projectSourceId_filePath_evidenceType_symbolName: {
                requirementId,
                projectSourceId: draft.projectSourceId,
                filePath: draft.filePath,
                evidenceType: draft.evidenceType,
                symbolName: draft.symbolName ?? '',
              },
            },
          });

          if (existing) {
            // Preserve confirmed or rejected status
            if (existing.status === 'CONFIRMED' || existing.status === 'REJECTED') {
              await tx.requirementRepositoryEvidence.update({
                where: { id: existing.id },
                data: {
                  repositorySnapshotId: draft.repositorySnapshotId,
                  indexedFileId: draft.indexedFileId,
                  symbolId: draft.symbolId,
                  fileContentHash: draft.fileContentHash,
                  evidenceScore: draft.evidenceScore,
                  reasonCodes: draft.reasonCodes as Prisma.InputJsonValue,
                  sourceRequirementTextSha256: draft.sourceRequirementTextSha256,
                  matcherVersion: MATCHER_VERSION,
                },
              });
            } else {
              // Update candidate
              await tx.requirementRepositoryEvidence.update({
                where: { id: existing.id },
                data: {
                  repositorySnapshotId: draft.repositorySnapshotId,
                  indexedFileId: draft.indexedFileId,
                  symbolId: draft.symbolId,
                  fileContentHash: draft.fileContentHash,
                  evidenceScore: draft.evidenceScore,
                  reasonCodes: draft.reasonCodes as Prisma.InputJsonValue,
                  matchMethod: draft.matchMethod,
                  sourceRequirementTextSha256: draft.sourceRequirementTextSha256,
                  matcherVersion: MATCHER_VERSION,
                },
              });
            }
          } else {
            // Insert new candidate
            await tx.requirementRepositoryEvidence.create({
              data: {
                projectId,
                requirementId,
                projectSourceId: draft.projectSourceId,
                repositorySnapshotId: draft.repositorySnapshotId,
                indexedFileId: draft.indexedFileId,
                symbolId: draft.symbolId,
                evidenceType: draft.evidenceType,
                filePath: draft.filePath,
                symbolName: draft.symbolName ?? '',
                lineStart: draft.lineStart,
                lineEnd: draft.lineEnd,
                fileContentHash: draft.fileContentHash,
                evidenceScore: draft.evidenceScore,
                reasonCodes: draft.reasonCodes as Prisma.InputJsonValue,
                matchMethod: draft.matchMethod,
                status: draft.status,
                sourceRequirementTextSha256: draft.sourceRequirementTextSha256,
                matcherVersion: MATCHER_VERSION,
              },
            });
          }
        }
      });
    } catch {
      throw new DatabaseError(
        `Failed to save candidate repository evidence for requirement ${requirementId}`,
        'TRANSACTION_FAILED',
      );
    }
  }

  /**
   * Manually links a repository entity as confirmed evidence.
   */
  async createManualEvidence(data: {
    projectId: string;
    requirementId: string;
    projectSourceId: string;
    repositorySnapshotId: string | null;
    indexedFileId: string;
    symbolId: string | null;
    evidenceType: RepositoryEvidenceType;
    filePath: string;
    symbolName: string | null;
    lineStart: number | null;
    lineEnd: number | null;
    fileContentHash: string | null;
    sourceRequirementTextSha256: string;
    reviewRationale?: string | null;
  }): Promise<EvidenceWithRelations> {
    try {
      const prisma = this.getPrisma();
      return (await prisma.requirementRepositoryEvidence.upsert({
        where: {
          requirementId_projectSourceId_filePath_evidenceType_symbolName: {
            requirementId: data.requirementId,
            projectSourceId: data.projectSourceId,
            filePath: data.filePath,
            evidenceType: data.evidenceType,
            symbolName: data.symbolName ?? '',
          },
        },
        create: {
          projectId: data.projectId,
          requirementId: data.requirementId,
          projectSourceId: data.projectSourceId,
          repositorySnapshotId: data.repositorySnapshotId,
          indexedFileId: data.indexedFileId,
          symbolId: data.symbolId,
          evidenceType: data.evidenceType,
          filePath: data.filePath,
          symbolName: data.symbolName ?? '',
          lineStart: data.lineStart,
          lineEnd: data.lineEnd,
          fileContentHash: data.fileContentHash,
          evidenceScore: 10,
          reasonCodes: ['MANUAL_ATTACHMENT'] as Prisma.InputJsonValue,
          matchMethod: 'MANUAL',
          status: 'CONFIRMED',
          sourceRequirementTextSha256: data.sourceRequirementTextSha256,
          matcherVersion: MATCHER_VERSION,
          reviewRationale: data.reviewRationale ?? null,
        },
        update: {
          evidenceType: data.evidenceType,
          matchMethod: 'MANUAL',
          status: 'CONFIRMED',
          evidenceScore: 10,
          reasonCodes: ['MANUAL_ATTACHMENT'] as Prisma.InputJsonValue,
          reviewRationale: data.reviewRationale ?? null,
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
          projectSource: {
            select: {
              id: true,
              displayName: true,
              rootPath: true,
            },
          },
          repositorySnapshot: {
            select: {
              id: true,
              fingerprint: true,
            },
          },
          indexedFile: {
            select: {
              id: true,
              relativePath: true,
              contentHash: true,
            },
          },
          symbol: {
            select: {
              id: true,
              name: true,
              startLine: true,
              endLine: true,
            },
          },
        },
      })) as EvidenceWithRelations;
    } catch {
      throw new DatabaseError(
        `Failed to create manual repository evidence for requirement ${data.requirementId}`,
        'MUTATION_FAILED',
      );
    }
  }

  /**
   * Updates review status and rationale for evidence.
   */
  async updateEvidenceReview(
    id: string,
    status: RepositoryEvidenceStatus,
    reviewRationale?: string | null,
  ): Promise<EvidenceWithRelations> {
    try {
      const prisma = this.getPrisma();
      return (await prisma.requirementRepositoryEvidence.update({
        where: { id },
        data: {
          status,
          matchMethod: 'DETERMINISTIC_REVIEWED',
          reviewRationale: reviewRationale !== undefined ? reviewRationale : undefined,
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
          projectSource: {
            select: {
              id: true,
              displayName: true,
              rootPath: true,
            },
          },
          repositorySnapshot: {
            select: {
              id: true,
              fingerprint: true,
            },
          },
          indexedFile: {
            select: {
              id: true,
              relativePath: true,
              contentHash: true,
            },
          },
          symbol: {
            select: {
              id: true,
              name: true,
              startLine: true,
              endLine: true,
            },
          },
        },
      })) as EvidenceWithRelations;
    } catch {
      throw new DatabaseError(
        `Failed to update review status for repository evidence ${id}`,
        'MUTATION_FAILED',
      );
    }
  }

  /**
   * Deletes an evidence record.
   */
  async deleteEvidence(id: string): Promise<void> {
    try {
      const prisma = this.getPrisma();
      await prisma.requirementRepositoryEvidence.delete({
        where: { id },
      });
    } catch {
      throw new DatabaseError(`Failed to delete repository evidence ${id}`, 'MUTATION_FAILED');
    }
  }
}
