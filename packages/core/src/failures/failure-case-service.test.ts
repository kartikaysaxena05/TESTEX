/**
 * @file packages/core/src/failures/failure-case-service.test.ts
 * Comprehensive unit and integration tests for FailureCaseService (V6 Phase 74).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../database/client.js';
import { FailureCaseService } from './failure-case-service.js';
import {
  ExecutionIneligibleForFailureCaseError,
  FailureCaseAlreadyExistsError,
  AnalysisAlreadyRunningError,
} from './failure-errors.js';
import type { PrismaClient } from '@prisma/client';

describe('FailureCaseService (V6 Phase 74)', () => {
  let prisma: PrismaClient;
  let service: FailureCaseService;

  let testProjectId: string;
  let otherProjectId: string;
  let testCaseId: string;
  let _testRunId: string;
  let failedExecutionId: string;
  let passedExecutionId: string;
  let automationErrorExecutionId: string;
  let stepExecutionId: string;
  let _bundleId: string;
  let artifactId: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;
    service = new FailureCaseService({ prisma });

    testProjectId = crypto.randomUUID();
    otherProjectId = crypto.randomUUID();

    // 1. Projects
    await prisma.project.createMany({
      data: [
        { id: testProjectId, name: 'Failure Intelligence Test Project' },
        { id: otherProjectId, name: 'Other Test Project' },
      ],
    });

    // 2. Requirement
    const req = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: `REQ-${Date.now().toString(36).toUpperCase()}`,
        title: 'Checkout Flow',
        originalText: 'User must be able to complete purchase',
        status: 'ACTIVE',
      },
    });

    // 3. TestCase
    const tc = await prisma.testCase.create({
      data: {
        projectId: testProjectId,
        testCaseKey: `TC-${Date.now().toString(36).toUpperCase()}`,
        title: 'Checkout With Coupon',
        objective: 'Verify coupon deduction in checkout',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
        sourceRequirementId: req.id,
        sourceRequirementKey: req.requirementKey,
      },
    });
    testCaseId = tc.id;

    // 4. ExecutableTestPlan
    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fingerprint-1',
        summary: 'Executable checkout plan',
        status: 'VALID',
        isExecutable: true,
      },
    });

    // 5. TestRun
    const run = await prisma.testRun.create({
      data: {
        projectId: testProjectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        status: 'FAILED',
        planFingerprint: 'plan-fingerprint-1',
        testCaseTitle: tc.title,
      },
    });
    _testRunId = run.id;

    // 6. Failed TestCaseExecution
    const failedExec = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectId,
        testRunId: run.id,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        attempt: 1,
        status: 'FAILED',
        errorCode: 'ASSERTION_FAILED',
        errorMessage: 'Expected total $90.00 but found $100.00',
        terminalReason: 'Step 2 assertion failure',
      },
    });
    failedExecutionId = failedExec.id;

    // 7. StepExecutionRecord
    const step = await prisma.stepExecutionRecord.create({
      data: {
        projectId: testProjectId,
        testRunId: run.id,
        executionId: failedExec.id,
        stepIndex: 2,
        attempt: 1,
        actionType: 'ASSERT_TEXT',
        status: 'FAILED',
        targetSummary: '#cart-total',
        expectedSummary: 'Expected $90.00',
        actualSummary: 'Received $100.00',
        errorCode: 'ASSERTION_FAILED',
        errorMessage: 'Mismatch in total price',
      },
    });
    stepExecutionId = step.id;

    // 8. Evidence Bundle & Artifact
    const bundle = await prisma.executionEvidenceBundle.create({
      data: {
        projectId: testProjectId,
        testRunId: run.id,
        executionId: failedExec.id,
        stepExecutionId: step.id,
        stepIndex: 2,
        status: 'COMPLETE',
        errorSummary: 'Assertion mismatch on checkout page',
      },
    });
    _bundleId = bundle.id;

    const artifact = await prisma.executionEvidenceArtifact.create({
      data: {
        projectId: testProjectId,
        bundleId: bundle.id,
        testRunId: run.id,
        executionId: failedExec.id,
        stepExecutionId: step.id,
        artifactType: 'SCREENSHOT',
        storageIdentity: 'artifacts/screenshot-checkout-fail.png',
        originalLogicalName: 'screenshot-step-2.png',
        mimeType: 'image/png',
        byteSize: 10240,
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
    });
    artifactId = artifact.id;

    // 9. Passed TestCaseExecution
    const passedExec = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectId,
        testRunId: run.id,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        attempt: 2,
        status: 'PASSED',
      },
    });
    passedExecutionId = passedExec.id;

    // 10. Automation Error TestCaseExecution
    const autoErrorExec = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectId,
        testRunId: run.id,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        attempt: 3,
        status: 'AUTOMATION_ERROR',
        errorCode: 'TARGET_NOT_FOUND',
        errorMessage: 'Element #apply-coupon timed out after 30000ms',
      },
    });
    automationErrorExecutionId = autoErrorExec.id;
  });

  describe('Creation and Eligibility Policy', () => {
    it('creates an authoritative FailureCase from a FAILED execution with attached evidence references', async () => {
      const result = await service.createFailureCase({
        projectId: testProjectId,
        executionId: failedExecutionId,
      });

      assert.ok(result.id);
      assert.strictEqual(result.projectId, testProjectId);
      assert.strictEqual(result.executionId, failedExecutionId);
      assert.strictEqual(result.testCaseId, testCaseId);
      assert.strictEqual(result.triggeringExecutionStatus, 'FAILED');
      assert.strictEqual(result.status, 'READY');
      assert.strictEqual(result.isEligible, true);
      assert.strictEqual(result.stepIndex, 2);
      assert.strictEqual(result.errorCode, 'ASSERTION_FAILED');
      assert.strictEqual(result.evidenceReferencesCount, 1);

      // Verify evidence reference in database
      const refs = await service.listEvidenceReferences({
        projectId: testProjectId,
        failureCaseId: result.id,
      });
      assert.strictEqual(refs.length, 1);
      assert.strictEqual(refs[0]?.artifactType, 'SCREENSHOT');
      assert.strictEqual(refs[0]?.sourceArtifactId, artifactId);
      assert.strictEqual(refs[0]?.storageIdentity, 'artifacts/screenshot-checkout-fail.png');
    });

    it('creates an authoritative FailureCase from an AUTOMATION_ERROR execution', async () => {
      const result = await service.createFailureCase({
        projectId: testProjectId,
        executionId: automationErrorExecutionId,
      });

      assert.strictEqual(result.triggeringExecutionStatus, 'AUTOMATION_ERROR');
      assert.strictEqual(result.isEligible, true);
    });

    it('rejects FailureCase creation for a PASSED execution', async () => {
      await assert.rejects(
        () =>
          service.createFailureCase({
            projectId: testProjectId,
            executionId: passedExecutionId,
          }),
        (err: unknown) => {
          assert.ok(err instanceof ExecutionIneligibleForFailureCaseError);
          assert.strictEqual(err.code, 'EXECUTION_INELIGIBLE');
          assert.match(
            err.message,
            /PASSED executions must never become a failure intelligence case/,
          );
          return true;
        },
      );
    });

    it('throws FailureCaseAlreadyExistsError when calling createFailureCase on an already mapped execution', async () => {
      await service.createFailureCase({
        projectId: testProjectId,
        executionId: failedExecutionId,
      });

      await assert.rejects(
        () =>
          service.createFailureCase({
            projectId: testProjectId,
            executionId: failedExecutionId,
          }),
        FailureCaseAlreadyExistsError,
      );
    });

    it('returns the existing FailureCase idempotently when calling ensureFailureCaseFromExecution', async () => {
      const first = await service.ensureFailureCaseFromExecution({
        projectId: testProjectId,
        executionId: failedExecutionId,
      });

      const second = await service.ensureFailureCaseFromExecution({
        projectId: testProjectId,
        executionId: failedExecutionId,
      });

      assert.strictEqual(first.id, second.id);
      assert.strictEqual(first.executionId, second.executionId);
    });
  });

  describe('V5 Execution Immutability Verification', () => {
    it('does NOT modify V5 execution records, steps, or evidence artifacts when creating FailureCase', async () => {
      // Capture snapshot before
      const execBefore = await prisma.testCaseExecution.findUniqueOrThrow({
        where: { id: failedExecutionId },
      });
      const stepBefore = await prisma.stepExecutionRecord.findUniqueOrThrow({
        where: { id: stepExecutionId },
      });
      const artifactBefore = await prisma.executionEvidenceArtifact.findUniqueOrThrow({
        where: { id: artifactId },
      });

      // Create FailureCase and start/complete analysis
      const failureCase = await service.createFailureCase({
        projectId: testProjectId,
        executionId: failedExecutionId,
      });
      const run = await service.startAnalysis({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });
      await service.completeAnalysis({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
        analysisRunId: run.id,
      });

      // Capture snapshot after
      const execAfter = await prisma.testCaseExecution.findUniqueOrThrow({
        where: { id: failedExecutionId },
      });
      const stepAfter = await prisma.stepExecutionRecord.findUniqueOrThrow({
        where: { id: stepExecutionId },
      });
      const artifactAfter = await prisma.executionEvidenceArtifact.findUniqueOrThrow({
        where: { id: artifactId },
      });

      // Verify strict byte-for-byte/field-for-field immutability of V5 records
      assert.strictEqual(execBefore.status, execAfter.status);
      assert.strictEqual(execBefore.errorMessage, execAfter.errorMessage);
      assert.strictEqual(execBefore.errorCode, execAfter.errorCode);
      assert.strictEqual(execBefore.updatedAt.toISOString(), execAfter.updatedAt.toISOString());

      assert.strictEqual(stepBefore.status, stepAfter.status);
      assert.strictEqual(stepBefore.actualSummary, stepAfter.actualSummary);
      assert.strictEqual(stepBefore.updatedAt.toISOString(), stepAfter.updatedAt.toISOString());

      assert.strictEqual(artifactBefore.sha256, artifactAfter.sha256);
      assert.strictEqual(artifactBefore.storageIdentity, artifactAfter.storageIdentity);
    });
  });

  describe('Analysis Lifecycle and Versioned Runs', () => {
    it('progresses through startAnalysis -> completeAnalysis lifecycle with attempt 1', async () => {
      const failureCase = await service.createFailureCase({
        projectId: testProjectId,
        executionId: failedExecutionId,
      });

      const run = await service.startAnalysis({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
        analyzerVersion: '1.0.0',
      });

      assert.ok(run.id);
      assert.strictEqual(run.attemptNumber, 1);
      assert.strictEqual(run.status, 'RUNNING');
      assert.strictEqual(run.analyzerVersion, '1.0.0');
      assert.ok(run.inputSnapshotJson);
      assert.strictEqual((run.inputSnapshotJson as any).executionId, failedExecutionId);

      // Verify FailureCase state transitioned to ANALYZING
      const caseAnalyzing = await service.getFailureCase({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });
      assert.strictEqual(caseAnalyzing.status, 'ANALYZING');
      assert.strictEqual(caseAnalyzing.currentAnalysisRunId, run.id);
      assert.strictEqual(caseAnalyzing.analysisAttemptCount, 1);

      // Complete analysis
      const completedRun = await service.completeAnalysis({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
        analysisRunId: run.id,
      });

      assert.strictEqual(completedRun.status, 'COMPLETED');
      assert.ok(completedRun.completedAt);
      assert.ok(typeof completedRun.durationMs === 'number');

      // Verify FailureCase status is COMPLETED
      const caseCompleted = await service.getFailureCase({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });
      assert.strictEqual(caseCompleted.status, 'COMPLETED');
    });

    it('supports re-analysis incrementing attempt numbers to 2', async () => {
      const failureCase = await service.createFailureCase({
        projectId: testProjectId,
        executionId: failedExecutionId,
      });

      // Run 1 (Failed)
      const run1 = await service.startAnalysis({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });
      await service.failAnalysis({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
        analysisRunId: run1.id,
        failureReason: 'Analysis worker timed out',
      });

      // Run 2 (Re-attempt)
      const run2 = await service.startAnalysis({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
        analyzerVersion: '1.1.0',
      });

      assert.strictEqual(run2.attemptNumber, 2);
      assert.strictEqual(run2.analyzerVersion, '1.1.0');

      const runs = await service.listAnalysisRuns({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });
      assert.strictEqual(runs.length, 2);
      assert.strictEqual(runs[0]?.attemptNumber, 1);
      assert.strictEqual(runs[0]?.status, 'FAILED');
      assert.strictEqual(runs[1]?.attemptNumber, 2);
      assert.strictEqual(runs[1]?.status, 'RUNNING');
    });

    it('rejects concurrent startAnalysis when case is already in ANALYZING status', async () => {
      const failureCase = await service.createFailureCase({
        projectId: testProjectId,
        executionId: failedExecutionId,
      });

      await service.startAnalysis({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });

      await assert.rejects(
        () =>
          service.startAnalysis({
            projectId: testProjectId,
            failureCaseId: failureCase.id,
          }),
        AnalysisAlreadyRunningError,
      );
    });

    it('cancels ongoing analysis and marks case CANCELLED', async () => {
      const failureCase = await service.createFailureCase({
        projectId: testProjectId,
        executionId: failedExecutionId,
      });

      await service.startAnalysis({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });

      const cancelledCase = await service.cancelAnalysis({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
        reason: 'Execution superseded by re-run',
      });

      assert.strictEqual(cancelledCase.status, 'CANCELLED');
    });

    it('marks case as STALE with reason and timestamp', async () => {
      const failureCase = await service.createFailureCase({
        projectId: testProjectId,
        executionId: failedExecutionId,
      });

      const staleCase = await service.markStale({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
        reason: 'TestCase objective and steps updated in Phase 56',
      });

      assert.strictEqual(staleCase.status, 'STALE');
      assert.strictEqual(staleCase.isStale, true);
      assert.strictEqual(
        staleCase.stalenessReason,
        'TestCase objective and steps updated in Phase 56',
      );
      assert.ok(staleCase.staleAt);
    });
  });

  describe('Querying and Pagination', () => {
    it('lists failure cases with pagination and status filters', async () => {
      await service.createFailureCase({
        projectId: testProjectId,
        executionId: failedExecutionId,
      });
      await service.createFailureCase({
        projectId: testProjectId,
        executionId: automationErrorExecutionId,
      });

      const page1 = await service.listFailureCases({
        projectId: testProjectId,
        page: 1,
        pageSize: 1,
      });

      assert.strictEqual(page1.items.length, 1);
      assert.strictEqual(page1.total, 2);
      assert.strictEqual(page1.totalPages, 2);

      const filterRes = await service.listFailureCases({
        projectId: testProjectId,
        status: 'READY',
      });
      assert.strictEqual(filterRes.items.length, 2);
    });
  });
});
