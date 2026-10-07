/**
 * @file packages/core/src/qa-report/qa-report-contract.test.ts
 * Contract and schema tests for V7 Phase 109 Final QA Report & Release Readiness Intelligence.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  releaseReadinessVerdictSchema,
  qaReportStatusSchema,
  qaReportAuditActionSchema,
  qaReportRequirementSummaryDtoSchema,
  qaReportTestExecutionSummaryDtoSchema,
  qaReportFailureDomainSummaryDtoSchema,
  qaReportDefectSummaryDtoSchema,
  qaReportReverificationSummaryDtoSchema,
  qaReportRegressionSummaryDtoSchema,
  qaReportFlakinessSummaryDtoSchema,
  qaReportHealthSummaryDtoSchema,
  releaseBlockerItemSchema,
  residualRiskItemSchema,
  knownLimitationItemSchema,
  traceabilityMatrixItemSchema,
  evidenceReferenceItemSchema,
  finalQaReportDtoSchema,
  generateQaReportInputSchema,
  getQaReportInputSchema,
  listQaReportsInputSchema,
  finalizeQaReportInputSchema,
  exportQaReportInputSchema,
  evaluateReleasePolicyInputSchema,
  checkQaReportStalenessInputSchema,
} from '@ai-quality/contracts';
import {
  FinalQaReportError,
  QaReportNotFoundError,
  QaReportAlreadyFinalError,
  QaReportImmutabilityViolationError,
  QaReportProjectMismatchError,
  QaReportValidationError,
  QaReportExportFailedError,
  QaReportStaleDataError,
  QaReportConcurrentMutationError,
  QA_REPORT_BOUNDS,
  QA_REPORT_POLICY_VERSION,
  POLICY_RULE_CODES,
} from './index.js';

describe('V7 Phase 109 - Final QA Report Contract & Schemas', () => {
  const validUuid1 = '11111111-1111-1111-1111-111111111111';
  const validUuid2 = '22222222-2222-2222-2222-222222222222';

  it('validates release readiness verdict enum', () => {
    const validVerdicts = ['READY', 'READY_WITH_RISK', 'NOT_READY', 'BLOCKED', 'UNKNOWN'];
    for (const v of validVerdicts) {
      assert.equal(releaseReadinessVerdictSchema.parse(v), v);
    }
    assert.throws(() => releaseReadinessVerdictSchema.parse('APPROVED'));
    assert.throws(() => releaseReadinessVerdictSchema.parse('INVALID_VERDICT'));
  });

  it('validates report status enum', () => {
    const validStatuses = ['DRAFT', 'FINAL', 'SUPERSEDED'];
    for (const s of validStatuses) {
      assert.equal(qaReportStatusSchema.parse(s), s);
    }
    assert.throws(() => qaReportStatusSchema.parse('PUBLISHED'));
  });

  it('validates audit action enum', () => {
    const validActions = [
      'REPORT_GENERATED',
      'REPORT_FINALIZED',
      'REPORT_SUPERSEDED',
      'POLICY_EVALUATED',
      'EXPORT_GENERATED',
    ];
    for (const a of validActions) {
      assert.equal(qaReportAuditActionSchema.parse(a), a);
    }
    assert.throws(() => qaReportAuditActionSchema.parse('MODIFIED'));
  });

  it('validates requirement summary DTO schema', () => {
    const validSummary = {
      total: 10,
      testable: 8,
      covered: 8,
      verified: 7,
      uncovered: 0,
      failing: 1,
      blocked: 0,
      coveragePercentage: 100.0,
      verifiedPercentage: 87.5,
    };
    const parsed = qaReportRequirementSummaryDtoSchema.parse(validSummary);
    assert.equal(parsed.total, 10);
    assert.equal(parsed.coveragePercentage, 100.0);

    // Negative counts must fail
    assert.throws(() =>
      qaReportRequirementSummaryDtoSchema.parse({
        ...validSummary,
        failing: -1,
      }),
    );
  });

  it('validates test execution summary DTO schema', () => {
    const validExecSummary = {
      totalDistinctTests: 25,
      totalExecutionAttempts: 32,
      passedCount: 23,
      failedCount: 2,
      blockedCount: 0,
      automationErrorCount: 0,
      cancelledCount: 0,
      passPercentage: 92.0,
      retryCount: 7,
      passedAfterRetryCount: 3,
    };
    const parsed = qaReportTestExecutionSummaryDtoSchema.parse(validExecSummary);
    assert.equal(parsed.totalDistinctTests, 25);
    assert.equal(parsed.passPercentage, 92.0);

    assert.throws(() =>
      qaReportTestExecutionSummaryDtoSchema.parse({
        ...validExecSummary,
        passPercentage: 105, // > 100
      }),
    );
  });

  it('validates defect summary DTO schema', () => {
    const validDefects = {
      totalDefects: 5,
      openCritical: 0,
      openHigh: 1,
      openMedium: 2,
      openLow: 2,
      resolvedOrClosed: 3,
      verifiedFixed: 2,
      reverificationPending: 1,
      reverificationFailed: 0,
    };
    const parsed = qaReportDefectSummaryDtoSchema.parse(validDefects);
    assert.equal(parsed.totalDefects, 5);
    assert.equal(parsed.openCritical, 0);
  });

  it('validates release blocker item schema', () => {
    const blocker = {
      ruleCode: POLICY_RULE_CODES.BLOCK_CRITICAL_OPEN_DEFECT,
      title: 'Critical Open Defect',
      description: 'Defect BUG-001 is critical.',
      severity: 'CRITICAL',
    };
    const parsed = releaseBlockerItemSchema.parse(blocker);
    assert.equal(parsed.severity, 'CRITICAL');
  });

  it('validates generate report input schema', () => {
    const validInput = {
      projectId: validUuid1,
      releaseIdentifier: 'v2.1.0-rc1',
      buildIdentifier: 'b1234',
      commitSha: 'a'.repeat(40),
      branch: 'release/2.1',
    };
    const parsed = generateQaReportInputSchema.parse(validInput);
    assert.equal(parsed.releaseIdentifier, 'v2.1.0-rc1');
    assert.equal(parsed.actorId, 'SYSTEM'); // default value

    // Invalid projectId (not UUID)
    assert.throws(() =>
      generateQaReportInputSchema.parse({
        ...validInput,
        projectId: 'not-a-uuid',
      }),
    );

    // Empty releaseIdentifier
    assert.throws(() =>
      generateQaReportInputSchema.parse({
        ...validInput,
        releaseIdentifier: '',
      }),
    );
  });

  it('validates get report input schema', () => {
    const parsed = getQaReportInputSchema.parse({
      projectId: validUuid1,
      reportIdOrKey: 'REP-20260912-ABC',
      version: 2,
    });
    assert.equal(parsed.version, 2);

    assert.throws(() =>
      getQaReportInputSchema.parse({
        projectId: 'invalid',
        reportIdOrKey: 'REP-1',
      }),
    );
  });

  it('validates list reports input schema with defaults', () => {
    const parsed = listQaReportsInputSchema.parse({
      projectId: validUuid1,
    });
    assert.equal(parsed.limit, 20);
    assert.equal(parsed.offset, 0);
  });

  it('validates finalize report input schema', () => {
    const parsed = finalizeQaReportInputSchema.parse({
      projectId: validUuid1,
      reportId: validUuid2,
      actorId: 'qa-lead@example.com',
    });
    assert.equal(parsed.actorId, 'qa-lead@example.com');
  });

  it('validates export report input schema with defaults', () => {
    const parsed = exportQaReportInputSchema.parse({
      projectId: validUuid1,
      reportId: validUuid2,
    });
    assert.equal(parsed.format, 'JSON');
  });

  it('validates domain error hierarchy and error codes', () => {
    const errors: Array<{ err: FinalQaReportError; expectedCode: string }> = [
      { err: new QaReportNotFoundError('Not found'), expectedCode: 'QA_REPORT_NOT_FOUND' },
      { err: new QaReportAlreadyFinalError('Already final'), expectedCode: 'QA_REPORT_ALREADY_FINAL' },
      {
        err: new QaReportImmutabilityViolationError('Immutable'),
        expectedCode: 'QA_REPORT_IMMUTABILITY_VIOLATION',
      },
      { err: new QaReportProjectMismatchError('Mismatch'), expectedCode: 'QA_REPORT_PROJECT_MISMATCH' },
      { err: new QaReportValidationError('Invalid'), expectedCode: 'QA_REPORT_VALIDATION_ERROR' },
      { err: new QaReportExportFailedError('Export failed'), expectedCode: 'QA_REPORT_EXPORT_FAILED' },
      { err: new QaReportStaleDataError('Stale'), expectedCode: 'QA_REPORT_STALE_DATA' },
      {
        err: new QaReportConcurrentMutationError('Concurrent'),
        expectedCode: 'QA_REPORT_CONCURRENT_MUTATION',
      },
    ];

    for (const { err, expectedCode } of errors) {
      assert.ok(err instanceof FinalQaReportError);
      assert.ok(err instanceof Error);
      assert.equal(err.code, expectedCode);
    }
  });

  it('validates policy constants and bounds', () => {
    assert.equal(QA_REPORT_POLICY_VERSION, '1.0.0');
    assert.equal(QA_REPORT_BOUNDS.MAX_LIST_LIMIT, 100);
    assert.equal(QA_REPORT_BOUNDS.MAX_EXPORT_SIZE_BYTES, 25 * 1024 * 1024);
  });
});
