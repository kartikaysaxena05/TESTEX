/**
 * @file packages/core/src/failures/integrity/decision-integrity-concurrency.test.ts
 * Concurrency and mutex synchronization tests for Classification Decision Integrity (V6 Phase 78).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../../database/client.js';
import { ClassificationDecisionIntegrityService } from './classification-decision-integrity-service.js';
import { FailureDeterministicClassifier } from '../classification/failure-deterministic-classifier.js';
import type { PrismaClient } from '@prisma/client';

describe('Decision Integrity Concurrency & Mutex Synchronization (V6 Phase 78)', () => {
  let prisma: PrismaClient;
  let service: ClassificationDecisionIntegrityService;
  let classifier: FailureDeterministicClassifier;

  let projectId: string;
  let testCaseId: string;
  let planId: string;
  let testRunId: string;
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

    projectId = crypto.randomUUID();

    await prisma.project.create({
      data: { id: projectId, name: 'Concurrency Test Project' },
    });

    const req = await prisma.requirement.create({
      data: {
        projectId,
        requirementKey: `REQ-${Date.now().toString(36).toUpperCase()}`,
        title: 'Concurrent Verification',
        originalText: 'Concurrent requirement text',
        status: 'ACTIVE',
      },
    });

    const tc = await prisma.testCase.create({
      data: {
        projectId,
        testCaseKey: `TC-${Date.now().toString(36).toUpperCase()}`,
        title: 'Concurrent Test Case',
        objective: 'Test concurrency mutex',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
        sourceRequirementId: req.id,
        sourceRequirementKey: req.requirementKey,
      },
    });
    testCaseId = tc.id;

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-conc',
        summary: 'Concurrent plan',
        status: 'VALID',
        isExecutable: true,
      },
    });
    planId = plan.id;

    const run = await prisma.testRun.create({
      data: {
        projectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        status: 'FAILED',
        planFingerprint: 'plan-fp-conc',
        testCaseTitle: tc.title,
      },
    });
    testRunId = run.id;

    const execution = await prisma.testCaseExecution.create({
      data: {
        projectId,
        testRunId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: planId,
        attempt: 1,
        status: 'FAILED',
        errorCode: 'ASSERTION_FAILED',
        errorMessage: 'Assertion failed concurrently',
        terminalReason: 'Execution failed',
      },
    });

    const step = await prisma.stepExecutionRecord.create({
      data: {
        projectId,
        testRunId,
        executionId: execution.id,
        stepIndex: 0,
        actionType: 'CLICK',
        status: 'FAILED',
        errorMessage: 'Step failed',
      },
    });

    await prisma.assertionExecutionRecord.create({
      data: {
        projectId,
        testRunId,
        executionId: execution.id,
        stepExecutionId: step.id,
        assertionType: 'ELEMENT_TEXT',
        operator: 'EQUALS',
        status: 'FAILED',
        expectedValueJson: 'OK',
        actualValueJson: 'FAIL',
        errorMessage: 'Assertion failed: expected OK but got FAIL',
      },
    });

    const fc = await prisma.failureCase.create({
      data: {
        projectId,
        title: 'Concurrency Failure Case',
        testCaseId,
        testCaseVersionNumber: 1,
        testRunId,
        executionId: execution.id,
        triggeringExecutionStatus: execution.status,
        status: 'PENDING',
        failureSummary: 'Concurrent test failure',
        errorCode: execution.errorCode,
        errorMessage: execution.errorMessage,
        failureSignature: 'SIG-CONC-TEST',
        evidenceCompleteness: 'COMPLETE',
      },
    });
    failureCaseId = fc.id;

    await prisma.failureEvidenceReference.create({
      data: {
        projectId,
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
      projectId,
      failureCaseId: fc.id,
    });
    classificationId = classification.id;
  });

  it('safely serializes concurrent evaluateDecisionIntegrity calls on the same failure case without race conditions', async () => {
    // Launch 5 concurrent evaluations on the same failure case
    const promises = Array.from({ length: 5 }, () =>
      service.evaluateDecisionIntegrity({
        projectId,
        failureCaseId,
        classificationId,
      }),
    );

    const results = await Promise.all(promises);

    // All should succeed and return authoritative records
    assert.strictEqual(results.length, 5);
    for (const r of results) {
      assert.strictEqual(r.failureCaseId, failureCaseId);
      assert.strictEqual(r.decisionState, 'VALID');
    }

    // Exactly one authoritative record must exist in the database
    const authoritativeCount = await prisma.classificationDecisionIntegrity.count({
      where: {
        failureCaseId,
        isAuthoritative: true,
      },
    });
    assert.strictEqual(authoritativeCount, 1);
  });

  it('safely serializes concurrent recomputeDecisionIntegrity calls on the same failure case', async () => {
    // Launch 4 concurrent recomputations
    const promises = Array.from({ length: 4 }, () =>
      service.recomputeDecisionIntegrity({
        projectId,
        failureCaseId,
        classificationId,
      }),
    );

    const results = await Promise.all(promises);

    assert.strictEqual(results.length, 4);

    // Exactly one authoritative record must exist in the database
    const authoritativeRecords = await prisma.classificationDecisionIntegrity.findMany({
      where: {
        failureCaseId,
        isAuthoritative: true,
      },
    });
    assert.strictEqual(authoritativeRecords.length, 1);

    // History should reflect all revisions preserved in audit trail
    const history = await service.listDecisionIntegrityHistory({
      projectId,
      failureCaseId,
    });
    assert.strictEqual(history.length >= 4, true);
  });
});
