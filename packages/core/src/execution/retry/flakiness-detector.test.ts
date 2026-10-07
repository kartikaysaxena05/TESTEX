/**
 * @file packages/core/src/execution/retry/flakiness-detector.test.ts
 * Unit tests for FlakinessDetector outcome comparison and reliability status determination.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FlakinessDetector } from './flakiness-detector.js';
import type { TestCaseExecutionDto, TestRunDto } from '@ai-quality/contracts';

describe('FlakinessDetector', () => {
  const detector = new FlakinessDetector();

  const baseRun: TestRunDto = {
    id: '00000000-0000-0000-0000-000000000001',
    projectId: '00000000-0000-0000-0000-000000000002',
    testCaseId: '00000000-0000-0000-0000-000000000003',
    testCaseVersionNumber: 1,
    executableTestPlanId: '00000000-0000-0000-0000-000000000004',
    status: 'PASSED',
    queuedAt: new Date().toISOString(),
    planFingerprint: 'plan-fp',
    testCaseTitle: 'Flakiness Test',
    browserEngine: 'chromium',
    headless: true,
    timeoutMs: 30000,
    totalAttempts: 1,
    passedAfterRetry: false,
    reliabilityStatus: 'NOT_EVALUATED',
    healingUsed: false,
    healingCount: 0,
    diagnosticsJson: [],
    metadataJson: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  function createAttempt(
    attempt: number,
    status: 'PASSED' | 'FAILED' | 'AUTOMATION_ERROR',
    errorMessage?: string,
    errorCode?: string,
  ): TestCaseExecutionDto {
    return {
      id: `00000000-0000-0000-0000-00000000000${attempt}`,
      projectId: baseRun.projectId,
      testRunId: baseRun.id,
      testCaseId: baseRun.testCaseId,
      testCaseVersionNumber: 1,
      executableTestPlanId: baseRun.executableTestPlanId,
      attempt,
      status,
      passedAfterRetry: false,
      reliabilityStatus: 'NOT_EVALUATED',
      retryReason: null,
      retryEligibilityJson: {},
      healingUsed: false,
      healingCount: 0,
      errorMessage: errorMessage ?? null,
      errorCode: errorCode ?? null,
      browserEngine: 'chromium',
      environmentSnapshotJson: {},
      metadataJson: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  it('classifies single passing attempt as STABLE without flakiness flag', () => {
    const attempts = [createAttempt(1, 'PASSED')];
    const report = detector.evaluateReliability({
      projectId: baseRun.projectId,
      testRunId: baseRun.id,
      testRun: baseRun,
      attempts,
    });

    assert.equal(report.totalAttempts, 1);
    assert.equal(report.passedAfterRetry, false);
    assert.equal(report.reliabilityStatus, 'STABLE');
    assert.equal(report.isFlakyCandidate, false);
    assert.equal(report.attempts.length, 1);
  });

  it('classifies consistent multiple failures as STABLE failure without flakiness flag', () => {
    const attempts = [
      createAttempt(1, 'FAILED', 'Element not found'),
      createAttempt(2, 'FAILED', 'Element not found'),
    ];
    const report = detector.evaluateReliability({
      projectId: baseRun.projectId,
      testRunId: baseRun.id,
      testRun: { ...baseRun, status: 'FAILED' },
      attempts,
    });

    assert.equal(report.totalAttempts, 2);
    assert.equal(report.passedAfterRetry, false);
    assert.equal(report.reliabilityStatus, 'STABLE');
    assert.equal(report.isFlakyCandidate, false);
  });

  it('classifies Attempt 1 Browser Crash -> Attempt 2 Pass as RECOVERED_RUNTIME (infra interruption, not test flakiness)', () => {
    const attempts = [
      createAttempt(
        1,
        'FAILED',
        'Target page, context or browser has been closed',
        'BROWSER_CRASH',
      ),
      createAttempt(2, 'PASSED'),
    ];
    const report = detector.evaluateReliability({
      projectId: baseRun.projectId,
      testRunId: baseRun.id,
      testRun: { ...baseRun, status: 'PASSED' },
      attempts,
    });

    assert.equal(report.totalAttempts, 2);
    assert.equal(report.passedAfterRetry, true);
    assert.equal(report.reliabilityStatus, 'RECOVERED_RUNTIME');
    assert.equal(report.isFlakyCandidate, false);
  });

  it('classifies Attempt 1 Assertion/Timing Failure -> Attempt 2 Pass as FLAKY_CANDIDATE', () => {
    const attempts = [
      createAttempt(1, 'FAILED', 'Assertion failed: expected 5 items, found 4', 'ASSERTION_FAILED'),
      createAttempt(2, 'PASSED'),
    ];
    const report = detector.evaluateReliability({
      projectId: baseRun.projectId,
      testRunId: baseRun.id,
      testRun: { ...baseRun, status: 'PASSED' },
      attempts,
    });

    assert.equal(report.totalAttempts, 2);
    assert.equal(report.passedAfterRetry, true);
    assert.equal(report.reliabilityStatus, 'FLAKY_CANDIDATE');
    assert.equal(report.isFlakyCandidate, true);
  });

  it('classifies alternating results (Attempt 1 FAIL, Attempt 2 PASS, Attempt 3 FAIL) as FLAKY_CANDIDATE', () => {
    const attempts = [
      createAttempt(1, 'FAILED', 'Timeout waiting for table row'),
      createAttempt(2, 'PASSED'),
      createAttempt(3, 'FAILED', 'Timeout waiting for table row'),
    ];
    const report = detector.evaluateReliability({
      projectId: baseRun.projectId,
      testRunId: baseRun.id,
      testRun: { ...baseRun, status: 'FAILED' },
      attempts,
    });

    assert.equal(report.totalAttempts, 3);
    assert.equal(report.reliabilityStatus, 'FLAKY_CANDIDATE');
    assert.equal(report.isFlakyCandidate, true);
  });
});
