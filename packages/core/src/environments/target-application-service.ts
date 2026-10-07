/**
 * @file packages/core/src/environments/target-application-service.ts
 * Service for managing Target Application entities associated with QA projects.
 */

import type { PrismaClient } from '@prisma/client';
import type { TargetApplicationDto, UpdateTargetApplicationInputDto } from '@ai-quality/contracts';
import { updateTargetApplicationSchema } from '@ai-quality/contracts';
import { ProjectNotFoundError } from '../projects/project-errors.js';

export class TargetApplicationService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Retrieves or lazily initializes the TargetApplication for a given project.
   */
  public async getTargetApplication(projectId: string): Promise<TargetApplicationDto> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { targetApplication: true },
    });

    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    if (project.targetApplication) {
      return this.mapToDto(project.targetApplication);
    }

    // Lazily initialize a TargetApplication matching the project
    const created = await this.prisma.targetApplication.create({
      data: {
        projectId,
        name: project.name,
        description: project.description,
      },
    });

    return this.mapToDto(created);
  }

  /**
   * Updates target application metadata for a project.
   */
  public async updateTargetApplication(
    input: UpdateTargetApplicationInputDto,
  ): Promise<TargetApplicationDto> {
    const validated = updateTargetApplicationSchema.parse(input);

    const project = await this.prisma.project.findUnique({
      where: { id: validated.projectId },
    });

    if (!project) {
      throw new ProjectNotFoundError(validated.projectId);
    }

    const dataToUpdate: {
      name?: string;
      description?: string | null;
      defaultEnvironmentId?: string | null;
    } = {};

    if (validated.name !== undefined) {
      dataToUpdate.name = validated.name.trim();
    }
    if (validated.description !== undefined) {
      dataToUpdate.description = validated.description ? validated.description.trim() : null;
    }
    if (validated.defaultEnvironmentId !== undefined) {
      dataToUpdate.defaultEnvironmentId = validated.defaultEnvironmentId;
    }

    const targetApp = await this.prisma.targetApplication.upsert({
      where: { projectId: validated.projectId },
      update: dataToUpdate,
      create: {
        projectId: validated.projectId,
        name: validated.name?.trim() || project.name,
        description:
          validated.description !== undefined
            ? (validated.description?.trim() ?? null)
            : project.description,
        defaultEnvironmentId: validated.defaultEnvironmentId ?? null,
      },
    });

    return this.mapToDto(targetApp);
  }

  private mapToDto(model: {
    id: string;
    projectId: string;
    name: string;
    description: string | null;
    defaultEnvironmentId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): TargetApplicationDto {
    return {
      id: model.id,
      projectId: model.projectId,
      name: model.name,
      description: model.description,
      defaultEnvironmentId: model.defaultEnvironmentId,
      createdAt: model.createdAt.toISOString(),
      updatedAt: model.updatedAt.toISOString(),
    };
  }
}
