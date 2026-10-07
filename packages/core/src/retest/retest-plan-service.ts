/**
 * @file packages/core/src/retest/retest-plan-service.ts
 * Main orchestration service for Requirement Change-Impact & Retest Selection.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  ChangeSnapshotDto,
  CreateChangeSnapshotInputDto,
  ExplainTestSelectionInputDto,
  ExplainTestSelectionResultDto,
  GetRetestPlanInputDto,
  ListRetestPlansInputDto,
  PlanRetestInputDto,
  RetestImpactGraphDto,
  RetestPlanDto,
  RetestSelectedTestDto,
} from '@ai-quality/contracts';
import { getPrismaClient } from '../database/client.js';
import { DatabaseError } from '../database/errors.js';
import { getLogger } from '../logging/logger.js';
import { ProjectNotFoundError } from '../projects/project-errors.js';
import { ChangeSnapshotBuilder } from './change-snapshot-builder.js';
import { ImpactGraphBuilder } from './impact-graph-builder.js';
import {
  RetestConcurrentAnalysisError,
  RetestPlanNotFoundError,
  RetestProjectMismatchError,
  RetestSnapshotNotFoundError,
  RetestValidationError,
} from './retest-errors.js';
import {
  IMPACT_ENGINE_VERSION,
  RISK_POLICY_VERSION,
  SELECTION_POLICY_VERSION,
  type RetestAuditEntry,
  type TestSelectionEvaluation,
} from './retest-types.js';
import { TestSelectionEngine } from './test-selection-engine.js';

export class RetestPlanService {
  private readonly prisma: PrismaClient;
  private readonly snapshotBuilder: ChangeSnapshotBuilder;
  private readonly graphBuilder: ImpactGraphBuilder;
  private readonly selectionEngine: TestSelectionEngine;
  private readonly activeAnalyses = new Set<string>();

  constructor(prisma?: PrismaClient) {
    const client = prisma ?? getPrismaClient();
    if (!client) {
      throw new DatabaseError('Database connection unavailable.', 'DATABASE_UNAVAILABLE');
    }
    this.prisma = client;
    this.snapshotBuilder = new ChangeSnapshotBuilder(this.prisma);
    this.graphBuilder = new ImpactGraphBuilder(this.prisma);
    this.selectionEngine = new TestSelectionEngine(this.prisma);
  }

  /**
   * Redacts sensitive credentials or tokens from text and metadata.
   */
  private sanitizeSecrets(text?: string | null): string | null {
    if (!text) return null;
    return text
      .replace(/(bearer\s+)[a-zA-Z0-9_.-]{20,}/gi, '$1[REDACTED_SECRET]')
      .replace(/(gh[pousr]_[a-zA-Z0-9]{15,})/gi, '[REDACTED_SECRET]')
      .replace(
        /((?:api[_-]?key|password|secret|token|auth|bearer)\s*[:=]\s*["']?)[^\s"',;]+(["']?)/gi,
        '$1[REDACTED_SECRET]$2',
      );
  }

  /**
   * Creates an immutable ChangeSnapshot record.
   */
  async createChangeSnapshot(input: CreateChangeSnapshotInputDto): Promise<ChangeSnapshotDto> {
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
    });
    if (!project) {
      throw new ProjectNotFoundError(`Project ${input.projectId} not found.`);
    }

    const sanitizedDiff = this.sanitizeSecrets(input.diffText);
    const snapshotData = await this.snapshotBuilder.buildSnapshotData({
      ...input,
      diffText: sanitizedDiff ?? undefined,
    });

    const record = await this.prisma.changeSnapshot.create({
      data: snapshotData,
    });

    return this.mapSnapshotToDto(record);
  }

  /**
   * Computes an explainable RetestPlan for a change snapshot.
   */
  async planRetest(input: PlanRetestInputDto): Promise<RetestPlanDto> {
    const {
      projectId,
      forceFullRegression = false,
      conservativeSafetyPolicy = true,
      actor = 'HUMAN_OPERATOR',
    } = input;

    if (!projectId) {
      throw new RetestValidationError('Project ID is required.');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new ProjectNotFoundError(`Project ${projectId} not found.`);
    }

    // Guard against concurrent analyses on same project/snapshot
    const lockKey = `${projectId}:${input.changeSnapshotId ?? 'new'}`;
    if (this.activeAnalyses.has(lockKey)) {
      throw new RetestConcurrentAnalysisError(
        `An impact analysis is already in progress for ${lockKey}.`,
      );
    }
    this.activeAnalyses.add(lockKey);

    try {
      // 1. Resolve or create ChangeSnapshot
      let snapshot: ChangeSnapshotDto;
      if (input.changeSnapshotId) {
        const found = await this.prisma.changeSnapshot.findUnique({
          where: { id: input.changeSnapshotId },
        });
        if (!found) {
          throw new RetestSnapshotNotFoundError(`Snapshot ${input.changeSnapshotId} not found.`);
        }
        if (found.projectId !== projectId) {
          throw new RetestProjectMismatchError(
            `Snapshot ${input.changeSnapshotId} does not belong to project ${projectId}.`,
          );
        }
        snapshot = this.mapSnapshotToDto(found);
      } else if (input.snapshotInput) {
        if (input.snapshotInput.projectId !== projectId) {
          throw new RetestProjectMismatchError(
            `Snapshot input project ${input.snapshotInput.projectId} does not match ${projectId}.`,
          );
        }
        snapshot = await this.createChangeSnapshot(input.snapshotInput);
      } else {
        throw new RetestValidationError(
          'Either changeSnapshotId or snapshotInput must be provided.',
        );
      }

      // 2. Build Impact Graph
      const graphContext = await this.graphBuilder.buildGraph(
        projectId,
        snapshot.changedFiles,
        snapshot.changedRequirements,
      );

      // 3. Evaluate Tests
      const result = await this.selectionEngine.evaluateTests(
        projectId,
        {
          sourceType: snapshot.sourceType,
          sourceEntityId: snapshot.sourceEntityId,
          changedFiles: snapshot.changedFiles,
          changedRequirements: snapshot.changedRequirements,
          changedSymbolsJson: snapshot.changedSymbolsJson,
          changedApisJson: snapshot.changedApisJson,
          changedConfiguration: snapshot.changedConfiguration,
        },
        graphContext,
        {
          forceFullRegression,
          conservativeSafetyPolicy,
        },
      );

      // 4. Persist RetestPlan
      const auditTrail: RetestAuditEntry[] = [
        {
          timestamp: new Date().toISOString(),
          event: 'PLAN_GENERATED',
          actor,
          details: {
            sourceType: snapshot.sourceType,
            totalTests: result.counts.total,
            mandatoryTests: result.counts.mandatory,
            fullRegressionRequired: result.fullRegressionRequired,
          },
        },
      ];

      const planRecord = await this.prisma.retestPlan.create({
        data: {
          project: { connect: { id: projectId } },
          changeSnapshot: { connect: { id: snapshot.id } },
          status: 'COMPLETED',
          baseRevision: snapshot.baseRevision,
          targetRevision: snapshot.targetRevision,
          selectionPolicyVersion: SELECTION_POLICY_VERSION,
          riskPolicyVersion: RISK_POLICY_VERSION,
          impactEngineVersion: IMPACT_ENGINE_VERSION,
          fullRegressionRequired: result.fullRegressionRequired,
          fullRegressionReason: result.fullRegressionReason,
          totalTestsCount: result.counts.total,
          mandatoryCount: result.counts.mandatory,
          recommendedCount: result.counts.recommended,
          optionalCount: result.counts.optional,
          unknownCount: result.counts.unknown,
          excludedCount: result.counts.excluded,
          impactGraphJson: graphContext.impactGraph as unknown as Prisma.InputJsonValue,
          selectedTestsJson: result.evaluations as unknown as Prisma.InputJsonValue,
          auditTrailJson: auditTrail as unknown as Prisma.InputJsonValue,
        },
        include: {
          changeSnapshot: true,
        },
      });

      getLogger().info('retest_plan.created', {
        planId: planRecord.id,
        projectId,
        snapshotId: snapshot.id,
        mandatoryCount: result.counts.mandatory,
        fullRegressionRequired: result.fullRegressionRequired,
      });

      return this.mapPlanToDto(planRecord);
    } finally {
      this.activeAnalyses.delete(lockKey);
    }
  }

  /**
   * Idempotently retrieves a RetestPlan by ID with strict project isolation.
   */
  async getRetestPlan(input: GetRetestPlanInputDto): Promise<RetestPlanDto | null> {
    const { projectId, planId } = input;

    if (!projectId || !planId) {
      throw new RetestValidationError('Project ID and Plan ID are required.');
    }

    const plan = await this.prisma.retestPlan.findUnique({
      where: { id: planId },
      include: {
        changeSnapshot: true,
      },
    });

    if (!plan) {
      return null;
    }

    if (plan.projectId !== projectId) {
      throw new RetestProjectMismatchError(
        `Retest plan ${planId} does not belong to project ${projectId}.`,
      );
    }

    return this.mapPlanToDto(plan);
  }

  /**
   * Lists all RetestPlans for a project.
   */
  async listRetestPlans(input: ListRetestPlansInputDto): Promise<readonly RetestPlanDto[]> {
    const { projectId, changeSnapshotId, status } = input;

    if (!projectId) {
      throw new RetestValidationError('Project ID is required.');
    }

    const plans = await this.prisma.retestPlan.findMany({
      where: {
        projectId,
        ...(changeSnapshotId ? { changeSnapshotId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        changeSnapshot: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return plans.map(p => this.mapPlanToDto(p));
  }

  /**
   * Explains why a specific test case was selected or excluded within a RetestPlan.
   */
  async explainTestSelection(
    input: ExplainTestSelectionInputDto,
  ): Promise<ExplainTestSelectionResultDto> {
    const { projectId, planId, testCaseId } = input;

    if (!projectId || !planId || !testCaseId) {
      throw new RetestValidationError('projectId, planId, and testCaseId are required.');
    }

    const plan = await this.prisma.retestPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new RetestPlanNotFoundError(`Retest plan ${planId} not found.`);
    }
    if (plan.projectId !== projectId) {
      throw new RetestProjectMismatchError(
        `Retest plan ${planId} does not belong to project ${projectId}.`,
      );
    }

    const evaluations = (plan.selectedTestsJson as unknown as TestSelectionEvaluation[]) ?? [];
    const evaluation = evaluations.find(e => e.testCaseId === testCaseId);

    if (!evaluation) {
      throw new RetestValidationError(
        `Test case ${testCaseId} not found in retest plan ${planId}.`,
      );
    }

    const tracePath: string[] = [];
    if (evaluation.changedRequirement) {
      tracePath.push(`Requirement: ${evaluation.changedRequirement}`);
    }
    if (evaluation.affectedCodeOrApi) {
      tracePath.push(`Code/API: ${evaluation.affectedCodeOrApi}`);
    }
    if (evaluation.dependencyPath.length > 0) {
      tracePath.push(`Dependency: ${evaluation.dependencyPath.join(' -> ')}`);
    }
    tracePath.push(`Test: ${evaluation.testCaseKey} (${evaluation.testCaseTitle})`);

    return {
      testCaseId: evaluation.testCaseId,
      testCaseKey: evaluation.testCaseKey,
      testCaseTitle: evaluation.testCaseTitle,
      selectionState: evaluation.selectionState,
      impactCategory: evaluation.impactCategory,
      confidence: evaluation.confidence,
      selectionReason: evaluation.selectionReason,
      dependencyPath: evaluation.dependencyPath as string[],
      riskSignals: evaluation.riskSignals as string[],
      evidenceReferences: evaluation.evidenceReferences as string[],
      historicalFailureSignal: evaluation.historicalFailureSignal,
      changedRequirement: evaluation.changedRequirement,
      affectedCodeOrApi: evaluation.affectedCodeOrApi,
      tracePath,
    };
  }

  private mapSnapshotToDto(record: {
    id: string;
    projectId: string;
    sourceType: string;
    sourceEntityId: string | null;
    baseRevision: string | null;
    targetRevision: string | null;
    title: string;
    description: string | null;
    changedFiles: string[];
    changedSymbolsJson: Prisma.JsonValue;
    changedRequirements: string[];
    changedApisJson: Prisma.JsonValue;
    changedConfiguration: Prisma.JsonValue;
    diffText: string | null;
    metadataJson: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }): ChangeSnapshotDto {
    return {
      id: record.id,
      projectId: record.projectId,
      sourceType: record.sourceType as ChangeSnapshotDto['sourceType'],
      sourceEntityId: record.sourceEntityId,
      baseRevision: record.baseRevision,
      targetRevision: record.targetRevision,
      title: record.title,
      description: record.description,
      changedFiles: record.changedFiles,
      changedSymbolsJson: (record.changedSymbolsJson as Record<string, unknown>[]) ?? [],
      changedRequirements: record.changedRequirements,
      changedApisJson: (record.changedApisJson as Record<string, unknown>[]) ?? [],
      changedConfiguration: (record.changedConfiguration as Record<string, unknown>) ?? {},
      diffText: record.diffText,
      metadataJson: (record.metadataJson as Record<string, unknown>) ?? {},
      createdAt: (record.createdAt ? new Date(record.createdAt) : new Date()).toISOString(),
      updatedAt: (record.updatedAt
        ? new Date(record.updatedAt)
        : record.createdAt
          ? new Date(record.createdAt)
          : new Date()
      ).toISOString(),
    };
  }

  private mapPlanToDto(record: {
    id: string;
    projectId: string;
    changeSnapshotId: string;
    status: string;
    baseRevision: string | null;
    targetRevision: string | null;
    selectionPolicyVersion: string;
    riskPolicyVersion: string;
    impactEngineVersion: string;
    fullRegressionRequired: boolean;
    fullRegressionReason: string | null;
    totalTestsCount: number;
    mandatoryCount: number;
    recommendedCount: number;
    optionalCount: number;
    unknownCount: number;
    excludedCount: number;
    impactGraphJson: Prisma.JsonValue;
    selectedTestsJson: Prisma.JsonValue;
    auditTrailJson: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
    changeSnapshot?: Parameters<RetestPlanService['mapSnapshotToDto']>[0];
  }): RetestPlanDto {
    return {
      id: record.id,
      projectId: record.projectId,
      changeSnapshotId: record.changeSnapshotId,
      status: record.status as RetestPlanDto['status'],
      baseRevision: record.baseRevision,
      targetRevision: record.targetRevision,
      selectionPolicyVersion: record.selectionPolicyVersion,
      riskPolicyVersion: record.riskPolicyVersion,
      impactEngineVersion: record.impactEngineVersion,
      fullRegressionRequired: record.fullRegressionRequired,
      fullRegressionReason: record.fullRegressionReason,
      totalTestsCount: record.totalTestsCount,
      mandatoryCount: record.mandatoryCount,
      recommendedCount: record.recommendedCount,
      optionalCount: record.optionalCount,
      unknownCount: record.unknownCount,
      excludedCount: record.excludedCount,
      impactGraph: (record.impactGraphJson as unknown as RetestImpactGraphDto) ?? {
        nodes: [],
        edges: [],
      },
      selectedTests: (record.selectedTestsJson as unknown as RetestSelectedTestDto[]) ?? [],
      changeSnapshot: record.changeSnapshot
        ? this.mapSnapshotToDto(record.changeSnapshot)
        : undefined,
      auditTrail: (record.auditTrailJson as Record<string, unknown>[]) ?? [],
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
