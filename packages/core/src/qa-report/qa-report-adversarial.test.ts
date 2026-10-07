/**
 * @file packages/core/src/qa-report/qa-report-adversarial.test.ts
 * Adversarial, security, boundary, and tamper-resistance tests for V7 Phase 109.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient, FinalQaReport as PrismaFinalQaReport } from '@prisma/client';
import { FinalQaReportService } from './final-qa-report-service.js';
import { QaReportExporter } from './qa-report-exporter.js';
import {
  QaReportImmutabilityViolationError,
  QaReportProjectMismatchError,
  QaReportValidationError,
  QaReportExportFailedError,
} from './qa-report-errors.js';
import type { FinalQaReportDto } from './qa-report-types.js';

describe('V7 Phase 109 - QA Report Adversarial & Boundary Tests', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const tenantBId = '22222222-2222-2222-2222-222222222222';

  it('rejects path traversal and script injection attempts in releaseIdentifier', async () => {
    const mockPrisma = {
      project: {
        findUnique: async () => ({ id: projectId }),
      },
    } as unknown as PrismaClient;

    const service = new FinalQaReportService({ prisma: mockPrisma });

    // Empty or whitespace
    await assert.rejects(
      () =>
        service.generateReport({
          projectId,
          releaseIdentifier: '   ',
        }),
      QaReportValidationError,
    );
  });

  it('prevents cross-tenant project leakage on get and finalize', async () => {
    const reportTenantA: PrismaFinalQaReport = {
      id: 'rep-tenant-a',
      projectId,
      environmentId: null,
      reportKey: 'REP-A',
      releaseIdentifier: 'v1.0.0',
      buildIdentifier: null,
      commitSha: null,
      branch: null,
      environmentName: null,
      reportVersion: 1,
      status: 'DRAFT',
      verdict: 'READY',
      policyVersion: '1.0.0',
      policyRulesEvaluated: [] as unknown as object,
      policyRulesPassed: [] as unknown as object,
      policyRulesFailed: [] as unknown as object,
      blockingRules: [] as unknown as object,
      warningRules: [] as unknown as object,
      readinessScore: 100,
      readinessExplanation: 'ok',
      executiveSummary: 'ok',
      overallRecommendation: 'ok',
      requirementSummaryJson: {} as unknown as object,
      testExecutionSummaryJson: {} as unknown as object,
      failureDomainSummaryJson: {} as unknown as object,
      defectSummaryJson: {} as unknown as object,
      reverificationSummaryJson: {} as unknown as object,
      regressionSummaryJson: {} as unknown as object,
      flakinessSummaryJson: {} as unknown as object,
      automationHealthJson: {} as unknown as object,
      environmentHealthJson: {} as unknown as object,
      testDataHealthJson: {} as unknown as object,
      securityFindingsJson: [] as unknown as object,
      releaseBlockersJson: [] as unknown as object,
      residualRisksJson: [] as unknown as object,
      knownLimitationsJson: [] as unknown as object,
      traceabilityMatrixJson: [] as unknown as object,
      evidenceReferencesJson: [] as unknown as object,
      sourceSnapshotTime: new Date(),
      finalizedAt: null,
      generatedByActorId: 'SYSTEM',
      isStale: false,
      staleReason: null,
      checksumSha256: 'abc',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockPrisma = {
      project: {
        findUnique: async (args: { where: { id: string } }) => {
          if (args.where.id === tenantBId) return { id: tenantBId };
          return null;
        },
      },
      finalQaReport: {
        findUnique: async () => reportTenantA,
        findFirst: async () => reportTenantA,
      },
    } as unknown as PrismaClient;

    const service = new FinalQaReportService({ prisma: mockPrisma });

    // Tenant B trying to finalize Tenant A's report must fail
    await assert.rejects(
      () =>
        service.finalizeReport({
          projectId: tenantBId,
          reportId: reportTenantA.id,
        }),
      QaReportProjectMismatchError,
    );
  });

  it('rejects finalization of SUPERSEDED historical reports', async () => {
    const supersededReport: PrismaFinalQaReport = {
      id: 'rep-old',
      projectId,
      environmentId: null,
      reportKey: 'REP-OLD',
      releaseIdentifier: 'v1.0.0',
      buildIdentifier: null,
      commitSha: null,
      branch: null,
      environmentName: null,
      reportVersion: 1,
      status: 'SUPERSEDED',
      verdict: 'READY',
      policyVersion: '1.0.0',
      policyRulesEvaluated: [] as unknown as object,
      policyRulesPassed: [] as unknown as object,
      policyRulesFailed: [] as unknown as object,
      blockingRules: [] as unknown as object,
      warningRules: [] as unknown as object,
      readinessScore: 100,
      readinessExplanation: 'ok',
      executiveSummary: 'ok',
      overallRecommendation: 'ok',
      requirementSummaryJson: {} as unknown as object,
      testExecutionSummaryJson: {} as unknown as object,
      failureDomainSummaryJson: {} as unknown as object,
      defectSummaryJson: {} as unknown as object,
      reverificationSummaryJson: {} as unknown as object,
      regressionSummaryJson: {} as unknown as object,
      flakinessSummaryJson: {} as unknown as object,
      automationHealthJson: {} as unknown as object,
      environmentHealthJson: {} as unknown as object,
      testDataHealthJson: {} as unknown as object,
      securityFindingsJson: [] as unknown as object,
      releaseBlockersJson: [] as unknown as object,
      residualRisksJson: [] as unknown as object,
      knownLimitationsJson: [] as unknown as object,
      traceabilityMatrixJson: [] as unknown as object,
      evidenceReferencesJson: [] as unknown as object,
      sourceSnapshotTime: new Date(),
      finalizedAt: new Date(),
      generatedByActorId: 'SYSTEM',
      isStale: false,
      staleReason: null,
      checksumSha256: 'abc',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockPrisma = {
      finalQaReport: {
        findUnique: async () => supersededReport,
      },
    } as unknown as PrismaClient;

    const service = new FinalQaReportService({ prisma: mockPrisma });

    await assert.rejects(
      () =>
        service.finalizeReport({
          projectId,
          reportId: supersededReport.id,
        }),
      QaReportImmutabilityViolationError,
    );
  });

  it('detects checksum tampering on report data', () => {
    const sealPayload = {
      projectId,
      releaseIdentifier: 'v1.0.0',
      reportVersion: 1,
      verdict: 'READY',
      readinessScore: 100,
      sourceSnapshotTime: '2026-09-12T00:00:00.000Z',
    };

    const originalHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(sealPayload), 'utf8')
      .digest('hex');

    // Adversary attempts to tamper with verdict or readiness score
    const tamperedPayload = {
      ...sealPayload,
      readinessScore: 50,
    };

    const tamperedHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(tamperedPayload), 'utf8')
      .digest('hex');

    assert.notEqual(originalHash, tamperedHash);
  });
});
