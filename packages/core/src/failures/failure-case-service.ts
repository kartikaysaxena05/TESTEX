/**
 * @file packages/core/src/failures/failure-case-service.ts
 * Authoritative domain service for Failure Intelligence cases, lifecycle state transitions,
 * versioned analysis runs, and auditable V5 evidence references.
 */

import type {
  PrismaClient,
  FailureCase,
  FailureAnalysisRun,
  FailureEvidenceReference,
  TestRunStatus,
} from '@prisma/client';
import {
  type FailureCaseDto,
  type FailureAnalysisRunDto,
  type FailureEvidenceReferenceDto,
  type CreateFailureCaseInputDto,
  type EnsureFailureCaseInputDto,
  type GetFailureCaseInputDto,
  type ListFailureCasesInputDto,
  type StartFailureAnalysisInputDto,
  type CompleteFailureAnalysisInputDto,
  type FailFailureAnalysisInputDto,
  type CancelFailureAnalysisInputDto,
  type MarkFailureCaseStaleInputDto,
  type ListFailureAnalysisRunsInputDto,
  type ListFailureEvidenceReferencesInputDto,
  createFailureCaseInputSchema,
  ensureFailureCaseInputSchema,
  getFailureCaseInputSchema,
  listFailureCasesInputSchema,
  startFailureAnalysisInputSchema,
  completeFailureAnalysisInputSchema,
  failFailureAnalysisInputSchema,
  cancelFailureAnalysisInputSchema,
  markFailureCaseStaleInputSchema,
  listFailureAnalysisRunsInputSchema,
  listFailureEvidenceReferencesInputSchema,
} from '@ai-quality/contracts';
import {
  FAILURE_BOUNDS,
  type IFailureCaseService,
  type PaginatedFailureCasesDto,
} from './failure-types.js';
import {
  FailureCaseNotFoundError,
  ExecutionIneligibleForFailureCaseError,
  FailureCaseAlreadyExistsError,
  AnalysisAlreadyRunningError,
  CrossProjectAccessDeniedError,
  FailureAnalysisRunNotFoundError,
} from './failure-errors.js';
import {
  assertValidCaseTransition,
  assertValidRunTransition,
} from './failure-lifecycle-state-machine.js';
import type { ILogger } from '../logging/index.js';

export interface FailureCaseServiceDependencies {
  readonly prisma: PrismaClient;
  readonly logger?: ILogger;
}

const ELIGIBLE_EXECUTION_STATUSES: readonly TestRunStatus[] = [
  'FAILED',
  'AUTOMATION_ERROR',
  'BLOCKED',
];

export class FailureCaseService implements IFailureCaseService {
  private readonly prisma: PrismaClient;
  private readonly logger?: ILogger;

  constructor(deps: FailureCaseServiceDependencies) {
    this.prisma = deps.prisma;
    this.logger = deps.logger;
  }

  /**
   * Creates a new authoritative FailureCase from an eligible V5 execution.
   * Throws if a FailureCase already exists for this execution.
   */
  public async createFailureCase(input: CreateFailureCaseInputDto): Promise<FailureCaseDto> {
    const data = createFailureCaseInputSchema.parse(input);
    return this.internalCreateOrEnsureCase(data, false);
  }

  /**
   * Ensures an authoritative FailureCase exists for an eligible V5 execution.
   * Idempotent: returns existing FailureCase if already created.
   */
  public async ensureFailureCaseFromExecution(
    input: EnsureFailureCaseInputDto,
  ): Promise<FailureCaseDto> {
    const data = ensureFailureCaseInputSchema.parse(input);
    return this.internalCreateOrEnsureCase(data, true);
  }

  /**
   * Core internal implementation for creating or retrieving a FailureCase.
   */
  private async internalCreateOrEnsureCase(
    data: CreateFailureCaseInputDto,
    isIdempotent: boolean,
  ): Promise<FailureCaseDto> {
    // 1. Verify Project
    const project = await this.prisma.project.findUnique({
      where: { id: data.projectId },
      select: { id: true, status: true },
    });

    if (!project) {
      throw new CrossProjectAccessDeniedError(
        'Project',
        data.projectId,
        data.projectId,
        'NOT_FOUND',
      );
    }

    if (project.status === 'ARCHIVED') {
      throw new CrossProjectAccessDeniedError(
        'Project',
        data.projectId,
        data.projectId,
        'ARCHIVED',
      );
    }

    // 2. Fetch V5 Execution with all contextual relations
    const execution = await this.prisma.testCaseExecution.findUnique({
      where: { id: data.executionId },
      include: {
        project: true,
        testCase: {
          include: {
            sourceRequirement: true,
          },
        },
        testRun: true,
        stepExecutions: {
          orderBy: { stepIndex: 'asc' },
        },
        evidenceBundles: {
          include: {
            artifacts: true,
          },
        },
      },
    });

    if (!execution) {
      throw new CrossProjectAccessDeniedError(
        'TestCaseExecution',
        data.executionId,
        data.projectId,
        'NOT_FOUND',
      );
    }

    // 3. Project isolation check
    if (execution.projectId !== data.projectId) {
      throw new CrossProjectAccessDeniedError(
        'TestCaseExecution',
        data.executionId,
        data.projectId,
        execution.projectId,
      );
    }

    // 4. Validate execution eligibility
    if (execution.status === 'PASSED') {
      throw new ExecutionIneligibleForFailureCaseError(
        execution.id,
        execution.status,
        'PASSED executions must never become a failure intelligence case',
      );
    }

    if (!ELIGIBLE_EXECUTION_STATUSES.includes(execution.status)) {
      throw new ExecutionIneligibleForFailureCaseError(
        execution.id,
        execution.status,
        `Execution status '${execution.status}' is not eligible for failure intelligence analysis`,
      );
    }

    // 5. Check if FailureCase already exists for this execution
    const existingCase = await this.prisma.failureCase.findUnique({
      where: { executionId: data.executionId },
      include: {
        testCase: true,
        evidenceReferences: true,
        analysisRuns: true,
      },
    });

    if (existingCase) {
      if (existingCase.projectId !== data.projectId) {
        throw new CrossProjectAccessDeniedError(
          'FailureCase',
          existingCase.id,
          data.projectId,
          existingCase.projectId,
        );
      }
      if (isIdempotent) {
        return this.mapCaseToDto(existingCase);
      }
      throw new FailureCaseAlreadyExistsError(data.executionId, existingCase.id);
    }

    // 6. Find failed step context if applicable
    const failedStep = execution.stepExecutions.find(
      s => s.status === 'FAILED' || s.status === 'AUTOMATION_ERROR' || s.status === 'BLOCKED',
    );

    const title = data.title ?? execution.testCase.title;
    const failureSummary =
      data.failureSummary ??
      failedStep?.actualSummary ??
      execution.errorMessage ??
      execution.terminalReason ??
      `Test execution failed with status ${execution.status}`;

    // 7. Atomic transaction: create FailureCase + initial evidence references
    try {
      const createdCase = await this.prisma.$transaction(async tx => {
        const newCase = await tx.failureCase.create({
          data: {
            projectId: data.projectId,
            testCaseId: execution.testCaseId,
            testCaseVersionNumber: execution.testCaseVersionNumber,
            testRunId: execution.testRunId,
            executionId: execution.id,
            stepExecutionId: failedStep?.id ?? null,
            stepIndex: failedStep?.stepIndex ?? null,
            triggeringExecutionStatus: execution.status,
            status: 'READY',
            isEligible: true,
            title: title.slice(0, 255),
            failureSummary: failureSummary.slice(0, FAILURE_BOUNDS.MAX_FAILURE_SUMMARY_CHARS),
            errorCode: execution.errorCode ?? failedStep?.errorCode ?? null,
            errorMessage: execution.errorMessage ?? failedStep?.errorMessage ?? null,
            environmentId: execution.environmentId ?? null,
            metadataJson: (data.metadataJson as any) ?? {},
          },
        });

        // Collect evidence references from V5 artifacts
        const evidenceToCreate: Array<{
          projectId: string;
          failureCaseId: string;
          executionId: string;
          bundleId: string | null;
          artifactType: any;
          sourceArtifactId: string | null;
          stepExecutionId: string | null;
          storageIdentity: string | null;
          logicalName: string;
          mimeType: string | null;
          byteSize: number | null;
          sha256: string | null;
          metadataJson: any;
        }> = [];

        for (const bundle of execution.evidenceBundles) {
          for (const artifact of bundle.artifacts) {
            if (artifact.projectId !== data.projectId) {
              throw new CrossProjectAccessDeniedError(
                'ExecutionEvidenceArtifact',
                artifact.id,
                data.projectId,
                artifact.projectId,
              );
            }

            evidenceToCreate.push({
              projectId: data.projectId,
              failureCaseId: newCase.id,
              executionId: execution.id,
              bundleId: bundle.id,
              artifactType: artifact.artifactType,
              sourceArtifactId: artifact.id,
              stepExecutionId: artifact.stepExecutionId ?? bundle.stepExecutionId ?? null,
              storageIdentity: artifact.storageIdentity,
              logicalName: artifact.originalLogicalName,
              mimeType: artifact.mimeType,
              byteSize: artifact.byteSize,
              sha256: artifact.sha256,
              metadataJson: (artifact.metadataJson as any) ?? {},
            });
          }
        }

        if (evidenceToCreate.length > 0) {
          await tx.failureEvidenceReference.createMany({
            data: evidenceToCreate,
          });
        }

        return tx.failureCase.findUniqueOrThrow({
          where: { id: newCase.id },
          include: {
            testCase: true,
            evidenceReferences: true,
            analysisRuns: true,
          },
        });
      });

      this.logger?.info('failure_case.created', {
        projectId: data.projectId,
        failureCaseId: createdCase.id,
        executionId: execution.id,
        status: createdCase.status,
      });

      return this.mapCaseToDto(createdCase);
    } catch (err: unknown) {
      if ((err as any)?.code === 'P2002') {
        const existing = await this.prisma.failureCase.findUnique({
          where: { executionId: data.executionId },
          include: {
            testCase: true,
            evidenceReferences: true,
            analysisRuns: true,
          },
        });
        if (existing) {
          if (isIdempotent) {
            return this.mapCaseToDto(existing);
          }
          throw new FailureCaseAlreadyExistsError(data.executionId, existing.id);
        }
      }
      throw err;
    }
  }

  /**
   * Retrieves a single FailureCase by ID within a project.
   */
  public async getFailureCase(input: GetFailureCaseInputDto): Promise<FailureCaseDto> {
    const data = getFailureCaseInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: data.failureCaseId },
      include: {
        testCase: true,
        evidenceReferences: true,
        analysisRuns: true,
      },
    });

    if (!failureCase || failureCase.projectId !== data.projectId) {
      throw new FailureCaseNotFoundError(data.failureCaseId, data.projectId);
    }

    return this.mapCaseToDto(failureCase);
  }

  /**
   * Lists FailureCases for a project with optional filters and pagination.
   */
  public async listFailureCases(
    input: ListFailureCasesInputDto,
  ): Promise<PaginatedFailureCasesDto> {
    const data = listFailureCasesInputSchema.parse(input);
    const page = data.page ?? 1;
    const pageSize = Math.min(
      data.pageSize ?? FAILURE_BOUNDS.DEFAULT_PAGE_SIZE,
      FAILURE_BOUNDS.MAX_PAGE_SIZE,
    );
    const skip = (page - 1) * pageSize;

    const where = {
      projectId: data.projectId,
      ...(data.status ? { status: data.status } : {}),
      ...(data.testCaseId ? { testCaseId: data.testCaseId } : {}),
      ...(data.testRunId ? { testRunId: data.testRunId } : {}),
      ...(data.isStale !== undefined ? { isStale: data.isStale } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.failureCase.findMany({
        where,
        include: {
          testCase: true,
          evidenceReferences: true,
          analysisRuns: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.failureCase.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize) || 1;

    return {
      items: items.map(c => this.mapCaseToDto(c)),
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Starts a new versioned analysis run for a FailureCase.
   */
  public async startAnalysis(input: StartFailureAnalysisInputDto): Promise<FailureAnalysisRunDto> {
    const data = startFailureAnalysisInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: data.failureCaseId },
      include: {
        testCase: true,
        evidenceReferences: true,
      },
    });

    if (!failureCase || failureCase.projectId !== data.projectId) {
      throw new FailureCaseNotFoundError(data.failureCaseId, data.projectId);
    }

    if (failureCase.status === 'ANALYZING') {
      throw new AnalysisAlreadyRunningError(
        failureCase.id,
        failureCase.currentAnalysisRunId ?? undefined,
      );
    }

    assertValidCaseTransition(failureCase.status, 'ANALYZING');

    const nextAttemptNumber = failureCase.analysisAttemptCount + 1;
    const analyzerVersion = data.analyzerVersion ?? '1.0.0';
    const now = new Date();

    // Compile immutable input snapshot referencing V5 context
    const inputSnapshot = {
      executionId: failureCase.executionId,
      testCaseId: failureCase.testCaseId,
      testCaseVersionNumber: failureCase.testCaseVersionNumber,
      sourceRequirementId: failureCase.testCase.sourceRequirementId ?? null,
      sourceRequirementKey: failureCase.testCase.sourceRequirementKey ?? null,
      stepExecutionId: failureCase.stepExecutionId,
      stepIndex: failureCase.stepIndex,
      triggeringExecutionStatus: failureCase.triggeringExecutionStatus,
      errorCode: failureCase.errorCode,
      errorMessage: failureCase.errorMessage,
      environmentId: failureCase.environmentId,
      evidenceArtifactIds: failureCase.evidenceReferences
        .map(e => e.sourceArtifactId)
        .filter(Boolean),
      analyzerVersion,
      attemptNumber: nextAttemptNumber,
      snapshotTimestamp: now.toISOString(),
    };

    try {
      const run = await this.prisma.$transaction(async tx => {
        const createdRun = await tx.failureAnalysisRun.create({
          data: {
            projectId: data.projectId,
            failureCaseId: failureCase.id,
            attemptNumber: nextAttemptNumber,
            analyzerVersion,
            status: 'RUNNING',
            startedAt: now,
            triggerSource: data.triggerSource ?? 'MANUAL',
            inputSnapshotJson: inputSnapshot as any,
            metadataJson: (data.metadataJson as any) ?? {},
          },
        });

        await tx.failureCase.update({
          where: { id: failureCase.id },
          data: {
            status: 'ANALYZING',
            currentAnalysisRunId: createdRun.id,
            analysisAttemptCount: nextAttemptNumber,
            isStale: false,
            stalenessReason: null,
            staleAt: null,
          },
        });

        // Link evidence references to this run
        await tx.failureEvidenceReference.updateMany({
          where: {
            failureCaseId: failureCase.id,
            analysisRunId: null,
          },
          data: {
            analysisRunId: createdRun.id,
          },
        });

        return createdRun;
      });

      this.logger?.info('failure_analysis_run.started', {
        projectId: data.projectId,
        failureCaseId: failureCase.id,
        analysisRunId: run.id,
        attemptNumber: nextAttemptNumber,
      });

      return this.mapRunToDto(run);
    } catch (err: unknown) {
      if ((err as any)?.code === 'P2002') {
        throw new AnalysisAlreadyRunningError(failureCase.id);
      }
      throw err;
    }
  }

  /**
   * Marks a FailureAnalysisRun as COMPLETED.
   * IMPORTANT: COMPLETED means analysis finished; it does NOT mean application bug confirmed.
   */
  public async completeAnalysis(
    input: CompleteFailureAnalysisInputDto,
  ): Promise<FailureAnalysisRunDto> {
    const data = completeFailureAnalysisInputSchema.parse(input);

    const run = await this.prisma.failureAnalysisRun.findUnique({
      where: { id: data.analysisRunId },
    });

    if (!run || run.projectId !== data.projectId || run.failureCaseId !== data.failureCaseId) {
      throw new FailureAnalysisRunNotFoundError(data.analysisRunId, data.failureCaseId);
    }

    assertValidRunTransition(run.status, 'COMPLETED');

    const now = new Date();
    const durationMs = run.startedAt ? now.getTime() - run.startedAt.getTime() : null;

    const updated = await this.prisma.$transaction(async tx => {
      const completedRun = await tx.failureAnalysisRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          durationMs,
          metadataJson: {
            ...((run.metadataJson as Record<string, unknown>) ?? {}),
            ...((data.metadataJson as Record<string, unknown>) ?? {}),
          } as any,
        },
      });

      await tx.failureCase.update({
        where: { id: data.failureCaseId },
        data: {
          status: 'COMPLETED',
        },
      });

      return completedRun;
    });

    this.logger?.info('failure_analysis_run.completed', {
      projectId: data.projectId,
      failureCaseId: data.failureCaseId,
      analysisRunId: updated.id,
      durationMs,
    });

    return this.mapRunToDto(updated);
  }

  /**
   * Marks a FailureAnalysisRun as FAILED.
   */
  public async failAnalysis(input: FailFailureAnalysisInputDto): Promise<FailureAnalysisRunDto> {
    const data = failFailureAnalysisInputSchema.parse(input);

    const run = await this.prisma.failureAnalysisRun.findUnique({
      where: { id: data.analysisRunId },
    });

    if (!run || run.projectId !== data.projectId || run.failureCaseId !== data.failureCaseId) {
      throw new FailureAnalysisRunNotFoundError(data.analysisRunId, data.failureCaseId);
    }

    assertValidRunTransition(run.status, 'FAILED');

    const now = new Date();
    const durationMs = run.startedAt ? now.getTime() - run.startedAt.getTime() : null;

    const updated = await this.prisma.$transaction(async tx => {
      const failedRun = await tx.failureAnalysisRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: now,
          durationMs,
          failureReason: data.failureReason.slice(0, FAILURE_BOUNDS.MAX_FAILURE_REASON_CHARS),
          metadataJson: {
            ...((run.metadataJson as Record<string, unknown>) ?? {}),
            ...((data.metadataJson as Record<string, unknown>) ?? {}),
          } as any,
        },
      });

      await tx.failureCase.update({
        where: { id: data.failureCaseId },
        data: {
          status: 'FAILED',
        },
      });

      return failedRun;
    });

    this.logger?.info('failure_analysis_run.failed', {
      projectId: data.projectId,
      failureCaseId: data.failureCaseId,
      analysisRunId: updated.id,
      reason: data.failureReason,
    });

    return this.mapRunToDto(updated);
  }

  /**
   * Cancels an ongoing analysis or pending FailureCase.
   */
  public async cancelAnalysis(input: CancelFailureAnalysisInputDto): Promise<FailureCaseDto> {
    const data = cancelFailureAnalysisInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: data.failureCaseId },
      include: {
        testCase: true,
        evidenceReferences: true,
        analysisRuns: true,
      },
    });

    if (!failureCase || failureCase.projectId !== data.projectId) {
      throw new FailureCaseNotFoundError(data.failureCaseId, data.projectId);
    }

    assertValidCaseTransition(failureCase.status, 'CANCELLED');

    const updatedCase = await this.prisma.$transaction(async tx => {
      if (failureCase.currentAnalysisRunId) {
        const currentRun = await tx.failureAnalysisRun.findUnique({
          where: { id: failureCase.currentAnalysisRunId },
        });
        if (currentRun && currentRun.status === 'RUNNING') {
          await tx.failureAnalysisRun.update({
            where: { id: currentRun.id },
            data: {
              status: 'CANCELLED',
              completedAt: new Date(),
              failureReason: data.reason ?? 'Analysis cancelled by user',
            },
          });
        }
      }

      return tx.failureCase.update({
        where: { id: failureCase.id },
        data: {
          status: 'CANCELLED',
        },
        include: {
          testCase: true,
          evidenceReferences: true,
          analysisRuns: true,
        },
      });
    });

    this.logger?.info('failure_case.cancelled', {
      projectId: data.projectId,
      failureCaseId: updatedCase.id,
      reason: data.reason,
    });

    return this.mapCaseToDto(updatedCase);
  }

  /**
   * Marks a FailureCase as STALE.
   */
  public async markStale(input: MarkFailureCaseStaleInputDto): Promise<FailureCaseDto> {
    const data = markFailureCaseStaleInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: data.failureCaseId },
      include: {
        testCase: true,
        evidenceReferences: true,
        analysisRuns: true,
      },
    });

    if (!failureCase || failureCase.projectId !== data.projectId) {
      throw new FailureCaseNotFoundError(data.failureCaseId, data.projectId);
    }

    assertValidCaseTransition(failureCase.status, 'STALE');

    const updatedCase = await this.prisma.failureCase.update({
      where: { id: failureCase.id },
      data: {
        status: 'STALE',
        isStale: true,
        stalenessReason: data.reason,
        staleAt: new Date(),
      },
      include: {
        testCase: true,
        evidenceReferences: true,
        analysisRuns: true,
      },
    });

    this.logger?.info('failure_case.marked_stale', {
      projectId: data.projectId,
      failureCaseId: updatedCase.id,
      reason: data.reason,
    });

    return this.mapCaseToDto(updatedCase);
  }

  /**
   * Lists versioned analysis runs for a FailureCase.
   */
  public async listAnalysisRuns(
    input: ListFailureAnalysisRunsInputDto,
  ): Promise<readonly FailureAnalysisRunDto[]> {
    const data = listFailureAnalysisRunsInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: data.failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase || failureCase.projectId !== data.projectId) {
      throw new FailureCaseNotFoundError(data.failureCaseId, data.projectId);
    }

    const runs = await this.prisma.failureAnalysisRun.findMany({
      where: {
        projectId: data.projectId,
        failureCaseId: data.failureCaseId,
      },
      orderBy: { attemptNumber: 'asc' },
    });

    return runs.map(r => this.mapRunToDto(r));
  }

  /**
   * Lists attached evidence references for a FailureCase.
   */
  public async listEvidenceReferences(
    input: ListFailureEvidenceReferencesInputDto,
  ): Promise<readonly FailureEvidenceReferenceDto[]> {
    const data = listFailureEvidenceReferencesInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: data.failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase || failureCase.projectId !== data.projectId) {
      throw new FailureCaseNotFoundError(data.failureCaseId, data.projectId);
    }

    const refs = await this.prisma.failureEvidenceReference.findMany({
      where: {
        projectId: data.projectId,
        failureCaseId: data.failureCaseId,
        ...(data.analysisRunId ? { analysisRunId: data.analysisRunId } : {}),
      },
      orderBy: { attachedAt: 'asc' },
    });

    return refs.map(r => this.mapEvidenceReferenceToDto(r));
  }

  /**
   * Transforms a database FailureCase record into a clean FailureCaseDto.
   */
  private mapCaseToDto(
    entity: FailureCase & {
      testCase?: {
        testCaseKey?: string;
        sourceRequirementId?: string | null;
        sourceRequirementKey?: string | null;
      };
      evidenceReferences?: FailureEvidenceReference[];
      analysisRuns?: FailureAnalysisRun[];
    },
  ): FailureCaseDto {
    return {
      id: entity.id,
      projectId: entity.projectId,
      testCaseId: entity.testCaseId,
      testCaseVersionNumber: entity.testCaseVersionNumber,
      testRunId: entity.testRunId,
      executionId: entity.executionId,
      stepExecutionId: entity.stepExecutionId,
      stepIndex: entity.stepIndex,
      triggeringExecutionStatus: entity.triggeringExecutionStatus,
      status: entity.status,
      isEligible: entity.isEligible,
      ineligibilityReason: entity.ineligibilityReason,
      isStale: entity.isStale,
      stalenessReason: entity.stalenessReason,
      staleAt: entity.staleAt ? entity.staleAt.toISOString() : null,
      currentAnalysisRunId: entity.currentAnalysisRunId,
      analysisAttemptCount: entity.analysisAttemptCount,
      title: entity.title,
      failureSummary: entity.failureSummary,
      errorCode: entity.errorCode,
      errorMessage: entity.errorMessage,
      environmentId: entity.environmentId,
      metadataJson: (entity.metadataJson as Record<string, unknown>) ?? {},
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      testCaseKey: entity.testCase?.testCaseKey,
      sourceRequirementId: entity.testCase?.sourceRequirementId ?? null,
      sourceRequirementKey: entity.testCase?.sourceRequirementKey ?? null,
      evidenceReferencesCount: entity.evidenceReferences?.length ?? 0,
      analysisRunsCount: entity.analysisRuns?.length ?? 0,
    };
  }

  /**
   * Transforms a database FailureAnalysisRun record into a clean FailureAnalysisRunDto.
   */
  private mapRunToDto(entity: FailureAnalysisRun): FailureAnalysisRunDto {
    return {
      id: entity.id,
      projectId: entity.projectId,
      failureCaseId: entity.failureCaseId,
      attemptNumber: entity.attemptNumber,
      analyzerVersion: entity.analyzerVersion,
      status: entity.status,
      startedAt: entity.startedAt ? entity.startedAt.toISOString() : null,
      completedAt: entity.completedAt ? entity.completedAt.toISOString() : null,
      durationMs: entity.durationMs,
      triggerSource: entity.triggerSource,
      inputSnapshotJson: (entity.inputSnapshotJson as Record<string, unknown>) ?? {},
      failureReason: entity.failureReason,
      metadataJson: (entity.metadataJson as Record<string, unknown>) ?? {},
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  /**
   * Transforms a database FailureEvidenceReference record into a clean FailureEvidenceReferenceDto.
   */
  private mapEvidenceReferenceToDto(entity: FailureEvidenceReference): FailureEvidenceReferenceDto {
    return {
      id: entity.id,
      projectId: entity.projectId,
      failureCaseId: entity.failureCaseId,
      analysisRunId: entity.analysisRunId,
      executionId: entity.executionId,
      bundleId: entity.bundleId,
      artifactType: entity.artifactType,
      sourceArtifactId: entity.sourceArtifactId,
      stepExecutionId: entity.stepExecutionId,
      storageIdentity: entity.storageIdentity,
      logicalName: entity.logicalName,
      mimeType: entity.mimeType,
      byteSize: entity.byteSize,
      sha256: entity.sha256,
      integrityStatus: (entity.integrityStatus as any) || 'UNVERIFIED',
      integrityDetails: entity.integrityDetails ?? null,
      lastVerifiedAt: entity.lastVerifiedAt ? entity.lastVerifiedAt.toISOString() : null,
      metadataJson: (entity.metadataJson as Record<string, unknown>) ?? {},
      attachedAt: entity.attachedAt.toISOString(),
    };
  }
}
