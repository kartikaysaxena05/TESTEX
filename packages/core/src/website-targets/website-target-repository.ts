/**
 * @file packages/core/src/website-targets/website-target-repository.ts
 * Data access repository for Website Targets with soft-deletion filtering and active target locking.
 */

import type { PrismaClient, WebsiteTarget, Prisma } from '@prisma/client';

export class WebsiteTargetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  public async create(data: Prisma.WebsiteTargetUncheckedCreateInput): Promise<WebsiteTarget> {
    return this.prisma.websiteTarget.create({ data });
  }

  public async findById(id: string, includeDeleted = false): Promise<WebsiteTarget | null> {
    return this.prisma.websiteTarget.findFirst({
      where: {
        id,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
    });
  }

  public async findByProject(projectId: string, includeDeleted = false): Promise<WebsiteTarget[]> {
    return this.prisma.websiteTarget.findMany({
      where: {
        projectId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      orderBy: [
        { isActive: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  public async findActiveByProject(projectId: string): Promise<WebsiteTarget | null> {
    return this.prisma.websiteTarget.findFirst({
      where: {
        projectId,
        isActive: true,
        deletedAt: null,
      },
    });
  }

  public async countActiveByProject(projectId: string): Promise<number> {
    return this.prisma.websiteTarget.count({
      where: {
        projectId,
        deletedAt: null,
      },
    });
  }

  public async update(
    id: string,
    data: Prisma.WebsiteTargetUncheckedUpdateInput,
  ): Promise<WebsiteTarget> {
    return this.prisma.websiteTarget.update({
      where: { id },
      data,
    });
  }

  public async setActive(projectId: string, targetId: string): Promise<WebsiteTarget> {
    return this.prisma.$transaction(async tx => {
      // Deactivate all targets in the project
      await tx.websiteTarget.updateMany({
        where: { projectId },
        data: { isActive: false },
      });

      // Activate the specified target
      return tx.websiteTarget.update({
        where: { id: targetId },
        data: { isActive: true },
      });
    });
  }

  public async softDelete(id: string): Promise<WebsiteTarget> {
    return this.prisma.websiteTarget.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });
  }
}
