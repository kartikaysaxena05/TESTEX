import type { PrismaClient, TestRun } from '@prisma/client';
import type { TestRunDto, RetryPolicyConfigDto } from '@ai-quality/contracts';
import {
  type IExecutionWorker,
  type RunOrchestratorConfig,
  type ExecutionWorkerResult,
} from './orchestration-types.js';
import { RunStateMachine } from './run-state-machine.js';
import { TestRunNotFoundError, TestRunAlreadyTerminalError } from './orchestration-errors.js';
import { ExecutionPersistenceService } from '../persistence/execution-persistence-service.js';
import { RetryPolicyEngine } from '../retry/retry-policy-engine.js';
import { FlakinessDetector } from '../retry/flakiness-detector.js';
import type { ILogger } from '../../logging/index.js';

export class RunOrchestrator {
  private readonly prisma: PrismaClient;
  private readonly persistenceService: ExecutionPersistenceService;
  private readonly retryEngine: RetryPolicyEngine;
  private readonly flakinessDetector: FlakinessDetector;
  private readonly logger?: ILogger;
  public readonly workerId: string;
  private readonly activeControllers: Map<string, AbortController> = new Map();
  private worker: IExecutionWorker;

  constructor(
    prisma: PrismaClient,
    config?: RunOrchestratorConfig & { readonly retryPolicy?: Partial<RetryPolicyConfigDto> },
    worker?: IExecutionWorker,
    logger?: ILogger,
    persistenceService?: ExecutionPersistenceService,
  ) {
    this.prisma = prisma;
    this.logger = logger;
    this.persistenceService =
      persistenceService ?? new ExecutionPersistenceService({ prisma, logger });
    this.retryEngine = new RetryPolicyEngine(config?.retryPolicy, logger);
    this.flakinessDetector = new FlakinessDetector();
    this.workerId = config?.workerId ?? `worker-${process.pid}-${Date.now().toString(36)}`;
    this.worker = worker ?? this.createDefaultWorker();
  }

  /**
   * Sets or overrides the execution worker (useful for testing and specialized environments).
   */
  public setWorker(worker: IExecutionWorker): void {
    this.worker = worker;
  }

  /**
   * Recovers orphaned/abandoned runs left in active state after an application restart or crash.
   */
  public async recoverOrphanedRuns(): Promise<number> {
    const res = await this.persistenceService.reconcileOrphanedExecutions();
    return res.reconciledCount;
  }

  /**
   * Executes a claimed test run through the authoritative lifecycle:
   * PREPARING -> RUNNING -> (Retry Loop) -> Terminal (PASSED / FAILED / BLOCKED / AUTOMATION_ERROR / CANCELLED).
   */
  public async executeClaimedRun(claimedRun: TestRun): Promise<TestRunDto> {
    const runId = claimedRun.id;
    const projectId = claimedRun.projectId;
    const abortController = new AbortController();
    this.activeControllers.set(runId, abortController);

    const tStart = performance.now();

    try {
      // 1. Check if cancellation arrived before execution start
      const currentFresh = await this.prisma.testRun.findUnique({
        where: { id: runId },
      });

      if (!currentFresh || currentFresh.status === 'CANCELLED' || currentFresh.cancelRequestedAt) {
        const now = new Date();
        const cancelledRecord = await this.prisma.testRun.update({
          where: { id: runId },
          data: {
            status: 'CANCELLED',
            cancelledAt: currentFresh?.cancelledAt ?? now,
            completedAt: now,
            terminalReason: currentFresh?.terminalReason ?? 'Cancelled by user before execution.',
          },
        });
        return this.mapToDto(cancelledRecord);
      }

      // 2. Load and Validate Executable Test Plan
      const plan = await this.prisma.executableTestPlan.findUnique({
        where: { id: claimedRun.executableTestPlanId },
      });

      if (!plan) {
        const now = new Date();
        const blockedRecord = await this.prisma.testRun.update({
          where: { id: runId },
          data: {
            status: 'BLOCKED',
            completedAt: now,
            terminalReason: `Executable test plan '${claimedRun.executableTestPlanId}' not found.`,
            errorMessage: 'Plan was removed or missing from project.',
          },
        });
        return this.mapToDto(blockedRecord);
      }

      if (!plan.isExecutable || plan.status === 'INVALID') {
        const now = new Date();
        const blockedRecord = await this.prisma.testRun.update({
          where: { id: runId },
          data: {
            status: 'BLOCKED',
            completedAt: now,
            terminalReason: `Executable test plan has status '${plan.status}' and is not executable.`,
            errorMessage: 'Plan contains compilation errors or unsupported actions.',
          },
        });
        return this.mapToDto(blockedRecord);
      }

      if (plan.status === 'STALE') {
        const now = new Date();
        const blockedRecord = await this.prisma.testRun.update({
          where: { id: runId },
          data: {
            status: 'BLOCKED',
            completedAt: now,
            terminalReason: 'Executable test plan is STALE due to requirement modifications.',
            errorMessage: 'Underlying requirement was modified. Plan re-compilation required.',
          },
        });
        return this.mapToDto(blockedRecord);
      }

      // 3. Transition PREPARING -> RUNNING
      const nowStart = new Date();
      await this.prisma.testRun.update({
        where: { id: runId },
        data: {
          status: 'RUNNING',
          startedAt: nowStart,
          heartbeatAt: nowStart,
        },
      });

      let currentAttempt = 1;
      let finalWorkerResult: ExecutionWorkerResult | null = null;
      const maxAttempts = this.retryEngine.config.maxAttempts;

      // 4. Bounded Attempt Execution Loop
      while (currentAttempt <= maxAttempts) {
        if (abortController.signal.aborted) {
          break;
        }

        const tAttemptStart = performance.now();

        // A. Create or fetch durable TestCaseExecution record for this attempt
        const execution = await this.persistenceService.createExecution({
          projectId: claimedRun.projectId,
          testRunId: claimedRun.id,
          testCaseId: claimedRun.testCaseId,
          testCaseVersionId: claimedRun.testCaseVersionId,
          testCaseVersionNumber: claimedRun.testCaseVersionNumber,
          executableTestPlanId: claimedRun.executableTestPlanId,
          environmentId: claimedRun.environmentId,
          attempt: currentAttempt,
          browserEngine: claimedRun.browserEngine,
        });

        this.logger?.info('run_orchestrator.attempt_started', {
          runId,
          executionId: execution.id,
          attempt: currentAttempt,
          maxAttempts,
        });

        const runDto = this.mapToDto(claimedRun);
        let workerResult: ExecutionWorkerResult;

        try {
          workerResult = await this.worker.execute(runDto, abortController.signal);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const durationMs = Math.round(performance.now() - tAttemptStart);
          workerResult = {
            outcome: abortController.signal.aborted ? 'CANCELLED' : 'AUTOMATION_ERROR',
            terminalReason: 'Unexpected internal error during test execution.',
            errorMessage: errMsg.slice(0, 500),
            durationMs,
          };
        }

        const durationMs = Math.round(performance.now() - tAttemptStart);

        // B. Complete attempt record in database
        await this.persistenceService.completeExecution({
          projectId: claimedRun.projectId,
          testRunId: claimedRun.id,
          executionId: execution.id,
          status: workerResult.outcome as any,
          terminalReason: workerResult.terminalReason ?? null,
          errorMessage: workerResult.errorMessage ?? null,
          durationMs: workerResult.durationMs ?? durationMs,
        });

        finalWorkerResult = workerResult;

        // C. Check if finished or cancelled
        if (
          workerResult.outcome === 'PASSED' ||
          workerResult.outcome === 'CANCELLED' ||
          abortController.signal.aborted
        ) {
          break;
        }

        // D. Check Retry Eligibility for next attempt
        if (currentAttempt < maxAttempts) {
          const category = this.retryEngine.classifyFailureCategory(
            workerResult.errorMessage,
            workerResult.errorCode,
          );

          const decision = await this.retryEngine.evaluateDecision({
            projectId,
            testRunId: runId,
            currentAttemptNumber: currentAttempt,
            failureCategory: category,
            errorMessage: workerResult.errorMessage,
            planSteps: (plan.stepsJson as any) ?? [],
            abortSignal: abortController.signal,
          });

          if (!decision.shouldRetry) {
            this.logger?.info('run_orchestrator.retry_stopped_by_policy', {
              runId,
              attempt: currentAttempt,
              reason: decision.reason,
            });
            break;
          }

          // Bounded retry delay
          if (decision.delayMs > 0 && !abortController.signal.aborted) {
            await new Promise<void>(resolve => {
              const timer = setTimeout(resolve, decision.delayMs);
              abortController.signal.addEventListener('abort', () => {
                clearTimeout(timer);
                resolve();
              });
            });
          }

          currentAttempt++;
        } else {
          break;
        }
      }

      // 5. Load all attempts and evaluate flakiness/reliability
      const allAttempts = await this.persistenceService.listExecutionAttempts({
        projectId,
        testRunId: runId,
      });

      const reliabilityReport = this.flakinessDetector.evaluateReliability({
        projectId,
        testRunId: runId,
        testRun: this.mapToDto(claimedRun),
        attempts: allAttempts,
      });

      const totalDurationMs = Math.round(performance.now() - tStart);
      const finalOutcome = abortController.signal.aborted
        ? 'CANCELLED'
        : (finalWorkerResult?.outcome ?? 'FAILED');

      const finalRecord = await this.prisma.testRun.update({
        where: { id: runId },
        data: {
          status: finalOutcome as any,
          totalAttempts: allAttempts.length,
          passedAfterRetry: reliabilityReport.passedAfterRetry,
          reliabilityStatus: reliabilityReport.reliabilityStatus,
          completedAt: new Date(),
          executionDurationMs: totalDurationMs,
          terminalReason: finalWorkerResult?.terminalReason ?? null,
          errorMessage: finalWorkerResult?.errorMessage ?? null,
        },
      });

      this.logger?.info('run_orchestrator.execution_completed', {
        runId,
        projectId,
        status: finalRecord.status,
        totalAttempts: finalRecord.totalAttempts,
        passedAfterRetry: finalRecord.passedAfterRetry,
        reliabilityStatus: finalRecord.reliabilityStatus,
        durationMs: totalDurationMs,
      });

      return this.mapToDto(finalRecord);
    } finally {
      this.activeControllers.delete(runId);
    }
  }

  /**
   * Signals and records cancellation for a queued, preparing, or running test run.
   */
  public async cancelRun(runId: string, projectId: string, reason?: string): Promise<TestRunDto> {
    const run = await this.prisma.testRun.findUnique({
      where: { id: runId },
    });

    if (!run || run.projectId !== projectId) {
      throw new TestRunNotFoundError(runId, projectId);
    }

    if (RunStateMachine.isTerminal(run.status as any)) {
      throw new TestRunAlreadyTerminalError(runId, run.status, 'cancel');
    }

    const now = new Date();
    const cancellationReason = reason ?? 'Cancelled by user.';

    // If active controller exists, trigger cooperative abort signal immediately
    const controller = this.activeControllers.get(runId);
    if (controller) {
      controller.abort();
    }

    if (run.status === 'QUEUED') {
      // Immediate cancellation of queued run
      const updated = await this.prisma.testRun.update({
        where: { id: runId },
        data: {
          status: 'CANCELLED',
          cancelRequestedAt: now,
          cancelledAt: now,
          completedAt: now,
          terminalReason: cancellationReason,
        },
      });

      this.logger?.info('run_orchestrator.queued_cancelled', {
        runId,
        projectId,
        reason: cancellationReason,
      });

      return this.mapToDto(updated);
    }

    // PREPARING or RUNNING: Record cancelRequestedAt and transition to CANCELLED atomically
    const updated = await this.prisma.testRun.update({
      where: { id: runId },
      data: {
        status: 'CANCELLED',
        cancelRequestedAt: now,
        cancelledAt: now,
        completedAt: now,
        terminalReason: cancellationReason,
      },
    });

    this.logger?.info('run_orchestrator.running_cancelled', {
      runId,
      projectId,
      reason: cancellationReason,
    });

    return this.mapToDto(updated);
  }

  private createDefaultWorker(): IExecutionWorker {
    return {
      workerId: this.workerId,
      execute: async (
        _run: TestRunDto,
        abortSignal: AbortSignal,
      ): Promise<ExecutionWorkerResult> => {
        if (abortSignal.aborted) {
          return {
            outcome: 'CANCELLED',
            terminalReason: 'Cancelled before execution start.',
            durationMs: 0,
          };
        }

        // Controlled Phase 61 foundation placeholder execution
        return {
          outcome: 'PASSED',
          terminalReason: 'Orchestration execution completed successfully.',
          durationMs: 10,
        };
      },
    };
  }

  private mapToDto(run: TestRun): TestRunDto {
    return {
      id: run.id,
      projectId: run.projectId,
      testCaseId: run.testCaseId,
      testCaseVersionId: run.testCaseVersionId,
      testCaseVersionNumber: run.testCaseVersionNumber,
      executableTestPlanId: run.executableTestPlanId,
      environmentId: run.environmentId,
      targetApplicationId: run.targetApplicationId,
      status: run.status as any,
      idempotencyKey: run.idempotencyKey,
      workerId: run.workerId,
      leaseExpiresAt: run.leaseExpiresAt?.toISOString() ?? null,
      heartbeatAt: run.heartbeatAt?.toISOString() ?? null,
      queuedAt: run.queuedAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
      cancelRequestedAt: run.cancelRequestedAt?.toISOString() ?? null,
      cancelledAt: run.cancelledAt?.toISOString() ?? null,
      terminalReason: run.terminalReason,
      errorMessage: run.errorMessage,
      executionDurationMs: run.executionDurationMs,
      planFingerprint: run.planFingerprint,
      testCaseTitle: run.testCaseTitle,
      environmentName: run.environmentName,
      browserEngine: run.browserEngine as any,
      headless: run.headless,
      timeoutMs: run.timeoutMs,
      totalAttempts: (run as any).totalAttempts ?? 1,
      passedAfterRetry: Boolean((run as any).passedAfterRetry),
      reliabilityStatus: (run as any).reliabilityStatus ?? 'NOT_EVALUATED',
      healingUsed: Boolean((run as any).healingUsed),
      healingCount: (run as any).healingCount ?? 0,
      diagnosticsJson: (run as any).diagnosticsJson ?? [],
      metadataJson: (run as any).metadataJson ?? {},
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    };
  }
}
