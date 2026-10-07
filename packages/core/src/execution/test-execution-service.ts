/**
 * @file packages/core/src/execution/test-execution-service.ts
 * Main execution domain service orchestrating browser lifecycle, eligibility validation, and smoke verification.
 */

import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  executionRequestSchema,
  runtimeSmokeInputSchema,
  type ExecutionCapabilitiesDto,
  type ExecutionRequestDto,
  type RuntimeSmokeInputDto,
  type RuntimeSmokeResultDto,
  type TestEligibilityDto,
  type ValidateTestEligibilityInputDto,
} from '@ai-quality/contracts';
import {
  type IBrowserRuntimeProvider,
  type IExecutionContext,
  type TestExecutionServiceDependencies,
} from './execution-types.js';
import { PlaywrightBrowserProvider } from './browser-provider.js';
import { ExecutionRuntimeRegistry } from './runtime-registry.js';
import { TestEligibilityValidator } from './test-eligibility-validator.js';
import {
  ExecutionRequestInvalidError,
  ExecutionTestNotApprovedError,
  ExecutionTestNotExecutableError,
  ExecutionTestRejectedError,
  ExecutionTestStaleError,
} from './execution-errors.js';
import type { ILogger } from '../logging/index.js';

export class TestExecutionService {
  private readonly prisma: PrismaClient;
  private readonly logger?: ILogger;
  private readonly browserProvider: IBrowserRuntimeProvider;
  private readonly runtimeRegistry: ExecutionRuntimeRegistry;
  private readonly eligibilityValidator: TestEligibilityValidator;

  constructor(deps: TestExecutionServiceDependencies) {
    this.prisma = deps.prisma;
    this.logger = deps.logger;
    this.browserProvider = deps.browserProvider ?? new PlaywrightBrowserProvider(deps.logger);
    this.runtimeRegistry = deps.runtimeRegistry ?? new ExecutionRuntimeRegistry(deps.logger);
    this.eligibilityValidator = new TestEligibilityValidator(deps.prisma, deps.logger);
  }

  /**
   * Retrieves current execution platform capabilities.
   */
  public async getCapabilities(): Promise<ExecutionCapabilitiesDto> {
    const baseCapabilities = await this.browserProvider.getCapabilities();
    return {
      ...baseCapabilities,
      activeExecutionsCount: this.runtimeRegistry.getActiveCount(),
    };
  }

  /**
   * Validates test eligibility against V4 lifecycle and staleness criteria.
   */
  public async validateTestEligibility(
    input: ValidateTestEligibilityInputDto,
  ): Promise<TestEligibilityDto> {
    return await this.eligibilityValidator.validateEligibility(input);
  }

  /**
   * Executes a safe, deterministic, zero-network Playwright runtime smoke test.
   */
  public async runRuntimeSmoke(input?: RuntimeSmokeInputDto): Promise<RuntimeSmokeResultDto> {
    const validated = runtimeSmokeInputSchema.safeParse(input ?? {});
    if (!validated.success) {
      throw new ExecutionRequestInvalidError('Invalid runtime smoke parameters', {
        errors: validated.error.errors,
      });
    }

    const { browserEngine, headless, timeoutMs } = validated.data;
    const executionId = crypto.randomUUID();

    this.logger?.info('execution.smoke_started', {
      executionId,
      browserEngine,
      headless,
      timeoutMs,
    });

    const tStart = performance.now();
    let browser: import('playwright').Browser | null = null;
    let context: import('playwright').BrowserContext | null = null;
    let page: import('playwright').Page | null = null;

    let launchMs = 0;
    let contextMs = 0;
    let pageMs = 0;
    let navigationMs = 0;
    let cleanupMs = 0;
    let pageTitle = '';
    let verifiedText = '';
    let browserVersion = 'unknown';

    try {
      // 1. Launch Browser
      const t0 = performance.now();
      browser = await this.browserProvider.launch({
        engine: browserEngine,
        headless,
        timeoutMs,
      });
      launchMs = Math.round(performance.now() - t0);
      browserVersion = browser.version();

      // 2. Create Isolated Context
      const t1 = performance.now();
      context = await this.browserProvider.createContext(browser);
      contextMs = Math.round(performance.now() - t1);

      // 3. Create Page
      const t2 = performance.now();
      page = await this.browserProvider.createPage(context);
      pageMs = Math.round(performance.now() - t2);

      // Register temporary execution context in registry for tracking
      const tempContext: IExecutionContext = {
        executionId,
        browserEngine,
        headless,
        createdAt: new Date(),
        browser,
        context,
        page,
        close: async () => {
          if (page) await page.close().catch(() => {});
          if (context) await context.close().catch(() => {});
          if (browser) await browser.close().catch(() => {});
        },
      };
      this.runtimeRegistry.register(tempContext);

      // 4. Deterministic Local Fixture Navigation
      const t3 = performance.now();
      const localFixtureHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>V5 Playwright Runtime Smoke</title>
  </head>
  <body style="font-family: sans-serif; padding: 20px;">
    <h1 id="headline">Playwright Runtime Active</h1>
    <button id="smoke-status-button" type="button">READY</button>
  </body>
</html>`;

      await page.setContent(localFixtureHtml, { waitUntil: 'load', timeout: timeoutMs });
      pageTitle = await page.title();
      const button = page.locator('#smoke-status-button');
      verifiedText = (await button.textContent())?.trim() ?? '';
      navigationMs = Math.round(performance.now() - t3);

      this.logger?.info('execution.smoke_passed', {
        executionId,
        pageTitle,
        verifiedText,
        timings: { launchMs, contextMs, pageMs, navigationMs },
      });
    } finally {
      // 5. Guaranteed Resource Teardown
      const tClean = performance.now();
      await this.runtimeRegistry.cleanup(executionId);
      cleanupMs = Math.round(performance.now() - tClean);
    }

    const totalMs = Math.round(performance.now() - tStart);

    return {
      executionId,
      browserEngine,
      browserVersion,
      headless,
      launchSuccess: true,
      contextSuccess: true,
      pageSuccess: true,
      navigationSuccess: true,
      cleanupSuccess: true,
      timings: {
        launchMs,
        contextMs,
        pageMs,
        navigationMs,
        cleanupMs,
        totalMs,
      },
      pageTitle,
      verifiedText,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Prepares a controlled browser execution context for an approved V4 test case.
   */
  public async prepareExecution(request: ExecutionRequestDto): Promise<IExecutionContext> {
    const validated = executionRequestSchema.safeParse(request);
    if (!validated.success) {
      throw new ExecutionRequestInvalidError('Invalid execution request parameters', {
        errors: validated.error.errors,
      });
    }

    const { projectId, testCaseId, browserEngine, headless, timeoutMs, testCaseVersionNumber } =
      validated.data;

    // Validate V4 Test Governance & Eligibility
    const eligibility = await this.eligibilityValidator.validateEligibility({
      projectId,
      testCaseId,
      versionNumber: testCaseVersionNumber,
    });

    if (!eligibility.isEligible) {
      switch (eligibility.status) {
        case 'NOT_APPROVED':
          throw new ExecutionTestNotApprovedError(testCaseId, eligibility.reviewStatus);
        case 'STALE':
          throw new ExecutionTestStaleError(
            testCaseId,
            eligibility.sourceRequirementVersionNumber ?? 1,
            eligibility.currentRequirementVersionNumber ?? 1,
          );
        case 'REJECTED':
          throw new ExecutionTestRejectedError(testCaseId, eligibility.reasons.join(', '));
        default:
          throw new ExecutionTestNotExecutableError(testCaseId, eligibility.reasons.join(', '));
      }
    }

    const executionId = crypto.randomUUID();
    const abortController = new AbortController();

    this.logger?.info('execution.preparation_started', {
      executionId,
      projectId,
      testCaseId,
      browserEngine,
    });

    const browser = await this.browserProvider.launch({
      engine: browserEngine,
      headless,
      timeoutMs,
    });

    const context = await this.browserProvider.createContext(browser);
    const page = await this.browserProvider.createPage(context);

    const executionContext: IExecutionContext = {
      executionId,
      projectId,
      testCaseId,
      testCaseVersionNumber: testCaseVersionNumber ?? eligibility.currentVersionNumber,
      browserEngine,
      headless,
      createdAt: new Date(),
      browser,
      context,
      page,
      abortController,
      close: async () => {
        if (page) await page.close().catch(() => {});
        if (context) await context.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
      },
    };

    this.runtimeRegistry.register(executionContext);

    return executionContext;
  }

  /**
   * Cleans up an active execution context by ID.
   */
  public async cleanup(executionId: string): Promise<void> {
    await this.runtimeRegistry.cleanup(executionId);
  }

  /**
   * Cleans up all active execution contexts.
   */
  public async cleanupAll(): Promise<void> {
    await this.runtimeRegistry.cleanupAll();
  }
}
