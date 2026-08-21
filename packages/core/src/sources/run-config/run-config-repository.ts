/**
 * @file packages/core/src/sources/run-config/run-config-repository.ts
 * Prisma access layer for ProjectRunConfiguration relational persistence.
 */

import { getPrismaClient } from '../../database/client.js';
import { DatabaseError } from '../../database/errors.js';
import type { ProjectRunConfiguration, Prisma } from '@prisma/client';
import type {
  StartupKind,
  RunConfigSafety,
  RunConfigSource,
  RunConfigStatus,
  ArchitectureConfidence,
} from '@ai-quality/contracts';

export class RunConfigRepository {
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
   * Retrieves all run configurations for a project source.
   */
  async getConfigurationsForSource(sourceId: string): Promise<ProjectRunConfiguration[]> {
    const prisma = this.getPrisma();
    return await prisma.projectRunConfiguration.findMany({
      where: { sourceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Retrieves the currently selected active configuration for a source.
   */
  async getSelectedConfiguration(sourceId: string): Promise<ProjectRunConfiguration | null> {
    const prisma = this.getPrisma();
    return await prisma.projectRunConfiguration.findFirst({
      where: { sourceId, isSelected: true },
    });
  }

  /**
   * Saves or updates a run configuration.
   */
  async upsertConfiguration(
    sourceId: string,
    data: {
      id?: string;
      applicationUnitRoot: string;
      runtime: string | null;
      packageManager: string | null;
      startupKind: StartupKind;
      executable: string;
      args: string[];
      workingDirectory: string;
      targetUrl: string | null;
      environmentVariableNames: string[];
      confidence: ArchitectureConfidence;
      safety: RunConfigSafety;
      source: RunConfigSource;
      status: RunConfigStatus;
      isSelected: boolean;
      evidenceJson?: Prisma.InputJsonValue;
    },
  ): Promise<ProjectRunConfiguration> {
    const prisma = this.getPrisma();

    if (data.isSelected) {
      // Unselect any previous selections atomically
      await prisma.projectRunConfiguration.updateMany({
        where: { sourceId, isSelected: true },
        data: { isSelected: false },
      });
    }

    if (data.id) {
      return await prisma.projectRunConfiguration.upsert({
        where: { id: data.id },
        create: {
          id: data.id,
          sourceId,
          ...data,
        },
        update: {
          ...data,
        },
      });
    }

    return await prisma.projectRunConfiguration.create({
      data: {
        sourceId,
        ...data,
      },
    });
  }

  /**
   * Selects an active configuration by ID.
   */
  async setSelectedConfiguration(sourceId: string, configId: string): Promise<void> {
    const prisma = this.getPrisma();
    await prisma.$transaction([
      prisma.projectRunConfiguration.updateMany({
        where: { sourceId, isSelected: true },
        data: { isSelected: false },
      }),
      prisma.projectRunConfiguration.update({
        where: { id: configId },
        data: { isSelected: true, source: 'USER_SELECTED' },
      }),
    ]);
  }

  /**
   * Updates target URL for the selected active configuration or creates one.
   */
  async updateTargetUrl(
    sourceId: string,
    targetUrl: string | null,
  ): Promise<ProjectRunConfiguration | null> {
    const prisma = this.getPrisma();
    const selected = await this.getSelectedConfiguration(sourceId);
    if (!selected) return null;

    return await prisma.projectRunConfiguration.update({
      where: { id: selected.id },
      data: { targetUrl },
    });
  }
}
