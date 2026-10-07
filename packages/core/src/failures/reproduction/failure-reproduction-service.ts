/**
 * @file packages/core/src/failures/reproduction/failure-reproduction-service.ts
 * Central domain service orchestrating controlled failure reproduction, environment reconstruction,
 * historical test version resolution, V5 engine execution, and reproducibility verification (V6 Phase 76).
 */

import crypto from 'node:crypto';
import type { PrismaClient, FailureCase, TestCaseExecution } from '@prisma/client';
import {
  type IFailureReproductionService,
  type FailureReproductionAttemptDto,
  type ReproducibilitySummaryDto,
  type ExecuteReproductionInputDto,
  type GetReproductionAttemptsInputDto,
  type GetReproducibilitySummaryInputDto,
  type CancelReproductionInputDto,
  type FailureReproductionOutcome,
  FAILURE_REPRODUCTION_BOUNDS,
} from './failure-reproduction-types.js';
import {
  executeReproductionInputSchema,
  getReproductionAttemptsInputSchema,
  getReproducibilitySummaryInputSchema,
  cancelReproductionInputSchema,
} from '@ai-quality/contracts';
import { FailureCaseNotFoundError, CrossProjectAccessDeniedError } from '../failure-errors.js';
import {
  ReproductionAlreadyInProgressError,
  ReproductionAttemptLimitExceededError,
  ReproductionEnvironmentIncompatibleError,
} from './failure-reproduction-errors.js';
import { EnvironmentReconstructor } from './environment-reconstructor.js';
import { HistoricalTestResolver } from './historical-test-resolver.js';
import { ReproductionComparator } from './reproduction-comparator.js';
import { FailureSignatureGenerator } from '../evidence/failure-signature-generator.js';
import { PlaywrightBrowserProvider } from '../../execution/browser-provider.js';
import { ExecutionPersistenceService } from '../../execution/persistence/execution-persistence-service.js';
import { FailureEvidenceIngestionService } from '../evidence/failure-evidence-ingestion-service.js';
import type { ILogger } from '../../logging/index.js';

export interface FailureReproductionServiceDependencies {
  readonly prisma: PrismaClient;
  readonly browserProvider?: PlaywrightBrowserProvider;
  readonly persistenceService?: ExecutionPersistenceService;
  readonly evidenceIngestionService?: FailureEvidenceIngestionService;
  readonly environmentReconstructor?: EnvironmentReconstructor;
  readonly historicalTestResolver?: HistoricalTestResolver;
  readonly reproductionComparator?: ReproductionComparator;
  readonly signatureGenerator?: FailureSignatureGenerator;
  readonly logger?: ILogger;
}

export class FailureReproductionService implements IFailureReproductionService {
  private readonly prisma: PrismaClient;
  private readonly browserProvider: PlaywrightBrowserProvider;
  private readonly persistenceService: ExecutionPersistenceService;
  private readonly evidenceIngestionService: FailureEvidenceIngestionService;
  private readonly envReconstructor: EnvironmentReconstructor;
  private readonly testResolver: HistoricalTestResolver;
  private readonly comparator: ReproductionComparator;
  private readonly signatureGenerator: FailureSignatureGenerator;
  private readonly logger?: ILogger;

  // Concurrency tracking and cancellation tokens
  private readonly activeReproductionCases: Set<string> = new Set();
  private readonly activeControllers: Map<string, AbortController> = new Map();

  constructor(deps: FailureReproductionServiceDependencies) {
    this.prisma = deps.prisma;
    this.logger = deps.logger;
    this.browserProvider = deps.browserProvider ?? new PlaywrightBrowserProvider(deps.logger);
    this.persistenceService =
      deps.persistenceService ??
      new ExecutionPersistenceService({ prisma: deps.prisma, logger: deps.logger });
    this.evidenceIngestionService =
      deps.evidenceIngestionService ??
      new FailureEvidenceIngestionService({ prisma: deps.prisma, logger: deps.logger });
    this.envReconstructor = deps.environmentReconstructor ?? new EnvironmentReconstructor();
    this.testResolver = deps.historicalTestResolver ?? new HistoricalTestResolver(deps.prisma);
    this.comparator = deps.reproductionComparator ?? new ReproductionComparator();
    this.signatureGenerator = deps.signatureGenerator ?? new FailureSignatureGenerator();
  }

  /**
   * Executes controlled reproduction of a historical failure.
   */
  public async executeReproduction(
    input: ExecuteReproductionInputDto,
  ): Promise<ReproducibilitySummaryDto> {
    const data = executeReproductionInputSchema.parse(input);

    if (data.maxAttempts > FAILURE_REPRODUCTION_BOUNDS.MAX_ATTEMPTS) {
      throw new ReproductionAttemptLimitExceededError(
        data.maxAttempts,
        FAILURE_REPRODUCTION_BOUNDS.MAX_ATTEMPTS,
      );
    }

    // 1. Concurrency Protection
    if (this.activeReproductionCases.has(data.failureCaseId)) {
      throw new ReproductionAlreadyInProgressError(data.failureCaseId);
    }

    this.activeReproductionCases.add(data.failureCaseId);
    const abortController = new AbortController();
    this.activeControllers.set(data.failureCaseId, abortController);

    try {
      // 2. Multi-Tenant Project and FailureCase Validation
      const failureCase = (await (this.prisma.failureCase.findFirst
        ? this.prisma.failureCase.findFirst({
            where: { id: data.failureCaseId, projectId: data.projectId },
            include: {
              testCase: true,
              testRun: {
                include: {
                  environment: true,
                },
              },
              execution: {
                include: {
                  stepExecutions: { orderBy: { stepIndex: 'asc' } },
                  assertionExecutionRecords: true,
                },
              },
            },
          })
        : this.prisma.failureCase.findUnique({
            where: { id: data.failureCaseId },
            include: {
              testCase: true,
              testRun: {
                include: {
                  environment: true,
                },
              },
              execution: {
                include: {
                  stepExecutions: { orderBy: { stepIndex: 'asc' } },
                  assertionExecutionRecords: true,
                },
              },
            },
          }))) as any;

      if (!failureCase || failureCase.projectId !== data.projectId) {
        throw new FailureCaseNotFoundError(data.failureCaseId, data.projectId);
      }

      let originalExecution = failureCase.execution;
      if (!originalExecution && (this.prisma as any).testCaseExecution?.findFirst) {
        originalExecution = await (this.prisma as any).testCaseExecution.findFirst({
          where: { id: failureCase.executionId },
          include: {
            stepExecutions: { orderBy: { stepIndex: 'asc' } },
            assertionExecutionRecords: true,
          },
        });
      }

      if (!originalExecution || originalExecution.projectId !== data.projectId) {
        throw new CrossProjectAccessDeniedError(
          'TestCaseExecution',
          originalExecution?.id ?? 'UNKNOWN',
          data.projectId,
          originalExecution?.projectId ?? 'UNKNOWN',
        );
      }

      // 3. Resolve Target Environment & Reconstruction
      const historicalEnv =
        this.envReconstructor.reconstructHistoricalEnvironment(originalExecution);

      let targetEnv: any = null;
      if (data.targetEnvironmentId) {
        targetEnv = await (this.prisma.projectEnvironment.findFirst
          ? this.prisma.projectEnvironment.findFirst({
              where: { id: data.targetEnvironmentId, projectId: data.projectId },
            })
          : this.prisma.projectEnvironment.findUnique({
              where: { id: data.targetEnvironmentId },
            }));

        if (!targetEnv || targetEnv.projectId !== data.projectId) {
          throw new ReproductionEnvironmentIncompatibleError(
            data.targetEnvironmentId,
            `Target reproduction environment '${data.targetEnvironmentId}' was not found in project '${data.projectId}' or is incompatible.`,
          );
        }
      } else if (failureCase.environmentId) {
        targetEnv = await (this.prisma.projectEnvironment.findFirst
          ? this.prisma.projectEnvironment.findFirst({
              where: { id: failureCase.environmentId },
            })
          : this.prisma.projectEnvironment.findUnique({
              where: { id: failureCase.environmentId },
            }));
      } else {
        targetEnv = await this.prisma.projectEnvironment.findFirst({
          where: { projectId: data.projectId, isDefault: true },
        });
      }

      // 4. Resolve or Compute Original Failure Signature
      let originalSignature = failureCase.failureSignature;
      if (!originalSignature) {
        const failedStep = originalExecution.stepExecutions.find((s: any) => s.status === 'FAILED');
        const failedAssert = originalExecution.assertionExecutionRecords.find(
          (a: any) => a.status === 'FAILED',
        );
        originalSignature = this.signatureGenerator.generateSignature({
          actionType: failedStep?.actionType,
          targetSummary: failedStep?.targetSummary,
          errorCode: failedStep?.errorCode || originalExecution.errorCode,
          errorMessage: failedStep?.errorMessage || originalExecution.errorMessage,
          assertionType: failedAssert?.assertionType,
          browserEngine: originalExecution.browserEngine,
        });

        // Store computed signature on FailureCase
        if (this.prisma.failureCase.update) {
          await this.prisma.failureCase.update({
            where: { id: failureCase.id },
            data: { failureSignature: originalSignature },
          });
        }
      }

      // 5. Resolve Historical Test Version
      const testResolution = await this.testResolver.resolveHistoricalTestVersion({
        projectId: data.projectId,
        testCaseId: failureCase.testCaseId,
        testCaseVersionNumber: failureCase.testCaseVersionNumber,
      });

      const targetProfile = {
        environmentId: targetEnv?.id ?? historicalEnv.environmentId ?? crypto.randomUUID(),
        environmentName: targetEnv?.name ?? historicalEnv.environmentName ?? 'Default Environment',
        baseUrl: targetEnv?.baseUrl ?? historicalEnv.baseUrl ?? null,
        browserEngine:
          data.browserEngine ??
          targetEnv?.browserEngine ??
          historicalEnv.browserEngine ??
          'chromium',
        viewport: targetEnv
          ? { width: targetEnv.viewportWidth, height: targetEnv.viewportHeight }
          : (historicalEnv.viewport ?? { width: 1280, height: 720 }),
        locale: targetEnv?.locale ?? historicalEnv.locale ?? null,
        timezone: targetEnv?.timezoneId ?? historicalEnv.timezone ?? null,
        isProduction: targetEnv?.isProduction ?? false,
      };

      const envComparison = this.envReconstructor.compareEnvironments(historicalEnv, targetProfile);

      // If test version is not executable -> Record BLOCKED attempt
      if (!testResolution.isExecutable) {
        const blockedAttempt = await this.recordBlockedAttempt({
          projectId: data.projectId,
          failureCaseId: failureCase.id,
          originalExecutionId: originalExecution.id,
          testCaseId: failureCase.testCaseId,
          testCaseVersionId: testResolution.testCaseVersionId ?? null,
          testCaseVersionNumber: failureCase.testCaseVersionNumber,
          requirementId: testResolution.requirementId ?? null,
          requirementVersionNumber: testResolution.requirementVersionNumber ?? null,
          targetEnvironmentId: targetProfile.environmentId,
          browserEngine: targetProfile.browserEngine,
          originalFailureSignature: originalSignature,
          envComparison,
          blockerReason:
            testResolution.blockerReason ?? 'Historical test version is not executable.',
        });

        return this.computeReproducibilitySummary(
          failureCase.id,
          data.projectId,
          [blockedAttempt],
          1,
        );
      }

      // 6. Execute Bounded Reproduction Attempts
      const requestedAttempts = Math.max(
        1,
        Math.min(data.maxAttempts, FAILURE_REPRODUCTION_BOUNDS.MAX_ATTEMPTS),
      );
      const batchAttempts: any[] = [];

      for (let attemptIdx = 0; attemptIdx < requestedAttempts; attemptIdx++) {
        if (abortController.signal.aborted) {
          break;
        }

        const attempt = await this.executeSingleReproductionAttempt({
          projectId: data.projectId,
          failureCase,
          originalExecution,
          originalSignature,
          testResolution,
          targetProfile,
          envComparison,
          abortSignal: abortController.signal,
        });
        batchAttempts.push(attempt);
      }

      return this.computeReproducibilitySummary(
        failureCase.id,
        data.projectId,
        batchAttempts,
        requestedAttempts,
      );
    } finally {
      this.activeReproductionCases.delete(data.failureCaseId);
      this.activeControllers.delete(data.failureCaseId);
    }
  }

  /**
   * Executes a single controlled reproduction run with a completely NEW execution identity (E2).
   * Verifies that original execution E1 is NEVER modified.
   */
  private async executeSingleReproductionAttempt(params: {
    projectId: string;
    failureCase: FailureCase;
    originalExecution: TestCaseExecution & {
      stepExecutions: any[];
      assertionExecutionRecords: any[];
    };
    originalSignature: string;
    testResolution: any;
    targetProfile: any;
    envComparison: any;
    abortSignal: AbortSignal;
  }): Promise<any> {
    const {
      projectId,
      failureCase,
      originalExecution,
      originalSignature,
      testResolution,
      targetProfile,
      envComparison,
      abortSignal,
    } = params;

    const tStart = new Date();
    const tStartMs = performance.now();

    // Determine attempt number
    const lastAttempt = await this.prisma.failureReproductionAttempt.findFirst({
      where: { failureCaseId: failureCase.id },
      orderBy: { attemptNumber: 'desc' },
      select: { attemptNumber: true },
    });
    const attemptNumber = (lastAttempt?.attemptNumber ?? 0) + 1;

    // Create a NEW TestRun record for reproduction
    const reproductionTestRun = await this.prisma.testRun.create({
      data: {
        projectId,
        testCaseId: failureCase.testCaseId,
        testCaseVersionId: testResolution.testCaseVersionId,
        testCaseVersionNumber: failureCase.testCaseVersionNumber,
        executableTestPlanId: originalExecution.executableTestPlanId,
        environmentId: targetProfile.environmentId,
        status: 'RUNNING',
        workerId: `reproduction-worker-${process.pid}`,
        browserEngine: targetProfile.browserEngine,
        testCaseTitle: testResolution.title,
        environmentName: targetProfile.environmentName,
        headless: true,
        timeoutMs: FAILURE_REPRODUCTION_BOUNDS.DEFAULT_TIMEOUT_MS,
        planFingerprint: crypto
          .createHash('sha256')
          .update(`reproduction-${failureCase.id}-${attemptNumber}`)
          .digest('hex'),
      },
    });

    // Create a NEW TestCaseExecution record (E2)
    const reproductionExecution = await this.prisma.testCaseExecution.create({
      data: {
        projectId,
        testRunId: reproductionTestRun.id,
        testCaseId: failureCase.testCaseId,
        testCaseVersionId: testResolution.testCaseVersionId,
        testCaseVersionNumber: failureCase.testCaseVersionNumber,
        executableTestPlanId: originalExecution.executableTestPlanId,
        environmentId: targetProfile.environmentId,
        attempt: 1,
        status: 'RUNNING',
        browserEngine: targetProfile.browserEngine,
        environmentSnapshotJson: {
          baseUrl: targetProfile.baseUrl,
          browserEngine: targetProfile.browserEngine,
          viewport: targetProfile.viewport,
          locale: targetProfile.locale,
          timezone: targetProfile.timezone,
        },
        metadataJson: {
          isReproductionAttempt: true,
          reproductionAttemptNumber: attemptNumber,
          originalExecutionId: originalExecution.id,
          failureCaseId: failureCase.id,
        },
      },
    });

    // Run controlled Playwright browser steps
    let reproductionStatus: 'PASSED' | 'FAILED' | 'CANCELLED' | 'AUTOMATION_ERROR' = 'PASSED';
    let terminalReason: string | null = null;
    let errorMessage: string | null = null;
    let errorCode: string | null = null;

    const recordedReproSteps: Array<{
      stepIndex: number;
      actionType: string;
      targetSummary?: string | null;
      status: string;
      durationMs?: number | null;
      errorMessage?: string | null;
    }> = [];

    const recordedReproAssertion: {
      assertionType?: string | null;
      operator?: string | null;
      expectedValue?: unknown;
      actualValue?: unknown;
      message?: string | null;
    } | null = null;

    let browser: import('playwright').Browser | null = null;
    let browserContext: import('playwright').BrowserContext | null = null;
    let page: import('playwright').Page | null = null;

    try {
      browser = await this.browserProvider.launch({
        engine: targetProfile.browserEngine as any,
        headless: true,
      });

      browserContext = await this.browserProvider.createContext(browser, {
        viewport: targetProfile.viewport,
        locale: targetProfile.locale,
        timezoneId: targetProfile.timezone,
      });

      page = await this.browserProvider.createPage(browserContext);

      // Execute steps
      for (let i = 0; i < testResolution.steps.length; i++) {
        if (abortSignal.aborted) {
          reproductionStatus = 'CANCELLED';
          terminalReason = 'Reproduction was cancelled by user.';
          break;
        }

        const step = testResolution.steps[i];
        const tStepStart = performance.now();

        // Create StepExecutionRecord
        const stepRecord = await this.prisma.stepExecutionRecord.create({
          data: {
            projectId,
            testRunId: reproductionTestRun.id,
            executionId: reproductionExecution.id,
            stepIndex: i,
            attempt: 1,
            actionType: this.inferActionType(step.action),
            status: 'RUNNING',
            targetSummary: step.action.slice(0, 200),
            expectedSummary: step.expectedResult ?? null,
          },
        });

        try {
          await this.executeStepAction(page, step.action, targetProfile.baseUrl);

          const stepDurationMs = Math.round(performance.now() - tStepStart);
          await this.prisma.stepExecutionRecord.update({
            where: { id: stepRecord.id },
            data: {
              status: 'PASSED',
              durationMs: stepDurationMs,
              completedAt: new Date(),
            },
          });

          recordedReproSteps.push({
            stepIndex: i,
            actionType: stepRecord.actionType,
            targetSummary: stepRecord.targetSummary,
            status: 'PASSED',
            durationMs: stepDurationMs,
          });
        } catch (stepErr: any) {
          const stepDurationMs = Math.round(performance.now() - tStepStart);
          const stepErrMsg = stepErr instanceof Error ? stepErr.message : String(stepErr);
          const isAssertion =
            stepRecord.actionType.toUpperCase() === 'ASSERT' ||
            stepErrMsg.toLowerCase().includes('assertion');
          const stepErrCode =
            stepErr.name === 'TimeoutError'
              ? 'TIMEOUT'
              : isAssertion
                ? 'ASSERTION_FAILED'
                : 'STEP_FAILED';

          await this.prisma.stepExecutionRecord.update({
            where: { id: stepRecord.id },
            data: {
              status: 'FAILED',
              durationMs: stepDurationMs,
              errorMessage: stepErrMsg.slice(0, 1000),
              errorCode: stepErrCode,
              completedAt: new Date(),
            },
          });

          recordedReproSteps.push({
            stepIndex: i,
            actionType: stepRecord.actionType,
            targetSummary: stepRecord.targetSummary,
            status: 'FAILED',
            durationMs: stepDurationMs,
            errorMessage: stepErrMsg,
          });

          // Check if failure occurred here
          reproductionStatus = 'FAILED';
          errorMessage = stepErrMsg;
          errorCode = stepErrCode;
          terminalReason = `Failed at step ${i + 1}: ${stepErrMsg}`;
          break;
        }
      }
    } catch (browserErr: any) {
      reproductionStatus = 'AUTOMATION_ERROR';
      errorMessage = browserErr instanceof Error ? browserErr.message : String(browserErr);
      errorCode = 'BROWSER_RUNTIME_ERROR';
      terminalReason = `Browser runtime error: ${errorMessage}`;
    } finally {
      if (browserContext) {
        try {
          await browserContext.close();
        } catch {
          void 0;
        }
      }
      if (browser) {
        try {
          await browser.close();
        } catch {
          void 0;
        }
      }
    }

    const tDurationMs = Math.round(performance.now() - tStartMs);
    const tCompleted = new Date();

    // Complete reproduction execution record (E2)
    await this.prisma.testCaseExecution.update({
      where: { id: reproductionExecution.id },
      data: {
        status: reproductionStatus as any,
        durationMs: tDurationMs,
        errorMessage: errorMessage?.slice(0, 2000),
        errorCode,
        terminalReason,
        completedAt: tCompleted,
      },
    });

    // Complete reproduction test run record
    await this.prisma.testRun.update({
      where: { id: reproductionTestRun.id },
      data: {
        status: reproductionStatus as any,
        executionDurationMs: tDurationMs,
        errorMessage: errorMessage?.slice(0, 2000),
        terminalReason,
        completedAt: tCompleted,
      },
    });

    // Generate reproduction failure signature
    let reproSignature: string | null = null;
    if (reproductionStatus === 'FAILED') {
      const reproFailedStep = recordedReproSteps.find(s => s.status === 'FAILED');
      reproSignature = this.signatureGenerator.generateSignature({
        actionType: reproFailedStep?.actionType,
        targetSummary: reproFailedStep?.targetSummary,
        errorCode,
        errorMessage,
        browserEngine: targetProfile.browserEngine,
      });
    }

    // Deep comparison
    const originalFailedAssert = originalExecution.assertionExecutionRecords.find(
      a => a.status === 'FAILED',
    );
    const origAssertObj = originalFailedAssert
      ? {
          assertionType: originalFailedAssert.assertionType,
          operator: originalFailedAssert.operator,
          expectedValue: originalFailedAssert.expectedValueJson,
          actualValue: originalFailedAssert.actualValueJson,
          message: originalFailedAssert.message,
        }
      : null;

    const comparison = this.comparator.compare({
      originalStatus: originalExecution.status,
      reproductionStatus,
      originalFailureSignature: originalSignature,
      reproductionFailureSignature: reproSignature,
      originalSteps: originalExecution.stepExecutions.map(s => ({
        stepIndex: s.stepIndex,
        actionType: s.actionType,
        targetSummary: s.targetSummary,
        status: s.status,
        durationMs: s.durationMs,
        errorMessage: s.errorMessage,
      })),
      reproductionSteps: recordedReproSteps,
      originalAssertion: origAssertObj,
      reproductionAssertion: recordedReproAssertion,
    });

    // Persist FailureReproductionAttempt
    return await this.prisma.failureReproductionAttempt.create({
      data: {
        projectId,
        failureCaseId: failureCase.id,
        analysisRunId: failureCase.currentAnalysisRunId ?? null,
        originalExecutionId: originalExecution.id,
        reproductionExecutionId: reproductionExecution.id,
        reproductionTestRunId: reproductionTestRun.id,
        attemptNumber,
        testCaseId: failureCase.testCaseId,
        testCaseVersionId: testResolution.testCaseVersionId ?? null,
        testCaseVersionNumber: failureCase.testCaseVersionNumber,
        requirementId: testResolution.requirementId ?? null,
        requirementVersionNumber: testResolution.requirementVersionNumber ?? null,
        targetEnvironmentId: targetProfile.environmentId,
        browserEngine: targetProfile.browserEngine,
        status: comparison.status,
        environmentEquivalence: envComparison.status,
        originalFailureSignature: originalSignature,
        reproductionFailureSignature: reproSignature,
        isSignatureMatch: comparison.isSignatureMatch,
        failedStepIndex: comparison.failedStepIndex ?? null,
        isFailedStepMatch: comparison.isFailedStepMatch,
        stepComparisonJson: comparison.stepComparison as any,
        assertionComparisonJson: (comparison.assertionComparison ?? {}) as any,
        environmentComparisonJson: envComparison as any,
        startedAt: tStart,
        completedAt: tCompleted,
        durationMs: tDurationMs,
      },
    });
  }

  private inferActionType(actionText: string): string {
    const text = actionText.trim().toLowerCase();
    if (text.startsWith('navigate') || text.startsWith('go to') || text.startsWith('open'))
      return 'NAVIGATE';
    if (text.startsWith('click')) return 'CLICK';
    if (text.startsWith('fill') || text.startsWith('type') || text.startsWith('enter'))
      return 'FILL';
    if (text.startsWith('assert') || text.startsWith('verify')) return 'ASSERT';
    if (text.startsWith('select')) return 'SELECT_OPTION';
    if (text.startsWith('check')) return 'CHECK';
    if (text.startsWith('hover')) return 'HOVER';
    if (text.startsWith('wait')) return 'WAIT';
    return 'CUSTOM_ACTION';
  }

  private async executeStepAction(
    page: import('playwright').Page,
    actionText: string,
    baseUrl?: string | null,
  ): Promise<void> {
    const text = actionText.trim();
    const lower = text.toLowerCase();

    // 1. Navigation
    if (lower.startsWith('navigate') || lower.startsWith('go to') || lower.startsWith('open')) {
      const match = text.match(/"([^"]+)"/) || text.match(/'([^']+)'/);
      let targetUrl = match?.[1] ?? '';
      if (targetUrl && !targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = baseUrl
          ? `${baseUrl.replace(/\/+$/, '')}/${targetUrl.replace(/^\/+/, '')}`
          : targetUrl;
      }
      if (targetUrl) {
        await page.goto(targetUrl, { timeout: 10000 });
        return;
      }
    }

    // 2. Click
    if (lower.startsWith('click')) {
      const match = text.match(/"([^"]+)"/) || text.match(/'([^']+)'/);
      const selector = match?.[1] ?? 'button';
      if (selector.startsWith('#') || selector.startsWith('.') || selector.startsWith('[')) {
        await page.locator(selector).click({ timeout: 5000 });
      } else {
        await page
          .getByRole('button', { name: selector })
          .or(page.locator(`text=${selector}`))
          .first()
          .click({ timeout: 5000 });
      }
      return;
    }

    // 3. Fill
    if (lower.startsWith('fill') || lower.startsWith('type') || lower.startsWith('enter')) {
      const matches = [...text.matchAll(/["']([^"']+)["']/g)].map(m => m[1]);
      if (matches.length >= 2) {
        const value = matches[0] ?? '';
        const field = matches[1] ?? '';
        const loc = field.startsWith('#')
          ? page.locator(field)
          : page
              .getByLabel(field)
              .or(page.getByPlaceholder(field))
              .or(page.locator(`input[name="${field}"]`))
              .first();
        await loc.fill(value, { timeout: 5000 });
        return;
      } else if (matches.length === 1 && matches[0]) {
        await page.locator('input').first().fill(matches[0], { timeout: 5000 });
        return;
      }
    }

    // 4. Assert
    if (lower.startsWith('assert') || lower.startsWith('verify')) {
      const match = text.match(/"([^"]+)"/) || text.match(/'([^']+)'/);
      const target = match?.[1] ?? '';
      if (target) {
        const loc = target.startsWith('#')
          ? page.locator(target)
          : page.locator(`text=${target}`).first();
        const visible = await loc.isVisible({ timeout: 5000 });
        if (!visible) {
          throw new Error(`Assertion failed: Target element '${target}' is not visible.`);
        }
        return;
      }
    }

    // Fallback: brief wait
    await page.waitForTimeout(100);
  }

  private async recordBlockedAttempt(params: {
    projectId: string;
    failureCaseId: string;
    originalExecutionId: string;
    testCaseId: string;
    testCaseVersionId?: string | null;
    testCaseVersionNumber: number;
    requirementId?: string | null;
    requirementVersionNumber?: number | null;
    targetEnvironmentId?: string | null;
    browserEngine: string;
    originalFailureSignature: string;
    envComparison: any;
    blockerReason: string;
  }): Promise<any> {
    const {
      projectId,
      failureCaseId,
      originalExecutionId,
      testCaseId,
      testCaseVersionId,
      testCaseVersionNumber,
      requirementId,
      requirementVersionNumber,
      targetEnvironmentId,
      browserEngine,
      originalFailureSignature,
      envComparison,
      blockerReason,
    } = params;

    const lastAttempt = await this.prisma.failureReproductionAttempt.findFirst({
      where: { failureCaseId },
      orderBy: { attemptNumber: 'desc' },
      select: { attemptNumber: true },
    });
    const attemptNumber = (lastAttempt?.attemptNumber ?? 0) + 1;

    return await this.prisma.failureReproductionAttempt.create({
      data: {
        projectId,
        failureCaseId,
        originalExecutionId,
        attemptNumber,
        testCaseId,
        testCaseVersionId,
        testCaseVersionNumber,
        requirementId,
        requirementVersionNumber,
        targetEnvironmentId,
        browserEngine,
        status: 'BLOCKED',
        environmentEquivalence: envComparison.status,
        originalFailureSignature,
        blockerReason,
        stepComparisonJson: [] as any,
        assertionComparisonJson: {} as any,
        environmentComparisonJson: envComparison as any,
      },
    });
  }

  /**
   * Retrieves all historical reproduction attempts for a failure case.
   */
  public async getReproductionAttempts(
    input: GetReproductionAttemptsInputDto,
  ): Promise<readonly FailureReproductionAttemptDto[]> {
    const data = getReproductionAttemptsInputSchema.parse(input);

    const failureCase = (await (this.prisma.failureCase.findFirst
      ? this.prisma.failureCase.findFirst({
          where: { id: data.failureCaseId, projectId: data.projectId },
          select: { id: true, projectId: true },
        })
      : this.prisma.failureCase.findUnique({
          where: { id: data.failureCaseId },
          select: { id: true, projectId: true },
        }))) as any;

    if (!failureCase || failureCase.projectId !== data.projectId) {
      throw new FailureCaseNotFoundError(data.failureCaseId, data.projectId);
    }

    const attempts = await this.prisma.failureReproductionAttempt.findMany({
      where: {
        projectId: data.projectId,
        failureCaseId: data.failureCaseId,
      },
      orderBy: { attemptNumber: 'asc' },
    });

    return attempts.map(a => this.mapAttemptToDto(a));
  }

  /**
   * Calculates and returns the deterministic reproducibility summary metrics.
   */
  public async getReproducibilitySummary(
    input: GetReproducibilitySummaryInputDto,
  ): Promise<ReproducibilitySummaryDto> {
    const data = getReproducibilitySummaryInputSchema.parse(input);

    const failureCase = (await (this.prisma.failureCase.findFirst
      ? this.prisma.failureCase.findFirst({
          where: { id: data.failureCaseId, projectId: data.projectId },
          select: { id: true, projectId: true },
        })
      : this.prisma.failureCase.findUnique({
          where: { id: data.failureCaseId },
          select: { id: true, projectId: true },
        }))) as any;

    if (!failureCase || failureCase.projectId !== data.projectId) {
      throw new FailureCaseNotFoundError(data.failureCaseId, data.projectId);
    }

    const attempts = await this.prisma.failureReproductionAttempt.findMany({
      where: {
        projectId: data.projectId,
        failureCaseId: data.failureCaseId,
      },
      orderBy: { attemptNumber: 'asc' },
    });

    return this.computeReproducibilitySummary(
      failureCase.id,
      failureCase.projectId,
      attempts,
      attempts.length,
    );
  }

  private computeReproducibilitySummary(
    failureCaseId: string,
    projectId: string,
    attempts: any[],
    attemptsRequested: number,
  ): ReproducibilitySummaryDto {
    const attemptsStarted = attempts.filter(a => a.startedAt !== null).length;
    const attemptsCompleted = attempts.filter(a => a.completedAt !== null).length;

    let equivalentFailures = 0;
    let differentFailures = 0;
    let passes = 0;
    let blockedAttempts = 0;
    let cancelledAttempts = 0;
    let environmentDriftDetected = false;

    for (const a of attempts) {
      if (a.status === 'REPRODUCED') {
        equivalentFailures++;
      } else if (a.status === 'NOT_REPRODUCED') {
        passes++;
      } else if (a.status === 'BLOCKED') {
        blockedAttempts++;
      } else if (a.status === 'CANCELLED') {
        cancelledAttempts++;
      } else {
        differentFailures++;
      }

      if (a.environmentEquivalence === 'DRIFTED') {
        environmentDriftDetected = true;
      }
    }

    const validAttempts = equivalentFailures + differentFailures + passes;
    const reproducibilityRatio =
      validAttempts > 0 ? Number((equivalentFailures / validAttempts).toFixed(4)) : 0;

    // Overall outcome
    let overallOutcome: FailureReproductionOutcome = 'INCONCLUSIVE';
    if (attempts.length === 0) {
      overallOutcome = 'INCONCLUSIVE';
    } else if (equivalentFailures > 0 && differentFailures === 0 && passes === 0) {
      overallOutcome = 'REPRODUCED';
    } else if (equivalentFailures > 0 && passes === 0) {
      overallOutcome = 'REPRODUCED';
    } else if (passes > 0 && equivalentFailures === 0) {
      overallOutcome = 'NOT_REPRODUCED';
    } else if (equivalentFailures > 0 && passes > 0) {
      overallOutcome = 'INCONCLUSIVE';
    } else if (blockedAttempts === attempts.length) {
      overallOutcome = 'BLOCKED';
    } else if (cancelledAttempts === attempts.length) {
      overallOutcome = 'CANCELLED';
    }

    const lastAttempt = attempts[attempts.length - 1];

    return {
      failureCaseId,
      projectId,
      overallOutcome,
      attemptsRequested,
      attemptsStarted,
      attemptsCompleted,
      equivalentFailures,
      differentFailures,
      passes,
      blockedAttempts,
      cancelledAttempts,
      environmentDriftDetected,
      reproducibilityRatio,
      lastAttemptAt: lastAttempt
        ? lastAttempt.createdAt instanceof Date
          ? lastAttempt.createdAt.toISOString()
          : String(lastAttempt.createdAt)
        : null,
    };
  }

  /**
   * Cancels an ongoing reproduction attempt.
   */
  public async cancelReproduction(
    input: CancelReproductionInputDto,
  ): Promise<{ readonly cancelled: boolean }> {
    const data = cancelReproductionInputSchema.parse(input);

    const controller = this.activeControllers.get(data.failureCaseId);
    if (controller) {
      controller.abort();
      return { cancelled: true };
    }

    return { cancelled: false };
  }

  private mapAttemptToDto(entity: any): FailureReproductionAttemptDto {
    return {
      id: entity.id,
      projectId: entity.projectId,
      failureCaseId: entity.failureCaseId,
      analysisRunId: entity.analysisRunId ?? null,
      originalExecutionId: entity.originalExecutionId,
      reproductionExecutionId: entity.reproductionExecutionId ?? null,
      reproductionTestRunId: entity.reproductionTestRunId ?? null,
      attemptNumber: entity.attemptNumber,
      testCaseId: entity.testCaseId,
      testCaseVersionId: entity.testCaseVersionId ?? null,
      testCaseVersionNumber: entity.testCaseVersionNumber,
      requirementId: entity.requirementId ?? null,
      requirementVersionNumber: entity.requirementVersionNumber ?? null,
      targetEnvironmentId: entity.targetEnvironmentId ?? null,
      browserEngine: entity.browserEngine,
      reproductionVersion: entity.reproductionVersion,
      status: entity.status,
      environmentEquivalence: entity.environmentEquivalence,
      originalFailureSignature: entity.originalFailureSignature ?? null,
      reproductionFailureSignature: entity.reproductionFailureSignature ?? null,
      isSignatureMatch: entity.isSignatureMatch ?? null,
      failedStepIndex: entity.failedStepIndex ?? null,
      isFailedStepMatch: entity.isFailedStepMatch ?? null,
      stepComparison: (entity.stepComparisonJson as any) ?? [],
      assertionComparison: entity.assertionComparisonJson
        ? (entity.assertionComparisonJson as any)
        : null,
      environmentComparison: (entity.environmentComparisonJson as any) ?? {
        status: 'UNKNOWN',
        driftItems: [],
      },
      blockerReason: entity.blockerReason ?? null,
      startedAt: entity.startedAt ? entity.startedAt.toISOString() : null,
      completedAt: entity.completedAt ? entity.completedAt.toISOString() : null,
      durationMs: entity.durationMs ?? null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
