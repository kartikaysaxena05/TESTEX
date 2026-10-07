/**
 * @file packages/core/src/qa-report/final-qa-report-service.ts
 * Core business orchestrator for V7 Phase 109 Final QA Report & Release Readiness Intelligence.
 * Coordinates snapshot assembly, deterministic policy evaluation, auto-versioning,
 * multi-version immutability enforcement, staleness detection, and structured exports.
 */

import crypto from 'node:crypto';
import type { PrismaClient, FinalQaReport as PrismaFinalQaReport } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';
import {
  QA_REPORT_BOUNDS,
  QA_REPORT_POLICY_VERSION,
  type CheckQaReportStalenessInputDto,
  type EvaluateReleasePolicyInputDto,
  type ExportQaReportInputDto,
  type ExportQaReportResultDto,
  type FinalQaReportDto,
  type FinalizeQaReportInputDto,
  type GenerateQaReportInputDto,
  type GetQaReportInputDto,
  type IFinalQaReportService,
  type IQaReportExporter,
  type IQaReportSnapshotAssembler,
  type IReleaseReadinessPolicyEngine,
  type ListQaReportsInputDto,
  type QaReportStalenessResultDto,
  type ReleasePolicyEvaluationResultDto,
} from './qa-report-types.js';
import {
  QaReportAlreadyFinalError,
  QaReportImmutabilityViolationError,
  QaReportNotFoundError,
  QaReportProjectMismatchError,
  QaReportValidationError,
} from './qa-report-errors.js';
import { QaReportSnapshotAssembler } from './qa-report-snapshot-assembler.js';
import { ReleaseReadinessPolicyEngine } from './release-readiness-policy.js';
import { QaReportExporter } from './qa-report-exporter.js';

export class FinalQaReportService implements IFinalQaReportService {
  private readonly prisma: PrismaClient;
  private readonly assembler: IQaReportSnapshotAssembler;
  private readonly policyEngine: IReleaseReadinessPolicyEngine;
  private readonly exporter: IQaReportExporter;

  constructor(options?: {
    readonly prisma?: PrismaClient;
    readonly assembler?: IQaReportSnapshotAssembler;
    readonly policyEngine?: IReleaseReadinessPolicyEngine;
    readonly exporter?: IQaReportExporter;
  }) {
    const client = options?.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database client unavailable for FinalQaReportService');
    }
    this.prisma = client;
    this.assembler = options?.assembler ?? new QaReportSnapshotAssembler({ prisma: this.prisma });
    this.policyEngine = options?.policyEngine ?? new ReleaseReadinessPolicyEngine();
    this.exporter = options?.exporter ?? new QaReportExporter();
  }

  public async generateReport(input: GenerateQaReportInputDto): Promise<FinalQaReportDto> {
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
    });
    if (!project) {
      throw new QaReportProjectMismatchError(`Project '${input.projectId}' not found.`);
    }

    if (!input.releaseIdentifier || input.releaseIdentifier.trim() === '') {
      throw new QaReportValidationError('releaseIdentifier is required and cannot be empty.');
    }

    // Assemble snapshot across all V1-V7 modules
    const snapshot = await this.assembler.assembleSnapshot({
      projectId: input.projectId,
      environmentId: input.environmentId,
    });

    // Evaluate release readiness policy
    const policyResult = this.policyEngine.evaluate({
      snapshot,
      policyVersion: input.policyVersion,
    });

    // Determine report versioning
    const existingReports = await this.prisma.finalQaReport.findMany({
      where: {
        projectId: input.projectId,
        releaseIdentifier: input.releaseIdentifier,
      },
      orderBy: { reportVersion: 'desc' },
      take: 1,
    });

    let reportVersion = 1;
    let existingDraftId: string | null = null;
    let reportKey: string;

    const latest = existingReports[0];
    if (latest) {
      if (latest.status === 'DRAFT') {
        // Reuse draft version and key
        reportVersion = latest.reportVersion;
        existingDraftId = latest.id;
        reportKey = latest.reportKey;
      } else {
        // Increment version because latest is FINAL or SUPERSEDED
        reportVersion = latest.reportVersion + 1;
        reportKey = this.generateReportKey();
      }
    } else {
      reportKey = this.generateReportKey();
    }

    // Generate executive summary and recommendations
    const executiveSummary = this.composeExecutiveSummary({
      releaseIdentifier: input.releaseIdentifier,
      reportVersion,
      verdict: policyResult.verdict,
      readinessScore: policyResult.readinessScore ?? null,
      snapshot,
    });

    const overallRecommendation =
      policyResult.recommendations.join(' ') ||
      'No immediate remedial action required for release gating.';

    // Generate SHA-256 seal
    const sealPayload = {
      projectId: input.projectId,
      releaseIdentifier: input.releaseIdentifier,
      reportVersion,
      verdict: policyResult.verdict,
      readinessScore: policyResult.readinessScore,
      sourceSnapshotTime: snapshot.snapshotTime.toISOString(),
      testExecutionSummary: snapshot.testExecutionSummary,
      requirementSummary: snapshot.requirementSummary,
      defectSummary: snapshot.defectSummary,
    };
    const checksumSha256 = crypto
      .createHash('sha256')
      .update(JSON.stringify(sealPayload), 'utf8')
      .digest('hex');

    let savedReport: PrismaFinalQaReport;

    if (existingDraftId) {
      savedReport = await this.prisma.finalQaReport.update({
        where: { id: existingDraftId },
        data: {
          environmentId: input.environmentId,
          buildIdentifier: input.buildIdentifier,
          commitSha: input.commitSha,
          branch: input.branch,
          environmentName: input.environmentName,
          verdict: policyResult.verdict,
          policyVersion: policyResult.policyVersion,
          policyRulesEvaluated: policyResult.passedRules.concat(policyResult.failedRules) as unknown as object,
          policyRulesPassed: policyResult.passedRules as unknown as object,
          policyRulesFailed: policyResult.failedRules as unknown as object,
          blockingRules: policyResult.blockingRules as unknown as object,
          warningRules: policyResult.warningRules as unknown as object,
          readinessScore: policyResult.readinessScore ?? null,
          readinessExplanation: policyResult.explanation,
          executiveSummary,
          overallRecommendation,
          requirementSummaryJson: snapshot.requirementSummary as unknown as object,
          testExecutionSummaryJson: snapshot.testExecutionSummary as unknown as object,
          failureDomainSummaryJson: snapshot.failureDomainSummary as unknown as object,
          defectSummaryJson: snapshot.defectSummary as unknown as object,
          reverificationSummaryJson: snapshot.reverificationSummary as unknown as object,
          regressionSummaryJson: snapshot.regressionSummary as unknown as object,
          flakinessSummaryJson: snapshot.flakinessSummary as unknown as object,
          automationHealthJson: snapshot.automationHealth as unknown as object,
          environmentHealthJson: snapshot.environmentHealth as unknown as object,
          testDataHealthJson: snapshot.testDataHealth as unknown as object,
          securityFindingsJson: snapshot.securityFindings as unknown as object,
          releaseBlockersJson: policyResult.blockingRules as unknown as object,
          residualRisksJson: policyResult.warningRules as unknown as object,
          knownLimitationsJson: snapshot.knownLimitations as unknown as object,
          traceabilityMatrixJson: snapshot.traceabilityMatrix as unknown as object,
          evidenceReferencesJson: snapshot.evidenceReferences as unknown as object,
          sourceSnapshotTime: snapshot.snapshotTime,
          isStale: false,
          staleReason: null,
          checksumSha256,
        },
      });
    } else {
      savedReport = await this.prisma.finalQaReport.create({
        data: {
          projectId: input.projectId,
          environmentId: input.environmentId,
          reportKey,
          releaseIdentifier: input.releaseIdentifier,
          buildIdentifier: input.buildIdentifier,
          commitSha: input.commitSha,
          branch: input.branch,
          environmentName: input.environmentName,
          reportVersion,
          status: 'DRAFT',
          verdict: policyResult.verdict,
          policyVersion: policyResult.policyVersion,
          policyRulesEvaluated: policyResult.passedRules.concat(policyResult.failedRules) as unknown as object,
          policyRulesPassed: policyResult.passedRules as unknown as object,
          policyRulesFailed: policyResult.failedRules as unknown as object,
          blockingRules: policyResult.blockingRules as unknown as object,
          warningRules: policyResult.warningRules as unknown as object,
          readinessScore: policyResult.readinessScore ?? null,
          readinessExplanation: policyResult.explanation,
          executiveSummary,
          overallRecommendation,
          requirementSummaryJson: snapshot.requirementSummary as unknown as object,
          testExecutionSummaryJson: snapshot.testExecutionSummary as unknown as object,
          failureDomainSummaryJson: snapshot.failureDomainSummary as unknown as object,
          defectSummaryJson: snapshot.defectSummary as unknown as object,
          reverificationSummaryJson: snapshot.reverificationSummary as unknown as object,
          regressionSummaryJson: snapshot.regressionSummary as unknown as object,
          flakinessSummaryJson: snapshot.flakinessSummary as unknown as object,
          automationHealthJson: snapshot.automationHealth as unknown as object,
          environmentHealthJson: snapshot.environmentHealth as unknown as object,
          testDataHealthJson: snapshot.testDataHealth as unknown as object,
          securityFindingsJson: snapshot.securityFindings as unknown as object,
          releaseBlockersJson: policyResult.blockingRules as unknown as object,
          residualRisksJson: policyResult.warningRules as unknown as object,
          knownLimitationsJson: snapshot.knownLimitations as unknown as object,
          traceabilityMatrixJson: snapshot.traceabilityMatrix as unknown as object,
          evidenceReferencesJson: snapshot.evidenceReferences as unknown as object,
          sourceSnapshotTime: snapshot.snapshotTime,
          generatedByActorId: input.actorId ?? 'SYSTEM',
          isStale: false,
          checksumSha256,
        },
      });
    }

    // Audit Event
    await this.prisma.qaReportAuditEvent.create({
      data: {
        reportId: savedReport.id,
        projectId: input.projectId,
        action: 'REPORT_GENERATED',
        actorId: input.actorId ?? 'SYSTEM',
        details: {
          reportKey: savedReport.reportKey,
          releaseIdentifier: savedReport.releaseIdentifier,
          reportVersion: savedReport.reportVersion,
          verdict: savedReport.verdict,
          readinessScore: savedReport.readinessScore,
        },
      },
    });

    return this.mapToDto(savedReport);
  }

  public async getReport(input: GetQaReportInputDto): Promise<FinalQaReportDto | null> {
    const report = await this.prisma.finalQaReport.findFirst({
      where: {
        OR: [{ id: input.reportIdOrKey }, { reportKey: input.reportIdOrKey }],
        ...(input.version !== undefined ? { reportVersion: input.version } : {}),
      },
    });

    if (!report) {
      return null;
    }

    if (report.projectId !== input.projectId) {
      throw new QaReportProjectMismatchError(
        `Report '${input.reportIdOrKey}' does not belong to project '${input.projectId}'.`,
      );
    }

    return this.mapToDto(report);
  }

  public async listReports(input: ListQaReportsInputDto): Promise<readonly FinalQaReportDto[]> {
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
    });
    if (!project) {
      throw new QaReportProjectMismatchError(`Project '${input.projectId}' not found.`);
    }

    const limit = Math.min(input.limit ?? QA_REPORT_BOUNDS.DEFAULT_LIST_LIMIT, QA_REPORT_BOUNDS.MAX_LIST_LIMIT);
    const offset = input.offset ?? 0;

    const reports = await this.prisma.finalQaReport.findMany({
      where: {
        projectId: input.projectId,
        ...(input.releaseIdentifier ? { releaseIdentifier: input.releaseIdentifier } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.verdict ? { verdict: input.verdict } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return reports.map(r => this.mapToDto(r));
  }

  public async finalizeReport(input: FinalizeQaReportInputDto): Promise<FinalQaReportDto> {
    const report = await this.prisma.finalQaReport.findUnique({
      where: { id: input.reportId },
    });

    if (!report) {
      throw new QaReportNotFoundError(`Report '${input.reportId}' not found.`);
    }

    if (report.projectId !== input.projectId) {
      throw new QaReportProjectMismatchError(
        `Report '${input.reportId}' does not belong to project '${input.projectId}'.`,
      );
    }

    if (report.status === 'FINAL') {
      throw new QaReportAlreadyFinalError(
        `Report '${report.reportKey}' (version ${report.reportVersion}) is already finalized and cannot be modified.`,
      );
    }

    if (report.status === 'SUPERSEDED') {
      throw new QaReportImmutabilityViolationError(
        `Report '${report.reportKey}' is superseded and cannot be finalized.`,
      );
    }

    const finalizedAt = new Date();

    // In a transaction, supersede any existing FINAL reports for this releaseIdentifier,
    // and finalize this report
    const finalizedReport = await this.prisma.$transaction(async tx => {
      // Find prior FINAL reports
      const priorFinalReports = await tx.finalQaReport.findMany({
        where: {
          projectId: input.projectId,
          releaseIdentifier: report.releaseIdentifier,
          status: 'FINAL',
          id: { not: report.id },
        },
      });

      for (const prior of priorFinalReports) {
        await tx.finalQaReport.update({
          where: { id: prior.id },
          data: { status: 'SUPERSEDED' },
        });

        await tx.qaReportAuditEvent.create({
          data: {
            reportId: prior.id,
            projectId: input.projectId,
            action: 'REPORT_SUPERSEDED',
            actorId: input.actorId ?? 'SYSTEM',
            details: {
              supersededByReportId: report.id,
              supersededByVersion: report.reportVersion,
            },
          },
        });
      }

      // Recompute sealed checksum with finalization timestamp
      const sealPayload = {
        id: report.id,
        projectId: report.projectId,
        releaseIdentifier: report.releaseIdentifier,
        reportVersion: report.reportVersion,
        status: 'FINAL',
        verdict: report.verdict,
        readinessScore: report.readinessScore,
        sourceSnapshotTime: report.sourceSnapshotTime.toISOString(),
        finalizedAt: finalizedAt.toISOString(),
      };
      const checksumSha256 = crypto
        .createHash('sha256')
        .update(JSON.stringify(sealPayload), 'utf8')
        .digest('hex');

      const updated = await tx.finalQaReport.update({
        where: { id: report.id },
        data: {
          status: 'FINAL',
          finalizedAt,
          checksumSha256,
        },
      });

      await tx.qaReportAuditEvent.create({
        data: {
          reportId: updated.id,
          projectId: input.projectId,
          action: 'REPORT_FINALIZED',
          actorId: input.actorId ?? 'SYSTEM',
          details: {
            reportKey: updated.reportKey,
            releaseIdentifier: updated.releaseIdentifier,
            reportVersion: updated.reportVersion,
            verdict: updated.verdict,
            finalizedAt: finalizedAt.toISOString(),
          },
        },
      });

      return updated;
    });

    return this.mapToDto(finalizedReport);
  }

  public async exportReport(input: ExportQaReportInputDto): Promise<ExportQaReportResultDto> {
    const report = await this.getReport({
      projectId: input.projectId,
      reportIdOrKey: input.reportId,
    });

    if (!report) {
      throw new QaReportNotFoundError(`Report '${input.reportId}' not found.`);
    }

    const exportResult = await this.exporter.exportReport({
      report,
      format: input.format ?? 'JSON',
    });

    // Audit export action
    await this.prisma.qaReportAuditEvent.create({
      data: {
        reportId: report.id,
        projectId: input.projectId,
        action: 'EXPORT_GENERATED',
        actorId: 'SYSTEM',
        details: {
          format: input.format ?? 'JSON',
          fileName: exportResult.fileName,
          checksumSha256: exportResult.checksumSha256,
        },
      },
    });

    return exportResult;
  }

  public async evaluatePolicy(
    input: EvaluateReleasePolicyInputDto,
  ): Promise<ReleasePolicyEvaluationResultDto> {
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
    });
    if (!project) {
      throw new QaReportProjectMismatchError(`Project '${input.projectId}' not found.`);
    }

    const snapshot = await this.assembler.assembleSnapshot({
      projectId: input.projectId,
    });

    const result = this.policyEngine.evaluate({
      snapshot,
      policyVersion: input.policyVersion,
    });

    return result;
  }

  public async checkStaleness(
    input: CheckQaReportStalenessInputDto,
  ): Promise<QaReportStalenessResultDto> {
    const report = await this.prisma.finalQaReport.findUnique({
      where: { id: input.reportId },
    });

    if (!report) {
      throw new QaReportNotFoundError(`Report '${input.reportId}' not found.`);
    }

    if (report.projectId !== input.projectId) {
      throw new QaReportProjectMismatchError(
        `Report '${input.reportId}' does not belong to project '${input.projectId}'.`,
      );
    }

    const now = new Date();
    let isStale = false;
    let staleReason: string | null = null;

    // Check if new test executions were recorded after snapshot
    const newerExecutionsCount = await this.prisma.testCaseExecution.count({
      where: {
        projectId: input.projectId,
        createdAt: { gt: report.sourceSnapshotTime },
      },
    });

    if (newerExecutionsCount > 0) {
      isStale = true;
      staleReason = `${newerExecutionsCount} new test execution(s) recorded since report snapshot.`;
    }

    // Check if new defects or defect workflow state changes occurred
    if (!isStale) {
      const newerDefectsCount = await this.prisma.structuredBugReport.count({
        where: {
          projectId: input.projectId,
          createdAt: { gt: report.sourceSnapshotTime },
        },
      });

      if (newerDefectsCount > 0) {
        isStale = true;
        staleReason = `${newerDefectsCount} new bug report(s) created since report snapshot.`;
      }
    }

    // Check if time-based threshold exceeded
    if (!isStale) {
      const elapsedMs = now.getTime() - report.sourceSnapshotTime.getTime();
      if (elapsedMs > QA_REPORT_BOUNDS.STALENESS_THRESHOLD_MS) {
        isStale = true;
        staleReason = `Snapshot age (${Math.round(elapsedMs / 3600_000)}h) exceeds staleness threshold.`;
      }
    }

    // Persist staleness state if changed
    if (report.isStale !== isStale || report.staleReason !== staleReason) {
      await this.prisma.finalQaReport.update({
        where: { id: report.id },
        data: {
          isStale,
          staleReason,
        },
      });
    }

    return {
      reportId: report.id,
      isStale,
      staleReason,
      lastSnapshotTime: report.sourceSnapshotTime.toISOString(),
      checkedAt: now.toISOString(),
    };
  }

  private generateReportKey(): string {
    const prefix = 'REP';
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}-${dateStr}-${rand}`;
  }

  private composeExecutiveSummary(params: {
    readonly releaseIdentifier: string;
    readonly reportVersion: number;
    readonly verdict: string;
    readonly readinessScore: number | null;
    readonly snapshot: ReturnType<typeof QaReportSnapshotAssembler.prototype.assembleSnapshot> extends Promise<infer U> ? U : never;
  }): string {
    const { releaseIdentifier, reportVersion, verdict, readinessScore, snapshot } = params;
    const distinctTests = snapshot.testExecutionSummary.totalDistinctTests;
    const passPercentage = snapshot.testExecutionSummary.passPercentage;
    const reqCovered = snapshot.requirementSummary.covered;
    const reqTotal = snapshot.requirementSummary.total;
    const openCritical = snapshot.defectSummary.openCritical;
    const openHigh = snapshot.defectSummary.openHigh;

    return (
      `Authoritative Quality Assurance evaluation for release '${releaseIdentifier}' (Report v${reportVersion}). ` +
      `Evaluated ${distinctTests} distinct test case(s) with a pass rate of ${passPercentage}%. ` +
      `Requirement traceability covers ${reqCovered}/${reqTotal} requirements (${snapshot.requirementSummary.coveragePercentage}%). ` +
      `Active defect triage identifies ${openCritical} Critical and ${openHigh} High open defect candidates. ` +
      `Overall Release Readiness Verdict: ${verdict} (Score: ${readinessScore !== null ? `${readinessScore}/100` : 'N/A'}).`
    );
  }

  private mapToDto(model: PrismaFinalQaReport): FinalQaReportDto {
    return {
      id: model.id,
      projectId: model.projectId,
      environmentId: model.environmentId,
      reportKey: model.reportKey,
      releaseIdentifier: model.releaseIdentifier,
      buildIdentifier: model.buildIdentifier,
      commitSha: model.commitSha,
      branch: model.branch,
      environmentName: model.environmentName,
      reportVersion: model.reportVersion,
      status: model.status as FinalQaReportDto['status'],
      verdict: model.verdict as FinalQaReportDto['verdict'],
      policyVersion: model.policyVersion,
      policyRulesEvaluated: (model.policyRulesEvaluated as unknown as unknown[]) ?? [],
      policyRulesPassed: (model.policyRulesPassed as unknown as string[]) ?? [],
      policyRulesFailed: (model.policyRulesFailed as unknown as string[]) ?? [],
      blockingRules: (model.blockingRules as unknown as FinalQaReportDto['blockingRules']) ?? [],
      warningRules: (model.warningRules as unknown as FinalQaReportDto['warningRules']) ?? [],
      readinessScore: model.readinessScore,
      readinessExplanation: model.readinessExplanation,
      executiveSummary: model.executiveSummary,
      overallRecommendation: model.overallRecommendation,
      requirementSummary: model.requirementSummaryJson as unknown as FinalQaReportDto['requirementSummary'],
      testExecutionSummary: model.testExecutionSummaryJson as unknown as FinalQaReportDto['testExecutionSummary'],
      failureDomainSummary: model.failureDomainSummaryJson as unknown as FinalQaReportDto['failureDomainSummary'],
      defectSummary: model.defectSummaryJson as unknown as FinalQaReportDto['defectSummary'],
      reverificationSummary: model.reverificationSummaryJson as unknown as FinalQaReportDto['reverificationSummary'],
      regressionSummary: model.regressionSummaryJson as unknown as FinalQaReportDto['regressionSummary'],
      flakinessSummary: model.flakinessSummaryJson as unknown as FinalQaReportDto['flakinessSummary'],
      automationHealth: model.automationHealthJson as unknown as FinalQaReportDto['automationHealth'],
      environmentHealth: model.environmentHealthJson as unknown as FinalQaReportDto['environmentHealth'],
      testDataHealth: model.testDataHealthJson as unknown as FinalQaReportDto['testDataHealth'],
      securityFindings: (model.securityFindingsJson as unknown as unknown[]) ?? [],
      releaseBlockers: (model.releaseBlockersJson as unknown as FinalQaReportDto['releaseBlockers']) ?? [],
      residualRisks: (model.residualRisksJson as unknown as FinalQaReportDto['residualRisks']) ?? [],
      knownLimitations: (model.knownLimitationsJson as unknown as FinalQaReportDto['knownLimitations']) ?? [],
      traceabilityMatrix: (model.traceabilityMatrixJson as unknown as FinalQaReportDto['traceabilityMatrix']) ?? [],
      evidenceReferences: (model.evidenceReferencesJson as unknown as FinalQaReportDto['evidenceReferences']) ?? [],
      sourceSnapshotTime: model.sourceSnapshotTime.toISOString(),
      finalizedAt: model.finalizedAt?.toISOString() ?? null,
      generatedByActorId: model.generatedByActorId,
      isStale: model.isStale,
      staleReason: model.staleReason,
      checksumSha256: model.checksumSha256,
      createdAt: model.createdAt.toISOString(),
      updatedAt: model.updatedAt.toISOString(),
    };
  }
}
