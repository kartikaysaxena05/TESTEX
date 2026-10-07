/**
 * @file packages/core/src/failures/bug-report/bug-report-concurrency.test.ts
 * Concurrency and mutex serialization test suite for Structured Bug Reports (V6 Phase 87).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { StructuredBugReportService } from './structured-bug-report-service.js';

test('Structured Bug Report Concurrency Test Suite', async t => {
  await t.test('serializes concurrent create requests and prevents race conditions', async () => {
    let callCount = 0;
    let runningCalls = 0;
    let maxConcurrent = 0;

    const mockReport = {
      id: 'rep-001',
      projectId: '11111111-1111-1111-1111-111111111111',
      failureCaseId: '22222222-2222-2222-2222-222222222222',
      failureAnalysisRunId: null,
      reportNumber: 'BUG-000001',
      revision: 1,
      isAuthoritative: true,
      status: 'READY' as const,
      applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT' as const,
      isApplicationDefect: true,
      title: 'Test Defect',
      summary: 'Summary',
      requirementId: null,
      requirementKey: null,
      requirementVersionNumber: null,
      testCaseId: 'tc-1',
      testCaseKey: 'TC-1',
      testCaseVersionNumber: 1,
      testCaseTitle: 'TC 1',
      testCaseType: null,
      originalExecutionId: 'exec-1',
      triggeringStatus: 'FAILED',
      failedStepIndex: 1,
      failedStepAction: null,
      preconditionsJson: [],
      reproductionStepsJson: [],
      expectedResult: 'Expected',
      actualResult: 'Actual',
      classificationCategory: null,
      classificationSubcategory: null,
      reproducibilityState: null,
      reproductionAttempts: 0,
      reproductionSuccessCount: 0,
      reproducibilityRatio: null,
      probableLayer: null,
      probableComponent: null,
      rootCauseSummary: null,
      isRootCauseHypothesis: true,
      severity: null,
      priority: null,
      impactSummary: null,
      duplicateClusterId: null,
      duplicateClusterKey: null,
      relatedFailureCount: 0,
      overallConfidence: null,
      confidenceBand: null,
      environmentJson: {},
      evidenceReferencesJson: [],
      knownLimitationsJson: [],
      unknownsJson: [],
      markdownReport: '# BUG-000001',
      reportFingerprint: 'f'.repeat(64),
      reportVersion: '1.0.0',
      generatorVersion: '1.0.0',
      regenerationReason: null,
      supersedesId: null,
      supersededById: null,
      generatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockPrisma = {
      failureCase: {
        findUnique: async () => ({
          id: '22222222-2222-2222-2222-222222222222',
          projectId: '11111111-1111-1111-1111-111111111111',
        }),
      },
      structuredBugReport: {
        findFirst: async () => {
          runningCalls++;
          if (runningCalls > maxConcurrent) {
            maxConcurrent = runningCalls;
          }
          await new Promise(resolve => setTimeout(resolve, 30));
          runningCalls--;
          callCount++;
          return mockReport;
        },
      },
    } as any;

    const service = new StructuredBugReportService(mockPrisma);

    // Launch 5 concurrent calls for the same failure case
    const results = await Promise.all([
      service.createBugReport({
        projectId: '11111111-1111-1111-1111-111111111111',
        failureCaseId: '22222222-2222-2222-2222-222222222222',
      }),
      service.createBugReport({
        projectId: '11111111-1111-1111-1111-111111111111',
        failureCaseId: '22222222-2222-2222-2222-222222222222',
      }),
      service.createBugReport({
        projectId: '11111111-1111-1111-1111-111111111111',
        failureCaseId: '22222222-2222-2222-2222-222222222222',
      }),
      service.createBugReport({
        projectId: '11111111-1111-1111-1111-111111111111',
        failureCaseId: '22222222-2222-2222-2222-222222222222',
      }),
      service.createBugReport({
        projectId: '11111111-1111-1111-1111-111111111111',
        failureCaseId: '22222222-2222-2222-2222-222222222222',
      }),
    ]);

    assert.equal(results.length, 5);
    assert.equal(callCount, 5);
    // Mutex serialization ensures maxConcurrent is strictly 1
    assert.equal(maxConcurrent, 1);
  });
});
