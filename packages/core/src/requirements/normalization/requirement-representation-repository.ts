/**
 * @file packages/core/src/requirements/normalization/requirement-representation-repository.ts
 * Prisma repository for persisting and querying structured RequirementRepresentation records with project isolation.
 */

import { getPrismaClient } from '../../database/client.js';
import { DatabaseError } from '../../database/errors.js';
import type { RequirementRepresentation, Prisma } from '@prisma/client';
import type {
  RequirementModality,
  NormalizationStatus,
  NormalizationMethod,
  RepresentationReviewStatus,
  RequirementConditionDto,
  RequirementConstraintDto,
  RequirementQuantitativeValueDto,
  NormalizationWarningCode,
} from '@ai-quality/contracts';
import type { CreateRepresentationInput } from './normalization-types.js';

export type RepresentationWithRequirement = RequirementRepresentation & {
  readonly requirement: {
    readonly id: string;
    readonly requirementKey: string;
    readonly originalText: string;
  };
};

export class RequirementRepresentationRepository {
  private getPrisma() {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new DatabaseError('Database client is not available.', 'DATABASE_UNAVAILABLE');
    }
    return prisma;
  }

  /**
   * Finds a requirement representation by requirement ID within a project.
   */
  public async findByRequirementId(
    projectId: string,
    requirementId: string,
  ): Promise<RepresentationWithRequirement | null> {
    try {
      const rep = await this.getPrisma().requirementRepresentation.findFirst({
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

      return rep as RepresentationWithRequirement | null;
    } catch {
      throw new DatabaseError('Failed to retrieve requirement representation.', 'QUERY_FAILED');
    }
  }

  /**
   * Creates or replaces the structured representation for a requirement.
   */
  public async upsertRepresentation(
    input: CreateRepresentationInput,
  ): Promise<RepresentationWithRequirement> {
    try {
      const prisma = this.getPrisma();

      const upserted = await prisma.requirementRepresentation.upsert({
        where: {
          requirementId: input.requirementId,
        },
        create: {
          projectId: input.projectId,
          requirementId: input.requirementId,
          normalizedText: input.normalizedText,
          actor: input.actor,
          modality: input.modality,
          negated: input.negated,
          action: input.action,
          object: input.object,
          conditions: (input.conditions as unknown as Prisma.InputJsonValue) ?? [],
          constraints: (input.constraints as unknown as Prisma.InputJsonValue) ?? [],
          quantitativeValues: (input.quantitativeValues as unknown as Prisma.InputJsonValue) ?? [],
          expectedOutcome: input.expectedOutcome,
          sourceRequirementTextSha256: input.sourceRequirementTextSha256,
          normalizationStatus: input.normalizationStatus,
          normalizationMethod: input.normalizationMethod,
          normalizerVersion: input.normalizerVersion,
          reviewStatus: input.reviewStatus,
          warnings: (input.warnings as unknown as Prisma.InputJsonValue) ?? [],
        },
        update: {
          normalizedText: input.normalizedText,
          actor: input.actor,
          modality: input.modality,
          negated: input.negated,
          action: input.action,
          object: input.object,
          conditions: (input.conditions as unknown as Prisma.InputJsonValue) ?? [],
          constraints: (input.constraints as unknown as Prisma.InputJsonValue) ?? [],
          quantitativeValues: (input.quantitativeValues as unknown as Prisma.InputJsonValue) ?? [],
          expectedOutcome: input.expectedOutcome,
          sourceRequirementTextSha256: input.sourceRequirementTextSha256,
          normalizationStatus: input.normalizationStatus,
          normalizationMethod: input.normalizationMethod,
          normalizerVersion: input.normalizerVersion,
          reviewStatus: input.reviewStatus,
          warnings: (input.warnings as unknown as Prisma.InputJsonValue) ?? [],
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

      return upserted as RepresentationWithRequirement;
    } catch {
      throw new DatabaseError(
        'Failed to persist structured requirement representation.',
        'QUERY_FAILED',
      );
    }
  }

  /**
   * Updates specific reviewed fields of a representation.
   */
  public async updateRepresentation(
    projectId: string,
    requirementId: string,
    updates: {
      normalizedText?: string;
      actor?: string | null;
      modality?: RequirementModality;
      negated?: boolean;
      action?: string | null;
      object?: string | null;
      conditions?: readonly RequirementConditionDto[];
      constraints?: readonly RequirementConstraintDto[];
      quantitativeValues?: readonly RequirementQuantitativeValueDto[];
      expectedOutcome?: string | null;
      normalizationStatus?: NormalizationStatus;
      normalizationMethod?: NormalizationMethod;
      reviewStatus?: RepresentationReviewStatus;
      warnings?: readonly NormalizationWarningCode[];
    },
  ): Promise<RepresentationWithRequirement> {
    try {
      const data: Prisma.RequirementRepresentationUpdateInput = {};

      if (updates.normalizedText !== undefined) data.normalizedText = updates.normalizedText;
      if (updates.actor !== undefined) data.actor = updates.actor;
      if (updates.modality !== undefined) data.modality = updates.modality;
      if (updates.negated !== undefined) data.negated = updates.negated;
      if (updates.action !== undefined) data.action = updates.action;
      if (updates.object !== undefined) data.object = updates.object;
      if (updates.conditions !== undefined)
        data.conditions = (updates.conditions as unknown as Prisma.InputJsonValue) ?? [];
      if (updates.constraints !== undefined)
        data.constraints = (updates.constraints as unknown as Prisma.InputJsonValue) ?? [];
      if (updates.quantitativeValues !== undefined)
        data.quantitativeValues =
          (updates.quantitativeValues as unknown as Prisma.InputJsonValue) ?? [];
      if (updates.expectedOutcome !== undefined) data.expectedOutcome = updates.expectedOutcome;
      if (updates.normalizationStatus !== undefined)
        data.normalizationStatus = updates.normalizationStatus;
      if (updates.normalizationMethod !== undefined)
        data.normalizationMethod = updates.normalizationMethod;
      if (updates.reviewStatus !== undefined) data.reviewStatus = updates.reviewStatus;
      if (updates.warnings !== undefined)
        data.warnings = (updates.warnings as unknown as Prisma.InputJsonValue) ?? [];

      const updated = await this.getPrisma().requirementRepresentation.update({
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

      return updated as RepresentationWithRequirement;
    } catch {
      throw new DatabaseError(
        'Failed to update structured requirement representation.',
        'QUERY_FAILED',
      );
    }
  }

  /**
   * Deletes representation for a given requirement if exists.
   */
  public async deleteByRequirementId(projectId: string, requirementId: string): Promise<boolean> {
    try {
      const existing = await this.findByRequirementId(projectId, requirementId);
      if (!existing) return false;

      await this.getPrisma().requirementRepresentation.delete({
        where: { requirementId },
      });
      return true;
    } catch {
      throw new DatabaseError('Failed to delete requirement representation.', 'QUERY_FAILED');
    }
  }
}
