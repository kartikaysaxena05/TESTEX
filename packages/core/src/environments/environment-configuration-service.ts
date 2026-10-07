/**
 * @file packages/core/src/environments/environment-configuration-service.ts
 * Core domain service for managing Test Environments and resolving Execution Configuration Snapshots.
 */

import crypto from 'node:crypto';
import type { Prisma, PrismaClient, ProjectEnvironment } from '@prisma/client';
import type {
  ProjectEnvironmentDto,
  CreateEnvironmentInput,
  UpdateEnvironmentInput,
  GetEnvironmentInputDto,
  ListEnvironmentsInputDto,
  DeleteEnvironmentInput,
  SetDefaultEnvironmentInput,
  CheckEnvironmentReachabilityInputDto,
  EnvironmentReachabilityResultDto,
  ResolveEnvironmentSnapshotInputDto,
  ExecutionEnvironmentSnapshotDto,
  SecretReferenceItemDto,
  BrowserEngine,
  BrowserColorScheme,
} from '@ai-quality/contracts';
import {
  createEnvironmentSchema,
  updateEnvironmentSchema,
  getEnvironmentInputSchema,
  listEnvironmentsInputSchema,
  deleteEnvironmentSchema,
  setDefaultEnvironmentSchema,
  checkEnvironmentReachabilitySchema,
  resolveEnvironmentSnapshotSchema,
} from '@ai-quality/contracts';
import { ProjectNotFoundError } from '../projects/project-errors.js';
import {
  EnvironmentNotFoundError,
  EnvironmentProjectMismatchError,
  EnvironmentDisabledError,
  InvalidBaseUrlError,
} from './environment-errors.js';
import { UrlValidator } from './url-validator.js';
import { EnvironmentReachabilityChecker } from './reachability-checker.js';
import { TargetApplicationService } from './target-application-service.js';

export class EnvironmentConfigurationService {
  private readonly reachabilityChecker = new EnvironmentReachabilityChecker();
  private readonly targetAppService: TargetApplicationService;

  constructor(private readonly prisma: PrismaClient) {
    this.targetAppService = new TargetApplicationService(prisma);
  }

  /**
   * Creates a new environment within a project.
   * Atomically handles default environment state using Prisma transactions.
   */
  public async createEnvironment(input: CreateEnvironmentInput): Promise<ProjectEnvironmentDto> {
    const validated = createEnvironmentSchema.parse(input);

    const project = await this.prisma.project.findUnique({
      where: { id: validated.projectId },
      include: { environments: true },
    });

    if (!project) {
      throw new ProjectNotFoundError(validated.projectId);
    }

    const normalizedBaseUrl = validated.baseUrl
      ? UrlValidator.validateAndNormalizeBaseUrl(validated.baseUrl)
      : null;

    // If this is the first environment in the project or explicitly set as default, mark as default
    const shouldBeDefault = validated.isDefault || project.environments.length === 0;

    return this.prisma.$transaction(async tx => {
      if (shouldBeDefault) {
        await tx.projectEnvironment.updateMany({
          where: { projectId: validated.projectId },
          data: { isDefault: false },
        });
      }

      const created = await tx.projectEnvironment.create({
        data: {
          projectId: validated.projectId,
          targetApplicationId: validated.targetApplicationId ?? null,
          name: validated.name.trim(),
          type: validated.type ?? 'DEVELOPMENT',
          baseUrl: normalizedBaseUrl,
          isDefault: shouldBeDefault,
          isEnabled: validated.isEnabled ?? true,
          isProduction: validated.isProduction ?? false,
          productionSafetyPolicy: validated.productionSafetyPolicy ?? 'PROHIBITED',
          browserEngine: validated.browserEngine ?? 'chromium',
          headless: validated.headless ?? true,
          viewportWidth: validated.viewportWidth ?? 1280,
          viewportHeight: validated.viewportHeight ?? 720,
          locale: validated.locale ? validated.locale.trim() : null,
          timezoneId: validated.timezoneId ? validated.timezoneId.trim() : null,
          colorScheme: validated.colorScheme ?? 'light',
          ignoreHttpsErrors: validated.ignoreHttpsErrors ?? false,
          permissions: validated.permissions ?? [],
          extraHeaders: validated.extraHeaders ?? undefined,
          variables: validated.variables ?? undefined,
          secretReferences: validated.secretReferences ?? undefined,
          notes: validated.notes ? validated.notes.trim() : null,
        },
      });

      if (shouldBeDefault) {
        await tx.targetApplication.upsert({
          where: { projectId: validated.projectId },
          update: { defaultEnvironmentId: created.id },
          create: {
            projectId: validated.projectId,
            name: project.name,
            defaultEnvironmentId: created.id,
          },
        });
      }

      return this.mapToDto(created);
    });
  }

  /**
   * Retrieves an environment by ID with project ownership validation.
   */
  public async getEnvironment(
    input: GetEnvironmentInputDto,
  ): Promise<ProjectEnvironmentDto | null> {
    const validated = getEnvironmentInputSchema.parse(input);

    const env = await this.prisma.projectEnvironment.findUnique({
      where: { id: validated.environmentId },
    });

    if (!env) {
      return null;
    }

    if (env.projectId !== validated.projectId) {
      throw new EnvironmentProjectMismatchError(validated.environmentId, validated.projectId);
    }

    return this.mapToDto(env);
  }

  /**
   * Lists environments belonging to a project.
   */
  public async listEnvironments(
    input: ListEnvironmentsInputDto,
  ): Promise<readonly ProjectEnvironmentDto[]> {
    const validated = listEnvironmentsInputSchema.parse(input);

    const project = await this.prisma.project.findUnique({
      where: { id: validated.projectId },
    });

    if (!project) {
      throw new ProjectNotFoundError(validated.projectId);
    }

    const whereClause: { projectId: string; isEnabled?: boolean } = {
      projectId: validated.projectId,
    };

    if (!validated.includeDisabled) {
      whereClause.isEnabled = true;
    }

    const envs = await this.prisma.projectEnvironment.findMany({
      where: whereClause,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    return envs.map(e => this.mapToDto(e));
  }

  /**
   * Updates an existing environment with project ownership validation and mass-assignment protection.
   */
  public async updateEnvironment(input: UpdateEnvironmentInput): Promise<ProjectEnvironmentDto> {
    const validated = updateEnvironmentSchema.parse(input);

    const existing = await this.prisma.projectEnvironment.findUnique({
      where: { id: validated.environmentId },
    });

    if (!existing) {
      throw new EnvironmentNotFoundError(validated.environmentId);
    }

    if (existing.projectId !== validated.projectId) {
      throw new EnvironmentProjectMismatchError(validated.environmentId, validated.projectId);
    }

    const normalizedBaseUrl =
      validated.baseUrl !== undefined
        ? validated.baseUrl
          ? UrlValidator.validateAndNormalizeBaseUrl(validated.baseUrl)
          : null
        : undefined;

    const dataToUpdate: Prisma.ProjectEnvironmentUncheckedUpdateInput = {};

    if (validated.name !== undefined) dataToUpdate.name = validated.name.trim();
    if (validated.type !== undefined) dataToUpdate.type = validated.type;
    if (normalizedBaseUrl !== undefined) dataToUpdate.baseUrl = normalizedBaseUrl;
    if (validated.targetApplicationId !== undefined) {
      dataToUpdate.targetApplicationId = validated.targetApplicationId;
    }
    if (validated.isEnabled !== undefined) dataToUpdate.isEnabled = validated.isEnabled;
    if (validated.isProduction !== undefined) dataToUpdate.isProduction = validated.isProduction;
    if (validated.productionSafetyPolicy !== undefined) {
      dataToUpdate.productionSafetyPolicy = validated.productionSafetyPolicy;
    }
    if (validated.browserEngine !== undefined) {
      dataToUpdate.browserEngine = validated.browserEngine;
    }
    if (validated.headless !== undefined) dataToUpdate.headless = validated.headless;
    if (validated.viewportWidth !== undefined) {
      dataToUpdate.viewportWidth = validated.viewportWidth;
    }
    if (validated.viewportHeight !== undefined) {
      dataToUpdate.viewportHeight = validated.viewportHeight;
    }
    if (validated.locale !== undefined) {
      dataToUpdate.locale = validated.locale ? validated.locale.trim() : null;
    }
    if (validated.timezoneId !== undefined) {
      dataToUpdate.timezoneId = validated.timezoneId ? validated.timezoneId.trim() : null;
    }
    if (validated.colorScheme !== undefined) dataToUpdate.colorScheme = validated.colorScheme;
    if (validated.ignoreHttpsErrors !== undefined) {
      dataToUpdate.ignoreHttpsErrors = validated.ignoreHttpsErrors;
    }
    if (validated.permissions !== undefined) dataToUpdate.permissions = validated.permissions;
    if (validated.extraHeaders !== undefined) {
      dataToUpdate.extraHeaders = validated.extraHeaders ?? undefined;
    }
    if (validated.variables !== undefined) {
      dataToUpdate.variables = validated.variables ?? undefined;
    }
    if (validated.secretReferences !== undefined) {
      dataToUpdate.secretReferences = (validated.secretReferences as unknown as any) ?? undefined;
    }
    if (validated.notes !== undefined) {
      dataToUpdate.notes = validated.notes ? validated.notes.trim() : null;
    }

    if (validated.isDefault === true) {
      return this.prisma.$transaction(async tx => {
        await tx.projectEnvironment.updateMany({
          where: { projectId: validated.projectId },
          data: { isDefault: false },
        });

        const updated = await tx.projectEnvironment.update({
          where: { id: validated.environmentId },
          data: {
            ...dataToUpdate,
            isDefault: true,
          },
        });

        await tx.targetApplication.upsert({
          where: { projectId: validated.projectId },
          update: { defaultEnvironmentId: updated.id },
          create: {
            projectId: validated.projectId,
            name: 'Default Application',
            defaultEnvironmentId: updated.id,
          },
        });

        return this.mapToDto(updated);
      });
    }

    if (validated.isDefault === false && existing.isDefault) {
      dataToUpdate.isDefault = false;
    }

    const updated = await this.prisma.projectEnvironment.update({
      where: { id: validated.environmentId },
      data: dataToUpdate,
    });

    return this.mapToDto(updated);
  }

  /**
   * Deletes an environment with project ownership validation.
   */
  public async deleteEnvironment(
    input: DeleteEnvironmentInput,
  ): Promise<{ readonly deleted: true }> {
    const validated = deleteEnvironmentSchema.parse(input);

    const existing = await this.prisma.projectEnvironment.findUnique({
      where: { id: validated.environmentId },
    });

    if (!existing) {
      throw new EnvironmentNotFoundError(validated.environmentId);
    }

    if (existing.projectId !== validated.projectId) {
      throw new EnvironmentProjectMismatchError(validated.environmentId, validated.projectId);
    }

    await this.prisma.projectEnvironment.delete({
      where: { id: validated.environmentId },
    });

    return { deleted: true };
  }

  /**
   * Atomically sets an environment as the default execution target for a project.
   */
  public async setDefaultEnvironment(
    input: SetDefaultEnvironmentInput,
  ): Promise<ProjectEnvironmentDto> {
    const validated = setDefaultEnvironmentSchema.parse(input);

    const existing = await this.prisma.projectEnvironment.findUnique({
      where: { id: validated.environmentId },
    });

    if (!existing) {
      throw new EnvironmentNotFoundError(validated.environmentId);
    }

    if (existing.projectId !== validated.projectId) {
      throw new EnvironmentProjectMismatchError(validated.environmentId, validated.projectId);
    }

    return this.prisma.$transaction(async tx => {
      await tx.projectEnvironment.updateMany({
        where: { projectId: validated.projectId },
        data: { isDefault: false },
      });

      const updated = await tx.projectEnvironment.update({
        where: { id: validated.environmentId },
        data: { isDefault: true },
      });

      await tx.targetApplication.upsert({
        where: { projectId: validated.projectId },
        update: { defaultEnvironmentId: updated.id },
        create: {
          projectId: validated.projectId,
          name: 'Default Application',
          defaultEnvironmentId: updated.id,
        },
      });

      return this.mapToDto(updated);
    });
  }

  /**
   * Performs preflight reachability validation on an environment URL.
   */
  public async checkReachability(
    input: CheckEnvironmentReachabilityInputDto,
  ): Promise<EnvironmentReachabilityResultDto> {
    const validated = checkEnvironmentReachabilitySchema.parse(input);

    let targetUrl = validated.targetUrl;
    let ignoreHttpsErrors = validated.ignoreHttpsErrors ?? false;

    if (validated.environmentId) {
      const env = await this.prisma.projectEnvironment.findUnique({
        where: { id: validated.environmentId },
      });

      if (!env) {
        throw new EnvironmentNotFoundError(validated.environmentId);
      }

      if (env.projectId !== validated.projectId) {
        throw new EnvironmentProjectMismatchError(validated.environmentId, validated.projectId);
      }

      if (!targetUrl) {
        targetUrl = env.baseUrl ?? undefined;
      }
      if (validated.ignoreHttpsErrors === undefined) {
        ignoreHttpsErrors = env.ignoreHttpsErrors;
      }
    }

    if (!targetUrl) {
      throw new InvalidBaseUrlError('No target URL provided for reachability check.');
    }

    return this.reachabilityChecker.check(targetUrl, {
      timeoutMs: validated.timeoutMs,
      ignoreHttpsErrors,
    });
  }

  /**
   * Resolves an immutable execution snapshot of the target environment for a test run.
   */
  public async resolveSnapshot(
    input: ResolveEnvironmentSnapshotInputDto,
  ): Promise<ExecutionEnvironmentSnapshotDto> {
    const validated = resolveEnvironmentSnapshotSchema.parse(input);

    let env: ProjectEnvironment | null = null;

    if (validated.environmentId) {
      env = await this.prisma.projectEnvironment.findUnique({
        where: { id: validated.environmentId },
      });

      if (!env) {
        throw new EnvironmentNotFoundError(validated.environmentId);
      }

      if (env.projectId !== validated.projectId) {
        throw new EnvironmentProjectMismatchError(validated.environmentId, validated.projectId);
      }
    } else {
      // Find default environment for project
      env = await this.prisma.projectEnvironment.findFirst({
        where: { projectId: validated.projectId, isDefault: true },
      });

      if (!env) {
        // Fallback to first available enabled environment
        env = await this.prisma.projectEnvironment.findFirst({
          where: { projectId: validated.projectId, isEnabled: true },
          orderBy: { createdAt: 'asc' },
        });
      }
    }

    if (!env) {
      throw new EnvironmentNotFoundError(
        `No execution environment configured for project "${validated.projectId}".`,
      );
    }

    if (!env.isEnabled) {
      throw new EnvironmentDisabledError(env.name);
    }

    if (!env.baseUrl) {
      throw new InvalidBaseUrlError(
        `Environment "${env.name}" does not have a configured target base URL.`,
      );
    }

    const normalizedBaseUrl = UrlValidator.validateAndNormalizeBaseUrl(env.baseUrl);
    const targetApp = await this.targetAppService.getTargetApplication(validated.projectId);

    const variables = (env.variables as Record<string, string>) || {};
    const extraHeaders = (env.extraHeaders as Record<string, string>) || {};
    const secretReferences = (env.secretReferences as unknown as SecretReferenceItemDto[]) || [];

    const snapshotTimestamp = new Date().toISOString();

    // Deterministic configuration hash (SHA-256)
    const hashPayload = JSON.stringify({
      projectId: env.projectId,
      environmentId: env.id,
      baseUrl: normalizedBaseUrl,
      browserEngine: env.browserEngine,
      headless: env.headless,
      viewportWidth: env.viewportWidth,
      viewportHeight: env.viewportHeight,
      locale: env.locale,
      timezoneId: env.timezoneId,
      colorScheme: env.colorScheme,
      ignoreHttpsErrors: env.ignoreHttpsErrors,
      permissions: env.permissions,
      extraHeaders,
      variables,
      secretReferences,
      isProduction: env.isProduction,
      productionSafetyPolicy: env.productionSafetyPolicy,
    });

    const configurationHash = crypto.createHash('sha256').update(hashPayload).digest('hex');

    return {
      environmentId: env.id,
      projectId: env.projectId,
      targetApplicationName: targetApp.name,
      environmentName: env.name,
      environmentType: env.type,
      baseUrl: normalizedBaseUrl,
      isProduction: env.isProduction,
      productionSafetyPolicy: env.productionSafetyPolicy,
      browserEngine: env.browserEngine as BrowserEngine,
      headless: env.headless,
      viewportWidth: env.viewportWidth,
      viewportHeight: env.viewportHeight,
      locale: env.locale,
      timezoneId: env.timezoneId,
      colorScheme: env.colorScheme as BrowserColorScheme,
      ignoreHttpsErrors: env.ignoreHttpsErrors,
      permissions: env.permissions,
      extraHeaders,
      variables,
      secretReferences,
      snapshotTimestamp,
      configurationHash,
    };
  }

  private mapToDto(env: ProjectEnvironment): ProjectEnvironmentDto {
    return {
      id: env.id,
      projectId: env.projectId,
      targetApplicationId: env.targetApplicationId,
      name: env.name,
      type: env.type,
      baseUrl: env.baseUrl,
      isDefault: env.isDefault,
      isEnabled: env.isEnabled,
      isProduction: env.isProduction,
      productionSafetyPolicy: env.productionSafetyPolicy,
      browserEngine: env.browserEngine as BrowserEngine,
      headless: env.headless,
      viewportWidth: env.viewportWidth,
      viewportHeight: env.viewportHeight,
      locale: env.locale,
      timezoneId: env.timezoneId,
      colorScheme: env.colorScheme as BrowserColorScheme,
      ignoreHttpsErrors: env.ignoreHttpsErrors,
      permissions: env.permissions,
      extraHeaders: (env.extraHeaders as Record<string, string>) || null,
      variables: (env.variables as Record<string, string>) || null,
      secretReferences: (env.secretReferences as unknown as SecretReferenceItemDto[]) || null,
      notes: env.notes,
      createdAt: env.createdAt.toISOString(),
      updatedAt: env.updatedAt.toISOString(),
    };
  }
}
