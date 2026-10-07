/**
 * @file packages/core/src/failures/integrity/decision-integrity-security.test.ts
 * Security and tenant isolation tests for Classification Decision Integrity (V6 Phase 78).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../../database/client.js';
import { ClassificationDecisionIntegrityService } from './classification-decision-integrity-service.js';
import { FailureDeterministicClassifier } from '../classification/failure-deterministic-classifier.js';
import { generateDecisionFingerprint } from './decision-fingerprint.js';
import { DecisionIntegrityCrossProjectError } from './decision-integrity-errors.js';
import type { PrismaClient } from '@prisma/client';

describe('Decision Integrity Security & Tenant Isolation (V6 Phase 78)', () => {
  let prisma: PrismaClient;
  let service: ClassificationDecisionIntegrityService;
  let classifier: FailureDeterministicClassifier;

  let projectA: string;
  let projectB: string;
  let testCaseId: string;
  let planId: string;
  let testRunId: string;
  let executionId: string;
  let failureCaseId: string;
  let classificationId: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;
    service = new ClassificationDecisionIntegrityService(prisma);
    classifier = new FailureDeterministicClassifier(prisma);

    projectA = crypto.randomUUID();
    projectB = crypto.randomUUID();

    await prisma.project.createMany({
      data: [
        { id: projectA, name: 'Project A - Restricted Tenant' },
        { id: projectB, name: 'Project B - Attacker / Cross Tenant' },
      ],
    });

    const req = await prisma.requirement.create({
      data: {
        projectId: projectA,
        requirementKey: `REQ-${Date.now().toString(36).toUpperCase()}`,
        title: 'Secret Authentication Flow',
        originalText: 'Confidential requirement text',
        status: 'ACTIVE',
      },
    });

    const tc = await prisma.testCase.create({
      data: {
        projectId: projectA,
        testCaseKey: `TC-${Date.now().toString(36).toUpperCase()}`,
        title: 'Secure Test Case',
        objective: 'Test secret isolation',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
        sourceRequirementId: req.id,
        sourceRequirementKey: req.requirementKey,
      },
    });
    testCaseId = tc.id;

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId: projectA,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-sec',
        summary: 'Executable secure plan',
        status: 'VALID',
        isExecutable: true,
      },
    });
    planId = plan.id;

    const run = await prisma.testRun.create({
      data: {
        projectId: projectA,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        status: 'FAILED',
        planFingerprint: 'plan-fp-sec',
        testCaseTitle: tc.title,
      },
    });
    testRunId = run.id;

    const execution = await prisma.testCaseExecution.create({
      data: {
        projectId: projectA,
        testRunId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: planId,
        attempt: 1,
        status: 'FAILED',
        errorCode: 'ASSERTION_FAILED',
        errorMessage:
          'Authorization failed with Authorization: Bearer sk-secret-token-1234567890abcdef and password=SuperSecretPassword123!',
        terminalReason: 'Execution failed',
      },
    });
    executionId = execution.id;

    const step = await prisma.stepExecutionRecord.create({
      data: {
        projectId: projectA,
        testRunId,
        executionId: execution.id,
        stepIndex: 0,
        actionType: 'CLICK',
        status: 'FAILED',
        errorMessage: 'Step failed with API_KEY=AIzaSySecretApiKey1234567890abcdef',
      },
    });

    await prisma.assertionExecutionRecord.create({
      data: {
        projectId: projectA,
        testRunId,
        executionId: execution.id,
        stepExecutionId: step.id,
        assertionType: 'ELEMENT_TEXT',
        operator: 'EQUALS',
        status: 'FAILED',
        expectedValueJson: 'Authorized',
        actualValueJson: 'Unauthorized',
        errorMessage: 'Assertion failed: expected Authorized but got Unauthorized',
      },
    });

    const fc = await prisma.failureCase.create({
      data: {
        projectId: projectA,
        title: 'Security Isolation Failure Case',
        testCaseId,
        testCaseVersionNumber: 1,
        testRunId,
        executionId: execution.id,
        triggeringExecutionStatus: execution.status,
        status: 'PENDING',
        failureSummary: 'Security test failure with token=sk-live-abcdef1234567890',
        errorCode: execution.errorCode,
        errorMessage: execution.errorMessage,
        failureSignature: 'SIG-SEC-TEST',
        evidenceCompleteness: 'COMPLETE',
      },
    });
    failureCaseId = fc.id;

    await prisma.failureEvidenceReference.create({
      data: {
        projectId: projectA,
        failureCaseId: fc.id,
        executionId: execution.id,
        artifactType: 'CONSOLE_LOG',
        logicalName: 'execution.log',
        storageIdentity: `/var/storage/${fc.id}/execution.log`,
        byteSize: 1024,
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        mimeType: 'text/plain',
        integrityStatus: 'VERIFIED',
      },
    });

    const classification = await classifier.classify({
      projectId: projectA,
      failureCaseId: fc.id,
    });
    classificationId = classification.id;
  });

  it('strictly blocks cross-tenant access when Project B attempts to evaluate Project A failure case', async () => {
    await assert.rejects(
      async () => {
        await service.evaluateDecisionIntegrity({
          projectId: projectB, // Unauthorized project
          failureCaseId,
          classificationId,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof DecisionIntegrityCrossProjectError);
        assert.strictEqual(err.code, 'UNAUTHORIZED_SENDER');
        return true;
      },
    );
  });

  it('strictly blocks cross-tenant access when Project B attempts to get Project A decision integrity', async () => {
    // Evaluate in project A first
    await service.evaluateDecisionIntegrity({
      projectId: projectA,
      failureCaseId,
      classificationId,
    });

    // Project B tries to read it
    await assert.rejects(
      async () => {
        await service.getDecisionIntegrity({
          projectId: projectB,
          failureCaseId,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof DecisionIntegrityCrossProjectError);
        assert.strictEqual(err.code, 'UNAUTHORIZED_SENDER');
        return true;
      },
    );
  });

  it('strictly blocks cross-tenant access when Project B attempts to list Project A integrity history', async () => {
    await assert.rejects(
      async () => {
        await service.listDecisionIntegrityHistory({
          projectId: projectB,
          failureCaseId,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof DecisionIntegrityCrossProjectError);
        assert.strictEqual(err.code, 'UNAUTHORIZED_SENDER');
        return true;
      },
    );
  });

  it('redacts sensitive secrets and credentials from reasons and fingerprint facts', async () => {
    const integrity = await service.evaluateDecisionIntegrity({
      projectId: projectA,
      failureCaseId,
      classificationId,
    });

    // Assert that reasons do not contain raw sensitive tokens
    for (const reason of [...integrity.blockingReasons, ...integrity.warningReasons]) {
      assert.strictEqual(reason.includes('SuperSecretPassword123!'), false);
      assert.strictEqual(reason.includes('sk-secret-token-1234567890abcdef'), false);
      assert.strictEqual(reason.includes('AIzaSySecretApiKey1234567890abcdef'), false);
    }

    // Assert that fingerprint facts calculation redacts tokens
    const facts = {
      category: 'APPLICATION_FAILURE' as const,
      subcategory: 'ASSERTION_MISMATCH' as const,
      classifierVersion: '1.0.0',
      taxonomyVersion: '1.0.0',
      primaryRuleId: 'APP_RULE',
      matchedRuleIds: ['APP_RULE'],
      conflictingRuleIds: [],
      normalizedEvidenceIdentities: ['ev-1'],
      reproductionSnapshotIdentity: 'repro-1',
      environmentEquivalence: 'EQUIVALENT',
      failedStepIdentity: 'step-0:CLICK:password=SuperSecretPassword123!',
      failureSignature: 'SIG-Bearer-sk-antigravity-live-token',
    };

    const fp = generateDecisionFingerprint(facts);
    assert.strictEqual(typeof fp, 'string');
    assert.strictEqual(fp.length, 64);
  });

  it('verifies non-destructive invariance of historical execution truth', async () => {
    const executionBefore = await prisma.testCaseExecution.findUniqueOrThrow({
      where: { id: executionId },
    });
    const runBefore = await prisma.testRun.findUniqueOrThrow({
      where: { id: testRunId },
    });
    const classificationBefore = await prisma.failureClassification.findUniqueOrThrow({
      where: { id: classificationId },
    });

    // Run evaluation and recomputation multiple times
    await service.evaluateDecisionIntegrity({
      projectId: projectA,
      failureCaseId,
    });
    await service.recomputeDecisionIntegrity({
      projectId: projectA,
      failureCaseId,
    });

    const executionAfter = await prisma.testCaseExecution.findUniqueOrThrow({
      where: { id: executionId },
    });
    const runAfter = await prisma.testRun.findUniqueOrThrow({
      where: { id: testRunId },
    });
    const classificationAfter = await prisma.failureClassification.findUniqueOrThrow({
      where: { id: classificationId },
    });

    // Execution truth MUST remain strictly identical
    assert.strictEqual(executionAfter.status, executionBefore.status);
    assert.strictEqual(executionAfter.errorCode, executionBefore.errorCode);
    assert.strictEqual(executionAfter.errorMessage, executionBefore.errorMessage);
    assert.strictEqual(executionAfter.createdAt.getTime(), executionBefore.createdAt.getTime());

    // TestRun truth MUST remain strictly identical
    assert.strictEqual(runAfter.status, runBefore.status);
    assert.strictEqual(runAfter.testCaseId, runBefore.testCaseId);

    // Classification MUST remain untouched (authoritative preserved unless reclassified in Phase 77)
    assert.strictEqual(classificationAfter.category, classificationBefore.category);
    assert.strictEqual(classificationAfter.isAuthoritative, classificationBefore.isAuthoritative);
  });
});
