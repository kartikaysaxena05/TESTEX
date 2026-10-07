/**
 * @file packages/core/src/execution/orchestration/test-run-service.ts
 * Authoritative domain service for test run lifecycle management, enqueuing, retrieval, cancellation, and queue state inspection.
 */

import type { PrismaClient, TestRun } from '@prisma/client';
import {
  type EnqueueTestRunInputDto,
  type GetTestRunInputDto,
  type ListTestRunsInputDto,
  type CancelTestRunInputDto,
  type TestRunDto,
  type TestRunQueueStateDto,
  enqueueTestRunInputSchema,
  getTestRunInputSchema,
  listTestRunsInputSchema,
  cancelTestRunInputSchema,
} from '@ai-quality/contracts';
import { RunQueue } from './run-queue.js';
import { RunOrchestrator } from './run-orchestrator.js';
import {
  TestRunNotFoundError,
  TestRunValidationError,
  TestRunPlanNotFoundError,
  TestRunPlanNotExecutableError,
  TestRunStaleError,
} from './orchestration-errors.js';
import {
  ExecutionProjectMismatchError,
  ExecutionTestNotApprovedError,
  ExecutionTestNotFoundError,
} from '../execution-errors.js';
import type { ILogger } from '../../logging/index.js';

export interface TestRunServiceDependencies {
  readonly prisma: PrismaClient;
  readonly queue?: RunQueue;
  readonly orchestrator?: RunOrchestrator;
  readonly logger?: ILogger;
}

export class TestRunService {
  private readonly prisma: PrismaClient;
  private readonly queue: RunQueue;
  private readonly orchestrator: RunOrchestrator;
  private readonly logger?: ILogger;

  constructor(deps: TestRunServiceDependencies) {
    this.prisma = deps.prisma;
    this.logger = deps.logger;
    this.queue = deps.queue ?? new RunQueue(deps.prisma, undefined, deps.logger);
    this.orchestrator =
      deps.orchestrator ?? new RunOrchestrator(deps.prisma, undefined, undefined, deps.logger);
  }

  public getQueue(): RunQueue {
    return this.queue;
  }

  public getOrchestrator(): RunOrchestrator {
    return this.orchestrator;
  }

  /**
   * Enqueues a new test execution run for an approved test case and compiled plan.
   */
  public async enqueueRun(input: EnqueueTestRunInputDto): Promise<TestRunDto> {
    const parseResult = enqueueTestRunInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new TestRunValidationError('Invalid enqueue test run input', {
        errors: parseResult.error.errors,
      });
    }

    const {
      projectId,
      testCaseId,
      testCaseVersionNumber,
      environmentId,
      browserEngine,
      headless,
      timeoutMs,
      idempotencyKey,
    } = parseResult.data;

    // 1. Verify Project
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, status: true },
    });

    if (!project) {
      throw new ExecutionProjectMismatchError(testCaseId, projectId, 'UNKNOWN');
    }

    // 2. Fetch TestCase and relations
    const testCase = await this.prisma.testCase.findUnique({
      where: { id: testCaseId },
      include: {
        versions: testCaseVersionNumber
          ? { where: { versionNumber: testCaseVersionNumber } }
          : { orderBy: { versionNumber: 'desc' }, take: 1 },
        sourceRequirement: {
          include: {
            versions: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!testCase) {
      throw new ExecutionTestNotFoundError(testCaseId, projectId);
    }

    if (testCase.projectId !== projectId) {
      throw new ExecutionProjectMismatchError(testCaseId, projectId, testCase.projectId);
    }

    // 3. Resolve Target Version and Check Approval
    const targetVersionNumber = testCaseVersionNumber ?? testCase.currentVersionNumber;
    const versionRecord = testCase.versions.find(v => v.versionNumber === targetVersionNumber);
    const activeReviewStatus = versionRecord ? versionRecord.reviewStatus : testCase.reviewStatus;

    if (activeReviewStatus !== 'APPROVED') {
      throw new ExecutionTestNotApprovedError(testCaseId, activeReviewStatus);
    }

    // 4. Check Requirement Staleness
    const latestReqVersion = testCase.sourceRequirement?.versions[0]?.versionNumber ?? 1;
    if (
      testCase.sourceRequirementVersionNumber !== null &&
      testCase.sourceRequirementVersionNumber !== undefined &&
      testCase.sourceRequirementVersionNumber < latestReqVersion
    ) {
      throw new TestRunStaleError(
        testCaseId,
        `Source requirement version advanced from ${testCase.sourceRequirementVersionNumber} to ${latestReqVersion}.`,
      );
    }

    // 5. Fetch and Verify Compiled Executable Test Plan
    const planWhere: any = {
      projectId,
      testCaseId,
      testCaseVersionNumber: targetVersionNumber,
    };
    if (environmentId) {
      planWhere.environmentId = environmentId;
    }

    const plan = await this.prisma.executableTestPlan.findFirst({
      where: planWhere,
      orderBy: { compiledAt: 'desc' },
    });

    if (!plan) {
      throw new TestRunPlanNotFoundError(testCaseId, targetVersionNumber);
    }

    if (!plan.isExecutable || plan.status === 'INVALID') {
      const diagCount = Array.isArray(plan.diagnosticsJson) ? plan.diagnosticsJson.length : 0;
      throw new TestRunPlanNotExecutableError(plan.id, plan.status, diagCount);
    }

    if (plan.status === 'STALE') {
      throw new TestRunStaleError(testCaseId, 'Associated executable test plan is marked STALE.');
    }

    // 6. Check Idempotency Key
    if (idempotencyKey) {
      const existingRun = await this.prisma.testRun.findUnique({
        where: {
          projectId_idempotencyKey: {
            projectId,
            idempotencyKey,
          },
        },
      });

      if (existingRun) {
        return this.mapToDto(existingRun);
      }
    }

    // 7. Check Queue Capacity
    await this.queue.assertCapacity(projectId);

    // 8. Resolve Target Environment Name
    let environmentName: string | null = null;
    if (environmentId) {
      const envRecord = await this.prisma.projectEnvironment.findUnique({
        where: { id: environmentId },
        select: { name: true, projectId: true },
      });
      if (envRecord) {
        if (envRecord.projectId !== projectId) {
          throw new ExecutionProjectMismatchError(testCaseId, projectId, envRecord.projectId);
        }
        environmentName = envRecord.name;
      }
    }

    // 9. Persist TestRun Record in PostgreSQL
    const createdRun = await this.prisma.testRun.create({
      data: {
        projectId,
        testCaseId,
        testCaseVersionId: versionRecord?.id ?? null,
        testCaseVersionNumber: targetVersionNumber,
        executableTestPlanId: plan.id,
        environmentId: environmentId ?? plan.environmentId ?? null,
        targetApplicationId: plan.targetApplicationId ?? null,
        status: 'QUEUED',
        idempotencyKey: idempotencyKey ?? null,
        planFingerprint: plan.planFingerprint,
        testCaseTitle: versionRecord?.title ?? testCase.title,
        environmentName,
        browserEngine,
        headless,
        timeoutMs,
        queuedAt: new Date(),
      },
    });

    this.logger?.info('test_run.enqueued', {
      runId: createdRun.id,
      projectId,
      testCaseId,
      testCaseVersionNumber: targetVersionNumber,
      planId: plan.id,
    });

    return this.mapToDto(createdRun);
  }

  /**
   * Retrieves a single test run by ID with strict project isolation.
   */
  public async getRun(input: GetTestRunInputDto): Promise<TestRunDto> {
    const parseResult = getTestRunInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new TestRunValidationError('Invalid get test run input', {
        errors: parseResult.error.errors,
      });
    }

    const { projectId, runId } = parseResult.data;

    const run = await this.prisma.testRun.findUnique({
      where: { id: runId },
    });

    if (!run || run.projectId !== projectId) {
      throw new TestRunNotFoundError(runId, projectId);
    }

    return this.mapToDto(run);
  }

  /**
   * Lists test runs for a project with optional status and test case filtering.
   */
  public async listRuns(input: ListTestRunsInputDto): Promise<readonly TestRunDto[]> {
    const parseResult = listTestRunsInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new TestRunValidationError('Invalid list test runs input', {
        errors: parseResult.error.errors,
      });
    }

    const { projectId, testCaseId, status, limit, offset } = parseResult.data;

    const whereClause: any = { projectId };
    if (testCaseId) {
      whereClause.testCaseId = testCaseId;
    }
    if (status) {
      whereClause.status = status;
    }

    const runs = await this.prisma.testRun.findMany({
      where: whereClause,
      orderBy: [{ queuedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
    });

    return runs.map(r => this.mapToDto(r));
  }

  /**
   * Cancels a queued, preparing, or running test execution.
   */
  public async cancelRun(input: CancelTestRunInputDto): Promise<TestRunDto> {
    const parseResult = cancelTestRunInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new TestRunValidationError('Invalid cancel test run input', {
        errors: parseResult.error.errors,
      });
    }

    const { projectId, runId, reason } = parseResult.data;
    return await this.orchestrator.cancelRun(runId, projectId, reason);
  }

  /**
   * Retrieves current queue state and worker metrics for a project.
   */
  public async getQueueState(projectId: string): Promise<TestRunQueueStateDto> {
    return await this.queue.getQueueState(projectId);
  }

  /**
   * Claims and executes the next pending run in the queue.
   */
  public async processNextQueueItem(projectId?: string): Promise<TestRunDto | null> {
    const claimed = await this.queue.claimNextRun(this.orchestrator.workerId, projectId);
    if (!claimed) {
      return null;
    }

    return await this.orchestrator.executeClaimedRun(claimed);
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
