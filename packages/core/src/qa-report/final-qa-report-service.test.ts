/**
 * @file packages/core/src/qa-report/final-qa-report-service.test.ts
 * Tests for FinalQaReportService lifecycle, auto-versioning, immutability, and staleness detection.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient, FinalQaReport as PrismaFinalQaReport } from '@prisma/client';
import { FinalQaReportService } from './final-qa-report-service.js';
import {
  QaReportAlreadyFinalError,
  QaReportNotFoundError,
  QaReportProjectMismatchError,
} from './qa-report-errors.js';
import type { QaReportSnapshot } from './qa-report-types.js';

describe('V7 Phase 109 - Final QA Report Service', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const otherProjectId = '99999999-9999-9999-9999-999999999999';

  const mockSnapshot: QaReportSnapshot = {
    requirementSummary: {
      total: 5,
      testable: 5,
      covered: 5,
      verified: 5,
      uncovered: 0,
      failing: 0,
      blocked: 0,
      coveragePercentage: 100,
      verifiedPercentage: 100,
    },
    testExecutionSummary: {
      totalDistinctTests: 20,
      totalExecutionAttempts: 20,
      passedCount: 20,
      failedCount: 0,
      blockedCount: 0,
      automationErrorCount: 0,
      cancelledCount: 0,
      passPercentage: 100,
      retryCount: 0,
      passedAfterRetryCount: 0,
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
      resolvedOrClosed: 0,
      verifiedFixed: 0,
      reverificationPending: 0,
      reverificationFailed: 0,
    },
    reverificationSummary: {
      totalReverifications: 0,
      verifiedFixedCount: 0,
      stillFailingCount: 0,
      differentFailureCount: 0,
      blockedCount: 0,
      inconclusiveCount: 0,
    },
    regressionSummary: {
      totalRetestPlans: 1,
      totalRegressionTests: 5,
      passedRegressionTests: 5,
      failedRegressionTests: 0,
      untestedRegressionTests: 0,
      allMandatoryRegressionsPassed: true,
    },
    flakinessSummary: {
      flakyTestsDetected: 0,
      flakyExecutionAttempts: 0,
      flakinessRate: 0,
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
    traceabilityMatrix: [],
    evidenceReferences: [],
    snapshotTime: new Date('2026-09-12T02:00:00Z'),
  };

  const createMockStorage = () => {
    const reports: PrismaFinalQaReport[] = [];
    const auditEvents: Array<Record<string, unknown>> = [];

    const mockPrisma = {
      project: {
        findUnique: async (args: { where: { id: string } }) => {
          if (args.where.id === projectId) {
            return { id: projectId, name: 'Main Project' };
          }
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
        findFirst: async (args: { where: { projectId: string } }) => {
          return reports.find(r => r.projectId === args.where.projectId) ?? null;
        },
        create: async (args: { data: Record<string, unknown> }) => {
          const newReport = {
            id: `rep-${reports.length + 1}`,
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
        count: async () => 0,
      },
      qaReportAuditEvent: {
        create: async (args: { data: Record<string, unknown> }) => {
          auditEvents.push(args.data);
          return { id: `event-${auditEvents.length}`, ...args.data };
        },
      },
      testCaseExecution: {
        count: async () => 0,
      },
      structuredBugReport: {
        count: async () => 0,
      },
      $transaction: async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> => {
        return cb(mockPrisma);
      },
    } as unknown as PrismaClient;

    const mockAssembler = {
      assembleSnapshot: async () => mockSnapshot,
    };

    return { mockPrisma, mockAssembler, reports, auditEvents };
  };

  it('generates a draft QA report and persists audit log', async () => {
    const { mockPrisma, mockAssembler, reports, auditEvents } = createMockStorage();
    const service = new FinalQaReportService({
      prisma: mockPrisma,
      assembler: mockAssembler,
    });

    const report = await service.generateReport({
      projectId,
      releaseIdentifier: 'v1.0.0',
    });

    assert.equal(report.releaseIdentifier, 'v1.0.0');
    assert.equal(report.reportVersion, 1);
    assert.equal(report.status, 'DRAFT');
    assert.equal(report.verdict, 'READY');
    assert.equal(report.readinessScore, 100);
    assert.equal(reports.length, 1);
    assert.equal(auditEvents.length, 1);
    assert.equal(auditEvents[0]!.action, 'REPORT_GENERATED');
  });

  it('enforces multi-version auto-incrementing and supersession on finalization', async () => {
    const { mockPrisma, mockAssembler, reports, auditEvents } = createMockStorage();
    const service = new FinalQaReportService({
      prisma: mockPrisma,
      assembler: mockAssembler,
    });

    // 1. Generate v1 (DRAFT)
    const v1Draft = await service.generateReport({
      projectId,
      releaseIdentifier: 'v1.0.0',
    });
    assert.equal(v1Draft.reportVersion, 1);

    // 2. Finalize v1
    const v1Final = await service.finalizeReport({
      projectId,
      reportId: v1Draft.id,
      actorId: 'qa-engineer',
    });
    assert.equal(v1Final.status, 'FINAL');
    assert.ok(v1Final.finalizedAt);

    // 3. Attempting to finalize v1 again throws QaReportAlreadyFinalError
    await assert.rejects(
      () =>
        service.finalizeReport({
          projectId,
          reportId: v1Draft.id,
        }),
      QaReportAlreadyFinalError,
    );

    // 4. Generate next report for the same releaseIdentifier auto-increments to v2
    const v2Draft = await service.generateReport({
      projectId,
      releaseIdentifier: 'v1.0.0',
    });
    assert.equal(v2Draft.reportVersion, 2);
    assert.equal(v2Draft.status, 'DRAFT');

    // 5. Finalize v2 -> supersedes v1!
    const v2Final = await service.finalizeReport({
      projectId,
      reportId: v2Draft.id,
    });
    assert.equal(v2Final.status, 'FINAL');

    // Verify v1 is now SUPERSEDED
    const v1Updated = reports.find(r => r.id === v1Draft.id);
    assert.equal(v1Updated?.status, 'SUPERSEDED');

    // Verify audit events recorded
    const supersededEvent = auditEvents.find(e => e.action === 'REPORT_SUPERSEDED');
    assert.ok(supersededEvent);
  });

  it('rejects cross-tenant access with project mismatch error', async () => {
    const { mockPrisma, mockAssembler } = createMockStorage();
    const service = new FinalQaReportService({
      prisma: mockPrisma,
      assembler: mockAssembler,
    });

    await assert.rejects(
      () =>
        service.generateReport({
          projectId: otherProjectId,
          releaseIdentifier: 'v1.0.0',
        }),
      QaReportProjectMismatchError,
    );
  });
});
