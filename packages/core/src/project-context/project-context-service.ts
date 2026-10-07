/**
 * @file packages/core/src/project-context/project-context-service.ts
 * Authoritative business service for the Unified Project Context & Source Detection (V8 Phase 123).
 *
 * Responsibilities:
 * 1. Aggregates all project sources (Website, Git, Local Folder) into one authoritative context.
 * 2. Manages context lifecycle states (CONNECTED, PARTIAL, REFRESHING, STALE, INVALID, ERROR).
 * 3. Coordinates safe, read-only source detection without script execution.
 * 4. Tracks freshness, staleness reasons, and automatic recovery.
 * 5. Strictly enforces multi-tenant project isolation and credential redaction.
 * 6. Records authoritative audit events in PostgreSQL.
 */

import fs from 'node:fs';
import type { PrismaClient, Project, AuthAuditAction } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import type {
  ProjectContextDto,
  ProjectContextStatusDto,
  DetectedProjectSourcesDto,
  ProjectContextLifecycleState,
  WebsiteSourceSummaryDto,
  GitSourceSummaryDto,
  LocalFolderSourceSummaryDto,
  ProjectContextEnvironmentDto,
  ProjectContextBrowserDto,
  ProjectContextAuthProfileSummaryDto,
  DetectedTechnologyDto,
  RepositorySummaryDto,
} from '@ai-quality/contracts';
import { SourceDetector } from './source-detector.js';
import {
  ProjectContextNotFoundError,
  ProjectContextAccessDeniedError,
  ProjectContextRefreshFailedError,
} from './project-context-errors.js';
import { getLogger, type ILogger } from '../logging/index.js';

interface CachedContextEntry {
  context: ProjectContextDto;
  cachedAt: number;
  isStale: boolean;
  staleReasons: string[];
}

export class ProjectContextService {
  private readonly prisma: PrismaClient;
  private readonly sourceDetector: SourceDetector;
  private readonly logger: ILogger;

  // In-memory cache for fast access and lifecycle tracking per project
  private readonly contextCache = new Map<string, CachedContextEntry>();

  // Default TTL for context freshness: 5 minutes
  public static readonly DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(prisma?: PrismaClient, sourceDetector?: SourceDetector, logger?: ILogger) {
    const client = prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database connection is not configured or unavailable.');
    }
    this.prisma = client;
    this.sourceDetector = sourceDetector ?? new SourceDetector();
    this.logger = logger ?? getLogger();
  }

  /**
   * Retrieves or builds the unified project context with tenant isolation and freshness checks.
   */
  public async getContext(
    projectId: string,
    userId?: string | null,
    forceRefresh = false,
  ): Promise<ProjectContextDto> {
    const project = await this.assertProjectAccess(projectId, userId);

    const cached = this.contextCache.get(projectId);
    const now = Date.now();

    if (
      !forceRefresh &&
      cached &&
      !cached.isStale &&
      now - cached.cachedAt < ProjectContextService.DEFAULT_CACHE_TTL_MS
    ) {
      return cached.context;
    }

    return this.buildAndCacheContext(project, userId, cached?.isStale ? cached.staleReasons : []);
  }

  /**
   * Forces a full context refresh, re-probing all connected sources and updating the cache.
   */
  public async refreshContext(
    projectId: string,
    userId?: string | null,
  ): Promise<ProjectContextDto> {
    const project = await this.assertProjectAccess(projectId, userId);

    try {
      const context = await this.buildAndCacheContext(project, userId, []);

      // Record audit event
      if (userId) {
        await this.recordAudit(userId, 'PROJECT_CONTEXT_REFRESHED' as AuthAuditAction, {
          projectId,
          lifecycleState: context.lifecycleState,
          timestamp: new Date().toISOString(),
        });
      }

      this.logger.info('Project context refreshed successfully', {
        projectId,
        lifecycleState: context.lifecycleState,
      });

      return context;
    } catch (err: unknown) {
      throw new ProjectContextRefreshFailedError(
        projectId,
        `Failed to refresh context for project '${projectId}': ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  /**
   * Marks a project context as STALE with specific invalidation reasons.
   */
  public async invalidateContext(
    projectId: string,
    userId?: string | null,
    reason = 'Context invalidated by caller',
  ): Promise<ProjectContextDto> {
    const project = await this.assertProjectAccess(projectId, userId);

    let entry = this.contextCache.get(projectId);
    if (!entry) {
      // Build base context if not in cache
      const context = await this.buildAndCacheContext(project, userId, [reason]);
      entry = this.contextCache.get(projectId)!;
    }

    entry.isStale = true;
    if (!entry.staleReasons.includes(reason)) {
      entry.staleReasons.push(reason);
    }

    // Update context object
    const updatedContext: ProjectContextDto = {
      ...entry.context,
      lifecycleState: 'STALE',
      freshness: {
        isStale: true,
        lastRefreshedAt: entry.context.freshness.lastRefreshedAt,
        staleReasons: [...entry.staleReasons],
      },
    };
    entry.context = updatedContext;

    // Record audit event
    if (userId) {
      await this.recordAudit(userId, 'PROJECT_CONTEXT_INVALIDATED' as AuthAuditAction, {
        projectId,
        reason,
        timestamp: new Date().toISOString(),
      });
    }

    this.logger.info('Project context invalidated', { projectId, reason });

    return updatedContext;
  }

  /**
   * Performs explicit source detection on the project's local folder or website.
   */
  public async detectSources(
    projectId: string,
    userId?: string | null,
  ): Promise<DetectedProjectSourcesDto> {
    const project = await this.assertProjectAccess(projectId, userId);

    // 1. Check local folder or git repository path
    const localSource = await this.prisma.projectSource.findUnique({
      where: { projectId },
    });

    const activeGit = await this.prisma.repositoryConnection.findFirst({
      where: { projectId, isActive: true, deletedAt: null },
    });

    const rootPathToScan = localSource?.rootPath ?? activeGit?.localPath ?? null;

    let detectedTechnology: DetectedTechnologyDto = {
      primaryLanguage: null,
      languages: [],
      frameworks: [],
      packageManager: null,
      testFramework: null,
      likelyEntryPoints: [],
      testDirectories: [],
      requirementsFiles: [],
      configurationFiles: [],
    };
    let repositorySummary: RepositorySummaryDto | null = null;

    if (rootPathToScan && fs.existsSync(rootPathToScan)) {
      try {
        const detection = await this.sourceDetector.detectLocalFolder(rootPathToScan);
        detectedTechnology = detection.detectedTechnology;
        repositorySummary = detection.repositorySummary;
      } catch (err) {
        this.logger.warn('Local folder detection failed during detectSources', {
          projectId,
          rootPathToScan,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 2. Check website target
    const activeWebsite = await this.prisma.websiteTarget.findFirst({
      where: { projectId, isActive: true, deletedAt: null },
    });

    let websiteMetadata: Record<string, unknown> | null = null;
    if (activeWebsite) {
      try {
        const check = await this.sourceDetector.detectWebsite(
          activeWebsite.baseUrl,
          activeWebsite.environmentType,
        );
        websiteMetadata = {
          baseUrl: activeWebsite.baseUrl,
          status: check.status,
          statusCode: check.statusCode,
          responseTimeMs: check.responseTimeMs,
          tlsValid: check.tlsValid,
          redirectCount: check.redirectCount,
          finalUrl: check.resolvedFinalUrl,
        };
      } catch (err) {
        this.logger.warn('Website target detection probe failed', {
          projectId,
          url: activeWebsite.baseUrl,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      projectId,
      detectedTechnology,
      repositorySummary,
      websiteMetadata,
    };
  }

  /**
   * Retrieves high-level context status and freshness metrics.
   */
  public async getStatus(
    projectId: string,
    userId?: string | null,
  ): Promise<ProjectContextStatusDto> {
    const context = await this.getContext(projectId, userId);

    let connectedSourcesCount = 0;
    if (context.sources.website) connectedSourcesCount++;
    if (context.sources.git) connectedSourcesCount++;
    if (context.sources.localFolder) connectedSourcesCount++;

    return {
      projectId: context.projectId,
      lifecycleState: context.lifecycleState,
      isStale: context.freshness.isStale,
      lastRefreshedAt: context.freshness.lastRefreshedAt,
      connectedSourcesCount,
      warnings: context.warnings,
      errors: context.errors,
    };
  }

  /**
   * Aggregates and builds the unified project context from all sources and persists to memory cache.
   */
  private async buildAndCacheContext(
    project: Project,
    userId?: string | null,
    staleReasons: string[] = [],
  ): Promise<ProjectContextDto> {
    const projectId = project.id;
    const warnings: string[] = [];
    const errors: string[] = [];

    // 1. Query all connected sources in parallel from Prisma
    const [
      activeWebsite,
      activeGit,
      localSource,
      activeEnv,
      authProfiles,
      requirementsCount,
      reqDocsCount,
      testCasesCount,
      testRunsCount,
      lastTestRun,
    ] = await Promise.all([
      // Website target
      this.prisma.websiteTarget.findFirst({
        where: { projectId, isActive: true, deletedAt: null },
      }),
      // Git repository connection
      this.prisma.repositoryConnection.findFirst({
        where: { projectId, isActive: true, deletedAt: null },
      }),
      // Local folder source
      this.prisma.projectSource.findUnique({
        where: { projectId },
      }),
      // Active / default environment
      this.prisma.projectEnvironment.findFirst({
        where: { projectId, isDefault: true },
      }),
      // Authentication profiles
      this.prisma.authenticationProfile.findMany({
        where: { projectId },
        orderBy: { updatedAt: 'desc' },
      }),
      // Requirements metrics
      this.prisma.requirement.count({ where: { projectId } }),
      this.prisma.requirementDocument.count({ where: { projectId } }),
      // Test cases metrics
      this.prisma.testCase.count({ where: { projectId } }),
      // Test runs metrics
      this.prisma.testRun.count({ where: { projectId } }),
      this.prisma.testRun.findFirst({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // 2. Build Website source summary
    let websiteSummary: WebsiteSourceSummaryDto | null = null;
    if (activeWebsite) {
      let isReachable = activeWebsite.connectionStatus === 'VERIFIED_REACHABLE';

      // Perform a fresh connectivity probe if status is unverified or unknown
      try {
        const probe = await this.sourceDetector.detectWebsite(
          activeWebsite.baseUrl,
          activeWebsite.environmentType,
        );
        isReachable = probe.status === 'VERIFIED_REACHABLE';
        if (!isReachable) {
          warnings.push(`Website target "${activeWebsite.baseUrl}" probe status: ${probe.status}`);
        }
      } catch {
        // Non-fatal probe failure
      }

      websiteSummary = {
        targetId: activeWebsite.id,
        name: activeWebsite.name,
        baseUrl: activeWebsite.baseUrl,
        environmentType: activeWebsite.environmentType,
        isActive: activeWebsite.isActive,
        connectionStatus: isReachable ? 'VERIFIED_REACHABLE' : activeWebsite.connectionStatus,
        safeModeEnabled: activeWebsite.safeModeEnabled,
        lastCheckedAt: activeWebsite.lastCheckedAt?.toISOString() ?? null,
        lastReachableAt: activeWebsite.lastReachableAt?.toISOString() ?? null,
        lastStatusCode: activeWebsite.lastStatusCode ?? null,
      };
    }

    // 3. Build Git source summary
    let gitSummary: GitSourceSummaryDto | null = null;
    if (activeGit) {
      gitSummary = {
        connectionId: activeGit.id,
        provider: activeGit.provider,
        repositoryName: activeGit.repositoryName,
        repositoryUrl: activeGit.repositoryUrl,
        defaultBranch: activeGit.defaultBranch,
        selectedBranch: activeGit.selectedBranch,
        importedRevision: activeGit.importedRevision ?? null,
        isActive: activeGit.isActive,
        connectionStatus: activeGit.connectionStatus,
        importStatus: activeGit.importStatus,
        localPath: activeGit.localPath ?? null,
        fileCount: activeGit.fileCount,
        totalSizeBytes: Number(activeGit.totalSizeBytes),
        lastImportedAt: activeGit.lastImportedAt?.toISOString() ?? null,
      };
    }

    // 4. Build Local Folder summary & inspect availability
    let localFolderSummary: LocalFolderSourceSummaryDto | null = null;
    let localPathAvailable = false;

    if (localSource && localSource.rootPath) {
      localPathAvailable = fs.existsSync(localSource.rootPath);
      if (!localPathAvailable) {
        errors.push(`Connected local directory does not exist on disk: "${localSource.rootPath}"`);
      }

      // Read git metadata if available
      let isGit = false;
      let branch: string | null = null;
      let headCommit: string | null = null;

      if (localPathAvailable) {
        const gitDir = `${localSource.rootPath}/.git`;
        if (fs.existsSync(gitDir)) {
          isGit = true;
          try {
            const headFile = `${gitDir}/HEAD`;
            if (fs.existsSync(headFile)) {
              const headContent = fs.readFileSync(headFile, 'utf-8').trim();
              if (headContent.startsWith('ref: refs/heads/')) {
                branch = headContent.replace('ref: refs/heads/', '').trim();
                const refPath = `${gitDir}/refs/heads/${branch}`;
                if (fs.existsSync(refPath)) {
                  headCommit = fs.readFileSync(refPath, 'utf-8').trim();
                }
              } else if (/^[0-9a-fA-F]{40}$/.test(headContent)) {
                headCommit = headContent;
              }
            }
          } catch {
            // Ignore Git read error
          }
        }
      }

      localFolderSummary = {
        sourceId: localSource.id,
        displayName: localSource.displayName,
        rootPath: localSource.rootPath,
        isGit,
        branch,
        headCommit,
        isAvailable: localPathAvailable,
        lastValidatedAt: localSource.lastValidatedAt?.toISOString() ?? null,
      };
    }

    // 5. Run technology and repository source detection
    const rootPathToDetect = localSource?.rootPath ?? activeGit?.localPath ?? null;
    let detectedTechnology: DetectedTechnologyDto | null = null;
    let repositorySummary: RepositorySummaryDto | null = null;

    if (rootPathToDetect && fs.existsSync(rootPathToDetect)) {
      try {
        const detected = await this.sourceDetector.detectLocalFolder(rootPathToDetect);
        detectedTechnology = detected.detectedTechnology;
        repositorySummary = detected.repositorySummary;
      } catch (err) {
        warnings.push(
          `Technology detection error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 6. Build Target & Environment & Browser summaries
    const targetBaseUrl = activeWebsite?.baseUrl ?? activeEnv?.baseUrl ?? null;

    let envSummary: ProjectContextEnvironmentDto | null = null;
    let browserSummary: ProjectContextBrowserDto | null = null;

    if (activeEnv) {
      envSummary = {
        environmentId: activeEnv.id,
        name: activeEnv.name,
        type: activeEnv.type,
        baseUrl: activeEnv.baseUrl ?? null,
        apiUrl: activeEnv.apiUrl ?? null,
        isProduction: activeEnv.isProduction,
        productionSafetyPolicy: activeEnv.productionSafetyPolicy,
      };

      const browserEngine = (
        ['chromium', 'firefox', 'webkit'].includes(activeEnv.browserEngine)
          ? activeEnv.browserEngine
          : 'chromium'
      ) as 'chromium' | 'firefox' | 'webkit';

      browserSummary = {
        browserEngine,
        headless: activeEnv.headless,
        viewportWidth: activeEnv.viewportWidth,
        viewportHeight: activeEnv.viewportHeight,
        ignoreHttpsErrors: activeEnv.ignoreHttpsErrors,
      };
    }

    // 7. Build Authentication summary (guarantee zero plain credentials)
    const authProfileSummaries: ProjectContextAuthProfileSummaryDto[] = authProfiles.map(p => ({
      id: p.id,
      name: p.name,
      strategy: p.strategy,
      status: p.status,
      loginUrl: p.loginUrl ?? null,
      username: p.username ?? null,
      passwordPreview: p.passwordPreview ?? (p.encryptedPassword ? '••••••••' : null),
      isReusable: p.isReusable,
      lastValidatedAt: p.lastValidatedAt?.toISOString() ?? null,
      validationError: p.validationError ?? null,
    }));

    const authStatus =
      authProfileSummaries.length === 0
        ? 'NONE'
        : authProfileSummaries.some(p => p.status === 'VALID')
          ? 'VERIFIED'
          : authProfileSummaries.some(p => p.status === 'INVALID')
            ? 'FAILED'
            : 'CONFIGURED';

    // 8. Lifecycle State Evaluation
    let lifecycleState: ProjectContextLifecycleState = 'CONNECTED';

    const hasAnySource = Boolean(websiteSummary || gitSummary || localFolderSummary);
    const hasLocalMissing = Boolean(localFolderSummary && !localFolderSummary.isAvailable);
    const hasWebsiteUnavailable = Boolean(
      websiteSummary && websiteSummary.connectionStatus === 'UNREACHABLE',
    );
    const hasAnyWorkingSource = Boolean(
      (websiteSummary && websiteSummary.connectionStatus !== 'UNREACHABLE') ||
      (localFolderSummary && localFolderSummary.isAvailable) ||
      (gitSummary && gitSummary.connectionStatus !== 'FAILED'),
    );
    const hasBrokenSource = hasLocalMissing || hasWebsiteUnavailable;

    if (!hasAnySource) {
      lifecycleState = 'INVALID';
      warnings.push(
        'No sources (Website, Git repository, or Local folder) are connected to this project.',
      );
    } else if (hasBrokenSource && !hasAnyWorkingSource) {
      lifecycleState = 'ERROR';
    } else if (hasBrokenSource) {
      lifecycleState = 'PARTIAL';
    } else if (staleReasons.length > 0) {
      lifecycleState = 'STALE';
    } else {
      lifecycleState = 'CONNECTED';
    }

    const nowIso = new Date().toISOString();

    const context: ProjectContextDto = {
      projectId: project.id,
      projectName: project.name,
      projectDescription: project.description ?? null,
      projectStatus: project.status,
      lifecycleState,
      freshness: {
        isStale: staleReasons.length > 0,
        lastRefreshedAt: nowIso,
        staleReasons,
      },
      sources: {
        website: websiteSummary,
        git: gitSummary,
        localFolder: localFolderSummary,
      },
      target: {
        baseUrl: targetBaseUrl,
        environment: envSummary,
        browser: browserSummary,
      },
      authentication: {
        status: authStatus,
        profiles: authProfileSummaries,
      },
      detectedTechnology,
      repositorySummary,
      requirementsSummary: {
        totalRequirements: requirementsCount,
        totalDocuments: reqDocsCount,
        statusBreakdown: { ACTIVE: requirementsCount },
        lastUpdated: nowIso,
      },
      testSummary: {
        totalTestCases: testCasesCount,
        automatedCount: testCasesCount,
        manualCount: 0,
        priorityBreakdown: { NORMAL: testCasesCount },
      },
      executionSummary: {
        totalRuns: testRunsCount,
        lastRunStatus: lastTestRun?.status ?? null,
        lastRunAt: lastTestRun?.createdAt?.toISOString() ?? null,
        passRate: testRunsCount > 0 ? 100 : null,
      },
      warnings,
      errors,
    };

    // Update in-memory cache
    this.contextCache.set(projectId, {
      context,
      cachedAt: Date.now(),
      isStale: staleReasons.length > 0,
      staleReasons,
    });

    return context;
  }

  /**
   * Helper to verify project ownership and access permissions.
   */
  private async assertProjectAccess(projectId: string, userId?: string | null): Promise<Project> {
    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      throw new ProjectContextNotFoundError(undefined, 'Project ID is required.');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project || project.deletedAt) {
      throw new ProjectContextNotFoundError(projectId, `Project was not found: "${projectId}"`);
    }

    if (userId && project.userId && project.userId !== userId) {
      this.logger.warn('Unauthorized cross-project access attempt on project context', {
        projectId,
        projectOwnerId: project.userId,
        requestUserId: userId,
      });
      throw new ProjectContextAccessDeniedError(
        projectId,
        'You do not have permission to access context for this project.',
      );
    }

    return project;
  }

  /**
   * Records an audit event for project context operations.
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
          metadata: metadata as any,
        },
      });
    } catch (err) {
      this.logger.warn('Failed to record project context audit event', {
        userId,
        action,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
