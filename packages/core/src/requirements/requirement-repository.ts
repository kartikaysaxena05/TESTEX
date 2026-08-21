/**
 * @file packages/core/src/requirements/requirement-repository.ts
 * Prisma access layer for Requirement persistence and queries with project isolation and sequence allocation.
 */

import { getPrismaClient } from '../database/client.js';
import { DatabaseError } from '../database/errors.js';
import type { Requirement, RequirementSource, Prisma } from '@prisma/client';
import type {
  RequirementType,
  RequirementPriority,
  RequirementStatus,
  RequirementSummaryDto,
  RequirementDto,
  PaginatedResult,
  ProvenanceSourceKind,
} from '@ai-quality/contracts';
import { RequirementKeyConflictError } from './requirement-errors.js';
import { RequirementDiffEngine } from './versioning/requirement-diff-engine.js';

export interface RequirementWithSource extends Requirement {
  readonly requirementSource?: Pick<RequirementSource, 'id' | 'name'> | null;
}

export interface ListRequirementsQueryOptions {
  readonly page?: number;
  readonly pageSize?: number;
  readonly status?: RequirementStatus;
  readonly type?: RequirementType;
  readonly priority?: RequirementPriority;
  readonly searchQuery?: string;
  readonly requirementSourceId?: string;
}

export interface CreateRequirementRecordInput {
  readonly projectId: string;
  readonly requirementKey?: string;
  readonly title: string;
  readonly originalText: string;
  readonly requirementSourceId?: string | null;
  readonly type?: RequirementType;
  readonly priority?: RequirementPriority;
  readonly status?: RequirementStatus;
}

export interface BulkRequirementItemRecordInput {
  readonly title: string;
  readonly originalText: string;
  readonly type?: RequirementType;
  readonly priority?: RequirementPriority;
  readonly status?: RequirementStatus;
  readonly detectedExternalKey?: string | null;
  readonly lineStart?: number | null;
  readonly lineEnd?: number | null;
}

export interface CreateBulkRequirementsRecordInput {
  readonly projectId: string;
  readonly sourceName?: string;
  readonly items: readonly BulkRequirementItemRecordInput[];
}

export interface CreateBulkRequirementsResult {
  readonly source: Pick<RequirementSource, 'id' | 'name'>;
  readonly requirements: RequirementWithSource[];
}

export class RequirementRepository {
  private getPrisma() {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new DatabaseError('Database client is not available.', 'UNAVAILABLE');
    }
    return prisma;
  }

  /**
   * Allocates the next sequential requirement key for a project atomically.
   */
  async allocateNextRequirementKey(projectId: string): Promise<string> {
    const prisma = this.getPrisma();
    try {
      return await prisma.$transaction(async tx => {
        const sequence = await tx.projectRequirementSequence.findUnique({
          where: { projectId },
        });

        if (!sequence) {
          // Initialize sequence from existing requirements if any exist
          const existingReqs = await tx.requirement.findMany({
            where: { projectId },
            select: { requirementKey: true },
          });

          let maxIndex = 0;
          for (const req of existingReqs) {
            const match = /^REQ-(\d+)$/i.exec(req.requirementKey);
            if (match && match[1]) {
              const num = parseInt(match[1], 10);
              if (!isNaN(num) && num > maxIndex) {
                maxIndex = num;
              }
            }
          }

          await tx.projectRequirementSequence.create({
            data: {
              projectId,
              nextValue: maxIndex + 2,
            },
          });

          const allocated = maxIndex + 1;
          return `REQ-${String(allocated).padStart(3, '0')}`;
        }

        const allocated = sequence.nextValue;
        await tx.projectRequirementSequence.update({
          where: { projectId },
          data: { nextValue: { increment: 1 } },
        });

        return `REQ-${String(allocated).padStart(3, '0')}`;
      });
    } catch {
      throw new DatabaseError('Failed to allocate requirement key sequence.', 'MUTATION_FAILED');
    }
  }

  /**
   * Lists requirements for a project with deterministic ordering and bounded pagination.
   */
  async listRequirements(
    projectId: string,
    options: ListRequirementsQueryOptions = {},
  ): Promise<PaginatedResult<RequirementWithSource>> {
    try {
      const page = Math.max(1, options.page ?? 1);
      const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 50));
      const skip = (page - 1) * pageSize;

      const where: Prisma.RequirementWhereInput = { projectId };

      if (options.status) {
        where.status = options.status;
      }
      if (options.type) {
        where.type = options.type;
      }
      if (options.priority) {
        where.priority = options.priority;
      }
      if (options.requirementSourceId) {
        where.requirementSourceId = options.requirementSourceId;
      }
      if (options.searchQuery?.trim()) {
        const query = options.searchQuery.trim();
        where.OR = [
          { requirementKey: { contains: query, mode: 'insensitive' } },
          { title: { contains: query, mode: 'insensitive' } },
        ];
      }

      const [items, total] = await Promise.all([
        this.getPrisma().requirement.findMany({
          where,
          include: {
            requirementSource: {
              select: { id: true, name: true },
            },
          },
          orderBy: { requirementKey: 'asc' },
          skip,
          take: pageSize,
        }),
        this.getPrisma().requirement.count({ where }),
      ]);

      const totalPages = Math.ceil(total / pageSize) || 1;

      return {
        items,
        total,
        page,
        pageSize,
        totalPages,
      };
    } catch {
      throw new DatabaseError('Failed to list requirements for project.', 'QUERY_FAILED');
    }
  }

  /**
   * Finds a single requirement scoped strictly to the given project ID.
   */
  async getRequirementById(
    projectId: string,
    requirementId: string,
  ): Promise<RequirementWithSource | null> {
    try {
      const requirement = await this.getPrisma().requirement.findFirst({
        where: {
          id: requirementId,
          projectId,
        },
        include: {
          requirementSource: {
            select: { id: true, name: true },
          },
        },
      });
      return requirement;
    } catch {
      throw new DatabaseError('Failed to query requirement by ID.', 'QUERY_FAILED');
    }
  }

  /**
   * Finds a requirement by its human-readable key within a project.
   */
  async getRequirementByKey(
    projectId: string,
    requirementKey: string,
  ): Promise<RequirementWithSource | null> {
    try {
      const requirement = await this.getPrisma().requirement.findUnique({
        where: {
          projectId_requirementKey: {
            projectId,
            requirementKey: requirementKey.trim(),
          },
        },
        include: {
          requirementSource: {
            select: { id: true, name: true },
          },
        },
      });
      return requirement;
    } catch {
      throw new DatabaseError('Failed to query requirement by key.', 'QUERY_FAILED');
    }
  }

  /**
   * Retrieves all requirements for a project with provenance, representation, and metadata.
   */
  async getRequirementsByProjectId(projectId: string) {
    try {
      return await this.getPrisma().requirement.findMany({
        where: { projectId },
        include: {
          requirementSource: {
            select: { id: true, name: true, sourceType: true },
          },
          provenance: true,
          representation: true,
          metadata: true,
        },
        orderBy: { requirementKey: 'asc' },
      });
    } catch {
      throw new DatabaseError('Failed to query requirements by project ID.', 'QUERY_FAILED');
    }
  }

  /**
   * Retrieves a single requirement with full relational details.
   */
  async getRequirementWithDetails(projectId: string, requirementId: string) {
    try {
      return await this.getPrisma().requirement.findFirst({
        where: { id: requirementId, projectId },
        include: {
          requirementSource: {
            select: { id: true, name: true, sourceType: true },
          },
          provenance: true,
          representation: true,
          metadata: true,
        },
      });
    } catch {
      throw new DatabaseError('Failed to query requirement with details.', 'QUERY_FAILED');
    }
  }

  /**
   * Creates a new requirement record with transaction-safe key allocation.
   */
  async createRequirement(input: CreateRequirementRecordInput): Promise<RequirementWithSource> {
    const prisma = this.getPrisma();
    try {
      return await prisma.$transaction(async tx => {
        let finalKey = input.requirementKey?.trim();
        if (!finalKey) {
          let sequence = await tx.projectRequirementSequence.findUnique({
            where: { projectId: input.projectId },
          });

          if (!sequence) {
            const existingReqs = await tx.requirement.findMany({
              where: { projectId: input.projectId },
              select: { requirementKey: true },
            });

            let maxIndex = 0;
            for (const req of existingReqs) {
              const match = /^REQ-(\d+)$/i.exec(req.requirementKey);
              if (match && match[1]) {
                const num = parseInt(match[1], 10);
                if (!isNaN(num) && num > maxIndex) {
                  maxIndex = num;
                }
              }
            }

            try {
              sequence = await tx.projectRequirementSequence.create({
                data: {
                  projectId: input.projectId,
                  nextValue: maxIndex + 1,
                },
              });
            } catch {
              // Sequence was created by concurrent transaction
              sequence = await tx.projectRequirementSequence.findUnique({
                where: { projectId: input.projectId },
              });
            }
          }

          const updatedSeq = await tx.projectRequirementSequence.update({
            where: { projectId: input.projectId },
            data: { nextValue: { increment: 1 } },
          });

          const allocatedNum = updatedSeq.nextValue - 1;
          finalKey = `REQ-${String(allocatedNum).padStart(3, '0')}`;
        }

        const created = await tx.requirement.create({
          data: {
            projectId: input.projectId,
            requirementKey: finalKey,
            title: input.title.trim(),
            originalText: input.originalText,
            requirementSourceId: input.requirementSourceId ?? null,
            type: input.type ?? 'UNKNOWN',
            priority: input.priority ?? 'UNSPECIFIED',
            status: input.status ?? 'DRAFT',
          },
          include: {
            requirementSource: {
              select: { id: true, name: true, sourceType: true },
            },
          },
        });

        if (input.requirementSourceId) {
          const sourceKind: ProvenanceSourceKind =
            (created.requirementSource?.sourceType as ProvenanceSourceKind) || 'MANUAL';
          await tx.requirementProvenance.create({
            data: {
              projectId: input.projectId,
              requirementId: created.id,
              requirementSourceId: input.requirementSourceId,
              sourceKind,
              locationKind: 'NONE',
              sourceText: input.originalText,
              completeness: 'MINIMAL',
            },
          });
        }

        // Atomically create baseline RequirementVersion 1
        const sha256 = RequirementDiffEngine.computeCanonicalContentHash({
          title: created.title,
          originalText: created.originalText,
          type: created.type as RequirementType,
          priority: created.priority as RequirementPriority,
          status: created.status as RequirementStatus,
        });

        await tx.requirementVersion.create({
          data: {
            projectId: created.projectId,
            requirementId: created.id,
            versionNumber: 1,
            requirementKeySnapshot: created.requirementKey,
            title: created.title,
            originalText: created.originalText,
            type: created.type,
            priority: created.priority,
            status: created.status,
            sourceRequirementTextSha256: sha256,
            changeKind: 'CREATED',
            changeReason: 'Initial requirement creation',
            changedFields: [],
            createdByActorId: null,
          },
        });

        return created;
      });
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        throw new RequirementKeyConflictError(
          `Requirement with key '${input.requirementKey || 'specified'}' already exists in this project.`,
        );
      }
      if (err instanceof RequirementKeyConflictError) {
        throw err;
      }
      throw new DatabaseError('Failed to create requirement.', 'MUTATION_FAILED');
    }
  }

  /**
   * Creates a batch of requirements linked to a new PASTED_TEXT source inside an atomic transaction.
   */
  async createBulkRequirements(
    input: CreateBulkRequirementsRecordInput,
  ): Promise<CreateBulkRequirementsResult> {
    const prisma = this.getPrisma();
    try {
      return await prisma.$transaction(async tx => {
        // 1. Create the PASTED_TEXT requirement source
        const sourceName =
          input.sourceName?.trim() ||
          `Bulk Paste — ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`;
        const source = await tx.requirementSource.create({
          data: {
            projectId: input.projectId,
            name: sourceName,
            sourceType: 'PASTED_TEXT',
            status: 'ACTIVE',
            description: `Bulk imported ${input.items.length} requirements from pasted text.`,
          },
          select: { id: true, name: true },
        });

        // 2. Initialize or update sequence atomically
        let sequence = await tx.projectRequirementSequence.findUnique({
          where: { projectId: input.projectId },
        });

        if (!sequence) {
          const existingReqs = await tx.requirement.findMany({
            where: { projectId: input.projectId },
            select: { requirementKey: true },
          });

          let maxIndex = 0;
          for (const req of existingReqs) {
            const match = /^REQ-(\d+)$/i.exec(req.requirementKey);
            if (match && match[1]) {
              const num = parseInt(match[1], 10);
              if (!isNaN(num) && num > maxIndex) {
                maxIndex = num;
              }
            }
          }

          try {
            sequence = await tx.projectRequirementSequence.create({
              data: {
                projectId: input.projectId,
                nextValue: maxIndex + 1,
              },
            });
          } catch {
            sequence = await tx.projectRequirementSequence.findUnique({
              where: { projectId: input.projectId },
            });
          }
        }

        const count = input.items.length;
        const updatedSeq = await tx.projectRequirementSequence.update({
          where: { projectId: input.projectId },
          data: { nextValue: { increment: count } },
        });

        const startNum = updatedSeq.nextValue - count;
        const createdRequirements: RequirementWithSource[] = [];

        for (let i = 0; i < count; i++) {
          const item = input.items[i]!;
          const allocatedKey = `REQ-${String(startNum + i).padStart(3, '0')}`;

          const created = await tx.requirement.create({
            data: {
              projectId: input.projectId,
              requirementKey: allocatedKey,
              title: item.title.trim(),
              originalText: item.originalText,
              requirementSourceId: source.id,
              type: item.type ?? 'UNKNOWN',
              priority: item.priority ?? 'UNSPECIFIED',
              status: item.status ?? 'DRAFT',
            },
            include: {
              requirementSource: {
                select: { id: true, name: true },
              },
            },
          });

          const hasLineBounds = item.lineStart !== null && item.lineStart !== undefined;
          await tx.requirementProvenance.create({
            data: {
              projectId: input.projectId,
              requirementId: created.id,
              requirementSourceId: source.id,
              sourceKind: 'PASTED_TEXT',
              locationKind: hasLineBounds ? 'PASTE_LINE' : 'NONE',
              lineStart: item.lineStart ?? null,
              lineEnd: item.lineEnd ?? null,
              sourceText: item.originalText,
              externalRequirementKey: item.detectedExternalKey ?? null,
              completeness: hasLineBounds ? 'COMPLETE' : 'PARTIAL',
            },
          });

          // Atomically create baseline RequirementVersion 1
          const sha256 = RequirementDiffEngine.computeCanonicalContentHash({
            title: created.title,
            originalText: created.originalText,
            type: created.type as RequirementType,
            priority: created.priority as RequirementPriority,
            status: created.status as RequirementStatus,
          });

          await tx.requirementVersion.create({
            data: {
              projectId: created.projectId,
              requirementId: created.id,
              versionNumber: 1,
              requirementKeySnapshot: created.requirementKey,
              title: created.title,
              originalText: created.originalText,
              type: created.type,
              priority: created.priority,
              status: created.status,
              sourceRequirementTextSha256: sha256,
              changeKind: 'CREATED',
              changeReason: 'Bulk imported requirement',
              changedFields: [],
              createdByActorId: null,
            },
          });

          createdRequirements.push(created);
        }

        return {
          source,
          requirements: createdRequirements,
        };
      });
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        throw new RequirementKeyConflictError(
          'A requirement key conflict occurred during bulk import.',
        );
      }
      if (err instanceof RequirementKeyConflictError) {
        throw err;
      }
      throw new DatabaseError('Failed to import bulk requirements.', 'MUTATION_FAILED');
    }
  }

  /**
   * Aggregates requirement counts by status, type, and priority for a project.
   */
  async getRequirementSummary(projectId: string): Promise<RequirementSummaryDto> {
    try {
      const requirements = await this.getPrisma().requirement.findMany({
        where: { projectId },
        select: {
          status: true,
          type: true,
          priority: true,
        },
      });

      const countsByStatus: Record<RequirementStatus, number> = {
        DRAFT: 0,
        ACTIVE: 0,
        DEPRECATED: 0,
        ARCHIVED: 0,
      };

      const countsByType: Record<RequirementType, number> = {
        FUNCTIONAL: 0,
        NON_FUNCTIONAL: 0,
        BUSINESS_RULE: 0,
        SECURITY: 0,
        PERFORMANCE: 0,
        USABILITY: 0,
        DATA: 0,
        INTEGRATION: 0,
        CONSTRAINT: 0,
        UNKNOWN: 0,
      };

      const countsByPriority: Record<RequirementPriority, number> = {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
        UNSPECIFIED: 0,
      };

      for (const req of requirements) {
        if (req.status in countsByStatus) {
          countsByStatus[req.status]++;
        }
        if (req.type in countsByType) {
          countsByType[req.type]++;
        }
        if (req.priority in countsByPriority) {
          countsByPriority[req.priority]++;
        }
      }

      return {
        totalCount: requirements.length,
        countsByStatus,
        countsByType,
        countsByPriority,
      };
    } catch {
      throw new DatabaseError('Failed to compute requirement summary for project.', 'QUERY_FAILED');
    }
  }

  /**
   * Updates an existing requirement with mass-assignment protection.
   */
  async updateRequirement(
    projectId: string,
    requirementId: string,
    data: {
      title?: string;
      originalText?: string;
      type?: RequirementType;
      priority?: RequirementPriority;
      status?: RequirementStatus;
    },
  ): Promise<RequirementWithSource | null> {
    try {
      const updateData: Prisma.RequirementUpdateInput = {};

      if (data.title !== undefined) {
        updateData.title = data.title.trim();
      }
      if (data.originalText !== undefined) {
        updateData.originalText = data.originalText.trim();
      }
      if (data.type !== undefined) {
        updateData.type = data.type;
      }
      if (data.priority !== undefined) {
        updateData.priority = data.priority;
      }
      if (data.status !== undefined) {
        updateData.status = data.status;
      }

      // Check existence within project first
      const existing = await this.getRequirementById(projectId, requirementId);
      if (!existing) {
        return null;
      }

      const updated = await this.getPrisma().requirement.update({
        where: { id: requirementId },
        data: updateData,
        include: {
          requirementSource: {
            select: { id: true, name: true },
          },
        },
      });

      return updated;
    } catch {
      throw new DatabaseError('Failed to update requirement.', 'MUTATION_FAILED');
    }
  }

  /**
   * Updates status for a requirement.
   */
  async updateStatus(
    projectId: string,
    requirementId: string,
    status: RequirementStatus,
  ): Promise<RequirementWithSource | null> {
    return await this.updateRequirement(projectId, requirementId, { status });
  }

  /**
   * Archives a requirement within a project.
   */
  async archiveRequirement(
    projectId: string,
    requirementId: string,
  ): Promise<RequirementWithSource | null> {
    return await this.updateRequirement(projectId, requirementId, {
      status: 'ARCHIVED',
    });
  }

  /**
   * Restores an archived requirement to ACTIVE status.
   */
  async restoreRequirement(
    projectId: string,
    requirementId: string,
  ): Promise<RequirementWithSource | null> {
    return await this.updateRequirement(projectId, requirementId, {
      status: 'ACTIVE',
    });
  }

  /**
   * Permanently deletes a requirement scoped strictly to a project.
   */
  async deleteRequirement(projectId: string, requirementId: string): Promise<boolean> {
    try {
      const existing = await this.getRequirementById(projectId, requirementId);
      if (!existing) {
        return false;
      }

      await this.getPrisma().requirement.delete({
        where: { id: requirementId },
      });
      return true;
    } catch {
      throw new DatabaseError('Failed to delete requirement.', 'MUTATION_FAILED');
    }
  }

  /**
   * Maps a Requirement record to RequirementDto.
   */
  toDto(
    requirement: Requirement & {
      requirementSource?: Pick<RequirementSource, 'id' | 'name'> | null;
    },
  ): RequirementDto {
    return {
      id: requirement.id,
      projectId: requirement.projectId,
      requirementSourceId: requirement.requirementSourceId,
      requirementSourceName: requirement.requirementSource?.name ?? null,
      requirementKey: requirement.requirementKey,
      title: requirement.title,
      originalText: requirement.originalText,
      type: requirement.type as RequirementType,
      priority: requirement.priority as RequirementPriority,
      status: requirement.status as RequirementStatus,
      createdAt: requirement.createdAt.toISOString(),
      updatedAt: requirement.updatedAt.toISOString(),
    };
  }
}
