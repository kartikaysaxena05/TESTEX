/**
 * @file packages/core/src/requirements/requirement-source-repository.ts
 * Prisma access layer for RequirementSource persistence and queries with project isolation.
 */

import { getPrismaClient } from '../database/client.js';
import { DatabaseError } from '../database/errors.js';
import { type RequirementSource, Prisma } from '@prisma/client';
import type { RequirementSourceType, RequirementSourceStatus } from '@ai-quality/contracts';

export interface RequirementSourceWithCount extends RequirementSource {
  readonly _count?: {
    readonly requirements: number;
  };
}

export interface CreateRequirementSourceRecordInput {
  readonly projectId: string;
  readonly name: string;
  readonly sourceType?: RequirementSourceType;
  readonly status?: RequirementSourceStatus;
  readonly description?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}

export class RequirementSourceRepository {
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
   * Lists all requirement sources for a specific project with requirement counts.
   */
  async listSourcesForProject(projectId: string): Promise<readonly RequirementSourceWithCount[]> {
    try {
      const sources = await this.getPrisma().requirementSource.findMany({
        where: { projectId },
        include: {
          _count: {
            select: { requirements: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
      return sources;
    } catch {
      throw new DatabaseError('Failed to query requirement sources for project.', 'QUERY_FAILED');
    }
  }

  /**
   * Finds a single requirement source scoped strictly to the given project ID.
   */
  async getSourceById(
    projectId: string,
    sourceId: string,
  ): Promise<RequirementSourceWithCount | null> {
    try {
      const source = await this.getPrisma().requirementSource.findFirst({
        where: {
          id: sourceId,
          projectId,
        },
        include: {
          _count: {
            select: { requirements: true },
          },
        },
      });
      return source;
    } catch {
      throw new DatabaseError('Failed to query requirement source by ID.', 'QUERY_FAILED');
    }
  }

  /**
   * Creates a new requirement source record.
   */
  async createSource(
    input: CreateRequirementSourceRecordInput,
  ): Promise<RequirementSourceWithCount> {
    try {
      const created = await this.getPrisma().requirementSource.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          sourceType: input.sourceType ?? 'MANUAL',
          status: input.status ?? 'ACTIVE',
          description: input.description ?? null,
          metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
        include: {
          _count: {
            select: { requirements: true },
          },
        },
      });
      return created;
    } catch {
      throw new DatabaseError('Failed to create requirement source.', 'MUTATION_FAILED');
    }
  }

  /**
   * Retrieves or creates the default idempotent MANUAL RequirementSource for a project.
   */
  async getOrCreateManualSource(projectId: string): Promise<RequirementSourceWithCount> {
    try {
      const existing = await this.getPrisma().requirementSource.findFirst({
        where: {
          projectId,
          sourceType: 'MANUAL',
        },
        include: {
          _count: {
            select: { requirements: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (existing) {
        return existing;
      }

      return await this.createSource({
        projectId,
        name: 'Manual Requirements',
        sourceType: 'MANUAL',
        status: 'ACTIVE',
        description: 'Manually entered project requirements.',
      });
    } catch {
      throw new DatabaseError(
        'Failed to get or create manual requirement source.',
        'MUTATION_FAILED',
      );
    }
  }
}
