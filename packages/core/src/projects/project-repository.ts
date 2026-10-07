/**
 * @file packages/core/src/projects/project-repository.ts
 * Relational persistence operations and transactions for Project and Environment entities.
 */

import { getPrismaClient } from '../database/client.js';
import type { ProjectEnvironment, Prisma } from '@prisma/client';
import type { EnvironmentType, ProjectStatus } from '@ai-quality/contracts';
import { DatabaseError } from '../database/errors.js';
import type { ProjectWithEnvironments } from './project-mappers.js';

export interface ListProjectsFilter {
  readonly status?: 'ACTIVE' | 'ARCHIVED' | 'ALL';
  readonly userId?: string | null;
  readonly search?: string;
  readonly sortBy?: 'recent' | 'created' | 'name';
  readonly sortDirection?: 'asc' | 'desc';
}

export class ProjectRepository {
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
   * Retrieves a list of projects with environments loaded, filtered by status, user, and search.
   */
  async listProjects(
    filter?: ListProjectsFilter | 'ACTIVE' | 'ARCHIVED' | 'ALL',
  ): Promise<ProjectWithEnvironments[]> {
    const prisma = this.getPrisma();
    const opts: ListProjectsFilter =
      typeof filter === 'string' ? { status: filter } : (filter ?? {});
    const where: Prisma.ProjectWhereInput = {
      deletedAt: null,
    };

    if (opts.status === 'ACTIVE' || opts.status === 'ARCHIVED') {
      where.status = opts.status;
    }

    if (opts.userId !== undefined && opts.userId !== null) {
      where.userId = opts.userId;
    }

    if (opts.search && opts.search.trim().length > 0) {
      const q = opts.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const direction: Prisma.SortOrder = opts.sortDirection === 'asc' ? 'asc' : 'desc';
    let orderBy: Prisma.ProjectOrderByWithRelationInput[];

    if (opts.sortBy === 'name') {
      orderBy = [{ isFavorite: 'desc' }, { name: opts.sortDirection === 'desc' ? 'desc' : 'asc' }];
    } else if (opts.sortBy === 'created') {
      orderBy = [{ isFavorite: 'desc' }, { createdAt: direction }];
    } else if (opts.sortBy === 'recent') {
      orderBy = [
        { isFavorite: 'desc' },
        { lastOpenedAt: { sort: direction, nulls: 'last' } },
        { updatedAt: 'desc' },
      ];
    } else {
      orderBy = [{ isFavorite: 'desc' }, { updatedAt: 'desc' }, { name: 'asc' }];
    }

    return prisma.project.findMany({
      where,
      include: {
        environments: true,
        websiteTargets: {
          where: { deletedAt: null },
        },
        repositoryConnections: {
          where: { deletedAt: null },
        },
        source: {
          include: { gitMetadata: true },
        },
      },
      orderBy,
    });
  }

  /**
   * Retrieves a single project by ID with its environments.
   */
  async getProjectById(id: string): Promise<ProjectWithEnvironments | null> {
    const prisma = this.getPrisma();
    return prisma.project.findUnique({
      where: { id },
      include: {
        environments: {
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        },
        websiteTargets: {
          where: { deletedAt: null },
        },
        repositoryConnections: {
          where: { deletedAt: null },
        },
        source: {
          include: { gitMetadata: true },
        },
      },
    });
  }

  /**
   * Creates a project and its corresponding 1:1 ProjectSettings record within an atomic transaction.
   */
  async createProject(data: {
    name: string;
    description?: string | null;
    userId?: string | null;
    isFavorite?: boolean;
  }): Promise<ProjectWithEnvironments> {
    const prisma = this.getPrisma();

    return prisma.$transaction(async tx => {
      const project = await tx.project.create({
        data: {
          name: data.name,
          description: data.description,
          userId: data.userId ?? null,
          isFavorite: data.isFavorite ?? false,
          settings: {
            create: {},
          },
        },
        include: {
          environments: true,
        },
      });

      return project;
    });
  }

  /**
   * Updates project metadata (name, description, isFavorite).
   */
  async updateProject(
    id: string,
    data: { name?: string; description?: string | null; isFavorite?: boolean },
  ): Promise<ProjectWithEnvironments> {
    const prisma = this.getPrisma();

    return prisma.project.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.isFavorite !== undefined ? { isFavorite: data.isFavorite } : {}),
      },
      include: {
        environments: true,
      },
    });
  }

  /**
   * Updates project lifecycle status (ACTIVE, ARCHIVED) and maintains archivedAt timestamp.
   */
  async updateStatus(id: string, status: ProjectStatus): Promise<ProjectWithEnvironments> {
    const prisma = this.getPrisma();

    return prisma.project.update({
      where: { id },
      data: {
        status,
        archivedAt: status === 'ARCHIVED' ? new Date() : null,
      },
      include: {
        environments: true,
      },
    });
  }

  /**
   * Updates lastOpenedAt recency timestamp.
   */
  async markOpened(id: string): Promise<ProjectWithEnvironments> {
    const prisma = this.getPrisma();

    return prisma.project.update({
      where: { id },
      data: {
        lastOpenedAt: new Date(),
      },
      include: {
        environments: true,
      },
    });
  }

  /**
   * Safely soft-deletes a project by stamping deletedAt and archiving.
   */
  async softDelete(id: string): Promise<ProjectWithEnvironments> {
    const prisma = this.getPrisma();

    return prisma.project.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'ARCHIVED',
        archivedAt: new Date(),
      },
      include: {
        environments: true,
      },
    });
  }

  /**
   * Permanently deletes a project, cascading to its settings and environments.
   */
  async deleteProject(id: string): Promise<void> {
    const prisma = this.getPrisma();
    await prisma.project.delete({
      where: { id },
    });
  }

  /**
   * Counts existing environments for a project.
   */
  async countEnvironments(projectId: string): Promise<number> {
    const prisma = this.getPrisma();
    return prisma.projectEnvironment.count({
      where: { projectId },
    });
  }

  /**
   * Creates a new environment for a project.
   */
  async createEnvironment(data: {
    projectId: string;
    name: string;
    type: EnvironmentType;
    baseUrl?: string | null;
    isDefault?: boolean;
  }): Promise<ProjectEnvironment> {
    const prisma = this.getPrisma();

    return prisma.projectEnvironment.create({
      data: {
        projectId: data.projectId,
        name: data.name,
        type: data.type,
        baseUrl: data.baseUrl,
        isDefault: data.isDefault ?? false,
      },
    });
  }

  /**
   * Finds an environment by its ID.
   */
  async getEnvironmentById(id: string): Promise<ProjectEnvironment | null> {
    const prisma = this.getPrisma();
    return prisma.projectEnvironment.findUnique({
      where: { id },
    });
  }

  /**
   * Updates an existing environment.
   */
  async updateEnvironment(data: {
    environmentId: string;
    name: string;
    type: EnvironmentType;
    baseUrl?: string | null;
  }): Promise<ProjectEnvironment> {
    const prisma = this.getPrisma();

    return prisma.projectEnvironment.update({
      where: { id: data.environmentId },
      data: {
        name: data.name,
        type: data.type,
        baseUrl: data.baseUrl,
      },
    });
  }

  /**
   * Deletes an environment.
   */
  async deleteEnvironment(environmentId: string): Promise<void> {
    const prisma = this.getPrisma();
    await prisma.projectEnvironment.delete({
      where: { id: environmentId },
    });
  }

  /**
   * Atomically switches the default environment for a project.
   */
  async setDefaultEnvironment(
    projectId: string,
    environmentId: string,
  ): Promise<ProjectEnvironment> {
    const prisma = this.getPrisma();

    return prisma.$transaction(async tx => {
      // 1. Reset any existing default environment for this project
      await tx.projectEnvironment.updateMany({
        where: { projectId, isDefault: true },
        data: { isDefault: false },
      });

      // 2. Set the designated environment as default
      const updated = await tx.projectEnvironment.update({
        where: { id: environmentId },
        data: { isDefault: true },
      });

      return updated;
    });
  }
}
