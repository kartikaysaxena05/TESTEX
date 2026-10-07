/**
 * @file packages/core/src/qa-report/qa-report-snapshot-assembler.test.ts
 * Tests for cross-phase domain snapshot assembly and logical vs execution attempt separation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { QaReportSnapshotAssembler } from './qa-report-snapshot-assembler.js';

describe('V7 Phase 109 - QA Report Snapshot Assembler', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';

  it('correctly separates logical distinct tests from retry execution attempts', async () => {
    // 2 logical test cases: TC-1 (attempt 1 fail, attempt 2 pass), TC-2 (attempt 1 pass)
    // totalDistinctTests = 2, passedCount = 2, totalExecutionAttempts = 3, retryCount = 1, passedAfterRetry = 1
    const mockPrisma = {
      requirement: {
        findMany: async () => [],
      },
      requirementTestTrace: {
        findMany: async () => [],
      },
      testCaseExecution: {
        findMany: async () => [
          {
            id: 'exec-2',
            projectId,
            testRunId: 'run-1',
            testCaseId: 'tc-1',
            attempt: 2,
            status: 'PASSED',
            passedAfterRetry: true,
            createdAt: new Date('2026-09-12T01:05:00Z'),
          },
          {
            id: 'exec-1',
            projectId,
            testRunId: 'run-1',
            testCaseId: 'tc-1',
            attempt: 1,
            status: 'FAILED',
            passedAfterRetry: false,
            createdAt: new Date('2026-09-12T01:00:00Z'),
          },
          {
            id: 'exec-3',
            projectId,
            testRunId: 'run-1',
            testCaseId: 'tc-2',
            attempt: 1,
            status: 'PASSED',
            passedAfterRetry: false,
            createdAt: new Date('2026-09-12T01:00:00Z'),
          },
        ],
      },
      testCase: {
        findMany: async () => [
          { id: 'tc-1', title: 'Login Test' },
          { id: 'tc-2', title: 'Checkout Test' },
        ],
      },
      failureDomainSeparation: {
        findMany: async () => [],
      },
      structuredBugReport: {
        findMany: async () => [],
      },
      bugWorkflowState: {
        findMany: async () => [],
      },
      defectReverification: {
        findMany: async () => [],
      },
      retestPlan: {
        findMany: async () => [],
      },
    } as unknown as PrismaClient;

    const assembler = new QaReportSnapshotAssembler({ prisma: mockPrisma });
    const snapshot = await assembler.assembleSnapshot({ projectId });

    // Distinct Logical Tests vs Attempt counts
    assert.equal(snapshot.testExecutionSummary.totalDistinctTests, 2);
    assert.equal(snapshot.testExecutionSummary.passedCount, 2);
    assert.equal(snapshot.testExecutionSummary.totalExecutionAttempts, 3);
    assert.equal(snapshot.testExecutionSummary.retryCount, 1);
    assert.equal(snapshot.testExecutionSummary.passedAfterRetryCount, 1);
    assert.equal(snapshot.testExecutionSummary.passPercentage, 100);

    // Flakiness Metrics
    assert.equal(snapshot.flakinessSummary.flakyTestsDetected, 1);
    assert.equal(snapshot.flakinessSummary.flakyExecutionAttempts, 1);
    assert.ok(snapshot.flakinessSummary.flakinessRate > 0);
  });

  it('correctly maps requirement coverage and verification matrix', async () => {
    const mockPrisma = {
      requirement: {
        findMany: async () => [
          {
            id: 'req-1',
            projectId,
            requirementKey: 'REQ-001',
            title: 'User Authentication',
            priority: 'P0',
            status: 'ACTIVE',
          },
          {
            id: 'req-2',
            projectId,
            requirementKey: 'REQ-002',
            title: 'Password Reset',
            priority: 'P1',
            status: 'ACTIVE',
          },
          {
            id: 'req-3',
            projectId,
            requirementKey: 'REQ-003',
            title: 'Legacy Feature',
            priority: 'P3',
            status: 'ARCHIVED',
          },
        ],
      },
      requirementTestTrace: {
        findMany: async () => [
          {
            id: 'trace-1',
            requirementId: 'req-1',
            testCaseId: 'tc-1',
            requirement: { id: 'req-1', projectId },
            testCase: { id: 'tc-1', title: 'Login Test' },
          },
        ],
      },
      testCaseExecution: {
        findMany: async () => [
          {
            id: 'exec-1',
            projectId,
            testRunId: 'run-1',
            testCaseId: 'tc-1',
            attempt: 1,
            status: 'PASSED',
            passedAfterRetry: false,
            createdAt: new Date(),
          },
        ],
      },
      testCase: {
        findMany: async () => [{ id: 'tc-1', title: 'Login Test' }],
      },
      failureDomainSeparation: {
        findMany: async () => [],
      },
      structuredBugReport: {
        findMany: async () => [],
      },
      bugWorkflowState: {
        findMany: async () => [],
      },
      defectReverification: {
        findMany: async () => [],
      },
      retestPlan: {
        findMany: async () => [],
      },
    } as unknown as PrismaClient;

    const assembler = new QaReportSnapshotAssembler({ prisma: mockPrisma });
    const snapshot = await assembler.assembleSnapshot({ projectId });

    // REQ-001 is covered & verified. REQ-002 is uncovered. REQ-003 is archived (not testable).
    assert.equal(snapshot.requirementSummary.total, 3);
    assert.equal(snapshot.requirementSummary.testable, 2);
    assert.equal(snapshot.requirementSummary.covered, 1);
    assert.equal(snapshot.requirementSummary.verified, 1);
    assert.equal(snapshot.requirementSummary.uncovered, 1);
    assert.equal(snapshot.requirementSummary.coveragePercentage, 50.0);
    assert.equal(snapshot.requirementSummary.verifiedPercentage, 50.0);

    assert.equal(snapshot.traceabilityMatrix.length, 3);
    const req1 = snapshot.traceabilityMatrix.find(r => r.requirementKey === 'REQ-001');
    assert.equal(req1?.verified, true);
    const req2 = snapshot.traceabilityMatrix.find(r => r.requirementKey === 'REQ-002');
    assert.equal(req2?.verified, false);
  });
});
