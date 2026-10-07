/**
 * @file packages/core/src/qa-report/final-qa-report-certification.test.ts
 * Phase 109 Comprehensive Certification Test Suite.
 * Certifies end-to-end report generation, deterministic release policy gating,
 * multi-version immutability, staleness detection, and cryptographic integrity exports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient, FinalQaReport as PrismaFinalQaReport } from '@prisma/client';
import { FinalQaReportService } from './final-qa-report-service.js';
import { QaReportExporter } from './qa-report-exporter.js';
import { ReleaseReadinessPolicyEngine } from './release-readiness-policy.js';
import type { QaReportSnapshot } from './qa-report-types.js';

describe('V7 Phase 109 — Final QA Report & Release Readiness Certification', () => {
  const projectId = '77777777-7777-7777-7777-777777777777';
  const releaseId = 'v7.0.0-GA';

  it('certifies complete closed-loop Phase 109 QA report and release readiness lifecycle', async () => {
    const reports: PrismaFinalQaReport[] = [];
    const auditEvents: Array<Record<string, unknown>> = [];
    let newerExecutionsCount = 0;

    const certSnapshot: QaReportSnapshot = {
      requirementSummary: {
        total: 12,
        testable: 12,
        covered: 12,
        verified: 12,
        uncovered: 0,
        failing: 0,
        blocked: 0,
        coveragePercentage: 100.0,
        verifiedPercentage: 100.0,
      },
      testExecutionSummary: {
        totalDistinctTests: 80,
        totalExecutionAttempts: 88,
        passedCount: 80,
        failedCount: 0,
        blockedCount: 0,
        automationErrorCount: 0,
        cancelledCount: 0,
        passPercentage: 100.0,
        retryCount: 8,
        passedAfterRetryCount: 4,
      },
      failureDomainSummary: {
        totalFailures: 0,
        applicationDefects: 0,
        automationFailures: 0,
        testDataFailures: 0,
        environmentFailures: 0,
        blockedFailures: 0,
        inconclusiveFailures: 0,
        unknownFailures: 0,
      },
      defectSummary: {
        totalDefects: 0,
        openCritical: 0,
        openHigh: 0,
        openMedium: 0,
        openLow: 0,
        resolvedOrClosed: 4,
        verifiedFixed: 4,
        reverificationPending: 0,
        reverificationFailed: 0,
      },
      reverificationSummary: {
        totalReverifications: 4,
        verifiedFixedCount: 4,
        stillFailingCount: 0,
        differentFailureCount: 0,
        blockedCount: 0,
        inconclusiveCount: 0,
      },
      regressionSummary: {
        totalRetestPlans: 2,
        totalRegressionTests: 25,
        passedRegressionTests: 25,
        failedRegressionTests: 0,
        untestedRegressionTests: 0,
        allMandatoryRegressionsPassed: true,
      },
      flakinessSummary: {
        flakyTestsDetected: 0,
        flakyExecutionAttempts: 0,
        flakinessRate: 0.0,
      },
      automationHealth: {
        status: 'HEALTHY',
        issues: [],
        details: {},
      },
      environmentHealth: {
        status: 'HEALTHY',
        issues: [],
        details: {},
      },
      testDataHealth: {
        status: 'HEALTHY',
        issues: [],
        details: {},
      },
      securityFindings: [],
      releaseBlockers: [],
      residualRisks: [],
      knownLimitations: [],
      traceabilityMatrix: [
        {
          requirementId: 'req-01',
          requirementKey: 'REQ-AUTH-01',
          title: 'Multi-factor authentication',
          priority: 'P0',
          status: 'ACTIVE',
          associatedTestCount: 4,
          verified: true,
          failingTests: [],
        },
      ],
      evidenceReferences: [],
      snapshotTime: new Date(),
    };

    const mockPrisma = {
      project: {
        findUnique: async (args: { where: { id: string } }) => {
          if (args.where.id === projectId) return { id: projectId, name: 'Cert Project' };
          return null;
        },
      },
      finalQaReport: {
        findMany: async (args: { where: { projectId: string; releaseIdentifier?: string } }) => {
          return reports.filter(
            r =>
              r.projectId === args.where.projectId &&
              (!args.where.releaseIdentifier || r.releaseIdentifier === args.where.releaseIdentifier),
          );
        },
        findUnique: async (args: { where: { id: string } }) => {
          return reports.find(r => r.id === args.where.id) ?? null;
        },
        findFirst: async (args: { where: any }) => {
          if (args.where?.OR) {
            const orList = args.where.OR;
            return (
              reports.find(r =>
                orList.some(
                  (cond: any) =>
                    (cond.id && cond.id === r.id) ||
                    (cond.reportKey && cond.reportKey === r.reportKey),
                ),
              ) ?? null
            );
          }
          if (args.where?.projectId) {
            return reports.find(r => r.projectId === args.where.projectId) ?? null;
          }
          return reports[0] ?? null;
        },
        create: async (args: { data: Record<string, unknown> }) => {
          const newReport = {
            id: `cert-rep-${reports.length + 1}`,
            ...args.data,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as unknown as PrismaFinalQaReport;
          reports.push(newReport);
          return newReport;
        },
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          const idx = reports.findIndex(r => r.id === args.where.id);
          if (idx < 0) throw new Error('Not found');
          const updated = {
            ...reports[idx],
            ...args.data,
            updatedAt: new Date(),
          } as unknown as PrismaFinalQaReport;
          reports[idx] = updated;
          return updated;
        },
      },
      qaReportAuditEvent: {
        create: async (args: { data: Record<string, unknown> }) => {
          auditEvents.push(args.data);
          return { id: `event-${auditEvents.length}`, ...args.data };
        },
      },
      testCaseExecution: {
        count: async () => newerExecutionsCount,
      },
      structuredBugReport: {
        count: async () => 0,
      },
      $transaction: async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> => {
        return cb(mockPrisma);
      },
    } as unknown as PrismaClient;

    const assembler = {
      assembleSnapshot: async () => certSnapshot,
    };
    const policyEngine = new ReleaseReadinessPolicyEngine();
    const exporter = new QaReportExporter();

    const service = new FinalQaReportService({
      prisma: mockPrisma,
      assembler,
      policyEngine,
      exporter,
    });

    // STEP 1: Generate Report v1
    const reportV1 = await service.generateReport({
      projectId,
      releaseIdentifier: releaseId,
      buildIdentifier: 'build-7001',
      branch: 'main',
    });

    assert.equal(reportV1.releaseIdentifier, releaseId);
    assert.equal(reportV1.reportVersion, 1);
    assert.equal(reportV1.status, 'DRAFT');
    assert.equal(reportV1.verdict, 'READY');
    assert.equal(reportV1.readinessScore, 100);
    assert.ok(reportV1.checksumSha256);

    // STEP 2: Finalize Report v1
    const finalizedV1 = await service.finalizeReport({
      projectId,
      reportId: reportV1.id,
      actorId: 'qa-lead-certifier',
    });

    assert.equal(finalizedV1.status, 'FINAL');
    assert.ok(finalizedV1.finalizedAt);

    // STEP 3: Export in JSON and Markdown
    const jsonExport = await service.exportReport({
      projectId,
      reportId: finalizedV1.id,
      format: 'JSON',
    });
    assert.equal(jsonExport.contentType, 'application/json');
    assert.ok(jsonExport.content.includes(releaseId));

    const mdExport = await service.exportReport({
      projectId,
      reportId: finalizedV1.id,
      format: 'MARKDOWN',
    });
    assert.equal(mdExport.contentType, 'text/markdown');
    assert.ok(mdExport.content.includes('VERDICT: READY FOR RELEASE'));
    assert.ok(mdExport.content.includes(finalizedV1.checksumSha256));
    assert.ok(mdExport.checksumSha256);

    // STEP 4: Detect Staleness when new test executions arrive
    const stalenessBefore = await service.checkStaleness({
      projectId,
      reportId: finalizedV1.id,
    });
    assert.equal(stalenessBefore.isStale, false);

    // Simulate 3 new test runs arriving after snapshot
    newerExecutionsCount = 3;
    const stalenessAfter = await service.checkStaleness({
      projectId,
      reportId: finalizedV1.id,
    });
    assert.equal(stalenessAfter.isStale, true);
    assert.ok(stalenessAfter.staleReason?.includes('3 new test execution(s)'));

    // STEP 5: Auto-versioning — Generate Report v2
    const reportV2 = await service.generateReport({
      projectId,
      releaseIdentifier: releaseId,
      buildIdentifier: 'build-7002',
    });

    assert.equal(reportV2.reportVersion, 2);
    assert.equal(reportV2.status, 'DRAFT');

    // STEP 6: Finalize Report v2 -> Supersedes v1
    const finalizedV2 = await service.finalizeReport({
      projectId,
      reportId: reportV2.id,
    });

    assert.equal(finalizedV2.status, 'FINAL');
    assert.equal(finalizedV2.reportVersion, 2);

    const v1Stored = reports.find(r => r.id === reportV1.id);
    assert.equal(v1Stored?.status, 'SUPERSEDED');

    // Verify complete audit trail
    const actions = auditEvents.map(e => e.action);
    assert.ok(actions.includes('REPORT_GENERATED'));
    assert.ok(actions.includes('REPORT_FINALIZED'));
    assert.ok(actions.includes('EXPORT_GENERATED'));
    assert.ok(actions.includes('REPORT_SUPERSEDED'));
  });
});
