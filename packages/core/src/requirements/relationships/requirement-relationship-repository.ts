/**
 * @file packages/core/src/requirements/relationships/requirement-relationship-repository.ts
 * Prisma repository for persisting and querying RequirementRelationship records.
 */

import { getPrismaClient } from '../../database/client.js';
import { DatabaseError } from '../../database/errors.js';
import type { RequirementRelationship, Prisma } from '@prisma/client';
import type {
  RequirementRelationshipType,
  RelationshipDetectionMethod,
  RelationshipStatus,
} from '@ai-quality/contracts';
import {
  RELATIONSHIP_ANALYZER_VERSION,
  type ProposedRelationshipDraft,
} from './relationship-types.js';

export type RelationshipWithRequirements = RequirementRelationship & {
  readonly sourceRequirement: {
    readonly id: string;
    readonly requirementKey: string;
    readonly title: string;
    readonly originalText: string;
  };
  readonly targetRequirement: {
    readonly id: string;
    readonly requirementKey: string;
    readonly title: string;
    readonly originalText: string;
  };
};

export class RequirementRelationshipRepository {
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
   * Retrieves all relationships in a project with source and target requirement details.
   */
  async getRelationshipsByProjectId(projectId: string): Promise<RelationshipWithRequirements[]> {
    try {
      const prisma = this.getPrisma();
      return (await prisma.requirementRelationship.findMany({
        where: { projectId },
        include: {
          sourceRequirement: {
            select: {
              id: true,
              requirementKey: true,
              title: true,
              originalText: true,
            },
          },
          targetRequirement: {
            select: {
              id: true,
              requirementKey: true,
              title: true,
              originalText: true,
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }],
      })) as RelationshipWithRequirements[];
    } catch {
      throw new DatabaseError(
        `Failed to retrieve relationships for project ${projectId}`,
        'QUERY_FAILED',
      );
    }
  }

  /**
   * Retrieves all relationships where the requirement is either source or target.
   */
  async getRelationshipsForRequirement(
    projectId: string,
    requirementId: string,
  ): Promise<RelationshipWithRequirements[]> {
    try {
      const prisma = this.getPrisma();
      return (await prisma.requirementRelationship.findMany({
        where: {
          projectId,
          OR: [{ sourceRequirementId: requirementId }, { targetRequirementId: requirementId }],
        },
        include: {
          sourceRequirement: {
            select: {
              id: true,
              requirementKey: true,
              title: true,
              originalText: true,
            },
          },
          targetRequirement: {
            select: {
              id: true,
              requirementKey: true,
              title: true,
              originalText: true,
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }],
      })) as RelationshipWithRequirements[];
    } catch {
      throw new DatabaseError(
        `Failed to retrieve relationships for requirement ${requirementId}`,
        'QUERY_FAILED',
      );
    }
  }

  /**
   * Retrieves a single relationship by ID.
   */
  async getRelationshipById(id: string): Promise<RelationshipWithRequirements | null> {
    try {
      const prisma = this.getPrisma();
      return (await prisma.requirementRelationship.findUnique({
        where: { id },
        include: {
          sourceRequirement: {
            select: {
              id: true,
              requirementKey: true,
              title: true,
              originalText: true,
            },
          },
          targetRequirement: {
            select: {
              id: true,
              requirementKey: true,
              title: true,
              originalText: true,
            },
          },
        },
      })) as RelationshipWithRequirements | null;
    } catch {
      throw new DatabaseError(`Failed to retrieve requirement relationship ${id}`, 'QUERY_FAILED');
    }
  }

  /**
   * Retrieves a relationship by exact edge definition.
   */
  async getRelationshipByEdge(
    sourceRequirementId: string,
    targetRequirementId: string,
    relationshipType: RequirementRelationshipType,
  ): Promise<RequirementRelationship | null> {
    try {
      const prisma = this.getPrisma();
      return await prisma.requirementRelationship.findUnique({
        where: {
          sourceRequirementId_targetRequirementId_relationshipType: {
            sourceRequirementId,
            targetRequirementId,
            relationshipType,
          },
        },
      });
    } catch {
      throw new DatabaseError(
        `Failed to lookup relationship between ${sourceRequirementId} and ${targetRequirementId}`,
        'QUERY_FAILED',
      );
    }
  }

  /**
   * Creates a manual relationship record.
   */
  async createRelationship(data: {
    projectId: string;
    sourceRequirementId: string;
    targetRequirementId: string;
    relationshipType: RequirementRelationshipType;
    detectionMethod: RelationshipDetectionMethod;
    status: RelationshipStatus;
    reasonCodes: readonly string[];
    evidence?: string | null;
    sourceRequirementTextSha256: string;
    targetRequirementTextSha256: string;
    reviewRationale?: string | null;
  }): Promise<RelationshipWithRequirements> {
    try {
      const prisma = this.getPrisma();
      return (await prisma.requirementRelationship.create({
        data: {
          projectId: data.projectId,
          sourceRequirementId: data.sourceRequirementId,
          targetRequirementId: data.targetRequirementId,
          relationshipType: data.relationshipType,
          detectionMethod: data.detectionMethod,
          status: data.status,
          reasonCodes: data.reasonCodes as Prisma.InputJsonValue,
          evidence: data.evidence ?? null,
          sourceRequirementTextSha256: data.sourceRequirementTextSha256,
          targetRequirementTextSha256: data.targetRequirementTextSha256,
          analyzerVersion: RELATIONSHIP_ANALYZER_VERSION,
          reviewRationale: data.reviewRationale ?? null,
        },
        include: {
          sourceRequirement: {
            select: {
              id: true,
              requirementKey: true,
              title: true,
              originalText: true,
            },
          },
          targetRequirement: {
            select: {
              id: true,
              requirementKey: true,
              title: true,
              originalText: true,
            },
          },
        },
      })) as RelationshipWithRequirements;
    } catch {
      throw new DatabaseError('Failed to create requirement relationship', 'MUTATION_FAILED');
    }
  }

  /**
   * Atomically persists proposed relationships preserving any existing human reviews.
   */
  async saveProposedRelationships(
    projectId: string,
    proposals: readonly ProposedRelationshipDraft[],
  ): Promise<void> {
    try {
      const prisma = this.getPrisma();
      await prisma.$transaction(async tx => {
        for (const draft of proposals) {
          const existing = await tx.requirementRelationship.findUnique({
            where: {
              sourceRequirementId_targetRequirementId_relationshipType: {
                sourceRequirementId: draft.sourceRequirementId,
                targetRequirementId: draft.targetRequirementId,
                relationshipType: draft.relationshipType,
              },
            },
          });

          if (existing) {
            // Preserve confirmed or rejected status decisions
            if (existing.status === 'CONFIRMED' || existing.status === 'REJECTED') {
              await tx.requirementRelationship.update({
                where: { id: existing.id },
                data: {
                  sourceRequirementTextSha256: draft.sourceRequirementTextSha256,
                  targetRequirementTextSha256: draft.targetRequirementTextSha256,
                  analyzerVersion: RELATIONSHIP_ANALYZER_VERSION,
                },
              });
            } else {
              // Update existing proposal
              await tx.requirementRelationship.update({
                where: { id: existing.id },
                data: {
                  reasonCodes: draft.reasonCodes as Prisma.InputJsonValue,
                  evidence: draft.evidence,
                  sourceRequirementTextSha256: draft.sourceRequirementTextSha256,
                  targetRequirementTextSha256: draft.targetRequirementTextSha256,
                  analyzerVersion: RELATIONSHIP_ANALYZER_VERSION,
                },
              });
            }
          } else {
            // Insert new proposal
            await tx.requirementRelationship.create({
              data: {
                projectId,
                sourceRequirementId: draft.sourceRequirementId,
                targetRequirementId: draft.targetRequirementId,
                relationshipType: draft.relationshipType,
                detectionMethod: draft.detectionMethod,
                status: draft.status,
                reasonCodes: draft.reasonCodes as Prisma.InputJsonValue,
                evidence: draft.evidence,
                sourceRequirementTextSha256: draft.sourceRequirementTextSha256,
                targetRequirementTextSha256: draft.targetRequirementTextSha256,
                analyzerVersion: RELATIONSHIP_ANALYZER_VERSION,
              },
            });
          }
        }
      });
    } catch {
      throw new DatabaseError(
        `Failed to save proposed relationships for project ${projectId}`,
        'TRANSACTION_FAILED',
      );
    }
  }

  /**
   * Updates the review status and rationale of a relationship.
   */
  async updateRelationshipReview(
    id: string,
    status: RelationshipStatus,
    reviewRationale?: string | null,
  ): Promise<RelationshipWithRequirements> {
    try {
      const prisma = this.getPrisma();
      return (await prisma.requirementRelationship.update({
        where: { id },
        data: {
          status,
          detectionMethod: 'DETERMINISTIC_REVIEWED',
          reviewRationale: reviewRationale !== undefined ? reviewRationale : undefined,
        },
        include: {
          sourceRequirement: {
            select: {
              id: true,
              requirementKey: true,
              title: true,
              originalText: true,
            },
          },
          targetRequirement: {
            select: {
              id: true,
              requirementKey: true,
              title: true,
              originalText: true,
            },
          },
        },
      })) as RelationshipWithRequirements;
    } catch {
      throw new DatabaseError(
        `Failed to update review status for relationship ${id}`,
        'MUTATION_FAILED',
      );
    }
  }

  /**
   * Deletes a relationship by ID.
   */
  async deleteRelationship(id: string): Promise<void> {
    try {
      const prisma = this.getPrisma();
      await prisma.requirementRelationship.delete({
        where: { id },
      });
    } catch {
      throw new DatabaseError(`Failed to delete requirement relationship ${id}`, 'MUTATION_FAILED');
    }
  }
}
