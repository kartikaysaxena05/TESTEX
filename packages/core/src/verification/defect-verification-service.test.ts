/**
 * @file packages/core/src/verification/defect-verification-service.test.ts
 * Comprehensive integration tests for DefectVerificationService (V7 Phase 98).
 * Tests multi-tenant isolation, mutex concurrency, bounds enforcement, production safety,
 * E1 immutability, audit trail generation, and comparison reporting.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../database/index.js';
import { DefectVerificationService } from './defect-verification-service.js';
import {
  VerificationNotFoundError,
  VerificationAttemptLimitExceededError,
} from './verification-errors.js';
import type { PrismaClient } from '@prisma/client';

describe('DefectVerificationService Integration (Phase 98)', () => {
  let prisma: PrismaClient;
  let service: DefectVerificationService;

  const testProjectIdA = crypto.randomUUID();
  const testProjectIdB = crypto.randomUUID();

  let devEnvAId: string;
  let prodEnvAId: string;

  let failureCaseA1: string;
  let failureCaseA_Empty: string;
  let originalExecutionA1Id: string;

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('DATABASE_URL must be configured for integration tests.');
    }
    prisma = client;
    service = new DefectVerificationService({ prisma });

    // 1. Create Projects
    await prisma.project.createMany({
      data: [
        { id: testProjectIdA, name: `Phase 98 Proj A ${Date.now()}` },
        { id: testProjectIdB, name: `Phase 98 Proj B ${Date.now()}` },
      ],
    });

    // 2. Create Environments
    const devEnvA = await prisma.projectEnvironment.create({
      data: {
        projectId: testProjectIdA,
        name: 'Dev Environment A',
        type: 'DEVELOPMENT',
        baseUrl: 'http://localhost:3000',
        isDefault: true,
        isEnabled: true,
        isProduction: false,
        productionSafetyPolicy: 'SAFE_MODE',
      },
    });
    devEnvAId = devEnvA.id;

    const prodEnvA = await prisma.projectEnvironment.create({
      data: {
        projectId: testProjectIdA,
        name: 'Prod Environment A',
        type: 'PRODUCTION',
        baseUrl: 'https://prod.example.com',
        isDefault: false,
        isEnabled: true,
        isProduction: true,
        productionSafetyPolicy: 'PROHIBITED',
      },
    });
    prodEnvAId = prodEnvA.id;

    const devEnvB = await prisma.projectEnvironment.create({
      data: {
        projectId: testProjectIdB,
        name: 'Dev Environment B',
        type: 'DEVELOPMENT',
        baseUrl: 'http://localhost:4000',
        isDefault: true,
        isEnabled: true,
        isProduction: false,
        productionSafetyPolicy: 'SAFE_MODE',
      },
    });

    // 3. Create Requirement
    const reqA = await prisma.requirement.create({
      data: {
        projectId: testProjectIdA,
        requirementKey: `REQ-P98-${Date.now().toString(36).toUpperCase()}`,
        title: 'Checkout Flow Verification',
        originalText: 'Checkout requirements for Phase 98',
        status: 'ACTIVE',
      },
    });

    // 4. Create TestCase A1 with versions 1 and 2
    const tcA1 = await prisma.testCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseKey: `TC-P98-${Date.now().toString(36).toUpperCase()}`,
        title: 'Payment Tokenizer Failure Test',
        objective: 'Verify payment token processing',
        currentVersionNumber: 2,
        status: 'ACTIVE',
        reviewStatus: 'APPROVED',
      },
    });

    // Historical Version 1 (where defect was observed)
    const ver1 = await prisma.testCaseVersion.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        versionNumber: 1,
        title: 'Payment Tokenizer Test v1',
        objective: 'Historical payment test',
        sourceRequirementId: reqA.id,
        sourceRequirementKey: reqA.requirementKey,
        sourceRequirementVersionNumber: 1,
        stepsJson: [
          { stepNumber: 1, action: 'NAVIGATE /checkout' },
          { stepNumber: 2, action: 'CLICK #pay-button', expectedResult: 'Token generated' },
        ],
      },
    });

    // Current Version 2 (updated test steps)
    await prisma.testCaseVersion.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        versionNumber: 2,
        title: 'Payment Tokenizer Test v2 (Updated)',
        objective: 'Updated payment test with token field',
        sourceRequirementId: reqA.id,
        sourceRequirementKey: reqA.requirementKey,
        sourceRequirementVersionNumber: 1,
        stepsJson: [
          { stepNumber: 1, action: 'NAVIGATE /checkout' },
          { stepNumber: 2, action: 'FILL #token-field with mock-token' },
          { stepNumber: 3, action: 'CLICK #pay-button', expectedResult: 'Token generated' },
        ],
      },
    });

    // ExecutableTestPlan & TestRun for Historical E1
    const planA = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectIdA,
        environmentId: devEnvAId,
        testCaseVersionId: ver1.id,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        planFingerprint: `fp-p98-${Date.now()}`,
        status: 'VALID',
      },
    });

    const runA1 = await prisma.testRun.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        testCaseTitle: 'Payment Tokenizer Failure Test',
        planFingerprint: planA.planFingerprint,
        status: 'FAILED',
        environmentId: devEnvAId,
        executableTestPlanId: planA.id,
      },
    });

    // Historical Failed Execution E1
    const execA1 = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectIdA,
        testRunId: runA1.id,
        testCaseId: tcA1.id,
        testCaseVersionId: ver1.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA.id,
        environmentId: devEnvAId,
        status: 'FAILED',
        errorCode: 'ASSERTION_FAILED',
        errorMessage: 'Assertion failed: Target element #pay-button is not visible.',
      },
    });
    originalExecutionA1Id = execA1.id;

    // Create historical StepExecutionRecord for E1
    await prisma.stepExecutionRecord.createMany({
      data: [
        {
          projectId: testProjectIdA,
          testRunId: runA1.id,
          executionId: execA1.id,
          stepIndex: 0,
          actionType: 'NAVIGATE',
          status: 'PASSED',
        },
        {
          projectId: testProjectIdA,
          testRunId: runA1.id,
          executionId: execA1.id,
          stepIndex: 1,
          actionType: 'CLICK',
          status: 'FAILED',
          targetSummary: 'CLICK #pay-button',
          errorMessage: 'Assertion failed: Target element #pay-button is not visible.',
        },
      ],
    });

    // FailureCase A1
    const fcA1 = await prisma.failureCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        testRunId: runA1.id,
        executionId: execA1.id,
        stepIndex: 1,
        triggeringExecutionStatus: 'FAILED',
        status: 'READY',
        title: 'Payment button missing on checkout',
        failureSummary: 'Element #pay-button not found in DOM',
        failureSignature: 'SIG-PAY-BUTTON-404',
        environmentId: devEnvAId,
      },
    });
    failureCaseA1 = fcA1.id;

    // StructuredBugReport A1
    await prisma.structuredBugReport.create({
      data: {
        projectId: testProjectIdA,
        failureCaseId: fcA1.id,
        reportNumber: 'BUG-P98-001',
        revision: 1,
        isAuthoritative: true,
        status: 'READY',
        applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
        isApplicationDefect: true,
        title: 'Payment button missing on checkout',
        summary: 'Element #pay-button not found in DOM during checkout flow',
        testCaseId: tcA1.id,
        testCaseKey: tcA1.testCaseKey,
        testCaseVersionNumber: 1,
        testCaseTitle: tcA1.title,
        originalExecutionId: execA1.id,
        triggeringStatus: 'FAILED',
        failedStepIndex: 1,
        failedStepAction: 'CLICK #pay-button',
        expectedResult: 'Expected payment token',
        actualResult: 'Payment button missing',
        markdownReport: '# Bug Report P98',
        reportFingerprint: 'fp-p98-bug',
      },
    });

    // Create a TestCase with empty steps (non-executable)
    const tcEmpty = await prisma.testCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseKey: `TC-EMPTY-${Date.now().toString(36).toUpperCase()}`,
        title: 'Empty Test Case',
        objective: 'Test case with 0 steps',
        currentVersionNumber: 1,
        status: 'ACTIVE',
      },
    });

    const verEmpty = await prisma.testCaseVersion.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcEmpty.id,
        versionNumber: 1,
        title: 'Empty Test v1',
        objective: 'Empty steps',
        stepsJson: [],
      },
    });

    const planEmpty = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectIdA,
        environmentId: devEnvAId,
        testCaseVersionId: verEmpty.id,
        testCaseId: tcEmpty.id,
        testCaseVersionNumber: 1,
        planFingerprint: `fp-empty-${Date.now()}`,
        status: 'VALID',
      },
    });

    const runEmpty = await prisma.testRun.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcEmpty.id,
        testCaseVersionNumber: 1,
        testCaseTitle: 'Empty Test',
        planFingerprint: planEmpty.planFingerprint,
        status: 'FAILED',
        environmentId: devEnvAId,
        executableTestPlanId: planEmpty.id,
      },
    });

    const execEmpty = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectIdA,
        testRunId: runEmpty.id,
        testCaseId: tcEmpty.id,
        testCaseVersionId: verEmpty.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planEmpty.id,
        environmentId: devEnvAId,
        status: 'FAILED',
      },
    });

    const fcEmpty = await prisma.failureCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcEmpty.id,
        testCaseVersionNumber: 1,
        testRunId: runEmpty.id,
        executionId: execEmpty.id,
        triggeringExecutionStatus: 'FAILED',
        status: 'READY',
        title: 'Empty test failure',
        environmentId: devEnvAId,
      },
    });
    failureCaseA_Empty = fcEmpty.id;
  });

  after(async () => {
    // Clean up test data
    try {
      await prisma.project.deleteMany({
        where: { id: { in: [testProjectIdA, testProjectIdB] } },
      });
    } catch {
      void 0;
    }
  });

  it('enforces multi-tenant isolation: rejects execution from different project', async () => {
    await assert.rejects(
      async () => {
        await service.executeVerification({
          projectId: testProjectIdB, // Wrong project
          failureCaseId: failureCaseA1,
        });
      },
      (err: any) => err instanceof VerificationNotFoundError,
    );
  });

  it('rejects requested maxAttempts exceeding limit (>5)', async () => {
    await assert.rejects(
      async () => {
        await service.executeVerification({
          projectId: testProjectIdA,
          failureCaseId: failureCaseA1,
          maxAttempts: 6,
        });
      },
      (err: any) => err instanceof VerificationAttemptLimitExceededError,
    );
  });

  it('blocks verification on non-executable test version (0 steps)', async () => {
    const summary = await service.executeVerification({
      projectId: testProjectIdA,
      failureCaseId: failureCaseA_Empty,
    });

    assert.equal(summary.latestOutcome, 'BLOCKED');
    assert.equal(summary.isBlocked, true);
    assert.equal(summary.attempts.length, 1);
    assert.equal(summary.attempts[0]?.status, 'BLOCKED');
    assert.match(summary.attempts[0]?.blockerReason || '', /no executable steps/i);

    // Verify reverification record status in DB
    const reverification = await prisma.defectReverification.findUnique({
      where: { id: summary.reverificationId },
    });
    assert.equal(reverification?.status, 'BLOCKED');
    assert.equal(reverification?.latestOutcome, 'BLOCKED');
  });

  it('enforces production safety policy: blocks mutating execution on production target', async () => {
    // Step 2 of v1 has 'CLICK #pay-button' containing mutating keyword 'pay'
    const summary = await service.executeVerification({
      projectId: testProjectIdA,
      failureCaseId: failureCaseA1,
      targetEnvironmentId: prodEnvAId, // Production environment with PROHIBITED policy
    });

    assert.equal(summary.latestOutcome, 'BLOCKED');
    assert.equal(summary.isBlocked, true);
    assert.equal(summary.attempts.length, 1);
    assert.equal(summary.attempts[0]?.status, 'BLOCKED');
    assert.match(summary.attempts[0]?.blockerReason || '', /strictly PROHIBITED/i);

    // Verify audit event exists
    const auditEvents = await prisma.reverificationAuditEvent.findMany({
      where: { reverificationId: summary.reverificationId },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(auditEvents.some(e => e.action === 'VERIFICATION_BLOCKED'));
  });

  it('executes verification in development environment and preserves E1 immutability', async () => {
    // Check E1 initial status
    const e1Before = await prisma.testCaseExecution.findUnique({
      where: { id: originalExecutionA1Id },
    });
    assert.equal(e1Before?.status, 'FAILED');

    // Run verification attempt
    const summary = await service.executeVerification({
      projectId: testProjectIdA,
      failureCaseId: failureCaseA1,
      targetEnvironmentId: devEnvAId,
      mode: 'HISTORICAL',
      maxAttempts: 1,
    });

    assert.ok(summary.attempts.length >= 1);
    const attempt = summary.attempts[0]!;
    assert.equal(attempt.verificationMode, 'HISTORICAL');
    assert.equal(attempt.originalExecutionId, originalExecutionA1Id);
    assert.ok(attempt.verificationExecutionId !== originalExecutionA1Id); // Must be a NEW E2 identity!

    // CRITICAL INVARIANT: E1 must remain FAILED and unmutated
    const e1After = await prisma.testCaseExecution.findUnique({
      where: { id: originalExecutionA1Id },
    });
    assert.equal(e1After?.status, 'FAILED');
    assert.equal(e1After?.errorCode, 'ASSERTION_FAILED');

    // Verify DefectVerificationAttempt persisted in DB
    const attemptDb = await prisma.defectVerificationAttempt.findUnique({
      where: { id: attempt.id },
    });
    assert.ok(attemptDb);
    assert.equal(attemptDb.reverificationId, summary.reverificationId);
    assert.equal(attemptDb.originalExecutionId, originalExecutionA1Id);

    // Verify Reverification audit events recorded
    const auditEvents = await prisma.reverificationAuditEvent.findMany({
      where: { reverificationId: summary.reverificationId },
    });
    assert.ok(auditEvents.some(e => e.action === 'VERIFICATION_STARTED'));
    assert.ok(auditEvents.some(e => e.action === 'VERIFICATION_ATTEMPT_COMPLETED'));
  });

  it('supports CURRENT mode and detects test version difference', async () => {
    const summary = await service.executeVerification({
      projectId: testProjectIdA,
      failureCaseId: failureCaseA1,
      targetEnvironmentId: devEnvAId,
      mode: 'CURRENT', // v2 vs historical v1
      maxAttempts: 1,
    });

    assert.ok(summary.attempts.length >= 1);
    const attempt = summary.attempts[summary.attempts.length - 1]!;
    assert.equal(attempt.verificationMode, 'CURRENT');
    assert.equal(attempt.originalTestCaseVersionNumber, 1);
    assert.equal(attempt.verificationTestCaseVersionNumber, 2);
    assert.ok(attempt.testVersionDifference);
    assert.match(attempt.testVersionDifference, /Rerun against current test version V2/);
  });

  it('retrieves verification attempts and comparison details', async () => {
    const attempts = await service.getAttempts({
      projectId: testProjectIdA,
      failureCaseId: failureCaseA1,
    });

    assert.ok(attempts.length >= 1);

    const latestComparison = await service.getComparison({
      projectId: testProjectIdA,
      failureCaseId: failureCaseA1,
    });

    assert.ok(latestComparison);
    assert.equal(latestComparison.failureCaseId, failureCaseA1);
    assert.ok(latestComparison.attemptNumber >= 1);
  });

  it('supports cancellation token', async () => {
    const cancelRes = await service.cancelVerification({
      projectId: testProjectIdA,
      failureCaseId: failureCaseA1,
      reason: 'User cancelled verification run.',
    });

    assert.equal(cancelRes.cancelled, true);
  });
});
