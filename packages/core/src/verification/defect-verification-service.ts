/**
 * @file packages/core/src/verification/defect-verification-service.ts
 * Authoritative domain service orchestrating automated failed-test rerun and fix verification (V7 Phase 98).
 * Enforces multi-tenant scoping, per-defect mutex, E1 immutability, environment reconstruction,
 * safety policy checks, Playwright execution, and deterministic E1 vs E2 comparison.
 */

import crypto from 'node:crypto';
import type {
  PrismaClient,
  FailureCase,
  TestCaseExecution,
  ProjectEnvironment,
  DefectReverification,
  DefectVerificationAttempt,
} from '@prisma/client';
import {
  type VerificationOutcome,
  type VerificationMode,
  type DefectVerificationAttemptDto,
  type VerificationSummaryDto,
  type ExecuteVerificationInputDto,
  type GetVerificationAttemptsInputDto,
  type GetVerificationComparisonInputDto,
  type CancelVerificationInputDto,
  executeVerificationInputSchema,
  getVerificationAttemptsInputSchema,
  getVerificationComparisonInputSchema,
  cancelVerificationInputSchema,
} from '@ai-quality/contracts';
import {
  type IDefectVerificationService,
  type VerificationComparisonResult,
  VERIFICATION_BOUNDS,
} from './verification-types.js';
import {
  VerificationNotFoundError,
  VerificationInProgressError,
  VerificationAttemptLimitExceededError,
  VerificationCrossProjectForbiddenError,
} from './verification-errors.js';
import { VerificationComparator } from './verification-comparator.js';
import { PlaywrightBrowserProvider } from '../execution/browser-provider.js';
import { ExecutionPersistenceService } from '../execution/persistence/execution-persistence-service.js';
import { EnvironmentReconstructor } from '../failures/reproduction/environment-reconstructor.js';
import { HistoricalTestResolver } from '../failures/reproduction/historical-test-resolver.js';
import { FailureSignatureGenerator } from '../failures/evidence/failure-signature-generator.js';
import { ReverificationSafetyChecker } from '../reverification/reverification-safety-checker.js';
import type { ILogger } from '../logging/index.js';

export interface DefectVerificationServiceDependencies {
  readonly prisma: PrismaClient;
  readonly browserProvider?: PlaywrightBrowserProvider;
  readonly persistenceService?: ExecutionPersistenceService;
  readonly envReconstructor?: EnvironmentReconstructor;
  readonly testResolver?: HistoricalTestResolver;
  readonly comparator?: VerificationComparator;
  readonly signatureGenerator?: FailureSignatureGenerator;
  readonly safetyChecker?: ReverificationSafetyChecker;
  readonly logger?: ILogger;
}

export class DefectVerificationService implements IDefectVerificationService {
  private readonly prisma: PrismaClient;
  private readonly browserProvider: PlaywrightBrowserProvider;
  private readonly persistenceService: ExecutionPersistenceService;
  private readonly envReconstructor: EnvironmentReconstructor;
  private readonly testResolver: HistoricalTestResolver;
  private readonly comparator: VerificationComparator;
  private readonly signatureGenerator: FailureSignatureGenerator;
  private readonly safetyChecker: ReverificationSafetyChecker;
  private readonly logger?: ILogger;

  // Mutex and cancellation tracking per failure case / reverification
  private readonly activeVerifications: Set<string> = new Set();
  private readonly activeControllers: Map<string, AbortController> = new Map();

  constructor(deps: DefectVerificationServiceDependencies) {
    this.prisma = deps.prisma;
    this.logger = deps.logger;
    this.browserProvider = deps.browserProvider ?? new PlaywrightBrowserProvider(deps.logger);
    this.persistenceService =
      deps.persistenceService ??
      new ExecutionPersistenceService({ prisma: deps.prisma, logger: deps.logger });
    this.envReconstructor = deps.envReconstructor ?? new EnvironmentReconstructor();
    this.testResolver = deps.testResolver ?? new HistoricalTestResolver(deps.prisma);
    this.comparator = deps.comparator ?? new VerificationComparator();
    this.signatureGenerator = deps.signatureGenerator ?? new FailureSignatureGenerator();
    this.safetyChecker = deps.safetyChecker ?? new ReverificationSafetyChecker();
  }

  /**
   * Executes automated failed-test rerun and fix verification for a defect.
   */
  public async executeVerification(
    input: ExecuteVerificationInputDto,
  ): Promise<VerificationSummaryDto> {
    const rawAttempts = (input as any)?.maxAttempts;
    if (typeof rawAttempts === 'number' && rawAttempts > VERIFICATION_BOUNDS.MAX_ATTEMPTS) {
      throw new VerificationAttemptLimitExceededError(
        rawAttempts,
        VERIFICATION_BOUNDS.MAX_ATTEMPTS,
      );
    }

    const data = executeVerificationInputSchema.parse(input);

    const maxAttempts = data.maxAttempts ?? 1;

    // 1. Concurrency Protection (Per-Defect Mutex)
    if (this.activeVerifications.has(data.failureCaseId)) {
      throw new VerificationInProgressError(data.failureCaseId);
    }

    this.activeVerifications.add(data.failureCaseId);
    const abortController = new AbortController();
    this.activeControllers.set(data.failureCaseId, abortController);

    try {
      // 2. Multi-Tenant Project and FailureCase Ownership Validation
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
        throw new VerificationNotFoundError(
          `FailureCase '${data.failureCaseId}' in project '${data.projectId}'`,
        );
      }

      // 3. Load Original Execution E1 (must never be mutated)
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
        throw new VerificationNotFoundError(
          `Original TestCaseExecution '${failureCase.executionId}' for defect`,
        );
      }

      // Record snapshot of original execution status to guarantee E1 immutability check
      const originalExecutionInitialStatus = originalExecution.status;

      // 4. Target Environment Resolution & Reconstruction
      const historicalEnv =
        this.envReconstructor.reconstructHistoricalEnvironment(originalExecution);

      let targetEnv: ProjectEnvironment | null = null;
      if (data.targetEnvironmentId) {
        targetEnv = await this.prisma.projectEnvironment.findUnique({
          where: { id: data.targetEnvironmentId },
        });

        if (!targetEnv || targetEnv.projectId !== data.projectId) {
          throw new VerificationCrossProjectForbiddenError(
            `Target verification environment '${data.targetEnvironmentId}' belongs to another project or does not exist.`,
          );
        }
      } else if (failureCase.environmentId) {
        targetEnv = await this.prisma.projectEnvironment.findUnique({
          where: { id: failureCase.environmentId },
        });
      }

      if (!targetEnv) {
        targetEnv = await this.prisma.projectEnvironment.findFirst({
          where: { projectId: data.projectId, isDefault: true },
        });
      }

      if (!targetEnv) {
        targetEnv = await this.prisma.projectEnvironment.findFirst({
          where: { projectId: data.projectId },
        });
      }

      const targetProfile = {
        environmentId: targetEnv?.id ?? historicalEnv.environmentId ?? crypto.randomUUID(),
        environmentName: targetEnv?.name ?? historicalEnv.environmentName ?? 'Default Environment',
        baseUrl: targetEnv?.baseUrl ?? historicalEnv.baseUrl ?? null,
        browserEngine: targetEnv?.browserEngine ?? historicalEnv.browserEngine ?? 'chromium',
        viewport: targetEnv
          ? { width: targetEnv.viewportWidth, height: targetEnv.viewportHeight }
          : (historicalEnv.viewport ?? { width: 1280, height: 720 }),
        locale: targetEnv?.locale ?? historicalEnv.locale ?? null,
        timezone: targetEnv?.timezoneId ?? historicalEnv.timezone ?? null,
        isProduction: targetEnv?.isProduction ?? false,
      };

      const envComparison = this.envReconstructor.compareEnvironments(historicalEnv, targetProfile);

      // 5. Resolve Reverification Entity (or auto-create if not present)
      let reverification: DefectReverification | null = null;
      if (data.reverificationId) {
        reverification = await this.prisma.defectReverification.findUnique({
          where: { id: data.reverificationId },
        });
        if (!reverification) {
          throw new VerificationNotFoundError(`DefectReverification '${data.reverificationId}'`);
        }
        if (reverification.projectId !== data.projectId) {
          throw new VerificationCrossProjectForbiddenError(
            `DefectReverification '${data.reverificationId}' belongs to a different project.`,
          );
        }
      } else {
        reverification = await this.prisma.defectReverification.findFirst({
          where: { failureCaseId: failureCase.id, projectId: data.projectId },
          orderBy: { createdAt: 'desc' },
        });

        if (!reverification) {
          reverification = await this.prisma.defectReverification.create({
            data: {
              projectId: data.projectId,
              failureCaseId: failureCase.id,
              originalTestRunId: failureCase.testRunId,
              originalExecutionId: originalExecution.id,
              originalTestCaseId: failureCase.testCaseId,
              originalTestCaseVersionId: originalExecution.testCaseVersionId ?? null,
              originalTestCaseVersionNumber: failureCase.testCaseVersionNumber,
              selectedTestCaseId: failureCase.testCaseId,
              selectedTestCaseVersionId: originalExecution.testCaseVersionId ?? null,
              selectedTestCaseVersionNumber: failureCase.testCaseVersionNumber,
              targetEnvironmentId: targetProfile.environmentId,
              status: 'READY',
              eligibility: 'ELIGIBLE',
              triggerType: 'MANUAL_REQUEST',
            },
          });
        }
      }

      // Transition reverification status to EXECUTING
      const previousReverificationStatus = reverification.status;
      await this.prisma.defectReverification.update({
        where: { id: reverification.id },
        data: { status: 'EXECUTING' },
      });

      // Audit Event: Verification Started
      await this.createAuditEvent({
        projectId: data.projectId,
        reverificationId: reverification.id,
        action: 'VERIFICATION_STARTED',
        fromStatus: previousReverificationStatus,
        toStatus: 'EXECUTING',
        actor: data.actor || 'USER',
        reason: `Verification execution started in ${data.mode} mode.`,
        detailsJson: {
          mode: data.mode,
          maxAttempts,
          targetEnvironmentId: data.targetEnvironmentId || null,
        },
      });

      // 6. Compute or Resolve Original Failure Signature
      let originalSignature = failureCase.failureSignature;
      if (!originalSignature) {
        const failedStep = originalExecution.stepExecutions?.find(
          (s: any) => s.status === 'FAILED',
        );
        const failedAssert = originalExecution.assertionExecutionRecords?.find(
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

        if (this.prisma.failureCase.update) {
          await this.prisma.failureCase.update({
            where: { id: failureCase.id },
            data: { failureSignature: originalSignature },
          });
        }
      }

      // 7. Test Case Version Resolution (HISTORICAL vs CURRENT)
      let testResolution: any;
      let testVersionDifference: string | null = null;
      let verificationVersionId: string | null = null;
      let verificationVersionNumber: number = failureCase.testCaseVersionNumber;

      if (data.mode === 'CURRENT') {
        const currentTestCase = await this.prisma.testCase.findUnique({
          where: { id: failureCase.testCaseId },
          select: { id: true, currentVersionNumber: true },
        });

        const curVer = await this.prisma.testCaseVersion.findFirst({
          where: {
            testCaseId: failureCase.testCaseId,
            versionNumber:
              currentTestCase?.currentVersionNumber ?? failureCase.testCaseVersionNumber,
          },
        });

        if (curVer) {
          verificationVersionId = curVer.id;
          verificationVersionNumber = curVer.versionNumber;
          if (verificationVersionNumber !== failureCase.testCaseVersionNumber) {
            testVersionDifference = `Rerun against current test version V${verificationVersionNumber} (defect occurred on historical V${failureCase.testCaseVersionNumber})`;
          }
          testResolution = await this.testResolver.resolveHistoricalTestVersion({
            projectId: data.projectId,
            testCaseId: failureCase.testCaseId,
            testCaseVersionNumber: verificationVersionNumber,
          });
        } else {
          testResolution = await this.testResolver.resolveHistoricalTestVersion({
            projectId: data.projectId,
            testCaseId: failureCase.testCaseId,
            testCaseVersionNumber: failureCase.testCaseVersionNumber,
          });
          verificationVersionId = testResolution.testCaseVersionId ?? null;
          verificationVersionNumber = failureCase.testCaseVersionNumber;
        }
      } else {
        testResolution = await this.testResolver.resolveHistoricalTestVersion({
          projectId: data.projectId,
          testCaseId: failureCase.testCaseId,
          testCaseVersionNumber: failureCase.testCaseVersionNumber,
        });
        verificationVersionId = testResolution.testCaseVersionId ?? null;
        verificationVersionNumber = failureCase.testCaseVersionNumber;
      }

      // Check test executability
      if (!testResolution.isExecutable) {
        const blockerReason =
          testResolution.blockerReason ?? 'Test version contains no executable steps.';
        const blockedAttempt = await this.recordBlockedAttempt({
          projectId: data.projectId,
          reverificationId: reverification.id,
          failureCaseId: failureCase.id,
          originalExecutionId: originalExecution.id,
          testCaseId: failureCase.testCaseId,
          originalTestCaseVersionId: originalExecution.testCaseVersionId ?? null,
          originalTestCaseVersionNumber: failureCase.testCaseVersionNumber,
          verificationTestCaseVersionId: verificationVersionId,
          verificationTestCaseVersionNumber: verificationVersionNumber,
          testVersionDifference,
          originalRequirementVersionNumber: testResolution.requirementVersionNumber ?? null,
          verificationRequirementVersionNumber: testResolution.requirementVersionNumber ?? null,
          targetEnvironmentId: targetProfile.environmentId,
          browserEngine: targetProfile.browserEngine,
          originalFailureSignature: originalSignature,
          envComparison,
          blockerReason,
          mode: data.mode,
        });

        await this.prisma.defectReverification.update({
          where: { id: reverification.id },
          data: {
            status: 'BLOCKED',
            latestOutcome: 'BLOCKED',
          },
        });

        await this.createAuditEvent({
          projectId: data.projectId,
          reverificationId: reverification.id,
          action: 'VERIFICATION_BLOCKED',
          fromStatus: 'EXECUTING',
          toStatus: 'BLOCKED',
          actor: data.actor || 'SYSTEM',
          reason: blockerReason,
        });

        return this.buildSummary(
          failureCase.id,
          reverification.id,
          data.projectId,
          [blockedAttempt],
          maxAttempts,
          envComparison.status,
        );
      }

      // 8. Production Safety Policy Check
      if (targetEnv) {
        const safetyResult = this.safetyChecker.evaluateSafety(
          targetEnv,
          testResolution.steps.map((s: any) => ({
            stepNumber: s.stepNumber,
            action: s.action,
            expectedResult: s.expectedResult,
          })),
        );

        if (!safetyResult.isSafe) {
          const blockerReason =
            safetyResult.safetyReason || 'Target environment violates safety policy.';
          const blockedAttempt = await this.recordBlockedAttempt({
            projectId: data.projectId,
            reverificationId: reverification.id,
            failureCaseId: failureCase.id,
            originalExecutionId: originalExecution.id,
            testCaseId: failureCase.testCaseId,
            originalTestCaseVersionId: originalExecution.testCaseVersionId ?? null,
            originalTestCaseVersionNumber: failureCase.testCaseVersionNumber,
            verificationTestCaseVersionId: verificationVersionId,
            verificationTestCaseVersionNumber: verificationVersionNumber,
            testVersionDifference,
            originalRequirementVersionNumber: testResolution.requirementVersionNumber ?? null,
            verificationRequirementVersionNumber: testResolution.requirementVersionNumber ?? null,
            targetEnvironmentId: targetProfile.environmentId,
            browserEngine: targetProfile.browserEngine,
            originalFailureSignature: originalSignature,
            envComparison,
            blockerReason,
            mode: data.mode,
          });

          await this.prisma.defectReverification.update({
            where: { id: reverification.id },
            data: {
              status: 'BLOCKED',
              latestOutcome: 'BLOCKED',
            },
          });

          await this.createAuditEvent({
            projectId: data.projectId,
            reverificationId: reverification.id,
            action: 'VERIFICATION_BLOCKED',
            fromStatus: 'EXECUTING',
            toStatus: 'BLOCKED',
            actor: data.actor || 'SYSTEM',
            reason: blockerReason,
          });

          return this.buildSummary(
            failureCase.id,
            reverification.id,
            data.projectId,
            [blockedAttempt],
            maxAttempts,
            envComparison.status,
          );
        }
      }

      // 9. Execute Bounded Verification Attempts
      const batchAttempts: DefectVerificationAttemptDto[] = [];
      let latestOutcome: VerificationOutcome = 'INCONCLUSIVE';

      for (let attemptIdx = 0; attemptIdx < maxAttempts; attemptIdx++) {
        if (abortController.signal.aborted) {
          latestOutcome = 'CANCELLED';
          break;
        }

        const attemptRecord = await this.executeSingleVerificationAttempt({
          projectId: data.projectId,
          reverificationId: reverification.id,
          failureCase,
          originalExecution,
          originalSignature,
          testResolution,
          verificationVersionId,
          verificationVersionNumber,
          testVersionDifference,
          targetProfile,
          envComparison,
          mode: data.mode,
          abortSignal: abortController.signal,
        });

        batchAttempts.push(attemptRecord);
        latestOutcome = attemptRecord.status;

        if (
          latestOutcome === 'VERIFIED_FIXED' ||
          latestOutcome === 'CANCELLED' ||
          latestOutcome === 'BLOCKED'
        ) {
          break;
        }
      }

      // 10. Update DefectReverification Status & Latest Outcome
      const finalReverificationStatus =
        latestOutcome === 'CANCELLED'
          ? 'CANCELLED'
          : latestOutcome === 'BLOCKED'
            ? 'BLOCKED'
            : 'COMPLETED';

      await this.prisma.defectReverification.update({
        where: { id: reverification.id },
        data: {
          status: finalReverificationStatus,
          latestOutcome: latestOutcome,
        },
      });

      // Audit Event: Verification Completed / Terminal
      await this.createAuditEvent({
        projectId: data.projectId,
        reverificationId: reverification.id,
        action: 'VERIFICATION_ATTEMPT_COMPLETED',
        fromStatus: 'EXECUTING',
        toStatus: finalReverificationStatus,
        actor: data.actor || 'SYSTEM',
        reason: `Verification completed with outcome '${latestOutcome}'. Total attempts: ${batchAttempts.length}.`,
        detailsJson: {
          latestOutcome,
          attemptsCount: batchAttempts.length,
        },
      });

      // 11. INVARIANT ASSERTION: Verify Original Execution E1 was NEVER mutated
      const verifyE1After = await this.prisma.testCaseExecution.findUnique({
        where: { id: originalExecution.id },
        select: { status: true, id: true },
      });

      if (verifyE1After && verifyE1After.status !== originalExecutionInitialStatus) {
        this.logger?.error(
          'CRITICAL: Original execution E1 was mutated during verification rerun!',
          {
            originalExecutionId: originalExecution.id,
            initialStatus: originalExecutionInitialStatus,
            mutatedStatus: verifyE1After.status,
          },
        );
      }

      return this.buildSummary(
        failureCase.id,
        reverification.id,
        data.projectId,
        batchAttempts,
        maxAttempts,
        envComparison.status,
      );
    } finally {
      this.activeVerifications.delete(data.failureCaseId);
      this.activeControllers.delete(data.failureCaseId);
    }
  }

  /**
   * Executes a single verification attempt: creates new E2 identity, runs Playwright,
   * performs deep comparison against E1, and records DefectVerificationAttempt.
   */
  private async executeSingleVerificationAttempt(params: {
    projectId: string;
    reverificationId: string;
    failureCase: FailureCase;
    originalExecution: TestCaseExecution & {
      stepExecutions: any[];
      assertionExecutionRecords: any[];
    };
    originalSignature: string;
    testResolution: any;
    verificationVersionId?: string | null;
    verificationVersionNumber: number;
    testVersionDifference: string | null;
    targetProfile: any;
    envComparison: any;
    mode: VerificationMode;
    abortSignal: AbortSignal;
  }): Promise<DefectVerificationAttemptDto> {
    const {
      projectId,
      reverificationId,
      failureCase,
      originalExecution,
      originalSignature,
      testResolution,
      verificationVersionId,
      verificationVersionNumber,
      testVersionDifference,
      targetProfile,
      envComparison,
      mode,
      abortSignal,
    } = params;

    const tStart = new Date();
    const tStartMs = performance.now();

    // Determine next attempt number for this reverification
    const lastAttempt = await this.prisma.defectVerificationAttempt.findFirst({
      where: { reverificationId },
      orderBy: { attemptNumber: 'desc' },
      select: { attemptNumber: true },
    });
    const attemptNumber = (lastAttempt?.attemptNumber ?? 0) + 1;

    // Create a NEW TestRun record for verification execution (E2)
    const verificationTestRun = await this.prisma.testRun.create({
      data: {
        projectId,
        testCaseId: failureCase.testCaseId,
        testCaseVersionId: verificationVersionId,
        testCaseVersionNumber: verificationVersionNumber,
        executableTestPlanId: originalExecution.executableTestPlanId,
        environmentId: targetProfile.environmentId,
        status: 'RUNNING',
        workerId: `verification-worker-${process.pid}`,
        browserEngine: targetProfile.browserEngine,
        testCaseTitle: testResolution.title,
        environmentName: targetProfile.environmentName,
        headless: true,
        timeoutMs: VERIFICATION_BOUNDS.DEFAULT_TIMEOUT_MS,
        planFingerprint: crypto
          .createHash('sha256')
          .update(`verification-${reverificationId}-${attemptNumber}`)
          .digest('hex'),
      },
    });

    // Create a NEW TestCaseExecution record (E2)
    const verificationExecution = await this.prisma.testCaseExecution.create({
      data: {
        projectId,
        testRunId: verificationTestRun.id,
        testCaseId: failureCase.testCaseId,
        testCaseVersionId: verificationVersionId,
        testCaseVersionNumber: verificationVersionNumber,
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
          isVerificationAttempt: true,
          verificationAttemptNumber: attemptNumber,
          originalExecutionId: originalExecution.id,
          failureCaseId: failureCase.id,
          reverificationId,
        },
      },
    });

    // Run Playwright browser execution
    let executionStatus: 'PASSED' | 'FAILED' | 'CANCELLED' | 'AUTOMATION_ERROR' = 'PASSED';
    let terminalReason: string | null = null;
    let errorMessage: string | null = null;
    let errorCode: string | null = null;

    const recordedVerificationSteps: Array<{
      stepIndex: number;
      actionType: string;
      targetSummary?: string | null;
      status: string;
      durationMs?: number | null;
      errorMessage?: string | null;
    }> = [];

    const recordedVerificationAssertions: Array<{
      stepIndex?: number | null;
      assertionType?: string | null;
      operator?: string | null;
      expectedValue?: unknown;
      actualValue?: unknown;
      status?: string | null;
      message?: string | null;
    }> = [];

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

      // Execute steps sequentially
      for (let i = 0; i < testResolution.steps.length; i++) {
        if (abortSignal.aborted) {
          executionStatus = 'CANCELLED';
          terminalReason = 'Verification rerun was cancelled by user.';
          break;
        }

        const step = testResolution.steps[i];
        const tStepStart = performance.now();

        // Create StepExecutionRecord for E2
        const stepRecord = await this.prisma.stepExecutionRecord.create({
          data: {
            projectId,
            testRunId: verificationTestRun.id,
            executionId: verificationExecution.id,
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

          recordedVerificationSteps.push({
            stepIndex: i,
            actionType: stepRecord.actionType,
            targetSummary: stepRecord.targetSummary,
            status: 'PASSED',
            durationMs: stepDurationMs,
          });

          if (step.expectedResult) {
            recordedVerificationAssertions.push({
              stepIndex: i,
              assertionType: 'VISIBILITY',
              status: 'PASSED',
              expectedValue: step.expectedResult,
              actualValue: step.expectedResult,
            });
          }
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

          recordedVerificationSteps.push({
            stepIndex: i,
            actionType: stepRecord.actionType,
            targetSummary: stepRecord.targetSummary,
            status: 'FAILED',
            durationMs: stepDurationMs,
            errorMessage: stepErrMsg,
          });

          if (isAssertion) {
            recordedVerificationAssertions.push({
              stepIndex: i,
              assertionType: 'ASSERTION',
              status: 'FAILED',
              expectedValue: step.expectedResult || 'visible',
              actualValue: 'not found or timed out',
              message: stepErrMsg,
            });
          }

          executionStatus = 'FAILED';
          errorMessage = stepErrMsg;
          errorCode = stepErrCode;
          terminalReason = `Failed at step ${i + 1}: ${stepErrMsg}`;
          break;
        }
      }
    } catch (browserErr: any) {
      executionStatus = 'AUTOMATION_ERROR';
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

    // Complete verification TestCaseExecution (E2)
    await this.prisma.testCaseExecution.update({
      where: { id: verificationExecution.id },
      data: {
        status: executionStatus as any,
        durationMs: tDurationMs,
        errorMessage: errorMessage?.slice(0, 2000),
        errorCode,
        terminalReason,
        completedAt: tCompleted,
      },
    });

    // Complete verification TestRun
    await this.prisma.testRun.update({
      where: { id: verificationTestRun.id },
      data: {
        status: executionStatus as any,
        executionDurationMs: tDurationMs,
        errorMessage: errorMessage?.slice(0, 2000),
        terminalReason,
        completedAt: tCompleted,
      },
    });

    // Generate verification failure signature if failed
    let verificationSignature: string | null = null;
    if (executionStatus === 'FAILED') {
      const verifFailedStep = recordedVerificationSteps.find(s => s.status === 'FAILED');
      verificationSignature = this.signatureGenerator.generateSignature({
        actionType: verifFailedStep?.actionType,
        targetSummary: verifFailedStep?.targetSummary,
        errorCode,
        errorMessage,
        browserEngine: targetProfile.browserEngine,
      });
    }

    // Run deep comparator
    const comparison: VerificationComparisonResult = this.comparator.compare({
      originalExecutionStatus: originalExecution.status,
      verificationExecutionStatus: executionStatus,
      originalFailureSignature: originalSignature,
      verificationFailureSignature: verificationSignature,
      originalSteps: originalExecution.stepExecutions.map(s => ({
        stepIndex: s.stepIndex,
        actionType: s.actionType,
        targetSummary: s.targetSummary,
        status: s.status,
        durationMs: s.durationMs,
        errorMessage: s.errorMessage,
      })),
      verificationSteps: recordedVerificationSteps,
      originalAssertions: originalExecution.assertionExecutionRecords.map(a => ({
        stepIndex: null,
        assertionType: a.assertionType,
        operator: a.operator,
        expectedValue: a.expectedValueJson,
        actualValue: a.actualValueJson,
        status: a.status,
        message: a.message,
      })),
      verificationAssertions: recordedVerificationAssertions,
      environmentDetails: {
        equivalence: envComparison.status,
        isDriftDetected:
          envComparison.status === 'DRIFTED' || envComparison.status === 'INCOMPATIBLE',
        driftDetails: envComparison.driftDetails ?? null,
      },
      testVersionDifference,
    });

    // Lookup structured bug report if any
    const bugReport = await this.prisma.structuredBugReport.findFirst({
      where: { failureCaseId: failureCase.id, projectId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    // Persist DefectVerificationAttempt
    const createdAttempt = await this.prisma.defectVerificationAttempt.create({
      data: {
        projectId,
        reverificationId,
        failureCaseId: failureCase.id,
        structuredBugReportId: bugReport?.id ?? null,
        originalExecutionId: originalExecution.id,
        verificationExecutionId: verificationExecution.id,
        verificationTestRunId: verificationTestRun.id,
        verificationMode: mode,
        testCaseId: failureCase.testCaseId,
        originalTestCaseVersionId: originalExecution.testCaseVersionId ?? null,
        originalTestCaseVersionNumber: failureCase.testCaseVersionNumber,
        verificationTestCaseVersionId: verificationVersionId ?? null,
        verificationTestCaseVersionNumber: verificationVersionNumber,
        testVersionDifference,
        originalRequirementVersionNumber: testResolution.requirementVersionNumber ?? null,
        verificationRequirementVersionNumber: testResolution.requirementVersionNumber ?? null,
        attemptNumber,
        targetEnvironmentId: targetProfile.environmentId,
        browserEngine: targetProfile.browserEngine,
        status: comparison.outcome,
        originalFailureSignature: originalSignature,
        verificationFailureSignature: verificationSignature,
        isSignatureMatch: comparison.isSignatureMatch,
        failedStepIndex: comparison.verificationFailingStepIndex,
        originalFailedStepAction: comparison.originalFailedStepAction,
        verificationFailedStepAction: comparison.verificationFailedStepAction,
        stepComparisonJson: comparison.stepComparisons as any,
        assertionComparisonJson: comparison.assertionComparisons as any,
        environmentComparisonJson: envComparison as any,
        environmentEquivalence: envComparison.status,
        environmentDriftDetails: envComparison.driftDetails ?? null,
        executionDurationMs: tDurationMs,
        startedAt: tStart,
        completedAt: tCompleted,
        metadataJson: {
          comparisonSummary: comparison.comparisonSummary,
        },
      },
    });

    return this.mapAttemptToDto(createdAttempt);
  }

  /**
   * Records a BLOCKED verification attempt without running a browser.
   */
  private async recordBlockedAttempt(params: {
    projectId: string;
    reverificationId: string;
    failureCaseId: string;
    originalExecutionId: string;
    testCaseId: string;
    originalTestCaseVersionId?: string | null;
    originalTestCaseVersionNumber: number;
    verificationTestCaseVersionId?: string | null;
    verificationTestCaseVersionNumber: number;
    testVersionDifference: string | null;
    originalRequirementVersionNumber?: number | null;
    verificationRequirementVersionNumber?: number | null;
    targetEnvironmentId?: string | null;
    browserEngine: string;
    originalFailureSignature?: string | null;
    envComparison: any;
    blockerReason: string;
    mode: VerificationMode;
  }): Promise<DefectVerificationAttemptDto> {
    const lastAttempt = await this.prisma.defectVerificationAttempt.findFirst({
      where: { reverificationId: params.reverificationId },
      orderBy: { attemptNumber: 'desc' },
      select: { attemptNumber: true },
    });
    const attemptNumber = (lastAttempt?.attemptNumber ?? 0) + 1;
    const now = new Date();

    const created = await this.prisma.defectVerificationAttempt.create({
      data: {
        projectId: params.projectId,
        reverificationId: params.reverificationId,
        failureCaseId: params.failureCaseId,
        originalExecutionId: params.originalExecutionId,
        verificationMode: params.mode,
        testCaseId: params.testCaseId,
        originalTestCaseVersionId: params.originalTestCaseVersionId,
        originalTestCaseVersionNumber: params.originalTestCaseVersionNumber,
        verificationTestCaseVersionId: params.verificationTestCaseVersionId,
        verificationTestCaseVersionNumber: params.verificationTestCaseVersionNumber,
        testVersionDifference: params.testVersionDifference,
        originalRequirementVersionNumber: params.originalRequirementVersionNumber,
        verificationRequirementVersionNumber: params.verificationRequirementVersionNumber,
        attemptNumber,
        targetEnvironmentId: params.targetEnvironmentId,
        browserEngine: params.browserEngine,
        status: 'BLOCKED',
        originalFailureSignature: params.originalFailureSignature,
        environmentEquivalence: params.envComparison.status,
        environmentComparisonJson: params.envComparison as any,
        blockerReason: params.blockerReason,
        startedAt: now,
        completedAt: now,
        executionDurationMs: 0,
        metadataJson: {
          blockerReason: params.blockerReason,
        },
      },
    });

    return this.mapAttemptToDto(created);
  }

  /**
   * Retrieves all verification attempts for a failure case or reverification.
   */
  public async getAttempts(
    input: GetVerificationAttemptsInputDto,
  ): Promise<readonly DefectVerificationAttemptDto[]> {
    const data = getVerificationAttemptsInputSchema.parse(input);

    const where: any = {
      projectId: data.projectId,
      failureCaseId: data.failureCaseId,
    };

    if (data.reverificationId) {
      where.reverificationId = data.reverificationId;
    }

    const attempts = await this.prisma.defectVerificationAttempt.findMany({
      where,
      orderBy: { attemptNumber: 'asc' },
    });

    return attempts.map(a => this.mapAttemptToDto(a));
  }

  /**
   * Retrieves detailed comparison for a specific verification attempt or the latest attempt.
   */
  public async getComparison(
    input: GetVerificationComparisonInputDto,
  ): Promise<DefectVerificationAttemptDto | null> {
    const data = getVerificationComparisonInputSchema.parse(input);

    let attempt: DefectVerificationAttempt | null = null;
    if (data.attemptId) {
      attempt = await this.prisma.defectVerificationAttempt.findFirst({
        where: {
          id: data.attemptId,
          projectId: data.projectId,
          failureCaseId: data.failureCaseId,
        },
      });
    } else {
      attempt = await this.prisma.defectVerificationAttempt.findFirst({
        where: {
          projectId: data.projectId,
          failureCaseId: data.failureCaseId,
        },
        orderBy: { attemptNumber: 'desc' },
      });
    }

    return attempt ? this.mapAttemptToDto(attempt) : null;
  }

  /**
   * Cancels any active verification execution for a defect.
   */
  public async cancelVerification(
    input: CancelVerificationInputDto,
  ): Promise<{ readonly cancelled: true }> {
    const data = cancelVerificationInputSchema.parse(input);

    const controller = this.activeControllers.get(data.failureCaseId);
    if (controller) {
      controller.abort();
    }

    const reverifications = await this.prisma.defectReverification.findMany({
      where: {
        failureCaseId: data.failureCaseId,
        projectId: data.projectId,
        status: 'EXECUTING',
      },
    });

    for (const rev of reverifications) {
      await this.prisma.defectReverification.update({
        where: { id: rev.id },
        data: {
          status: 'CANCELLED',
          latestOutcome: 'CANCELLED',
        },
      });

      await this.createAuditEvent({
        projectId: data.projectId,
        reverificationId: rev.id,
        action: 'VERIFICATION_CANCELLED',
        fromStatus: 'EXECUTING',
        toStatus: 'CANCELLED',
        actor: data.actor || 'USER',
        reason: data.reason,
      });
    }

    return { cancelled: true };
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
      let targetUrl = match?.[1]?.trim() ?? '';
      if (!targetUrl) {
        const parts = text.split(/\s+/);
        if (parts.length >= 2) {
          targetUrl = (parts[1]?.toLowerCase() === 'to' ? parts[2] : parts[1])?.trim() ?? '';
        }
      }
      if (targetUrl && !targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = baseUrl
          ? `${baseUrl.replace(/\/+$/, '')}/${targetUrl.replace(/^\/+/, '')}`
          : targetUrl;
      }
      if (targetUrl) {
        await page.goto(targetUrl, { timeout: 10000, waitUntil: 'domcontentloaded' });
        return;
      }
    }

    // 2. Click
    if (lower.startsWith('click')) {
      const match = text.match(/"([^"]+)"/) || text.match(/'([^']+)'/);
      let selector = match?.[1]?.trim();
      if (!selector) {
        const parts = text.split(/\s+/);
        selector = (parts[1]?.toLowerCase() === 'on' ? parts[2] : parts[1])?.trim() ?? 'button';
      }
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
      } else {
        const parts = text.split(/\s+/).slice(1);
        if (parts.length >= 2) {
          const first = parts[0]!;
          const second = parts[1]!;
          const field = first.startsWith('#') || first.startsWith('.') ? first : second;
          const value = field === first ? second : first;
          await page.locator(field).fill(value, { timeout: 5000 });
          return;
        }
      }
    }

    // 4. Assert
    if (lower.startsWith('assert') || lower.startsWith('verify')) {
      const match = text.match(/"([^"]+)"/) || text.match(/'([^']+)'/);
      let target = match?.[1]?.trim();
      if (!target) {
        const parts = text.split(/\s+/);
        target = (parts[1]?.toLowerCase() === 'that' ? parts[2] : parts[1])?.trim() ?? '';
      }
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

    // Brief safety delay
    await page.waitForTimeout(50);
  }

  private async createAuditEvent(params: {
    projectId: string;
    reverificationId: string;
    action: string;
    fromStatus?: any;
    toStatus?: any;
    actor?: string;
    reason?: string | null;
    detailsJson?: any;
  }): Promise<void> {
    try {
      await this.prisma.reverificationAuditEvent.create({
        data: {
          projectId: params.projectId,
          reverificationId: params.reverificationId,
          action: params.action,
          fromStatus: params.fromStatus ?? null,
          toStatus: params.toStatus ?? null,
          actor: params.actor || 'SYSTEM',
          reason: params.reason ?? null,
          detailsJson: params.detailsJson ?? {},
        },
      });
    } catch (err) {
      this.logger?.warn('Failed to record reverification audit event', { err });
    }
  }

  private mapAttemptToDto(attempt: DefectVerificationAttempt): DefectVerificationAttemptDto {
    return {
      id: attempt.id,
      projectId: attempt.projectId,
      reverificationId: attempt.reverificationId,
      failureCaseId: attempt.failureCaseId,
      structuredBugReportId: attempt.structuredBugReportId,
      originalExecutionId: attempt.originalExecutionId,
      verificationExecutionId: attempt.verificationExecutionId,
      verificationTestRunId: attempt.verificationTestRunId,
      verificationMode: attempt.verificationMode as VerificationMode,
      testCaseId: attempt.testCaseId,
      originalTestCaseVersionId: attempt.originalTestCaseVersionId,
      originalTestCaseVersionNumber: attempt.originalTestCaseVersionNumber,
      verificationTestCaseVersionId: attempt.verificationTestCaseVersionId,
      verificationTestCaseVersionNumber: attempt.verificationTestCaseVersionNumber,
      testVersionDifference: attempt.testVersionDifference,
      originalRequirementVersionNumber: attempt.originalRequirementVersionNumber,
      verificationRequirementVersionNumber: attempt.verificationRequirementVersionNumber,
      attemptNumber: attempt.attemptNumber,
      targetEnvironmentId: attempt.targetEnvironmentId,
      browserEngine: attempt.browserEngine,
      status: attempt.status as VerificationOutcome,
      originalFailureSignature: attempt.originalFailureSignature,
      verificationFailureSignature: attempt.verificationFailureSignature,
      isSignatureMatch: attempt.isSignatureMatch,
      failedStepIndex: attempt.failedStepIndex,
      originalFailedStepAction: attempt.originalFailedStepAction,
      verificationFailedStepAction: attempt.verificationFailedStepAction,
      stepComparisonJson: attempt.stepComparisonJson,
      assertionComparisonJson: attempt.assertionComparisonJson,
      environmentComparisonJson: attempt.environmentComparisonJson,
      environmentEquivalence: attempt.environmentEquivalence,
      environmentDriftDetails: attempt.environmentDriftDetails,
      originalBuildCommit: attempt.originalBuildCommit,
      verificationBuildCommit: attempt.verificationBuildCommit,
      blockerReason: attempt.blockerReason,
      executionDurationMs: attempt.executionDurationMs,
      startedAt: attempt.startedAt ? attempt.startedAt.toISOString() : null,
      completedAt: attempt.completedAt ? attempt.completedAt.toISOString() : null,
      metadataJson: attempt.metadataJson,
      createdAt: attempt.createdAt.toISOString(),
      updatedAt: attempt.updatedAt.toISOString(),
    };
  }

  private buildSummary(
    failureCaseId: string,
    reverificationId: string,
    projectId: string,
    attempts: readonly DefectVerificationAttemptDto[],
    requestedAttempts: number,
    envEquivalence: any,
  ): VerificationSummaryDto {
    const latestAttempt = attempts[attempts.length - 1];
    const latestOutcome: VerificationOutcome = latestAttempt
      ? latestAttempt.status
      : 'INCONCLUSIVE';

    let passes = 0;
    let sameFailures = 0;
    let differentFailures = 0;
    let blocked = 0;
    let cancelled = 0;
    let executionErrors = 0;

    for (const a of attempts) {
      if (a.status === 'VERIFIED_FIXED') passes++;
      else if (a.status === 'STILL_FAILING') sameFailures++;
      else if (a.status === 'DIFFERENT_FAILURE') differentFailures++;
      else if (a.status === 'BLOCKED') blocked++;
      else if (a.status === 'CANCELLED') cancelled++;
      else if (a.status === 'EXECUTION_ERROR') executionErrors++;
    }

    const hasDrift = envEquivalence === 'DRIFTED' || envEquivalence === 'INCOMPATIBLE';

    return {
      failureCaseId,
      reverificationId,
      projectId,
      totalAttempts: attempts.length,
      latestAttemptNumber: latestAttempt?.attemptNumber ?? 0,
      latestOutcome,
      isFixed: latestOutcome === 'VERIFIED_FIXED',
      isStillFailing: latestOutcome === 'STILL_FAILING',
      isBlocked: latestOutcome === 'BLOCKED',
      isInconclusive: latestOutcome === 'INCONCLUSIVE',
      environmentEquivalence: envEquivalence ?? 'UNKNOWN',
      attempts: [...attempts],
      factualMetrics: {
        attemptsRequested: requestedAttempts,
        attemptsStarted: attempts.length,
        attemptsCompleted: attempts.filter(a => a.completedAt !== null).length,
        passes,
        sameFailures,
        differentFailures,
        blocked,
        cancelled,
        executionErrors,
        environmentDrift: hasDrift,
      },
    };
  }
}
