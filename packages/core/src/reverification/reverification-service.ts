/**
 * @file packages/core/src/reverification/reverification-service.ts
 * Authoritative orchestrator for Defect Reverification Foundation (V7 Phase 97).
 */

import { type PrismaClient, type ProjectEnvironment, Prisma } from '@prisma/client';
import type {
  IDefectReverificationService,
  DefectReverificationDto,
  ReverificationAuditEventDto,
  EvaluateReverificationEligibilityInputDto,
  EvaluateReverificationEligibilityOutputDto,
  CreateReverificationRequestInputDto,
  GenerateReverificationPlanInputDto,
  CancelReverificationInputDto,
  ListReverificationAuditEventsInputDto,
  GetReverificationStateInputDto,
} from './reverification-types.js';
import {
  ReverificationNotFoundError,
  ReverificationCrossProjectForbiddenError,
} from './reverification-errors.js';
import { ReverificationProvenanceResolver } from './reverification-provenance-resolver.js';
import { ReverificationSafetyChecker } from './reverification-safety-checker.js';
import { ReverificationEligibilityEngine } from './reverification-eligibility-engine.js';
import { ReverificationPlanGenerator } from './reverification-plan-generator.js';

export interface ReverificationServiceOptions {
  readonly prisma: PrismaClient;
}

export class DefectReverificationService implements IDefectReverificationService {
  private readonly prisma: PrismaClient;
  private readonly provenanceResolver: ReverificationProvenanceResolver;
  private readonly safetyChecker: ReverificationSafetyChecker;
  private readonly eligibilityEngine: ReverificationEligibilityEngine;
  private readonly planGenerator: ReverificationPlanGenerator;
  private readonly defectLocks: Map<string, Promise<void>> = new Map();

  constructor(options: ReverificationServiceOptions) {
    this.prisma = options.prisma;
    this.provenanceResolver = new ReverificationProvenanceResolver(this.prisma);
    this.safetyChecker = new ReverificationSafetyChecker();
    this.eligibilityEngine = new ReverificationEligibilityEngine(this.prisma);
    this.planGenerator = new ReverificationPlanGenerator();
  }

  /**
   * Acquires a serialized in-memory async mutex lock for a failure case.
   */
  private async acquireLock(failureCaseId: string): Promise<() => void> {
    while (this.defectLocks.has(failureCaseId)) {
      await this.defectLocks.get(failureCaseId);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>(resolve => {
      resolveLock = resolve;
    });
    this.defectLocks.set(failureCaseId, lockPromise);

    return () => {
      this.defectLocks.delete(failureCaseId);
      resolveLock();
    };
  }

  /**
   * Asserts project ownership of failureCase.
   */
  private async assertProjectOwnership(projectId: string, failureCaseId: string): Promise<void> {
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!failureCase) {
      throw new ReverificationNotFoundError(failureCaseId);
    }

    if (failureCase.projectId !== projectId) {
      throw new ReverificationCrossProjectForbiddenError(
        `Failure case ${failureCaseId} belongs to a different project.`,
      );
    }
  }

  /**
   * Resolves the target environment for reverification.
   */
  private async resolveTargetEnvironment(
    projectId: string,
    targetEnvironmentId?: string | null,
    originalEnvironmentId?: string | null,
  ): Promise<ProjectEnvironment> {
    if (targetEnvironmentId) {
      const env = await this.prisma.projectEnvironment.findUnique({
        where: { id: targetEnvironmentId },
      });
      if (!env) {
        throw new ReverificationNotFoundError(`Target environment '${targetEnvironmentId}'`);
      }
      if (env.projectId !== projectId) {
        throw new ReverificationCrossProjectForbiddenError(
          `Target environment ${targetEnvironmentId} belongs to a different project.`,
        );
      }
      return env;
    }

    // Fallback 1: original environment
    if (originalEnvironmentId) {
      const originalEnv = await this.prisma.projectEnvironment.findUnique({
        where: { id: originalEnvironmentId },
      });
      if (originalEnv && originalEnv.projectId === projectId) {
        return originalEnv;
      }
    }

    // Fallback 2: default environment for project
    const defaultEnv = await this.prisma.projectEnvironment.findFirst({
      where: { projectId, isDefault: true },
    });
    if (defaultEnv) {
      return defaultEnv;
    }

    // Fallback 3: first available environment
    const firstEnv = await this.prisma.projectEnvironment.findFirst({
      where: { projectId },
    });
    if (firstEnv) {
      return firstEnv;
    }

    throw new ReverificationNotFoundError(
      `No execution environment found for project '${projectId}'.`,
    );
  }

  /**
   * Retrieves the current authoritative reverification state for a failure case.
   */
  public async getState(
    input: GetReverificationStateInputDto,
  ): Promise<DefectReverificationDto | null> {
    await this.assertProjectOwnership(input.projectId, input.failureCaseId);

    const record = await this.prisma.defectReverification.findFirst({
      where: {
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        isAuthoritative: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return record as unknown as DefectReverificationDto | null;
  }

  /**
   * Evaluates eligibility of a defect for reverification without modifying state.
   */
  public async evaluateEligibility(
    input: EvaluateReverificationEligibilityInputDto,
  ): Promise<EvaluateReverificationEligibilityOutputDto> {
    await this.assertProjectOwnership(input.projectId, input.failureCaseId);

    const historical = await this.provenanceResolver.resolveHistoricalProvenance(
      input.projectId,
      input.failureCaseId,
    );

    const targetEnvironment = await this.resolveTargetEnvironment(
      input.projectId,
      input.targetEnvironmentId,
      historical.originalEnvironmentId,
    );

    const result = await this.eligibilityEngine.evaluateEligibility({
      projectId: input.projectId,
      failureCaseId: input.failureCaseId,
      historicalProvenance: historical,
      targetEnvironment,
    });

    return {
      eligibility: result.eligibility,
      reasons: result.reasons as string[],
      targetEnvironmentId: result.targetEnvironmentId,
      originalTestCaseVersionNumber: result.originalTestCaseVersionNumber,
      selectedTestCaseVersionNumber: result.selectedTestCaseVersionNumber,
      safetyStatus: result.safetyStatus,
      isProductionBlocked: result.isProductionBlocked,
      details: result.details,
    };
  }

  /**
   * Creates or supersedes a defect reverification request and generates its plan.
   * Invariant: Never marks defect VERIFIED_FIXED.
   */
  public async createRequest(
    input: CreateReverificationRequestInputDto,
  ): Promise<DefectReverificationDto> {
    const releaseLock = await this.acquireLock(input.failureCaseId);
    try {
      await this.assertProjectOwnership(input.projectId, input.failureCaseId);

      const historical = await this.provenanceResolver.resolveHistoricalProvenance(
        input.projectId,
        input.failureCaseId,
      );

      const fix = this.provenanceResolver.resolveFixProvenance({
        fixReference: input.fixReference,
        fixProvenance: input.fixProvenance,
        triggerType: input.triggerType,
        triggerReference: input.triggerReference,
      });

      const targetEnvironment = await this.resolveTargetEnvironment(
        input.projectId,
        input.targetEnvironmentId,
        historical.originalEnvironmentId,
      );

      const eligibilityResult = await this.eligibilityEngine.evaluateEligibility({
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        historicalProvenance: historical,
        targetEnvironment,
      });

      const safetyResult = this.safetyChecker.evaluateSafety(
        targetEnvironment,
        historical.originalSteps,
      );

      // Section 23: Supersession of any previous active reverifications
      const existingActive = await this.prisma.defectReverification.findMany({
        where: {
          projectId: input.projectId,
          failureCaseId: input.failureCaseId,
          isAuthoritative: true,
          status: { in: ['DRAFT', 'READY', 'BLOCKED', 'ELIGIBILITY_CHECK'] },
        },
      });

      const newStatus = eligibilityResult.eligibility === 'ELIGIBLE' ? 'READY' : 'BLOCKED';

      const selectedVersion =
        input.selectedTestCaseVersionNumber ?? historical.originalTestCaseVersionNumber;
      const selectionReason =
        input.testVersionSelectionReason ??
        (selectedVersion === historical.originalTestCaseVersionNumber
          ? 'Historical test case version preserved.'
          : `Explicit selection of version ${selectedVersion}`);

      // Temporary ID for plan generation
      const tempId = crypto.randomUUID();

      const plan = this.planGenerator.generatePlan({
        reverificationId: tempId,
        historicalProvenance: historical,
        fixProvenance: fix,
        targetEnvironment,
        safetyResult,
        selectedTestCaseVersionNumber: selectedVersion,
        testVersionSelectionReason: selectionReason,
      });

      const result = await this.prisma.$transaction(async tx => {
        // Supersede older active requests
        for (const old of existingActive) {
          await tx.defectReverification.update({
            where: { id: old.id },
            data: {
              isAuthoritative: false,
              status: 'SUPERSEDED',
              supersededAt: new Date(),
              supersedeReason: `Superseded by new reverification request (${tempId})`,
            },
          });

          await tx.reverificationAuditEvent.create({
            data: {
              projectId: input.projectId,
              reverificationId: old.id,
              action: 'SUPERSEDED',
              fromStatus: old.status,
              toStatus: 'SUPERSEDED',
              actor: input.actor || 'SYSTEM',
              reason: `Superseded by new reverification request (${tempId})`,
              detailsJson: {
                supersededById: tempId,
                triggerType: input.triggerType,
              },
            },
          });
        }

        const created = await tx.defectReverification.create({
          data: {
            id: tempId,
            projectId: input.projectId,
            failureCaseId: input.failureCaseId,
            failureAnalysisId: historical.failureAnalysisId,
            bugReportId: historical.bugReportId,
            externalIssueLinkId: historical.externalIssueLinkId,

            originalTestRunId: historical.originalTestRunId,
            originalExecutionId: historical.originalExecutionId,
            originalTestCaseId: historical.originalTestCaseId,
            originalTestCaseVersionId: historical.originalTestCaseVersionId,
            originalTestCaseVersionNumber: historical.originalTestCaseVersionNumber,

            selectedTestCaseId: historical.originalTestCaseId,
            selectedTestCaseVersionId: historical.originalTestCaseVersionId,
            selectedTestCaseVersionNumber: selectedVersion,
            testVersionSelectionReason: selectionReason,

            requirementId: historical.requirementId,
            requirementKey: historical.requirementKey,
            requirementVersionNumber: historical.requirementVersionNumber,

            status: newStatus,
            eligibility: eligibilityResult.eligibility,
            eligibilityReasons: eligibilityResult.reasons as string[],

            triggerType: input.triggerType || 'MANUAL_REQUEST',
            triggerReference: input.triggerReference || null,

            originalEnvironmentId: historical.originalEnvironmentId,
            targetEnvironmentId: targetEnvironment.id,
            environmentSnapshotJson: {
              name: targetEnvironment.name,
              baseUrl: targetEnvironment.baseUrl,
              isProduction: targetEnvironment.isProduction,
              browserEngine: targetEnvironment.browserEngine,
            },

            fixReference: fix.fixReference,
            fixProvenanceJson: fix.rawDetails as unknown as Prisma.InputJsonValue,

            baselineFailureJson: plan.originalFailureBaseline as unknown as Prisma.InputJsonValue,
            expectedVerificationJson:
              plan.expectedFixVerificationCondition as unknown as Prisma.InputJsonValue,
            executionPlanJson: plan as unknown as Prisma.InputJsonValue,

            safetyStatus: safetyResult.safetyStatus,
            safetyReason: safetyResult.safetyReason,

            isAuthoritative: true,
            requestedBy: input.actor || 'SYSTEM',
            requestedAt: new Date(),
          },
        });

        await tx.reverificationAuditEvent.create({
          data: {
            projectId: input.projectId,
            reverificationId: created.id,
            action: 'CREATED',
            fromStatus: null,
            toStatus: newStatus,
            actor: input.actor || 'SYSTEM',
            reason: `Reverification request prepared with eligibility ${eligibilityResult.eligibility}.`,
            detailsJson: {
              triggerType: input.triggerType,
              targetEnvironment: targetEnvironment.name,
              status: newStatus,
              eligibilityReasons: eligibilityResult.reasons,
            },
          },
        });

        return created;
      });

      return result as unknown as DefectReverificationDto;
    } finally {
      releaseLock();
    }
  }

  /**
   * Generates a deterministic plan for an existing or newly prepared reverification.
   */
  public async generatePlan(
    input: GenerateReverificationPlanInputDto,
  ): Promise<DefectReverificationDto> {
    const releaseLock = await this.acquireLock(input.failureCaseId);
    try {
      await this.assertProjectOwnership(input.projectId, input.failureCaseId);

      let record: any = null;
      if (input.reverificationId) {
        record = await this.prisma.defectReverification.findUnique({
          where: { id: input.reverificationId },
        });
        if (!record || record.projectId !== input.projectId) {
          throw new ReverificationNotFoundError(input.reverificationId);
        }
      } else {
        record = await this.prisma.defectReverification.findFirst({
          where: {
            projectId: input.projectId,
            failureCaseId: input.failureCaseId,
            isAuthoritative: true,
          },
          orderBy: { createdAt: 'desc' },
        });
      }

      if (!record) {
        // Create request if not found
        return await this.createRequest({
          projectId: input.projectId,
          failureCaseId: input.failureCaseId,
          targetEnvironmentId: input.targetEnvironmentId,
          actor: input.actor,
        });
      }

      const historical = await this.provenanceResolver.resolveHistoricalProvenance(
        input.projectId,
        input.failureCaseId,
      );

      const targetEnvironment = await this.resolveTargetEnvironment(
        input.projectId,
        input.targetEnvironmentId || record.targetEnvironmentId,
        historical.originalEnvironmentId,
      );

      const safetyResult = this.safetyChecker.evaluateSafety(
        targetEnvironment,
        historical.originalSteps,
      );

      const fix = this.provenanceResolver.resolveFixProvenance({
        fixReference: record.fixReference,
        fixProvenance: record.fixProvenanceJson,
        triggerType: record.triggerType,
        triggerReference: record.triggerReference,
      });

      const plan = this.planGenerator.generatePlan({
        reverificationId: record.id,
        historicalProvenance: historical,
        fixProvenance: fix,
        targetEnvironment,
        safetyResult,
        selectedTestCaseVersionNumber: record.selectedTestCaseVersionNumber,
        testVersionSelectionReason: record.testVersionSelectionReason,
      });

      const updatedStatus = safetyResult.isSafe ? 'READY' : 'BLOCKED';

      const updated = await this.prisma.$transaction(async tx => {
        const res = await tx.defectReverification.update({
          where: { id: record.id },
          data: {
            targetEnvironmentId: targetEnvironment.id,
            executionPlanJson: plan as unknown as Prisma.InputJsonValue,
            safetyStatus: safetyResult.safetyStatus,
            safetyReason: safetyResult.safetyReason,
            status: updatedStatus,
            version: { increment: 1 },
          },
        });

        await tx.reverificationAuditEvent.create({
          data: {
            projectId: input.projectId,
            reverificationId: record.id,
            action: 'PLAN_GENERATED',
            fromStatus: record.status,
            toStatus: updatedStatus,
            actor: input.actor || 'SYSTEM',
            reason: `Execution plan generated for environment '${targetEnvironment.name}'.`,
            detailsJson: {
              safetyStatus: safetyResult.safetyStatus,
              isSafe: safetyResult.isSafe,
            },
          },
        });

        return res;
      });

      return updated as unknown as DefectReverificationDto;
    } finally {
      releaseLock();
    }
  }

  /**
   * Cancels a reverification request prior to execution.
   */
  public async cancel(input: CancelReverificationInputDto): Promise<DefectReverificationDto> {
    const record = await this.prisma.defectReverification.findUnique({
      where: { id: input.reverificationId },
    });

    if (!record) {
      throw new ReverificationNotFoundError(input.reverificationId);
    }

    if (record.projectId !== input.projectId) {
      throw new ReverificationCrossProjectForbiddenError(
        `Reverification ${input.reverificationId} belongs to a different project.`,
      );
    }

    const releaseLock = await this.acquireLock(record.failureCaseId);
    try {
      const updated = await this.prisma.$transaction(async tx => {
        const res = await tx.defectReverification.update({
          where: { id: record.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledById: input.actor || 'USER',
            cancellationReason: input.reason,
            version: { increment: 1 },
          },
        });

        await tx.reverificationAuditEvent.create({
          data: {
            projectId: input.projectId,
            reverificationId: record.id,
            action: 'CANCELLED',
            fromStatus: record.status,
            toStatus: 'CANCELLED',
            actor: input.actor || 'USER',
            reason: input.reason,
            detailsJson: {
              cancelledAt: new Date().toISOString(),
            },
          },
        });

        return res;
      });

      return updated as unknown as DefectReverificationDto;
    } finally {
      releaseLock();
    }
  }

  /**
   * Lists audit events for a reverification record with strict project isolation.
   */
  public async listAuditEvents(
    input: ListReverificationAuditEventsInputDto,
  ): Promise<readonly ReverificationAuditEventDto[]> {
    const record = await this.prisma.defectReverification.findUnique({
      where: { id: input.reverificationId },
      select: { id: true, projectId: true },
    });

    if (!record) {
      throw new ReverificationNotFoundError(input.reverificationId);
    }

    if (record.projectId !== input.projectId) {
      throw new ReverificationCrossProjectForbiddenError(
        `Reverification ${input.reverificationId} belongs to a different project.`,
      );
    }

    const events = await this.prisma.reverificationAuditEvent.findMany({
      where: {
        reverificationId: input.reverificationId,
        projectId: input.projectId,
      },
      orderBy: { createdAt: 'asc' },
    });

    return events as unknown as readonly ReverificationAuditEventDto[];
  }
}
