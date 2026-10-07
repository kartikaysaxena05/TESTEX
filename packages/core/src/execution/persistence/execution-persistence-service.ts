/**
 * @file packages/core/src/execution/persistence/execution-persistence-service.ts
 * Authoritative domain service for durable execution persistence, step-level audit trail,
 * secret redaction, startup crash reconciliation, and historical audit queries.
 */

import type {
  PrismaClient,
  TestCaseExecution,
  StepExecutionRecord,
  AssertionExecutionRecord,
  TestExecutionStateTransition,
} from '@prisma/client';
import {
  type CreateExecutionInputDto,
  type StartStepExecutionInputDto,
  type CompleteStepExecutionInputDto,
  type CompleteExecutionInputDto,
  type GetExecutionInputDto,
  type ListExecutionsInputDto,
  type GetExecutionStepsInputDto,
  type GetExecutionAuditTimelineInputDto,
  type ReconcileOrphanedExecutionsInputDto,
  type TestCaseExecutionDto,
  type StepExecutionRecordDto,
  type AssertionExecutionRecordDto,
  type TestExecutionStateTransitionDto,
  type ExecutionAuditTimelineDto,
  type ExecutionAuditTimelineEventDto,
  type GetHealingAttemptsInputDto,
  type LocatorHealingAttemptDto,
  type ListHealingSuggestionsInputDto,
  type LocatorHealingSuggestionDto,
  type ReviewHealingSuggestionInputDto,
  createExecutionInputSchema,
  startStepExecutionInputSchema,
  completeStepExecutionInputSchema,
  completeExecutionInputSchema,
  getExecutionInputSchema,
  listExecutionsInputSchema,
  getExecutionStepsInputSchema,
  getExecutionAuditTimelineInputSchema,
  reconcileOrphanedExecutionsInputSchema,
  getHealingAttemptsInputSchema,
  listHealingSuggestionsInputSchema,
  reviewHealingSuggestionInputSchema,
} from '@ai-quality/contracts';
import {
  EXECUTION_PERSISTENCE_BOUNDS,
  type IExecutionPersistenceService,
} from './execution-persistence-types.js';
import {
  ExecutionNotFoundError,
  StepExecutionNotFoundError,
  ExecutionAlreadyTerminalError,
  ExecutionOwnershipMismatchError,
} from './execution-persistence-errors.js';
import { ExecutionRequestInvalidError } from '../execution-errors.js';
import { SecretRedactor } from '../sessions/secret-redactor.js';
import type { ILogger } from '../../logging/index.js';

export interface ExecutionPersistenceServiceDependencies {
  readonly prisma: PrismaClient;
  readonly secretRedactor?: SecretRedactor;
  readonly logger?: ILogger;
}

export class ExecutionPersistenceService implements IExecutionPersistenceService {
  private readonly prisma: PrismaClient;
  private readonly secretRedactor: SecretRedactor;
  private readonly logger?: ILogger;

  constructor(deps: ExecutionPersistenceServiceDependencies) {
    this.prisma = deps.prisma;
    this.secretRedactor = deps.secretRedactor ?? new SecretRedactor();
    this.logger = deps.logger;
  }

  /**
   * Initializes a durable, write-ahead TestCaseExecution record in PREPARING status.
   */
  public async createExecution(input: CreateExecutionInputDto): Promise<TestCaseExecutionDto> {
    const parseResult = createExecutionInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new ExecutionRequestInvalidError('Invalid create execution parameters', {
        errors: parseResult.error.errors,
      });
    }

    const data = parseResult.data;
    const attempt = data.attempt ?? 1;

    // 1. Verify Project
    const project = await this.prisma.project.findUnique({
      where: { id: data.projectId },
      select: { id: true },
    });
    if (!project) {
      throw new ExecutionNotFoundError(data.testRunId, data.projectId);
    }

    // 2. Verify TestCase belongs to Project
    const testCase = await this.prisma.testCase.findUnique({
      where: { id: data.testCaseId },
      select: { id: true, projectId: true },
    });
    if (!testCase || testCase.projectId !== data.projectId) {
      throw new ExecutionOwnershipMismatchError(
        'TestCase',
        data.testCaseId,
        data.projectId,
        testCase?.projectId ?? 'UNKNOWN',
      );
    }

    // 3. Verify TestRun belongs to Project
    const testRun = await this.prisma.testRun.findUnique({
      where: { id: data.testRunId },
      select: { id: true, projectId: true },
    });
    if (!testRun || testRun.projectId !== data.projectId) {
      throw new ExecutionOwnershipMismatchError(
        'TestRun',
        data.testRunId,
        data.projectId,
        testRun?.projectId ?? 'UNKNOWN',
      );
    }

    // 4. Idempotency Check: Existing execution for same run and attempt
    const existing = await this.prisma.testCaseExecution.findUnique({
      where: {
        testRunId_attempt: {
          testRunId: data.testRunId,
          attempt,
        },
      },
      include: {
        stepExecutions: {
          include: { assertionExecutionRecords: true },
          orderBy: { stepIndex: 'asc' },
        },
        stateTransitions: {
          orderBy: { transitionedAt: 'asc' },
        },
      },
    });

    if (existing) {
      return this.mapExecutionToDto(existing);
    }

    // 5. Redact safe environment snapshot & metadata
    const safeEnvSnapshot = this.secretRedactor.redactObject(
      (data.environmentSnapshotJson as Record<string, unknown>) ?? {},
    ) as Record<string, unknown>;
    const safeMetadata = this.secretRedactor.redactObject(
      (data.metadataJson as Record<string, unknown>) ?? {},
    ) as Record<string, unknown>;

    // 6. Create execution & initial state transition atomically
    const now = new Date();
    const created = await this.prisma.$transaction(async tx => {
      const execution = await tx.testCaseExecution.create({
        data: {
          projectId: data.projectId,
          testRunId: data.testRunId,
          testCaseId: data.testCaseId,
          testCaseVersionId: data.testCaseVersionId ?? null,
          testCaseVersionNumber: data.testCaseVersionNumber,
          executableTestPlanId: data.executableTestPlanId,
          environmentId: data.environmentId ?? null,
          attempt,
          status: 'PREPARING',
          startedAt: now,
          browserEngine: data.browserEngine ?? 'chromium',
          environmentSnapshotJson: safeEnvSnapshot as any,
          metadataJson: safeMetadata as any,
        },
      });

      await tx.testExecutionStateTransition.create({
        data: {
          projectId: data.projectId,
          testRunId: data.testRunId,
          executionId: execution.id,
          fromStatus: null,
          toStatus: 'PREPARING',
          reason: 'Execution initialized',
          metadataJson: safeMetadata as any,
          transitionedAt: now,
        },
      });

      return await tx.testCaseExecution.findUniqueOrThrow({
        where: { id: execution.id },
        include: {
          stepExecutions: {
            include: { assertionExecutionRecords: true },
            orderBy: { stepIndex: 'asc' },
          },
          stateTransitions: {
            orderBy: { transitionedAt: 'asc' },
          },
        },
      });
    });

    this.logger?.info('execution_persistence.execution_created', {
      executionId: created.id,
      testRunId: created.testRunId,
      projectId: created.projectId,
      testCaseId: created.testCaseId,
      testCaseVersionNumber: created.testCaseVersionNumber,
      attempt,
    });

    return this.mapExecutionToDto(created);
  }

  /**
   * Starts a step execution and persists it incrementally with authoritative step ordering.
   */
  public async startStep(input: StartStepExecutionInputDto): Promise<StepExecutionRecordDto> {
    const parseResult = startStepExecutionInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new ExecutionRequestInvalidError('Invalid start step execution parameters', {
        errors: parseResult.error.errors,
      });
    }

    const data = parseResult.data;
    const attempt = data.attempt ?? 1;

    // 1. Verify Execution belongs to Project
    const execution = await this.prisma.testCaseExecution.findUnique({
      where: { id: data.executionId },
      select: { id: true, projectId: true, status: true },
    });

    if (!execution || execution.projectId !== data.projectId) {
      throw new ExecutionNotFoundError(data.executionId, data.projectId);
    }

    // 2. Idempotency Check
    const existing = await this.prisma.stepExecutionRecord.findUnique({
      where: {
        executionId_stepIndex_attempt: {
          executionId: data.executionId,
          stepIndex: data.stepIndex,
          attempt,
        },
      },
      include: { assertionExecutionRecords: true },
    });

    if (existing) {
      return this.mapStepToDto(existing);
    }

    // 3. Redact Action Data and Summaries
    const safeActionData = this.secretRedactor.redactObject(
      (data.actionDataJson as Record<string, unknown>) ?? {},
    ) as Record<string, unknown>;
    const safeTarget = data.targetSummary
      ? this.secretRedactor
          .redactText(data.targetSummary)
          .slice(0, EXECUTION_PERSISTENCE_BOUNDS.MAX_TARGET_SUMMARY_LENGTH)
      : null;
    const safeExpected = data.expectedSummary
      ? this.secretRedactor
          .redactText(data.expectedSummary)
          .slice(0, EXECUTION_PERSISTENCE_BOUNDS.MAX_SUMMARY_LENGTH)
      : null;
    const safeMetadata = this.secretRedactor.redactObject(
      (data.metadataJson as Record<string, unknown>) ?? {},
    ) as Record<string, unknown>;

    const now = new Date();
    const created = await this.prisma.stepExecutionRecord.create({
      data: {
        projectId: data.projectId,
        testRunId: data.testRunId,
        executionId: data.executionId,
        sourceStepId: data.sourceStepId ?? null,
        stepIndex: data.stepIndex,
        attempt,
        actionType: data.actionType.slice(0, EXECUTION_PERSISTENCE_BOUNDS.MAX_ACTION_TYPE_LENGTH),
        status: 'RUNNING',
        startedAt: now,
        targetSummary: safeTarget,
        actionDataJson: safeActionData as any,
        expectedSummary: safeExpected,
        metadataJson: safeMetadata as any,
      },
      include: { assertionExecutionRecords: true },
    });

    return this.mapStepToDto(created);
  }

  /**
   * Completes a step execution, persists step duration, status, actual summary, and assertion records atomically.
   */
  public async completeStep(input: CompleteStepExecutionInputDto): Promise<StepExecutionRecordDto> {
    const parseResult = completeStepExecutionInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new ExecutionRequestInvalidError('Invalid complete step execution parameters', {
        errors: parseResult.error.errors,
      });
    }

    const data = parseResult.data;

    // 1. Verify Step exists and belongs to Project
    const existing = await this.prisma.stepExecutionRecord.findUnique({
      where: { id: data.stepExecutionId },
      include: { assertionExecutionRecords: true },
    });

    if (
      !existing ||
      existing.projectId !== data.projectId ||
      existing.executionId !== data.executionId
    ) {
      throw new StepExecutionNotFoundError(data.stepExecutionId, data.executionId);
    }

    // 2. Terminal Idempotency: If already terminal and matching, return cleanly
    if (
      ['PASSED', 'FAILED', 'CANCELLED', 'AUTOMATION_ERROR', 'BLOCKED', 'SKIPPED'].includes(
        existing.status,
      ) &&
      existing.status === data.status
    ) {
      return this.mapStepToDto(existing);
    }

    // 3. Redact Actual Summary and Errors
    const safeActual = data.actualSummary
      ? this.secretRedactor
          .redactText(data.actualSummary)
          .slice(0, EXECUTION_PERSISTENCE_BOUNDS.MAX_SUMMARY_LENGTH)
      : null;
    const safeError = data.errorMessage
      ? this.secretRedactor
          .redactText(data.errorMessage)
          .slice(0, EXECUTION_PERSISTENCE_BOUNDS.MAX_ERROR_MESSAGE_LENGTH)
      : null;
    const safeCode = data.errorCode
      ? data.errorCode.slice(0, EXECUTION_PERSISTENCE_BOUNDS.MAX_ERROR_CODE_LENGTH)
      : null;
    const safeMetadata = this.secretRedactor.redactObject(
      (data.metadataJson as Record<string, unknown>) ?? {},
    ) as Record<string, unknown>;

    const durationMs = Math.max(0, data.durationMs);
    const now = new Date();

    // 4. Update Step and Insert Assertions atomically
    const updated = await this.prisma.$transaction(async tx => {
      await tx.stepExecutionRecord.update({
        where: { id: data.stepExecutionId },
        data: {
          status: data.status as any,
          completedAt: now,
          durationMs,
          actualSummary: safeActual,
          errorCode: safeCode,
          errorMessage: safeError,
          metadataJson: safeMetadata as any,
        },
      });

      if (data.assertionResults && data.assertionResults.length > 0) {
        for (const assertion of data.assertionResults) {
          const safeTargetSummary = assertion.targetSummary
            ? this.secretRedactor
                .redactText(assertion.targetSummary)
                .slice(0, EXECUTION_PERSISTENCE_BOUNDS.MAX_TARGET_SUMMARY_LENGTH)
            : null;
          const safeMessage = assertion.message
            ? this.secretRedactor
                .redactText(assertion.message)
                .slice(0, EXECUTION_PERSISTENCE_BOUNDS.MAX_SUMMARY_LENGTH)
            : null;
          const safeAssertionError = assertion.errorMessage
            ? this.secretRedactor
                .redactText(assertion.errorMessage)
                .slice(0, EXECUTION_PERSISTENCE_BOUNDS.MAX_ERROR_MESSAGE_LENGTH)
            : null;
          const safeExpected =
            assertion.expected !== undefined
              ? this.secretRedactor.redactObject(assertion.expected)
              : undefined;
          const safeActualVal =
            assertion.actual !== undefined
              ? this.secretRedactor.redactObject(assertion.actual)
              : undefined;

          await tx.assertionExecutionRecord.create({
            data: {
              projectId: data.projectId,
              testRunId: data.testRunId,
              executionId: data.executionId,
              stepExecutionId: data.stepExecutionId,
              sourceAssertionId: assertion.assertionId ?? null,
              assertionType: assertion.assertionType,
              operator: assertion.operator,
              status: assertion.status,
              isHard: assertion.isHard ?? true,
              targetSummary: safeTargetSummary,
              expectedValueJson: safeExpected !== undefined ? (safeExpected as any) : undefined,
              actualValueJson: safeActualVal !== undefined ? (safeActualVal as any) : undefined,
              message: safeMessage,
              errorCode: assertion.errorCode ?? null,
              errorMessage: safeAssertionError,
              durationMs: Math.max(0, assertion.durationMs ?? 0),
              evaluatedAt: assertion.completedAt ? new Date(assertion.completedAt) : now,
            },
          });
        }
      }

      return await tx.stepExecutionRecord.findUniqueOrThrow({
        where: { id: data.stepExecutionId },
        include: { assertionExecutionRecords: true },
      });
    });

    return this.mapStepToDto(updated);
  }

  /**
   * Completes a TestCaseExecution, transitions its terminal state, and records state transition audit.
   */
  public async completeExecution(input: CompleteExecutionInputDto): Promise<TestCaseExecutionDto> {
    const parseResult = completeExecutionInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new ExecutionRequestInvalidError('Invalid complete execution parameters', {
        errors: parseResult.error.errors,
      });
    }

    const data = parseResult.data;

    // 1. Verify Execution exists
    const existing = await this.prisma.testCaseExecution.findUnique({
      where: { id: data.executionId },
      include: {
        stepExecutions: {
          include: { assertionExecutionRecords: true },
          orderBy: { stepIndex: 'asc' },
        },
        stateTransitions: {
          orderBy: { transitionedAt: 'asc' },
        },
      },
    });

    if (!existing || existing.projectId !== data.projectId) {
      throw new ExecutionNotFoundError(data.executionId, data.projectId);
    }

    // 2. Terminal State Protection
    const terminalStatuses = ['PASSED', 'FAILED', 'CANCELLED', 'AUTOMATION_ERROR', 'BLOCKED'];
    if (terminalStatuses.includes(existing.status)) {
      if (existing.status === data.status) {
        return this.mapExecutionToDto(existing);
      }
      throw new ExecutionAlreadyTerminalError(data.executionId, existing.status, data.status);
    }

    // 3. Redact Terminal Reason & Error Message
    const safeReason = data.terminalReason
      ? this.secretRedactor
          .redactText(data.terminalReason)
          .slice(0, EXECUTION_PERSISTENCE_BOUNDS.MAX_SUMMARY_LENGTH)
      : null;
    const safeError = data.errorMessage
      ? this.secretRedactor
          .redactText(data.errorMessage)
          .slice(0, EXECUTION_PERSISTENCE_BOUNDS.MAX_ERROR_MESSAGE_LENGTH)
      : null;
    const safeCode = data.errorCode
      ? data.errorCode.slice(0, EXECUTION_PERSISTENCE_BOUNDS.MAX_ERROR_CODE_LENGTH)
      : null;
    const safeMetadata = this.secretRedactor.redactObject(
      (data.metadataJson as Record<string, unknown>) ?? {},
    ) as Record<string, unknown>;

    const now = new Date();
    const durationMs =
      data.durationMs !== undefined
        ? Math.max(0, data.durationMs)
        : existing.startedAt
          ? Math.max(0, Math.round(now.getTime() - existing.startedAt.getTime()))
          : 0;

    // 4. Update Execution, TestRun, and create StateTransition atomically
    const updated = await this.prisma.$transaction(async tx => {
      const exec = await tx.testCaseExecution.update({
        where: { id: data.executionId },
        data: {
          status: data.status as any,
          completedAt: now,
          durationMs,
          terminalReason: safeReason,
          errorMessage: safeError,
          errorCode: safeCode,
          metadataJson: safeMetadata as any,
        },
        include: {
          stepExecutions: {
            include: { assertionExecutionRecords: true },
            orderBy: { stepIndex: 'asc' },
          },
          stateTransitions: {
            orderBy: { transitionedAt: 'asc' },
          },
        },
      });

      // Update parent TestRun if linked
      await tx.testRun.updateMany({
        where: { id: existing.testRunId },
        data: {
          status: data.status as any,
          completedAt: now,
          executionDurationMs: durationMs,
          terminalReason: safeReason,
          errorMessage: safeError,
        },
      });

      await tx.testExecutionStateTransition.create({
        data: {
          projectId: data.projectId,
          testRunId: data.testRunId,
          executionId: data.executionId,
          fromStatus: existing.status,
          toStatus: data.status as any,
          reason: safeReason,
          metadataJson: safeMetadata as any,
          transitionedAt: now,
        },
      });

      return exec;
    });

    this.logger?.info('execution_persistence.execution_completed', {
      executionId: updated.id,
      testRunId: updated.testRunId,
      status: updated.status,
      durationMs: updated.durationMs,
    });

    return this.mapExecutionToDto(updated);
  }

  /**
   * Startup reconciliation: detects and recovers orphaned executions left in active states after crash.
   */
  public async reconcileOrphanedExecutions(
    input?: ReconcileOrphanedExecutionsInputDto,
  ): Promise<{ readonly reconciledCount: number }> {
    const validated = reconcileOrphanedExecutionsInputSchema.safeParse(input ?? {});
    const projectId = validated.success ? validated.data.projectId : undefined;

    const whereClause: Record<string, unknown> = {
      status: { in: ['PREPARING', 'RUNNING'] },
    };
    if (projectId) {
      whereClause.projectId = projectId;
    }

    const [orphanedExecutions, orphanedRuns] = await Promise.all([
      this.prisma.testCaseExecution.findMany({
        where: whereClause as any,
      }),
      this.prisma.testRun.findMany({
        where: whereClause as any,
      }),
    ]);

    const totalCount = Math.max(orphanedExecutions.length, orphanedRuns.length);
    if (totalCount === 0) {
      return { reconciledCount: 0 };
    }

    const now = new Date();
    const reason =
      'PROCESS_INTERRUPTED: Application restarted or execution process exited unexpectedly.';
    const errorMsg = 'Execution process was interrupted before completion.';

    await this.prisma.$transaction(async tx => {
      for (const exec of orphanedExecutions) {
        await tx.testCaseExecution.update({
          where: { id: exec.id },
          data: {
            status: 'AUTOMATION_ERROR',
            completedAt: now,
            terminalReason: reason,
            errorMessage: errorMsg,
            errorCode: 'PROCESS_INTERRUPTED',
          },
        });

        await tx.testExecutionStateTransition.create({
          data: {
            projectId: exec.projectId,
            testRunId: exec.testRunId,
            executionId: exec.id,
            fromStatus: exec.status,
            toStatus: 'AUTOMATION_ERROR',
            reason,
            transitionedAt: now,
          },
        });
      }

      // Also reconcile orphaned TestRuns
      await tx.testRun.updateMany({
        where: whereClause as any,
        data: {
          status: 'AUTOMATION_ERROR',
          completedAt: now,
          terminalReason: reason,
          errorMessage: errorMsg,
        },
      });
    });

    this.logger?.warn('execution_persistence.orphaned_executions_reconciled', {
      reconciledCount: totalCount,
      executionIds: orphanedExecutions.map(e => e.id),
      runIds: orphanedRuns.map(r => r.id),
    });

    return { reconciledCount: totalCount };
  }

  /**
   * Retrieves a single TestCaseExecution record by ID or TestRunId with project isolation.
   */
  public async getExecution(input: GetExecutionInputDto): Promise<TestCaseExecutionDto> {
    const parseResult = getExecutionInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new ExecutionRequestInvalidError('Invalid get execution parameters', {
        errors: parseResult.error.errors,
      });
    }

    const { projectId, executionId, testRunId } = parseResult.data;

    let execution:
      | (TestCaseExecution & {
          stepExecutions?: (StepExecutionRecord & {
            assertionExecutionRecords?: AssertionExecutionRecord[];
          })[];
          stateTransitions?: TestExecutionStateTransition[];
        })
      | null = null;

    if (executionId) {
      execution = await this.prisma.testCaseExecution.findUnique({
        where: { id: executionId },
        include: {
          stepExecutions: {
            include: { assertionExecutionRecords: true },
            orderBy: { stepIndex: 'asc' },
          },
          stateTransitions: {
            orderBy: { transitionedAt: 'asc' },
          },
        },
      });
    } else if (testRunId) {
      execution = await this.prisma.testCaseExecution.findFirst({
        where: { testRunId, projectId },
        include: {
          stepExecutions: {
            include: { assertionExecutionRecords: true },
            orderBy: { stepIndex: 'asc' },
          },
          stateTransitions: {
            orderBy: { transitionedAt: 'asc' },
          },
        },
        orderBy: { attempt: 'desc' },
      });
    }

    if (!execution || execution.projectId !== projectId) {
      throw new ExecutionNotFoundError(executionId ?? testRunId ?? 'UNKNOWN', projectId);
    }

    return this.mapExecutionToDto(execution);
  }

  /**
   * Lists executions with project scoping, optional filters, and bounded pagination.
   */
  public async listExecutions(input: ListExecutionsInputDto): Promise<{
    readonly items: readonly TestCaseExecutionDto[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly totalPages: number;
  }> {
    const parseResult = listExecutionsInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new ExecutionRequestInvalidError('Invalid list executions parameters', {
        errors: parseResult.error.errors,
      });
    }

    const { projectId, testCaseId, testRunId, status } = parseResult.data;
    const page = Math.max(1, parseResult.data.page ?? 1);
    const pageSize = Math.min(
      EXECUTION_PERSISTENCE_BOUNDS.MAX_PAGE_SIZE,
      Math.max(1, parseResult.data.pageSize ?? EXECUTION_PERSISTENCE_BOUNDS.DEFAULT_PAGE_SIZE),
    );

    const where: Record<string, unknown> = { projectId };
    if (testCaseId) where.testCaseId = testCaseId;
    if (testRunId) where.testRunId = testRunId;
    if (status) where.status = status;

    const [total, items] = await Promise.all([
      this.prisma.testCaseExecution.count({ where: where as any }),
      this.prisma.testCaseExecution.findMany({
        where: where as any,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return {
      items: items.map(item => this.mapExecutionToDto(item)),
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Lists all execution attempts for a given test run in monotonic attempt order with strict project isolation.
   */
  public async listExecutionAttempts(input: {
    readonly projectId: string;
    readonly testRunId: string;
  }): Promise<readonly TestCaseExecutionDto[]> {
    const run = await this.prisma.testRun.findUnique({
      where: { id: input.testRunId },
      select: { id: true, projectId: true },
    });

    if (!run || run.projectId !== input.projectId) {
      throw new ExecutionNotFoundError(input.testRunId, input.projectId);
    }

    const executions = await this.prisma.testCaseExecution.findMany({
      where: {
        testRunId: input.testRunId,
        projectId: input.projectId,
      },
      include: {
        stepExecutions: {
          include: { assertionExecutionRecords: true },
          orderBy: { stepIndex: 'asc' },
        },
        stateTransitions: {
          orderBy: { transitionedAt: 'asc' },
        },
        evidenceBundles: {
          include: { artifacts: true },
        },
      },
      orderBy: { attempt: 'asc' },
    });

    return executions.map(e => this.mapExecutionToDto(e));
  }

  /**
   * Retrieves step execution records for an execution with bounded pagination.
   */
  public async getExecutionSteps(input: GetExecutionStepsInputDto): Promise<{
    readonly items: readonly StepExecutionRecordDto[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
  }> {
    const parseResult = getExecutionStepsInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new ExecutionRequestInvalidError('Invalid get execution steps parameters', {
        errors: parseResult.error.errors,
      });
    }

    const { projectId, executionId } = parseResult.data;
    const page = Math.max(1, parseResult.data.page ?? 1);
    const pageSize = Math.min(
      EXECUTION_PERSISTENCE_BOUNDS.MAX_PAGE_SIZE,
      Math.max(
        1,
        parseResult.data.pageSize ?? EXECUTION_PERSISTENCE_BOUNDS.DEFAULT_STEPS_PAGE_SIZE,
      ),
    );

    // Verify execution ownership
    const execution = await this.prisma.testCaseExecution.findUnique({
      where: { id: executionId },
      select: { id: true, projectId: true },
    });
    if (!execution || execution.projectId !== projectId) {
      throw new ExecutionNotFoundError(executionId, projectId);
    }

    const where = { executionId, projectId };
    const [total, items] = await Promise.all([
      this.prisma.stepExecutionRecord.count({ where }),
      this.prisma.stepExecutionRecord.findMany({
        where,
        include: { assertionExecutionRecords: true },
        orderBy: [{ stepIndex: 'asc' }, { attempt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: items.map(item => this.mapStepToDto(item)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Reconstructs an auditable chronological execution timeline from state transitions, steps, and assertions.
   */
  public async getExecutionAuditTimeline(
    input: GetExecutionAuditTimelineInputDto,
  ): Promise<ExecutionAuditTimelineDto> {
    const parseResult = getExecutionAuditTimelineInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new ExecutionRequestInvalidError('Invalid get audit timeline parameters', {
        errors: parseResult.error.errors,
      });
    }

    const { projectId, executionId } = parseResult.data;

    const execution = await this.prisma.testCaseExecution.findUnique({
      where: { id: executionId },
      include: {
        testCase: { select: { title: true } },
        testRun: { select: { queuedAt: true } },
        stepExecutions: {
          include: { assertionExecutionRecords: true },
          orderBy: [{ stepIndex: 'asc' }, { attempt: 'asc' }],
        },
        stateTransitions: {
          orderBy: { transitionedAt: 'asc' },
        },
      },
    });

    if (!execution || execution.projectId !== projectId) {
      throw new ExecutionNotFoundError(executionId, projectId);
    }

    const events: ExecutionAuditTimelineEventDto[] = [];

    // 1. Run Queued Event
    if (execution.testRun?.queuedAt) {
      events.push({
        id: `run-queued-${execution.testRunId}`,
        timestamp: execution.testRun.queuedAt.toISOString(),
        category: 'RUN_LIFECYCLE',
        status: 'QUEUED',
        title: 'Test Run Queued',
        description: 'Test run was queued in execution orchestrator.',
      });
    }

    // 2. State Transitions Events
    for (const transition of execution.stateTransitions) {
      events.push({
        id: `transition-${transition.id}`,
        timestamp: transition.transitionedAt.toISOString(),
        category: 'EXECUTION_LIFECYCLE',
        status: transition.toStatus,
        title: `Execution State: ${transition.toStatus}`,
        description: transition.reason ?? undefined,
        metadata: transition.metadataJson as Record<string, unknown>,
      });
    }

    // 3. Step & Assertion Events
    for (const step of execution.stepExecutions) {
      if (step.startedAt) {
        events.push({
          id: `step-start-${step.id}`,
          timestamp: step.startedAt.toISOString(),
          category: 'STEP_STARTED',
          status: 'RUNNING',
          title: `Step ${step.stepIndex} Started: ${step.actionType}`,
          description: step.targetSummary ?? step.expectedSummary ?? undefined,
          stepIndex: step.stepIndex,
          attempt: step.attempt,
        });
      }

      if (step.completedAt) {
        events.push({
          id: `step-complete-${step.id}`,
          timestamp: step.completedAt.toISOString(),
          category: 'STEP_COMPLETED',
          status: step.status,
          title: `Step ${step.stepIndex} Completed: ${step.status}`,
          description: step.actualSummary ?? step.errorMessage ?? undefined,
          stepIndex: step.stepIndex,
          attempt: step.attempt,
          durationMs: step.durationMs ?? undefined,
        });
      }

      for (const assertion of step.assertionExecutionRecords) {
        events.push({
          id: `assertion-${assertion.id}`,
          timestamp: assertion.evaluatedAt.toISOString(),
          category: 'ASSERTION_EVALUATED',
          status: assertion.status,
          title: `Assertion: ${assertion.assertionType} (${assertion.operator})`,
          description: assertion.message ?? assertion.errorMessage ?? undefined,
          stepIndex: step.stepIndex,
          durationMs: assertion.durationMs ?? undefined,
        });
      }
    }

    // Sort all timeline events chronologically
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return {
      executionId: execution.id,
      testRunId: execution.testRunId,
      projectId: execution.projectId,
      testCaseId: execution.testCaseId,
      testCaseTitle: execution.testCase?.title ?? 'Test Case',
      testCaseVersionNumber: execution.testCaseVersionNumber,
      status: execution.status as any,
      startedAt: execution.startedAt?.toISOString() ?? null,
      completedAt: execution.completedAt?.toISOString() ?? null,
      totalDurationMs: execution.durationMs,
      events,
    };
  }

  // ----------------------------------------------------------------------------
  // Phase 72: Self-Healing & Resource Lock Historical Audit Queries
  // ----------------------------------------------------------------------------

  /**
   * Retrieves locator self-healing attempts for a project, test run, or execution.
   */
  public async getHealingAttempts(
    input: GetHealingAttemptsInputDto,
  ): Promise<readonly LocatorHealingAttemptDto[]> {
    const validated = getHealingAttemptsInputSchema.parse(input);
    const whereClause: any = {
      projectId: validated.projectId,
    };
    if (validated.testRunId) {
      whereClause.testRunId = validated.testRunId;
    }
    if (validated.executionId) {
      whereClause.executionId = validated.executionId;
    }
    if (validated.stepIndex !== undefined) {
      whereClause.stepIndex = validated.stepIndex;
    }

    const items = await this.prisma.locatorHealingAttempt.findMany({
      where: whereClause,
      orderBy: [{ createdAt: 'asc' }, { stepIndex: 'asc' }],
    });

    return items.map(item => ({
      id: item.id,
      projectId: item.projectId,
      testRunId: item.testRunId,
      executionId: item.executionId,
      stepExecutionId: item.stepExecutionId,
      stepIndex: item.stepIndex,
      attempt: item.attempt,
      actionType: item.actionType,
      originalTarget: item.originalTargetJson as any,
      originalSelector: item.originalSelector,
      failureReason: item.failureReason,
      healingResult: item.healingResult as any,
      candidateCount: item.candidateCount,
      selectedCandidate: item.selectedCandidateJson as any,
      selectedScore: item.selectedScore,
      confidenceThreshold: item.confidenceThreshold,
      scoringModelVersion: item.scoringModelVersion,
      policyVersion: item.policyVersion,
      durationMs: item.durationMs,
      candidatesEvaluated: item.candidatesEvaluatedJson as any,
      actionAttempted: item.actionAttempted,
      actionSucceeded: item.actionSucceeded,
      evidenceBundleId: item.evidenceBundleId,
      createdAt: item.createdAt.toISOString(),
    }));
  }

  /**
   * Lists reviewable locator healing suggestions.
   */
  public async listHealingSuggestions(
    input: ListHealingSuggestionsInputDto,
  ): Promise<readonly LocatorHealingSuggestionDto[]> {
    const validated = listHealingSuggestionsInputSchema.parse(input);
    const whereClause: any = {
      projectId: validated.projectId,
    };
    if (validated.testCaseId) {
      whereClause.testCaseId = validated.testCaseId;
    }
    if (validated.reviewStatus) {
      whereClause.reviewStatus = validated.reviewStatus;
    }

    const items = await this.prisma.locatorHealingSuggestion.findMany({
      where: whereClause,
      orderBy: [{ createdAt: 'desc' }, { score: 'desc' }],
    });

    return items.map(item => ({
      id: item.id,
      projectId: item.projectId,
      testCaseId: item.testCaseId,
      testCaseVersionNumber: item.testCaseVersionNumber,
      stepIndex: item.stepIndex,
      originalTarget: item.originalTargetJson as any,
      suggestedTarget: item.suggestedTargetJson as any,
      suggestedSelector: item.suggestedSelector,
      reason: item.reason,
      score: item.score,
      reviewStatus: item.reviewStatus as any,
      discoveredInRunId: item.discoveredInRunId,
      reviewedAt: item.reviewedAt ? item.reviewedAt.toISOString() : null,
      reviewedBy: item.reviewedBy,
      rejectionReason: item.rejectionReason,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }));
  }

  /**
   * Reviews a locator healing suggestion (ACCEPTED or REJECTED).
   */
  public async reviewHealingSuggestion(
    input: ReviewHealingSuggestionInputDto,
  ): Promise<LocatorHealingSuggestionDto> {
    const validated = reviewHealingSuggestionInputSchema.parse(input);
    const now = new Date();

    const updated = await this.prisma.locatorHealingSuggestion.update({
      where: {
        id: validated.suggestionId,
      },
      data: {
        reviewStatus: validated.reviewStatus,
        reviewedAt: now,
        reviewedBy: validated.reviewerId ?? 'SYSTEM_USER',
        rejectionReason: validated.reviewStatus === 'REJECTED' ? validated.rejectionReason : null,
      },
    });

    return {
      id: updated.id,
      projectId: updated.projectId,
      testCaseId: updated.testCaseId,
      testCaseVersionNumber: updated.testCaseVersionNumber,
      stepIndex: updated.stepIndex,
      originalTarget: updated.originalTargetJson as any,
      suggestedTarget: updated.suggestedTargetJson as any,
      suggestedSelector: updated.suggestedSelector,
      reason: updated.reason,
      score: updated.score,
      reviewStatus: updated.reviewStatus as any,
      discoveredInRunId: updated.discoveredInRunId,
      reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
      reviewedBy: updated.reviewedBy,
      rejectionReason: updated.rejectionReason,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  // ----------------------------------------------------------------------------
  // Private Mapping Utilities
  // ----------------------------------------------------------------------------

  private mapExecutionToDto(
    execution: TestCaseExecution & {
      stepExecutions?: (StepExecutionRecord & {
        assertionExecutionRecords?: AssertionExecutionRecord[];
      })[];
      stateTransitions?: TestExecutionStateTransition[];
    },
  ): TestCaseExecutionDto {
    return {
      id: execution.id,
      projectId: execution.projectId,
      testRunId: execution.testRunId,
      testCaseId: execution.testCaseId,
      testCaseVersionId: execution.testCaseVersionId,
      testCaseVersionNumber: execution.testCaseVersionNumber,
      executableTestPlanId: execution.executableTestPlanId,
      environmentId: execution.environmentId,
      attempt: execution.attempt,
      status: execution.status as any,
      passedAfterRetry: Boolean((execution as any).passedAfterRetry),
      reliabilityStatus: ((execution as any).reliabilityStatus as any) ?? 'NOT_EVALUATED',
      retryReason: (execution as any).retryReason ?? null,
      retryEligibilityJson: ((execution as any).retryEligibilityJson as any) ?? {},
      healingUsed: Boolean((execution as any).healingUsed),
      healingCount: (execution as any).healingCount ?? 0,
      startedAt: execution.startedAt?.toISOString() ?? null,
      completedAt: execution.completedAt?.toISOString() ?? null,
      durationMs: execution.durationMs,
      terminalReason: execution.terminalReason,
      errorMessage: execution.errorMessage,
      errorCode: execution.errorCode,
      browserEngine: execution.browserEngine,
      environmentSnapshotJson: (execution.environmentSnapshotJson as any) ?? {},
      metadataJson: (execution.metadataJson as any) ?? {},
      createdAt: execution.createdAt.toISOString(),
      updatedAt: execution.updatedAt.toISOString(),
      stepExecutions: execution.stepExecutions?.map(s => this.mapStepToDto(s)),
      stateTransitions: execution.stateTransitions?.map(t => this.mapTransitionToDto(t)),
    };
  }

  private mapStepToDto(
    step: StepExecutionRecord & { assertionExecutionRecords?: AssertionExecutionRecord[] },
  ): StepExecutionRecordDto {
    return {
      id: step.id,
      projectId: step.projectId,
      testRunId: step.testRunId,
      executionId: step.executionId,
      sourceStepId: step.sourceStepId,
      stepIndex: step.stepIndex,
      attempt: step.attempt,
      actionType: step.actionType,
      status: step.status as any,
      healingStatus: (step as any).healingStatus ?? null,
      healedTarget: (step as any).healedTargetJson ?? null,
      healingScore: (step as any).healingScore ?? null,
      startedAt: step.startedAt?.toISOString() ?? null,
      completedAt: step.completedAt?.toISOString() ?? null,
      durationMs: step.durationMs,
      targetSummary: step.targetSummary,
      actionDataJson: (step.actionDataJson as any) ?? {},
      expectedSummary: step.expectedSummary,
      actualSummary: step.actualSummary,
      errorCode: step.errorCode,
      errorMessage: step.errorMessage,
      metadataJson: (step as any).metadataJson ?? {},
      assertionResults: (step.assertionExecutionRecords ?? []).map(a => this.mapAssertionToDto(a)),
      createdAt: step.createdAt.toISOString(),
      updatedAt: step.updatedAt.toISOString(),
    };
  }

  private mapAssertionToDto(assertion: AssertionExecutionRecord): AssertionExecutionRecordDto {
    return {
      id: assertion.id,
      projectId: assertion.projectId,
      testRunId: assertion.testRunId,
      executionId: assertion.executionId,
      stepExecutionId: assertion.stepExecutionId,
      sourceAssertionId: assertion.sourceAssertionId,
      assertionType: assertion.assertionType,
      operator: assertion.operator,
      status: assertion.status,
      isHard: assertion.isHard,
      targetSummary: assertion.targetSummary,
      expectedValueJson: assertion.expectedValueJson ?? undefined,
      actualValueJson: assertion.actualValueJson ?? undefined,
      message: assertion.message,
      errorCode: assertion.errorCode,
      errorMessage: assertion.errorMessage,
      durationMs: assertion.durationMs,
      evaluatedAt: assertion.evaluatedAt.toISOString(),
    };
  }

  private mapTransitionToDto(
    transition: TestExecutionStateTransition,
  ): TestExecutionStateTransitionDto {
    return {
      id: transition.id,
      projectId: transition.projectId,
      testRunId: transition.testRunId,
      executionId: transition.executionId,
      fromStatus: (transition.fromStatus as any) ?? null,
      toStatus: transition.toStatus as any,
      reason: transition.reason,
      metadataJson: (transition.metadataJson as any) ?? {},
      transitionedAt: transition.transitionedAt.toISOString(),
    };
  }
}
