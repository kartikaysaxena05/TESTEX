/**
 * @file packages/core/src/failures/bug-report/bug-report-adversarial.test.ts
 * Adversarial edge cases and robustness tests for Structured Bug Reports (V6 Phase 87).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { BugReportGenerator } from './bug-report-generator.js';
import { StructuredBugReportService } from './structured-bug-report-service.js';
import { BugReportInvalidOperationError, BugReportNotFoundError } from './bug-report-errors.js';
import type { StructuredBugReportFacts } from './bug-report-types.js';

test('Structured Bug Report Adversarial & Robustness Test Suite', async t => {
  const generator = new BugReportGenerator();

  await t.test('gracefully handles malformed JSON in step action data', () => {
    const facts: StructuredBugReportFacts = {
      projectId: '11111111-1111-1111-1111-111111111111',
      failureCaseId: '22222222-2222-2222-2222-222222222222',
      failureCase: {
        id: '22222222-2222-2222-2222-222222222222',
        projectId: '11111111-1111-1111-1111-111111111111',
        executionId: 'exec-adv-1',
        title: 'Malformed Action Data Test',
        failureSummary: 'Failure with malformed action data',
        metadataJson: {},
        status: 'OPEN',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      project: { id: '11111111-1111-1111-1111-111111111111', key: 'ADV', name: 'Adv Proj' },
      testExecution: {
        id: 'exec-adv-1',
        testCaseId: 'tc-adv-1',
        testCaseVersionNumber: 1,
        status: 'FAILED',
        errorMessage: 'Crash',
        errorStack: null,
        startedAt: new Date(),
        completedAt: new Date(),
        environmentId: null,
        stepExecutions: [
          {
            id: 'step-bad',
            stepIndex: 1,
            actionType: 'CUSTOM_ACTION',
            targetSummary: 'custom-target',
            actionDataJson: '{ invalid json: true, missing quotes, [[[',
            expectedSummary: 'Success',
            actualSummary: 'Failed',
            status: 'FAILED',
            errorMessage: 'SyntaxError in JSON payload',
            durationMs: 50,
            screenshotPath: null,
          },
        ],
      },
      evidenceReferences: [],
    };

    const report = generator.generate(facts, { reportNumber: 'BUG-000020', revision: 1 });
    assert.ok(report);
    assert.equal(report.reproductionSteps.length, 1);
    assert.ok(report.reproductionSteps[0]?.description.includes('CUSTOM_ACTION'));
  });

  await t.test('handles completely absent requirement and testCase records', () => {
    const facts: StructuredBugReportFacts = {
      projectId: '11111111-1111-1111-1111-111111111111',
      failureCaseId: '22222222-2222-2222-2222-222222222222',
      failureCase: {
        id: '22222222-2222-2222-2222-222222222222',
        projectId: '11111111-1111-1111-1111-111111111111',
        executionId: 'exec-orphan',
        title: 'Orphan execution failure',
        failureSummary: null,
        metadataJson: null,
        status: 'OPEN',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      project: { id: '11111111-1111-1111-1111-111111111111', key: 'ADV', name: 'Adv Proj' },
      testExecution: {
        id: 'exec-orphan',
        testCaseId: 'tc-orphan',
        testCaseVersionNumber: 1,
        status: 'FAILED',
        errorMessage: null,
        errorStack: null,
        startedAt: new Date(),
        completedAt: null,
        environmentId: null,
        stepExecutions: [],
      },
      testCase: null,
      requirement: null,
      evidenceReferences: [],
    };

    const report = generator.generate(facts, { reportNumber: 'BUG-000021', revision: 1 });
    assert.ok(report);
    assert.equal(report.requirementId, null);
    assert.equal(report.testCaseKey, null);
    assert.ok(report.limitationsAndUnknowns.some(lim => lim.includes('requirement')));
  });

  await t.test('rejects regeneration with empty reason', async () => {
    const mockPrisma = {
      failureCase: {
        findUnique: async () => ({
          id: 'case-1',
          projectId: '11111111-1111-1111-1111-111111111111',
        }),
      },
    } as any;

    const service = new StructuredBugReportService(mockPrisma);

    await assert.rejects(
      async () => {
        await service.regenerateBugReport({
          projectId: '11111111-1111-1111-1111-111111111111',
          failureCaseId: '22222222-2222-2222-2222-222222222222',
          reason: '   ',
        });
      },
      (err: any) => {
        assert.ok(err instanceof BugReportInvalidOperationError || err.name === 'ZodError');
        return true;
      },
    );
  });

  await t.test('rejects regeneration when no report exists yet', async () => {
    const mockPrisma = {
      failureCase: {
        findUnique: async () => ({
          id: '33333333-3333-3333-3333-333333333333',
          projectId: '11111111-1111-1111-1111-111111111111',
        }),
      },
      structuredBugReport: {
        findFirst: async () => null,
      },
    } as any;

    const service = new StructuredBugReportService(mockPrisma);

    await assert.rejects(
      async () => {
        await service.regenerateBugReport({
          projectId: '11111111-1111-1111-1111-111111111111',
          failureCaseId: '33333333-3333-3333-3333-333333333333',
          reason: 'Valid reason to regenerate',
        });
      },
      (err: any) => {
        assert.ok(err instanceof BugReportNotFoundError);
        assert.equal(err.code, 'BUG_REPORT_NOT_FOUND');
        return true;
      },
    );
  });
});
