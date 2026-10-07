/**
 * @file packages/core/src/execution/sessions/auth-profile-service.ts
 * Domain service managing CRUD, validation, and multi-tenant isolation for Authentication Profiles.
 */

import type { PrismaClient, AuthenticationProfile, Prisma } from '@prisma/client';
import {
  type AuthProfileDto,
  type CreateAuthProfileInputDto,
  type UpdateAuthProfileInputDto,
  type ListAuthProfilesInputDto,
  type AuthValidationResultDto,
  createAuthProfileInputSchema,
  updateAuthProfileInputSchema,
  listAuthProfilesInputSchema,
  validateAuthProfileInputSchema,
} from '@ai-quality/contracts';
import {
  AuthProfileNotFoundError,
  AuthProfileProjectMismatchError,
  AuthProfileDuplicateNameError,
  AuthProfileValidationError,
} from './session-errors.js';
import { ProjectNotFoundError } from '../../projects/project-errors.js';
import { StorageStateManager } from './storage-state-manager.js';
import { BrowserSessionManager } from './browser-session-manager.js';
import { UrlValidator } from '../../environments/url-validator.js';
import type { ILogger } from '../../logging/index.js';

export class AuthProfileService {
  private readonly prisma: PrismaClient;
  private readonly storageStateManager: StorageStateManager;
  private readonly sessionManager?: BrowserSessionManager;
  private readonly logger?: ILogger;

  constructor(
    prisma: PrismaClient,
    storageStateManager?: StorageStateManager,
    sessionManager?: BrowserSessionManager,
    logger?: ILogger,
  ) {
    this.prisma = prisma;
    this.storageStateManager = storageStateManager ?? new StorageStateManager(undefined, logger);
    this.sessionManager = sessionManager;
    this.logger = logger;
  }

  /**
   * Creates a new Authentication Profile within project boundaries.
   */
  public async createProfile(input: CreateAuthProfileInputDto): Promise<AuthProfileDto> {
    const validated = createAuthProfileInputSchema.parse(input);

    const project = await this.prisma.project.findUnique({
      where: { id: validated.projectId },
    });
    if (!project) {
      throw new ProjectNotFoundError(validated.projectId);
    }

    if (validated.environmentId) {
      const env = await this.prisma.projectEnvironment.findUnique({
        where: { id: validated.environmentId },
      });
      if (!env || env.projectId !== validated.projectId) {
        throw new AuthProfileValidationError(
          `Environment '${validated.environmentId}' does not belong to project '${validated.projectId}'`,
        );
      }
    }

    if (validated.loginUrl && validated.loginUrl.trim()) {
      UrlValidator.validateAndNormalizeBaseUrl(validated.loginUrl);
    }

    const existingName = await this.prisma.authenticationProfile.findFirst({
      where: {
        projectId: validated.projectId,
        name: validated.name.trim(),
      },
    });
    if (existingName) {
      throw new AuthProfileDuplicateNameError(validated.name.trim(), validated.projectId);
    }

    const created = await this.prisma.authenticationProfile.create({
      data: {
        projectId: validated.projectId,
        environmentId: validated.environmentId,
        name: validated.name.trim(),
        strategy: validated.strategy ?? 'NONE',
        status: 'CONFIGURED',
        description: validated.description?.trim(),
        loginUrl: validated.loginUrl?.trim() || null,
        usernameFieldSelector: validated.usernameFieldSelector?.trim() || null,
        passwordFieldSelector: validated.passwordFieldSelector?.trim() || null,
        submitControlSelector: validated.submitControlSelector?.trim() || null,
        successValidationType: validated.successValidationType ?? 'NONE',
        successValidationValue: validated.successValidationValue?.trim() || null,
        credentialReference: validated.credentialReference?.trim() || null,
        storageStateKey: validated.storageStateKey?.trim() || null,
        isReusable: validated.isReusable ?? false,
        metadataJson: (validated.metadataJson as Prisma.InputJsonValue) ?? {},
      },
      include: {
        environment: true,
      },
    });

    this.logger?.info('auth_profile.created', {
      profileId: created.id,
      projectId: created.projectId,
      name: created.name,
      strategy: created.strategy,
    });

    return this.mapToDto(created);
  }

  /**
   * Retrieves a single Authentication Profile by ID with project boundary enforcement.
   */
  public async getProfile(input: {
    readonly projectId: string;
    readonly profileId: string;
  }): Promise<AuthProfileDto> {
    const profile = await this.prisma.authenticationProfile.findUnique({
      where: { id: input.profileId },
      include: { environment: true },
    });

    if (!profile) {
      throw new AuthProfileNotFoundError(input.profileId, input.projectId);
    }

    if (profile.projectId !== input.projectId) {
      throw new AuthProfileProjectMismatchError(
        input.profileId,
        input.projectId,
        profile.projectId,
      );
    }

    return this.mapToDto(profile);
  }

  /**
   * Lists all Authentication Profiles for a project.
   */
  public async listProfiles(input: ListAuthProfilesInputDto): Promise<readonly AuthProfileDto[]> {
    const validated = listAuthProfilesInputSchema.parse(input);

    const profiles = await this.prisma.authenticationProfile.findMany({
      where: {
        projectId: validated.projectId,
        ...(validated.environmentId ? { environmentId: validated.environmentId } : {}),
        ...(validated.strategy ? { strategy: validated.strategy } : {}),
        ...(validated.status ? { status: validated.status } : {}),
      },
      include: { environment: true },
      orderBy: { createdAt: 'desc' },
    });

    return profiles.map(p => this.mapToDto(p));
  }

  /**
   * Updates an existing Authentication Profile.
   */
  public async updateProfile(input: UpdateAuthProfileInputDto): Promise<AuthProfileDto> {
    const validated = updateAuthProfileInputSchema.parse(input);

    const existing = await this.prisma.authenticationProfile.findUnique({
      where: { id: validated.profileId },
    });

    if (!existing) {
      throw new AuthProfileNotFoundError(validated.profileId, validated.projectId);
    }

    if (existing.projectId !== validated.projectId) {
      throw new AuthProfileProjectMismatchError(
        validated.profileId,
        validated.projectId,
        existing.projectId,
      );
    }

    if (validated.name && validated.name.trim() !== existing.name) {
      const duplicate = await this.prisma.authenticationProfile.findFirst({
        where: {
          projectId: validated.projectId,
          name: validated.name.trim(),
          id: { not: validated.profileId },
        },
      });
      if (duplicate) {
        throw new AuthProfileDuplicateNameError(validated.name.trim(), validated.projectId);
      }
    }

    if (validated.loginUrl && validated.loginUrl.trim()) {
      UrlValidator.validateAndNormalizeBaseUrl(validated.loginUrl);
    }

    const updated = await this.prisma.authenticationProfile.update({
      where: { id: validated.profileId },
      data: {
        ...(validated.name !== undefined ? { name: validated.name.trim() } : {}),
        ...(validated.environmentId !== undefined
          ? { environmentId: validated.environmentId }
          : {}),
        ...(validated.strategy !== undefined ? { strategy: validated.strategy } : {}),
        ...(validated.description !== undefined
          ? { description: validated.description?.trim() }
          : {}),
        ...(validated.loginUrl !== undefined
          ? { loginUrl: validated.loginUrl?.trim() || null }
          : {}),
        ...(validated.usernameFieldSelector !== undefined
          ? { usernameFieldSelector: validated.usernameFieldSelector?.trim() || null }
          : {}),
        ...(validated.passwordFieldSelector !== undefined
          ? { passwordFieldSelector: validated.passwordFieldSelector?.trim() || null }
          : {}),
        ...(validated.submitControlSelector !== undefined
          ? { submitControlSelector: validated.submitControlSelector?.trim() || null }
          : {}),
        ...(validated.successValidationType !== undefined
          ? { successValidationType: validated.successValidationType }
          : {}),
        ...(validated.successValidationValue !== undefined
          ? { successValidationValue: validated.successValidationValue?.trim() || null }
          : {}),
        ...(validated.credentialReference !== undefined
          ? { credentialReference: validated.credentialReference?.trim() || null }
          : {}),
        ...(validated.storageStateKey !== undefined
          ? { storageStateKey: validated.storageStateKey?.trim() || null }
          : {}),
        ...(validated.isReusable !== undefined ? { isReusable: validated.isReusable } : {}),
        ...(validated.metadataJson !== undefined
          ? { metadataJson: validated.metadataJson as Prisma.InputJsonValue }
          : {}),
      },
      include: { environment: true },
    });

    this.logger?.info('auth_profile.updated', {
      profileId: updated.id,
      projectId: updated.projectId,
      name: updated.name,
    });

    return this.mapToDto(updated);
  }

  /**
   * Deletes an Authentication Profile and removes associated storage state artifacts.
   */
  public async deleteProfile(input: {
    readonly projectId: string;
    readonly profileId: string;
  }): Promise<{ readonly deleted: true }> {
    const existing = await this.prisma.authenticationProfile.findUnique({
      where: { id: input.profileId },
    });

    if (!existing) {
      throw new AuthProfileNotFoundError(input.profileId, input.projectId);
    }

    if (existing.projectId !== input.projectId) {
      throw new AuthProfileProjectMismatchError(
        input.profileId,
        input.projectId,
        existing.projectId,
      );
    }

    // 1. Delete storage state file if exists
    if (existing.storageStateKey) {
      await this.storageStateManager.deleteStorageState(existing.storageStateKey);
    }

    // 2. Delete database record
    await this.prisma.authenticationProfile.delete({
      where: { id: input.profileId },
    });

    this.logger?.info('auth_profile.deleted', {
      profileId: input.profileId,
      projectId: input.projectId,
    });

    return { deleted: true };
  }

  /**
   * Performs live authentication validation for a profile without executing a full test run.
   */
  public async validateProfile(input: {
    readonly projectId: string;
    readonly profileId: string;
    readonly testPassword?: string;
  }): Promise<AuthValidationResultDto> {
    const validated = validateAuthProfileInputSchema.parse(input);
    const profile = await this.prisma.authenticationProfile.findUnique({
      where: { id: validated.profileId },
    });

    if (!profile) {
      throw new AuthProfileNotFoundError(validated.profileId, validated.projectId);
    }

    if (profile.projectId !== validated.projectId) {
      throw new AuthProfileProjectMismatchError(
        validated.profileId,
        validated.projectId,
        profile.projectId,
      );
    }

    const tStart = performance.now();
    const sessionManager =
      this.sessionManager ??
      new BrowserSessionManager(this.prisma, undefined, undefined, undefined, this.logger);

    try {
      const session = await sessionManager.createSession({
        testRunId: `validation-${Date.now().toString(36)}`,
        projectId: profile.projectId,
        environmentId: profile.environmentId ?? undefined,
        authProfileId: profile.id,
        headless: true,
      });

      const durationMs = Math.round(performance.now() - tStart);
      const finalUrl = session.page ? session.page.url() : undefined;
      await session.close();

      const now = new Date();
      await this.prisma.authenticationProfile.update({
        where: { id: profile.id },
        data: {
          status: 'VALID',
          lastValidatedAt: now,
          validationError: null,
        },
      });

      return {
        profileId: profile.id,
        status: 'VALID',
        success: true,
        durationMs,
        message: 'Authentication profile successfully validated.',
        validatedAt: now.toISOString(),
        finalUrl,
      };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - tStart);
      const errorMsg = err instanceof Error ? err.message : String(err);
      const now = new Date();

      await this.prisma.authenticationProfile.update({
        where: { id: profile.id },
        data: {
          status: 'INVALID',
          lastValidatedAt: now,
          validationError: errorMsg.slice(0, 500),
        },
      });

      return {
        profileId: profile.id,
        status: 'INVALID',
        success: false,
        durationMs,
        message: `Validation failed: ${errorMsg}`,
        validatedAt: now.toISOString(),
        errorDetails: errorMsg,
      };
    }
  }

  private mapToDto(
    profile: AuthenticationProfile & { environment?: { name: string } | null },
  ): AuthProfileDto {
    return {
      id: profile.id,
      projectId: profile.projectId,
      environmentId: profile.environmentId,
      environmentName: profile.environment?.name ?? null,
      name: profile.name,
      strategy: profile.strategy,
      status: profile.status,
      description: profile.description,
      loginUrl: profile.loginUrl,
      usernameFieldSelector: profile.usernameFieldSelector,
      passwordFieldSelector: profile.passwordFieldSelector,
      submitControlSelector: profile.submitControlSelector,
      successValidationType: profile.successValidationType,
      successValidationValue: profile.successValidationValue,
      credentialReference: profile.credentialReference,
      storageStateKey: profile.storageStateKey,
      hasCredential: Boolean(profile.credentialReference),
      hasStorageState: Boolean(profile.storageStateKey),
      isReusable: profile.isReusable,
      lastValidatedAt: profile.lastValidatedAt?.toISOString() ?? null,
      validationError: profile.validationError,
      metadataJson: (profile.metadataJson as Record<string, unknown>) ?? {},
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}
