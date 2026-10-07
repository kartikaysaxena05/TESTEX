/**
 * @file packages/core/src/project-context/context-assembler.ts
 * Controlled context assembly layer providing customized, provenance-preserving
 * representations of the unified project context for downstream consumers:
 * - V1–V7 QA Engine
 * - V8 Desktop Application
 * - V9 AI Runtime (AiProjectContextDto)
 * - V10 Autonomous Agent
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. Zero secret leakage: passwords, API keys, and encrypted credentials are excluded.
 * 2. Strict provenance preservation: origin source IDs and paths are retained.
 * 3. Principle of least privilege: consumers receive only the information required for their role.
 */

import type { ProjectContextDto, AiProjectContextDto } from '@ai-quality/contracts';

export interface QaEngineProjectContextDto {
  readonly projectId: string;
  readonly projectName: string;
  readonly targetUrl: string | null;
  readonly environment: {
    readonly id?: string;
    readonly name?: string;
    readonly type?: string;
    readonly isProduction: boolean;
    readonly safetyPolicy?: string;
  } | null;
  readonly browser: {
    readonly engine: string;
    readonly headless: boolean;
    readonly viewportWidth: number;
    readonly viewportHeight: number;
    readonly ignoreHttpsErrors: boolean;
  };
  readonly authentication: {
    readonly isConfigured: boolean;
    readonly activeProfileName?: string;
    readonly strategy?: string;
    readonly username?: string | null;
  };
  readonly totalRequirements: number;
  readonly totalTestCases: number;
}

export interface DesktopProjectContextViewModel {
  readonly projectId: string;
  readonly projectName: string;
  readonly lifecycleState: string;
  readonly isStale: boolean;
  readonly lastRefreshedAt: string;
  readonly staleReasons: readonly string[];
  readonly connectedSourcesCount: number;
  readonly sourcesSummary: {
    readonly hasWebsite: boolean;
    readonly websiteUrl?: string;
    readonly websiteStatus?: string;
    readonly hasGit: boolean;
    readonly gitRepoName?: string;
    readonly gitBranch?: string;
    readonly hasLocalFolder: boolean;
    readonly localFolderPath?: string;
  };
  readonly targetSummary: {
    readonly baseUrl?: string;
    readonly environmentName?: string;
    readonly browserEngine?: string;
  };
  readonly technologySummary: {
    readonly primaryLanguage?: string;
    readonly frameworks: readonly string[];
    readonly testFramework?: string;
  };
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

export interface V10AgentProjectContextDto {
  readonly projectId: string;
  readonly workspaceRoot: string | null;
  readonly isGitRepo: boolean;
  readonly branch?: string | null;
  readonly primaryLanguage?: string | null;
  readonly frameworks: readonly string[];
  readonly packageManager?: string | null;
  readonly testFramework?: string | null;
  readonly entryPoints: readonly string[];
  readonly configurationFiles: readonly string[];
  readonly testDirectories: readonly string[];
  readonly targetUrl?: string | null;
  readonly safeModeEnabled: boolean;
}

export class ContextAssembler {
  /**
   * Assembles context payload tailored for the V1–V7 Test Execution & QA Engine.
   */
  public static assembleQaEngineContext(context: ProjectContextDto): QaEngineProjectContextDto {
    const targetUrl = context.target.baseUrl ?? context.sources.website?.baseUrl ?? null;

    const browser = context.target.browser ?? {
      browserEngine: 'chromium',
      headless: true,
      viewportWidth: 1280,
      viewportHeight: 720,
      ignoreHttpsErrors: false,
    };

    const firstActiveAuth = context.authentication.profiles[0];

    return {
      projectId: context.projectId,
      projectName: context.projectName,
      targetUrl,
      environment: context.target.environment
        ? {
            id: context.target.environment.environmentId,
            name: context.target.environment.name,
            type: context.target.environment.type,
            isProduction: context.target.environment.isProduction,
            safetyPolicy: context.target.environment.productionSafetyPolicy,
          }
        : null,
      browser: {
        engine: browser.browserEngine,
        headless: browser.headless,
        viewportWidth: browser.viewportWidth,
        viewportHeight: browser.viewportHeight,
        ignoreHttpsErrors: browser.ignoreHttpsErrors,
      },
      authentication: {
        isConfigured: context.authentication.profiles.length > 0,
        activeProfileName: firstActiveAuth?.name,
        strategy: firstActiveAuth?.strategy,
        username: firstActiveAuth?.username,
      },
      totalRequirements: context.requirementsSummary?.totalRequirements ?? 0,
      totalTestCases: context.testSummary?.totalTestCases ?? 0,
    };
  }

  /**
   * Assembles context presentation view-model for the V8 Desktop Shell UI.
   */
  public static assembleDesktopContext(context: ProjectContextDto): DesktopProjectContextViewModel {
    let connectedSourcesCount = 0;
    if (context.sources.website) connectedSourcesCount++;
    if (context.sources.git) connectedSourcesCount++;
    if (context.sources.localFolder) connectedSourcesCount++;

    return {
      projectId: context.projectId,
      projectName: context.projectName,
      lifecycleState: context.lifecycleState,
      isStale: context.freshness.isStale,
      lastRefreshedAt: context.freshness.lastRefreshedAt,
      staleReasons: context.freshness.staleReasons,
      connectedSourcesCount,
      sourcesSummary: {
        hasWebsite: Boolean(context.sources.website),
        websiteUrl: context.sources.website?.baseUrl,
        websiteStatus: context.sources.website?.connectionStatus,
        hasGit: Boolean(context.sources.git),
        gitRepoName: context.sources.git?.repositoryName,
        gitBranch: context.sources.git?.selectedBranch,
        hasLocalFolder: Boolean(context.sources.localFolder),
        localFolderPath: context.sources.localFolder?.rootPath,
      },
      targetSummary: {
        baseUrl: context.target.baseUrl ?? undefined,
        environmentName: context.target.environment?.name,
        browserEngine: context.target.browser?.browserEngine,
      },
      technologySummary: {
        primaryLanguage: context.detectedTechnology?.primaryLanguage ?? undefined,
        frameworks: context.detectedTechnology?.frameworks ?? [],
        testFramework: context.detectedTechnology?.testFramework ?? undefined,
      },
      warnings: context.warnings,
      errors: context.errors,
    };
  }

  /**
   * Assembles standardized AiProjectContextDto for consumption by the V9 AI Runtime.
   */
  public static assembleV9AiContext(context: ProjectContextDto): AiProjectContextDto {
    const tech = context.detectedTechnology;
    const repo = context.repositorySummary;
    const target = context.target;
    const reqs = context.requirementsSummary;
    const tests = context.testSummary;

    // 1. Build repository info string
    const repoLines: string[] = [];
    if (tech?.primaryLanguage) {
      repoLines.push(`Primary Language: ${tech.primaryLanguage}`);
    }
    if (tech?.languages && tech.languages.length > 0) {
      repoLines.push(`Detected Languages: ${tech.languages.join(', ')}`);
    }
    if (tech?.frameworks && tech.frameworks.length > 0) {
      repoLines.push(`Frameworks: ${tech.frameworks.join(', ')}`);
    }
    if (tech?.packageManager) {
      repoLines.push(`Package Manager: ${tech.packageManager}`);
    }
    if (tech?.testFramework) {
      repoLines.push(`Test Framework: ${tech.testFramework}`);
    }
    if (tech?.likelyEntryPoints && tech.likelyEntryPoints.length > 0) {
      repoLines.push(`Application Entry Points: ${tech.likelyEntryPoints.join(', ')}`);
    }
    if (tech?.testDirectories && tech.testDirectories.length > 0) {
      repoLines.push(`Test Directories: ${tech.testDirectories.join(', ')}`);
    }
    if (tech?.configurationFiles && tech.configurationFiles.length > 0) {
      repoLines.push(`Configuration Files: ${tech.configurationFiles.join(', ')}`);
    }
    if (repo) {
      repoLines.push(
        `Repository Scope: ${repo.fileCount} files, ${(repo.totalSizeBytes / 1024).toFixed(1)} KB${
          repo.branch ? `, branch: ${repo.branch}` : ''
        }`,
      );
    }
    const repositoryInfo = repoLines.length > 0 ? repoLines.join('\n') : null;

    // 2. Build requirements string
    let requirements: string | null = null;
    if (reqs) {
      const breakdown = Object.entries(reqs.statusBreakdown)
        .map(([status, count]) => `${status}: ${count}`)
        .join(', ');
      requirements = `Total Requirements: ${reqs.totalRequirements} across ${reqs.totalDocuments} document(s). Breakdown: [${breakdown}].`;
    }

    // 3. Build test info string
    let testInfo: string | null = null;
    if (tests) {
      testInfo = `Test Cases: ${tests.totalTestCases} total (${tests.automatedCount} automated, ${tests.manualCount} manual).`;
    }

    // 4. Build target info string
    const targetLines: string[] = [];
    if (target.baseUrl) {
      targetLines.push(`Base URL: ${target.baseUrl}`);
    }
    if (target.environment) {
      targetLines.push(
        `Environment: ${target.environment.name} (${target.environment.type}${
          target.environment.isProduction ? ', PRODUCTION' : ''
        })`,
      );
    }
    if (target.browser) {
      targetLines.push(
        `Browser: ${target.browser.browserEngine} (${target.browser.viewportWidth}x${target.browser.viewportHeight}, ${
          target.browser.headless ? 'headless' : 'headed'
        })`,
      );
    }
    const targetInfo = targetLines.length > 0 ? targetLines.join('\n') : null;

    // 5. Relevant metadata (safe JSON without secrets)
    const relevantMetadata: Record<string, unknown> = {
      projectId: context.projectId,
      projectName: context.projectName,
      lifecycleState: context.lifecycleState,
      isStale: context.freshness.isStale,
      lastRefreshedAt: context.freshness.lastRefreshedAt,
      hasWebsiteSource: Boolean(context.sources.website),
      hasGitSource: Boolean(context.sources.git),
      hasLocalFolderSource: Boolean(context.sources.localFolder),
    };

    return {
      repositoryInfo,
      requirements,
      testInfo,
      targetInfo,
      relevantMetadata,
    };
  }

  /**
   * Assembles execution and workspace context for the V10 Autonomous Agent.
   */
  public static assembleV10AgentContext(context: ProjectContextDto): V10AgentProjectContextDto {
    const localFolder = context.sources.localFolder;
    const git = context.sources.git;
    const tech = context.detectedTechnology;

    return {
      projectId: context.projectId,
      workspaceRoot: localFolder?.rootPath ?? git?.localPath ?? null,
      isGitRepo: localFolder?.isGit ?? Boolean(git),
      branch: localFolder?.branch ?? git?.selectedBranch ?? null,
      primaryLanguage: tech?.primaryLanguage ?? null,
      frameworks: tech?.frameworks ?? [],
      packageManager: tech?.packageManager ?? null,
      testFramework: tech?.testFramework ?? null,
      entryPoints: tech?.likelyEntryPoints ?? [],
      configurationFiles: tech?.configurationFiles ?? [],
      testDirectories: tech?.testDirectories ?? [],
      targetUrl: context.target.baseUrl ?? null,
      safeModeEnabled: context.sources.website?.safeModeEnabled ?? true,
    };
  }
}
