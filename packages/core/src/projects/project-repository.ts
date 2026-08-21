/**
 * @file packages/core/src/projects/project-repository.ts
 * Relational persistence operations and transactions for Project and Environment entities.
 */

import { getPrismaClient } from '../database/client.js';
import type { ProjectEnvironment, Prisma } from '@prisma/client';
import type { EnvironmentType, ProjectStatus } from '@ai-quality/contracts';
import { DatabaseError } from '../database/errors.js';
import type { ProjectWithEnvironments } from './project-mappers.js';

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
   * Retrieves a list of projects with environments loaded, filtered by status.
   */
  async listProjects(status?: 'ACTIVE' | 'ARCHIVED' | 'ALL'): Promise<ProjectWithEnvironments[]> {
    const prisma = this.getPrisma();
    const where: Prisma.ProjectWhereInput = {};

    if (status === 'ACTIVE' || status === 'ARCHIVED') {
      where.status = status;
    }

    return prisma.project.findMany({
      where,
      include: {
        environments: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
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
      },
    });
  }

  /**
   * Creates a project and its corresponding 1:1 ProjectSettings record within an atomic transaction.
   */
  async createProject(data: {
    name: string;
    description?: string | null;
  }): Promise<ProjectWithEnvironments> {
    const prisma = this.getPrisma();

    return prisma.$transaction(async tx => {
      const project = await tx.project.create({
        data: {
          name: data.name,
          description: data.description,
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
   * Updates project metadata (name, description).
   */
  async updateProject(
    id: string,
    data: { name: string; description?: string | null },
  ): Promise<ProjectWithEnvironments> {
    const prisma = this.getPrisma();

    return prisma.project.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
      },
      include: {
        environments: true,
      },
    });
  }

  /**
   * Updates project lifecycle status (ACTIVE, ARCHIVED).
   */
  async updateStatus(id: string, status: ProjectStatus): Promise<ProjectWithEnvironments> {
    const prisma = this.getPrisma();

    return prisma.project.update({
      where: { id },
      data: { status },
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
