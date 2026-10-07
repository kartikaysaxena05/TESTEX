/**
 * @file packages/core/src/reverification/reverification-service.test.ts
 * Comprehensive integration and adversarial tests for Defect Reverification Foundation (V7 Phase 97).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../database/index.js';
import { DefectReverificationService } from './reverification-service.js';
import {
  ReverificationCrossProjectForbiddenError,
  ReverificationHistoricalTestUnavailableError,
} from './reverification-errors.js';
import type { PrismaClient } from '@prisma/client';

describe('DefectReverificationService Integration (Phase 97)', () => {
  let prisma: PrismaClient;
  let service: DefectReverificationService;

  const testProjectIdA = crypto.randomUUID();
  const testProjectIdB = crypto.randomUUID();

  let devEnvAId: string;
  let prodEnvAId: string;
  let disabledEnvAId: string;
  let devEnvBId: string;

  let failureCaseA1: string;
  let failureCaseA2: string;
  let failureCaseB1: string;

  let testCaseA1: string;

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('DATABASE_URL must be configured for integration tests.');
    }
    prisma = client;
    service = new DefectReverificationService({ prisma });

    // 1. Projects
    await prisma.project.createMany({
      data: [
        { id: testProjectIdA, name: `Phase 97 Proj A ${Date.now()}` },
        { id: testProjectIdB, name: `Phase 97 Proj B ${Date.now()}` },
      ],
    });

    // 2. Environments
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

    const disabledEnvA = await prisma.projectEnvironment.create({
      data: {
        projectId: testProjectIdA,
        name: 'Disabled Environment A',
        type: 'DEVELOPMENT',
        baseUrl: 'http://localhost:3001',
        isDefault: false,
        isEnabled: false,
        isProduction: false,
        productionSafetyPolicy: 'SAFE_MODE',
      },
    });
    disabledEnvAId = disabledEnvA.id;

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
    devEnvBId = devEnvB.id;

    // 3. Requirement
    const reqA = await prisma.requirement.create({
      data: {
        projectId: testProjectIdA,
        requirementKey: `REQ-A-${Date.now().toString(36).toUpperCase()}`,
        title: 'Checkout and Payment Flow',
        originalText: 'User checkout requirements',
        status: 'ACTIVE',
      },
    });

    // 4. TestCase & TestCaseVersion
    const tcA1 = await prisma.testCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseKey: `TC-A-${Date.now().toString(36).toUpperCase()}`,
        title: 'Payment Gateway 500 Test',
        objective: 'Verify payment processing under invalid token',
        currentVersionNumber: 2, // Active version is 2
        status: 'ACTIVE',
        reviewStatus: 'APPROVED',
      },
    });
    testCaseA1 = tcA1.id;

    // Version 1 (Historical - where bug was found)
    const ver1 = await prisma.testCaseVersion.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        versionNumber: 1,
        title: 'Payment Gateway 500 Test v1',
        objective: 'Verify payment processing under invalid token',
        sourceRequirementId: reqA.id,
        sourceRequirementKey: reqA.requirementKey,
        sourceRequirementVersionNumber: 1,
        stepsJson: [
          { stepNumber: 1, action: 'NAVIGATE /checkout' },
          { stepNumber: 2, action: 'CLICK #submit-payment', expectedResult: 'Reject with 400' },
        ],
      },
    });

    // Version 2 (Newer version)
    await prisma.testCaseVersion.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        versionNumber: 2,
        title: 'Payment Gateway 500 Test v2 (Updated)',
        objective: 'Updated payment verification',
        sourceRequirementId: reqA.id,
        sourceRequirementKey: reqA.requirementKey,
        sourceRequirementVersionNumber: 1,
        stepsJson: [
          { stepNumber: 1, action: 'NAVIGATE /checkout' },
          { stepNumber: 2, action: 'FILL #token with valid-token' },
          { stepNumber: 3, action: 'CLICK #submit-payment', expectedResult: 'Order confirmed' },
        ],
      },
    });

    // 5. ExecutableTestPlan & TestRun
    const planA = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectIdA,
        environmentId: devEnvAId,
        testCaseVersionId: ver1.id,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        planFingerprint: `fp-a-${Date.now()}-${Math.random()}`,
        status: 'VALID',
      },
    });

    const runA = await prisma.testRun.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        testCaseTitle: 'Payment Gateway 500 Test',
        planFingerprint: planA.planFingerprint,
        status: 'FAILED',
        environmentId: devEnvAId,
        executableTestPlanId: planA.id,
      },
    });

    // 6. TestCaseExecution
    const execA1 = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectIdA,
        testRunId: runA.id,
        testCaseId: tcA1.id,
        testCaseVersionId: ver1.id,
        testCaseVersionNumber: 1, // Recorded historical version 1
        executableTestPlanId: planA.id,
        environmentId: devEnvAId,
        status: 'FAILED',
        errorCode: 'HTTP_500',
        errorMessage: 'Payment gateway returned 500 Internal Server Error',
      },
    });

    // 7. FailureCase A1
    const fcA1 = await prisma.failureCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1, // Historical version 1
        testRunId: runA.id,
        executionId: execA1.id,
        stepIndex: 2,
        triggeringExecutionStatus: 'FAILED',
        status: 'READY',
        title: 'Payment 500 Exception on Checkout',
        failureSummary: 'Unhandled NullPointer in tokenizer',
        failureSignature: 'SIG-PAYMENT-500',
        errorMessage: 'Internal server error during payment tokenization',
        environmentId: devEnvAId,
      },
    });
    failureCaseA1 = fcA1.id;

    // 8. StructuredBugReport A1
    const bugA1 = await prisma.structuredBugReport.create({
      data: {
        projectId: testProjectIdA,
        failureCaseId: fcA1.id,
        reportNumber: 'BUG-P97-001',
        revision: 1,
        isAuthoritative: true,
        status: 'READY',
        applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
        isApplicationDefect: true,
        title: 'Payment 500 Exception on Checkout',
        summary: 'Unhandled NullPointer in tokenizer during checkout',
        requirementId: reqA.id,
        requirementKey: reqA.requirementKey,
        requirementVersionNumber: 1,
        testCaseId: tcA1.id,
        testCaseKey: tcA1.testCaseKey,
        testCaseVersionNumber: 1,
        testCaseTitle: tcA1.title,
        originalExecutionId: execA1.id,
        triggeringStatus: 'FAILED',
        failedStepIndex: 2,
        failedStepAction: 'CLICK #submit-payment',
        expectedResult: 'Invalid token rejected with error message',
        actualResult: '500 Internal Server Error returned',
        markdownReport: '# Payment Bug Report',
        reportFingerprint: 'fp-p97-1',
      },
    });

    // 9. BugWorkflowState A1
    await prisma.bugWorkflowState.create({
      data: {
        projectId: testProjectIdA,
        failureCaseId: fcA1.id,
        bugReportId: bugA1.id,
        currentStatus: 'RESOLVED',
        verificationStatus: 'NOT_VERIFIED',
      },
    });

    // 10. FailureCase A2 (Non-eligible, WONT_FIX)
    const execA2 = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectIdA,
        testRunId: runA.id,
        testCaseId: tcA1.id,
        testCaseVersionId: ver1.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA.id,
        environmentId: devEnvAId,
        attempt: 2,
        status: 'FAILED',
      },
    });

    const fcA2 = await prisma.failureCase.create({
      data: {
        projectId: testProjectIdA,
        testCaseId: tcA1.id,
        testCaseVersionNumber: 1,
        testRunId: runA.id,
        executionId: execA2.id,
        triggeringExecutionStatus: 'FAILED',
        status: 'PENDING',
        title: 'Minor CSS Glitch',
        environmentId: devEnvAId,
      },
    });
    failureCaseA2 = fcA2.id;

    await prisma.bugWorkflowState.create({
      data: {
        projectId: testProjectIdA,
        failureCaseId: fcA2.id,
        currentStatus: 'WONT_FIX',
        verificationStatus: 'NOT_VERIFIED',
      },
    });

    const tcB = await prisma.testCase.create({
      data: {
        projectId: testProjectIdB,
        testCaseKey: `TC-B-${Date.now().toString(36).toUpperCase()}`,
        title: 'Project B TestCase',
        objective: 'Verify Project B',
        currentVersionNumber: 1,
      },
    });

    // 11. Project B FailureCase
    const planB = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectIdB,
        testCaseId: tcB.id,
        testCaseVersionNumber: 1,
        planFingerprint: `fp-b-${Date.now()}-${Math.random()}`,
        environmentId: devEnvBId,
        status: 'VALID',
      },
    });

    const runB = await prisma.testRun.create({
      data: {
        projectId: testProjectIdB,
        testCaseId: tcB.id,
        testCaseVersionNumber: 1,
        testCaseTitle: 'Project B TestCase',
        planFingerprint: planB.planFingerprint,
        status: 'FAILED',
        environmentId: devEnvBId,
        executableTestPlanId: planB.id,
      },
    });

    const execB1 = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectIdB,
        testRunId: runB.id,
        testCaseId: tcB.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planB.id,
        environmentId: devEnvBId,
        status: 'FAILED',
      },
    });

    const fcB1 = await prisma.failureCase.create({
      data: {
        projectId: testProjectIdB,
        testCaseId: tcB.id,
        testCaseVersionNumber: 1,
        testRunId: runB.id,
        executionId: execB1.id,
        triggeringExecutionStatus: 'FAILED',
        status: 'PENDING',
        title: 'Project B Defect',
        environmentId: devEnvBId,
      },
    });
    failureCaseB1 = fcB1.id;
  });

  after(async () => {
    // Cascade deletion of test projects
    await prisma.project.deleteMany({
      where: { id: { in: [testProjectIdA, testProjectIdB] } },
    });
  });

  describe('Reverification Eligibility Evaluation', () => {
    it('evaluates an eligible defect truthfully as ELIGIBLE', async () => {
      const result = await service.evaluateEligibility({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
      });

      assert.equal(result.eligibility, 'ELIGIBLE');
      assert.equal(result.originalTestCaseVersionNumber, 1);
      assert.equal(result.selectedTestCaseVersionNumber, 1);
      assert.equal(result.safetyStatus, 'SAFE');
      assert.equal(result.isProductionBlocked, false);
      assert.ok(
        result.reasons.some(r => r.includes('All 11 factual eligibility criteria satisfied')),
      );
    });

    it('evaluates WONT_FIX defect as NOT_ELIGIBLE', async () => {
      const result = await service.evaluateEligibility({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA2,
      });

      assert.equal(result.eligibility, 'NOT_ELIGIBLE');
      assert.ok(result.reasons.some(r => r.includes('WONT_FIX')));
    });

    it('evaluates defect against PROHIBITED production environment as BLOCKED (Section 15, 43)', async () => {
      const result = await service.evaluateEligibility({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        targetEnvironmentId: prodEnvAId,
      });

      assert.equal(result.eligibility, 'BLOCKED');
      assert.equal(result.safetyStatus, 'BLOCKED');
      assert.equal(result.isProductionBlocked, true);
      assert.ok(result.reasons.some(r => r.includes('PROHIBITED')));
    });

    it('evaluates defect against disabled environment as BLOCKED', async () => {
      const result = await service.evaluateEligibility({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        targetEnvironmentId: disabledEnvAId,
      });

      assert.equal(result.eligibility, 'BLOCKED');
      assert.ok(result.reasons.some(r => r.includes('disabled')));
    });

    it('strictly rejects cross-project evaluation with ReverificationCrossProjectForbiddenError (Section 25)', async () => {
      await assert.rejects(
        service.evaluateEligibility({
          projectId: testProjectIdB, // Wrong project for failureCaseA1!
          failureCaseId: failureCaseA1,
        }),
        ReverificationCrossProjectForbiddenError,
      );
    });
  });

  describe('Reverification Request Creation & Plan Generation', () => {
    let reverification1Id: string;

    it('creates a reverification request in READY status with historical version preserved (Section 11, 16)', async () => {
      const req = await service.createRequest({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        targetEnvironmentId: devEnvAId,
        triggerType: 'EXTERNAL_ISSUE_RESOLVED',
        triggerReference: 'JIRA-10050',
        fixReference: 'commit:9876543210ab',
        fixProvenance: { commitSha: '9876543210ab', branch: 'fix/payment-500' },
        actor: 'DEV_LEAD',
      });

      assert.ok(req.id);
      reverification1Id = req.id;
      assert.equal(req.projectId, testProjectIdA);
      assert.equal(req.failureCaseId, failureCaseA1);
      assert.equal(req.status, 'READY');
      assert.equal(req.eligibility, 'ELIGIBLE');
      assert.equal(req.originalTestCaseVersionNumber, 1); // Preserved v1 even though TestCase is v2!
      assert.equal(req.selectedTestCaseVersionNumber, 1);
      assert.equal(req.isAuthoritative, true);
      assert.equal(req.triggerType, 'EXTERNAL_ISSUE_RESOLVED');
      assert.equal(req.fixReference, 'commit:9876543210ab');

      // Verify baseline failure JSON captured
      const baseline = req.baselineFailureJson as any;
      assert.equal(baseline.failureSignature, 'SIG-PAYMENT-500');
      assert.equal(baseline.failedStepIndex, 2);

      // Verify execution plan JSON generated (NO browser run)
      const plan = req.executionPlanJson as any;
      assert.equal(plan.testExecutionSpec.historicalTestVersionPreserved, true);
      assert.equal(plan.safetyPolicy.isSafe, true);

      // Verify audit event logged
      const auditEvents = await service.listAuditEvents({
        projectId: testProjectIdA,
        reverificationId: req.id,
      });
      assert.equal(auditEvents.length, 1);
      assert.equal(auditEvents[0]?.action, 'CREATED');
      assert.equal(auditEvents[0]?.toStatus, 'READY');
      assert.equal(auditEvents[0]?.actor, 'DEV_LEAD');
    });

    it('supports unknown fix provenance truthfully without fabrication (Section 13)', async () => {
      const reqUnknown = await service.createRequest({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        targetEnvironmentId: devEnvAId,
        triggerType: 'MANUAL_REQUEST',
        actor: 'QA_TESTER',
      });

      assert.ok(reqUnknown.id);
      assert.equal(reqUnknown.status, 'READY');
      assert.equal(reqUnknown.fixReference, null);
    });

    it('supersedes previous active request when new request is submitted (Section 23)', async () => {
      // Create another request with a new fix
      const req2 = await service.createRequest({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        targetEnvironmentId: devEnvAId,
        triggerType: 'PATCH_APPLIED',
        fixReference: 'commit:newfix112233',
        actor: 'AUTOMATION_BOT',
      });

      assert.ok(req2.id);
      assert.notEqual(req2.id, reverification1Id);
      assert.equal(req2.isAuthoritative, true);
      assert.equal(req2.status, 'READY');

      // Verify old request is now SUPERSEDED
      const oldReq = await prisma.defectReverification.findUnique({
        where: { id: reverification1Id },
      });
      assert.equal(oldReq?.isAuthoritative, false);
      assert.equal(oldReq?.status, 'SUPERSEDED');
      assert.ok(oldReq?.supersededAt);
      assert.match(oldReq?.supersedeReason ?? '', /Superseded by new reverification request/);

      // Verify audit trail on old request records SUPERSEDED
      const oldAudit = await service.listAuditEvents({
        projectId: testProjectIdA,
        reverificationId: reverification1Id,
      });
      const supersededEvent = oldAudit.find(e => e.action === 'SUPERSEDED');
      assert.ok(supersededEvent);
      assert.equal(supersededEvent?.toStatus, 'SUPERSEDED');
    });

    it('cancels an active reverification request with actor and reason preserved (Section 24)', async () => {
      const activeReq = await service.getState({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
      });
      assert.ok(activeReq);

      const cancelled = await service.cancel({
        projectId: testProjectIdA,
        reverificationId: activeReq.id,
        reason: 'Jira issue was marked as Invalid duplicate by QA lead',
        actor: 'QA_LEAD',
      });

      assert.equal(cancelled.status, 'CANCELLED');
      assert.equal(cancelled.cancelledById, 'QA_LEAD');
      assert.equal(
        cancelled.cancellationReason,
        'Jira issue was marked as Invalid duplicate by QA lead',
      );
      assert.ok(cancelled.cancelledAt);

      // Audit event
      const events = await service.listAuditEvents({
        projectId: testProjectIdA,
        reverificationId: activeReq.id,
      });
      const cancelEvent = events.find(e => e.action === 'CANCELLED');
      assert.ok(cancelEvent);
      assert.equal(cancelEvent?.actor, 'QA_LEAD');
    });
  });

  describe('Adversarial & Boundary Verification', () => {
    it('strictly blocks reverification if production target environment is prohibited (Section 15, 43)', async () => {
      const blockedReq = await service.createRequest({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
        targetEnvironmentId: prodEnvAId, // PROHIBITED!
        actor: 'ADVERSARIAL_USER',
      });

      assert.equal(blockedReq.status, 'BLOCKED');
      assert.equal(blockedReq.eligibility, 'BLOCKED');
      assert.equal(blockedReq.safetyStatus, 'BLOCKED');
      assert.ok(blockedReq.safetyReason?.includes('PROHIBITED'));
    });

    it('rejects cross-project environment selection (Section 25)', async () => {
      await assert.rejects(
        service.createRequest({
          projectId: testProjectIdA,
          failureCaseId: failureCaseA1,
          targetEnvironmentId: devEnvBId, // Belongs to Project B!
        }),
        ReverificationCrossProjectForbiddenError,
      );
    });

    it('rejects cross-project cancellation attempt (Section 25)', async () => {
      // Create request in Project B
      const reqB = await service.createRequest({
        projectId: testProjectIdB,
        failureCaseId: failureCaseB1,
        targetEnvironmentId: devEnvBId,
      });

      // Attempt to cancel from Project A
      await assert.rejects(
        service.cancel({
          projectId: testProjectIdA, // Attacker project!
          reverificationId: reqB.id,
          reason: 'Malicious cancellation',
        }),
        ReverificationCrossProjectForbiddenError,
      );
    });

    it('demonstrates blocked certification when historical test version is missing (Section 42)', async () => {
      // Create a failure referencing non-existent version 99
      const execMissing = await prisma.testCaseExecution.create({
        data: {
          projectId: testProjectIdA,
          testRunId: (await prisma.testRun.findFirst({ where: { projectId: testProjectIdA } }))!.id,
          testCaseId: testCaseA1,
          testCaseVersionNumber: 99, // Does not exist!
          executableTestPlanId: (await prisma.executableTestPlan.findFirst({
            where: { projectId: testProjectIdA },
          }))!.id,
          environmentId: devEnvAId,
          attempt: 9,
          status: 'FAILED',
        },
      });

      const fcMissing = await prisma.failureCase.create({
        data: {
          projectId: testProjectIdA,
          testCaseId: testCaseA1,
          testCaseVersionNumber: 99, // Unresolvable version!
          testRunId: execMissing.testRunId,
          executionId: execMissing.id,
          triggeringExecutionStatus: 'FAILED',
          status: 'PENDING',
          title: 'Failure with Missing Version 99',
          environmentId: devEnvAId,
        },
      });

      await assert.rejects(
        service.createRequest({
          projectId: testProjectIdA,
          failureCaseId: fcMissing.id,
        }),
        ReverificationHistoricalTestUnavailableError,
      );
    });

    it('demonstrates complete restart persistence across service reconstructions (Section 31)', async () => {
      // Create fresh service instance simulating application restart
      const freshService = new DefectReverificationService({ prisma });

      const state = await freshService.getState({
        projectId: testProjectIdA,
        failureCaseId: failureCaseA1,
      });

      assert.ok(state);
      assert.equal(state.projectId, testProjectIdA);
      assert.equal(state.failureCaseId, failureCaseA1);

      const audit = await freshService.listAuditEvents({
        projectId: testProjectIdA,
        reverificationId: state.id,
      });
      assert.ok(audit.length > 0);
    });
  });
});
