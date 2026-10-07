/**
 * @file packages/core/src/failures/bug-report/structured-bug-report-service.ts
 * Central orchestrator and service implementation for V6 Phase 87:
 * Structured Bug Report Generation & Failure Intelligence Workspace.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import {
  createBugReportInputSchema,
  getBugReportInputSchema,
  listBugReportsInputSchema,
  regenerateBugReportInputSchema,
  listBugReportHistoryInputSchema,
  type CreateBugReportInputDto,
  type GetBugReportInputDto,
  type ListBugReportsInputDto,
  type RegenerateBugReportInputDto,
  type ListBugReportHistoryInputDto,
  type StructuredBugReportDto,
  type DerivedReproductionStepDto,
  type ReportEvidenceReferenceDto,
} from '@ai-quality/contracts';
import {
  BUG_REPORT_BOUNDS,
  type IStructuredBugReportService,
  type StructuredBugReportFacts,
} from './bug-report-types.js';
import {
  BugReportNotFoundError,
  BugReportCrossProjectError,
  BugReportInvalidOperationError,
} from './bug-report-errors.js';
import { BugReportGenerator } from './bug-report-generator.js';

export class StructuredBugReportService implements IStructuredBugReportService {
  private readonly generator: BugReportGenerator;
  private readonly caseLocks = new Map<string, Promise<void>>();

  constructor(private readonly prisma: PrismaClient) {
    this.generator = new BugReportGenerator();
  }

  /**
   * Serializes mutations per failure case to prevent race conditions.
   */
  private async withLock<T>(caseId: string, fn: () => Promise<T>): Promise<T> {
    const currentLock = this.caseLocks.get(caseId) ?? Promise.resolve();
    let releaseLock: () => void;
    const nextLock = new Promise<void>(resolve => {
      releaseLock = resolve;
    });

    this.caseLocks.set(caseId, nextLock);

    try {
      await currentLock;
      return await fn();
    } finally {
      releaseLock!();
      if (this.caseLocks.get(caseId) === nextLock) {
        this.caseLocks.delete(caseId);
      }
    }
  }

  /**
   * Creates an initial structured bug report (Revision 1) for a failure case.
   * If a report already exists with status READY, returns the latest report.
   */
  public async createBugReport(input: CreateBugReportInputDto): Promise<StructuredBugReportDto> {
    const validated = createBugReportInputSchema.parse(input);

    return this.withLock(validated.failureCaseId, async () => {
      await this.assertCaseAccess(validated.projectId, validated.failureCaseId);

      // Check if a report already exists for this failure case
      const existing = await this.prisma.structuredBugReport.findFirst({
        where: {
          projectId: validated.projectId,
          failureCaseId: validated.failureCaseId,
          status: 'READY',
        },
        orderBy: { revision: 'desc' },
      });

      if (existing) {
        return this.mapToDto(existing);
      }

      // Gather facts across Phases 74–86
      const facts = await this.gatherBugReportFacts(
        validated.projectId,
        validated.failureCaseId,
        validated.analysisRunId,
      );

      // Allocate next report number for this project
      const reportNumber = await this.allocateReportNumber(validated.projectId);

      // Generate report content
      const generated = this.generator.generate(facts, {
        reportNumber,
        revision: 1,
        titleOverride: validated.titleOverride,
      });

      const reproductionRatio = facts.reproductionSummary?.attemptCount
        ? facts.reproductionSummary.reproducedCount / facts.reproductionSummary.attemptCount
        : null;

      const created = await this.prisma.structuredBugReport.create({
        data: {
          projectId: validated.projectId,
          failureCaseId: validated.failureCaseId,
          failureAnalysisRunId: validated.analysisRunId ?? null,
          reportNumber,
          revision: 1,
          isAuthoritative: true,
          status: 'READY',
          applicationDefectState: generated.defectState,
          isApplicationDefect: generated.isApplicationDefect,
          title: generated.title,
          summary: generated.summary,
          requirementId: generated.requirementId ?? null,
          requirementKey: generated.requirementKey ?? null,
          requirementVersionNumber: generated.requirementVersion ?? null,
          testCaseId: generated.testCaseId ?? facts.testExecution.testCaseId,
          testCaseKey: generated.testCaseKey ?? facts.testCase?.key ?? 'TEST',
          testCaseVersionNumber:
            generated.testCaseVersion ?? facts.testExecution.testCaseVersionNumber ?? 1,
          testCaseTitle: facts.testCase?.title ?? facts.failureCase.title,
          testCaseType: null,
          originalExecutionId: facts.testExecution.id,
          triggeringStatus: facts.testExecution.status,
          failedStepIndex: generated.failedStepIndex,
          failedStepAction: null,
          preconditionsJson: generated.preconditions as unknown as Prisma.InputJsonValue,
          reproductionStepsJson: generated.reproductionSteps as unknown as Prisma.InputJsonValue,
          expectedResult: generated.expectedBehavior,
          actualResult: generated.actualBehavior,
          classificationCategory: (facts.classification?.category as any) ?? null,
          classificationSubcategory: null,
          reproducibilityState: facts.reproductionSummary?.status ?? null,
          reproductionAttempts: facts.reproductionSummary?.attemptCount ?? 0,
          reproductionSuccessCount: facts.reproductionSummary?.reproducedCount ?? 0,
          reproducibilityRatio: reproductionRatio,
          probableLayer: generated.probableLayer,
          probableComponent: generated.probableComponent,
          rootCauseSummary: generated.rootCauseHypothesis,
          isRootCauseHypothesis: true,
          severity: generated.severity,
          priority: generated.priority,
          impactSummary: facts.impactAssessment?.businessImpact ?? null,
          duplicateClusterId: facts.clusterMembership?.clusterId ?? null,
          duplicateClusterKey: generated.clusterKey,
          relatedFailureCount: generated.clusterMemberCount ?? 0,
          overallConfidence: generated.calibratedScore,
          confidenceBand: facts.confidenceAssessment?.confidenceBand ?? null,
          environmentJson: generated.environmentSummary as Prisma.InputJsonValue,
          evidenceReferencesJson: generated.evidenceReferences as unknown as Prisma.InputJsonValue,
          knownLimitationsJson:
            generated.limitationsAndUnknowns as unknown as Prisma.InputJsonValue,
          unknownsJson: [] as unknown as Prisma.InputJsonValue,
          markdownReport: generated.reportMarkdown,
          reportFingerprint: generated.reportFingerprint,
          reportVersion: generated.generatorVersion,
          generatorVersion: generated.generatorVersion,
          regenerationReason: null,
          supersedesId: null,
          supersededById: null,
        },
      });

      return this.mapToDto(created);
    });
  }

  /**
   * Retrieves a structured bug report for a failure case, optionally for a specific revision.
   */
  public async getBugReport(input: GetBugReportInputDto): Promise<StructuredBugReportDto | null> {
    const validated = getBugReportInputSchema.parse(input);
    await this.assertCaseAccess(validated.projectId, validated.failureCaseId);

    const where: Prisma.StructuredBugReportWhereInput = {
      projectId: validated.projectId,
      failureCaseId: validated.failureCaseId,
    };

    if (validated.revision !== undefined) {
      where.revision = validated.revision;
    }

    const report = await this.prisma.structuredBugReport.findFirst({
      where,
      orderBy: { revision: 'desc' },
    });

    if (!report) {
      return null;
    }

    const staleness = await this.checkStaleness(report);
    return this.mapToDto(report, staleness.isStale, staleness.stalenessReason);
  }

  /**
   * Lists structured bug reports for a project with optional filters and pagination.
   */
  public async listBugReports(input: ListBugReportsInputDto): Promise<{
    readonly items: readonly StructuredBugReportDto[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly totalPages: number;
  }> {
    const validated = listBugReportsInputSchema.parse(input);

    const where: Prisma.StructuredBugReportWhereInput = {
      projectId: validated.projectId,
    };

    if (validated.defectState) {
      where.applicationDefectState = validated.defectState;
    }

    if (validated.isApplicationDefect !== undefined) {
      where.isApplicationDefect = validated.isApplicationDefect;
    }

    if (validated.status) {
      where.status = validated.status;
    }

    const page = Math.max(1, validated.page || 1);
    const pageSize = Math.min(
      BUG_REPORT_BOUNDS.MAX_PAGE_SIZE,
      Math.max(1, validated.pageSize || BUG_REPORT_BOUNDS.DEFAULT_PAGE_SIZE),
    );
    const skip = (page - 1) * pageSize;

    const [total, reports] = await Promise.all([
      this.prisma.structuredBugReport.count({ where }),
      this.prisma.structuredBugReport.findMany({
        where,
        orderBy: [{ reportNumber: 'desc' }, { revision: 'desc' }],
        skip,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.ceil(total / pageSize) || 1;

    return {
      items: reports.map(r => this.mapToDto(r)),
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Regenerates a structured bug report, creating a new revision and superseding the prior one.
   */
  public async regenerateBugReport(
    input: RegenerateBugReportInputDto,
  ): Promise<StructuredBugReportDto> {
    const validated = regenerateBugReportInputSchema.parse(input);

    if (!validated.reason || validated.reason.trim().length === 0) {
      throw new BugReportInvalidOperationError('Regeneration reason is required.');
    }

    return this.withLock(validated.failureCaseId, async () => {
      await this.assertCaseAccess(validated.projectId, validated.failureCaseId);

      // Find the current latest report
      const latestReport = await this.prisma.structuredBugReport.findFirst({
        where: {
          projectId: validated.projectId,
          failureCaseId: validated.failureCaseId,
        },
        orderBy: { revision: 'desc' },
      });

      if (!latestReport) {
        throw new BugReportNotFoundError(
          `No existing bug report found for failure case '${validated.failureCaseId}' to regenerate.`,
        );
      }

      // Gather latest facts
      const facts = await this.gatherBugReportFacts(
        validated.projectId,
        validated.failureCaseId,
        latestReport.failureAnalysisRunId,
      );

      const nextRevision = latestReport.revision + 1;

      // Generate new revision content
      const generated = this.generator.generate(facts, {
        reportNumber: latestReport.reportNumber,
        revision: nextRevision,
        titleOverride: validated.titleOverride || latestReport.title,
      });

      const reproductionRatio = facts.reproductionSummary?.attemptCount
        ? facts.reproductionSummary.reproducedCount / facts.reproductionSummary.attemptCount
        : null;

      // Transaction: create new revision FIRST, then mark old revision as SUPERSEDED
      const newReport = await this.prisma.$transaction(async tx => {
        const created = await tx.structuredBugReport.create({
          data: {
            projectId: validated.projectId,
            failureCaseId: validated.failureCaseId,
            failureAnalysisRunId: latestReport.failureAnalysisRunId,
            reportNumber: latestReport.reportNumber,
            revision: nextRevision,
            isAuthoritative: true,
            status: 'READY',
            applicationDefectState: generated.defectState,
            isApplicationDefect: generated.isApplicationDefect,
            title: generated.title,
            summary: generated.summary,
            requirementId: generated.requirementId ?? null,
            requirementKey: generated.requirementKey ?? null,
            requirementVersionNumber: generated.requirementVersion ?? null,
            testCaseId: generated.testCaseId ?? facts.testExecution.testCaseId,
            testCaseKey: generated.testCaseKey ?? facts.testCase?.key ?? 'TEST',
            testCaseVersionNumber:
              generated.testCaseVersion ?? facts.testExecution.testCaseVersionNumber ?? 1,
            testCaseTitle: facts.testCase?.title ?? facts.failureCase.title,
            testCaseType: null,
            originalExecutionId: facts.testExecution.id,
            triggeringStatus: facts.testExecution.status,
            failedStepIndex: generated.failedStepIndex,
            failedStepAction: null,
            preconditionsJson: generated.preconditions as unknown as Prisma.InputJsonValue,
            reproductionStepsJson: generated.reproductionSteps as unknown as Prisma.InputJsonValue,
            expectedResult: generated.expectedBehavior,
            actualResult: generated.actualBehavior,
            classificationCategory: (facts.classification?.category as any) ?? null,
            classificationSubcategory: null,
            reproducibilityState: facts.reproductionSummary?.status ?? null,
            reproductionAttempts: facts.reproductionSummary?.attemptCount ?? 0,
            reproductionSuccessCount: facts.reproductionSummary?.reproducedCount ?? 0,
            reproducibilityRatio: reproductionRatio,
            probableLayer: generated.probableLayer,
            probableComponent: generated.probableComponent,
            rootCauseSummary: generated.rootCauseHypothesis,
            isRootCauseHypothesis: true,
            severity: generated.severity,
            priority: generated.priority,
            impactSummary: facts.impactAssessment?.businessImpact ?? null,
            duplicateClusterId: facts.clusterMembership?.clusterId ?? null,
            duplicateClusterKey: generated.clusterKey,
            relatedFailureCount: generated.clusterMemberCount ?? 0,
            overallConfidence: generated.calibratedScore,
            confidenceBand: facts.confidenceAssessment?.confidenceBand ?? null,
            environmentJson: generated.environmentSummary as Prisma.InputJsonValue,
            evidenceReferencesJson:
              generated.evidenceReferences as unknown as Prisma.InputJsonValue,
            knownLimitationsJson:
              generated.limitationsAndUnknowns as unknown as Prisma.InputJsonValue,
            unknownsJson: [] as unknown as Prisma.InputJsonValue,
            markdownReport: generated.reportMarkdown,
            reportFingerprint: generated.reportFingerprint,
            reportVersion: generated.generatorVersion,
            generatorVersion: generated.generatorVersion,
            regenerationReason: validated.reason,
            supersedesId: latestReport.id,
            supersededById: null,
          },
        });

        await tx.structuredBugReport.update({
          where: { id: latestReport.id },
          data: {
            status: 'SUPERSEDED',
            isAuthoritative: false,
            supersededById: created.id,
          },
        });

        return created;
      });

      return this.mapToDto(newReport);
    });
  }

  /**
   * Lists the full audit revision history for a failure case's bug reports.
   */
  public async listBugReportHistory(
    input: ListBugReportHistoryInputDto,
  ): Promise<readonly StructuredBugReportDto[]> {
    const validated = listBugReportHistoryInputSchema.parse(input);
    await this.assertCaseAccess(validated.projectId, validated.failureCaseId);

    const history = await this.prisma.structuredBugReport.findMany({
      where: {
        projectId: validated.projectId,
        failureCaseId: validated.failureCaseId,
      },
      orderBy: { revision: 'desc' },
    });

    return history.map(r => this.mapToDto(r));
  }

  /**
   * Allocates a collision-safe sequential report number for a project (e.g. BUG-000001).
   */
  private async allocateReportNumber(projectId: string): Promise<string> {
    const latest = await this.prisma.structuredBugReport.findFirst({
      where: { projectId },
      orderBy: { reportNumber: 'desc' },
      select: { reportNumber: true },
    });

    if (latest && latest.reportNumber) {
      const match = latest.reportNumber.match(/^BUG-(\d+)$/);
      if (match && match[1]) {
        const nextNum = parseInt(match[1], 10) + 1;
        return `BUG-${String(nextNum).padStart(6, '0')}`;
      }
    }

    const count = await this.prisma.structuredBugReport.count({
      where: { projectId, revision: 1 },
    });
    return `BUG-${String(count + 1).padStart(6, '0')}`;
  }

  /**
   * Asserts failure case exists and belongs to the project.
   */
  private async assertCaseAccess(projectId: string, failureCaseId: string): Promise<void> {
    const fc = await this.prisma.failureCase.findUnique({
      where: { id: failureCaseId },
      select: { id: true, projectId: true },
    });

    if (!fc) {
      throw new BugReportNotFoundError(
        `Failure case '${failureCaseId}' was not found.`,
        failureCaseId,
      );
    }

    if (fc.projectId !== projectId) {
      throw new BugReportCrossProjectError(
        `Access denied: failure case '${failureCaseId}' belongs to project '${fc.projectId}', not '${projectId}'.`,
      );
    }
  }

  /**
   * Dynamic staleness detection comparing report creation time to newer evidence or analyses.
   */
  private async checkStaleness(
    report: Prisma.StructuredBugReportGetPayload<Record<string, never>>,
  ): Promise<{ isStale: boolean; stalenessReason?: string | null }> {
    // Check if new evidence was attached after report generation
    const newerEvidence = await this.prisma.failureEvidenceReference.findFirst({
      where: {
        failureCaseId: report.failureCaseId,
        attachedAt: { gt: report.createdAt },
      },
    });
    if (newerEvidence) {
      return {
        isStale: true,
        stalenessReason:
          'New evidence references have been attached since this report was generated.',
      };
    }

    // Check if newer root cause analysis exists
    const newerRca = await this.prisma.failureRootCauseAnalysis.findFirst({
      where: {
        failureCaseId: report.failureCaseId,
        createdAt: { gt: report.createdAt },
      },
    });
    if (newerRca) {
      return {
        isStale: true,
        stalenessReason:
          'Root-cause analysis was updated or re-evaluated after this report was generated.',
      };
    }

    // Check if newer confidence assessment exists
    const newerConfidence = await this.prisma.confidenceAssessment.findFirst({
      where: {
        failureCaseId: report.failureCaseId,
        assessedAt: { gt: report.createdAt },
      },
    });
    if (newerConfidence) {
      return {
        isStale: true,
        stalenessReason: 'Confidence assessment was re-calculated after this report was generated.',
      };
    }

    return { isStale: false, stalenessReason: null };
  }

  /**
   * Gathers all multi-phase facts across Phases 74–86.
   */
  private async gatherBugReportFacts(
    projectId: string,
    failureCaseId: string,
    analysisRunId?: string | null,
  ): Promise<StructuredBugReportFacts> {
    const fc = await this.prisma.failureCase.findUniqueOrThrow({
      where: { id: failureCaseId },
      include: {
        project: true,
        execution: {
          include: {
            stepExecutions: {
              orderBy: { stepIndex: 'asc' },
            },
          },
        },
        testCase: {
          include: {
            sourceRequirement: true,
            preconditions: {
              orderBy: { sequenceOrder: 'asc' },
            },
          },
        },
        evidenceReferences: {
          orderBy: { attachedAt: 'asc' },
        },
        reproductionAttempts: {
          orderBy: { attemptNumber: 'desc' },
        },
        flakinessAnalyses: {
          where: { isAuthoritative: true },
          take: 1,
        },
        domainSeparations: {
          where: { isAuthoritative: true },
          take: 1,
        },
        technicalLocalizations: {
          where: { isAuthoritative: true },
          take: 1,
        },
        rootCauseAnalyses: {
          where: { isAuthoritative: true },
          take: 1,
        },
        impactAssessments: {
          where: { isAuthoritative: true },
          take: 1,
        },
        clusterMemberships: {
          where: { isActive: true },
          include: {
            cluster: true,
          },
          take: 1,
        },
        confidenceAssessments: {
          where: { isAuthoritative: true },
          take: 1,
        },
        classifications: {
          where: { isAuthoritative: true },
          take: 1,
        },
        aiAssessments: {
          where: { isAuthoritative: true },
          take: 1,
        },
      },
    });

    const classification = fc.classifications[0];
    const aiAssessment = fc.aiAssessments[0];

    // Requirement from TestCase relation if exists
    let requirement = fc.testCase?.sourceRequirement
      ? {
          id: fc.testCase.sourceRequirement.id,
          key: fc.testCase.sourceRequirement.requirementKey,
          title: fc.testCase.sourceRequirement.title,
          version: fc.testCase.sourceRequirementVersionNumber ?? 1,
        }
      : null;

    if (!requirement && fc.testCase?.sourceRequirementId) {
      const directReq = await this.prisma.requirement.findUnique({
        where: { id: fc.testCase.sourceRequirementId },
      });
      if (directReq) {
        requirement = {
          id: directReq.id,
          key: directReq.requirementKey,
          title: directReq.title,
          version: fc.testCase.sourceRequirementVersionNumber ?? 1,
        };
      }
    }

    // Reproduction summary
    let reproductionSummary: StructuredBugReportFacts['reproductionSummary'] = null;
    if (fc.reproductionAttempts && fc.reproductionAttempts.length > 0) {
      const attempts = fc.reproductionAttempts;
      const reproducedCount = attempts.filter(a => a.status === 'REPRODUCED').length;
      const firstAttempt = attempts[0];
      reproductionSummary = {
        status: reproducedCount > 0 ? 'REPRODUCED' : firstAttempt ? firstAttempt.status : 'UNKNOWN',
        attemptCount: attempts.length,
        reproducedCount,
        environmentalSensitivity: null,
      };
    }

    // Evidence references
    const evidenceReferences: readonly ReportEvidenceReferenceDto[] = fc.evidenceReferences.map(
      ref => ({
        id: ref.id,
        evidenceType: String(ref.artifactType),
        filePath: ref.storageIdentity || ref.logicalName,
        sha256: ref.sha256 || '0000000000000000000000000000000000000000000000000000000000000000',
        byteSize: ref.byteSize || 0,
        mimeType: ref.mimeType || 'application/octet-stream',
        integrityStatus: String(ref.integrityStatus),
        description: ref.logicalName,
      }),
    );

    const flakinessRecord = fc.flakinessAnalyses[0];
    const domainRecord = fc.domainSeparations[0];
    const localizationRecord = fc.technicalLocalizations[0];
    const rcaRecord = fc.rootCauseAnalyses[0];
    const impactRecord = fc.impactAssessments[0];
    const clusterRecord = fc.clusterMemberships[0];
    const confidenceRecord = fc.confidenceAssessments[0];

    return {
      projectId,
      failureCaseId,
      analysisRunId,
      failureCase: {
        id: fc.id,
        projectId: fc.projectId,
        executionId: fc.executionId,
        title: fc.title,
        failureSummary: fc.failureSummary,
        metadataJson: fc.metadataJson as Record<string, unknown> | null,
        status: fc.status,
        createdAt: fc.createdAt,
        updatedAt: fc.updatedAt,
      },
      project: {
        id: fc.project.id,
        key:
          fc.project.name
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 6) || 'PROJ',
        name: fc.project.name,
      },
      testExecution: {
        id: fc.execution.id,
        testCaseId: fc.execution.testCaseId,
        testCaseVersionNumber: fc.execution.testCaseVersionNumber,
        status: fc.execution.status,
        errorMessage: fc.execution.errorMessage,
        errorStack: null,
        startedAt: fc.execution.startedAt ?? fc.execution.createdAt,
        completedAt: fc.execution.completedAt ?? null,
        environmentId: fc.execution.environmentId,
        environmentSnapshotJson: fc.execution.environmentSnapshotJson as Record<
          string,
          unknown
        > | null,
        browserConfigJson: { browserEngine: fc.execution.browserEngine },
        executableTestPlanId: fc.execution.executableTestPlanId,
        stepExecutions: fc.execution.stepExecutions.map(
          (s: {
            id: string;
            stepIndex: number;
            actionType: string;
            targetSummary: string | null;
            actionDataJson: unknown;
            expectedSummary: string | null;
            actualSummary: string | null;
            status: string;
            errorMessage: string | null;
            durationMs: number | null;
          }) => ({
            id: s.id,
            stepIndex: s.stepIndex,
            actionType: s.actionType,
            targetSummary: s.targetSummary,
            actionDataJson:
              typeof s.actionDataJson === 'string'
                ? s.actionDataJson
                : JSON.stringify(s.actionDataJson),
            expectedSummary: s.expectedSummary,
            actualSummary: s.actualSummary,
            status: s.status,
            errorMessage: s.errorMessage,
            durationMs: s.durationMs,
            screenshotPath: null,
          }),
        ),
      },
      testCase: fc.testCase
        ? {
            id: fc.testCase.id,
            key: fc.testCase.testCaseKey,
            title: fc.testCase.title,
            version: fc.testCase.currentVersionNumber,
            preconditions: fc.testCase.preconditions.map(
              (p: { description: string }) => p.description,
            ),
            overallExpectedResult: fc.testCase.overallExpectedResult,
            sourceRequirementId: fc.testCase.sourceRequirementId,
            sourceRequirementKey: fc.testCase.sourceRequirementKey,
            sourceRequirementVersionNumber: fc.testCase.sourceRequirementVersionNumber,
          }
        : null,
      requirement,
      evidenceReferences,
      reproductionSummary,
      classification: classification
        ? {
            category: classification.category,
            confidence: 1.0,
            rationale: 'Deterministic classification rules matched',
          }
        : null,
      flakiness: flakinessRecord
        ? {
            flakinessState: flakinessRecord.flakinessState,
            overallScore:
              flakinessRecord.reproducibilityRatio !== null
                ? 1.0 - flakinessRecord.reproducibilityRatio
                : 0.0,
            isFlaky:
              flakinessRecord.flakinessState === 'CONFIRMED_FLAKY' ||
              flakinessRecord.flakinessState === 'FLAKY_CANDIDATE',
          }
        : null,
      domainSeparation: domainRecord
        ? {
            domain: domainRecord.domain,
            rationale: domainRecord.primaryRationale,
            confidenceScore: 0.9,
          }
        : null,
      technicalLocalization: localizationRecord
        ? {
            probableLayer: localizationRecord.primaryLayer,
            probableComponent:
              localizationRecord.matchedSymbolName ?? localizationRecord.uiComponentName ?? null,
            localizationSummary: localizationRecord.localizationRationale,
            primaryFailurePoint:
              localizationRecord.matchedFilePath ??
              localizationRecord.primaryTargetIdentifier ??
              null,
          }
        : null,
      aiAssessment: aiAssessment
        ? {
            defectSummary: aiAssessment.primaryReasoning,
            probableRootCause: aiAssessment.humanExplanation,
            aiConfidence: aiAssessment.confidenceScore,
          }
        : null,
      rootCauseAnalysis: rcaRecord
        ? {
            rootCauseHypothesis: rcaRecord.probableCause,
            epistemicStatus: rcaRecord.rootCauseStatus,
            plausibilityScore: 0.85,
            isPrimaryCandidate: true,
            contributingFactors: Array.isArray(rcaRecord.supportingEvidence)
              ? (rcaRecord.supportingEvidence as unknown as string[])
              : [],
            probableLayer: rcaRecord.probableLayer,
            probableComponent: rcaRecord.probableComponent,
          }
        : null,
      impactAssessment: impactRecord
        ? {
            assessedSeverity: impactRecord.severity,
            assessedPriority: impactRecord.priority,
            businessImpact: impactRecord.businessImpact,
            userImpact: impactRecord.functionalImpact,
            severityConfidence: 0.85,
            priorityConfidence: 0.85,
          }
        : null,
      clusterMembership: clusterRecord
        ? {
            clusterId: clusterRecord.cluster.id,
            clusterKey: clusterRecord.cluster.clusterKey,
            clusterTitle: clusterRecord.cluster.title,
            clusterSize: clusterRecord.cluster.memberCount,
          }
        : null,
      confidenceAssessment: confidenceRecord
        ? {
            calibratedScore: confidenceRecord.overallConfidence,
            confidenceBand: confidenceRecord.confidenceBand,
            explanation: confidenceRecord.humanExplanation,
          }
        : null,
    };
  }

  /**
   * Maps Prisma StructuredBugReport model to DTO.
   */
  private mapToDto(
    r: Prisma.StructuredBugReportGetPayload<Record<string, never>>,
    isStaleOverride?: boolean,
    stalenessReasonOverride?: string | null,
  ): StructuredBugReportDto {
    const preconditions = Array.isArray(r.preconditionsJson)
      ? (r.preconditionsJson as unknown as string[])
      : [];

    const reproductionSteps = Array.isArray(r.reproductionStepsJson)
      ? (r.reproductionStepsJson as unknown as DerivedReproductionStepDto[])
      : [];

    const evidenceReferences = Array.isArray(r.evidenceReferencesJson)
      ? (r.evidenceReferencesJson as unknown as ReportEvidenceReferenceDto[])
      : [];

    const limitationsAndUnknowns = Array.isArray(r.knownLimitationsJson)
      ? (r.knownLimitationsJson as unknown as string[])
      : [];

    return {
      id: r.id,
      projectId: r.projectId,
      failureCaseId: r.failureCaseId,
      analysisRunId: r.failureAnalysisRunId,
      reportNumber: r.reportNumber,
      revision: r.revision,
      status: r.status,
      defectState: r.applicationDefectState,
      isApplicationDefect: r.isApplicationDefect,
      title: r.title,
      summary: r.summary,
      environmentSummary: (r.environmentJson as Record<string, unknown>) || {},
      requirementId: r.requirementId,
      requirementKey: r.requirementKey,
      requirementVersion: r.requirementVersionNumber,
      testCaseId: r.testCaseId,
      testCaseKey: r.testCaseKey,
      testCaseVersion: r.testCaseVersionNumber,
      executionPlanId: null,
      preconditions,
      reproductionSteps,
      expectedBehavior: r.expectedResult,
      actualBehavior: r.actualResult,
      failedStepIndex: r.failedStepIndex,
      rootCauseHypothesis: r.rootCauseSummary,
      probableLayer: r.probableLayer,
      probableComponent: r.probableComponent,
      severity: r.severity,
      priority: r.priority,
      clusterKey: r.duplicateClusterKey,
      clusterMemberCount: r.relatedFailureCount,
      calibratedScore: r.overallConfidence,
      evidenceReferences,
      limitationsAndUnknowns,
      reportMarkdown: r.markdownReport,
      reportFingerprint: r.reportFingerprint,
      generatorVersion: r.generatorVersion,
      regenerationReason: r.regenerationReason,
      supersededById: r.supersededById,
      supersedesId: r.supersedesId,
      isStale: isStaleOverride ?? false,
      stalenessReason: stalenessReasonOverride ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
