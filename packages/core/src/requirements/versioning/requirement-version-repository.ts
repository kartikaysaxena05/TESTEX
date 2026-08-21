/**
 * @file packages/core/src/requirements/versioning/requirement-version-repository.ts
 * Prisma repository for persisting and querying RequirementVersion records.
 */

import { getPrismaClient } from '../../database/client.js';
import { DatabaseError } from '../../database/errors.js';
import type { RequirementVersion, Requirement, Prisma } from '@prisma/client';
import type {
  RequirementVersionDto,
  RequirementType,
  RequirementPriority,
  RequirementStatus,
} from '@ai-quality/contracts';
import { RequirementDiffEngine } from './requirement-diff-engine.js';
import type { RequirementVersionDraft } from './versioning-types.js';

export class RequirementVersionRepository {
  private getPrisma() {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new DatabaseError('Database client is not available.', 'UNAVAILABLE');
    }
    return prisma;
  }

  /**
   * Finds the latest version record for a requirement.
   */
  async findLatestVersion(
    requirementId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<RequirementVersion | null> {
    try {
      const client = tx ?? this.getPrisma();
      return await client.requirementVersion.findFirst({
        where: { requirementId },
        orderBy: { versionNumber: 'desc' },
      });
    } catch {
      throw new DatabaseError(
        `Failed to find latest requirement version for requirement ${requirementId}`,
        'QUERY_FAILED',
      );
    }
  }

  /**
   * Finds a specific version by its version number.
   */
  async findVersionByNumber(
    requirementId: string,
    versionNumber: number,
    tx?: Prisma.TransactionClient,
  ): Promise<RequirementVersion | null> {
    try {
      const client = tx ?? this.getPrisma();
      return await client.requirementVersion.findUnique({
        where: {
          requirementId_versionNumber: {
            requirementId,
            versionNumber,
          },
        },
      });
    } catch {
      throw new DatabaseError(
        `Failed to find version ${versionNumber} for requirement ${requirementId}`,
        'QUERY_FAILED',
      );
    }
  }

  /**
   * Counts the total versions for a requirement.
   */
  async countVersions(requirementId: string, tx?: Prisma.TransactionClient): Promise<number> {
    try {
      const client = tx ?? this.getPrisma();
      return await client.requirementVersion.count({
        where: { requirementId },
      });
    } catch {
      throw new DatabaseError(
        `Failed to count versions for requirement ${requirementId}`,
        'QUERY_FAILED',
      );
    }
  }

  /**
   * Lists paginated versions for a requirement ordered by versionNumber descending.
   */
  async listVersions(
    requirementId: string,
    page = 1,
    pageSize = 50,
  ): Promise<{ versions: RequirementVersion[]; total: number }> {
    try {
      const skip = (page - 1) * pageSize;
      const prisma = this.getPrisma();
      const [versions, total] = await Promise.all([
        prisma.requirementVersion.findMany({
          where: { requirementId },
          orderBy: { versionNumber: 'desc' },
          skip,
          take: pageSize,
        }),
        prisma.requirementVersion.count({
          where: { requirementId },
        }),
      ]);

      return { versions, total };
    } catch {
      throw new DatabaseError(
        `Failed to list versions for requirement ${requirementId}`,
        'QUERY_FAILED',
      );
    }
  }

  /**
   * Creates an immutable RequirementVersion record.
   */
  async createVersion(
    draft: RequirementVersionDraft,
    tx?: Prisma.TransactionClient,
  ): Promise<RequirementVersion> {
    try {
      const client = tx ?? this.getPrisma();
      return await client.requirementVersion.create({
        data: {
          projectId: draft.projectId,
          requirementId: draft.requirementId,
          versionNumber: draft.versionNumber,
          requirementKeySnapshot: draft.requirementKeySnapshot,
          title: draft.title,
          originalText: draft.originalText,
          type: draft.type,
          priority: draft.priority,
          status: draft.status,
          sourceRequirementTextSha256: draft.sourceRequirementTextSha256,
          changeKind: draft.changeKind,
          changeReason: draft.changeReason ?? null,
          changedFields: draft.changedFields as unknown as Prisma.InputJsonValue,
          createdByActorId: draft.createdByActorId ?? null,
        },
      });
    } catch {
      throw new DatabaseError(
        `Failed to create requirement version ${draft.versionNumber} for requirement ${draft.requirementId}`,
        'MUTATION_FAILED',
      );
    }
  }

  /**
   * Ensures that an existing requirement has a baseline Version 1 if no history exists yet.
   */
  async ensureBaselineVersion(
    requirement: Requirement,
    tx?: Prisma.TransactionClient,
  ): Promise<RequirementVersion> {
    const existingLatest = await this.findLatestVersion(requirement.id, tx);
    if (existingLatest) {
      return existingLatest;
    }

    const sha256 = RequirementDiffEngine.computeCanonicalContentHash({
      title: requirement.title,
      originalText: requirement.originalText,
      type: requirement.type as unknown as RequirementType,
      priority: requirement.priority as unknown as RequirementPriority,
      status: requirement.status as unknown as RequirementStatus,
    });

    return await this.createVersion(
      {
        projectId: requirement.projectId,
        requirementId: requirement.id,
        versionNumber: 1,
        requirementKeySnapshot: requirement.requirementKey,
        title: requirement.title,
        originalText: requirement.originalText,
        type: requirement.type as unknown as RequirementType,
        priority: requirement.priority as unknown as RequirementPriority,
        status: requirement.status as unknown as RequirementStatus,
        sourceRequirementTextSha256: sha256,
        changeKind: 'BASELINE_CAPTURE',
        changeReason: 'Phase 41 adoption baseline capture',
        changedFields: [],
        createdByActorId: null,
      },
      tx,
    );
  }

  /**
   * Maps a Prisma RequirementVersion record to its public DTO.
   */
  toDto(version: RequirementVersion): RequirementVersionDto {
    const changedFields = Array.isArray(version.changedFields)
      ? (version.changedFields as string[])
      : [];

    return {
      id: version.id,
      projectId: version.projectId,
      requirementId: version.requirementId,
      versionNumber: version.versionNumber,
      requirementKeySnapshot: version.requirementKeySnapshot,
      title: version.title,
      originalText: version.originalText,
      type: version.type as unknown as RequirementType,
      priority: version.priority as unknown as RequirementPriority,
      status: version.status as unknown as RequirementStatus,
      sourceRequirementTextSha256: version.sourceRequirementTextSha256,
      changeKind: version.changeKind,
      changeReason: version.changeReason,
      changedFields,
      createdByActorId: version.createdByActorId,
      createdAt: version.createdAt.toISOString(),
    };
  }
}
