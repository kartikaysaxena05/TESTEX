/**
 * @file packages/core/src/requirements/classification/requirement-metadata-repository.ts
 * Prisma repository for persisting and querying structured RequirementMetadata records with project isolation.
 */

import { getPrismaClient } from '../../database/client.js';
import { DatabaseError } from '../../database/errors.js';
import type { RequirementMetadata, Prisma } from '@prisma/client';
import type {
  RequirementCategory,
  RequirementSubCategory,
  RequirementPriority,
  RequirementRiskLevel,
  RequirementCriticality,
  ClassificationMethod,
  ClassificationReviewStatus,
  ClassificationReasonCode,
} from '@ai-quality/contracts';
import type { CreateMetadataRecordInput } from './classification-types.js';

export type MetadataWithRequirement = RequirementMetadata & {
  readonly requirement: {
    readonly id: string;
    readonly requirementKey: string;
    readonly originalText: string;
  };
};

export class RequirementMetadataRepository {
  private getPrisma() {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new DatabaseError('Database client is not available.', 'DATABASE_UNAVAILABLE');
    }
    return prisma;
  }

  /**
   * Finds requirement metadata by requirement ID within a project.
   */
  public async findByRequirementId(
    projectId: string,
    requirementId: string,
  ): Promise<MetadataWithRequirement | null> {
    try {
      const meta = await this.getPrisma().requirementMetadata.findFirst({
        where: {
          projectId,
          requirementId,
        },
        include: {
          requirement: {
            select: {
              id: true,
              requirementKey: true,
              originalText: true,
            },
          },
        },
      });

      return meta as MetadataWithRequirement | null;
    } catch {
      throw new DatabaseError('Failed to retrieve requirement metadata.', 'QUERY_FAILED');
    }
  }

  /**
   * Creates or replaces the metadata record for a requirement atomically.
   */
  public async upsertMetadata(input: CreateMetadataRecordInput): Promise<MetadataWithRequirement> {
    try {
      const prisma = this.getPrisma();

      const upserted = await prisma.requirementMetadata.upsert({
        where: {
          requirementId: input.requirementId,
        },
        create: {
          projectId: input.projectId,
          requirementId: input.requirementId,
          category: input.category,
          subCategory: input.subCategory,
          domain: input.domain,
          module: input.module,
          businessCapability: input.businessCapability,
          actors: (input.actors as unknown as Prisma.InputJsonValue) ?? [],
          securityRelevant: input.securityRelevant,
          performanceRelevant: input.performanceRelevant,
          complianceRelevant: input.complianceRelevant,
          complianceStandards:
            (input.complianceStandards as unknown as Prisma.InputJsonValue) ?? [],
          priority: input.priority,
          riskLevel: input.riskLevel,
          criticality: input.criticality,
          tags: (input.tags as unknown as Prisma.InputJsonValue) ?? [],
          classificationMethod: input.classificationMethod,
          classifierVersion: input.classifierVersion,
          reviewStatus: input.reviewStatus,
          reasons: (input.reasons as unknown as Prisma.InputJsonValue) ?? [],
          sourceRequirementTextSha256: input.sourceRequirementTextSha256,
        },
        update: {
          category: input.category,
          subCategory: input.subCategory,
          domain: input.domain,
          module: input.module,
          businessCapability: input.businessCapability,
          actors: (input.actors as unknown as Prisma.InputJsonValue) ?? [],
          securityRelevant: input.securityRelevant,
          performanceRelevant: input.performanceRelevant,
          complianceRelevant: input.complianceRelevant,
          complianceStandards:
            (input.complianceStandards as unknown as Prisma.InputJsonValue) ?? [],
          priority: input.priority,
          riskLevel: input.riskLevel,
          criticality: input.criticality,
          tags: (input.tags as unknown as Prisma.InputJsonValue) ?? [],
          classificationMethod: input.classificationMethod,
          classifierVersion: input.classifierVersion,
          reviewStatus: input.reviewStatus,
          reasons: (input.reasons as unknown as Prisma.InputJsonValue) ?? [],
          sourceRequirementTextSha256: input.sourceRequirementTextSha256,
        },
        include: {
          requirement: {
            select: {
              id: true,
              requirementKey: true,
              originalText: true,
            },
          },
        },
      });

      return upserted as MetadataWithRequirement;
    } catch {
      throw new DatabaseError('Failed to persist requirement metadata.', 'QUERY_FAILED');
    }
  }

  /**
   * Updates reviewed metadata fields.
   */
  public async updateMetadata(
    projectId: string,
    requirementId: string,
    updates: {
      category?: RequirementCategory;
      subCategory?: RequirementSubCategory | null;
      domain?: string | null;
      module?: string | null;
      businessCapability?: string | null;
      actors?: readonly string[];
      securityRelevant?: boolean;
      performanceRelevant?: boolean;
      complianceRelevant?: boolean;
      complianceStandards?: readonly string[];
      priority?: RequirementPriority;
      riskLevel?: RequirementRiskLevel;
      criticality?: RequirementCriticality;
      tags?: readonly string[];
      classificationMethod?: ClassificationMethod;
      reviewStatus?: ClassificationReviewStatus;
      reasons?: readonly ClassificationReasonCode[];
    },
  ): Promise<MetadataWithRequirement> {
    try {
      const data: Prisma.RequirementMetadataUpdateInput = {};

      if (updates.category !== undefined) data.category = updates.category;
      if (updates.subCategory !== undefined) data.subCategory = updates.subCategory;
      if (updates.domain !== undefined) data.domain = updates.domain;
      if (updates.module !== undefined) data.module = updates.module;
      if (updates.businessCapability !== undefined)
        data.businessCapability = updates.businessCapability;
      if (updates.actors !== undefined)
        data.actors = (updates.actors as unknown as Prisma.InputJsonValue) ?? [];
      if (updates.securityRelevant !== undefined) data.securityRelevant = updates.securityRelevant;
      if (updates.performanceRelevant !== undefined)
        data.performanceRelevant = updates.performanceRelevant;
      if (updates.complianceRelevant !== undefined)
        data.complianceRelevant = updates.complianceRelevant;
      if (updates.complianceStandards !== undefined)
        data.complianceStandards =
          (updates.complianceStandards as unknown as Prisma.InputJsonValue) ?? [];
      if (updates.priority !== undefined) data.priority = updates.priority;
      if (updates.riskLevel !== undefined) data.riskLevel = updates.riskLevel;
      if (updates.criticality !== undefined) data.criticality = updates.criticality;
      if (updates.tags !== undefined)
        data.tags = (updates.tags as unknown as Prisma.InputJsonValue) ?? [];
      if (updates.classificationMethod !== undefined)
        data.classificationMethod = updates.classificationMethod;
      if (updates.reviewStatus !== undefined) data.reviewStatus = updates.reviewStatus;
      if (updates.reasons !== undefined)
        data.reasons = (updates.reasons as unknown as Prisma.InputJsonValue) ?? [];

      const updated = await this.getPrisma().requirementMetadata.update({
        where: {
          requirementId,
        },
        data,
        include: {
          requirement: {
            select: {
              id: true,
              requirementKey: true,
              originalText: true,
            },
          },
        },
      });

      return updated as MetadataWithRequirement;
    } catch {
      throw new DatabaseError('Failed to update requirement metadata.', 'QUERY_FAILED');
    }
  }

  /**
   * Deletes metadata for a requirement.
   */
  public async deleteByRequirementId(projectId: string, requirementId: string): Promise<boolean> {
    try {
      const existing = await this.findByRequirementId(projectId, requirementId);
      if (!existing) return false;

      await this.getPrisma().requirementMetadata.delete({
        where: { requirementId },
      });
      return true;
    } catch {
      throw new DatabaseError('Failed to delete requirement metadata.', 'QUERY_FAILED');
    }
  }
}
