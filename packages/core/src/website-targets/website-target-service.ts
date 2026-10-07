/**
 * @file packages/core/src/website-targets/website-target-service.ts
 * Authoritative business service for Website Targets, Live Environment Targeting,
 * V5 Environment Adaptation, and Production Safe Mode.
 */

import type { PrismaClient, Project, WebsiteTarget, AuthAuditAction } from '@prisma/client';
import type {
  CreateWebsiteTargetInput,
  UpdateWebsiteTargetInput,
  DeleteWebsiteTargetInput,
  SetActiveWebsiteTargetInput,
  TestWebsiteTargetConnectionInput,
  ConfirmWebsiteTargetAuthInput,
  GetWebsiteTargetInput,
  ListWebsiteTargetsInput,
  ResolveWebsiteTargetSnapshotInput,
  WebsiteTargetDetails,
  WebsiteTargetSummary,
  WebsiteTargetSnapshot,
  ConnectivityCheckResultDto,
  EnvironmentType,
  TargetAuthorizationState,
  TargetConnectionStatus,
} from '@ai-quality/contracts';
import { WebsiteTargetRepository } from './website-target-repository.js';
import { UrlSafetyEvaluator } from './url-safety.js';
import { WebsiteTargetConnectivityChecker } from './connectivity-checker.js';
import {
  toWebsiteTargetDetails,
  toWebsiteTargetSummary,
  toWebsiteTargetSnapshot,
} from './website-target-mappers.js';
import {
  WebsiteTargetNotFoundError,
  TargetAccessDeniedError,
  TargetValidationError,
  TargetAlreadyDeletedError,
} from './website-target-errors.js';

export class WebsiteTargetService {
  private readonly repository: WebsiteTargetRepository;
  private readonly connectivityChecker: WebsiteTargetConnectivityChecker;

  constructor(
    private readonly prisma: PrismaClient,
    connectivityChecker?: WebsiteTargetConnectivityChecker,
    repository?: WebsiteTargetRepository,
  ) {
    this.repository = repository ?? new WebsiteTargetRepository(prisma);
    this.connectivityChecker = connectivityChecker ?? new WebsiteTargetConnectivityChecker();
  }

  /**
   * Asserts project exists and verifies authenticated user ownership.
   */
  private async assertProjectOwnership(projectId: string, userId?: string | null): Promise<Project> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project || project.deletedAt !== null) {
      throw new WebsiteTargetNotFoundError(projectId);
    }

    if (userId && project.userId && project.userId !== userId) {
      throw new TargetAccessDeniedError(
        'Access denied: You do not have permission to manage website targets for this project.',
      );
    }

    return project;
  }

  /**
   * Records an audit event if a user is associated.
   */
  private async recordAudit(
    action: AuthAuditAction,
    userId: string | null | undefined,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!userId) return;
    try {
      await this.prisma.authAuditEvent.create({
        data: {
          action,
          userId,
          metadata: metadata as any,
        },
      });
    } catch {
      // Audit non-fatal to core business operation
    }
  }

  /**
   * Creates a new website target and adapts it to V5 execution environment.
   */
  public async createWebsiteTarget(
    input: CreateWebsiteTargetInput,
    userId?: string | null,
  ): Promise<WebsiteTargetDetails> {
    await this.assertProjectOwnership(input.projectId, userId);

    const environmentType: EnvironmentType = input.environmentType ?? 'LOCAL';

    // 1. Validate & normalize URL
    const normalized = UrlSafetyEvaluator.normalizeAndValidate(input.url, environmentType);

    // 2. Determine safe mode defaults
    const isProduction = environmentType === 'PRODUCTION';
    const safeModeEnabled = input.safeModeEnabled !== undefined ? input.safeModeEnabled : true;

    // 3. Determine target authorization state
    let authorizationState: TargetAuthorizationState = 'UNVERIFIED';
    let authorizationConfirmedAt: Date | null = null;
    let authorizationConfirmedBy: string | null = null;

    if (environmentType === 'LOCAL') {
      authorizationState = 'USER_CONFIRMED';
      authorizationConfirmedAt = new Date();
      authorizationConfirmedBy = userId ?? null;
    } else if (isProduction) {
      if (input.confirmedOwnership && input.confirmedProductionRisk) {
        authorizationState = 'USER_CONFIRMED';
        authorizationConfirmedAt = new Date();
        authorizationConfirmedBy = userId ?? null;
      } else {
        authorizationState = 'UNVERIFIED';
      }
    } else {
      if (input.confirmedOwnership) {
        authorizationState = 'USER_CONFIRMED';
        authorizationConfirmedAt = new Date();
        authorizationConfirmedBy = userId ?? null;
      } else {
        authorizationState = 'UNVERIFIED';
      }
    }

    // 4. Determine active status
    const existingCount = await this.repository.countActiveByProject(input.projectId);
    const isActive = existingCount === 0;

    // 5. Create or sync matching V5 ProjectEnvironment adapter
    let v5EnvironmentId: string | null = null;
    try {
      const v5Env = await this.prisma.projectEnvironment.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          type: environmentType,
          baseUrl: normalized.normalizedUrl,
          isDefault: isActive,
          isEnabled: true,
          isProduction,
          productionSafetyPolicy: isProduction
            ? safeModeEnabled
              ? 'SAFE_MODE'
              : 'MANUAL_APPROVAL_REQUIRED'
            : 'SAFE_MODE',
          notes: input.notes ?? null,
        },
      });
      v5EnvironmentId = v5Env.id;
    } catch {
      // If environment name already exists in project, link to it or handle safely
      const existingEnv = await this.prisma.projectEnvironment.findFirst({
        where: { projectId: input.projectId, name: input.name },
      });
      if (existingEnv) {
        v5EnvironmentId = existingEnv.id;
      }
    }

    // 6. Create WebsiteTarget record
    const target = await this.repository.create({
      projectId: input.projectId,
      name: input.name.trim(),
      baseUrl: normalized.normalizedUrl,
      canonicalUrl: normalized.canonicalUrl,
      environmentType,
      authorizationState,
      authorizationConfirmedAt,
      authorizationConfirmedBy,
      safeModeEnabled,
      requiresAuth: input.requiresAuth ?? false,
      isActive,
      connectionStatus: 'CONFIGURED',
      notes: input.notes?.trim() ?? null,
      environmentId: v5EnvironmentId,
    });

    await this.recordAudit('WEBSITE_TARGET_CREATED', userId, {
      targetId: target.id,
      projectId: target.projectId,
      name: target.name,
      url: target.baseUrl,
      environmentType: target.environmentType,
      safeModeEnabled: target.safeModeEnabled,
    });

    return toWebsiteTargetDetails(target);
  }

  /**
   * Retrieves details for a specific website target.
   */
  public async getWebsiteTarget(
    input: GetWebsiteTargetInput,
    userId?: string | null,
  ): Promise<WebsiteTargetDetails> {
    await this.assertProjectOwnership(input.projectId, userId);

    const target = await this.repository.findById(input.targetId);
    if (!target || target.projectId !== input.projectId) {
      throw new WebsiteTargetNotFoundError(input.targetId);
    }

    return toWebsiteTargetDetails(target);
  }

  /**
   * Lists all non-deleted website targets for a project.
   */
  public async listWebsiteTargets(
    input: ListWebsiteTargetsInput,
    userId?: string | null,
  ): Promise<WebsiteTargetSummary[]> {
    await this.assertProjectOwnership(input.projectId, userId);

    const targets = await this.repository.findByProject(
      input.projectId,
      input.includeDeleted ?? false,
    );

    return targets.map(toWebsiteTargetSummary);
  }

  /**
   * Updates an existing website target metadata and safety configuration.
   */
  public async updateWebsiteTarget(
    input: UpdateWebsiteTargetInput,
    userId?: string | null,
  ): Promise<WebsiteTargetDetails> {
    await this.assertProjectOwnership(input.projectId, userId);

    const target = await this.repository.findById(input.targetId);
    if (!target || target.projectId !== input.projectId) {
      throw new WebsiteTargetNotFoundError(input.targetId);
    }

    const updates: Parameters<WebsiteTargetRepository['update']>[1] = {};

    if (input.name !== undefined) {
      updates.name = input.name.trim();
    }

    const nextEnvironmentType = input.environmentType ?? (target.environmentType as EnvironmentType);
    if (input.environmentType !== undefined && input.environmentType !== target.environmentType) {
      updates.environmentType = input.environmentType;
      await this.recordAudit('WEBSITE_TARGET_ENVIRONMENT_CHANGED', userId, {
        targetId: target.id,
        projectId: target.projectId,
        oldEnvironment: target.environmentType,
        newEnvironment: input.environmentType,
      });
    }

    if (input.url !== undefined) {
      const normalized = UrlSafetyEvaluator.normalizeAndValidate(input.url, nextEnvironmentType);
      updates.baseUrl = normalized.normalizedUrl;
      updates.canonicalUrl = normalized.canonicalUrl;
      updates.connectionStatus = 'CONFIGURED'; // Reset on URL modification
    }

    if (input.safeModeEnabled !== undefined && input.safeModeEnabled !== target.safeModeEnabled) {
      updates.safeModeEnabled = input.safeModeEnabled;
      await this.recordAudit('WEBSITE_TARGET_SAFE_MODE_CHANGED', userId, {
        targetId: target.id,
        projectId: target.projectId,
        safeModeEnabled: input.safeModeEnabled,
      });
    }

    if (input.requiresAuth !== undefined) {
      updates.requiresAuth = input.requiresAuth;
    }

    if (input.notes !== undefined) {
      updates.notes = input.notes?.trim() ?? null;
    }

    // Handle authorization confirmations during update
    if (input.confirmedOwnership !== undefined) {
      if (nextEnvironmentType === 'PRODUCTION') {
        if (input.confirmedOwnership && input.confirmedProductionRisk) {
          updates.authorizationState = 'USER_CONFIRMED';
          updates.authorizationConfirmedAt = new Date();
          updates.authorizationConfirmedBy = userId ?? null;
        }
      } else if (input.confirmedOwnership) {
        updates.authorizationState = 'USER_CONFIRMED';
        updates.authorizationConfirmedAt = new Date();
        updates.authorizationConfirmedBy = userId ?? null;
      }
    }

    const updated = await this.repository.update(target.id, updates);

    // Sync underlying V5 ProjectEnvironment record
    if (target.environmentId) {
      try {
        await this.prisma.projectEnvironment.update({
          where: { id: target.environmentId },
          data: {
            name: updated.name,
            type: updated.environmentType,
            baseUrl: updated.baseUrl,
            isProduction: updated.environmentType === 'PRODUCTION',
            productionSafetyPolicy:
              updated.environmentType === 'PRODUCTION'
                ? updated.safeModeEnabled
                  ? 'SAFE_MODE'
                  : 'MANUAL_APPROVAL_REQUIRED'
                : 'SAFE_MODE',
            notes: updated.notes,
          },
        });
      } catch {
        // Ignore V5 sync failure on background update
      }
    }

    await this.recordAudit('WEBSITE_TARGET_UPDATED', userId, {
      targetId: updated.id,
      projectId: updated.projectId,
    });

    return toWebsiteTargetDetails(updated);
  }

  /**
   * Sets a target as the active target for the project.
   */
  public async setActiveWebsiteTarget(
    input: SetActiveWebsiteTargetInput,
    userId?: string | null,
  ): Promise<WebsiteTargetDetails> {
    await this.assertProjectOwnership(input.projectId, userId);

    const target = await this.repository.findById(input.targetId);
    if (!target || target.projectId !== input.projectId) {
      throw new WebsiteTargetNotFoundError(input.targetId);
    }

    const updated = await this.repository.setActive(input.projectId, input.targetId);

    // Sync V5 default environment
    if (updated.environmentId) {
      try {
        await this.prisma.projectEnvironment.updateMany({
          where: { projectId: input.projectId },
          data: { isDefault: false },
        });
        await this.prisma.projectEnvironment.update({
          where: { id: updated.environmentId },
          data: { isDefault: true },
        });
      } catch {
        // Ignore V5 sync failure
      }
    }

    await this.recordAudit('WEBSITE_TARGET_ACTIVATED', userId, {
      targetId: updated.id,
      projectId: updated.projectId,
      name: updated.name,
      environmentType: updated.environmentType,
    });

    return toWebsiteTargetDetails(updated);
  }

  /**
   * Soft-deletes a website target while preserving historical V5 executions.
   */
  public async deleteWebsiteTarget(
    input: DeleteWebsiteTargetInput,
    userId?: string | null,
  ): Promise<{ readonly deleted: true }> {
    await this.assertProjectOwnership(input.projectId, userId);

    const target = await this.repository.findById(input.targetId, true);
    if (!target || target.projectId !== input.projectId) {
      throw new WebsiteTargetNotFoundError(input.targetId);
    }

    if (target.deletedAt !== null) {
      // Idempotent double delete safety
      return { deleted: true };
    }

    await this.repository.softDelete(target.id);

    // If active target was deleted, activate the most recent non-deleted target
    if (target.isActive) {
      const remaining = await this.repository.findByProject(input.projectId, false);
      if (remaining.length > 0 && remaining[0]) {
        await this.repository.setActive(input.projectId, remaining[0].id);
      }
    }

    await this.recordAudit('WEBSITE_TARGET_REMOVED', userId, {
      targetId: target.id,
      projectId: target.projectId,
      name: target.name,
    });

    return { deleted: true };
  }

  /**
   * Performs an authoritative preflight connectivity check against a target URL or existing target.
   */
  public async testConnection(
    input: TestWebsiteTargetConnectionInput,
    userId?: string | null,
    signal?: AbortSignal,
  ): Promise<ConnectivityCheckResultDto> {
    await this.assertProjectOwnership(input.projectId, userId);

    let targetToProbe: WebsiteTarget | null = null;
    let urlToProbe: string;
    let envType: EnvironmentType = input.environmentType ?? 'LOCAL';

    if (input.targetId) {
      targetToProbe = await this.repository.findById(input.targetId);
      if (!targetToProbe || targetToProbe.projectId !== input.projectId) {
        throw new WebsiteTargetNotFoundError(input.targetId);
      }
      urlToProbe = targetToProbe.baseUrl;
      envType = targetToProbe.environmentType as EnvironmentType;
    } else if (input.url) {
      urlToProbe = input.url;
    } else {
      throw new TargetValidationError('Either targetId or url must be provided for connectivity test.');
    }

    const result = await this.connectivityChecker.check(urlToProbe, {
      timeoutMs: input.timeoutMs,
      ignoreHttpsErrors: input.ignoreHttpsErrors,
      signal,
      environmentType: envType,
    });

    // Update target record with factual results if targeting an existing record
    if (targetToProbe) {
      const isReachable = result.status === 'VERIFIED_REACHABLE';
      await this.repository.update(targetToProbe.id, {
        lastCheckedAt: new Date(result.checkedAt),
        lastReachableAt: isReachable ? new Date(result.checkedAt) : targetToProbe.lastReachableAt,
        connectionStatus: result.status,
        lastStatusCode: result.statusCode,
        lastResponseTimeMs: result.responseTimeMs,
        resolvedFinalUrl: result.resolvedFinalUrl,
        redirectCount: result.redirectCount,
        tlsValid: result.tlsValid,
        lastFailureReason: isReachable ? null : result.message.slice(0, 1000),
      });

      await this.recordAudit('WEBSITE_TARGET_CONNECTION_CHECKED', userId, {
        targetId: targetToProbe.id,
        projectId: targetToProbe.projectId,
        status: result.status,
        statusCode: result.statusCode,
        responseTimeMs: result.responseTimeMs,
      });
    }

    return result;
  }

  /**
   * Confirms ownership and authorization for testing a target.
   */
  public async confirmAuthorization(
    input: ConfirmWebsiteTargetAuthInput,
    userId?: string | null,
  ): Promise<WebsiteTargetDetails> {
    await this.assertProjectOwnership(input.projectId, userId);

    const target = await this.repository.findById(input.targetId);
    if (!target || target.projectId !== input.projectId) {
      throw new WebsiteTargetNotFoundError(input.targetId);
    }

    if (!input.confirmedOwnership) {
      throw new TargetValidationError(
        'Ownership or permission confirmation is required to authorize testing.',
      );
    }

    if (target.environmentType === 'PRODUCTION' && !input.confirmedProductionRisk) {
      throw new TargetValidationError(
        'Production website testing requires explicit production risk acknowledgement.',
      );
    }

    const updated = await this.repository.update(target.id, {
      authorizationState: 'USER_CONFIRMED',
      authorizationConfirmedAt: new Date(),
      authorizationConfirmedBy: userId ?? null,
    });

    await this.recordAudit('WEBSITE_TARGET_AUTH_CONFIRMED', userId, {
      targetId: updated.id,
      projectId: updated.projectId,
      environmentType: updated.environmentType,
    });

    return toWebsiteTargetDetails(updated);
  }

  /**
   * Resolves an immutable target snapshot for execution.
   */
  public async resolveSnapshot(
    input: ResolveWebsiteTargetSnapshotInput,
    userId?: string | null,
  ): Promise<WebsiteTargetSnapshot> {
    await this.assertProjectOwnership(input.projectId, userId);

    let target: WebsiteTarget | null = null;
    if (input.targetId) {
      target = await this.repository.findById(input.targetId);
    } else {
      target = await this.repository.findActiveByProject(input.projectId);
    }

    if (!target || target.projectId !== input.projectId) {
      throw new WebsiteTargetNotFoundError(input.targetId ?? 'active-target');
    }

    return toWebsiteTargetSnapshot(target);
  }
}
