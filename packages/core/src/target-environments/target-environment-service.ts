/**
 * @file packages/core/src/target-environments/target-environment-service.ts
 * Privileged business domain service for Target Environments, Browser Settings, and Authentication Configuration (Phase 122).
 */

import http from 'node:http';
import https from 'node:https';
import type { PrismaClient, ProjectEnvironment, AuthenticationProfile, Project, AuthAuditAction, Prisma } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import type {
  TargetEnvironmentConfigDto,
  TargetAuthConfigDto,
  TargetBrowserEngine,
  SaveTargetEnvironmentInput,
  GetTargetEnvironmentInput,
  ListTargetEnvironmentsInput,
  DeleteTargetEnvironmentInput,
  SetActiveTargetEnvironmentInput,
  TestTargetConnectionInput,
  TestTargetAuthInput,
  ResolveTargetEnvironmentInput,
  TargetConnectionTestResultDto,
  TargetAuthTestResultDto,
  TargetExecutionSnapshotDto,
} from '@ai-quality/contracts';
import {
  TargetEnvNotFoundError,
  TargetEnvAccessDeniedError,
  TargetEnvValidationError,
  TargetEnvUnreachableError,
} from './target-env-errors.js';
import { TargetAuthVault, type ITargetAuthVault } from './target-auth-vault.js';
import { TargetEnvValidator } from './target-env-validator.js';
import { PlaywrightBrowserProvider } from '../execution/browser-provider.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';
import { getLogger } from '../logging/logger.js';
import type { ILogger } from '../logging/index.js';

export class TargetEnvironmentService {
  private readonly prisma: PrismaClient;
  private readonly vault: ITargetAuthVault;
  private readonly browserProvider: PlaywrightBrowserProvider;
  private readonly logger: ILogger;

  constructor(deps?: {
    prisma?: PrismaClient;
    vault?: ITargetAuthVault;
    browserProvider?: PlaywrightBrowserProvider;
    logger?: ILogger;
  }) {
    const client = deps?.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database connection is not configured or unavailable.');
    }
    this.prisma = client;
    this.vault = deps?.vault ?? new TargetAuthVault();
    this.browserProvider = deps?.browserProvider ?? new PlaywrightBrowserProvider(deps?.logger);
    this.logger = deps?.logger ?? getLogger();
  }

  /**
   * Asserts project exists and verifies tenant ownership.
   */
  public async assertProjectOwnership(projectId: string, userId: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project || project.deletedAt !== null) {
      throw new TargetEnvNotFoundError(`Project '${projectId}' not found.`, projectId);
    }

    if (project.userId && project.userId !== userId) {
      throw new TargetEnvAccessDeniedError(
        'Access denied: You do not have permission to access or modify this project target environment.',
      );
    }

    return project;
  }

  /**
   * Retrieves a target environment configuration by ID.
   */
  public async getEnvironment(
    userId: string,
    input: GetTargetEnvironmentInput,
  ): Promise<TargetEnvironmentConfigDto> {
    await this.assertProjectOwnership(input.projectId, userId);

    const env = await this.prisma.projectEnvironment.findFirst({
      where: {
        id: input.environmentId,
        projectId: input.projectId,
      },
      include: {
        authProfiles: true,
      },
    });

    if (!env) {
      throw new TargetEnvNotFoundError(input.environmentId, input.projectId);
    }

    return this.mapToDto(env);
  }

  /**
   * Lists all target environments for a project, sorted with active/default first.
   */
  public async listEnvironments(
    userId: string,
    input: ListTargetEnvironmentsInput,
  ): Promise<readonly TargetEnvironmentConfigDto[]> {
    await this.assertProjectOwnership(input.projectId, userId);

    const envs = await this.prisma.projectEnvironment.findMany({
      where: { projectId: input.projectId },
      include: {
        authProfiles: true,
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    return envs.map(env => this.mapToDto(env));
  }

  /**
   * Creates or updates a target environment configuration, its browser settings, and authentication.
   */
  public async saveEnvironment(
    userId: string,
    input: SaveTargetEnvironmentInput,
  ): Promise<TargetEnvironmentConfigDto> {
    await this.assertProjectOwnership(input.projectId, userId);

    // 1. Validate URLs
    let normalizedBaseUrl: string | null = null;
    if (input.baseUrl && input.baseUrl.trim()) {
      const norm = TargetEnvValidator.validateAndNormalizeUrl(
        input.baseUrl,
        input.type,
        input.isProduction,
      );
      normalizedBaseUrl = norm.normalizedUrl;
    }

    let normalizedApiUrl: string | null = null;
    if (input.apiUrl && input.apiUrl.trim()) {
      const norm = TargetEnvValidator.validateAndNormalizeUrl(
        input.apiUrl,
        input.type,
        input.isProduction,
      );
      normalizedApiUrl = norm.normalizedUrl;
    }

    // 2. Validate browser settings
    const browserEngine = TargetEnvValidator.validateBrowserEngine(input.browserEngine ?? 'chromium');
    const { width: viewportWidth, height: viewportHeight } = TargetEnvValidator.validateViewport(
      input.viewportWidth ?? 1280,
      input.viewportHeight ?? 720,
    );

    const isProduction = input.isProduction ?? input.type === 'PRODUCTION';

    let existingEnv: ProjectEnvironment | null = null;
    if (input.environmentId) {
      existingEnv = await this.prisma.projectEnvironment.findFirst({
        where: { id: input.environmentId, projectId: input.projectId },
      });
      if (!existingEnv) {
        throw new TargetEnvNotFoundError(input.environmentId, input.projectId);
      }
    }

    // 3. Atomically persist environment
    const saved = await this.prisma.$transaction(async tx => {
      let env: ProjectEnvironment;

      if (input.environmentId && existingEnv) {
        if (input.isDefault) {
          await tx.projectEnvironment.updateMany({
            where: { projectId: input.projectId },
            data: { isDefault: false },
          });
        }

        env = await tx.projectEnvironment.update({
          where: { id: input.environmentId },
          data: {
            name: input.name.trim(),
            type: input.type ?? existingEnv.type,
            baseUrl: normalizedBaseUrl,
            apiUrl: normalizedApiUrl,
            isDefault: input.isDefault !== undefined ? input.isDefault : existingEnv.isDefault,
            isEnabled: input.isEnabled !== undefined ? input.isEnabled : existingEnv.isEnabled,
            isProduction,
            productionSafetyPolicy: input.productionSafetyPolicy ?? existingEnv.productionSafetyPolicy,
            browserEngine,
            headless: input.headless !== undefined ? input.headless : existingEnv.headless,
            viewportWidth,
            viewportHeight,
            ignoreHttpsErrors: input.ignoreHttpsErrors !== undefined ? input.ignoreHttpsErrors : existingEnv.ignoreHttpsErrors,
            notes: input.notes !== undefined ? input.notes : existingEnv.notes,
          },
        });
      } else {
        const count = await tx.projectEnvironment.count({ where: { projectId: input.projectId } });
        const shouldBeDefault = input.isDefault || count === 0;

        if (shouldBeDefault) {
          await tx.projectEnvironment.updateMany({
            where: { projectId: input.projectId },
            data: { isDefault: false },
          });
        }

        env = await tx.projectEnvironment.create({
          data: {
            projectId: input.projectId,
            name: input.name.trim(),
            type: input.type ?? 'DEVELOPMENT',
            baseUrl: normalizedBaseUrl,
            apiUrl: normalizedApiUrl,
            isDefault: shouldBeDefault,
            isEnabled: input.isEnabled ?? true,
            isProduction,
            productionSafetyPolicy: input.productionSafetyPolicy ?? (isProduction ? 'SAFE_MODE' : 'PROHIBITED'),
            browserEngine,
            headless: input.headless ?? true,
            viewportWidth,
            viewportHeight,
            ignoreHttpsErrors: input.ignoreHttpsErrors ?? false,
            notes: input.notes ?? null,
          },
        });
      }

      // 4. Handle Authentication Profile configuration
      if (input.auth) {
        const authData = input.auth;
        const contextKey = `${input.projectId}:${env.id}`;

        let encryptedPassword: string | null = null;
        let passwordPreview: string | null = null;

        if (authData.password && authData.password.trim()) {
          encryptedPassword = await this.vault.encrypt(authData.password, contextKey);
          passwordPreview = this.vault.maskPreview(authData.password);
        }

        let normalizedLoginUrl: string | null = null;
        if (authData.loginUrl && authData.loginUrl.trim()) {
          const norm = TargetEnvValidator.validateAndNormalizeUrl(authData.loginUrl, env.type, isProduction);
          normalizedLoginUrl = norm.normalizedUrl;
        }

        const existingProfile = await tx.authenticationProfile.findFirst({
          where: {
            environmentId: env.id,
            projectId: input.projectId,
          },
        });

        if (existingProfile) {
          await tx.authenticationProfile.update({
            where: { id: existingProfile.id },
            data: {
              strategy: authData.strategy ?? existingProfile.strategy,
              loginUrl: normalizedLoginUrl !== null ? normalizedLoginUrl : existingProfile.loginUrl,
              username: authData.username !== undefined ? authData.username?.trim() || null : existingProfile.username,
              ...(encryptedPassword
                ? {
                    encryptedPassword,
                    passwordPreview,
                  }
                : {}),
              usernameFieldSelector: authData.usernameFieldSelector !== undefined ? authData.usernameFieldSelector?.trim() || null : existingProfile.usernameFieldSelector,
              passwordFieldSelector: authData.passwordFieldSelector !== undefined ? authData.passwordFieldSelector?.trim() || null : existingProfile.passwordFieldSelector,
              submitControlSelector: authData.submitControlSelector !== undefined ? authData.submitControlSelector?.trim() || null : existingProfile.submitControlSelector,
              successValidationType: authData.successValidationType ?? existingProfile.successValidationType,
              successValidationValue: authData.successValidationValue !== undefined ? authData.successValidationValue?.trim() || null : existingProfile.successValidationValue,
              status: 'CONFIGURED',
            },
          });
        } else {
          await tx.authenticationProfile.create({
            data: {
              projectId: input.projectId,
              environmentId: env.id,
              name: `${env.name} Auth Profile`,
              strategy: authData.strategy ?? 'NONE',
              loginUrl: normalizedLoginUrl,
              username: authData.username?.trim() || null,
              encryptedPassword,
              passwordPreview,
              usernameFieldSelector: authData.usernameFieldSelector?.trim() || null,
              passwordFieldSelector: authData.passwordFieldSelector?.trim() || null,
              submitControlSelector: authData.submitControlSelector?.trim() || null,
              successValidationType: authData.successValidationType ?? 'NONE',
              successValidationValue: authData.successValidationValue?.trim() || null,
              status: 'CONFIGURED',
            },
          });
        }
      }

      return tx.projectEnvironment.findUniqueOrThrow({
        where: { id: env.id },
        include: { authProfiles: true },
      });
    });

    // 5. Audit Logging
    await this.recordAudit(userId, 'TARGET_ENVIRONMENT_CONFIGURED', {
      projectId: input.projectId,
      environmentId: saved.id,
      environmentName: saved.name,
      environmentType: saved.type,
      baseUrl: saved.baseUrl,
      apiUrl: saved.apiUrl,
      browserEngine: saved.browserEngine,
      headless: saved.headless,
      authStrategy: saved.authProfiles[0]?.strategy ?? 'NONE',
    });

    if (
      !existingEnv ||
      existingEnv.browserEngine !== saved.browserEngine ||
      existingEnv.headless !== saved.headless ||
      existingEnv.viewportWidth !== saved.viewportWidth ||
      existingEnv.viewportHeight !== saved.viewportHeight
    ) {
      await this.recordAudit(userId, 'BROWSER_CONFIGURATION_CHANGED', {
        projectId: input.projectId,
        environmentId: saved.id,
        browserEngine: saved.browserEngine,
        headless: saved.headless,
        viewportWidth: saved.viewportWidth,
        viewportHeight: saved.viewportHeight,
        ignoreHttpsErrors: saved.ignoreHttpsErrors,
      });
    }

    if (input.auth) {
      await this.recordAudit(userId, 'AUTH_CONFIGURATION_CHANGED', {
        projectId: input.projectId,
        environmentId: saved.id,
        strategy: input.auth.strategy,
        username: input.auth.username?.trim() || null,
        hasPassword: Boolean(input.auth.password),
        loginUrl: input.auth.loginUrl?.trim() || null,
        successValidationType: input.auth.successValidationType ?? 'NONE',
      });
    }

    this.logger.info('target_env.configured', {
      projectId: input.projectId,
      environmentId: saved.id,
      name: saved.name,
      type: saved.type,
    });

    return this.mapToDto(saved);
  }

  /**
   * Sets the active / default target environment for a project.
   */
  public async setActiveEnvironment(
    userId: string,
    input: SetActiveTargetEnvironmentInput,
  ): Promise<TargetEnvironmentConfigDto> {
    await this.assertProjectOwnership(input.projectId, userId);

    const targetEnv = await this.prisma.projectEnvironment.findFirst({
      where: { id: input.environmentId, projectId: input.projectId },
    });
    if (!targetEnv) {
      throw new TargetEnvNotFoundError(input.environmentId, input.projectId);
    }

    const updated = await this.prisma.$transaction(async tx => {
      await tx.projectEnvironment.updateMany({
        where: { projectId: input.projectId },
        data: { isDefault: false },
      });

      return tx.projectEnvironment.update({
        where: { id: input.environmentId },
        data: { isDefault: true },
        include: { authProfiles: true },
      });
    });

    await this.recordAudit(userId, 'TARGET_ENVIRONMENT_SWITCHED', {
      projectId: input.projectId,
      environmentId: updated.id,
      environmentName: updated.name,
      environmentType: updated.type,
    });

    this.logger.info('target_env.switched', {
      projectId: input.projectId,
      environmentId: updated.id,
      name: updated.name,
    });

    return this.mapToDto(updated);
  }

  /**
   * Deletes a target environment and cleans up associated auth profiles.
   */
  public async deleteEnvironment(
    userId: string,
    input: DeleteTargetEnvironmentInput,
  ): Promise<boolean> {
    await this.assertProjectOwnership(input.projectId, userId);

    const targetEnv = await this.prisma.projectEnvironment.findFirst({
      where: { id: input.environmentId, projectId: input.projectId },
    });
    if (!targetEnv) {
      throw new TargetEnvNotFoundError(input.environmentId, input.projectId);
    }

    await this.prisma.$transaction(async tx => {
      await tx.authenticationProfile.deleteMany({
        where: { environmentId: input.environmentId },
      });

      await tx.projectEnvironment.delete({
        where: { id: input.environmentId },
      });

      // If deleted environment was default, promote the first remaining environment
      const remaining = await tx.projectEnvironment.findFirst({
        where: { projectId: input.projectId },
        orderBy: { createdAt: 'asc' },
      });
      if (remaining && targetEnv.isDefault) {
        await tx.projectEnvironment.update({
          where: { id: remaining.id },
          data: { isDefault: true },
        });
      }
    });

    this.logger.info('target_env.deleted', {
      projectId: input.projectId,
      environmentId: input.environmentId,
    });

    return true;
  }

  /**
   * Tests real network reachability and HTTP connectivity to the target URL.
   */
  public async testConnection(
    userId: string,
    input: TestTargetConnectionInput,
  ): Promise<TargetConnectionTestResultDto> {
    await this.assertProjectOwnership(input.projectId, userId);

    let targetUrl = input.url;
    if (!targetUrl && input.environmentId) {
      const env = await this.prisma.projectEnvironment.findFirst({
        where: { id: input.environmentId, projectId: input.projectId },
      });
      if (env?.baseUrl) {
        targetUrl = env.baseUrl;
      }
    }

    if (!targetUrl || !targetUrl.trim()) {
      throw new TargetEnvValidationError('No target URL provided or configured on environment.');
    }

    const normalized = TargetEnvValidator.validateAndNormalizeUrl(targetUrl);
    const tStart = performance.now();

    try {
      const result = await this.executeNetworkProbe(normalized.normalizedUrl, 5000);
      const responseTimeMs = Math.round(performance.now() - tStart);

      return {
        reachable: result.statusCode >= 200 && result.statusCode < 400,
        statusCode: result.statusCode,
        responseTimeMs,
        redirectCount: result.redirectCount,
        finalUrl: result.finalUrl,
        tlsValid: result.tlsValid,
        errorMessage: result.statusCode >= 400 ? `HTTP status ${result.statusCode}` : null,
      };
    } catch (err: unknown) {
      const responseTimeMs = Math.round(performance.now() - tStart);
      const errorMsg = err instanceof Error ? err.message : String(err);

      return {
        reachable: false,
        statusCode: null,
        responseTimeMs,
        redirectCount: 0,
        finalUrl: normalized.normalizedUrl,
        tlsValid: false,
        errorMessage: errorMsg,
      };
    }
  }

  /**
   * Tests real authentication flow using Playwright browser against the configured target.
   */
  public async testAuthentication(
    userId: string,
    input: TestTargetAuthInput,
  ): Promise<TargetAuthTestResultDto> {
    await this.assertProjectOwnership(input.projectId, userId);

    const env = await this.prisma.projectEnvironment.findFirst({
      where: { id: input.environmentId, projectId: input.projectId },
      include: { authProfiles: true },
    });
    if (!env) {
      throw new TargetEnvNotFoundError(input.environmentId, input.projectId);
    }

    const authProfile = env.authProfiles[0];
    if (!authProfile || authProfile.strategy === 'NONE') {
      return {
        success: true,
        durationMs: 0,
        authenticated: true,
        finalUrl: env.baseUrl ?? null,
        errorMessage: null,
        diagnosticEvidence: null,
      };
    }

    // Resolve password
    let passwordToUse = input.temporaryPassword;
    if (!passwordToUse && authProfile.encryptedPassword) {
      const contextKey = `${input.projectId}:${env.id}`;
      passwordToUse = await this.vault.decrypt(authProfile.encryptedPassword, contextKey);
    }

    if (!passwordToUse && authProfile.strategy === 'FORM_LOGIN') {
      throw new TargetEnvValidationError('No password configured or supplied for authentication test.');
    }

    if (passwordToUse) {
      SecretRedactor.registerSecret(passwordToUse);
    }

    const targetUrl = authProfile.loginUrl || env.baseUrl;
    if (!targetUrl) {
      throw new TargetEnvValidationError('No target or login URL configured for authentication.');
    }

    const browserEngine: TargetBrowserEngine = (input.browserEngine ?? env.browserEngine ?? 'chromium') as TargetBrowserEngine;
    const headless = input.headless !== undefined ? input.headless : env.headless;
    const tStart = performance.now();

    let browser: import('playwright').Browser | null = null;
    let context: import('playwright').BrowserContext | null = null;

    try {
      // 1. Launch real browser
      browser = await this.browserProvider.launch({
        engine: browserEngine,
        headless,
        timeoutMs: 15000,
      });

      context = await browser.newContext({
        viewport: { width: env.viewportWidth, height: env.viewportHeight },
        ignoreHTTPSErrors: env.ignoreHttpsErrors,
      });

      const page = await context.newPage();

      // 2. Navigate to login target
      await page.goto(targetUrl, { timeout: 15000, waitUntil: 'domcontentloaded' });

      // 3. Perform strategy-specific login
      if (authProfile.strategy === 'FORM_LOGIN') {
        if (authProfile.usernameFieldSelector && authProfile.username) {
          await page.fill(authProfile.usernameFieldSelector, authProfile.username, { timeout: 5000 });
        }

        if (authProfile.passwordFieldSelector && passwordToUse) {
          await page.fill(authProfile.passwordFieldSelector, passwordToUse, { timeout: 5000 });
        }

        if (authProfile.submitControlSelector) {
          await page.click(authProfile.submitControlSelector, { timeout: 5000 });
        } else if (authProfile.passwordFieldSelector) {
          await page.press(authProfile.passwordFieldSelector, 'Enter');
        }

        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      }

      // 4. Validate success condition
      let authenticated = false;
      if (authProfile.successValidationType === 'URL_MATCH' && authProfile.successValidationValue) {
        authenticated = page.url().includes(authProfile.successValidationValue);
      } else if (authProfile.successValidationType === 'ELEMENT_PRESENT' && authProfile.successValidationValue) {
        const el = await page.waitForSelector(authProfile.successValidationValue, { timeout: 4000 }).catch(() => null);
        authenticated = el !== null;
      } else if (authProfile.successValidationType === 'COOKIE_PRESENT' && authProfile.successValidationValue) {
        const cookies = await context.cookies();
        authenticated = cookies.some(c => c.name === authProfile.successValidationValue);
      } else {
        authenticated = true; // NONE or fallback
      }

      const durationMs = Math.round(performance.now() - tStart);
      const finalUrl = SecretRedactor.redactUrl(page.url());

      if (authenticated) {
        await this.prisma.authenticationProfile.update({
          where: { id: authProfile.id },
          data: {
            status: 'VALID',
            lastValidatedAt: new Date(),
            validationError: null,
          },
        });

        await this.recordAudit(userId, 'AUTH_TEST_RESULT', {
          projectId: input.projectId,
          environmentId: env.id,
          profileId: authProfile.id,
          success: true,
          durationMs,
        });

        return {
          success: true,
          durationMs,
          authenticated: true,
          finalUrl,
          errorMessage: null,
          diagnosticEvidence: null,
        };
      } else {
        // Validation failed
        const screenshotBuffer = await page.screenshot({ type: 'png' }).catch(() => null);
        const screenshotBase64 = screenshotBuffer ? screenshotBuffer.toString('base64') : undefined;

        await this.prisma.authenticationProfile.update({
          where: { id: authProfile.id },
          data: {
            status: 'INVALID',
            lastValidatedAt: new Date(),
            validationError: 'Authentication success condition not satisfied.',
          },
        });

        await this.recordAudit(userId, 'AUTH_TEST_RESULT', {
          projectId: input.projectId,
          environmentId: env.id,
          profileId: authProfile.id,
          success: false,
          durationMs,
          reason: 'Validation condition not satisfied',
        });

        return {
          success: false,
          durationMs,
          authenticated: false,
          finalUrl,
          errorMessage: 'Authentication success condition not satisfied.',
          diagnosticEvidence: {
            screenshotBase64,
            failedStep: 'VALIDATION_CHECK',
          },
        };
      }
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - tStart);
      const errorMsg = err instanceof Error ? err.message : String(err);

      await this.prisma.authenticationProfile.update({
        where: { id: authProfile.id },
        data: {
          status: 'INVALID',
          lastValidatedAt: new Date(),
          validationError: errorMsg.slice(0, 500),
        },
      });

      await this.recordAudit(userId, 'AUTH_TEST_RESULT', {
        projectId: input.projectId,
        environmentId: env.id,
        profileId: authProfile.id,
        success: false,
        durationMs,
        reason: errorMsg.slice(0, 200),
      });

      return {
        success: false,
        durationMs,
        authenticated: false,
        finalUrl: null,
        errorMessage: errorMsg,
        diagnosticEvidence: {
          failedStep: 'BROWSER_INTERACTION',
        },
      };
    } finally {
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }

  /**
   * Resolves the immutable execution snapshot for Playwright test execution.
   */
  public async resolveExecutionTarget(
    userId: string,
    input: ResolveTargetEnvironmentInput,
  ): Promise<TargetExecutionSnapshotDto> {
    await this.assertProjectOwnership(input.projectId, userId);

    let env: (ProjectEnvironment & { authProfiles: AuthenticationProfile[] }) | null = null;

    if (input.environmentId) {
      env = await this.prisma.projectEnvironment.findFirst({
        where: { id: input.environmentId, projectId: input.projectId },
        include: { authProfiles: true },
      });
    } else {
      env = await this.prisma.projectEnvironment.findFirst({
        where: { projectId: input.projectId, isDefault: true },
        include: { authProfiles: true },
      });

      if (!env) {
        env = await this.prisma.projectEnvironment.findFirst({
          where: { projectId: input.projectId },
          include: { authProfiles: true },
          orderBy: { createdAt: 'asc' },
        });
      }
    }

    if (!env) {
      throw new TargetEnvNotFoundError('No target environment configured for project.', input.projectId);
    }

    if (!env.isEnabled) {
      throw new TargetEnvValidationError(`Target environment '${env.name}' is disabled.`);
    }

    if (!env.baseUrl) {
      throw new TargetEnvValidationError(`Target environment '${env.name}' has no base URL configured.`);
    }

    const browserEngine = TargetEnvValidator.validateBrowserEngine(env.browserEngine);
    const authProfile = env.authProfiles[0];

    return {
      environmentId: env.id,
      projectId: env.projectId,
      name: env.name,
      type: env.type,
      baseUrl: env.baseUrl,
      apiUrl: env.apiUrl ?? null,
      browserEngine,
      headless: env.headless,
      viewport: {
        width: env.viewportWidth,
        height: env.viewportHeight,
      },
      ignoreHttpsErrors: env.ignoreHttpsErrors,
      isProduction: env.isProduction,
      productionSafetyPolicy: env.productionSafetyPolicy,
      authProfileId: authProfile ? authProfile.id : null,
      storageStateKey: authProfile ? authProfile.storageStateKey : null,
      resolvedAt: new Date().toISOString(),
    };
  }

  /**
   * Internal helper: Executes a network probe to verify target availability.
   */
  private executeNetworkProbe(
    targetUrl: string,
    timeoutMs: number,
  ): Promise<{ statusCode: number; redirectCount: number; finalUrl: string; tlsValid: boolean }> {
    return new Promise((resolve, reject) => {
      let redirectCount = 0;
      const maxRedirects = 5;

      const doRequest = (currentUrl: string) => {
        const parsed = new URL(currentUrl);
        const isHttps = parsed.protocol === 'https:';
        const options: http.RequestOptions = {
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: 'HEAD',
          timeout: timeoutMs,
          headers: {
            'User-Agent': 'AI-Quality-Platform/1.0 (Target-Connectivity-Probe)',
          },
        };

        const req = (isHttps ? https : http).request(options, res => {
          const status = res.statusCode ?? 0;

          // Handle redirects
          if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
            redirectCount++;
            if (redirectCount > maxRedirects) {
              return reject(new TargetEnvUnreachableError('Too many redirects.'));
            }

            const redirectTarget = new URL(res.headers.location, currentUrl).toString();
            // Validate redirect target safety
            TargetEnvValidator.validateAndNormalizeUrl(redirectTarget);
            return doRequest(redirectTarget);
          }

          resolve({
            statusCode: status,
            redirectCount,
            finalUrl: currentUrl,
            tlsValid: isHttps,
          });
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new TargetEnvUnreachableError(`Connection timed out after ${timeoutMs}ms.`));
        });

        req.on('error', err => {
          reject(new TargetEnvUnreachableError(`Network probe failed: ${err.message}`));
        });

        req.end();
      };

      doRequest(targetUrl);
    });
  }

  /**
   * Internal helper: Records audit log event.
   */
  private async recordAudit(
    userId: string,
    action: AuthAuditAction,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.authAuditEvent.create({
        data: {
          userId,
          action,
          metadata: metadata as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.warn('target_env.audit_failed', {
        action,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Internal mapper: Converts Prisma entity to TargetEnvironmentConfigDto.
   */
  private mapToDto(
    env: ProjectEnvironment & { authProfiles: AuthenticationProfile[] },
  ): TargetEnvironmentConfigDto {
    const authProfile = env.authProfiles[0];
    let authDto: TargetAuthConfigDto | null = null;

    if (authProfile) {
      authDto = {
        id: authProfile.id,
        strategy: authProfile.strategy,
        status: authProfile.status,
        loginUrl: authProfile.loginUrl,
        username: authProfile.username,
        hasPassword: Boolean(authProfile.encryptedPassword),
        passwordPreview: authProfile.passwordPreview,
        usernameFieldSelector: authProfile.usernameFieldSelector,
        passwordFieldSelector: authProfile.passwordFieldSelector,
        submitControlSelector: authProfile.submitControlSelector,
        successValidationType: authProfile.successValidationType,
        successValidationValue: authProfile.successValidationValue,
        lastValidatedAt: authProfile.lastValidatedAt?.toISOString() ?? null,
        validationError: authProfile.validationError,
      };
    }

    return {
      id: env.id,
      projectId: env.projectId,
      name: env.name,
      type: env.type,
      baseUrl: env.baseUrl,
      apiUrl: env.apiUrl ?? null,
      isDefault: env.isDefault,
      isEnabled: env.isEnabled,
      isProduction: env.isProduction,
      productionSafetyPolicy: env.productionSafetyPolicy,
      browserEngine: env.browserEngine as TargetBrowserEngine,
      headless: env.headless,
      viewportWidth: env.viewportWidth,
      viewportHeight: env.viewportHeight,
      ignoreHttpsErrors: env.ignoreHttpsErrors,
      notes: env.notes,
      auth: authDto,
      lastCheckedAt: null,
      connectionStatus: env.isEnabled ? 'CONFIGURED' : 'DISABLED',
      createdAt: env.createdAt.toISOString(),
      updatedAt: env.updatedAt.toISOString(),
    };
  }
}
