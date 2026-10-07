/**
 * @file apps/desktop/src/main/ipc/qa-report-handlers.test.ts
 * IPC handler tests for Final QA Report & Release Readiness Intelligence (V7 Phase 109).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleGenerateQaReport,
  handleGetQaReport,
  handleListQaReports,
  handleFinalizeQaReport,
  handleExportQaReport,
  handleEvaluateReleasePolicy,
  handleCheckQaReportStaleness,
  setFinalQaReportService,
} from './qa-report-handlers.js';
import { QaReportProjectMismatchError, type FinalQaReportService } from '@ai-quality/core';
import type {
  FinalQaReportDto,
  ExportQaReportResultDto,
  ReleasePolicyEvaluationResultDto,
  QaReportStalenessResultDto,
} from '@ai-quality/contracts';

describe('QA Report IPC Handlers (Phase 109)', () => {
  const fakeTrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    } as any,
  } as IpcMainInvokeEvent;

  const fakeUntrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: {} as any,
      url: 'https://malicious.origin/attack.html',
    } as any,
  } as IpcMainInvokeEvent;

  const validProjectId = '11111111-1111-1111-1111-111111111111';
  const validReportId = '22222222-2222-2222-2222-222222222222';

  const mockReportDto: FinalQaReportDto = {
    id: validReportId,
    projectId: validProjectId,
    environmentId: null,
    reportKey: 'REP-109-01',
    releaseIdentifier: 'v1.0.0',
    buildIdentifier: 'b101',
    commitSha: null,
    branch: 'main',
    environmentName: null,
    reportVersion: 1,
    status: 'DRAFT',
    verdict: 'READY',
    policyVersion: '1.0.0',
    policyRulesEvaluated: [],
    policyRulesPassed: [],
    policyRulesFailed: [],
    blockingRules: [],
    warningRules: [],
    readinessScore: 100,
    readinessExplanation: 'All checks passed',
    executiveSummary: 'Ready for release',
    overallRecommendation: 'Proceed',
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
      totalDistinctTests: 10,
      totalExecutionAttempts: 10,
      passedCount: 10,
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
      totalRetestPlans: 0,
      totalRegressionTests: 0,
      passedRegressionTests: 0,
      failedRegressionTests: 0,
      untestedRegressionTests: 0,
      allMandatoryRegressionsPassed: true,
    },
    flakinessSummary: {
      flakyTestsDetected: 0,
      flakyExecutionAttempts: 0,
      flakinessRate: 0,
    },
    automationHealth: { status: 'HEALTHY', issues: [], details: {} },
    environmentHealth: { status: 'HEALTHY', issues: [], details: {} },
    testDataHealth: { status: 'HEALTHY', issues: [], details: {} },
    securityFindings: [],
    releaseBlockers: [],
    residualRisks: [],
    knownLimitations: [],
    traceabilityMatrix: [],
    evidenceReferences: [],
    sourceSnapshotTime: new Date().toISOString(),
    finalizedAt: null,
    generatedByActorId: 'SYSTEM',
    isStale: false,
    staleReason: null,
    checksumSha256: 'sha256-mock',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockService = {
    generateReport: async () => mockReportDto,
    getReport: async () => mockReportDto,
    listReports: async () => [mockReportDto],
    finalizeReport: async () => ({ ...mockReportDto, status: 'FINAL' }),
    exportReport: async (): Promise<ExportQaReportResultDto> => ({
      fileName: 'qa-report.json',
      contentType: 'application/json',
      content: '{}',
      checksumSha256: 'mock-sha',
      exportedAt: new Date().toISOString(),
      reportKey: 'REP-109-01',
      releaseIdentifier: 'v1.0.0',
      reportVersion: 1,
    }),
    evaluatePolicy: async (): Promise<ReleasePolicyEvaluationResultDto> => ({
      policyVersion: '1.0.0',
      verdict: 'READY',
      readinessScore: 100,
      passedRules: [],
      failedRules: [],
      blockingRules: [],
      warningRules: [],
      explanation: 'Ready',
      recommendations: [],
      evaluatedAt: new Date().toISOString(),
    }),
    checkStaleness: async (): Promise<QaReportStalenessResultDto> => ({
      reportId: validReportId,
      isStale: false,
      staleReason: null,
      lastSnapshotTime: new Date().toISOString(),
      checkedAt: new Date().toISOString(),
    }),
  } as unknown as FinalQaReportService;

  beforeEach(() => {
    setFinalQaReportService(mockService);
  });

  it('rejects invocations from untrusted IPC senders', async () => {
    const res = await handleGenerateQaReport(fakeUntrustedEvent, {
      projectId: validProjectId,
      releaseIdentifier: 'v1.0.0',
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('handles report generation successfully for trusted sender', async () => {
    const res = await handleGenerateQaReport(fakeTrustedEvent, {
      projectId: validProjectId,
      releaseIdentifier: 'v1.0.0',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.releaseIdentifier, 'v1.0.0');
    }
  });

  it('handles report finalization', async () => {
    const res = await handleFinalizeQaReport(fakeTrustedEvent, {
      projectId: validProjectId,
      reportId: validReportId,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.status, 'FINAL');
    }
  });

  it('handles report export', async () => {
    const res = await handleExportQaReport(fakeTrustedEvent, {
      projectId: validProjectId,
      reportId: validReportId,
      format: 'JSON',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.fileName, 'qa-report.json');
    }
  });

  it('handles validation error when input schema fails', async () => {
    const res = await handleGenerateQaReport(fakeTrustedEvent, {
      projectId: 'not-a-uuid',
      releaseIdentifier: 'v1.0.0',
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'QA_REPORT_VALIDATION_ERROR');
    }
  });

  it('sanitizes domain errors across IPC boundary', async () => {
    const throwingService = {
      ...mockService,
      generateReport: async () => {
        throw new QaReportProjectMismatchError('Cross-tenant project mismatch');
      },
    } as unknown as FinalQaReportService;

    setFinalQaReportService(throwingService);

    const res = await handleGenerateQaReport(fakeTrustedEvent, {
      projectId: validProjectId,
      releaseIdentifier: 'v1.0.0',
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'QA_REPORT_PROJECT_MISMATCH');
      assert.equal(res.error.message, 'Cross-tenant project mismatch');
    }
  });
});
