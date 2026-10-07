/**
 * @file packages/core/src/qa-report/qa-report-exporter.test.ts
 * Tests for structured JSON and executive Markdown report exporting with SHA-256 sealing.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { QaReportExporter } from './qa-report-exporter.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';
import type { FinalQaReportDto } from './qa-report-types.js';

describe('V7 Phase 109 - QA Report Exporter', () => {
  const exporter = new QaReportExporter();

  const mockReport: FinalQaReportDto = {
    id: '11111111-1111-1111-1111-111111111111',
    projectId: '22222222-2222-2222-2222-222222222222',
    environmentId: '33333333-3333-3333-3333-333333333333',
    reportKey: 'REP-20260912-TEST',
    releaseIdentifier: 'v2.0.0-rc1',
    buildIdentifier: 'build-456',
    commitSha: 'c0ffee1234567890c0ffee1234567890c0ffee12',
    branch: 'release/2.0',
    environmentName: 'Staging E2E',
    reportVersion: 1,
    status: 'FINAL',
    verdict: 'READY_WITH_RISK',
    policyVersion: '1.0.0',
    policyRulesEvaluated: ['REL_BLOCK_CRITICAL_OPEN_DEFECT', 'REL_WARN_MEDIUM_DEFECT'],
    policyRulesPassed: ['REL_BLOCK_CRITICAL_OPEN_DEFECT'],
    policyRulesFailed: ['REL_WARN_MEDIUM_DEFECT'],
    blockingRules: [],
    warningRules: [
      {
        riskCode: 'REL_WARN_MEDIUM_DEFECT',
        title: 'Open Medium Defect',
        description: '1 medium defect open',
        severity: 'MEDIUM',
        mitigation: 'Deferred to next sprint',
      },
    ],
    readinessScore: 88.5,
    readinessExplanation: 'Release criteria conditionally met with 1 residual risk warning(s).',
    executiveSummary: 'Authoritative evaluation for v2.0.0-rc1.',
    overallRecommendation: 'Review open medium defect.',
    requirementSummary: {
      total: 10,
      testable: 10,
      covered: 9,
      verified: 9,
      uncovered: 1,
      failing: 0,
      blocked: 0,
      coveragePercentage: 90.0,
      verifiedPercentage: 90.0,
    },
    testExecutionSummary: {
      totalDistinctTests: 40,
      totalExecutionAttempts: 45,
      passedCount: 38,
      failedCount: 2,
      blockedCount: 0,
      automationErrorCount: 0,
      cancelledCount: 0,
      passPercentage: 95.0,
      retryCount: 5,
      passedAfterRetryCount: 3,
    },
    failureDomainSummary: {
      totalFailures: 2,
      applicationDefects: 1,
      automationFailures: 1,
      testDataFailures: 0,
      environmentFailures: 0,
      blockedFailures: 0,
      inconclusiveFailures: 0,
      unknownFailures: 0,
    },
    defectSummary: {
      totalDefects: 1,
      openCritical: 0,
      openHigh: 0,
      openMedium: 1,
      openLow: 0,
      resolvedOrClosed: 0,
      verifiedFixed: 0,
      reverificationPending: 0,
      reverificationFailed: 0,
    },
    reverificationSummary: {
      totalReverifications: 2,
      verifiedFixedCount: 2,
      stillFailingCount: 0,
      differentFailureCount: 0,
      blockedCount: 0,
      inconclusiveCount: 0,
    },
    regressionSummary: {
      totalRetestPlans: 1,
      totalRegressionTests: 10,
      passedRegressionTests: 10,
      failedRegressionTests: 0,
      untestedRegressionTests: 0,
      allMandatoryRegressionsPassed: true,
    },
    flakinessSummary: {
      flakyTestsDetected: 2,
      flakyExecutionAttempts: 3,
      flakinessRate: 6.7,
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
    residualRisks: [
      {
        riskCode: 'REL_WARN_MEDIUM_DEFECT',
        title: 'Open Medium Defect',
        description: '1 medium defect open',
        severity: 'MEDIUM',
        mitigation: 'Deferred to next sprint',
      },
    ],
    knownLimitations: [],
    traceabilityMatrix: [
      {
        requirementId: 'req-1',
        requirementKey: 'REQ-101',
        title: 'Authentication flow',
        priority: 'P0',
        status: 'ACTIVE',
        associatedTestCount: 2,
        verified: true,
        failingTests: [],
      },
    ],
    evidenceReferences: [],
    sourceSnapshotTime: '2026-09-12T04:00:00.000Z',
    finalizedAt: '2026-09-12T04:30:00.000Z',
    generatedByActorId: 'SYSTEM',
    isStale: false,
    staleReason: null,
    checksumSha256: 'initial_hash',
    createdAt: '2026-09-12T04:00:00.000Z',
    updatedAt: '2026-09-12T04:30:00.000Z',
  };

  it('exports report in JSON format with valid checksum seal', async () => {
    const result = await exporter.exportReport({
      report: mockReport,
      format: 'JSON',
    });

    assert.equal(result.contentType, 'application/json');
    assert.ok(result.fileName.endsWith('.json'));
    assert.ok(result.fileName.includes('v2.0.0-rc1'));
    assert.ok(result.content.includes('"reportKey": "REP-20260912-TEST"'));

    // Validate SHA-256 seal
    const expectedHash = crypto
      .createHash('sha256')
      .update(result.content, 'utf8')
      .digest('hex');
    assert.equal(result.checksumSha256, expectedHash);
  });

  it('exports report in Markdown format with executive callouts and tables', async () => {
    const result = await exporter.exportReport({
      report: mockReport,
      format: 'MARKDOWN',
    });

    assert.equal(result.contentType, 'text/markdown');
    assert.ok(result.fileName.endsWith('.md'));
    assert.ok(result.content.includes('# Final QA & Release Readiness Intelligence Report'));
    assert.ok(result.content.includes('VERDICT: READY WITH RESIDUAL RISK'));
    assert.ok(result.content.includes('88.5/100'));
    assert.ok(result.content.includes('REQ-101'));
    assert.ok(result.content.includes('Report Checksum (SHA-256):'));

    // Checksum matches exported markdown content
    const expectedHash = crypto
      .createHash('sha256')
      .update(result.content, 'utf8')
      .digest('hex');
    assert.equal(result.checksumSha256, expectedHash);
  });

  it('redacts sensitive secrets from export payloads', async () => {
    SecretRedactor.registerSecret('SUPER_SECRET_TOKEN_XYZ_999');

    const reportWithSecret: FinalQaReportDto = {
      ...mockReport,
      executiveSummary: 'Evaluated with secret auth token SUPER_SECRET_TOKEN_XYZ_999 in trace.',
    };

    const result = await exporter.exportReport({
      report: reportWithSecret,
      format: 'MARKDOWN',
    });

    assert.ok(!result.content.includes('SUPER_SECRET_TOKEN_XYZ_999'));
    assert.ok(result.content.includes('***'));

    SecretRedactor.clearRegisteredSecrets();
  });
});
