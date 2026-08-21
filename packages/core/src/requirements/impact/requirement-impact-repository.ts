/**
 * @file packages/core/src/requirements/impact/requirement-impact-repository.ts
 * Prisma repository for persisting and querying RequirementChangeImpact records.
 */

import { getPrismaClient } from '../../database/client.js';
import { DatabaseError } from '../../database/errors.js';
import type { RequirementChangeImpact, Prisma } from '@prisma/client';
import type {
  RequirementImpactCandidateDto,
  RequirementImpactStatus,
  RequirementImpactType,
} from '@ai-quality/contracts';
import type { ImpactCandidateDraft } from './impact-types.js';

export type ImpactWithRelations = RequirementChangeImpact & {
  readonly targetRequirement?: {
    readonly id: string;
    readonly requirementKey: string;
    readonly title: string;
  } | null;
  readonly repositoryEvidence?: {
    readonly id: string;
    readonly filePath: string;
    readonly symbolName: string | null;
  } | null;
};

export class RequirementImpactRepository {
  private getPrisma() {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new DatabaseError('Database client is not available.', 'UNAVAILABLE');
    }
    return prisma;
  }

  /**
   * Persists a batch of impact candidate records safely handling null foreign keys.
   */
  async createImpacts(
    impacts: readonly ImpactCandidateDraft[],
    tx?: Prisma.TransactionClient,
  ): Promise<RequirementChangeImpact[]> {
    if (impacts.length === 0) return [];
    try {
      const client = tx ?? this.getPrisma();
      const created: RequirementChangeImpact[] = [];

      for (const draft of impacts) {
        const existing = await client.requirementChangeImpact.findFirst({
          where: {
            requirementVersionId: draft.requirementVersionId,
            impactType: draft.impactType,
            targetRequirementId: draft.targetRequirementId ?? null,
            repositoryEvidenceId: draft.repositoryEvidenceId ?? null,
          },
        });

        if (existing) {
          const item = await client.requirementChangeImpact.update({
            where: { id: existing.id },
            data: {
              reasonCode: draft.reasonCode,
              depth: draft.depth,
            },
          });
          created.push(item);
        } else {
          const item = await client.requirementChangeImpact.create({
            data: {
              projectId: draft.projectId,
              requirementId: draft.requirementId,
              requirementVersionId: draft.requirementVersionId,
              impactType: draft.impactType,
              targetRequirementId: draft.targetRequirementId ?? null,
              repositoryEvidenceId: draft.repositoryEvidenceId ?? null,
              projectSourceId: draft.projectSourceId ?? null,
              indexedFileId: draft.indexedFileId ?? null,
              symbolId: draft.symbolId ?? null,
              reasonCode: draft.reasonCode,
              status: draft.status ?? 'OPEN',
              reviewRationale: draft.reviewRationale ?? null,
              depth: draft.depth,
            },
          });
          created.push(item);
        }
      }

      return created;
    } catch {
      throw new DatabaseError('Failed to persist impact candidates', 'MUTATION_FAILED');
    }
  }

  /**
   * Finds all impact records for a requirement version with relations loaded.
   */
  async findImpactsByVersion(requirementVersionId: string): Promise<ImpactWithRelations[]> {
    try {
      return await this.getPrisma().requirementChangeImpact.findMany({
        where: { requirementVersionId },
        include: {
          targetRequirement: {
            select: {
              id: true,
              requirementKey: true,
              title: true,
            },
          },
          repositoryEvidence: {
            select: {
              id: true,
              filePath: true,
              symbolName: true,
            },
          },
        },
        orderBy: [{ depth: 'asc' }, { impactType: 'asc' }],
      });
    } catch {
      throw new DatabaseError(
        `Failed to find impact records for version ${requirementVersionId}`,
        'QUERY_FAILED',
      );
    }
  }

  /**
   * Finds an individual impact candidate by ID.
   */
  async findImpactById(impactId: string): Promise<ImpactWithRelations | null> {
    try {
      return await this.getPrisma().requirementChangeImpact.findUnique({
        where: { id: impactId },
        include: {
          targetRequirement: {
            select: {
              id: true,
              requirementKey: true,
              title: true,
            },
          },
          repositoryEvidence: {
            select: {
              id: true,
              filePath: true,
              symbolName: true,
            },
          },
        },
      });
    } catch {
      throw new DatabaseError(`Failed to find impact record ${impactId}`, 'QUERY_FAILED');
    }
  }

  /**
   * Updates human review status and notes for an impact candidate.
   */
  async updateImpactReview(
    impactId: string,
    status: RequirementImpactStatus,
    reviewRationale?: string | null,
  ): Promise<ImpactWithRelations> {
    try {
      return await this.getPrisma().requirementChangeImpact.update({
        where: { id: impactId },
        data: {
          status,
          reviewRationale: reviewRationale !== undefined ? reviewRationale : undefined,
          reviewedAt: new Date(),
        },
        include: {
          targetRequirement: {
            select: {
              id: true,
              requirementKey: true,
              title: true,
            },
          },
          repositoryEvidence: {
            select: {
              id: true,
              filePath: true,
              symbolName: true,
            },
          },
        },
      });
    } catch {
      throw new DatabaseError(`Failed to update impact review for ${impactId}`, 'MUTATION_FAILED');
    }
  }

  /**
   * Maps an ImpactWithRelations record to public DTO.
   */
  toDto(impact: ImpactWithRelations): RequirementImpactCandidateDto {
    return {
      id: impact.id,
      projectId: impact.projectId,
      requirementId: impact.requirementId,
      requirementVersionId: impact.requirementVersionId,
      impactType: impact.impactType as RequirementImpactType,
      targetRequirementId: impact.targetRequirementId,
      targetRequirementKey: impact.targetRequirement?.requirementKey ?? null,
      targetRequirementTitle: impact.targetRequirement?.title ?? null,
      repositoryEvidenceId: impact.repositoryEvidenceId,
      repositoryEvidencePath: impact.repositoryEvidence?.filePath ?? null,
      repositoryEvidenceSymbol: impact.repositoryEvidence?.symbolName ?? null,
      reasonCode: impact.reasonCode,
      status: impact.status as RequirementImpactStatus,
      reviewRationale: impact.reviewRationale,
      depth: impact.depth,
      createdAt: impact.createdAt.toISOString(),
      reviewedAt: impact.reviewedAt?.toISOString() ?? null,
    };
  }
}
